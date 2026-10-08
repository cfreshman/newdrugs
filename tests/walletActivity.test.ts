import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {users,type User} from '../server/auth';
import {queueLedgerActivity,indexLedgerReceipt,backfillLedgerActivity,moveLedgerPeriods} from '../server/ledgerActivity';
import {walletActivity} from '../server/walletActivity';
import {executeOperation} from '../server/operations';
const date=(n:number)=>new Date(Date.UTC(2026,0,n,12)).toISOString();
const charge=(n:number,amount=-100)=>({_id:`usage:${String(n).padStart(3,'0')}`,userId:'me',amountNanos:amount,label:n===4?'Automation: Friends':'Agent usage',createdAt:date(n)});
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated database required');for(const collection of await db().collections())await collection.deleteMany({});}
beforeAll(async()=>{await connectDatabase();await clean();});beforeEach(async()=>{await clean();const user:User={_id:'me',handle:'me',name:'Me',bio:'',city:'',cityKey:'',interests:[],discoverable:false,balanceNanos:5000,reservedNanos:0,createdAt:date(1)};await users().insertMany([user,{...user,_id:'other',handle:'other'}]);});afterAll(async()=>{await clean();await mongo.close();});
async function ready(userId='me'){
 await walletActivity(userId);
 for(let i=0;i<100;i++){for(let j=0;j<100&&await indexLedgerReceipt();j++);await backfillLedgerActivity(userId);await moveLedgerPeriods();if(!(await walletActivity(userId)).indexing)return;}
 throw Error('Billing projection did not catch up');
}
it('preserves the latest three charges across credits and rolls older periods with their real date range',async()=>{
 await rows('ledger').insertMany([charge(1),charge(2),charge(3),charge(4),charge(5),charge(6),{_id:'credit',userId:'me',amountNanos:1000,label:'Credit added',createdAt:date(5).replace('12:','11:')},{_id:'starter',userId:'me',amountNanos:1000,label:'Starter credit',createdAt:date(1).replace('12:','11:')}]);
 await ready();const {items}=await walletActivity('me');expect(items.map(item=>item.kind)).toEqual(['charge','charge','credit','charge','usage','credit']);
 expect(items[3]).toMatchObject({id:'usage:004',label:'Automation: Friends',chargeCount:1});expect(items[4]).toMatchObject({label:'Agent usage rollup',amountNanos:-300,chargeCount:3,startedAt:date(1),endedAt:date(3)});
 expect((await users().findOne({_id:'me'}))?.balanceNanos).toBe(5000);expect(await rows('ledger').countDocuments()).toBe(8);
});
it('shows each individual charge\'s recorded model, including existing indexed receipts',async()=>{
 await rows('ledger').insertMany([charge(1),{...charge(2),details:{model:'anthropic/claude-haiku-5.5'}},{...charge(3),details:{model:'gpt-6-luna'}},{...charge(4),details:{model:'gpt-6-luna'}}]);
 await ready();await rows('agentModelSettings').insertOne({_id:'chat',model:'a/different-current-model'});
 const result=await executeOperation('wallet.activity',{}, {userId:'me',source:'external',scope:'read'}) as any;
 expect(result.items.slice(0,3).map((item:any)=>item.model)).toEqual(['gpt-6-luna','gpt-6-luna','anthropic/claude-haiku-5.5']);expect(result.items[3]).not.toHaveProperty('model');
 await rows('ledger').updateOne({_id:'usage:004'},{$set:{'details.model':'anthropic/claude-haiku-5.5'}});
 expect((await walletActivity('me')).items[0].model).toBe('anthropic/claude-haiku-5.5');
 await rows('ledger').updateOne({_id:'usage:003'},{$unset:{details:''}});expect((await walletActivity('me')).items[1]).not.toHaveProperty('model');
});
it('completes a period before limiting output and never truncates it to the latest thirty receipts',async()=>{
 await rows('ledger').insertMany([...Array.from({length:43},(_,i)=>charge(i+1)),{_id:'credit',userId:'me',amountNanos:10000,label:'Credit added',createdAt:date(0)}]);
 await ready();const result=await executeOperation('wallet.activity',{limit:4},{userId:'me',source:'external',scope:'read'}) as any;
 expect(result.items).toHaveLength(4);expect(result.items[3]).toMatchObject({kind:'usage',chargeCount:40,amountNanos:-4000,startedAt:date(1),endedAt:date(40)});
 expect((await executeOperation('wallet.get',{}, {userId:'me',source:'external',scope:'read'}) as any).entries).toHaveLength(30);
 await rows('ledger').updateOne({_id:'usage:001'},{$set:{amountNanos:-50}});await queueLedgerActivity('me','usage:001');await ready();expect((await walletActivity('me',4)).items[3].amountNanos).toBe(-3950);
});
it('keeps refunds separate, skips zero-cost receipts and isolates the caller',async()=>{
 await rows('ledger').insertMany([charge(1),charge(2),charge(3),charge(4),charge(5),charge(6),charge(7,0),{_id:'refund',userId:'me',amountNanos:-500,label:'Payment refund',createdAt:date(2).replace('12:','11:')},{...charge(9),_id:'usage:other',userId:'other'}]);
 await ready();const result=await walletActivity('me');expect(result.items.map(item=>item.kind)).toEqual(['charge','charge','charge','usage','adjustment','usage']);expect(result.items[3]).toMatchObject({amountNanos:-200,chargeCount:2});expect(result.items[4].label).toBe('Payment refund');expect(result.items.some(item=>item.id==='usage:007')).toBe(false);
 await ready('other');const other=await executeOperation('wallet.activity',{}, {userId:'other',source:'external',scope:'read'}) as any;expect(other.items).toHaveLength(1);expect(other.items[0].id).toBe('usage:other');
});

it('returns a pending state before backfill instead of scanning raw history on a read',async()=>{
 await rows('ledger').insertMany([charge(1),charge(2)]);expect(await walletActivity('me')).toEqual({items:[],indexing:true});expect(await rows('ledgerActivityReceipts').countDocuments()).toBe(0);await ready();expect((await walletActivity('me')).indexing).toBe(false);
});
it('repairs a backdated credit boundary and late zeroed usage without double counting',async()=>{
 await rows('ledger').insertMany(Array.from({length:8},(_,i)=>charge(i+1)));await ready();
 await rows('ledger').insertOne({_id:'late-credit',userId:'me',amountNanos:1000,label:'Credit added',createdAt:date(4).replace('12:','11:')});await queueLedgerActivity('me','late-credit');await ready();
 const periods=(await walletActivity('me')).items.filter(item=>item.kind==='usage');expect(periods.map(item=>item.amountNanos)).toEqual([-200,-300]);
 await rows('ledger').updateOne({_id:'usage:001'},{$set:{amountNanos:0}});await queueLedgerActivity('me','usage:001');await queueLedgerActivity('me','usage:001');await ready();expect((await walletActivity('me')).items.filter(item=>item.kind==='usage').map(item=>item.amountNanos)).toEqual([-200,-200]);
});
