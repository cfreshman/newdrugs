import {readLedgerActivity} from './ledgerActivity';
/** Bounded summary reads. Raw receipts are retained as the financial source of truth. */
export async function walletActivity(userId:string,limit=30){return readLedgerActivity(userId,limit);}
