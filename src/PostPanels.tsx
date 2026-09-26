import { ContentReport } from './PeopleSafety';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Flag, Heart, ChatCircle, UserCircle, Trash, ArrowBendUpLeft, ImageSquare, X } from '@phosphor-icons/react';
import type { Profile } from '../shared/types';
import type { Destination } from '../shared/navigation';
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

export interface Post { photos?: PostPhoto[]; id: string; userId: string; text: string; createdAt: string; city: string; parentId?: string; rootId?: string; parent?: {id:string;text:string;deleted:boolean;author?:{name:string;handle?:string}}; deleted?: boolean; moderated?: boolean; likeCount: number; liked: boolean; replyCount: number; author?: { name: string; handle?: string; photoId?: string; profileVisible?:boolean } }
interface Page { items: Post[]; nextCursor: string | null; retrieval?:SearchRetrieval }
type Navigate = (destination: Destination) => void;
function timeLabel(value: string) { const seconds = Math.max(0, (Date.now() - Date.parse(value)) / 1000); return seconds < 60 ? 'now' : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : seconds < 86400 ? `${Math.floor(seconds / 3600)}h` : new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function PostCard({ post, user, navigate, changed, deleted, reply, showReplyContext = false }: { post: Post; user: Profile; navigate: Navigate; changed(post: Post): void; deleted(): void; reply?: () => void; showReplyContext?:boolean }) {
  const [reporting,setReporting]=useState(false);
  const [review, setReview] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [optimistic, setOptimistic] = useState<boolean | null>(null);
  const key = useRef(crypto.randomUUID()), likeIntent = useRef<{ liked: boolean; key: string } | null>(null);
  const remove = async () => { setBusy(true); try { await operation('posts.delete', { postId: post.id }, { confirmed: true, key: key.current }); deleted(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } };
  const like = async () => {
    if (!user.handle) { navigate({ view: 'profile' }); return; } if (busy) return;
    const liked = !post.liked, intent = likeIntent.current?.liked === liked ? likeIntent.current : { liked, key: crypto.randomUUID() }; likeIntent.current = intent;
    setOptimistic(liked); setBusy(true); setError('');
    try { changed(await operation<Post>('posts.like', { postId: post.id, liked }, { key: intent.key })); likeIntent.current = null; }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); setOptimistic(null); }
  };
  const liked = optimistic ?? post.liked, count = Math.max(0, (post.likeCount || 0) + (optimistic === null ? 0 : optimistic === post.liked ? 0 : optimistic ? 1 : -1));
  return <article className="post-card" data-post-id={post.id} onClick={event => { if (reply || (event.target as HTMLElement).closest('button, a, input, textarea, form') || window.getSelection()?.toString()) return; navigate({ view: 'post', resourceId: post.id }); }}>

    {showReplyContext && post.parentId && (post.parent ? <button className="reply-context" title={post.parent.text || undefined} onClick={()=>navigate({view:'post',resourceId:post.parent!.id})}><ArrowBendUpLeft size={15}/><span>{post.parent.deleted ? 'Reply to a deleted post' : `Reply to ${post.parent.author?.handle ? '@'+post.parent.author.handle : post.parent.author?.name || 'a post'}`}{post.parent.text && `: ${post.parent.text}`}</span></button> : <span className="reply-context"><ArrowBendUpLeft size={15}/>Reply</span>)}
    {!post.deleted && <div className="post-author-row"><button className="post-author" disabled={post.author?.profileVisible===false} onClick={() => navigate({ view: 'person', resourceId: post.userId })}>{post.author?.photoId ? <img src={`/api/files/${encodeURIComponent(post.author.photoId)}`} alt="" /> : <UserCircle size={34} weight="light" />}<span><strong>{post.author?.name || post.author?.handle || 'View profile'}</strong>{post.author?.handle && <span className="quiet small">@{post.author.handle}</span>}</span></button><button className="post-time" title={new Date(post.createdAt).toLocaleString()} onClick={() => navigate({ view: 'post', resourceId: post.id })}>{timeLabel(post.createdAt)}</button></div>}
    <p className={`post-text ${post.deleted ? 'quiet' : ''}`}>{post.deleted ? post.moderated ? 'This post was removed by moderation.' : 'This post was deleted.' : <LinkedText text={post.text} />}</p>
    {!post.deleted && <><PostPhotos photos={post.photos || []} /><LinkPreviews text={post.text} /></>}
    {post.city && <p className="quiet small post-area">{post.city}</p>}
    <div className="post-actions">{!post.deleted && <button className={`post-action ${liked ? 'is-liked' : ''}`} aria-label={`${liked ? 'Unlike' : 'Like'} post`} aria-pressed={liked} disabled={busy} onClick={() => void like()}><Heart size={18} weight={liked ? 'fill' : 'regular'} /><span>{count || 'Like'}</span></button>}<button className="post-action" aria-label="Open replies" onClick={() => reply ? reply() : navigate({ view: 'post', resourceId: post.id })}><ChatCircle size={18} /><span>{post.replyCount || 'Reply'}</span></button>{post.userId!==user.id&&!post.deleted&&<button className="post-action" aria-label="Report post" onClick={()=>setReporting(value=>!value)}><Flag size={17}/></button>}{post.userId === user.id && (!post.deleted || post.moderated) && <button className="post-action delete-post" aria-label="Delete post" onClick={() => setReview(!review)}><Trash size={17} /></button>}</div>
    {reporting&&<ContentReport personId={post.userId} postId={post.id} close={()=>setReporting(false)}/>}
    {review && <div className="review-buttons"><button disabled={busy} onClick={() => setReview(false)}>Keep post</button><button disabled={busy} onClick={() => void remove()}>Delete permanently</button></div>}{error && <p className="error" role="alert">{error}</p>}
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
function PostComposer({ user, target, submitted, navigate }: { user: Profile; target?: Post; submitted(post: Post): void; navigate: Navigate }) {
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
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy || uploading || !text.trim()) return;
    const data = target ? { postId: target.id, text: text.trim(), fileIds: photos.map(photo => photo.id) } : { text: text.trim(), fileIds: photos.map(photo => photo.id), ...(tagArea && user.area ? { areaCell: user.area.cell } : {}) };
    const fingerprint = JSON.stringify(data); if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true); setError('');
    try { const result = await operation<Post>(target ? 'posts.reply' : 'posts.create', data, { confirmed: true, key: intent.current.key }); setText(''); setPhotos([]); intent.current = null; submitted(result); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  };
  if (!user.handle) return <button className="text-link" onClick={() => navigate({ view: 'profile' })}>Create an account to {target ? 'reply' : 'post'}</button>;
  return <form className="post-composer" onSubmit={submit}><label className="sr-only" htmlFor={target ? 'reply-text' : 'post-text'}>{target ? 'Your reply' : 'New post'}</label><textarea id={target ? 'reply-text' : 'post-text'} ref={input} value={text} maxLength={280} rows={2} placeholder={target ? 'Write a reply' : 'What’s happening?'} onChange={event => setText(event.target.value)} /><input type="file" ref={picker} className="sr-only" tabIndex={-1} aria-label="Choose post photos" multiple accept="image/jpeg,image/png,image/webp" disabled={busy || uploading} onChange={event => { const selected = Array.from(event.target.files || []); event.target.value = ''; void choosePhotos(selected); }} /><div className="post-draft-photos">{photos.map(photo => <div key={photo.id}><img src={photo.url} alt={photo.name} /><button type="button" aria-label={`Remove ${photo.name}`} disabled={busy} onClick={() => void removePhoto(photo)}><X size={16} /></button></div>)}</div><LinkPreviews text={text} draft /><div className="post-compose-actions"><button type="button" className="post-photo-add" aria-label="Add photos" title="Add up to four photos" disabled={busy || uploading || photos.length >= 4} onClick={() => picker.current?.click()}><ImageSquare size={21} /></button>{!target && user.area ? <label className="check-label small"><input type="checkbox" checked={tagArea} onChange={event => setTagArea(event.target.checked)} />{user.area.label}</label> : <span className="quiet small">{target ? '' : 'Public post'}</span>}<span className="quiet small">{text.length ? `${text.length}/280` : ''}</span><button className="solid" disabled={busy || uploading || !text.trim()}>{uploading ? 'Uploading…' : busy ? 'Publishing…' : target ? 'Reply' : 'Post'}</button></div>{error && <p className="error" role="alert">{error}</p>}</form>;
}
export function FeedPanel({ user, areaCell, radiusMiles = 25, initialQuery = '', initialScope, navigate }: { user: Profile; areaCell?: string; radiusMiles?: number; initialQuery?:string; initialScope?:Destination['scope']; navigate: Navigate }) {
  const [page, setPage] = useState<Page | null>(null), [scope, setScope] = useState<'public' | 'nearby' | 'own'>(initialScope==='own'?'own':initialScope==='nearby'||areaCell?'nearby':'public');
  const [search,setSearch]=useState(initialQuery ?? ''),[radius,setRadius]=useState(typeof radiusMiles === 'number' && Number.isFinite(radiusMiles) && radiusMiles >= 10 && radiusMiles <= 250 ? radiusMiles : 25);
  const [error, setError] = useState(''), [hasUpdates, setHasUpdates] = useState(false); const generation = useRef(0), visible = usePanelVisible(); const pageRef=useRef(page);pageRef.current=page;
  const near = areaCell || user.area?.cell; usePanelLoading(!page && !error);
  const query = useCallback((before?: string) => ({ scope: scope === 'own' ? 'own' : 'public', ...(scope === 'nearby' ? { near, radiusMiles:radius ?? 25 } : {}), ...(before ? { before } : {}) }), [scope, near, radius]);
  const load = useCallback(async (before?: string, refresh = false) => {
    if (scope === 'nearby' && !near) { setPage({ items: [], nextCursor: null }); return; }
    const request = ++generation.current;
    try { const found=search ? await operation<SearchResult>('posts.search',{query:search,...(scope==='nearby'?{near,radiusMiles:radius ?? 25}:{}),...(scope==='own'?{authorId:user.id}:{}),...(before?{cursor:before}:{})}) : null; const next:Page=found ? {items:found.matches.map(match=>match.record as Post),nextCursor:found.nextCursor,retrieval:found.retrieval} : await operation<Page>('posts.list', query(before)); const retained=refresh&&pageRef.current?await refreshPostRecords(pageRef.current.items):undefined; if (request === generation.current) { setPage(previous => {
      if (refresh && previous) { if (next.items.some(post => !previous.items.some(existing => existing.id === post.id))) setHasUpdates(true); return { ...previous, items: previous.items.flatMap(post => (retained||next.items).find(item=>item.id===post.id)||[]) }; }
      return before && previous ? { ...next, items: [...new Map([...previous.items, ...next.items].map(post => [post.id, post])).values()] } : next;
    }); setError(''); if (!refresh) setHasUpdates(false); } }
    catch (error) { if (request === generation.current) setError(errorText(error)); }
  }, [query, scope, near, search, radius, user.id]);
  useEffect(() => { setPage(null); void load(); return () => { generation.current++; }; }, [load]);
  useRecordRefresh(['posts'], () => load(undefined, true)); useRecordRefresh(['people'], load);
  return <><PostComposer user={user} navigate={navigate} submitted={post => { setPage(previous => previous ? { ...previous, items: [post, ...previous.items] } : { items: [post], nextCursor: null }); }} />
    <SearchField label="Search posts by topic" value={search} onSearch={value => { if (value === search) void load(); else setSearch(value); }}/>
    <nav className="view-tabs" aria-label="Post filter">{(['public', 'nearby', 'own'] as const).map(value => <button key={value} aria-pressed={scope === value} onClick={() => setScope(value)}>{value === 'public' ? 'All posts' : value === 'nearby' ? 'Nearby' : 'My posts'}</button>)}</nav>
    {scope==='nearby' && near && <div className="search-area-controls"><button className="text-link" onClick={()=>navigate({view:'location'})}>{user.area?.label||'Change area'}</button><RadiusSelect value={radius} onChange={setRadius}/></div>}
    {page?.retrieval?.notices.map(notice=><p className="quiet small" key={notice}>{notice}</p>)}
    {scope === 'nearby' && !near && <button className="text-link" onClick={() => navigate({ view: 'location' })}>Choose your area</button>}{hasUpdates && <button className="text-link feed-updates" onClick={() => void load()}>{search ? 'Refresh results' : 'Show new posts'}</button>}
    <PostList posts={page?.items||[]} user={user} navigate={navigate} changed={next=>setPage(previous=>previous&&{...previous,items:previous.items.map(item=>item.id===next.id?next:item)})} deleted={id=>setPage(previous=>previous&&{...previous,items:previous.items.filter(item=>item.id!==id)})}/>

    {page && !page.items.length && <p className="quiet">No posts here yet.</p>}{page?.nextCursor && <button className="text-link" onClick={() => void load(page.nextCursor!)}>More posts</button>}{error && <p className="error" role="alert">{error}</p>}</>;
}
export function PostPanel({ postId, user, navigate }: { postId: string; user: Profile; navigate: Navigate }) {
  const [post, setPost] = useState<Post | null>(null), [replies, setReplies] = useState<Page | null>(null), [error, setError] = useState(''); const generation = useRef(0), visible = usePanelVisible();
  usePanelLoading(!post && !error);
  const load = useCallback(async () => { const request = ++generation.current; try { const [post, replies] = await Promise.all([operation<Post>('posts.get', { postId }), operation<Page>('posts.replies', { postId })]); if (request === generation.current) { setPost(post); setReplies(previous => previous && previous.items.length > replies.items.length ? { ...previous, items: [...new Map([...previous.items, ...replies.items].map(item => [item.id, item])).values()].sort((a,b)=>b.id.localeCompare(a.id)) } : replies); setError(''); } } catch (error) { if (request === generation.current) { setPost(null); setError(errorText(error)); } } }, [postId]);
  useEffect(() => { setPost(null); setReplies(null); void load(); return () => { generation.current++; }; }, [load]); useRecordRefresh(['posts', 'people'], () => { if (visible) return load(); });
  const more = async () => { if (!replies?.nextCursor) return; try { const next = await operation<Page>('posts.replies', { postId, before: replies.nextCursor }); setReplies(previous => previous && { ...next, items: [...previous.items, ...next.items] }); } catch (error) { setError(errorText(error)); } };
  return post ? <><PostCard post={post} showReplyContext user={user} navigate={navigate} changed={setPost} deleted={() => void load()} reply={() => document.querySelector<HTMLElement>('.composer-view:not([hidden]) #reply-text')?.focus({ preventScroll: true })} />{!post.deleted && <PostComposer user={user} target={post} navigate={navigate} submitted={reply => { setReplies(previous => ({ items: [reply, ...(previous?.items || [])], nextCursor: previous?.nextCursor || null })); setPost(previous => previous && { ...previous, replyCount: previous.replyCount + 1 }); }} />}<div className="posts-list thread-replies">{replies?.items.map(reply => <div key={reply.id}><PostCard post={reply} user={user} navigate={navigate} changed={next => setReplies(previous => previous && { ...previous, items: previous.items.map(item => item.id === next.id ? next : item) })} deleted={() => void load()} /></div>)}</div>{replies?.nextCursor && <button className="text-link" onClick={() => void more()}>Earlier replies</button>}</> : error ? <p className="error" role="alert">{error}</p> : null;
}

