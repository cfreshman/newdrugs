import {beforeAll,afterAll,it,expect} from 'vitest';
import type {Options} from 'express-rate-limit';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {MongoRateLimitStore} from '../server/rateLimitStore';
beforeAll(async()=>{await connectDatabase();if(db().databaseName!=='newdrugs_test')throw Error('Isolated database required');await rows('requestRates').deleteMany({});});
afterAll(async()=>{if(db().databaseName==='newdrugs_test')await rows('requestRates').deleteMany({});await mongo.close();});
it('shares atomic counters across instances, while isolating routes and expiring without TTL cleanup',async()=>{
 const a=new MongoRateLimitStore('login'),b=new MongoRateLimitStore('login'),other=new MongoRateLimitStore('media');
 for(const store of [a,b,other])store.init({windowMs:60000} as Options);
 const counts=await Promise.all(Array.from({length:24},(_,i)=>(i%2?a:b).increment('192.0.2.99')));
 expect(counts.map(value=>value.totalHits).sort((x,y)=>x-y)).toEqual(Array.from({length:24},(_,i)=>i+1));
 expect((await other.increment('192.0.2.99')).totalHits).toBe(1);
 const records=await rows('requestRates').find({}).toArray();expect(records).toHaveLength(2);expect(JSON.stringify(records)).not.toContain('192.0.2.99');
 await rows('requestRates').updateOne({totalHits:24},{$set:{resetTime:new Date(0)}});
 expect((await b.increment('192.0.2.99')).totalHits).toBe(1);
 await b.decrement('192.0.2.99');expect((await a.increment('192.0.2.99')).totalHits).toBe(1);
 await a.resetKey('192.0.2.99');expect((await b.increment('192.0.2.99')).totalHits).toBe(1);
});
