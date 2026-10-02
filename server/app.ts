import {uploadAdmission} from './uploadAdmission';
import {agentAccessSchema,deviceStartSchema} from '../shared/agentAccess';
import {insertAgentToken} from './agentTokens';
import {startDeviceLogin,pollDeviceLogin,readDeviceLogin,decideDeviceLogin} from './deviceLogin';
import {sendMedia} from './mediaDelivery';
import {updateLiveInterests} from './liveSubscriptions';
import {publicInvitePreview,inviteMediaMetadata} from './logInvites';
import {pagePreview,readPagePreviewImage} from './pagePreviews';
import {renderPagePreview} from '../shared/pagePreview';
import {readFile} from 'node:fs/promises';
import {apiRequestLimits,requestRateLimit as limiter} from './requestLimits';
import {pageContextCandidate} from '../shared/pageContext';
import {listAdminUsers} from './adminUsers';
import {mountAdminFrontend} from './adminFrontend';
import {EMBED_ORIGINS} from '../shared/postLinks';
import { recordReferenceSchema } from '../shared/recordContext';
import { revokeAutomationCredential } from './automations';
import { clearAgentChat, changeUsername, changeAccountPassword, verifyAccountPassword } from './account';
import { operationAvailable } from './backgroundAuthority';
import { adminCliRouter } from './adminCli';
import { pushConfigured, pushDevices, saveSubscription, revokePush, subscriptionSchema } from './push';
import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { z, ZodError } from 'zod';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { config } from './config';
import { registerAccount, authenticate, browserActor, checkPassword, createGuest, csrf, currentUser, hash, logout, newSession, passwordHash, profile, requireActor, users } from './auth';
import { AppError, requireValue } from './errors';
import { rows, db, transaction } from './db';
import { wallet, reserveRun, runs } from './wallet';
import { conversation, executeOperation } from './operations';
import { operations, describeOperation } from '../shared/catalog';
import { currentRun, runView, decideApprovals, completeSurface, cancelRun } from './agent';
import { createMcpServer } from './mcp';
import {WebhookReceiver} from 'livekit-server-sdk';
import {activeCall,callAccess,callHistory,callWebhook,endCall,incomingCall,joinCall,liveMediaReady,startCall} from './calling';
import {spaceAccess,spaceWebhook} from './spaces';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ensureStarter, starterPoolStatus, setStarterBudget } from './starterPool';
import { adminStatus, requireAdmin, signInAdmin, signOutAdmin } from './admin';
import { searchOperations, searchSchema } from './operationSearch';
import release from '../release.json';
import { checkout, stripeWebhook, topupQuote } from './payments';
import { ensureIntroduction } from './onboarding';
import {acceptUpload,uploadMetadata} from './uploads';
import { streamLiveState, readLiveState } from './liveState';
import { buildResourceLinks } from './resourceLinks';
import { devApiGate,trustedDevKey } from './devGate';
import { previewImage } from './linkPreviews';
import { replyToReview } from './reviewReply';
import {websiteRequest} from './websiteServing';
import {reservedWebsiteUsername} from '../shared/website';

const credentials = z.strictObject({ handle: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/, 'Use 3–24 lowercase letters, numbers, or underscores.'), password: z.string().min(8, 'Use at least 8 characters.').max(128) });
const availableHandle=credentials.shape.handle.refine(handle=>!reservedWebsiteUsername(handle),'Usernames cannot begin with u_.');
const registrationCredentials=credentials.extend({handle:availableHandle});


