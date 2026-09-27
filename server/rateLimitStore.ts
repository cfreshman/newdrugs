import { createHash } from 'node:crypto';
import type { Options, Store } from 'express-rate-limit';
import { rows } from './db';

/** Atomic shared counters. Expiry is checked on every hit, independently of TTL cleanup. */
export class MongoRateLimitStore implements Store {
  readonly localKeys = false;
  private windowMs = 60000;
  constructor(readonly prefix: string) {}
  init(options: Options) { this.windowMs = options.windowMs; }
  private id(key: string) { return createHash('sha256').update(JSON.stringify([this.prefix, this.windowMs, key])).digest('hex'); }
  async increment(key: string) {
    const _id = this.id(key), expired = { $lte: [{ $ifNull: ['$resetTime', new Date(0)] }, '$$NOW'] };
    const update = [{ $set: {
      totalHits: { $cond: [expired, 1, { $add: ['$totalHits', 1] }] },
      resetTime: { $cond: [expired, { $add: ['$$NOW', this.windowMs] }, '$resetTime'] },
    } }];
    const counters = rows<{ _id: string; totalHits: number; resetTime: Date }>('requestRates');
    let result;
    try { result = await counters.findOneAndUpdate({ _id }, update, { upsert: true, returnDocument: 'after', maxTimeMS: 5000 }); }
    catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      result = await counters.findOneAndUpdate({ _id }, update, { returnDocument: 'after', maxTimeMS: 5000 });
    }
    if (!result) throw Error('Rate limit counter unavailable');
    return { totalHits: result.totalHits, resetTime: result.resetTime };
  }
  async decrement(key: string) { await rows<{_id:string;totalHits:number}>('requestRates').updateOne({ _id: this.id(key), totalHits: { $gt: 0 } }, { $inc: { totalHits: -1 } }); }
  async resetKey(key: string) { await rows('requestRates').deleteOne({ _id: this.id(key) }); }
}
