import type {RequestHandler} from 'express';
import {rateLimit,type Store} from 'express-rate-limit';
import {MongoRateLimitStore} from './rateLimitStore';
/** A populated calendar can load hundreds of thumbnails without issuing app actions. */
export function apiRequestLimits({api=1200,media=3000,windowMs=60000,store=(scope:string):Store=>new MongoRateLimitStore(scope)}={}) : RequestHandler {
 const make=(scope:string,limit:number)=>rateLimit({store:store(scope),windowMs,limit,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'rate_limit',message:'Please slow down and try again shortly.'}}});
 const operations=make('api:operations',api),assets=make('api:media',media);
 return (req,res,next)=>{
  const image=(req.method==='GET'||req.method==='HEAD')&&(/^\/files\/[^/]+$/.test(req.path)||/^\/link-previews\/[^/]+\/image$/.test(req.path));
  return (image?assets:operations)(req,res,next);
 };
}
