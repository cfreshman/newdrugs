import {queueLedgerActivity} from './ledgerActivity';
import Stripe from 'stripe';
import { config } from './config';
import { rows, transaction } from './db';
import { users, currentUser } from './auth';
import { AppError, requireValue } from './errors';
import { paymentQuote } from '../shared/paymentQuote';
export const topupQuote = (cents: number) => paymentQuote(cents, config.STRIPE_FEE_BPS, config.STRIPE_FEE_FIXED_CENTS);

const stripe = () => {
  if (!config.paymentsEnabled) throw new AppError(503, 'payments_unavailable', 'Top-ups are not available yet.');
  return new Stripe(config.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
};
export async function checkout(userId: string, cents: number, requestId: string) {
  const user = await currentUser(userId);
  if (!user.handle) throw new AppError(403, 'account_required', 'Save your account before adding money, so you can always get back to it.');
  const quote = topupQuote(cents);
  const session = await stripe().checkout.sessions.create({ mode: 'payment', payment_method_types: ['card'],
    client_reference_id: userId,
    line_items: [
      { quantity: 1, price_data: { currency: 'usd', unit_amount: cents, product_data: { name: 'New Drugs credit', description: 'The full selected amount becomes AI credit. New Drugs takes no cut.' } } },
      ...(quote.processingCents ? [{ quantity: 1, price_data: { currency: 'usd', unit_amount: quote.processingCents, product_data: { name: 'Payment processing', description: 'Any unused fee estimate is returned as credit.' } } }] : []),
    ],
    payment_intent_data: { metadata: { app: 'newdrugs', userId, credit_cents: String(cents), processing_fee_cents: String(quote.processingCents), quote_version: 'gross-up-v1' } },
    success_url: `${config.APP_ORIGIN}/?payment=success`, cancel_url: `${config.APP_ORIGIN}/?payment=cancelled`,
  }, { idempotencyKey: `topup:${userId}:${requestId}` });
  return { url: session.url };
}

export async function applyCharge(input: { id: string; userId: string; amount: number; fee: number; refunded: number; creditCents?: number; receiptUrl?: string | null }) {
  const { id, userId, amount, fee, refunded } = input;
  if (![amount, fee, refunded].every(n => Number.isSafeInteger(n) && n >= 0) || fee > amount || refunded > amount) throw new Error('Invalid payment amounts.');
  await transaction(async session => {
    requireValue(await users().findOne({ _id: userId }, { session }));
    const previous = await rows('payments').findOne({ _id: id }, { session });
    // Events can arrive in any order. Never undo a newer refund.
    const effectiveRefund = Math.max(refunded, Number(previous?.refunded || 0));
    const principal = input.creditCents;
    if (principal !== undefined && (!Number.isSafeInteger(principal) || principal <= 0 || principal > amount)) throw new Error('Invalid credited principal.');
    const originalCredit = principal === undefined ? amount - fee : Math.max(principal, amount - fee);
    const retained = Math.max(0, originalCredit - Math.round(originalCredit * effectiveRefund / amount));
    const credited = retained * 10_000_000;
    const delta = credited - Number(previous?.creditedNanos || 0);
    if (previous && (previous.userId !== userId || previous.amount !== amount || previous.fee !== fee || (previous.creditCents ?? undefined) !== principal)) throw new Error('Payment reconciliation mismatch.');
    if (!delta && previous) return;
    const now = new Date().toISOString();
    await users().updateOne({ _id: userId }, { $inc: { balanceNanos: delta } }, { session });
    await rows('payments').updateOne({ _id: id }, { $set: { userId, amount, fee, creditCents: principal, refunded: effectiveRefund, creditedNanos: credited, operatorCoveredCents: Math.max(0, originalCredit - (amount - fee)), receiptUrl: input.receiptUrl, updatedAt: now } }, { session, upsert: true });
    await rows('ledger').insertOne({ _id: `payment:${id}:${effectiveRefund}`, userId, amountNanos: delta,
      label: previous ? 'Payment refund' : 'Credit added', createdAt: now,
      details: { paidCents: amount, processingFeeCents: fee, promisedCreditCents: principal, feeAdjustmentCreditCents: principal === undefined ? 0 : Math.max(0, amount - fee - principal), refundedCents: effectiveRefund, receiptUrl: input.receiptUrl } }, { session });
    await queueLedgerActivity(userId,`payment:${id}:${effectiveRefund}`,session);
  });
}
export async function stripeWebhook(body: Buffer, signature: string) {
  const api = stripe();
  let event: Stripe.Event;
  try { event = api.webhooks.constructEvent(body, signature, config.STRIPE_WEBHOOK_SECRET); }
  catch { throw new AppError(400, 'invalid_signature', 'Invalid webhook signature.'); }
  if (!['charge.succeeded', 'charge.updated', 'charge.refunded'].includes(event.type)) return;
  const data = event.data.object as Stripe.Charge;
  if (data.metadata.app !== 'newdrugs' || !data.metadata.userId) return;
  // Read current state, not the possibly stale event payload.
  const charge = await api.charges.retrieve(data.id, { expand: ['balance_transaction'] });
  if (!charge.paid || !charge.captured) return;
  const balance = charge.balance_transaction;
  // Return non-2xx until the actual fee is known, so Stripe retries as well as delivering charge.updated.
  if (!balance || typeof balance === 'string') throw new AppError(503, 'fee_pending', 'Waiting for the payment fee.');
  if (charge.currency !== 'usd' || balance.currency !== 'usd') throw new Error('Only USD settlement is supported.');
  let creditCents: number | undefined;
  if (charge.metadata.quote_version === 'gross-up-v1') {
    const credit = charge.metadata.credit_cents, quotedFee = charge.metadata.processing_fee_cents;
    if (!/^\d+$/.test(credit || '') || !/^\d+$/.test(quotedFee || '') || Number(credit) + Number(quotedFee) !== charge.amount) throw new Error('Invalid payment quote metadata.');
    creditCents = Number(credit);
  }
  await applyCharge({ id: charge.id, userId: charge.metadata.userId, amount: charge.amount, creditCents,
    fee: balance.fee, refunded: charge.amount_refunded, receiptUrl: charge.receipt_url });
}
