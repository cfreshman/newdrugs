#!/usr/bin/env node
import {parseSearchArgs,searchCatalog,type SearchPage} from './search';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import release from '../release.json';
import { ConfigStore, operatorStore, validUrl, profileName, type Login } from './config';
import { maybeAutoUpdate, uninstall } from './lifecycle';
import { downloadFile } from './download';
import { uploadLocalFile } from './upload';

interface Operation { name: string; kind: 'read' | 'write'; description: string; inputSchema: Record<string, unknown> }
const rawArgs = process.argv.slice(2);
const profileIndex = rawArgs.findIndex(arg=>arg==='--profile'||arg.startsWith('--profile='));
const inlineProfile = profileIndex>=0 && rawArgs[profileIndex].startsWith('--profile=');
const selectedProfile = profileIndex >= 0 ? profileName(inlineProfile ? rawArgs[profileIndex].slice('--profile='.length) : rawArgs[profileIndex + 1] || '') : process.env.NEWDRUGS_PROFILE ? profileName(process.env.NEWDRUGS_PROFILE) : undefined;
const args = rawArgs.filter((_, index) => profileIndex < 0 || index !== profileIndex && (inlineProfile || index !== profileIndex + 1));
const command = args[0] || 'help';
const store = new ConfigStore();
function option(name: string) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }
async function request<T>(login: Login, path: string, body?: unknown, idempotencyKey?: string, confirmed = false): Promise<T> {
  const response = await fetch(`${login.url}/api${path}`, { method: body === undefined ? 'GET' : 'POST', redirect: 'error',
    signal: AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${login.token}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}), ...(confirmed ? { 'X-NewDrugs-Confirmed': 'true' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json() as { error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || `Request failed (${response.status}).`);
  return result as T;
}
async function catalog(login: Login) { return (await request<{ operations: Operation[] }>(login, '/catalog')).operations; }
async function invoke(login: Login, name: string, input: unknown, key?: string, confirmed = false) {
  return request(login, `/operations/${encodeURIComponent(name)}`, input, key, confirmed);
}
async function readSecret() {
  if (args.includes('--token-stdin')) {
    let secret = '';
    for await (const chunk of process.stdin) { secret += chunk.toString(); if (secret.length > 300) throw new Error('Token is too long.'); }
    return secret.trim();
  }
  if (!process.stdin.isTTY) throw new Error('Pass the token through stdin with --token-stdin.');
  process.stderr.write('Access token (hidden): ');
  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise<string>((resolveSecret, reject) => {
    let secret = '';
    const finish = () => { process.stdin.off('data', data); process.stdin.setRawMode(wasRaw); process.stdin.pause(); process.stderr.write('\n'); };
    const data = (chunk: Buffer) => {
      for (const character of chunk.toString()) {
        if (character === '\u0003') { finish(); reject(new Error('Cancelled.')); return; }
        if (character === '\r' || character === '\n') { finish(); resolveSecret(secret.trim()); return; }
        if (character === '\u007f') secret = secret.slice(0, -1);
        else if (/[A-Za-z0-9_-]/.test(character) && secret.length < 300) secret += character;
      }
    };
    process.stdin.on('data', data);
  });
}
function print(result: unknown) { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); }
async function main() {
  if (command === 'uninstall') { await uninstall(args.includes('--yes'),store); return; }
  if (command === 'update') { const state=await maybeAutoUpdate(release.version,store,selectedProfile,true); if(state!=='updated')process.stdout.write(state==='current'?'New Drugs CLI is current.\n':'An update is already running.\n'); return; }
  if (!['logout','profiles','use','--version','version'].includes(command)) await maybeAutoUpdate(release.version,store,selectedProfile);
  if (command === '--version' || command === 'version') { console.log(release.version); return; }
  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(`New Drugs\n\nlogin [--url https://druggie.org] [--token-stdin]\nlogout\nsearch [words] [--keyword] [--limit 1-50] [--cursor cursor] [--all]\ndescribe <operation>\nread <operation> [JSON input]\nexecute <operation> [JSON input] [--key idempotency-key] [--yes]\nfile-upload <path> [--log] [--key idempotency-key] [--request upload-request-id]\nfile-download <file-id> <destination>\nadmin (separate operator commands)\nprofiles\nuse <profile>\nupdate\nuninstall --yes\nmcp (optional)\n\nUse --profile <name> with any command for an independent saved connection.\nDirect operations do not call a model or spend credits. Profiles are human-authored in the app.`);
    return;
  }
  if (command === 'admin') {
    const admin = operatorStore(store), sub = args[1] || 'help';
    if (sub === 'help') { console.log('admin login --token-stdin [--url https://druggie.org]\nadmin file-download <report-id> <file-id> <destination>\nadmin profiles\nadmin use <profile>\nadmin logout\nadmin search [words]\nadmin describe <operation>\nadmin read <operation> [JSON]\nadmin execute <operation> [JSON] --yes [--key request-key]\nUse --profile for separate stage connections. Operator credentials are separate from social logins.'); return; }
    if (sub === 'login') {
      const login = { url: validUrl(option('--url') || 'https://druggie.org'), token: await readSecret() };
      const result = await request(login, '/admin/cli/operations/identity.get', {});
      await admin.set(selectedProfile || 'default', login); print(result); return;
    }
    if (sub === 'logout') { await admin.logout(selectedProfile); console.log('Operator signed out.'); return; }
    if (sub === 'use') { await admin.use(profileName(args[2] || '')); return; }
    if (sub === 'profiles') { const saved = await admin.load(); print({ profiles: Object.entries(saved.profiles).map(([name, value]) => ({ name, url: value.url, active: name === saved.activeProfile })) }); return; }
    const login = await admin.resolve(selectedProfile);
    if(sub==='file-download'){if(!args[2]||!args[3]||!args[4])throw new Error('Use admin file-download <report-id> <file-id> <destination>.');print(await downloadFile(login,args[3]||'',args[4]||'',args[2]||''));return;}
    const ops = (await request<{ operations: Operation[] }>(login, '/admin/cli/catalog')).operations;
    if (sub === 'search') { const words = args.slice(2).join(' ').toLowerCase().split(/\s+/).filter(Boolean); print({ operations: ops.filter(op => words.every(word => `${op.name} ${op.description}`.toLowerCase().includes(word))) }); return; }
    const op = ops.find(op => op.name === args[2]);
    if (!op) throw new Error('Run admin search to find an operator operation.');
    if (sub === 'describe') { print(op); return; }
    if (!(sub === 'read' && op.kind === 'read' || sub === 'execute' && op.kind === 'write')) throw new Error('Use admin read for reads and admin execute for writes.');
    const input = args[3] && !args[3].startsWith('--') ? JSON.parse(args[3]) : {};
    const key = op.kind === 'write' ? option('--key') || randomUUID() : undefined;
    if (key) process.stderr.write(`Request key: ${key}\n`);
    print(await request(login, `/admin/cli/operations/${encodeURIComponent(op.name)}`, input, key, args.includes('--yes'))); return;
  }
  if (command === 'login') {
    const url = validUrl(option('--url') || 'https://druggie.org');
    const token = await readSecret();
    if (!/^nd_[A-Za-z0-9_-]{40,60}$/.test(token)) throw new Error('Invalid token format. Create one in the app with /connect.');
    const login = { url, token };
    const identity = await invoke(login, 'identity.get', {});
    await store.set(selectedProfile || 'default', login);
    print(identity);
    return;
  }
  if (command === 'logout') { await store.logout(selectedProfile); console.log('Signed out.'); return; }
  if (command === 'profiles') { const config = await store.load(); print({ profiles: Object.entries(config.profiles).map(([name, login]) => ({ name, url: login.url, active: name === config.activeProfile })) }); return; }
  if (command === 'use') { await store.use(profileName(args[1] || '')); console.log(`Using ${args[1]}.`); return; }
  const login = await store.resolve(selectedProfile);
  if (command === 'file-download') { print(await downloadFile(login,args[1]||'',args[2]||'')); return; }
  if (command === 'file-upload') {
    const key = option('--key') || randomUUID();
    process.stderr.write(`Request key: ${key}\n`);
    print(await uploadLocalFile(login, args[1], (name, input, requestKey) => invoke(login, name, input, requestKey), key, option('--request'),args.includes('--log')?'log_media':'agent_input'));
    return;
  }
  if (command === 'mcp') {
    const upstream = new Client({ name: 'new-drugs-cli', version: release.version });
    await upstream.connect(new StreamableHTTPClientTransport(new URL('/mcp', login.url), { requestInit: { headers: { Authorization: `Bearer ${login.token}` } } }));
    const server = new Server({ name: 'new-drugs', version: release.version }, { capabilities: { tools: {}, resources: {} }, instructions: upstream.getInstructions() });
    server.setRequestHandler(ListToolsRequestSchema, () => upstream.listTools());
    server.setRequestHandler(CallToolRequestSchema, req => upstream.callTool(req.params));
    server.setRequestHandler(ListResourcesRequestSchema, () => upstream.listResources());
    server.setRequestHandler(ReadResourceRequestSchema, req => upstream.readResource(req.params));
    await server.connect(new StdioServerTransport());
    process.on('SIGTERM', () => { void upstream.close(); void server.close(); });
    return;
  }
  if (command === 'search') { print(await searchCatalog(parseSearchArgs(args.slice(1)),input=>request<SearchPage>(login,'/catalog/search',input)));return; }
  const available = await catalog(login);
  const op = available.find(o => o.name === args[1]);
  if (!op) throw new Error('Unknown operation. Run search to see what is available.');
  if (command === 'describe') { print(op); return; }
  if ((command === 'read' && op.kind === 'read') || (command === 'execute' && op.kind === 'write')) {
    const key = op.kind === 'write' ? option('--key') || randomUUID() : undefined;
    if (key) process.stderr.write(`Request key: ${key}\n`);
    const input = args[2] && !args[2].startsWith('--') ? JSON.parse(args[2]) : {};
    print(await invoke(login, op.name, input, key, args.includes('--yes')));
    return;
  }
  throw new Error('Use read for reads and execute for writes.');
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Command failed.'); process.exitCode = 1; });
