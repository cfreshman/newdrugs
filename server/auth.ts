import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request, Response, NextFunction } from 'express';
import { rows, transaction, type Row } from './db';
import { config } from './config';
import { AppError, requireValue } from './errors';
import type { Profile } from '../shared/types';
import { grantStarter } from './starterPool';
import type { CoarseArea } from '../shared/geo';

const derive = promisify(scrypt);
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export interface User {
  _id: string;
  name: string; handle?: string; passwordHash?: string; city: string; cityKey: string;
  bio: string; interests: string[]; discoverable: boolean; balanceNanos: number; reservedNanos: number;
  createdAt: string; activeRun?: string | null;
  starterGranted?: boolean;
  area?: CoarseArea | null;
  photos?:string[];storageBytes?:number;
}
export interface Actor { userId: string; source: 'browser' | 'external' | 'agent'; scope: 'read' | 'write' }
declare global { namespace Express { interface Request { actor?: Actor } } }
export const users = () => rows<User>('users');
export const profile = (u: User): Profile => ({ id: u._id, handle: u.handle, name: u.name, city: u.area?.label || '', area: u.area || null, photos:u.photos||[], bio: u.bio, interests: u.interests, discoverable: u.discoverable });
export const currentUser = async (id: string) => requireValue(await users().findOne({ _id: id }), 'Your session has expired.');

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
export async function createGuest() {
  const user: User = { _id: randomUUID(), name: '', city: '', cityKey: '', bio: '', interests: [], discoverable: false,
    balanceNanos: 0, reservedNanos: 0, createdAt: new Date().toISOString() };
  await transaction(async session => {
    await users().insertOne(user, { session });
    await grantStarter(user._id, session);
  });
  return currentUser(user._id);
}
const cookieName = config.SESSION_COOKIE;
export async function newSession(res: Response, userId: string, req?: Request) {
  const token = randomBytes(32).toString('base64url');
  await rows('sessions').insertOne({ _id: hash(token), userId, expiresAt: new Date(Date.now() + 30 * 86400000) });
  if (req?.cookies?.[cookieName]) await rows('sessions').deleteOne({ _id: hash(req.cookies[cookieName]) });
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
        const active = owner.activeRun && await rows('runs').findOne({ _id: owner.activeRun, userId: owner._id, status: { $in: ['queued', 'running'] }, cancelRequested: { $ne: true } });
        if (!active) throw new AppError(403, 'inactive_run', 'There is no active task.');
        req.actor = { userId: owner._id, source: 'agent', scope: 'write' };
        next(); return;
      }
      const record = token && await rows('tokens').findOne({ hash: hash(token), revokedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
      if (!record) throw new AppError(401, 'unauthorized', 'This access token is invalid or expired.');
      req.actor = { userId: String(record.userId), source: 'external', scope: record.scope as 'read' | 'write' };
    } else if (req.cookies?.[cookieName]) {
      const record = await rows('sessions').findOne({ _id: hash(req.cookies[cookieName]), expiresAt: { $gt: new Date() } });
      if (record) req.actor = { userId: String(record.userId), source: 'browser', scope: 'write' };
    }
    next();
  } catch (error) { next(error); }
}
export function requireActor(req: Request): Actor {
  if (!req.actor) throw new AppError(401, 'unauthorized', 'Please open the app and sign in.');
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
  if (req.cookies?.[cookieName]) await rows('sessions').deleteOne({ _id: hash(req.cookies[cookieName]) });
  res.clearCookie(cookieName, { path: '/', secure: config.production, httpOnly: true, sameSite: 'lax' });
}
