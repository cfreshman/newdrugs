import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
// Vite stays local. Every backend edit is built and deployed to the isolated cloud dev service.
const ui = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'inherit' });
const admin = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'admin/vite.config.ts', '--host', '127.0.0.1'], { stdio: 'inherit' });
let deploying = false, pending = true, timer, child;
async function deploy() {
  if (deploying || !pending) return;
  deploying = true; pending = false;
  child = spawn(process.execPath, ['scripts/deploy.mjs', 'dev'], { stdio: 'inherit' });
  await new Promise(resolve => child.on('exit', code => { if (code) console.error('Cloud dev deploy failed; the last working release remains active.'); resolve(); }));
  deploying = false;
  if (pending) void deploy();
}
const changed = () => { pending = true; clearTimeout(timer); timer = setTimeout(() => void deploy(), 700); };
const watchers = ['server','shared','src','admin','public'].map(path => watch(path, { recursive: true }, changed));
watchers.push(...['package.json','package-lock.json','index.html','vite.config.ts'].map(path => watch(path, changed)));
void deploy();
const stop = () => { clearTimeout(timer); watchers.forEach(w => w.close()); ui.kill('SIGTERM'); admin.kill('SIGTERM'); child?.kill('SIGTERM'); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
ui.on('exit', stop);
admin.on('exit', stop);
