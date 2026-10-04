import {compactUrlLabel} from '../shared/links';
import {ProfileHangouts} from './ProfileHangouts';
import {DeleteConfirmation} from './DeleteConfirmation';
import {normalizedPostLinks} from '../shared/postLinks';
import {LocationLabel} from './LocationLabel';
import { ContentReport } from './PeopleSafety';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useId, type FormEvent } from 'react';
import { LinkSimple, BookmarkSimple, Flag, Heart, ChatCircle, UserCircle, Trash, ArrowBendUpLeft, ImageSquare, ShareNetwork, Check, X } from '@phosphor-icons/react';
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

export interface Post { links?:string[]; photos?: PostPhoto[]; id: string; userId: string; text: string; createdAt: string; city: string; parentId?: string; rootId?: string; parent?: {id:string;text:string;deleted:boolean;author?:{name:string;handle?:string}}; deleted?: boolean; moderated?: boolean; saved?:boolean; likeCount: number; liked: boolean; replyCount: number; author?: { name: string; handle?: string; photoId?: string; profileVisible?:boolean } }
interface Page { items: Post[]; nextCursor: string | null; retrieval?:SearchRetrieval }
interface PostAncestors {items:Post[];earlierId:string|null;unavailable:boolean}
type Navigate = (destination: Destination) => void;
function timeLabel(value: string) { const seconds = Math.max(0, (Date.now() - Date.parse(value)) / 1000); return seconds < 60 ? 'now' : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : seconds < 86400 ? `${Math.floor(seconds / 3600)}h` : new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function PostCard({ post, user, navigate, changed, deleted, reply, showReplyContext = false,eagerMedia=false }: { post: Post; user: Profile; navigate: Navigate; changed(post: Post): void; deleted(): void; reply?: () => void; showReplyContext?:boolean;eagerMedia?:boolean }) {
  const [reporting,setReporting]=useState(false);
  const [review, setReview] = useState(false), [busy, setBusy] = useState(false),[sharing,setSharing]=useState(false),[copied,setCopied]=useState(false), [error, setError] = useState(''), [optimistic, setOptimistic] = useState<boolean | null>(null);
  const key = useRef(crypto.randomUUID()), likeIntent = useRef<{ liked: boolean; key: string } | null>(null);
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
  const share=async()=>{if(sharing)return;setSharing(true);setError('');try{const result=await shareLink(new URL(destinationPath({view:'post',resourceId:post.id}),location.origin).href,post.parentId?'New Drugs reply':'New Drugs post');if(result==='copied'){setCopied(true);clearTimeout(copiedTimer.current);copiedTimer.current=setTimeout(()=>setCopied(false),1500);}}catch(error){setError(errorText(error));}finally{setSharing(false);}};
  const liked = optimistic ?? post.liked, count = Math.max(0, (post.likeCount || 0) + (optimistic === null ? 0 : optimistic === post.liked ? 0 : optimistic ? 1 : -1));
  return <article className="post-card" data-post-id={post.id} onClick={event => { if (reply || (event.target as HTMLElement).closest('button, a, input, textarea, form') || window.getSelection()?.toString()) return; navigate({ view: 'post', resourceId: post.id }); }}>

    {showReplyContext && post.parentId && (post.parent ? <span className="reply-context" title={post.parent.text || undefined} onClick={event=>event.stopPropagation()}><ArrowBendUpLeft size={15}/><span>{post.parent.deleted ? 'Reply to a deleted post' : `Reply to ${post.parent.author?.handle ? '@'+post.parent.author.handle : post.parent.author?.name || 'a post'}`}{post.parent.text && `: ${post.parent.text}`}</span></span> : <span className="reply-context" onClick={event=>event.stopPropagation()}><ArrowBendUpLeft size={15}/>Reply</span>)}
    {!post.deleted && <div className="post-author-row">{post.author?.profileVisible===false?<span className="post-author quiet">{post.author?.photoId ? <img src={`/api/files/${encodeURIComponent(post.author.photoId)}`} alt="" /> : <UserCircle size={36} weight="light" />}<span><strong>{post.author?.name || post.author?.handle || 'Profile unavailable'}</strong>{post.author?.handle && <span className="quiet small">@{post.author.handle}</span>}</span></span>:<NavLink className="post-author" to={{view:'person',resourceId:post.userId}} navigate={navigate}>{post.author?.photoId ? <img src={`/api/files/${encodeURIComponent(post.author.photoId)}`} alt="" /> : <UserCircle size={36} weight="light" />}<span><strong>{post.author?.name || post.author?.handle || 'View profile'}</strong>{post.author?.handle && <span className="quiet small">@{post.author.handle}</span>}</span></NavLink>}<NavLink className="post-time" title={new Date(post.createdAt).toLocaleString()} to={{view:'post',resourceId:post.id}} navigate={navigate}>{timeLabel(post.createdAt)}</NavLink></div>}
    {(post.text||post.deleted)&&<p className={`post-text ${post.deleted ? 'quiet' : ''}`}>{post.deleted ? post.moderated ? 'This post was removed by moderation.' : 'This post was deleted.' : <LinkedText text={post.text} />}</p>}
    {!post.deleted && <><PostPhotos photos={post.photos || []} eager={eagerMedia}/><LinkPreviews text={post.text} links={post.links} eager={eagerMedia}/></>}
    {post.city && <p className="quiet small post-area"><LocationLabel label={post.city}/></p>}
    <div className="post-actions">{!post.deleted && <button className={`post-action ${liked ? 'is-liked' : ''}`} aria-label={`${liked ? 'Unlike' : 'Like'} post`} aria-pressed={liked} disabled={busy} onClick={() => void like()}><Heart size={18} weight={liked ? 'fill' : 'regular'} /><span>{count || 'Like'}</span></button>}{reply?<button className="post-action" aria-label="Reply" onClick={reply}><ChatCircle size={18}/><span>{post.replyCount||'Reply'}</span></button>:<NavLink className="post-action" aria-label="Open replies" to={{view:'post',resourceId:post.id}} navigate={navigate}><ChatCircle size={18}/><span>{post.replyCount||'Reply'}</span></NavLink>}{!post.deleted&&<button className="post-action" aria-label={post.saved?'Unsave post':'Save post'} aria-pressed={Boolean(post.saved)} disabled={busy} onClick={()=>void save()}><BookmarkSimple size={18} weight={post.saved?'fill':'regular'}/></button>}{!post.deleted&&<button className="post-action" aria-label={copied?'Link copied':post.parentId?'Share reply':'Share post'} title={copied?'Link copied':undefined} disabled={sharing} onClick={()=>void share()}>{copied?<Check size={18} weight="bold"/>:<ShareNetwork size={18}/>}</button>}{post.userId!==user.id&&!post.deleted&&<button className="post-action report-post" aria-label="Report post" onClick={()=>setReporting(value=>!value)}><Flag size={17}/></button>}{post.userId === user.id && (!post.deleted || post.moderated) && <button className="post-action delete-post" aria-label="Delete post" aria-expanded={review} disabled={busy} onClick={() => setReview(!review)}><Trash size={17} /></button>}</div>
    {reporting&&<ContentReport personId={post.userId} postId={post.id} close={()=>setReporting(false)}/>}
    {review && <DeleteConfirmation title={post.parentId?'Delete this reply?':'Delete this post?'} detail="This can’t be undone." confirmLabel={post.parentId?'Delete reply':'Delete post'} busy={busy} onCancel={()=>setReview(false)} onConfirm={remove}/>}{error && <p className="error" role="alert">{error}</p>}
  </article>;
}
export function PostList({posts,user,navigate,changed,deleted,replyContext=true}:{posts:Post[];user:Profile;navigate:Navigate;changed(post:Post):void;deleted(id:string):void;replyContext?:boolean}) {
  return <div className="posts-list">{posts.map(post=><div key={post.id}><PostCard post={post} user={user} navigate={navigate} showReplyContext={replyContext} changed={changed} deleted={()=>deleted(post.id)}/></div>)}</div>;
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
    {!target&&<div className="composer-author">{user.photos?.[0]?<img src={`/api/files/${encodeURIComponent(user.photos[0])}`} alt=""/>:<UserCircle size={40} weight="light"/>}<div><strong>{user.name||user.handle}</strong><span>@{user.handle}</span></div></div>}
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
  const [post, setPost] = useState<Post | null>(null), [replies, setReplies] = useState<Page | null>(null),[ancestors,setAncestors]=useState<PostAncestors|null>(null),[ancestorError,setAncestorError]=useState(''), [error, setError] = useState(''); const generation = useRef(0), visible = usePanelVisible();
  const selectedRef=useRef<HTMLDivElement>(null),clearanceRef=useRef<HTMLDivElement>(null),scrolledPost=useRef<string|null>(null);
  usePanelLoading(!post && !error);
  const load = useCallback(async () => { const request = ++generation.current; try { const [post, replies] = await Promise.all([operation<Post>('posts.get', { postId }), operation<Page>('posts.replies', { postId })]);let chain:PostAncestors={items:[],earlierId:null,unavailable:false},chainError='';if(post.parentId)try{chain=await operation<PostAncestors>('posts.ancestors',{postId});}catch(error){chainError=errorText(error);}if (request === generation.current) { setPost(post);setAncestors(chain);setAncestorError(chainError); setReplies(previous => previous && previous.items.length > replies.items.length ? { ...previous, items: [...new Map([...previous.items, ...replies.items].map(item => [item.id, item])).values()].sort((a,b)=>b.id.localeCompare(a.id)) } : replies); setError(''); } } catch (error) { if (request === generation.current) { setPost(null); setError(errorText(error)); } } }, [postId]);
  useEffect(() => { setPost(null); setReplies(null);setAncestors(null);setAncestorError(''); void load(); return () => { generation.current++; }; }, [load]); useRecordRefresh(['posts', 'people'], () => { if (visible) return load(); });
  useLayoutEffect(()=>{
    if(!visible||!post||post.id!==postId||!ancestors||scrolledPost.current===postId)return;
    const target=selectedRef.current,clearance=clearanceRef.current,scroller=target?.closest<HTMLElement>('.composer-surface-content')||target?.closest<HTMLElement>('.composer-view');if(!target||!clearance||!scroller)return;
    let stopped=false,frame=0;
    const align=()=>{
      if(stopped||!target.isConnected||scroller.clientHeight<=0)return;
      const inset=parseFloat(getComputedStyle(scroller).getPropertyValue('--panel-inset'))||0;
      const desired=Math.max(0,scroller.scrollTop+target.getBoundingClientRect().top-scroller.getBoundingClientRect().top-inset);
      const currentClearance=clearance.offsetHeight||parseFloat(clearance.style.height)||0;
      clearance.style.height=`${Math.max(0,Math.ceil(desired+scroller.clientHeight-(scroller.scrollHeight-currentClearance)))}px`;
      scroller.scrollTop=desired;scrolledPost.current=postId;
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
  const more = async () => { if (!replies?.nextCursor) return; try { const next = await operation<Page>('posts.replies', { postId, before: replies.nextCursor }); setReplies(previous => previous && { ...next, items: [...previous.items, ...next.items] }); } catch (error) { setError(errorText(error)); } };
  return post ? <>{post.parentId&&<>{ancestors?.unavailable&&<p className="quiet small">Earlier post unavailable.</p>}{ancestors?.earlierId&&<NavLink className="text-link" to={{view:'post',resourceId:ancestors.earlierId}} navigate={navigate}>Earlier context</NavLink>}{Boolean(ancestors?.items.length)&&<section className="posts-list post-ancestor-chain" aria-label="Earlier in this conversation">{ancestors!.items.map(parent=><div key={parent.id}><PostCard post={parent} user={user} navigate={navigate} eagerMedia changed={next=>setAncestors(previous=>previous&&({...previous,items:previous.items.map(item=>item.id===next.id?next:item)}))} deleted={()=>void load()}/></div>)}</section>}{ancestorError&&<p className="error" role="status">Could not load earlier posts: {ancestorError}</p>}</>}<div ref={selectedRef} className="post-current"><PostCard post={post} showReplyContext user={user} navigate={navigate} changed={setPost} deleted={() => void load()} reply={() => document.querySelector<HTMLElement>('.composer-view:not([hidden]) #reply-text')?.focus({ preventScroll: true })} /></div>{!post.deleted && <PostComposer user={user} target={post} navigate={navigate} submitted={reply => { setReplies(previous => ({ items: [reply, ...(previous?.items || [])], nextCursor: previous?.nextCursor || null })); setPost(previous => previous && { ...previous, replyCount: previous.replyCount + 1 }); }} />}<div className="posts-list thread-replies">{replies?.items.map(reply => <div key={reply.id}><PostCard post={reply} user={user} navigate={navigate} changed={next => setReplies(previous => previous && { ...previous, items: previous.items.map(item => item.id === next.id ? next : item) })} deleted={() => void load()} /></div>)}</div>{replies?.nextCursor && <button className="text-link" onClick={() => void more()}>Earlier replies</button>}<div ref={clearanceRef} className="post-scroll-clearance" aria-hidden="true"/></> : error ? <p className="error" role="alert">{error}</p> : null;
}

export function ProfilePosts({ personId, user, navigate, showHangouts=false }: { personId: string; user: Profile; navigate: Navigate; showHangouts?:boolean }) {
  const [kind,setKind]=useState<'posts'|'replies'|'incoming'|'hangouts'>('posts'),[page,setPage]=useState<Page|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[updates,setUpdates]=useState(false);
  const generation=useRef(0),pageRef=useRef(page);pageRef.current=page;
  const load=useCallback(async(before?:string,refresh=false)=>{if(kind==='hangouts')return;const ticket=++generation.current;setLoading(true);try{const next=kind==='incoming'?await operation<Page>('posts.incoming_replies',{...(before?{before}:{})}):await operation<Page>('posts.list',{scope:'public',authorId:personId,kind,...(before?{before}:{})});const retained=refresh&&pageRef.current?await refreshPostRecords(pageRef.current.items):undefined;if(ticket===generation.current){setPage(previous=>{if(refresh&&previous){setUpdates(next.items.some(post=>!previous.items.some(item=>item.id===post.id)));return {...previous,items:previous.items.flatMap(post=>(retained||next.items).find(item=>item.id===post.id)||[])};}return before&&previous?{...next,items:[...previous.items,...next.items]}:next;});setError('');if(!refresh&&!before)setUpdates(false);}}catch(e){if(ticket===generation.current)setError(errorText(e));}finally{if(ticket===generation.current)setLoading(false);}},[personId,kind]);
  useEffect(()=>{setPage(null);void load();return()=>{generation.current++;};},[load]);
  useRecordRefresh(['posts'],()=>load(undefined,true));
  useEffect(()=>{if(!showHangouts&&kind==='hangouts')setKind('posts');},[showHangouts,kind]);
  return <section className="profile-posts"><nav className="view-tabs" aria-label="Profile activity"><button aria-pressed={kind==='posts'} onClick={()=>setKind('posts')}>Posts</button><button aria-pressed={kind==='replies'} onClick={()=>setKind('replies')}>Replies</button>{showHangouts&&<button aria-pressed={kind==='hangouts'} onClick={()=>setKind('hangouts')}>Hangouts</button>}{personId===user.id&&<button aria-pressed={kind==='incoming'} onClick={()=>setKind('incoming')}>Replies to you</button>}</nav>{kind==='hangouts'&&showHangouts?<ProfileHangouts personId={personId} navigate={navigate}/>:<>{updates&&<button className="text-link" onClick={()=>void load()}>Show latest</button>}<PostList posts={page?.items||[]} user={user} navigate={navigate} changed={next=>setPage(p=>p&&{...p,items:p.items.map(item=>item.id===next.id?next:item)})} deleted={id=>setPage(p=>p&&{...p,items:p.items.filter(item=>item.id!==id)})}/>{page&&!page.items.length&&<p className="quiet">{kind==='incoming'?'No replies to you yet.':`No ${kind} yet.`}</p>}{page?.nextCursor&&<button disabled={loading} onClick={()=>void load(page.nextCursor!)}>More {kind==='incoming'?'replies':kind}</button>}{loading&&!page&&<p className="quiet" role="status">Loading…</p>}{error&&<p className="error" role="status">{error}</p>}</>}</section>;
}
