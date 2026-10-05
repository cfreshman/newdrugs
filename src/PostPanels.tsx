import {avatarImageUrl} from './logImageCache';
import {compactUrlLabel} from '../shared/links';
import {ProfileHangouts} from './ProfileHangouts';
import {DeleteConfirmation} from './DeleteConfirmation';
import {normalizedPostLinks} from '../shared/postLinks';
import {LocationLabel} from './LocationLabel';
import { ContentReport } from './PeopleSafety';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useId, type FormEvent } from 'react';
import { LinkSimple, BookmarkSimple, Flag, Heart, ChatCircle, UserCircle, Trash, ArrowBendUpLeft, ImageSquare, ShareNetwork, Check, X, DotsThree, PushPin } from '@phosphor-icons/react';
import type { Profile } from '../shared/types';
import {destinationPath,type Destination} from '../shared/navigation';
import { RadiusSelect } from './RadiusSelect';
import { SearchField } from './SearchField';
import type { SearchResult, SearchRetrieval } from '../shared/search';
import { errorText, operation } from './api';
import { useRecordRefresh } from './useRecordRefresh';
import { LinkedText } from './LinkedText';
import { LinkPreviews } from './LinkPreview';
import { PostPhotos, type PostPhoto } from './PostPhotos';
import { uploadFile } from './uploads';
import type { UploadRef } from '../shared/uploads';
import { usePanelLoading, usePanelVisible } from './PanelReadiness';
import {shareLink} from './shareLink';
import {NavLink} from './NavLink';
import {useEdgeAwareMenu} from './useEdgeAwareMenu';

