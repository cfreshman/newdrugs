import {ConfigStore,validUrl,type Login} from './config';
import type {DeviceStart,DeviceToken} from '../shared/agentAccess';
interface Options {url:string;profile:string;name:string;scope:'read'|'write'}
interface Dependencies {store:Pick<ConfigStore,'set'>;fetch?:typeof fetch;now?():number;sleep?(ms:number):Promise<void>;announce(link:string,code:string,expires:number):void;verify(login:Login):Promise<unknown>}
/** Only the human approval code/link are announced. No browser or local server. */
export async function deviceLogin(options:Options,deps:Dependencies){
 const url=validUrl(options.url),send=deps.fetch||fetch,now=deps.now||Date.now,sleep=deps.sleep||(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 const isDev=url==='https://dev.druggie.org'||['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname);
 const devKey=isDev?(process.env.NEWDRUGS_DEV_ACCESS_KEY||process.env.DEV_ACCESS_KEY):undefined;
 const call=async(path:string,body:unknown)=>{
  const response=await send(`${url}/api/agent-login/${path}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json',...(devKey?{'X-NewDrugs-Dev-Key':devKey}:{})},body:JSON.stringify(body)});
  let data:any;try{data=await response.json();}catch(error){if(error instanceof Error&&['TimeoutError','AbortError'].includes(error.name))throw error;throw new Error('The login service returned an invalid response.');}
  if(!response.ok&&!['authorization_pending','slow_down','access_denied','expired_token'].includes(data.error))throw new Error('Could not reach the login service. Try again.');
  return data;
 };
 const start:DeviceStart=await call('device',{name:options.name,scope:options.scope});
 if(typeof start.device_code!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(start.device_code)||typeof start.user_code!=='string'||! /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(start.user_code)||!Number.isFinite(start.expires_in)||start.expires_in<=0||start.expires_in>900||!Number.isFinite(start.interval)||start.interval<5||start.interval>60)throw new Error('The login service returned an invalid request.');
 const approval=new URL(start.verification_uri_complete);
 if(approval.username||approval.password||approval.protocol!=='https:'&&!(isDev&&approval.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(approval.hostname)))throw new Error('The approval link must use HTTPS.');
 const localApproval=isDev&&['http://localhost:7330','http://127.0.0.1:7330','http://[::1]:7330'].includes(approval.origin);
 if(approval.origin!==url&&!localApproval||approval.pathname!=='/agents/device'||approval.hash||approval.searchParams.size!==1||approval.searchParams.get('code')!==start.user_code)throw new Error('The approval link does not match the selected site.');
 const deadline=now()+start.expires_in*1000;let interval=start.interval;
 deps.announce(approval.href,start.user_code,start.expires_in);
 while(now()<deadline){
  await sleep(Math.min(interval*1000,deadline-now()));if(now()>=deadline)break;
  let result:any;try{result=await call('poll',{device_code:start.device_code});}catch(error){if(error instanceof Error&&['TimeoutError','AbortError'].includes(error.name)){interval=Math.min(interval*2,60);continue;}throw error;}
  if(result.error==='authorization_pending')continue;
  if(result.error==='slow_down'){interval=Math.max(interval+5,Number(result.interval)||0);continue;}
  if(result.error==='access_denied')throw new Error('Login was denied or revoked. No credentials were saved.');
  if(result.error==='expired_token')break;
  const token=result as DeviceToken;
  if(token.token_type!=='Bearer'||!/^nd_[A-Za-z0-9_-]{40,60}$/.test(token.access_token)||!['read','write'].includes(token.scope))throw new Error('The login service returned invalid credentials.');
  const login={url,token:token.access_token};const identity=await deps.verify(login);await deps.store.set(options.profile,login);return identity;
 }
 throw new Error('Login expired. Run the device login command again. No credentials were saved.');
}
