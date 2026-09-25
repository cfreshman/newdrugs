export interface PaymentQuote { creditCents: number; processingCents: number; totalCents: number }
export function paymentQuote(creditCents: number, rateBps: number, fixedCents: number): PaymentQuote {
  if (![creditCents,rateBps,fixedCents].every(Number.isSafeInteger) || creditCents <= 0 || rateBps < 0 || rateBps >= 10000 || fixedCents < 0) throw new Error('Invalid payment quote.');
  const totalCents = Math.ceil((creditCents + fixedCents) * 10000 / (10000 - rateBps));
  return { creditCents, processingCents: totalCents - creditCents, totalCents };
}
