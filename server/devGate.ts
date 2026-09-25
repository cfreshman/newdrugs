import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config';
import { AppError } from './errors';

export function trustedDevKey(value: string | undefined, expected = config.DEV_ACCESS_KEY) {
  if (!value || !expected) return false;
  const given = Buffer.from(value), key = Buffer.from(expected);
  return given.length === key.length && timingSafeEqual(given, key);
}
/** The local Vite proxy has the dev key. Bearer clients still require real authentication. */
export function devApiGate(req: Request, _res: Response, next: NextFunction) {
  if (config.APP_ENV !== 'staging' || trustedDevKey(req.get('X-NewDrugs-Dev-Key')) || req.get('Authorization')) return next();
  next(new AppError(404, 'not_found', 'This development endpoint is private.'));
}
