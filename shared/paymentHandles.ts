import {z} from 'zod';

const venmoHandle=z.string().trim().transform(value=>value.replace(/^@/,''))
  .pipe(z.union([z.literal(''),z.string().regex(/^[A-Za-z0-9_-]{5,30}$/,'Enter a Venmo username with 5–30 letters, numbers, - or _.')]));
const cashAppHandle=z.string().trim().transform(value=>value.replace(/^\$/, ''))
  .pipe(z.union([z.literal(''),z.string().regex(/^[A-Za-z0-9]{1,20}$/,'Enter a Cash App $cashtag using letters and numbers.')]));

export const paymentHandlesInput=z.strictObject({
  venmo:venmoHandle,
  cashApp:cashAppHandle,
  currentPassword:z.string().min(1).max(128),
});
export const paymentHandlesOutput=z.strictObject({venmo:z.string(),cashApp:z.string()});
export type PaymentHandles=z.infer<typeof paymentHandlesOutput>;

export function paymentLink(provider:'venmo'|'cashApp',handle:string,amountCents:number):string|null {
  if(!Number.isSafeInteger(amountCents)||amountCents<1||amountCents>10_000_000)return null;
  const amount=(amountCents/100).toFixed(2);
  if(provider==='venmo'){
    const parsed=venmoHandle.safeParse(handle);if(!parsed.success||!parsed.data)return null;
    const url=new URL('https://venmo.com/');
    url.searchParams.set('txn','pay');url.searchParams.set('recipients',parsed.data);url.searchParams.set('amount',amount);
    return url.href;
  }
  const parsed=cashAppHandle.safeParse(handle);if(!parsed.success||!parsed.data)return null;
  return `https://cash.app/$${parsed.data}/${amount}`;
}
