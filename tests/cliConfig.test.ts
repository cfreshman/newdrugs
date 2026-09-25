import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtemp, rm, readFile, stat, writeFile, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigStore } from '../cli/config';
import { agentSetup } from '../shared/agentSetup';
let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'newdrugs-cli-test-')); await chmod(directory, 0o700); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
it('keeps concurrent named connections separate and never removes a sibling on logout', async () => {
  const store = new ConfigStore(join(directory, 'config.json'));
  await Promise.all([store.set('dev', { url: 'https://dev.druggie.org', token: 'dev-test' }), store.set('default', { url: 'https://druggie.org', token: 'default-test' })]);
  expect((await store.resolve('dev')).token).toBe('dev-test');
  expect((await store.resolve('default')).token).toBe('default-test');
  await store.use('dev'); expect((await store.resolve()).url).toBe('https://dev.druggie.org');
  await store.logout('dev'); expect((await store.resolve()).token).toBe('default-test');
  expect((await stat(store.file)).mode & 0o777).toBe(0o600);
});
it('migrates the existing local-proxy login to the cloud dev profile without exposing or losing its token', async () => {
  const store = new ConfigStore(join(directory, 'config.json'));
  await writeFile(join(directory, 'connection.json'), JSON.stringify({ url: 'http://localhost:7330', token: 'existing-test' }), { mode: 0o600 });
  expect(await store.resolve('dev')).toEqual({ url: 'https://dev.druggie.org', token: 'existing-test' });
  await store.use('dev');
  expect(JSON.parse(await readFile(store.file, 'utf8')).profiles.dev.token).toBe('existing-test');
  await expect(stat(join(directory, 'connection.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  await store.logout('dev'); await expect(store.resolve('dev')).rejects.toThrow('No saved connection');
});
it('refuses readable credentials and symlinked targets', async () => {
  const file = join(directory, 'config.json'), store = new ConfigStore(file);
  await writeFile(file, '{}', { mode: 0o644 });
  await expect(store.load()).rejects.toThrow('private');
  await rm(file); await writeFile(join(directory, 'target'), '{}', { mode: 0o600 }); await symlink(join(directory, 'target'), file);
  await expect(store.load()).rejects.toThrow('non-symlink');
});
it('generates a normal public setup prompt, with the separate dev profile only on the development site', () => {
  const publicSetup = agentSetup('https://druggie.org', 'test-token');
  expect(publicSetup.prompt).toContain('newdrugs login --url https://druggie.org --token-stdin');
  expect(publicSetup.prompt).not.toMatch(/\bprod(?:uction)?\b|--profile/);
  expect(publicSetup.prompt).toContain('/downloads/newdrugs-cli.tgz');
  expect(agentSetup('http://localhost:7330').prompt).toContain('newdrugs --profile dev login --url https://dev.druggie.org');
});