export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.production) app.set('trust proxy', 'loopback');
  app.use(websiteRequest);
  app.use(helmet({ contentSecurityPolicy: config.production ? {
    directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      connectSrc: ["'self'"], workerSrc:["'self'",'blob:'], frameSrc:EMBED_ORIGINS, imgSrc: ["'self'", 'data:','blob:','https:'], mediaSrc:["'self'",'https:'], objectSrc: ["'none'"], frameAncestors: ["'none'"] },
  } : false, crossOriginEmbedderPolicy: false }));
  app.get('/api/health', async (_req, res) => { await db().command({ ping: 1 }); res.json({ ok: true }); });
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '128kb' }), async (req, res) => {
    await stripeWebhook(req.body, req.get('stripe-signature') || ''); res.json({ received: true });
  });
  app.post('/mcp', limiter('/mcp', 300), authenticate, express.json({ limit: '2200kb' }), async (req, res) => {
    const actor = requireActor(req);
    if (actor.source === 'browser') throw new AppError(403, 'token_required', 'Connect MCP using an access token.');
    const server = createMcpServer(actor);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    await server.connect(transport); await transport.handleRequest(req, res, req.body);
  });
  app.all('/mcp', (_req, res) => { res.status(405).set('Allow', 'POST').json({ error: 'Use authenticated Streamable HTTP POST.' }); });
  app.use('/api/admin/cli', limiter('/api/admin/cli', 90), express.json({ limit: '16kb' }), adminCliRouter());
  // These projections are deliberately anonymous. Staging still requires its gate.
  const previewGate:express.RequestHandler=(req,res,next)=>{
    if(config.APP_ENV!=='staging'||trustedDevKey(req.get('X-NewDrugs-Dev-Key')))return next();
    if(!req.get('Authorization'))return next(new AppError(404,'not_found','This development endpoint is private.'));
    void authenticate(req,res,error=>{if(error)return next(error);try{requireActor(req);next();}catch(error){next(error);}});
  };
  app.get('/api/log-invites/:code',previewGate,limiter('/api/log-invites/:code', 180),async(req,res)=>{res.set({'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}).json(await publicInvitePreview(String(req.params.code)));});
  app.get('/api/log-invites/:code/photos/:fileId',previewGate,limiter('/api/log-invites/:code/photos/:fileId', 300),async(req,res)=>{
    const file=await inviteMediaMetadata(String(req.params.code),String(req.params.fileId),true);
    res.set({'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Content-Disposition':'inline'});await sendMedia(file,req,res);
  });
  app.get('/api/log-invites/:code/media/:fileId',previewGate,limiter('/api/log-invites/:code/media/:fileId', 300),async(req,res)=>{
    const file=await inviteMediaMetadata(String(req.params.code),String(req.params.fileId));
    res.set({'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Content-Disposition':'inline'});await sendMedia(file,req,res);
  });
  app.get('/api/page-preview',previewGate,limiter('/api/page-preview', 180),async(req,res)=>{
    const path=z.string().max(2048).parse(req.query.path||'/');res.set('Cache-Control','no-store').json(await pagePreview(path));
  });
  app.get('/api/share-images/:kind/:id',previewGate,limiter('/api/share-images/:kind/:id', 300),async(req,res)=>{
    const {file,bytes}=await readPagePreviewImage(String(req.params.kind),String(req.params.id));
    res.set({'Content-Type':file.mime,'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Content-Disposition':'inline'}).send(bytes);
  });
  // Anonymous device requests confer no access. Approval uses the browser-only
  // routes below, behind the ordinary cookie/Origin checks. Dev stays gated.
  const deviceJson=express.json({limit:'4kb'}),deviceHeaders:express.RequestHandler=(_req,res,next)=>{res.set({'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'});next();};
  app.post('/api/agent-login/device',devApiGate,limiter('/api/agent-login/device',10,15*60000),deviceJson,authenticate,deviceHeaders,async(req,res)=>{res.json(await startDeviceLogin(deviceStartSchema.parse(req.body)));});
  app.post('/api/agent-login/poll',devApiGate,limiter('/api/agent-login/poll',120),deviceJson,authenticate,deviceHeaders,async(req,res)=>{const data=z.strictObject({device_code:z.string().max(128)}).parse(req.body),result=await pollDeviceLogin(data.device_code);res.status('error' in result?400:200).json(result);});
  app.post('/api/livekit/webhook',express.raw({type:'application/webhook+json',limit:'64kb'}),async(req,res)=>{
    if(!liveMediaReady())throw new AppError(503,'calling_unavailable','Live calling is unavailable.');
    const receiver=new WebhookReceiver(config.LIVEKIT_API_KEY,config.LIVEKIT_API_SECRET);
    const event=await receiver.receive((req.body as Buffer).toString('utf8'),req.get('Authorization'));
    await callWebhook(event);await spaceWebhook(event);res.json({ok:true});
  });
  const ordinaryJson=express.json({limit:'32kb'}),websiteJson=express.json({limit:'2200kb'}),websiteSourceLimit=limiter('/api/website/source',30);
  const requestLimits=apiRequestLimits();
  app.use('/api', devApiGate, cookieParser(), csrf, (req,res,next)=>authenticate(req,res,authError=>{
    if(authError)delete req.actor;
    requestLimits(req,res,limitError=>next(limitError||authError));
  }), (req,res,next)=>/^\/operations\/website\.(?:create|patch)$/.test(req.path)?websiteSourceLimit(req,res,error=>error?next(error):websiteJson(req,res,next)):ordinaryJson(req,res,next));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.post('/api/session', limiter('/api/session', 30, 15 * 60000), async (req, res) => {
    if (!req.actor) {
      const user = await createGuest(req.ip);
      await newSession(res, user._id);
      await ensureIntroduction(user._id);
    } else if (req.actor.source === 'browser') { await ensureStarter(req.actor.userId); await ensureIntroduction(req.actor.userId); }
    res.json({ ok: true });
  });
  app.get('/api/bootstrap', async (req, res) => {
    const actor = requireActor(req);
    res.json({ ...await readLiveState(actor.userId),
      config: { aiEnabled: config.aiEnabled, paymentsEnabled: config.paymentsEnabled, development: config.APP_ENV !== 'production', model: config.OPENAI_MODEL, stage: config.APP_ENV, version: release.version } });
  });
  app.get('/api/calls/incoming',async(req,res)=>{res.json({call:await incomingCall(browserActor(req).userId)});});
  app.get('/api/calls/active',async(req,res)=>{res.json(await activeCall(browserActor(req).userId));});
  app.get('/api/calls/:connectionId',async(req,res)=>{res.json(await callHistory(browserActor(req).userId,z.string().max(100).parse(req.params.connectionId)));});
  app.post('/api/calls/:connectionId',limiter('/api/calls/start',12),async(req,res)=>{res.json({call:await startCall(browserActor(req).userId,z.string().max(100).parse(req.params.connectionId))});});
  app.post('/api/calls/:id/join',async(req,res)=>{res.json({call:await joinCall(browserActor(req).userId,z.uuid().parse(req.params.id))});});
  app.post('/api/calls/:id/end',async(req,res)=>{res.json({call:await endCall(z.uuid().parse(req.params.id),browserActor(req).userId)});});
  app.post('/api/calls/:id/token',limiter('/api/calls/token',40),async(req,res)=>{res.json(await callAccess(browserActor(req).userId,z.uuid().parse(req.params.id)));});
  app.post('/api/spaces/:id/token',limiter('/api/spaces/token',40),async(req,res)=>{res.json(await spaceAccess(browserActor(req).userId,z.uuid().parse(req.params.id)));});
  app.post('/api/events/interests',updateLiveInterests);
  app.get('/api/events', streamLiveState);
  app.get('/api/push', async (req, res) => {
    const actor = browserActor(req), user = await currentUser(actor.userId);
    res.json({ publicKey: pushConfigured() ? config.VAPID_PUBLIC_KEY : null, devices: user.handle ? (await pushDevices(user._id)).items : [] });
  });
  app.post('/api/push/subscribe', async (req, res) => {
    const actor = browserActor(req);
    res.json(await saveSubscription(actor.userId, hash(req.cookies[config.SESSION_COOKIE]), subscriptionSchema.parse(req.body)));
  });
  app.post('/api/push/unsubscribe', async (req, res) => {
    const actor = browserActor(req), { deviceId } = z.strictObject({ deviceId: z.uuid() }).parse(req.body);
    res.json(await revokePush(actor.userId, deviceId));
  });
  app.get('/api/link-previews/:id/image', async (req, res) => {
    requireActor(req);
    res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' }).send(await previewImage(String(req.params.id)));
  });
  app.put('/api/uploads/:id',limiter('/api/uploads/:id', 20),(req,_res,next)=>{requireActor(req);next();},uploadAdmission(),express.raw({type:'application/octet-stream',limit:'12mb'}),async(req,res)=>{res.json(await acceptUpload(requireActor(req),String(req.params.id),req.body));});
  app.get('/api/files/:id',async(req,res)=>{
    const file=await uploadMetadata(requireActor(req),String(req.params.id),true);
    res.set('Content-Disposition',`${/^(image|audio|video)\//.test(file.mime)?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    await sendMedia(file,req,res);
  });
  app.get('/api/admin/session', async (req, res) => { res.json(await adminStatus(req)); });
  app.post('/api/admin/login', limiter('/api/admin/login', 10, 15 * 60000, {credentialAttempts:true}), async (req, res) => {
    const data = z.strictObject({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,40}$/), password: z.string().min(8).max(128) }).parse(req.body);
    res.json(await signInAdmin(req, res, data.username, data.password));
  });
  app.post('/api/admin/logout', async (req, res) => { await signOutAdmin(req, res); res.json({ ok: true }); });
  app.get('/api/admin/users', async (req,res)=>{await requireAdmin(req);res.json(await listAdminUsers(req.query));});
  app.get('/api/admin/starter-pool', async (req, res) => {
    await requireAdmin(req);
    res.json(await starterPoolStatus());
  });
  app.post('/api/admin/starter-pool', async (req, res) => {
    const owner = await requireAdmin(req);
    const { budgetDollars } = z.strictObject({ budgetDollars: z.number().min(0).max(100000).multipleOf(.01) }).parse(req.body);
    res.json(await setStarterBudget(owner.id, Math.round(budgetDollars * 1e9)));
  });
  app.post('/api/account/register', limiter('/api/account/register', 15, 15 * 60000, {credentialAttempts:true}), async (req, res) => {
    const actor = browserActor(req);
    const data = registrationCredentials.parse(req.body);
    const user = await currentUser(actor.userId);
    if (user.handle) throw new AppError(409, 'registered', 'Your account is already saved.');
    const encoded = await passwordHash(data.password);
    const saved = await registerAccount(user._id, data.handle, encoded, req.ip);
    await newSession(res, saved._id, req);
    await ensureIntroduction(saved._id);
    res.json({ user: profile(saved) });
  });
  app.post('/api/account/login', limiter('/api/account/login', 15, 15 * 60000, {credentialAttempts:true}), async (req, res) => {
    const data = credentials.parse(req.body);
    const user = await users().findOne({ handle: data.handle });
    if (!await checkPassword(data.password, user?.passwordHash)) throw new AppError(401, 'credentials', 'That handle and password did not match.');
    if(user!.suspendedAt)throw new AppError(403,'account_suspended','This account is suspended.');
    await newSession(res, user!._id, req, true);
    await ensureIntroduction(user!._id);
    res.json({ user: profile(user!) });
  });
  app.post('/api/account/username', limiter('/api/account/username', 10, 15 * 60000, {credentialAttempts:true}), async (req, res) => {
    const actor = browserActor(req), data = z.strictObject({ handle: availableHandle, currentPassword: z.string().min(1).max(128) }).parse(req.body);
    const user = await verifyAccountPassword(actor.userId, data.currentPassword); res.json({ user: profile(await changeUsername(user, data.handle)) });
  });
  app.post('/api/account/password', limiter('/api/account/password', 10, 15 * 60000, {credentialAttempts:true}), async (req, res) => {
    const actor = browserActor(req), data = z.strictObject({ password: credentials.shape.password, currentPassword: z.string().min(1).max(128) }).parse(req.body);
    const user = await verifyAccountPassword(actor.userId, data.currentPassword); await changeAccountPassword(user, data.password, req.cookies[config.SESSION_COOKIE]); res.json({ ok: true });
  });
  app.post('/api/account/clear-chat', limiter('/api/account/clear-chat', 5, 15 * 60000), async (req, res) => {
    const actor = browserActor(req); z.strictObject({ confirmed: z.literal(true) }).parse(req.body); await clearAgentChat(actor.userId); res.json({ ok: true });
  });
  app.post('/api/account/logout', async (req, res) => { browserActor(req); await logout(req, res); res.json({ ok: true }); });
  app.get('/api/catalog', (req, res) => {
    const actor = requireActor(req);
    res.json({ operations: operations.filter(o => operationAvailable(actor,o)).map(o => describeOperation(o.name)) });
  });
  app.post('/api/catalog/search', async (req, res) => { res.json(await searchOperations(searchSchema.parse(req.body), requireActor(req))); });
  app.post('/api/operations/:name', async (req, res) => {
    const actor = requireActor(req);
    const result = await executeOperation(String(req.params.name), req.body, actor, req.get('Idempotency-Key'), { confirmed: req.get('X-NewDrugs-Confirmed') === 'true' });
    res.json({ ok: true, data: result, links: buildResourceLinks(String(req.params.name), req.body, result, actor) });
  });
  app.post('/api/chat', limiter('/api/chat', 12), async (req, res) => {
    const actor = browserActor(req);
    if (!(await currentUser(actor.userId)).handle) throw new AppError(403, 'account_required', 'Create an account to use your agent.');
    const data = z.strictObject({ pageContext:pageContextCandidate.optional(), text: z.string().trim().max(6000), fileIds:z.array(z.uuid()).max(5).default([]), inboxIds: z.array(z.uuid()).max(3).default([]), recordRefs:z.array(recordReferenceSchema).max(3).default([]), requestId: z.uuid(), clientId: z.uuid(), timezone: z.string().max(100).default('America/New_York'), review: z.strictObject({ runId: z.string().max(200), revision: z.number().int().min(0) }).optional() }).refine(value=>value.text||value.fileIds.length||value.inboxIds.length||value.recordRefs.length,'Add a message or a file.').parse(req.body);
    if (!config.aiEnabled) throw new AppError(503, 'agent_unavailable', 'The agent is not connected yet. Please try again later.');
    try { new Intl.DateTimeFormat('en', { timeZone: data.timezone }).format(); } catch { throw new AppError(422, 'timezone', 'Unknown timezone.'); }
    if (data.review) { res.status(202).json({ run: runView(await replyToReview(actor.userId, data.review, data)) }); return; }
    const runId = `${actor.userId}:${data.requestId}`;
    await ensureStarter(actor.userId);
    res.status(202).json({ run: runView(await reserveRun(actor.userId, runId, data.text, { clientId: data.clientId, timezone: data.timezone, fileIds: data.fileIds, inboxIds: data.inboxIds, recordRefs:data.recordRefs,pageContext:data.pageContext })) });
  });
  app.get('/api/runs/:id', async (req, res) => { const actor = requireActor(req); res.json({ run: runView(requireValue(await runs().findOne({ _id: String(req.params.id), userId: actor.userId }))) }); });
  app.post('/api/runs/:id/decisions', async (req, res) => {
    const actor = browserActor(req);
    const data = z.strictObject({ revision: z.number().int(), decisions: z.array(z.strictObject({ id: z.string(), approved: z.boolean() })).min(1).max(50) }).parse(req.body);
    res.json(await decideApprovals(actor.userId, String(req.params.id), data.revision, data.decisions));
  });
  app.post('/api/runs/:id/surface', async (req, res) => {
    const actor = browserActor(req); const data = z.strictObject({ id: z.string(), saved: z.boolean(), fileIds:z.array(z.uuid()).max(5).default([]),resourceId:z.uuid().optional() }).parse(req.body);
    res.json(await completeSurface(actor.userId, String(req.params.id), data.id, data.saved, data.fileIds,data.resourceId));
  });
  app.post('/api/runs/:id/cancel', async (req, res) => { res.json(await cancelRun(browserActor(req).userId, String(req.params.id))); });
  app.get('/api/checkout/quotes', (req, res) => { requireActor(req); res.json({ quotes: [500,1000,2000].map(topupQuote) }); });
  app.post('/api/checkout', limiter('/api/checkout', 10), async (req, res) => {
    const actor = browserActor(req);
    const data = z.strictObject({ cents: z.union([z.literal(500), z.literal(1000), z.literal(2000)]), requestId: z.uuid() }).parse(req.body);
    res.json(await checkout(actor.userId, data.cents, data.requestId));
  });
  app.get('/api/tokens', async (req, res) => {
    const actor = browserActor(req);
    const tokens = await rows('tokens').find({ userId: actor.userId, revokedAt: null }, { projection: { hash: 0 } }).sort({ createdAt: -1 }).limit(20).toArray();
    res.json({ tokens: tokens.map(t => ({ id: t._id, name: t.name, scope: t.scope, createdAt: t.createdAt, expiresAt: t.expiresAt })) });
  });
  app.post('/api/tokens', limiter('/api/tokens', 10), async (req, res) => {
    const actor = browserActor(req);
    const data=agentAccessSchema.parse(req.body),{record,token}=await transaction(session=>insertAgentToken(actor.userId,data,session));
    res.json({ token, id: record._id, expiresAt: record.expiresAt });
  });
  app.get('/api/agent-login/device',limiter('/api/agent-login/view',30),async(req,res)=>{const actor=browserActor(req),code=z.string().max(32).parse(req.query.code);res.json(await readDeviceLogin(actor,code));});
  app.post('/api/agent-login/approve',limiter('/api/agent-login/decide',15),async(req,res)=>{const actor=browserActor(req),data=z.strictObject({userCode:z.string().max(32),access:agentAccessSchema}).parse(req.body);res.json(await decideDeviceLogin(actor,data.userCode,'approve',data.access));});
  app.post('/api/agent-login/deny',limiter('/api/agent-login/decide',15),async(req,res)=>{const actor=browserActor(req),data=z.strictObject({userCode:z.string().max(32)}).parse(req.body);res.json(await decideDeviceLogin(actor,data.userCode,'deny'));});
  app.delete('/api/tokens/:id', async (req, res) => {
    const actor = browserActor(req);
    await revokeAutomationCredential(actor.userId, String(req.params.id));
    res.json({ ok: true });
  });
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'not_found', 'Unknown endpoint.')));
  if (config.production) {
    app.use('/downloads', express.static(resolve('dist/downloads'), { index: false, setHeaders: res => { res.setHeader('Cache-Control', 'no-cache'); } }));
  }
  if (config.production && config.APP_ENV === 'production') {
    mountAdminFrontend(app);
    app.use(express.static(resolve('dist/web'), { index: false, setHeaders: (res, path) => { if (path.endsWith('/sw.js')) res.setHeader('Cache-Control', 'no-cache'); } }));
    const template=readFile(resolve('dist/web/index.html'),'utf8');
    app.get('/{*path}', async (req, res) => { const metadata=await pagePreview(req.originalUrl);res.set('Cache-Control','no-store');if(metadata.private)res.set('X-Robots-Tag','noindex, nofollow');res.type('html').send(renderPagePreview(await template,metadata,config.uiOrigin)); });
  }
  if (config.APP_ENV === 'staging') app.use((_req, res) => { res.status(404).set('Cache-Control', 'no-store').end(); });
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) { res.end(); return; }
    if (error instanceof ZodError) { res.status(422).json({ error: { code: 'validation', message: error.issues.map(i => i.message).join(' ') } }); return; }
    if (error instanceof AppError) { res.status(error.status).json({ error: { code: error.code, message: error.message } }); return; }
    if (error?.code === 11000) { res.status(409).json({ error: { code: 'conflict', message: 'That name or request is already in use. Please try again.' } }); return; }
    console.error('Request failed', { name: error?.name || 'Error' });
    res.status(500).json({ error: { code: 'internal', message: 'Something went wrong. Please try again.' } });
  };
  app.use(errorHandler);
  return app;
}
