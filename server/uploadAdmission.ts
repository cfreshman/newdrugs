import type {RequestHandler} from 'express';
import {AppError} from './errors';
/** Reject overload before express.raw buffers a body. Disconnected requests release their slot. */
export function uploadAdmission(limit=2):RequestHandler{
 let active=0;
 return (_req,res,next)=>{
  if(active>=limit){res.set('Retry-After','1');return next(new AppError(503,'uploads_busy','Uploads are busy. Try again in a moment.'));}
  active++;let done=false;const release=()=>{if(done)return;done=true;active--;res.off('finish',release);res.off('close',release);};
  res.once('finish',release);res.once('close',release);next();
 };
}
