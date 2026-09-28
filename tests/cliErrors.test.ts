import {expect,it} from 'vitest';
import {CliRequestError,cliFailure,requestError} from '../cli/errors';

it('preserves server error codes and stable process classes for CLI callers',()=>{
 const error=requestError(409,{error:{code:'confirmation_required',message:'Confirm the exact action.'}});
 expect(error).toBeInstanceOf(CliRequestError);
 expect(cliFailure(error)).toEqual({ok:false,error:{code:'confirmation_required',message:'Confirm the exact action.'},status:409,exitCode:5});
 expect(cliFailure(requestError(403,{error:{code:'scope',message:'Read only.'}})).exitCode).toBe(4);
 expect(cliFailure(requestError(404,{error:{code:'not_found',message:'Missing.'}})).exitCode).toBe(3);
 expect(cliFailure(requestError(429,{error:{code:'rate_limit',message:'Slow down.'}})).exitCode).toBe(7);
});

it('normalizes malformed failures and redacts access tokens',()=>{
 expect(cliFailure(requestError(500,{error:{code:'not valid',message:`failed nd_${'x'.repeat(44)}`}}))).toEqual({ok:false,error:{code:'request_failed',message:'failed nd_[REDACTED]'},status:500,exitCode:5});
 expect(cliFailure(new SyntaxError('Unexpected token'))).toMatchObject({ok:false,error:{code:'invalid_json'},exitCode:2});
});
