import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { mongo, transaction } from './db';
import { config } from './config';
import { hash, passwordHash, checkPassword } from './auth';
import { AppError } from './errors';
interface Owner { _id: string; username: string; passwordHash: string; createdAt: string }
const owners = () => mongo.db(config.STARTER_POOL_DB).collection<Owner>('adminOwners');
const sessions = () => mongo.db(config.STARTER_POOL_DB).collection<{ _id: string; ownerId: string; expiresAt: Date }>('adminSessions');
const cookie = () => `${config.SESSION_COOKIE}_admin`;
export const trustedDev = (req: Request) => config.APP_ENV === 'staging' && Boolean(config.DEV_ACCESS_KEY) && req.get('X-NewDrugs-Dev-Key') === config.DEV_ACCESS_KEY;
export async function adminIdentity(req: Request) {
  const token = req.cookies?.[cookie()]; if (!token) return null;
  const session = await sessions().findOne({ _id: hash(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const owner = await owners().findOne({ _id: session.ownerId });
  return owner ? { id: owner._id, username: owner.username } : null;
}
export async function requireAdmin(req: Request) {
  const owner = await adminIdentity(req); if (!owner) throw new AppError(401, 'admin_required', 'Sign in to admin.'); return owner;
}
export async function adminStatus(req: Request) {
  return { configured: Boolean(await owners().findOne({ _id: 'owner' })), owner: await adminIdentity(req), canSetup: trustedDev(req), stage: config.APP_ENV };
}
export async function signInAdmin(req: Request, res: Response, username: string, password: string) {
  let owner = await owners().findOne({ _id: 'owner' });
  if (!owner) {
    if (!trustedDev(req)) throw new AppError(403, 'setup_required', 'Create the first owner from your trusted local dev connection.');
    const encoded = await passwordHash(password);
    // One immutable owner slot: concurrent setup attempts cannot replace its credentials.
    await transaction(async session => {
      if (await owners().findOne({ _id: 'owner' }, { session })) throw new AppError(409, 'owner_exists', 'An owner is already set. Sign in to that account.');
      await owners().insertOne({ _id: 'owner', username, passwordHash: encoded, createdAt: new Date().toISOString() }, { session });
    });
    owner = await owners().findOne({ _id: 'owner' });
  }
  if (!owner || owner.username !== username || !await checkPassword(password, owner.passwordHash)) throw new AppError(401, 'credentials', 'That admin sign-in did not match.');
  const token = randomBytes(32).toString('base64url');
  await sessions().insertOne({ _id: hash(token), ownerId: owner._id, expiresAt: new Date(Date.now() + 12 * 3600000) });
  res.cookie(cookie(), token, { httpOnly: true, secure: config.production, sameSite: 'strict', maxAge: 12 * 3600000, path: '/' });
  return { owner: { id: owner._id, username: owner.username } };
}
export async function signOutAdmin(req: Request, res: Response) {
  const token = req.cookies?.[cookie()]; if (token) await sessions().deleteOne({ _id: hash(token) });
  res.clearCookie(cookie(), { httpOnly: true, secure: config.production, sameSite: 'strict', path: '/' });
}
