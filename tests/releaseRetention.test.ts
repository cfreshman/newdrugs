import {it,expect} from 'vitest';import {mkdtemp,mkdir,writeFile,symlink,access,rm,readdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {execFileSync} from 'node:child_process';
it('keeps a pinned baseline after newer releases replace the previous rollback',async()=>{
 const root=await mkdtemp(join(tmpdir(),'nd-baseline-'));
 try{
  const base=join(root,'prod'),releases=join(base,'releases');await mkdir(releases,{recursive:true});
  const names=Array.from({length:5},(_,i)=>`2026092500000000${i}`);
  for(const name of names)await mkdir(join(releases,name));
  await symlink(join(releases,names[0]),join(base,'baseline'));await symlink(join(releases,names[4]),join(base,'current'));await symlink(join(releases,names[3]),join(base,'previous'));
  execFileSync('python3',[resolve('scripts/release-retention.py'),'--root',root,'--stage','prod','--apply']);
  for(const name of [names[0],...names.slice(2)])await access(join(releases,name));await expect(access(join(releases,names[1]))).rejects.toThrow();
 }finally{await rm(root,{recursive:true,force:true});}
});
it('prunes only older timestamped release directories, protecting active and rollback symlinks and application data',async()=>{const root=await mkdtemp(join(tmpdir(),'nd-retention-'));try{const base=join(root,'dev'),releases=join(base,'releases');await mkdir(releases,{recursive:true});const names=Array.from({length:7},(_,i)=>`2026092500000000${i}`);for(const name of names){await mkdir(join(releases,name));await writeFile(join(releases,name,'fixture'),'release');}await symlink(join(releases,names[0]),join(base,'current'));await symlink(join(releases,names[1]),join(base,'previous'));await mkdir(join(releases,'data'));await writeFile(join(releases,'data','keep'),'data');await symlink(join(releases,'data'),join(releases,'20260925000000009'));const script=resolve('scripts/release-retention.py');execFileSync('python3',[script,'--root',root,'--stage','dev']);expect((await readdir(releases)).length).toBe(9);execFileSync('python3',[script,'--root',root,'--stage','dev','--apply']);for(const name of [names[0],names[1],...names.slice(-3),'data','20260925000000009'])await access(join(releases,name));await expect(access(join(releases,names[2]))).rejects.toThrow();await expect(access(join(releases,names[3]))).rejects.toThrow();}finally{await rm(root,{recursive:true,force:true});}});
