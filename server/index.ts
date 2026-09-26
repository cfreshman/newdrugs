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
const stopWorker = startWorker();
const stopSearch = startSearchWorker();
const stopPush = startPushWorker();
const stopChatSearch = startChatSearchWorker();
const uploadCleanup = setInterval(() => { void expireUploads().catch(error => console.error('Upload cleanup:', error.name)); }, 60000);
const server = createApp().listen(config.PORT, '127.0.0.1', () => {
  console.log(`new drugs API · http://127.0.0.1:${config.PORT}`);
  console.log(`Agent: ${config.aiEnabled ? 'connected' : 'waiting for API key'} · payments: ${config.paymentsEnabled ? 'connected' : 'not configured'}`);
});
server.requestTimeout = 600000;
const shutdown = async () => { setTimeout(() => process.exit(1), 10000).unref(); clearInterval(uploadCleanup); await stopWorker(); await stopSearch(); await stopPush(); await stopChatSearch(); await stopLiveState(); server.close(() => { void mongo.close().then(() => process.exit(0)); }); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
