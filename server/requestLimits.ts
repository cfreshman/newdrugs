import type {RequestHandler} from 'express';
import {rateLimit,ipKeyGenerator,type Store} from 'express-rate-limit';
import {MongoRateLimitStore} from './rateLimitStore';
/** Browser identity must come from authenticate, never a client header or cookie's presence. */
export function requestRateLimit(scope:string,limit:number,windowMs=60000,{credentialAttempts=false,store=new MongoRateLimitStore(scope) as Store}:{credentialAttempts?:boolean;store?:Store}={}){
 return rateLimit({store,windowMs,limit,standardHeaders:'draft-8',legacyHeaders:false,
  skip:req=>!credentialAttempts&&req.actor?.source==='browser',
  skipSuccessfulRequests:credentialAttempts,
  keyGenerator:req=>!credentialAttempts&&req.actor?`account:${req.actor.userId}`:ipKeyGenerator(req.ip||'unknown'),
  message:{error:{code:'rate_limit',message:'Please slow down and try again shortly.'}},
 });
}
/** A populated calendar can load hundreds of thumbnails without issuing app actions. */
export function apiRequestLimits({api=1200,media=3000,windowMs=60000,store=(scope:string):Store=>new MongoRateLimitStore(scope)}={}) : RequestHandler {
 const make=(scope:string,limit:number)=>requestRateLimit(scope,limit,windowMs,{store:store(scope)});
 const operations=make('api:operations',api),assets=make('api:media',media);
 return (req,res,next)=>{
  const image=(req.method==='GET'||req.method==='HEAD')&&(/^\/files\/[^/]+$/.test(req.path)||/^\/link-previews\/[^/]+\/image$/.test(req.path));
  return (image?assets:operations)(req,res,next);
 };
}
