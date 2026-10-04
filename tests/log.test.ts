import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {Collection} from 'mongodb';
import {randomUUID} from 'node:crypto';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {users,type Actor,type User} from '../server/auth';
import {config} from '../server/config';
import {executeOperation} from '../server/operations';
import {buildResourceLinks} from '../server/resourceLinks';
import {backgroundCanRead,operationAvailable} from '../server/backgroundAuthority';
import {notificationState} from '../server/notifications';
import {prepareUpload,acceptUpload,readUpload,deleteUpload} from '../server/uploads';
import {createHash} from 'node:crypto';
import {transaction} from '../server/db';
const actor=(userId='me'):Actor=>({userId,source:'external',scope:'write'});
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated database required');for(const collection of await db().collections())await collection.deleteMany({});}
beforeAll(async()=>{if(new URL(config.MONGODB_URI).pathname!=='/newdrugs_test')throw Error('Isolated database required');await connectDatabase();});
beforeEach(async()=>{await clean();const base:User={_id:'me',handle:'me',name:'Me',bio:'',city:'',cityKey:'',interests:[],discoverable:true,balanceNanos:1e9,reservedNanos:0,createdAt:new Date().toISOString()};await users().insertMany([base,{...base,_id:'friend',handle:'friend',name:'Friend'},{...base,_id:'stranger',handle:'stranger'},{...base,_id:'guest',handle:undefined}]);await rows('connections').insertOne({_id:'friend:me',members:['me','friend'],status:'accepted'});});
afterAll(async()=>{await clean();await mongo.close();});
const call=(name:string,input:unknown={},who='me',confirmed=false,key=randomUUID())=>executeOperation(name,input,actor(who),key,{confirmed}) as Promise<any>;
const create=(entry:Record<string,unknown>={},contribution:Record<string,unknown>={})=>call('log.create',{entry:{date:'2026-09-26',title:'Tennis',...entry},contribution:{note:'Played a game',...contribution}});
const change=(row:any)=>({entryId:row.id,revision:row.revision});
it('seeks occupied calendar days across large empty gaps with authorized oldest/newest ordering',async()=>{
 await create({date:'1980-01-02',title:'Earlier'});await create({date:'2026-09-29',title:'Current'});await create({date:'2040-06-10',title:'Nearest future'});await create({date:'2050-06-10',title:'Later future'});
 const previous=await call('log.list',{through:'2026-09-28',order:'newest',limit:1}),next=await call('log.list',{from:'2026-09-30',order:'oldest',limit:1});
 expect(previous.items.map((entry:any)=>entry.date)).toEqual(['1980-01-02']);expect(next.items.map((entry:any)=>entry.date)).toEqual(['2040-06-10']);expect((await call('log.list',{from:'2026-09-30',order:'oldest',limit:1},'stranger')).items).toEqual([]);
});
it('binds oldest-first pagination to its ordering and preserves compatible newest-first cursors',async()=>{
 await create({date:'2026-09-25',title:'First'});await create({date:'2026-09-26',title:'Second'});await create({date:'2026-09-27',title:'Third'});
 const oldest=await call('log.list',{order:'oldest',limit:1});expect(oldest.items[0].title).toBe('First');expect((await call('log.list',{order:'oldest',limit:1,before:oldest.nextCursor})).items[0].title).toBe('Second');await expect(call('log.list',{limit:1,before:oldest.nextCursor})).rejects.toMatchObject({code:'log_cursor'});
 const newest=await call('log.list',{limit:1});expect((await call('log.list',{order:'newest',limit:1,before:newest.nextCursor})).items[0].title).toBe('Second');
});
it('opens a date-specific Log chooser through the shared agent navigation operation',async()=>{
 const input={view:'log',date:'2026-09-29'},result=await call('app.open',input);expect(result).toMatchObject({open:'log',date:input.date});expect(buildResourceLinks('app.open',input,result,actor())[0].url).toBe('https://dev.druggie.org/log?date=2026-09-29');
 await expect(call('app.open',input,'guest')).rejects.toMatchObject({status:403});
});
it('keeps private entries out of strangers, guests and public discovery with exact authorized links',async()=>{const entry=await create();expect((await call('log.list')).items).toHaveLength(1);expect((await call('log.list',{},'stranger')).items).toEqual([]);await expect(call('log.get',{entryId:entry.id},'stranger')).rejects.toMatchObject({status:404});await expect(call('app.open',{view:'log',resourceId:entry.id},'stranger')).rejects.toMatchObject({status:404});await expect(call('log.list',{},'guest')).rejects.toMatchObject({status:403});expect(await rows('searchDocuments').countDocuments()).toBe(0);expect(buildResourceLinks('log.get',{},entry,actor())[0]).toMatchObject({targetKind:'exact',resourceType:'log_entry',url:`https://dev.druggie.org/log/${entry.id}`});});
it('directly adds accepted friends after review and isolates personal contributions',async()=>{let row=await create();await expect(call('log.add_person',{...change(row),personId:'friend'})).rejects.toMatchObject({code:'confirmation_required'});await expect(call('log.add_person',{...change(row),personId:'stranger'},'me',true)).rejects.toMatchObject({code:'log_contact'});row=await call('log.add_person',{...change(row),personId:'friend'},'me',true);expect((await call('log.get',{entryId:row.id},'friend')).membership).toBe('member');expect((await notificationState('friend')).items[0]).toMatchObject({kind:'log_added',title:'@me added you to Tennis'});row=await call('log.contribute',{...change(row),contribution:{note:'My own memory'}},'friend');expect(row.contributors.find((p:any)=>p.userId==='me').note).toBe('Played a game');expect(row.contributors.find((p:any)=>p.userId==='friend').note).toBe('My own memory');expect(await rows('connections').countDocuments()).toBe(1);});
it('rejects stale revisions and retries the same receipt without duplicating a write',async()=>{const key=randomUUID(),input={entry:{date:'2026-09-26'},contribution:{note:'Private'}};const first=await call('log.create',input,'me',false,key),retry=await call('log.create',input,'me',false,key);expect(retry).toEqual(first);expect(await rows('logEntries').countDocuments()).toBe(1);await call('log.contribute',{...change(first),contribution:{note:'changed'}});await expect(call('log.update',{...change(first),entry:{date:'2026-09-27'}})).rejects.toMatchObject({code:'log_changed'});});
it('lets the creator leave without removing other people and deletes only the last contribution',async()=>{let row=await create();row=await call('log.add_person',{...change(row),personId:'friend'},'me',true);row=await call('log.contribute',{...change(row),contribution:{note:'Keep this'}},'friend');await call('log.delete',change(row),'me',true);await expect(call('log.get',{entryId:row.id})).rejects.toMatchObject({status:404});row=await call('log.get',{entryId:row.id},'friend');expect(row.contributors).toHaveLength(1);expect(row.contributors[0].note).toBe('Keep this');await call('log.leave',change(row),'friend',true);expect((await call('log.list',{},'friend')).items).toEqual([]);expect((await rows('logEntries').findOne({_id:row.id}))?.deletedAt).toBeTruthy();});
it('blocks shared entry access and invitations across blocked members',async()=>{let row=await create();row=await call('log.add_person',{...change(row),personId:'friend'},'me',true);await rows('blocks').insertOne({_id:'pair',members:['me','friend'],pairId:'friend:me'});expect((await call('log.list')).items).toEqual([]);await expect(call('log.get',{entryId:row.id},'friend')).rejects.toMatchObject({status:404});});
it('filters the complete dataset and binds stable pagination to the viewer and filters',async()=>{await create({date:'2026-09-25',title:'Walk'},{note:'A good park day'});await create({title:'Tennis'},{note:'A rainy game'});await create({date:'2026-09-27',title:'Park picnic'},{note:'Sandwiches'});expect((await call('log.list',{query:'park -rainy'})).items).toHaveLength(2);expect((await call('log.list',{query:'"good park" | tennis'})).items).toHaveLength(2);expect((await call('log.list',{query:'.*'})).items).toHaveLength(0);const page=await call('log.list',{limit:1});const next=await call('log.list',{limit:1,before:page.nextCursor});expect(next.items[0].date).toBe('2026-09-26');await expect(call('log.list',{limit:1,before:page.nextCursor,query:'different'})).rejects.toMatchObject({code:'log_cursor'});await expect(call('log.list',{before:page.nextCursor},'stranger')).rejects.toMatchObject({code:'log_cursor'});expect((await call('log.list',{from:'2026-09-26',through:'2026-09-26'})).items).toHaveLength(1);});
it('exports authorized human text and saves owner-specific views across reads',async()=>{await create();const result=await call('log.export');expect(result.text).toContain('Played a game');expect((await call('log.export',{},'stranger')).text).toBe('');const preferences={arrangement:'gallery',todayPresentation:'right',views:[{id:randomUUID(),name:'Tennis',query:'tennis',scope:'all'}]};await call('log.preferences_update',preferences);expect(await call('log.preferences')).toEqual(preferences);expect((await call('log.preferences',{},'stranger')).views).toEqual([]);});
it('uses private and write access for background Log operations',()=>{const background={...actor(),background:true,privateAccess:false};expect(backgroundCanRead(background,'log.list')).toBe(false);expect(backgroundCanRead({...background,privateAccess:true},'log.list')).toBe(true);expect(operationAvailable(background,{name:'log.create',kind:'write',agent:true})).toBe(false);expect(operationAvailable({...background,privateAccess:true},{name:'log.create',kind:'write',agent:true})).toBe(true);});
it('retains verified audio within quota, serves it only to authorized members, and revokes on leave/delete',async()=>{const bytes=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WAVE'),Buffer.alloc(32)]);let upload:any;await transaction(async session=>{upload=await prepareUpload({name:'Memory.wav',purpose:'log_media',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},actor(),session);});await acceptUpload(actor(),upload.id,bytes);let row=await create({}, {fileIds:[upload.id]});expect(row.contributors[0].files[0].mime).toBe('audio/wav');await expect(readUpload(actor('friend'),upload.id,true)).rejects.toMatchObject({status:404});row=await call('log.add_person',{...change(row),personId:'friend'},'me',true);expect((await readUpload(actor('friend'),upload.id,true)).bytes).toEqual(bytes);await call('log.leave',change(row),'friend',true);await expect(readUpload(actor('friend'),upload.id,true)).rejects.toMatchObject({status:404});await transaction(async session=>deleteUpload(actor(),upload.id,session));row=await call('log.get',{entryId:row.id});expect(row.contributors[0].files).toEqual([]);expect((await users().findOne({_id:'me'}))?.storageBytes).toBe(0);});
it('cannot attach someone else’s files or select a foreign cover',async()=>{await expect(create({coverFileId:randomUUID()})).rejects.toMatchObject({code:'log_cover'});await expect(create({}, {fileIds:[randomUUID()]})).rejects.toMatchObject({status:404});});
it('resolves adjacent entries and filters by current participants without showing foreign diaries',async()=>{const first=await create({date:'2026-09-24'});let middle=await create({date:'2026-09-25'});const last=await create({date:'2026-09-26'});middle=await call('log.add_person',{...change(middle),personId:'friend'},'me',true);const adjacent=await call('log.neighbors',{entryId:middle.id});expect(adjacent.previous.id).toBe(first.id);expect(adjacent.next.id).toBe(last.id);expect((await call('log.neighbors',{entryId:middle.id},'friend')).previous).toBeNull();expect((await call('log.people')).items.map((p:any)=>p.userId).sort()).toEqual(['friend','me']);expect((await call('log.people',{},'stranger')).items).toEqual([]);expect((await call('log.list',{personId:'friend'})).items.map((e:any)=>e.id)).toEqual([middle.id]);});
it('keeps Older and Newer inside the active calendar filters',async()=>{
 let older=await create({date:'2026-09-23',title:'Garden'}),current=await create({date:'2026-09-25',title:'Garden'}),newer=await create({date:'2026-09-27',title:'Garden'});
 await create({date:'2026-09-24',title:'Other'});await create({date:'2026-09-26',title:'Other'});
 for(const row of [older,current,newer]){const shared=await call('log.add_person',{...change(row),personId:'friend'},'me',true);if(row.id===older.id)older=shared;if(row.id===current.id)current=shared;if(row.id===newer.id)newer=shared;}
 const filtered=await call('log.neighbors',{entryId:current.id,scope:'shared',query:'garden',personId:'friend'});
 expect(filtered.previous.id).toBe(older.id);expect(filtered.next.id).toBe(newer.id);
 expect((await call('log.neighbors',{entryId:current.id})).previous.title).toBe('Other');
});
it('allows leaving or deleting your own blocked collaboration without exposing its content',async()=>{let row=await create();row=await call('log.add_person',{...change(row),personId:'friend'},'me',true);await rows('blocks').insertOne({_id:'pair',members:['me','friend'],pairId:'friend:me'});await call('log.leave',change(row),'friend',true);row=await call('log.get',{entryId:row.id});await call('log.delete',change(row),'me',true);const stored=await rows('logEntries').findOne({_id:row.id});expect(stored?.contributions).toEqual([]);expect(stored?.title).toBe('');});
it('passes a verified saved entry back to a waiting hosted task, instead of returning unrelated profile data',async()=>{const {completeSurface}=await import('../server/agent');const row=await create(),runId=randomUUID(),surfaceId=randomUUID();await rows('runs').insertOne({_id:runId,userId:'me',status:'waiting_for_input',revision:1,fileIds:[],surface:{id:surfaceId,view:'log_compose',waiting:true},approvals:[{id:surfaceId,kind:'input',status:'pending'}]});await expect(completeSurface('me',runId,surfaceId,true,[],randomUUID())).rejects.toMatchObject({status:404});await completeSurface('me',runId,surfaceId,true,[],row.id);const run=await rows('runs').findOne({_id:runId});expect(run?.status).toBe('queued');expect((run?.approvals as any[])[0].result.entry.id).toBe(row.id);expect((run?.approvals as any[])[0].result.profile).toBeUndefined();});
it('accepts a newly attached photo as the cover in the same atomic edit, and reads it as verified Log context',async()=>{const sharp=(await import('sharp')).default;const {fileInput}=await import('../server/uploads');const {resolveRecordContexts}=await import('../server/recordContext');const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#4477aa'}}).png().toBuffer();let upload:any;await transaction(async session=>{upload=await prepareUpload({name:'Moment.png',purpose:'log_media',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},actor(),session);});await acceptUpload(actor(),upload.id,bytes);const initial=await create();const row=await call('log.update',{...change(initial),entry:{date:initial.date,coverFileId:upload.id},contribution:{note:'A picture',fileIds:[upload.id]}});expect(row.coverFileId).toBe(upload.id);expect((await fileInput('me',upload.id,0,row.id))[1].type).toBe('input_image');await expect(fileInput('me',upload.id,0,randomUUID())).rejects.toMatchObject({status:404});const context=await resolveRecordContexts('me',[{kind:'log',id:row.id}],true);expect(context.attachments[0].kind).toBe('log');expect(context.content.some(item=>item.type==='input_image')).toBe(true);await expect(resolveRecordContexts('stranger',[{kind:'log',id:row.id}],true)).rejects.toMatchObject({status:404});});
it('caps list snippets without truncating full entry reads or exports',async()=>{const note='A private memory. '.repeat(90);const row=await create({}, {note});const list=await call('log.list');expect(list.items[0].contributors[0].note).toHaveLength(500);expect(list.items[0].contributors[0].noteTruncated).toBe(true);expect((await call('log.get',{entryId:row.id})).contributors[0].note).toBe(note);expect((await call('log.export')).items[0].contributors[0].note).toBe(note);});
it('revalidates Log source links in inbox deliveries after access is withdrawn',async()=>{const {validateInboxLinks}=await import('../server/inbox');let row=await create();row=await call('log.add_person',{...change(row),personId:'friend'},'me',true);const links=[{title:'Memory',url:`https://dev.druggie.org/log/${row.id}`}];await validateInboxLinks('friend',links);await call('log.leave',change(row),'friend',true);await expect(validateInboxLinks('friend',links)).rejects.toMatchObject({status:404});});
it('keeps old pending invitations joinable without creating new invitation flows',async()=>{const row=await create();await rows('logEntries').updateOne({_id:row.id},{$set:{invited:['friend']}});const joined=await call('log.join',{entryId:row.id},'friend',true);expect(joined.membership).toBe('member');await expect(call('log.join',{entryId:row.id},'stranger',true)).rejects.toMatchObject({status:404});});
it('makes co-attendees reusable Log contacts without creating a DM friendship',async()=>{await users().updateOne({_id:'stranger'},{$set:{discoverable:false,photos:[randomUUID()]}});await rows('connections').insertOne({_id:'me:stranger',members:['me','stranger'],status:'accepted'});let row=await create();row=await call('log.add_person',{...change(row),personId:'friend'},'me',true);row=await call('log.add_person',{...change(row),personId:'stranger'},'me',true);const viewed=await call('log.get',{entryId:row.id},'friend');expect(viewed.contributors.find((p:any)=>p.userId==='stranger')).toMatchObject({profileVisible:true});expect((await call('people.get',{personId:'stranger'},'friend')).id).toBe('stranger');expect((await call('log.contacts',{},'friend')).items.map((p:any)=>p.id)).toContain('stranger');expect(await rows('connections').countDocuments({members:{$all:['friend','stranger']}})).toBe(0);});
it('delivers private hangout-added notifications and suppresses them after leaving',async()=>{const {pushStillRelevant,deliverPush}=await import('../server/push');let row=await create();row=await call('log.add_person',{...change(row),personId:'friend'},'me',true);const event={userId:'friend',actorId:'me',connectionId:row.id,kind:'log_added',eventId:String(row.revision)};expect(await pushStillRelevant(event)).toBe(true);await rows('pushOutbox').insertOne({_id:'fixture-log-push',...event,status:'pending',availableAt:0,attempts:0,delivered:[],expiresAt:new Date(Date.now()+60000)});await rows('sessions').insertOne({_id:'fixture-push-session',userId:'friend',expiresAt:new Date(Date.now()+60000)});await rows('pushSubscriptions').insertOne({_id:'fixture-device',deviceId:randomUUID(),userId:'friend',sessionId:'fixture-push-session',revokedAt:null,endpoint:'https://fcm.googleapis.com/fixture',keys:{}});const publicKey=config.VAPID_PUBLIC_KEY,privateKey=config.VAPID_PRIVATE_KEY,packets:string[]=[];try{config.VAPID_PUBLIC_KEY='fixture';config.VAPID_PRIVATE_KEY='fixture';await deliverPush((async(_subscription:any,payload:any)=>{packets.push(String(payload));return {statusCode:201};}) as any);}finally{config.VAPID_PUBLIC_KEY=publicKey;config.VAPID_PRIVATE_KEY=privateKey;}expect(packets).toHaveLength(1);expect(JSON.parse(packets[0])).toMatchObject({body:'@me added you to Tennis',url:`/log/${row.id}`});expect(packets[0]).not.toContain('Played a game');await call('log.leave',change(row),'friend',true);expect(await pushStillRelevant(event)).toBe(false);});
it('preserves the photo and voice-note order independently of database insertion and ID order',async()=>{const first='ffffffff-ffff-4fff-8fff-ffffffffffff',second='00000000-0000-4000-8000-000000000001';for(const [id,mime] of [[second,'audio/wav'],[first,'image/webp']])await rows('uploads').insertOne({_id:id,userId:'me',name:id,purpose:'log_media',ready:true,mime,bytes:10,sha256:'fixture',createdAt:new Date().toISOString()});const row=await create({}, {fileIds:[first,second]});expect(row.contributors[0].files.map((file:any)=>file.id)).toEqual([first,second]);});
it('limits each attendee to one visual attachment and one voice note across create and edits',async()=>{
 const photoA=randomUUID(),photoB=randomUUID(),voiceA=randomUUID(),voiceB=randomUUID();
 await rows('uploads').insertMany([...[photoA,photoB].map(id=>({_id:id,userId:'me',name:id,purpose:'log_media',ready:true,mime:'image/webp',bytes:10,sha256:'fixture'})),...[voiceA,voiceB].map(id=>({_id:id,userId:'me',name:id,purpose:'log_media',ready:true,mime:'audio/wav',bytes:10,sha256:'fixture'}))]);
 await expect(create({}, {fileIds:[photoA,photoB]})).rejects.toMatchObject({code:'log_image_limit'});
 await expect(create({}, {fileIds:[voiceA,voiceB]})).rejects.toMatchObject({code:'log_voice_limit'});
 let row=await create({}, {fileIds:[photoA,voiceA]});expect(row.contributors[0].files.map((file:any)=>file.id)).toEqual([photoA,voiceA]);
 await expect(call('log.update',{...change(row),entry:{date:row.date},contribution:{note:'Edit',fileIds:[photoA,photoB]}})).rejects.toMatchObject({code:'log_image_limit'});
 await expect(call('log.contribute',{...change(row),contribution:{note:'Edit',fileIds:[photoA,photoB]}})).rejects.toMatchObject({code:'log_image_limit'});
 row=await call('log.contribute',{...change(row),contribution:{note:'Edit',fileIds:[photoB,voiceA]}});expect(row.contributors[0].files.map((file:any)=>file.id)).toEqual([photoB,voiceA]);
});
it('uses the explicit cover, otherwise the earliest photo with event user order as the timestamp fallback',async()=>{
 const mine=randomUUID(),theirs=randomUUID();
 await rows('uploads').insertMany([
  {_id:mine,userId:'me',name:'mine.webp',purpose:'log_media',ready:true,mime:'image/webp',bytes:10,sha256:'fixture',createdAt:'2026-09-29T12:00:00.000Z'},
  {_id:theirs,userId:'friend',name:'theirs.webp',purpose:'log_media',ready:true,mime:'image/webp',bytes:10,sha256:'fixture',createdAt:'2026-09-29T09:00:00.000Z'},
 ]);
 let row=await create({}, {fileIds:[mine]});row=await call('log.add_person',{...change(row),personId:'friend'},'me',true);row=await call('log.contribute',{...change(row),contribution:{fileIds:[theirs]}},'friend');
 expect(row.cover.id).toBe(theirs);expect(row.contributors.map((person:any)=>person.userId)).toEqual(['me','friend']);
 const calendar=async()=>call('log.calendar',{from:row.date,through:row.date,today:row.date,scope:'all'});
 expect((await calendar()).days[0].items[0].cover.id).toBe(theirs);
 row=await call('log.update',{...change(row),entry:{date:row.date,coverFileId:mine}});expect(row.cover.id).toBe(mine);
 row=await call('log.update',{...change(row),entry:{date:row.date,coverFileId:null}});await rows('uploads').updateMany({_id:{$in:[mine,theirs]}},{$unset:{createdAt:''}});row=await call('log.get',{entryId:row.id});
 expect(row.cover.id).toBe(mine);expect((await calendar()).days[0].items[0].cover.id).toBe(mine);
});
it('orders same-day entries by creation time across pages and adjacent navigation',async()=>{const first=await create({title:'First'}),second=await create({title:'Second'}),third=await create({title:'Third'});for(const [row,time] of [[first,'01'],[second,'02'],[third,'03']] as const)await rows('logEntries').updateOne({_id:row.id},{$set:{createdAt:`2026-09-26T${time}:00:00.000Z`}});const page=await call('log.list',{limit:1});expect(page.items[0].id).toBe(third.id);const next=await call('log.list',{limit:1,before:page.nextCursor});expect(next.items[0].id).toBe(second.id);const last=await call('log.list',{limit:1,before:next.nextCursor});expect(last.items[0].id).toBe(first.id);const adjacent=await call('log.neighbors',{entryId:second.id});expect(adjacent.previous.id).toBe(first.id);expect(adjacent.next.id).toBe(third.id);});

it('shows full code previews to non-friends without joining and supports code rotation by any attendee',async()=>{const row=await create();const code=await call('log.code',{entryId:row.id});const preview=await call('log.join_preview',{code:code.code},'stranger');expect(preview).toMatchObject({entryId:row.id,title:'Tennis',joined:false});expect(preview.contributors).toEqual([expect.objectContaining({userId:'me',note:'Played a game'})]);expect((await rows('logEntries').findOne({_id:row.id}))?.members).toEqual(['me']);await expect(call('log.join',{code:code.code},'stranger')).rejects.toMatchObject({code:'confirmation_required'});const joined=await call('log.join',{code:code.code},'stranger',true);expect(joined.membership).toBe('member');expect(joined.contributors).toHaveLength(2);const again=await call('log.join',{code:code.code},'stranger',true);expect(again.revision).toBe(joined.revision);expect(await rows('connections').countDocuments()).toBe(1);expect((await call('log.contacts',{},'stranger')).items[0]).toMatchObject({id:'me',sharedHangouts:1,friend:false});const rotated=await call('log.code',{entryId:row.id,reset:true},'stranger');expect(rotated.code).not.toBe(code.code);await expect(call('log.join_preview',{code:code.code},'friend')).rejects.toMatchObject({status:404});expect((await call('log.join_preview',{code:rotated.code},'friend')).title).toBe('Tennis');});
it('allows a previous co-attendee to be added directly on a later hangout',async()=>{let first=await create();const code=await call('log.code',{entryId:first.id});await call('log.join',{code:code.code},'stranger',true);let second=await create({title:'Again'});second=await call('log.add_person',{...change(second),personId:'stranger'},'me',true);expect(second.contributors.map((p:any)=>p.userId)).toContain('stranger');expect((await call('log.contacts',{},'me')).items.find((p:any)=>p.id==='stranger').sharedHangouts).toBe(2);await expect(call('log.join',{entryId:second.id,code:code.code},'friend',true)).rejects.toMatchObject({code:'log_code'});});
it('serializes concurrent code joins and blocks code access across blocked people',async()=>{const row=await create(),code=await call('log.code',{entryId:row.id});await Promise.all([call('log.join',{code:code.code},'stranger',true),call('log.join',{code:code.code},'friend',true)]);expect((await call('log.get',{entryId:row.id})).contributors).toHaveLength(3);await rows('blocks').insertOne({_id:'blocked',members:['me','stranger'],pairId:'me:stranger'});await expect(call('log.join_preview',{code:code.code},'stranger')).rejects.toMatchObject({status:404});expect((await call('log.contacts',{},'me')).items.map((p:any)=>p.id)).not.toContain('stranger');});
it('includes accepted friends in private background Log contacts',async()=>{const background={...actor(),background:true,privateAccess:true};expect(backgroundCanRead(background,'log.contacts')).toBe(true);const {logOperation}=await import('../server/log');expect((await logOperation('log.contacts',{},background) as any).items.map((person:any)=>person.id)).toContain('friend');});

it('stores current page context per message and reauthorizes it before model input',async()=>{const {reserveRun}=await import('../server/wallet');const {messageInput}=await import('../server/sessionContext');const row=await create(),context={route:`/log/${row.id}`},id=`me:${randomUUID()}`;const run=await reserveRun('me',id,'what is this?',{clientId:'fixture',timezone:'UTC',fileIds:[],pageContext:context});expect(run.pageContext).toMatchObject({resourceType:'log',resourceId:row.id});expect(JSON.stringify(await messageInput(run))).toContain(context.route);expect((await reserveRun('me',id,'what is this?',{clientId:'fixture',timezone:'UTC',fileIds:[],pageContext:context}))._id).toBe(id);await expect(reserveRun('me',id,'what is this?',{clientId:'fixture',timezone:'UTC',fileIds:[],pageContext:{route:'/log'}})).rejects.toMatchObject({code:'submission_conflict'});await call('log.leave',change(row),'me',true);expect(JSON.stringify(await messageInput(run))).not.toContain(context.route);});

it('shares birthday month/day only with accepted friends, never mere co-attendees, respecting blocks and removal',async()=>{
 await call('log.birthday_update',{birthday:{month:2,day:29}});expect(await call('log.birthday_get')).toEqual({birthday:{month:2,day:29}});
 expect((await call('log.birthdays',{},'friend')).items).toContainEqual({personId:'me',name:'Me',handle:'me',month:2,day:29});expect((await call('log.birthdays',{},'stranger')).items).toEqual([]);
 let row=await create();const code=await call('log.code',{entryId:row.id});await call('log.join',{code:code.code},'stranger',true);expect((await call('log.birthdays',{},'stranger')).items).toEqual([]);
 await rows('blocks').insertOne({_id:'birthday-block',members:['me','friend'],pairId:'friend:me'});expect((await call('log.birthdays',{},'stranger')).items).toEqual([]);
 expect((await call('log.birthdays',{},'friend')).items).toEqual([]);await call('log.birthday_update',{birthday:null});expect((await call('log.birthday_get')).birthday).toBeNull();expect((await call('log.birthdays',{},'friend')).items).toEqual([]);await expect(call('log.birthday_update',{birthday:{month:2,day:30}})).rejects.toBeTruthy();
});

it('persists account preferences privately, preserves unrelated settings, and projects them live',async()=>{const {readLiveState}=await import('../server/liveState');expect(await call('account.preferences')).toEqual({font:'mono',appearance:'light',landingPage:'agent',revision:0});expect(await call('account.preferences_update',{appearance:'dark'})).toEqual({font:'mono',appearance:'dark',landingPage:'agent',revision:1});expect(await call('account.preferences_update',{landingPage:'log'})).toEqual({font:'mono',appearance:'dark',landingPage:'log',revision:2});expect((await readLiveState('me',['preferences'])).preferences).toEqual({font:'mono',appearance:'dark',landingPage:'log',revision:2});expect(await call('account.preferences',{},'friend')).toEqual({font:'mono',appearance:'light',landingPage:'agent',revision:0});expect((await call('people.get',{personId:'me'},'friend')).preferences).toBeUndefined();await expect(call('account.preferences_update',{})).rejects.toMatchObject({code:'preferences'});await expect(call('account.preferences_update',{landingPage:'unknown'})).rejects.toBeTruthy();});

async function testAudio(who='me'){
 const bytes=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WAVE'),Buffer.alloc(32)]);let upload:any;
 await transaction(async session=>{upload=await prepareUpload({name:'Memory.wav',purpose:'log_media',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},actor(who),session);});
 await acceptUpload(actor(who),upload.id,bytes);return upload.id as string;
}
async function testImage(who='me'){
 const sharp=(await import('sharp')).default;
 const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#4477aa'}}).png().toBuffer();let upload:any;
 await transaction(async session=>{upload=await prepareUpload({name:'Memory.png',purpose:'log_media',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},actor(who),session);});
 await acceptUpload(actor(who),upload.id,bytes);return upload.id as string;
}
it('patches Log fields independently and deletes only attachments explicitly replaced or cleared',async()=>{
 const firstImage=await testImage(),secondImage=await testImage(),firstVoice=await testAudio(),secondVoice=await testAudio();
 let row=await create({place:'Court',links:['https://example.com/path'],recurrence:'anniversary'},{note:'Original note',fileIds:[firstImage,firstVoice]});
 row=await call('log.update',{...change(row),entry:{title:'Evening tennis',coverFileId:firstImage}});
 expect(row).toMatchObject({title:'Evening tennis',place:'Court',links:['https://example.com/path'],recurrence:'anniversary',coverFileId:firstImage});
 row=await call('log.contribute',{...change(row),contribution:{note:'Edited note'}});
 expect(row.contributors[0]).toMatchObject({note:'Edited note'});
 expect(row.contributors[0].files.map((file:any)=>file.id)).toEqual([firstImage,firstVoice]);
 expect((await readUpload(actor(),firstImage)).file.ready).toBe(true);
 row=await call('log.update',{...change(row),contribution:{imageFileId:secondImage}});
 expect(row.contributors[0].note).toBe('Edited note');expect(row.contributors[0].files.map((file:any)=>file.id)).toEqual([secondImage,firstVoice]);expect(row.coverFileId).toBeNull();
 await expect(readUpload(actor(),firstImage)).rejects.toMatchObject({status:404});expect((await readUpload(actor(),firstVoice)).file.ready).toBe(true);
 row=await call('log.contribute',{...change(row),contribution:{voiceFileId:secondVoice}});
 expect(row.contributors[0].files.map((file:any)=>file.id)).toEqual([secondImage,secondVoice]);await expect(readUpload(actor(),firstVoice)).rejects.toMatchObject({status:404});
 row=await call('log.contribute',{...change(row),contribution:{imageFileId:null}});
 expect(row.contributors[0].files.map((file:any)=>file.id)).toEqual([secondVoice]);expect(row.contributors[0].note).toBe('Edited note');
 await expect(readUpload(actor(),secondImage)).rejects.toMatchObject({status:404});
 row=await call('log.update',{...change(row),entry:{title:'',place:'',links:[],recurrence:'none'},contribution:{note:'',voiceFileId:null}});
 expect(row).toMatchObject({title:'',place:'',links:[],recurrence:'none'});expect(row.contributors[0]).toMatchObject({note:'',files:[]});
 await expect(readUpload(actor(),secondVoice)).rejects.toMatchObject({status:404});
});
it('rejects ambiguous or stale Log patches without changing another field or attendee',async()=>{
 const image=await testImage(),voice=await testAudio(),otherImage=await testImage('friend');
 let row=await create({}, {note:'Keep this',fileIds:[image,voice]});
 row=await call('log.add_person',{...change(row),personId:'friend'},'me',true);
 row=await call('log.contribute',{...change(row),contribution:{imageFileId:otherImage}},'friend');
 const originalRevision=row.revision;
 await expect(call('log.contribute',{entryId:row.id,revision:originalRevision-1,contribution:{note:'Stale'}})).rejects.toMatchObject({code:'log_changed'});
 await expect(call('log.contribute',{...change(row),contribution:{imageFileId:voice}})).rejects.toMatchObject({code:'log_image'});
 await expect(call('log.contribute',{...change(row),contribution:{voiceFileId:image}})).rejects.toMatchObject({code:'log_voice'});
 await expect(call('log.contribute',{...change(row),contribution:{fileIds:[],imageFileId:null}})).rejects.toMatchObject({code:'log_patch'});
 await expect(call('log.update',{...change(row),entry:{},contribution:{}})).rejects.toMatchObject({code:'log_patch'});
 await expect(call('log.contribute',{...change(row),contribution:{}})).rejects.toMatchObject({code:'log_patch'});
 expect((await call('log.get',{entryId:row.id})).revision).toBe(originalRevision);
 row=await call('log.contribute',{...change(row),contribution:{fileIds:[]}});
 expect(row.contributors.find((person:any)=>person.userId==='me')).toMatchObject({note:'Keep this',files:[]});
 expect(row.contributors.find((person:any)=>person.userId==='friend').files.map((file:any)=>file.id)).toEqual([otherImage]);
});
it('deletes only the leaving attendee’s attached media, frees quota, and retries safely',async()=>{
 const mine=await testAudio(),theirs=await testAudio('friend');let row=await create({}, {fileIds:[mine]});
 row=await call('log.add_person',{...change(row),personId:'friend'},'me',true);
 row=await call('log.contribute',{...change(row),contribution:{note:'Mine',fileIds:[theirs]}},'friend');
 const input=change(row),key=randomUUID();await call('log.leave',input,'me',true,key);await call('log.leave',input,'me',true,key);
 expect((await users().findOne({_id:'me'}))?.storageBytes).toBe(0);
 await expect(readUpload(actor(),mine,true)).rejects.toMatchObject({status:404});
 expect((await readUpload(actor('friend'),theirs,true)).file.ready).toBe(true);
 expect((await call('log.get',{entryId:row.id},'friend')).contributors[0].files.map((f:any)=>f.id)).toEqual([theirs]);
 const {access}=await import('node:fs/promises');const {resolve}=await import('node:path');
 await expect(access(resolve(config.DATA_DIR,'files',mine))).rejects.toMatchObject({code:'ENOENT'});
 row=await call('log.get',{entryId:row.id},'friend');await call('log.delete',change(row),'friend',true);
 expect((await users().findOne({_id:'friend'}))?.storageBytes).toBe(0);
});
it('owns each media file in one entry and deletes detached files only on successful save',async()=>{
 const id=await testAudio();let row=await create({}, {fileIds:[id]});
 await expect(create({}, {fileIds:[id]})).rejects.toMatchObject({code:'log_file_owned'});
 row=await call('log.contribute',{...change(row),contribution:{note:'Still here',fileIds:[id]}});
 await expect(call('log.contribute',{entryId:row.id,revision:1,contribution:{fileIds:[]}})).rejects.toMatchObject({code:'log_changed'});
 expect((await readUpload(actor(),id)).file.ready).toBe(true);
 const saved=await call('log.update',{...change(row),entry:{date:row.date},contribution:{note:'Keep note',fileIds:[]}});
 expect(saved.contributors[0].files).toEqual([]);expect(saved.revision).toBe(row.revision+1);
 expect((await users().findOne({_id:'me'}))?.storageBytes).toBe(0);
 await expect(readUpload(actor(),id)).rejects.toMatchObject({status:404});
});
it('prevents a chat image from being shared between Log and posts in either direction',async()=>{
 const sharp=(await import('sharp')).default;
 const make=async()=>{const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#123456'}}).png().toBuffer();let upload:any;await transaction(async session=>{upload=await prepareUpload({name:'photo.png',purpose:'agent_input',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},actor(),session);});await acceptUpload(actor(),upload.id,bytes);return upload.id as string;};
 const first=await make(),second=await make();const row=await create({}, {fileIds:[first]});
 const {retainPostPhotos}=await import('../server/uploads');
 await expect(transaction(session=>retainPostPhotos('me',[first],session))).rejects.toMatchObject({code:'log_file_owned'});
 await rows('posts').insertOne({_id:'fixture',userId:'me',fileIds:[second]});
 await expect(create({}, {fileIds:[second]})).rejects.toMatchObject({code:'log_file_owned'});
 await call('log.leave',change(row),'me',true);await transaction(session=>deleteUpload(actor(),second,session));
});
it('saves font choice without replacing theme or landing page',async()=>{
 await call('account.preferences_update',{appearance:'dark',landingPage:'log'});
 expect(await call('account.preferences_update',{font:'serif'})).toEqual({font:'serif',appearance:'dark',landingPage:'log',revision:2});
 await expect(call('account.preferences_update',{font:'unknown'})).rejects.toBeTruthy();
});
it('exposes historical names only to attendees and preserves private original Logcal IDs through edits',async()=>{
 let row=await create();await rows('logEntries').updateOne({_id:row.id},{$set:{historicalPeople:['Old friend'],migration:{source:'logcal.app',sourceId:'original-hangout',historicalPeople:[{sourceId:'original-person',name:'Old friend'}]}}});
 row=await call('log.get',{entryId:row.id});expect(row.historicalPeople).toEqual(['Old friend']);expect(row.migration).toBeUndefined();await expect(call('log.get',{entryId:row.id},'stranger')).rejects.toMatchObject({status:404});
 row=await call('log.update',{...change(row),entry:{date:row.date,title:'Updated'}});expect(row.historicalPeople).toEqual(['Old friend']);expect((await rows('logEntries').findOne({_id:row.id}))?.migration).toMatchObject({sourceId:'original-hangout'});
});
it('keeps birth years owner-only, preserves omitted years, and supports clearing just the year',async()=>{
 await call('log.birthday_update',{birthday:{month:9,day:27,year:1996}});
 expect(await call('log.birthday_get')).toEqual({birthday:{month:9,day:27,year:1996}});
 const friend=await call('log.birthdays',{},'friend'),ownList=await call('log.birthdays');expect(friend.items).toContainEqual({personId:'me',name:'Me',handle:'me',month:9,day:27});expect(JSON.stringify(friend)).not.toContain('year');expect(JSON.stringify(ownList)).not.toContain('year');
 expect(await call('log.birthday_get',{},'friend')).toEqual({birthday:null});await expect(call('log.birthday_get',{personId:'me'},'friend')).rejects.toBeTruthy();
 expect((await call('people.get',{personId:'me'},'friend')).birthday).toBeUndefined();
 expect(await call('log.birthday_update',{birthday:{month:9,day:28}})).toEqual({birthday:{month:9,day:28,year:1996}});
 expect(await call('log.birthday_update',{birthday:{month:9,day:28,year:null}})).toEqual({birthday:{month:9,day:28}});expect((await rows('logBirthdays').findOne({_id:'me'}))?.year).toBeUndefined();
});
it('notifies first contributions only, leaving metadata, edits, removals, and QR joins silent',async()=>{
 let row=await create({}, {note:''});row=await call('log.add_person',{...change(row),personId:'friend'},'me',true);
 await rows('notifications').updateMany({},{$set:{readAt:'already-read'}});
 row=await call('log.update',{...change(row),entry:{date:row.date,title:'New title'},contribution:{note:'Creator adds a note'}});
 expect((await rows('notifications').findOne({userId:'friend'}))?.readAt).toBe('already-read');expect(await rows('notifications').countDocuments()).toBe(1);
 row=await call('log.update',{...change(row),entry:{date:row.date,title:'Another title'}},'friend');expect(await rows('notifications').countDocuments({userId:'me'})).toBe(0);
 row=await call('log.contribute',{...change(row),contribution:{note:'First note'}},'friend');expect(await rows('notifications').countDocuments({userId:'me',kind:'log_update'})).toBe(1);
 await rows('notifications').updateMany({},{$set:{readAt:'already-read'}});
 for(const note of ['Edited note','','Added again'])row=await call('log.contribute',{...change(row),contribution:{note}},'friend');expect((await rows('notifications').findOne({userId:'me'}))?.readAt).toBe('already-read');
 const code=await call('log.code',{entryId:row.id});row=await call('log.join',{code:code.code},'stranger',true);expect(await rows('notifications').countDocuments({readAt:null})).toBe(0);
 row=await call('log.contribute',{...change(row),contribution:{note:'A first contribution'}},'stranger');expect(await rows('notifications').countDocuments({actorId:'stranger',kind:'log_update',readAt:null})).toBe(2);
 await rows('notifications').updateMany({},{$set:{readAt:'already-read'}});await call('log.leave',change(row),'stranger',true);expect(await rows('notifications').countDocuments({readAt:null})).toBe(0);
});
it('treats existing content as already contributed and alerts on a new member’s first media',async()=>{
 let row=await create();row=await call('log.add_person',{...change(row),personId:'friend'},'me',true);const fileId=await testAudio('friend');row=await call('log.contribute',{...change(row),contribution:{fileIds:[fileId]}},'friend');expect(await rows('notifications').countDocuments({userId:'me',kind:'log_update'})).toBe(1);
 await rows('notifications').updateMany({},{$set:{readAt:'already-read'}});await rows('logEntries').updateOne({_id:row.id},{$unset:{'contributions.1.hasContributed':''}});row=await call('log.contribute',{...change(row),contribution:{fileIds:[],note:'Updated older contribution'}},'friend');expect((await rows('notifications').findOne({userId:'me'}))?.readAt).toBe('already-read');
});
it('names the contributor and hangout without exposing notes, and later edits leave it read',async()=>{
 const {pushStillRelevant,deliverPush}=await import('../server/push');let row=await create();row=await call('log.add_person',{...change(row),personId:'friend'},'me',true);await rows('sessions').insertOne({_id:'contribution-session',userId:'me',expiresAt:new Date(Date.now()+60000)});await rows('pushSubscriptions').insertOne({_id:'contribution-device',deviceId:randomUUID(),userId:'me',sessionId:'contribution-session',revokedAt:null,endpoint:'https://fcm.googleapis.com/fixture',keys:{}});
 const publicKey=config.VAPID_PUBLIC_KEY,privateKey=config.VAPID_PRIVATE_KEY,packets:string[]=[];try{config.VAPID_PUBLIC_KEY='fixture';config.VAPID_PRIVATE_KEY='fixture';row=await call('log.contribute',{...change(row),contribution:{note:'Private memory'}},'friend');const event=await rows('pushOutbox').findOne({kind:'log_update',userId:'me'});expect(event).toBeTruthy();expect(await pushStillRelevant(event as any)).toBe(true);await rows('pushOutbox').updateMany({},{$set:{availableAt:0}});await deliverPush((async(_subscription:any,payload:any)=>{packets.push(String(payload));return {statusCode:201};}) as any);expect(JSON.parse(packets[0])).toMatchObject({body:'@friend added to Tennis',url:`/log/${row.id}`});expect(packets[0]).not.toContain('Private memory');expect((await notificationState('me')).items[0].title).toBe('@friend added to Tennis');await rows('notifications').updateMany({userId:'me'},{$set:{readAt:'read'}});row=await call('log.contribute',{...change(row),contribution:{note:'A correction'}},'friend');expect(await pushStillRelevant(event as any)).toBe(false);expect(await rows('pushOutbox').countDocuments({kind:'log_update'})).toBe(1);}finally{config.VAPID_PUBLIC_KEY=publicKey;config.VAPID_PRIVATE_KEY=privateKey;}
});

it('exposes only currently accessible shared hangouts on nonfriend profiles',async()=>{
 const own=await create(),code=await call('log.code',{entryId:own.id});await call('log.join',{code:code.code},'stranger',true);
 await users().updateOne({_id:'stranger'},{$set:{discoverable:false}});
 expect(await call('people.get',{personId:'stranger'})).toMatchObject({id:'stranger',hasSharedHangouts:true});expect((await call('log.list',{scope:'shared',personId:'stranger'})).items.map((item:any)=>item.id)).toEqual([own.id]);
 expect(await call('connections.status',{personId:'stranger'})).toMatchObject({connection:null});
 const row=await call('log.get',{entryId:own.id});await call('log.leave',change(row),'stranger',true);
 await expect(call('people.get',{personId:'stranger'})).rejects.toMatchObject({status:404});await users().updateOne({_id:'stranger'},{$set:{discoverable:true}});expect(await call('people.get',{personId:'stranger'})).toMatchObject({hasSharedHangouts:false});
});

it('bounds calendar previews, pages dense days, and never includes private notes in tiles',async()=>{
 const date='2026-09-26';for(let i=0;i<12;i++)await create({date,title:`Entry ${i}`},{note:'private full note'});
 const calendar=await call('log.calendar',{from:date,through:date,today:date});expect(calendar.days).toHaveLength(1);expect(calendar.days[0].items).toHaveLength(9);expect(calendar.days[0].more).toBe(true);expect(JSON.stringify(calendar)).not.toContain('private full note');expect(calendar.days[0].items[0].contributors).toBeUndefined();
 const first=await call('log.list',{calendarDay:date,limit:7}),second=await call('log.list',{calendarDay:date,limit:7,before:first.nextCursor});expect(first.items.length+second.items.length).toBe(12);expect(new Set([...first.items,...second.items].map(row=>row.id)).size).toBe(12);
 expect((await call('log.calendar',{from:date,through:date,today:date},'stranger')).days[0].items).toEqual([]);
 await expect(call('log.calendar',{from:'2026-01-01',through:'2026-12-31',today:date})).rejects.toMatchObject({code:'log_dates'});
 await expect(call('log.list',{calendarDay:date,from:date})).rejects.toMatchObject({code:'log_dates'});
});
it('indexes anniversary month/day and handles leap-day reminders without reading all recurrences',async()=>{
 const row=await create({date:'2024-02-29',title:'Leap anniversary',recurrence:'anniversary'});
 const future=await call('log.calendar',{from:'2027-02-28',through:'2027-02-28',today:'2027-02-01'});expect(future.days[0].items.map((item:any)=>item.id)).toEqual([row.id]);
 expect((await call('log.list',{calendarDay:'2027-02-28',includeAnniversaries:true})).items.map((item:any)=>item.id)).toEqual([row.id]);
 expect((await call('log.calendar',{from:'2027-02-28',through:'2027-02-28',today:'2027-03-01'})).days[0].items).toEqual([]);
 await call('log.update',{...change(row),entry:{date:'2024-03-01',recurrence:'anniversary'}});
 expect((await call('log.list',{calendarDay:'2027-02-28',includeAnniversaries:true})).items).toEqual([]);
 await rows('logEntries').updateOne({_id:row.id},{$unset:{calendarMonthDay:''}});const {backfillLogCalendar}=await import('../server/log');expect(await backfillLogCalendar()).toBe(1);expect(await backfillLogCalendar()).toBe(0);
 expect((await call('log.calendar',{from:'2027-03-01',through:'2027-03-01',today:'2027-02-01'})).days[0].items.map((item:any)=>item.id)).toEqual([row.id]);
});

it('admits full calendar ranges without queuing one application task per day',async()=>{
 await create({date:'2026-09-26'});
 const aggregate=vi.spyOn(Collection.prototype,'aggregate');
 try{
  const pages=await Promise.all(Array.from({length:8},()=>call('log.calendar',{from:'2026-08-17',through:'2026-09-27',today:'2026-09-27'})));
  expect(pages.every(page=>page.days.length===42)).toBe(true);
  expect(aggregate).toHaveBeenCalledTimes(8);
  for(const [pipeline]of aggregate.mock.calls)expect(pipeline!.filter((stage:any)=>stage.$unionWith)).toHaveLength(41);
 }finally{aggregate.mockRestore();}
});
