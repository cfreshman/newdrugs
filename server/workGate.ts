import {AppError} from './errors';
/** Bound concurrent expensive work and its wait queue, not just response size. */
export function workGate(concurrency:number,maxWaiting=256){
 let active=0;const waiting:{resolve:()=>void;reject:(error:unknown)=>void}[]=[];
 return {stats:()=>({active,waiting:waiting.length}),async run<T>(work:()=>Promise<T>):Promise<T>{
  if(active>=concurrency){if(waiting.length>=maxWaiting)throw new AppError(503,'server_busy','The server is busy. Try again shortly.');await new Promise<void>((resolve,reject)=>waiting.push({resolve,reject}));}else active++;
  try{return await work();}finally{const next=waiting.shift();if(next)next.resolve();else active--;}
 }};
}
