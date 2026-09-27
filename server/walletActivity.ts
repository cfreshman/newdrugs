import {rows} from './db';
import type {BillingActivityItem} from '../shared/billingActivity';
/** Fold complete spending periods before limiting visible rows. Ledger receipts remain untouched. */
export async function walletActivity(userId:string,limit=30){
 const items:BillingActivityItem[]=[],cursor=rows('ledger').find({userId},{projection:{_id:1,label:1,amountNanos:1,createdAt:1}}).sort({createdAt:-1,_id:-1});
 let recent=3,group:BillingActivityItem|undefined;
 try{for await(const row of cursor){
  const amount=Number(row.amountNanos),date=String(row.createdAt),usage=row._id.startsWith('usage:');
  if(usage&&amount===0)continue;
  if(usage&&amount<0&&recent===0){
   if(group){group.amountNanos+=amount;group.startedAt=date;group.chargeCount++;group.id=`usage-group:${row._id}`;continue;}
   if(items.length>=limit)break;
   group={id:`usage-group:${row._id}`,kind:'usage',label:'Agent usage',amountNanos:amount,startedAt:date,endedAt:date,chargeCount:1};items.push(group);continue;
  }
  group=undefined;
  if(items.length>=limit)break;
  const charge=usage&&amount<0;if(charge)recent--;
  items.push({id:row._id,kind:charge?'charge':amount>0?'credit':'adjustment',label:String(row.label),amountNanos:amount,startedAt:date,endedAt:date,chargeCount:charge?1:0});
 }}finally{await cursor.close();}
 return {items};
}
