import { automationAuthorized } from './automations';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request, Response, NextFunction } from 'express';
import { rows, transaction, type Row } from './db';
import { config } from './config';
import { AppError, requireValue } from './errors';
import type { Profile } from '../shared/types';
import { grantStarter, starterClaimKey } from './starterPool';
import type { CoarseArea } from '../shared/geo';
import {reservedWebsiteLabels,websiteHostLabel} from '../shared/website';

const derive = promisify(scrypt);
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export interface User {
  credentialRevision?: number;
  preferences?:import('../shared/preferences').AccountPreferences;
  _id: string;
  suspendedAt?: string | null; suspensionReason?: string;
  name: string; handle?: string; passwordHash?: string; city: string; cityKey: string;
  bio: string; interests: string[]; discoverable: boolean; balanceNanos: number; reservedNanos: number;
  createdAt: string; activeRun?: string | null;
  inboxPushEnabled?: boolean; chatClearedAt?: string; chatGeneration?: number; internalTestAccount?: boolean; starterGranted?: boolean; starterClaimKey?: string;
  area?: CoarseArea | null;
  photos?:string[];storageBytes?:number;
  websiteCode?:string;
}
export interface Actor { userId: string; source: 'browser' | 'external' | 'agent'; scope: 'read' | 'write'; credentialId?: string; runId?: string; background?: boolean; logAccess?: boolean; privateChat?: boolean; accountActivity?: boolean; webSearch?: boolean }
declare global { namespace Express { interface Request { actor?: Actor } } }
export const users = () => rows<User>('users');
export const profile = (u: User): Profile => ({ id: u._id, handle: u.handle, name: u.name, city: u.area?.label || '', area: u.area || null, photos:u.photos||[], bio: u.bio, interests: u.interests, discoverable: u.discoverable,
  ...(u.websiteCode&&u.handle?{websiteUrl:config.APP_ENV==='production'?`https://${reservedWebsiteLabels.has(websiteHostLabel(u.handle))?`u-${u.websiteCode}`:websiteHostLabel(u.handle)}.druggie.org/`:`http://localhost:7330/api/website-published/${u.websiteCode}/`}:{}) });
export const currentUser = async (id: string) => { const user=requireValue(await users().findOne({ _id: id }), 'Your session has expired.'); if(user.suspendedAt)throw new AppError(403,'account_suspended','This account is suspended.');return user; };

export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}
export async function checkPassword(password: string, stored?: string) {
  const [salt, expected] = (stored || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  const actual = await derive(password, salt, 64) as Buffer;
  const valid = timingSafeEqual(actual, Buffer.from(expected, 'hex'));
  return Boolean(stored && valid);
}
export async function createGuest(address?: string) {
  const user: User = { _id: randomUUID(), name: '', city: '', cityKey: '', bio: '', interests: [], discoverable: false,
    starterClaimKey: starterClaimKey(address), balanceNanos: 0, reservedNanos: 0, createdAt: new Date().toISOString() };
  await transaction(async session => {
    await users().insertOne(user, { session });

  });
  return currentUser(user._id);
}
export async function registerAccount(userId: string, handle: string, encodedPassword: string, address?: string) {
  return transaction(async session => {
    const user = await currentUser(userId);
    if (user.handle) throw new AppError(409, 'registered', 'Your account is already saved.');
    requireValue(await users().findOneAndUpdate({ _id: userId, handle: { $exists: false } },
      { $set: { handle, passwordHash: encodedPassword, starterClaimKey: starterClaimKey(address) } }, { session }));
    await grantStarter(userId, session);
    return requireValue(await users().findOne({ _id: userId }, { session }));
  });
}
const cookieName = config.SESSION_COOKIE;
export async function newSession(res: Response, userId: string, req?: Request) {
  const token = randomBytes(32).toString('base64url');
  await rows('sessions').insertOne({ _id: hash(token), userId, expiresAt: new Date(Date.now() + 30 * 86400000) });
  if (req?.cookies?.[cookieName]) await endSession(hash(req.cookies[cookieName]));
  res.cookie(cookieName, token, { httpOnly: true, secure: config.production, sameSite: 'lax', maxAge: 30 * 86400000, path: '/' });
}
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const bearer = req.get('Authorization');
    if (bearer) {
      const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
      if (token.startsWith('nd_agent_')) {
        const credential = await rows('agentCredentials').findOne({ _id: hash(token), expiresAt: { $gt: new Date() }, revokedAt: null });
        if (!credential) throw new AppError(401, 'unauthorized', 'Agent authority has expired.');
        const owner = await currentUser(String(credential.userId));
        const boundId = credential.runId || owner.activeRun;
        const active = boundId && await rows<import('./runTypes').RunRecord>('runs').findOne({ _id: String(boundId), userId: owner._id, status: { $in: ['queued', 'running'] }, cancelRequested: { $ne: true } });
        if (!active) throw new AppError(403, 'inactive_run', 'There is no active task.');
        const background = active.purpose === 'automation';
        if (background && !await automationAuthorized(active)) throw new AppError(403, 'automation_revoked', 'This automation stopped.');
        req.actor = { userId: owner._id, source: 'agent', scope: background ? 'read' : 'write', runId: active._id, background, logAccess: background && Boolean(active.logAccess), privateChat: background && Boolean(active.privateChat), accountActivity: background && Boolean(active.accountActivity), webSearch: background && Boolean(active.webSearch) };
        next(); return;
      }
      const record = token && await rows('tokens').findOne({ hash: hash(token), revokedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
      if (!record) throw new AppError(401, 'unauthorized', 'This access token is invalid or expired.');
      req.actor = { userId: String(record.userId), source: 'external', scope: record.scope as 'read' | 'write', credentialId: record._id };
    } else if (req.cookies?.[cookieName]) {
      const record = await rows('sessions').findOne({ _id: hash(req.cookies[cookieName]), expiresAt: { $gt: new Date() } });
      if (record) req.actor = { userId: String(record.userId), source: 'browser', scope: 'write' };
    }
    if(req.actor)await currentUser(req.actor.userId);
    next();
  } catch (error) { next(error); }
}
export function requireActor(req: Request): Actor {
  if (!req.actor) throw new AppError(401, 'unauthorized', 'Please open the app and sign in.');
  if (req.actor.background && !/^\/(?:mcp(?:$|\?)|api\/(?:operations\/|catalog(?:$|[/?])))/.test(req.originalUrl)) throw new AppError(403, 'automation_scope', 'This endpoint is unavailable to background agents.');
  return req.actor;
}
export function browserActor(req: Request) {
  const actor = requireActor(req);
  if (actor.source !== 'browser') throw new AppError(403, 'browser_only', 'Manage account access and purchases in the app.');
  return actor;
}
export function csrf(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.get('Authorization')) return next();
  if (req.get('Origin') !== config.APP_ORIGIN) return next(new AppError(403, 'origin', 'Reload this page to continue.'));
  next();
}
export async function logout(req: Request, res: Response) {
  if (req.cookies?.[cookieName]) await endSession(hash(req.cookies[cookieName]));
  res.clearCookie(cookieName, { path: '/', secure: config.production, httpOnly: true, sameSite: 'lax' });
}

async function endSession(sessionId: string) {
  await transaction(async session => {
    await rows('sessions').deleteOne({ _id: sessionId }, { session });
    await rows('pushSubscriptions').updateMany({ sessionId }, { $set: { revokedAt: new Date().toISOString() } }, { session });
  });
}