export interface Post { links?:string[]; photos?: PostPhoto[]; id: string; userId: string; text: string; createdAt: string; city: string; parentId?: string; rootId?: string; parent?: {id:string;text:string;deleted:boolean;author?:{name:string;handle?:string}}; deleted?: boolean; moderated?: boolean; saved?:boolean; pinned?:boolean; likeCount: number; liked: boolean; replyCount: number; author?: { name: string; handle?: string; photoId?: string; profileVisible?:boolean } }
interface Page { items: Post[]; nextCursor: string | null; pinned?:Post|null; retrieval?:SearchRetrieval }
interface PostAncestors {items:Post[];earlierId:string|null;unavailable:boolean}
type Navigate = (destination: Destination) => void;
const cachedPosts=new Map<string,{post:Post;time:number}>(),cachedReplies=new Map<string,{page:Page;time:number}>();
const CACHE_LIMIT=160,CACHE_AGE_MS=5*60_000;
let postOpenSerial=0,postOpenIntent:{id:string;serial:number}|null=null;
const cacheKey=(userId:string,id:string)=>`${userId}:${id}`;
function rememberPost(userId:string,post:Post){const key=cacheKey(userId,post.id);cachedPosts.delete(key);cachedPosts.set(key,{post,time:Date.now()});while(cachedPosts.size>CACHE_LIMIT)cachedPosts.delete(cachedPosts.keys().next().value!);}
function rememberReplies(userId:string,id:string,page:Page){const key=cacheKey(userId,id);cachedReplies.delete(key);cachedReplies.set(key,{page,time:Date.now()});while(cachedReplies.size>CACHE_LIMIT)cachedReplies.delete(cachedReplies.keys().next().value!);}
function cachedPost(userId:string,id:string){const entry=cachedPosts.get(cacheKey(userId,id));return entry&&Date.now()-entry.time<CACHE_AGE_MS?entry.post:null;}
function cachedThread(userId:string,id:string){
 const post=cachedPost(userId,id);if(!post)return null;
 const items:Post[]=[];let parentId=post.parentId;
 while(parentId&&items.length<50){const parent=cachedPost(userId,parentId);if(!parent)return null;items.unshift(parent);parentId=parent.parentId;}
 const replyEntry=cachedReplies.get(cacheKey(userId,id));
 const knownChildren=[...cachedPosts].filter(([key,value])=>key.startsWith(`${userId}:`)&&Date.now()-value.time<CACHE_AGE_MS&&value.post.parentId===id).map(([,value])=>value.post).sort((a,b)=>b.id.localeCompare(a.id)).slice(0,30);
 const replies=replyEntry&&Date.now()-replyEntry.time<CACHE_AGE_MS?{...replyEntry.page,items:replyEntry.page.items.map(item=>cachedPost(userId,item.id)||item)}:knownChildren.length?{items:knownChildren,nextCursor:null}:null;
 return {post,ancestors:{items,earlierId:parentId||null,unavailable:false} as PostAncestors,replies};
}
function openPost(navigate:Navigate,destination:Destination){if(destination.view==='post'&&destination.resourceId)postOpenIntent={id:destination.resourceId,serial:++postOpenSerial};navigate(destination);}
function timeLabel(value: string) { const seconds = Math.max(0, (Date.now() - Date.parse(value)) / 1000); return seconds < 60 ? 'now' : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : seconds < 86400 ? `${Math.floor(seconds / 3600)}h` : new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function PostCard({ post, user, navigate, changed, deleted, reply, showReplyContext = false,eagerMedia=false,showPinned=false }: { post: Post; user: Profile; navigate: Navigate; changed(post: Post): void; deleted(): void; reply?: () => void; showReplyContext?:boolean;eagerMedia?:boolean;showPinned?:boolean }) {
  useEffect(()=>rememberPost(user.id,post),[user.id,post]);
  const [reporting,setReporting]=useState(false);
  const [review, setReview] = useState(false), [busy, setBusy] = useState(false),[sharing,setSharing]=useState(false),[copied,setCopied]=useState(false),[menuOpen,setMenuOpen]=useState(false), [error, setError] = useState(''), [optimistic, setOptimistic] = useState<boolean | null>(null);
  const key = useRef(crypto.randomUUID()), likeIntent = useRef<{ liked: boolean; key: string } | null>(null),menu=useRef<HTMLDetailsElement>(null);
  const menuAvailable=post.userId===user.id?(!post.deleted||Boolean(post.moderated)):!post.deleted;
  useEdgeAwareMenu(menu,menuAvailable);
  useEffect(()=>{if(!menuOpen)return;const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!menu.current?.contains(event.target))menu.current?.removeAttribute('open');};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[menuOpen]);
  const copiedTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);useEffect(()=>()=>clearTimeout(copiedTimer.current),[]);
  const remove = async () => { setBusy(true); try { await operation('posts.delete', { postId: post.id }, { confirmed: true, key: key.current }); setReview(false);deleted(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } };
  const like = async () => {
    if (!user.handle) { navigate({ view: 'profile' }); return; } if (busy) return;
    const liked = !post.liked, intent = likeIntent.current?.liked === liked ? likeIntent.current : { liked, key: crypto.randomUUID() }; likeIntent.current = intent;
    setOptimistic(liked); setBusy(true); setError('');
    try { changed(await operation<Post>('posts.like', { postId: post.id, liked }, { key: intent.key })); likeIntent.current = null; }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); setOptimistic(null); }
  };
  const save=async()=>{
    if(!user.handle){navigate({view:'profile'});return;}if(busy)return;
    setBusy(true);setError('');try{changed(await operation<Post>('posts.save',{postId:post.id,saved:!post.saved}));}catch(error){setError(errorText(error));}finally{setBusy(false);}
  };
  const pin=async()=>{
    if(busy)return;menu.current?.removeAttribute('open');setBusy(true);setError('');
    try{changed(await operation<Post>('posts.pin',{postId:post.id,pinned:!post.pinned}));}
    catch(cause){setError(errorText(cause));}finally{setBusy(false);}
  };
  const share=async()=>{if(sharing)return;setSharing(true);setError('');try{const result=await shareLink(new URL(destinationPath({view:'post',resourceId:post.id}),location.origin).href,post.parentId?'New Drugs reply':'New Drugs post');if(result==='copied'){setCopied(true);clearTimeout(copiedTimer.current);copiedTimer.current=setTimeout(()=>setCopied(false),1500);}}catch(error){setError(errorText(error));}finally{setSharing(false);}};
  const liked = optimistic ?? post.liked, count = Math.max(0, (post.likeCount || 0) + (optimistic === null ? 0 : optimistic === post.liked ? 0 : optimistic ? 1 : -1));
  return <article className="post-card" data-post-id={post.id} onClick={event => { if (reply || (event.target as HTMLElement).closest('button, a, input, textarea, form, summary, details') || window.getSelection()?.toString()) return; openPost(navigate,{ view: 'post', resourceId: post.id }); }}>

    {showPinned&&<div className="post-pinned-label"><PushPin size={14} weight="fill"/>Pinned</div>}
    {showReplyContext && post.parentId && (post.parent ? <span className="reply-context" title={post.parent.text || undefined} onClick={event=>event.stopPropagation()}><ArrowBendUpLeft size={15}/><span>{post.parent.deleted ? 'Reply to a deleted post' : `Reply to ${post.parent.author?.handle ? '@'+post.parent.author.handle : post.parent.author?.name || 'a post'}`}{post.parent.text && `: ${post.parent.text}`}</span></span> : <span className="reply-context" onClick={event=>event.stopPropagation()}><ArrowBendUpLeft size={15}/>Reply</span>)}
    {!post.deleted && <div className="post-author-row">{post.author?.profileVisible===false?<span className="post-author quiet">{post.author?.photoId ? <img src={avatarImageUrl(post.author.photoId)} alt="" /> : <UserCircle size={36} weight="light" />}<span><strong>{post.author?.name || post.author?.handle || 'Profile unavailable'}</strong>{post.author?.handle && <span className="quiet small">@{post.author.handle}</span>}</span></span>:<NavLink className="post-author" to={{view:'person',resourceId:post.userId}} navigate={navigate}>{post.author?.photoId ? <img src={avatarImageUrl(post.author.photoId)} alt="" /> : <UserCircle size={36} weight="light" />}<span><strong>{post.author?.name || post.author?.handle || 'View profile'}</strong>{post.author?.handle && <span className="quiet small">@{post.author.handle}</span>}</span></NavLink>}<NavLink className="post-time" title={new Date(post.createdAt).toLocaleString()} to={{view:'post',resourceId:post.id}} navigate={destination=>openPost(navigate,destination)}>{timeLabel(post.createdAt)}</NavLink></div>}
    {(post.text||post.deleted)&&<p className={`post-text ${post.deleted ? 'quiet' : ''}`}>{post.deleted ? post.moderated ? 'This post was removed by moderation.' : 'This post was deleted.' : <LinkedText text={post.text} />}</p>}
    {!post.deleted && <><PostPhotos photos={post.photos || []} eager={eagerMedia}/><LinkPreviews text={post.text} links={post.links} eager={eagerMedia}/></>}
    {post.city && <p className="quiet small post-area"><LocationLabel label={post.city}/></p>}
    <div className="post-actions">{!post.deleted && <button className={`post-action ${liked ? 'is-liked' : ''}`} aria-label={`${liked ? 'Unlike' : 'Like'} post`} aria-pressed={liked} disabled={busy} onClick={() => void like()}><Heart size={18} weight={liked ? 'fill' : 'regular'} /><span>{count || 'Like'}</span></button>}{reply?<button className="post-action" aria-label="Reply" onClick={reply}><ChatCircle size={18}/><span>{post.replyCount||'Reply'}</span></button>:<NavLink className="post-action" aria-label="Open replies" to={{view:'post',resourceId:post.id}} navigate={destination=>openPost(navigate,destination)}><ChatCircle size={18}/><span>{post.replyCount||'Reply'}</span></NavLink>}{!post.deleted&&<button className="post-action" aria-label={post.saved?'Unsave post':'Save post'} aria-pressed={Boolean(post.saved)} disabled={busy} onClick={()=>void save()}><BookmarkSimple size={18} weight={post.saved?'fill':'regular'}/></button>}{!post.deleted&&<button className="post-action" aria-label={copied?'Link copied':post.parentId?'Share reply':'Share post'} title={copied?'Link copied':undefined} disabled={sharing} onClick={()=>void share()}>{copied?<Check size={18} weight="bold"/>:<ShareNetwork size={18}/>}</button>}{menuAvailable&&<details className="conversation-menu profile-menu post-more-menu" ref={menu} onToggle={event=>setMenuOpen(event.currentTarget.open)} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();menu.current?.removeAttribute('open');menu.current?.querySelector('summary')?.focus();}}}><summary className="post-action" aria-label="Post actions"><DotsThree size={18}/></summary><div>{post.userId===user.id?<>{!post.deleted&&!post.moderated&&!post.parentId&&<button type="button" disabled={busy} onClick={()=>void pin()}><PushPin size={17}/>{post.pinned?'Unpin from profile':'Pin to profile'}</button>}<button type="button" disabled={busy} onClick={()=>{menu.current?.removeAttribute('open');setReview(true);}}><Trash size={17}/>{post.parentId?'Delete reply':'Delete post'}</button></>:<button type="button" onClick={()=>{menu.current?.removeAttribute('open');setReporting(value=>!value);}}><Flag size={17}/>Report post</button>}</div></details>}</div>
    {reporting&&<ContentReport personId={post.userId} postId={post.id} close={()=>setReporting(false)}/>}
    {review && <DeleteConfirmation title={post.parentId?'Delete this reply?':'Delete this post?'} detail="This can’t be undone." confirmLabel={post.parentId?'Delete reply':'Delete post'} busy={busy} onCancel={()=>setReview(false)} onConfirm={remove}/>}{error && <p className="error" role="alert">{error}</p>}
  </article>;
}
export function PostList({posts,user,navigate,changed,deleted,replyContext=true,pinnedId}:{posts:Post[];user:Profile;navigate:Navigate;changed(post:Post):void;deleted(id:string):void;replyContext?:boolean;pinnedId?:string}) {
  return <div className="posts-list">{posts.map((post,index)=><div key={index===0&&post.id===pinnedId?`pinned:${post.id}`:post.id}><PostCard post={post} user={user} navigate={navigate} showReplyContext={replyContext} showPinned={index===0&&post.id===pinnedId} changed={changed} deleted={()=>deleted(post.id)}/></div>)}</div>;
}
async function refreshPostRecords(current:Post[]) {
  const pages:Promise<Page>[]=[];
  for(let offset=0;offset<current.length;offset+=30)pages.push(operation<Page>('posts.list',{scope:'selected',postIds:current.slice(offset,offset+30).map(post=>post.id)}));
  return (await Promise.all(pages)).flatMap(page=>page.items);
}
export function SelectedPostsPanel({postIds,user,navigate}:{postIds:string[];user:Profile;navigate:Navigate}) {
  const [posts,setPosts]=useState<Post[]|null>(null),[error,setError]=useState('');const identity=postIds.join(','),generation=useRef(0);
  const load=useCallback(async()=>{const request=++generation.current;try{const page=await operation<Page>('posts.list',{scope:'selected',postIds});if(request===generation.current){setPosts(page.items);setError('');}}catch(error){if(request===generation.current)setError(errorText(error));}},[identity]);
  useEffect(()=>{setPosts(null);void load();return()=>{generation.current++;};},[load]);useRecordRefresh(['posts','people'],load);usePanelLoading(!posts&&!error);
  return <>{posts&&<PostList posts={posts} user={user} navigate={navigate} changed={next=>setPosts(previous=>previous?.map(post=>post.id===next.id?next:post)||null)} deleted={id=>setPosts(previous=>previous?.filter(post=>post.id!==id)||null)}/>} {posts&&!posts.length&&<p className="quiet">These posts are no longer available.</p>}{error&&<p className="error" role="alert">{error}</p>}</>;
}
export function PostComposer({ user, target, submitted, navigate }: { user: Profile; target?: Post; submitted(post: Post): void; navigate: Navigate }) {
  const [links,setLinks]=useState<string[]>([]),[link,setLink]=useState(''),[showLinkEditor,setShowLinkEditor]=useState(false),urlInput=useRef<HTMLInputElement>(null),composerId=useId();
  const [text, setText] = useState(''), [tagArea, setTagArea] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [photos, setPhotos] = useState<UploadRef[]>([]), [uploading, setUploading] = useState(false);
  const picker = useRef<HTMLInputElement>(null), uploadController = useRef<AbortController | null>(null);
  useEffect(() => () => uploadController.current?.abort(), []);
  const choosePhotos = async (selected: File[]) => {
    if (!selected.length || uploading) return;
    if (selected.length + photos.length > 4) { setError('Choose up to four photos.'); return; }
    const control = new AbortController(); uploadController.current = control; setUploading(true); setError('');
    try { for (const file of selected) { const photo = await uploadFile(file, 'agent_input', control.signal); if (!control.signal.aborted) setPhotos(previous => [...previous, photo]); } }
    catch (error) { if (!control.signal.aborted) setError(errorText(error)); }
    finally { if (!control.signal.aborted) setUploading(false); }
  };
  const removePhoto = async (photo: UploadRef) => {
    try { await operation('files.discard', { fileId: photo.id }); setPhotos(previous => previous.filter(item => item.id !== photo.id)); } catch (error) { setError(errorText(error)); }
  };
  const input = useRef<HTMLTextAreaElement>(null), intent = useRef<{ fingerprint: string; key: string } | null>(null);
  useLayoutEffect(() => { if (input.current) { input.current.style.height = 'auto'; input.current.style.height = `${Math.min(180, Math.max(64, input.current.scrollHeight))}px`; } }, [text]);
  const collectLinks=()=>{const urls=normalizedPostLinks([...links,...(link.trim()?[link]:[])]);if(urls.length>3)throw new Error('Attach up to three links.');return urls;};
  const addLink=()=>{try{setLinks(collectLinks());setLink('');setError('');urlInput.current?.focus();}catch(reason){setError(errorText(reason));}};
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy || uploading) return;
    let urls:string[];try{urls=collectLinks();}catch(error){setError(errorText(error));return;}
    if(!text.trim()&&!photos.length&&!urls.length)return;
    const attachments={fileIds:photos.map(photo=>photo.id),...(urls.length?{links:urls}:{})};
    const data=target?{postId:target.id,text:text.trim(),...attachments}:{text:text.trim(),...attachments,...(tagArea&&user.area?{areaCell:user.area.cell}:{})};
    const fingerprint = JSON.stringify(data); if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true); setError('');
    try { const result = await operation<Post>(target ? 'posts.reply' : 'posts.create', data, { confirmed: true, key: intent.current.key }); setText(''); setPhotos([]);setLinks([]);setLink('');setShowLinkEditor(false); intent.current = null; submitted(result); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  };
  if (!user.handle) return <NavLink className="text-link" to={{view:'profile'}} navigate={navigate}>Create an account to {target ? 'reply' : 'post'}</NavLink>;
  return <form className="post-composer" onSubmit={submit}>
    {!target&&<div className="composer-author">{user.photos?.[0]?<img src={avatarImageUrl(user.photos[0])} alt=""/>:<UserCircle size={40} weight="light"/>}<div><strong>{user.name||user.handle}</strong><span>@{user.handle}</span></div></div>}
    <label className="sr-only" htmlFor={target?'reply-text':'post-text'}>{target?'Your reply':'New post'}</label>
    <textarea id={target?'reply-text':'post-text'} ref={input} value={text} maxLength={280} rows={2} placeholder={target?'Write a reply':'What’s happening?'} onChange={event=>setText(event.target.value)}/>
    <input type="file" ref={picker} className="sr-only" tabIndex={-1} aria-label="Choose post photos" multiple accept="image/jpeg,image/png,image/webp" disabled={busy||uploading} onChange={event=>{const selected=Array.from(event.target.files||[]);event.target.value='';void choosePhotos(selected);}}/>
    {photos.length>0&&<div className="post-draft-photos">{photos.map(photo=><div key={photo.id}><img src={photo.url} alt={photo.name}/><button type="button" aria-label={`Remove ${photo.name}`} disabled={busy} onClick={()=>void removePhoto(photo)}><X size={16}/></button></div>)}</div>}
    {(showLinkEditor||links.length>0)&&<section className="log-links-editor" aria-label="Links"><div className="log-link-add"><LinkSimple size={20} aria-hidden="true"/><input ref={urlInput} id={`${composerId}-url`} aria-label="Link" type="text" inputMode="url" autoCapitalize="none" autoComplete="off" spellCheck={false} placeholder="Paste a link" maxLength={2048} disabled={busy} value={link} onChange={event=>setLink(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(link.trim())addLink();}}}/><button type="button" className="solid" disabled={busy||!link.trim()||links.length>=3} onClick={addLink}>Add</button></div>{links.map(url=><div className="log-link-card" key={url}><div className="log-link-card-actions"><a href={url} target="_blank" rel="noreferrer">{compactUrlLabel(url)}</a><button type="button" aria-label={`Remove ${compactUrlLabel(url)}`} disabled={busy} onClick={()=>setLinks(previous=>previous.filter(value=>value!==url))}><X size={18}/></button></div><LinkPreviews text="" links={[url]} draft/></div>)}</section>}
    <LinkPreviews text={text} exclude={links} draft/>
    {!target&&<div className="post-compose-context">{user.area?<label className="check-label small"><input type="checkbox" checked={tagArea} onChange={event=>setTagArea(event.target.checked)}/><LocationLabel label={user.area.label}/></label>:<span className="quiet small">Public post</span>}</div>}
    <div className="post-compose-actions"><div className="post-compose-tools"><button type="button" className="post-photo-add" aria-label="Add photos" title="Add up to four photos" disabled={busy||uploading||photos.length>=4} onClick={()=>picker.current?.click()}><ImageSquare size={21}/></button><button type="button" className="post-url-add" aria-label="Add URL" title="Attach a URL" disabled={busy||links.length>=3} onClick={()=>{setShowLinkEditor(true);requestAnimationFrame(()=>urlInput.current?.focus({preventScroll:true}));}}><LinkSimple size={21}/></button></div><span className="quiet small post-count" aria-label={`${280-text.length} characters remaining`}>{text.length}/280</span><button className="solid" disabled={busy||uploading||!text.trim()&&!photos.length&&!links.length&&!link.trim()}>{uploading?'Uploading…':busy?'Publishing…':target?'Reply':'Post'}</button></div>
    {error&&<p className="error" role="alert">{error}</p>}
  </form>;
}
export function FeedPanel({ user, areaCell, radiusMiles = 25, initialQuery = '', initialScope, onStateChange, navigate, variant = 'panel' }: { variant?:'panel'|'timeline'; user: Profile; areaCell?: string; radiusMiles?: number; initialQuery?:string; initialScope?:Destination['scope']; onStateChange?(context:Partial<Destination>):void; navigate: Navigate }) {
  const [page, setPage] = useState<Page | null>(null), [scope, setScope] = useState<'public' | 'nearby' | 'own' | 'friends' | 'saved'>(initialScope==='saved'?'saved':initialScope==='friends'?'friends':initialScope==='own'?'own':initialScope==='nearby'||areaCell?'nearby':'public');
  const [search,setSearch]=useState(initialQuery ?? ''),[radius,setRadius]=useState(typeof radiusMiles === 'number' && Number.isFinite(radiusMiles) && radiusMiles >= 10 && radiusMiles <= 250 ? radiusMiles : 25);
  useEffect(()=>{setSearch(initialQuery||'');setRadius(radiusMiles);setScope(initialScope==='all'||initialScope==='circle'?'public':initialScope|| (areaCell?'nearby':'public'));},[initialQuery,initialScope,radiusMiles,areaCell]);
  const change=(context:Partial<Destination>)=>onStateChange?.({query:search,scope:scope==='public'?'all':scope,radiusMiles:radius,...context});
  const [error, setError] = useState(''), [hasUpdates, setHasUpdates] = useState(false); const generation = useRef(0), visible = usePanelVisible(); const pageRef=useRef(page);pageRef.current=page;
  const near = areaCell || user.area?.cell; usePanelLoading(!page && !error);
  const query = useCallback((before?: string) => ({ scope: scope === 'nearby' ? 'public' : scope, ...(scope === 'nearby' ? { near, radiusMiles:radius ?? 25 } : {}), ...(before ? { before } : {}) }), [scope, near, radius]);
  const load = useCallback(async (before?: string, refresh = false) => {
    if (scope === 'nearby' && !near) { setPage({ items: [], nextCursor: null }); return; }
    const request = ++generation.current;
    try { const found=search ? await operation<SearchResult>('posts.search',{query:search,...(scope==='nearby'?{near,radiusMiles:radius ?? 25}:{}),...(scope==='own'?{authorId:user.id}:{}),...(scope==='friends'||scope==='saved'?{scope}:{}),...(before?{cursor:before}:{})}) : null; const next:Page=found ? {items:found.matches.map(match=>match.record as Post),nextCursor:found.nextCursor,retrieval:found.retrieval} : await operation<Page>('posts.list', query(before)); const retained=refresh&&pageRef.current?await refreshPostRecords(pageRef.current.items):undefined; if (request === generation.current) { setPage(previous => {
      if (refresh && previous) { if (next.items.some(post => !previous.items.some(existing => existing.id === post.id))) setHasUpdates(true); return { ...previous, items: previous.items.flatMap(post => (retained||next.items).find(item=>item.id===post.id&&(scope!=='saved'||item.saved))||[]) }; }
      return before && previous ? { ...next, items: [...new Map([...previous.items, ...next.items].map(post => [post.id, post])).values()] } : next;
    }); setError(''); if (!refresh) setHasUpdates(false); } }
    catch (error) { if (request === generation.current) setError(errorText(error)); }
  }, [query, scope, near, search, radius, user.id]);
  useEffect(() => { setPage(null); void load(); return () => { generation.current++; }; }, [load]);
  useRecordRefresh(['posts'], () => load(undefined, true)); useRecordRefresh(['people', 'connections'], load);
  return <>{variant==='panel'&&<PostComposer user={user} navigate={navigate} submitted={post => { setPage(previous => previous ? { ...previous, items: [post, ...previous.items] } : { items: [post], nextCursor: null }); }} />}
    <SearchField label="Search posts by topic" value={search} onSearch={value => { if (value === search) void load(); else {setSearch(value);change({query:value});} }}/>
    <nav className="view-tabs" aria-label="Post filter">{(['public', 'nearby', 'friends', 'saved'] as const).map(value => <button key={value} aria-pressed={scope === value} onClick={() => {setScope(value);change({scope:value==='public'?'all':value});}}>{value === 'public' ? 'All' : value === 'nearby' ? 'Nearby' : value === 'friends' ? 'Friends' : 'Saved'}</button>)}</nav>
    {scope==='nearby' && near && <div className="search-area-controls"><NavLink className="text-link" to={{view:'location'}} navigate={navigate}>{user.area?.label?<LocationLabel label={user.area.label}/>:'Change area'}</NavLink><RadiusSelect value={radius} onChange={value=>{setRadius(value);change({radiusMiles:value});}}/></div>}
    {page?.retrieval?.notices.map(notice=><p className="quiet small" key={notice}>{notice}</p>)}
    {scope === 'nearby' && !near && <NavLink className="text-link" to={{view:'location'}} navigate={navigate}>Choose your area</NavLink>}{hasUpdates && <button className="text-link feed-updates" onClick={() => void load()}>{search ? 'Refresh results' : 'Show new posts'}</button>}
    <PostList posts={page?.items||[]} user={user} navigate={navigate} changed={next=>setPage(previous=>previous&&{...previous,items:previous.items.flatMap(item=>item.id===next.id?(scope==='saved'&&!next.saved?[]:[next]):[item])})} deleted={id=>setPage(previous=>previous&&{...previous,items:previous.items.filter(item=>item.id!==id)})}/>

    {page && !page.items.length && <p className="quiet">No posts here yet.</p>}{page?.nextCursor && <button className="text-link" onClick={() => void load(page.nextCursor!)}>More posts</button>}{error && <p className="error" role="alert">{error}</p>}</>;
}
export function PostPanel({ postId, user, navigate }: { postId: string; user: Profile; navigate: Navigate }) {
  const initial=useRef(cachedThread(user.id,postId)).current;
  const [post, setPost] = useState<Post | null>(initial?.post||null), [replies, setReplies] = useState<Page | null>(initial?.replies||null),[ancestors,setAncestors]=useState<PostAncestors|null>(initial?.ancestors||null),[ancestorError,setAncestorError]=useState(''), [error, setError] = useState(''); const generation = useRef(0), visible = usePanelVisible();
  const selectedRef=useRef<HTMLDivElement>(null),clearanceRef=useRef<HTMLDivElement>(null),scrolledPost=useRef<string|null>(null),lastOpenSerial=useRef(0);
  usePanelLoading((!post||post.id!==postId) && !error);
  const load = useCallback(async () => { const request = ++generation.current; try {
    const selectedRequest=operation<Post>('posts.get',{postId}),repliesRequest=operation<Page>('posts.replies',{postId});
    const known=cachedPost(user.id,postId),emptyChain:PostAncestors={items:[],earlierId:null,unavailable:false};
    const ancestorRequest=(known?Promise.resolve(known):selectedRequest).then(selected=>selected.parentId?operation<PostAncestors>('posts.ancestors',{postId}):emptyChain).then(value=>({value,error:''})).catch(cause=>({value:null,error:errorText(cause)}));
    const [next,replies,ancestorResult] = await Promise.all([selectedRequest,repliesRequest,ancestorRequest]);
    if (request === generation.current) {
      const chain=ancestorResult.value||cachedThread(user.id,postId)?.ancestors||{items:[],earlierId:null,unavailable:false};
      rememberPost(user.id,next);chain.items.forEach(item=>rememberPost(user.id,item));replies.items.forEach(item=>rememberPost(user.id,item));
      setPost(next);setAncestors(chain);setAncestorError(ancestorResult.error);
      setReplies(previous => {const combined=previous && previous.items.length > replies.items.length ? { ...previous, items: [...new Map([...previous.items, ...replies.items].map(item => [item.id, item])).values()].sort((a,b)=>b.id.localeCompare(a.id)) } : replies;rememberReplies(user.id,postId,combined);return combined;}); setError('');
    }
  } catch (cause) { if (request === generation.current) { cachedPosts.delete(cacheKey(user.id,postId));cachedReplies.delete(cacheKey(user.id,postId));setPost(null); setError(errorText(cause)); } } }, [postId,user.id]);
  useEffect(() => { const cached=cachedThread(user.id,postId);setPost(cached?.post||null);setReplies(cached?.replies||null);setAncestors(cached?.ancestors||null);setAncestorError('');void load();return () => { generation.current++; }; }, [load]); useRecordRefresh(['posts', 'people'], () => { if (visible) return load(); });
  useLayoutEffect(()=>{
    const openSerial=postOpenIntent?.id===postId?postOpenIntent.serial:0;
    if(!visible||!post||post.id!==postId||!ancestors||scrolledPost.current===postId&&openSerial<=lastOpenSerial.current)return;
    const target=selectedRef.current,clearance=clearanceRef.current,scroller=target?.closest<HTMLElement>('.composer-surface-content')||target?.closest<HTMLElement>('.composer-view');if(!target||!clearance||!scroller)return;
    let stopped=false,frame=0;
    const align=()=>{
      if(stopped||!target.isConnected||scroller.clientHeight<=0)return;
      const inset=parseFloat(getComputedStyle(scroller).getPropertyValue('--panel-inset'))||0;
      const desired=Math.max(0,scroller.scrollTop+target.getBoundingClientRect().top-scroller.getBoundingClientRect().top-inset);
      const currentClearance=clearance.offsetHeight||parseFloat(clearance.style.height)||0;
      clearance.style.height=`${Math.max(0,Math.ceil(desired+scroller.clientHeight-(scroller.scrollHeight-currentClearance)))}px`;
      scroller.scrollTop=desired;scrolledPost.current=postId;lastOpenSerial.current=openSerial;
    };
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(align);};
    const stop=()=>{stopped=true;observer?.disconnect();cancelAnimationFrame(frame);clearTimeout(later);window.removeEventListener('pageshow',schedule);};
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(schedule);
    observer?.observe(scroller);observer?.observe(target);
    const chain=target.parentElement?.querySelector<HTMLElement>('.post-ancestor-chain');if(chain)observer?.observe(chain);
    const later=setTimeout(schedule,250);
    scroller.addEventListener('wheel',stop,{passive:true});scroller.addEventListener('touchstart',stop,{passive:true});scroller.addEventListener('pointerdown',stop);scroller.addEventListener('keydown',stop);
    scroller.addEventListener('load',schedule,true);
    window.addEventListener('pageshow',schedule);align();schedule();
    return()=>{stopped=true;observer?.disconnect();cancelAnimationFrame(frame);clearTimeout(later);window.removeEventListener('pageshow',schedule);scroller.removeEventListener('wheel',stop);scroller.removeEventListener('touchstart',stop);scroller.removeEventListener('pointerdown',stop);scroller.removeEventListener('keydown',stop);scroller.removeEventListener('load',schedule,true);};
  },[postId,post?.id,ancestors?.items.length,visible]);
  const more = async () => { if (!replies?.nextCursor) return; try { const next = await operation<Page>('posts.replies', { postId, before: replies.nextCursor }); setReplies(previous => {if(!previous)return previous;const combined={...next,items:[...previous.items,...next.items]};rememberReplies(user.id,postId,combined);return combined;});next.items.forEach(item=>rememberPost(user.id,item)); } catch (error) { setError(errorText(error)); } };
  return post?.id===postId ? <>{post.parentId&&<>{ancestors?.unavailable&&<p className="quiet small">Earlier post unavailable.</p>}{ancestors?.earlierId&&<NavLink className="text-link" to={{view:'post',resourceId:ancestors.earlierId}} navigate={destination=>openPost(navigate,destination)}>Earlier context</NavLink>}{Boolean(ancestors?.items.length)&&<section className="posts-list post-ancestor-chain" aria-label="Earlier in this conversation">{ancestors!.items.map(parent=><div key={parent.id}><PostCard post={parent} user={user} navigate={navigate} eagerMedia changed={next=>setAncestors(previous=>previous&&({...previous,items:previous.items.map(item=>item.id===next.id?next:item)}))} deleted={()=>void load()}/></div>)}</section>}{ancestorError&&<p className="error" role="status">Could not load earlier posts: {ancestorError}</p>}</>}<div ref={selectedRef} className="post-current"><PostCard post={post} showReplyContext user={user} navigate={navigate} changed={setPost} deleted={() => void load()} reply={() => document.querySelector<HTMLElement>('.composer-view:not([hidden]) #reply-text')?.focus({ preventScroll: true })} /></div>{!post.deleted && <PostComposer user={user} target={post} navigate={navigate} submitted={reply => { rememberPost(user.id,reply);setReplies(previous => {const next={items:[reply,...(previous?.items||[])],nextCursor:previous?.nextCursor||null};rememberReplies(user.id,postId,next);return next;}); setPost(previous => previous && { ...previous, replyCount: previous.replyCount + 1 }); }} />}<div className="posts-list thread-replies">{replies?.items.map(reply => <div key={reply.id}><PostCard post={reply} user={user} navigate={navigate} changed={next => setReplies(previous => previous && { ...previous, items: previous.items.map(item => item.id === next.id ? next : item) })} deleted={() => void load()} /></div>)}</div>{replies?.nextCursor && <button className="text-link" onClick={() => void more()}>Earlier replies</button>}<div ref={clearanceRef} className="post-scroll-clearance" aria-hidden="true"/></> : error ? <p className="error" role="alert">{error}</p> : null;
}

