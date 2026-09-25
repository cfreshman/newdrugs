import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prepareVersion } from './version.mjs';
const instance = process.argv[2];
if (!['prod', 'dev'].includes(instance)) throw new Error('Choose prod or dev.');
const sshKey = process.env.NEWDRUGS_SSH_KEY || '/Users/work/.ssh/newdrugs_do';
const target = process.env.NEWDRUGS_SSH_HOST || 'root@24.144.121.19';
if (!/^[\w@.:-]+$/.test(target)) throw new Error('Invalid SSH host.');
const sshOptions = ['-i',sshKey,'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes'];
const run = (command,args,options={}) => new Promise((resolveRun,reject) => { const child=spawn(command,args,{stdio:'inherit',...options}); child.on('error',reject); child.on('exit',code=>code===0?resolveRun():reject(new Error(`${command} exited ${code}`))); });
await mkdir('.data/releases',{recursive:true});
const lockPath = '.data/deploy.lock';
while (true) {
  try { const lock=await open(lockPath,'wx'); await lock.writeFile(String(process.pid)); await lock.close(); break; }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    try { const pid=Number(await readFile(lockPath,'utf8')); if (pid) process.kill(pid,0); }
    catch (error) { if (error.code === 'ESRCH') { await unlink(lockPath).catch(()=>{}); continue; } }
    await new Promise(resolve=>setTimeout(resolve,250));
  }
}
try {
await prepareVersion(instance === 'prod');
// Rebuild after preparing the version so every deployed artifact has the same version.
await run('npm',['run','build']);
const release = new Date().toISOString().replace(/[^0-9]/g,'');
const remote = `/srv/newdrugs/${instance}/releases/${release}`;
const port = instance === 'prod' ? 7331 : 7333;
await run('ssh',[...sshOptions,target,`install -d -m 755 ${remote}`]);
await mkdir('.data/releases',{recursive:true});
const archive=resolve(`.data/releases/${instance}-${release}.tgz`);
await run('tar',['-czf',archive,'dist','package.json','package-lock.json','bin']);
await run('scp',[...sshOptions,archive,`${target}:${remote}/release.tgz`]);
const activate = `set -eu
cd ${remote}
tar -xzf release.tgz
rm release.tgz
npm ci --omit=dev --no-audit --no-fund
previous=$(readlink /srv/newdrugs/${instance}/current || true)
ln -sfn ${remote} /srv/newdrugs/${instance}/current.next
mv -Tf /srv/newdrugs/${instance}/current.next /srv/newdrugs/${instance}/current
systemctl enable newdrugs@${instance} >/dev/null
systemctl restart newdrugs@${instance}
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:${port}/api/health; then exit 0; fi
  sleep 1
done
if test -n "$previous"; then ln -sfn "$previous" /srv/newdrugs/${instance}/current; systemctl restart newdrugs@${instance}; fi
exit 1`;
await writeFile(`.data/releases/${instance}-activate.sh`,activate);
await run('ssh',[...sshOptions,target,activate]);
console.log(`Deployed ${instance}: ${release}`);
} finally { await unlink(lockPath).catch(()=>{}); }
