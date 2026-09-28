const tokenPattern=/\bnd_(?:agent_)?[A-Za-z0-9_-]{20,}\b/g;
const safe=(value:string)=>value.replace(tokenPattern,'nd_[REDACTED]').slice(0,2000);
const apiExit=(status:number)=>status===401||status===403?4:status===404?3:status===429?7:5;

export class CliRequestError extends Error {
  constructor(readonly code:string,message:string,readonly status:number){super(safe(message));this.name='CliRequestError';}
}

export function requestError(status:number,value:unknown){
  const body=value&&typeof value==='object'&&!Array.isArray(value)?value as {error?:{code?:unknown;message?:unknown}}:{},error=body.error;
  const code=typeof error?.code==='string'&&/^[a-zA-Z0-9_.-]{1,80}$/.test(error.code)?error.code:'request_failed';
  const message=typeof error?.message==='string'&&error.message?error.message:`Request failed (${status}).`;
  return new CliRequestError(code,message,status);
}

export function cliFailure(error:unknown){
  const request=error instanceof CliRequestError,syntax=error instanceof SyntaxError;
  const message=safe(error instanceof Error?error.message:'Command failed.');
  const exitCode=request?apiExit(error.status):syntax?2:1;
  return {ok:false,error:{code:request?error.code:syntax?'invalid_json':'cli_error',message},...(request?{status:error.status}:{}),exitCode};
}