export function ProfilePosts({ personId, user, navigate }: { personId: string; user: Profile; navigate: Navigate }) {
  const [kind,setKind]=useState<'posts'|'replies'>('posts'),[page,setPage]=useState<Page|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[updates,setUpdates]=useState(false);
  const generation=useRef(0),pageRef=useRef(page);pageRef.current=page;
  const load=useCallback(async(before?:string,refresh=false)=>{const ticket=++generation.current;setLoading(true);try{const next=await operation<Page>('posts.list',{scope:'public',authorId:personId,kind,...(before?{before}:{})});const retained=refresh&&pageRef.current?await refreshPostRecords(pageRef.current.items):undefined;if(ticket===generation.current){setPage(previous=>{if(refresh&&previous){setUpdates(next.items.some(post=>!previous.items.some(item=>item.id===post.id)));return {...previous,items:previous.items.flatMap(post=>(retained||next.items).find(item=>item.id===post.id)||[])};}return before&&previous?{...next,items:[...previous.items,...next.items]}:next;});setError('');if(!refresh&&!before)setUpdates(false);}}catch(e){if(ticket===generation.current)setError(errorText(e));}finally{if(ticket===generation.current)setLoading(false);}},[personId,kind]);
  useEffect(()=>{setPage(null);void load();return()=>{generation.current++;};},[load]);
  useRecordRefresh(['posts'],()=>load(undefined,true));
  return <section className="profile-posts"><nav className="view-tabs" aria-label="Profile activity"><button aria-pressed={kind==='posts'} onClick={()=>setKind('posts')}>Posts</button><button aria-pressed={kind==='replies'} onClick={()=>setKind('replies')}>Replies</button></nav>{updates&&<button className="text-link" onClick={()=>void load()}>Show latest</button>}<PostList posts={page?.items||[]} user={user} navigate={navigate} changed={next=>setPage(p=>p&&{...p,items:p.items.map(item=>item.id===next.id?next:item)})} deleted={id=>setPage(p=>p&&{...p,items:p.items.filter(item=>item.id!==id)})}/>{page&&!page.items.length&&<p className="quiet">No {kind} yet.</p>}{page?.nextCursor&&<button disabled={loading} onClick={()=>void load(page.nextCursor!)}>More {kind}</button>}{loading&&!page&&<p className="quiet" role="status">Loading…</p>}{error&&<p className="error" role="status">{error}</p>}</section>;
}
