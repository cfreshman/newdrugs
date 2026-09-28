import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prepareVersion } from './version.mjs';
const instance = process.argv[2];
if (!['prod', 'dev'].includes(instance)) throw new Error('Choose prod or dev.');
const sshKey = process.env.NEWDRUGS_SSH_KEY || '/Users/work/.ssh/newdrugs_do';
const target = process.env.NEWDRUGS_SSH_HOST || 'root@167.172.21.42';
if (!/^[\w@.:-]+$/.test(target)) throw new Error('Invalid SSH host.');
const sshOptions = ['-i',sshKey,'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=60','-o','ServerAliveInterval=60','-o','ServerAliveCountMax=5'];
const run = (command,args,options={}) => new Promise((resolveRun,reject) => { const child=spawn(command,args,{stdio:options.input ? ['pipe','inherit','inherit'] : 'inherit',...options}); if(options.input)child.stdin.end(options.input); child.on('error',reject); child.on('exit',code=>code===0?resolveRun():reject(new Error(`${command} exited ${code}`))); });
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
await run('ssh',[...sshOptions,target,`python3 - --stage both --apply`],{input:await readFile('scripts/release-retention.py','utf8')});
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
worker_enabled=false
if systemctl is-enabled --quiet newdrugs-worker@${instance}; then worker_enabled=true; fi
previous=$(readlink /srv/newdrugs/${instance}/current || true)
activation_started=false
committed=false
recover() {
  status=$?
  trap - EXIT HUP INT TERM
  if $activation_started && ! $committed; then
    echo 'Activation failed; restoring the previous release.' >&2
    if test -n "$previous"; then
      ln -sfn "$previous" /srv/newdrugs/${instance}/current.recover
      mv -Tf /srv/newdrugs/${instance}/current.recover /srv/newdrugs/${instance}/current
      systemctl restart newdrugs@${instance} || true
      if $worker_enabled; then systemctl restart newdrugs-worker@${instance} || true; fi
    fi
    if test "$status" -eq 0; then status=1; fi
  fi
  exit "$status"
}
trap recover EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
if test -n "$previous"; then ln -sfn "$previous" /srv/newdrugs/${instance}/previous; fi
activation_started=true
if $worker_enabled; then systemctl stop newdrugs-worker@${instance}; fi
ln -sfn ${remote} /srv/newdrugs/${instance}/current.next
mv -Tf /srv/newdrugs/${instance}/current.next /srv/newdrugs/${instance}/current
systemctl enable newdrugs@${instance} >/dev/null
systemctl restart newdrugs@${instance}
if $worker_enabled; then systemctl start newdrugs-worker@${instance}; fi
deadline=$(( $(date +%s) + 180 ))
while test "$(date +%s)" -lt "$deadline"; do
  if curl -fsS --connect-timeout 1 --max-time 3 http://127.0.0.1:${port}/api/health; then
    if ! $worker_enabled; then committed=true; exit 0; fi
    worker_pid=$(systemctl show newdrugs-worker@${instance} -p MainPID --value)
    if systemctl is-active --quiet newdrugs-worker@${instance} && timeout 10 node --env-file=/etc/newdrugs/${instance}.env ${remote}/dist/server/workerStatus.js --require-worker "$worker_pid" && test "$worker_pid" = "$(systemctl show newdrugs-worker@${instance} -p MainPID --value)"; then committed=true; exit 0; fi
  fi
  sleep 1
done
exit 1`;
await writeFile(`.data/releases/${instance}-activate.sh`,activate);
await run('ssh',[...sshOptions,target,activate]);
await run('ssh',[...sshOptions,target,`python3 - --stage ${instance} --apply`],{input:await readFile('scripts/release-retention.py','utf8')});
console.log(`Deployed ${instance}: ${release}`);
} finally { await unlink(lockPath).catch(()=>{}); }
