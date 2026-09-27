import {beforeEach,afterEach,it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const script=resolve('scripts/github-cfreshman');
let directory:string,state:string;
beforeEach(()=>{
 directory=mkdtempSync(join(tmpdir(),'github-cfreshman-'));state=join(directory,'account');writeFileSync(state,'previous-account');
 writeFileSync(join(directory,'gh'),`#!/usr/bin/env bash
set -eu
case "$1:$2" in
 auth:status) cat "$FAKE_ACCOUNT" ;;
 auth:switch)
   if [[ "\${FAKE_MISSING:-}" == 1 && "$6" == cfreshman ]]; then exit 1; fi
   if [[ "\${FAKE_RESTORE_FAIL:-}" == 1 && "$6" == previous-account ]]; then exit 1; fi
   printf '%s' "$6" > "$FAKE_ACCOUNT" ;;
 *) exit 99 ;;
esac
`,{mode:0o755});
});
afterEach(()=>rmSync(directory,{recursive:true,force:true}));
function run(args:string[],extra:Record<string,string>={}){return spawnSync(script,args,{cwd:directory,encoding:'utf8',env:{...process.env,PATH:`${directory}:${process.env.PATH}`,FAKE_ACCOUNT:state,...extra}});}
it('runs as cfreshman, preserves arguments and existing Git config, and restores a generic prior user',()=>{
 const argument='literal spaces $(not-a-command)';
 const result=run([process.execPath,'-e',`process.stdout.write(JSON.stringify({account:require('node:fs').readFileSync(process.env.FAKE_ACCOUNT,'utf8'),cwd:process.cwd(),argument:process.argv[1],token:process.env.GH_TOKEN,keys:Array.from({length:Number(process.env.GIT_CONFIG_COUNT)},(_,i)=>[process.env['GIT_CONFIG_KEY_'+i],process.env['GIT_CONFIG_VALUE_'+i]])}))`,argument],{GH_TOKEN:'fake-override',GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'example.keep',GIT_CONFIG_VALUE_0:'yes'});
 expect(result.status).toBe(0);expect(readFileSync(state,'utf8')).toBe('previous-account');
 expect(JSON.parse(result.stdout)).toEqual({account:'cfreshman',cwd:realpathSync(directory),argument,keys:[['example.keep','yes'],['credential.https://github.com.helper',''],['credential.https://github.com.helper','!gh auth git-credential'],['credential.https://github.com.username','cfreshman'],['url.https://github.com/.insteadOf','git@github.com:'],['url.https://github.com/.insteadOf','ssh://git@github.com/']]});
 expect(result.stderr).not.toContain('fake-override');
});
it('restores the account while preserving a failed command’s exit code',()=>{
 const result=run(['/bin/bash','-c','exit 37']);expect(result.status).toBe(37);expect(readFileSync(state,'utf8')).toBe('previous-account');
});
it('does not run the command if the target account cannot be selected',()=>{
 const result=run(['/bin/echo','should-not-run'],{FAKE_MISSING:'1'});expect(result.status).toBe(1);expect(result.stdout).toBe('');expect(readFileSync(state,'utf8')).toBe('previous-account');expect(result.stderr).toContain('gh auth login');
});
it('reports restoration failure instead of returning success',()=>{
 const result=run(['/bin/true'],{FAKE_RESTORE_FAIL:'1'});expect(result.status).toBe(1);expect(result.stderr).toContain('Could not restore GitHub account previous-account');
});
it('restores after a missing executable and handles an already-active target',()=>{
 writeFileSync(state,'cfreshman');const result=run(['a-command-that-does-not-exist']);expect(result.status).toBe(127);expect(readFileSync(state,'utf8')).toBe('cfreshman');
});
it.each([['TERM',143],['INT',130],['HUP',129]] as const)('restores after %s interrupts the wrapper', (signal,code)=>{
 const result=run(['/bin/bash','-c',`kill -${signal} "$PPID"; exit 0`]);expect(result.status).toBe(code);expect(readFileSync(state,'utf8')).toBe('previous-account');
});
