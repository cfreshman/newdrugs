import {startLedgerActivityWorker} from './ledgerActivity';
import { startChatSearchWorker } from './search/chat';
import { startPushWorker } from './push';
import { createApp } from './app';
import { connectDatabase, mongo } from './db';
import { config } from './config';
import { startWorker } from './agent';
import { ensureStarterPool } from './starterPool';
import { stopLiveState } from './liveState';
import { startSearchWorker } from './search/worker';
import { expireUploads } from './uploads';

await connectDatabase();
await ensureStarterPool();
const background = config.PROCESS_ROLE !== 'web';
const stopWorker = background ? startWorker() : async () => {};
const stopSearch = background ? startSearchWorker() : async () => {};
const stopPush = background ? startPushWorker() : async () => {};
const stopChatSearch = background ? startChatSearchWorker() : async () => {};
const stopLedgerActivity = background ? startLedgerActivityWorker() : async () => {};
let cleaning = false;
const uploadCleanup = background ? setInterval(() => { if (cleaning) return; cleaning = true; void expireUploads().catch(error => console.error('Upload cleanup:', error.name)).finally(() => { cleaning = false; }); }, 60000) : undefined;
const server = config.PROCESS_ROLE !== 'worker' ? createApp().listen(config.PORT, '127.0.0.1', () => {
  console.log(`new drugs API · http://127.0.0.1:${config.PORT}`);
  console.log(`Agent: ${config.aiEnabled ? 'connected' : 'waiting for API key'} · payments: ${config.paymentsEnabled ? 'connected' : 'not configured'}`);
}) : undefined;
console.log(`Process role: ${config.PROCESS_ROLE}`);
if (server) server.requestTimeout = 600000;
let stopping = false;
const shutdown = async () => {
  if (stopping) return; stopping = true;
  setTimeout(() => process.exit(1), 20000).unref(); clearInterval(uploadCleanup);
  await Promise.all([stopWorker(),stopSearch(),stopPush(),stopChatSearch(),stopLedgerActivity(),stopLiveState()]);
  if (server) await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
  await mongo.close(); process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