export function ProfilePosts({ personId, user, navigate, showHangouts=false }: { personId: string; user: Profile; navigate: Navigate; showHangouts?:boolean }) {
  const [kind,setKind]=useState<'posts'|'replies'|'incoming'|'hangouts'>('posts'),[page,setPage]=useState<Page|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[updates,setUpdates]=useState(false);
  const generation=useRef(0),pageRef=useRef(page);pageRef.current=page;
  const load=useCallback(async(before?:string,refresh=false)=>{if(kind==='hangouts')return;const ticket=++generation.current;setLoading(true);try{const next=kind==='incoming'?await operation<Page>('posts.incoming_replies',{...(before?{before}:{})}):await operation<Page>('posts.list',{scope:'public',authorId:personId,kind,...(before?{before}:{})});const retained=refresh&&pageRef.current?await refreshPostRecords(pageRef.current.items):undefined;if(ticket===generation.current){setPage(previous=>{if(refresh&&previous){setUpdates(next.items.some(post=>!previous.items.some(item=>item.id===post.id)));return {...previous,pinned:kind==='posts'?next.pinned??null:null,items:previous.items.flatMap(post=>(retained||next.items).find(item=>item.id===post.id)||[])};}return before&&previous?{...next,pinned:previous.pinned??null,items:[...previous.items,...next.items]}:next;});setError('');if(!refresh&&!before)setUpdates(false);}}catch(e){if(ticket===generation.current)setError(errorText(e));}finally{if(ticket===generation.current)setLoading(false);}},[personId,kind]);
  useEffect(()=>{setPage(null);void load();return()=>{generation.current++;};},[load]);
  useRecordRefresh(['posts'],()=>load(undefined,true));
  useEffect(()=>{if(!showHangouts&&kind==='hangouts')setKind('posts');},[showHangouts,kind]);
  return <section className="profile-posts"><nav className="view-tabs" aria-label="Profile activity"><button aria-pressed={kind==='posts'} onClick={()=>setKind('posts')}>Posts</button><button aria-pressed={kind==='replies'} onClick={()=>setKind('replies')}>Replies</button>{showHangouts&&<button aria-pressed={kind==='hangouts'} onClick={()=>setKind('hangouts')}>Hangouts</button>}{personId===user.id&&<button aria-pressed={kind==='incoming'} onClick={()=>setKind('incoming')} aria-label="Incoming replies">Incoming</button>}</nav>{kind==='hangouts'&&showHangouts?<ProfileHangouts personId={personId} navigate={navigate}/>:<>{updates&&<button className="text-link" onClick={()=>void load()}>Show latest</button>}<PostList posts={kind==='posts'&&page?.pinned?[page.pinned,...(page.items[0]?.id===page.pinned.id?page.items.slice(1):page.items)]:page?.items||[]} pinnedId={kind==='posts'?page?.pinned?.id:undefined} user={user} navigate={navigate} changed={next=>setPage(p=>p&&{...p,pinned:kind==='posts'?(next.pinned?next:p.pinned?.id===next.id?null:p.pinned):p.pinned,items:p.items.map(item=>item.id===next.id?next:next.pinned?{...item,pinned:false}:item)})} deleted={id=>setPage(p=>p&&{...p,pinned:p.pinned?.id===id?null:p.pinned,items:p.items.filter(item=>item.id!==id)})}/>{page&&!page.items.length&&!page.pinned&&<p className="quiet">{kind==='incoming'?'No replies to you yet.':`No ${kind} yet.`}</p>}{page?.nextCursor&&<button disabled={loading} onClick={()=>void load(page.nextCursor!)}>More {kind==='incoming'?'replies':kind}</button>}{loading&&!page&&<p className="quiet" role="status">Loading…</p>}{error&&<p className="error" role="status">{error}</p>}</>}</section>;
}
