import {it,expect} from 'vitest';
import {readFile,mkdtemp,mkdir,writeFile,symlink,readlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
it.each(['start:newdrugs-worker@dev','restart:newdrugs@dev'])('restores the previous release on %s failure',async failure=>{
 const directory=await mkdtemp(join(tmpdir(),'nd-deploy-test-'));
 try{
  const stage=join(directory,'srv/newdrugs/dev'),old=join(stage,'releases/old'),next=join(stage,'releases/new'),bin=join(directory,'bin');
  await mkdir(old,{recursive:true});await mkdir(next);await mkdir(bin);await symlink(old,join(stage,'current'));
  const mocks:Record<string,string>={npm:'exit 0',tar:'exit 0',rm:'exit 0',mv:'exec "$REVIEW_NODE" -e \'require("node:fs").renameSync(process.argv.at(-2),process.argv.at(-1))\' -- "$@"',systemctl:'echo "$*" >> "$REVIEW_SERVICE_LOG"\nif test "$1:$2" = "$REVIEW_FAIL"; then exit 1; fi\nexit 0'};
  for(const [name,body]of Object.entries(mocks))await writeFile(join(bin,name),'#!/bin/sh\n'+body+'\n',{mode:0o700});
  const source=(await readFile('scripts/deploy.mjs','utf8')).split('const activate = `')[1].split('`;\n')[0];
  const script=source.replaceAll('/srv/newdrugs/',join(directory,'srv/newdrugs')+'/').replaceAll('${instance}','dev').replaceAll('${remote}',next).replaceAll('${port}','7333');
  const result=spawnSync('bash',['-c',script],{encoding:'utf8',timeout:10000,env:{...process.env,PATH:bin+':'+process.env.PATH,REVIEW_NODE:process.execPath,REVIEW_FAIL:failure,REVIEW_SERVICE_LOG:join(directory,'services')}});
  expect(result.status).toBe(1);expect(await readlink(join(stage,'current'))).toBe(old);
  expect(await readFile(join(directory,'services'),'utf8')).toContain('restart newdrugs-worker@dev');
 }finally{await rm(directory,{recursive:true,force:true});}
});
