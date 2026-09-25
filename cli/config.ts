import { mkdir, lstat, readFile, writeFile, rename, unlink, open, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface Login { url: string; token: string }
interface Config { activeProfile: string; profiles: Record<string, Login> }
export function validUrl(value: string) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use a plain site origin, such as https://druggie.org.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('HTTPS is required except on localhost.');
  return url.origin;
}
export function profileName(value: string) { if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/.test(value)) throw new Error('Use a profile name with letters, numbers, underscores or hyphens.'); return value; }
async function secure(path: string, directory = false) {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())) throw new Error('Credential paths must be regular, non-symlink files/directories.');
    if (process.getuid && info.uid !== process.getuid()) throw new Error('The credential path belongs to another user.');
    if (process.platform !== 'win32' && (info.mode & 0o077)) throw new Error(`Credential ${directory ? 'directory' : 'file'} must be private (chmod ${directory ? '700' : '600'}).`);
    return true;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

/** Wayfinder's named, pinned connections and private atomic credential storage. */
export class ConfigStore {
  readonly file: string;
  readonly legacy: string;
  constructor(file = process.env.NEWDRUGS_CONFIG || join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'newdrugs', 'config.json')) {
    this.file = resolve(file); this.legacy = join(dirname(this.file), 'connection.json');
  }
  async load(): Promise<Config> {
    await secure(dirname(this.file), true);
    const present = await secure(this.file);
    const path = present ? this.file : this.file !== this.legacy && await secure(this.legacy) ? this.legacy : null;
    if (!path) return { activeProfile: 'default', profiles: {} };
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (typeof value.url === 'string' && typeof value.token === 'string') {
      const origin = validUrl(value.url), dev = ['http://localhost:7330', 'http://127.0.0.1:7330', 'https://dev.druggie.org'].includes(origin);
      const name = dev ? 'dev' : 'default';
      return { activeProfile: name, profiles: { [name]: { url: dev ? 'https://dev.druggie.org' : origin, token: value.token } } };
    }
    if (!value.profiles || typeof value.profiles !== 'object' || typeof value.activeProfile !== 'string') throw new Error('Invalid CLI connection file.');
    const profiles: Record<string, Login> = Object.create(null);
    for (const [name, candidate] of Object.entries(value.profiles)) {
      const entry = candidate as Login;
      if (typeof entry.token !== 'string') throw new Error('Invalid saved connection.');
      profiles[profileName(name)] = { url: validUrl(entry.url), token: entry.token };
    }
    return { activeProfile: value.activeProfile, profiles };
  }
  async resolve(name?: string) {
    const config = await this.load(), selected = profileName(name || config.activeProfile);
    const login = Object.hasOwn(config.profiles, selected) ? config.profiles[selected] : undefined;
    if (!login) throw new Error(`No saved connection for "${selected}". Run newdrugs login${selected === 'default' ? '' : ` --profile ${selected}`}.`);
    return login;
  }
  private async mutate(change: (config: Config) => void, remove = false) {
    const dir = dirname(this.file); await secure(dir, true); await mkdir(dir, { recursive: true, mode: 0o700 }); await chmod(dir, 0o700);
    const lockPath = `${this.file}.lock`;
    let lock;
    for (let attempt = 0; !lock; attempt++) {
      try { lock = await open(lockPath, 'wx', 0o600); await lock.writeFile(String(process.pid)); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (attempt >= 100) throw new Error('Another CLI command is updating connections. Try again.');
        await secure(lockPath);
        const pid = Number(await readFile(lockPath, 'utf8'));
        if (pid) { try { process.kill(pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') { await unlink(lockPath); continue; } } }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    try {
      const config = await this.load(); change(config); await secure(this.file);
      if (remove) { if (await secure(this.file)) await unlink(this.file); if (this.file !== this.legacy && await secure(this.legacy)) await unlink(this.legacy); return; }
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try { await writeFile(temporary, JSON.stringify(config, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); await rename(temporary, this.file); }
      finally { await unlink(temporary).catch(() => {}); }
      // Do not leave an old token file that would revive a logged-out profile.
      if (this.file !== this.legacy && await secure(this.legacy)) await unlink(this.legacy);
    } finally { await lock.close(); await unlink(lockPath); }
  }
  removeAll() { return this.mutate(() => {}, true); }
  set(name: string, login: Login) { return this.mutate(config => { config.profiles[profileName(name)] = { url: validUrl(login.url), token: login.token }; config.activeProfile = name; }); }
  use(name: string) { return this.mutate(config => { if (!Object.hasOwn(config.profiles, profileName(name))) throw new Error('That connection profile does not exist.'); config.activeProfile = name; }); }
  logout(name?: string) { return this.mutate(config => { const selected = profileName(name || config.activeProfile); delete config.profiles[selected]; if (config.activeProfile === selected) config.activeProfile = Object.hasOwn(config.profiles, 'default') ? 'default' : Object.keys(config.profiles)[0] || 'default'; }); }
}
