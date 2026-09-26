import {LogPanel,LogDetail,LogEditor} from './LogPanel';
import {scrollFromPanelHeader} from './panelHeaderScroll';
import type {BrowserPanelState} from './usePrimaryRoute';
import {InboxPanel} from './InboxPanel';
import {AutomationsPanel} from './AutomationsPanel';
import {ChatSearchPanel} from './ChatSearchPanel';
import type {InboxItem} from '../shared/inbox';
import {bindPageChatScroll} from './usePageChatScroll';
import { useTopControlClearance } from './useTopControlClearance';
import {useEffect,useLayoutEffect,useState,useRef} from 'react';
import {ArrowLeft,Article,Users,ChatCircle,UserCircle,PencilSimple,Robot,CalendarDots,Plus} from '@phosphor-icons/react';
import type {Bootstrap} from '../shared/types';import type {Destination} from '../shared/navigation';import {surfaceTitles} from '../shared/navigation';
import type {AppMode} from '../shared/experience';import {BROWSER_VIEWS} from '../shared/experience';
import {NavigationContext} from './NavigationContext';import {PanelVisibilityContext} from './PanelReadiness';import {PreservedPanels} from './PreservedPanels';
import {PeoplePanel,MessagesPanel} from './NativePanels';import {FeedPanel,PostPanel,SelectedPostsPanel,PostComposer} from './PostPanels';import {PersonPanel} from './PersonPanel';import {AgentMarkdown} from './AgentMarkdown';
export interface SocialRequest {id:number;destination:Destination;browser?:BrowserPanelState;restore?:boolean}
type Screen=Destination;
const key=(value:Screen)=>JSON.stringify([value.view,value.resourceId,value.postIds,value.date]);
export function SocialExperience({mode,active,data,request,globalNavigate,openAgent,signup,dockOpen,reset,discuss,example,chatBusy,openMessage,onRoute,onLogDone}:{mode:Exclude<AppMode,'agent'>;onLogDone?(entry?:import('../shared/log').LogEntry):void;reset:number;dockOpen:boolean;chatBusy:boolean;discuss(item:InboxItem):void;example(prompt:string):void;openMessage(id:string):Promise<void>;active:boolean;data:Bootstrap;request?:SocialRequest;onRoute(mode:Exclude<AppMode,'agent'>,destination:Destination,browser:BrowserPanelState):void;globalNavigate(destination:Destination):void;openAgent():void;signup():void}){
 const [visited,setVisited]=useState(active);useEffect(()=>{if(active)setVisited(true);},[active]);
 const main=useRef<HTMLDivElement>(null);const clearance=useTopControlClearance(main,active,`${mode}:${dockOpen}`);
 const home:Screen=mode==='log'?{view:'log'}:mode==='posts'?{view:'feed'}:{view:'people'};
 const [tab,setTab]=useState('home'),[stacks,setStacks]=useState<Record<string,Screen[]>>({home:[home]});const stack=stacks[tab]||[home],current=stack.at(-1)!;
 const navigate=(destination:Destination)=>{if(destination.mode&&destination.mode!==mode||!BROWSER_VIEWS.has(destination.view)){globalNavigate(destination);return;}const {mode:_mode,...local}=destination;destination=local;setStacks(previous=>{const existing=previous[tab]||[home],index=existing.findIndex(item=>key(item)===key(destination));return {...previous,[tab]:index>=0?[...existing.slice(0,index),{...existing[index],...destination}]:[...existing,destination]};});};
 useLayoutEffect(()=>{if(!request)return;
  if(request.restore){
    const destination=request.destination;
    const section=['compose','log_compose'].includes(destination.view)?'compose':['messages','connections'].includes(destination.view)?'messages':destination.view==='person'&&destination.resourceId===data.user.id?'profile':mode==='posts'&&destination.view==='people'?'people':'home';
    const base:Screen=section==='compose'?{view:mode==='log'?'log_compose':'compose'}:section==='messages'?{view:'messages'}:section==='profile'?{view:'person',resourceId:data.user.id}:section==='people'?{view:'people'}:home;
    const tab=request.browser?.tab||section,restored=request.browser?.stack;
    setTab(tab);setStacks(previous=>({...previous,[tab]:restored?.length?restored:key(base)===key(destination)?[destination]:[base,destination]}));
  }
  else navigate(request.destination);
 },[request?.id]);
 useLayoutEffect(()=>{onRoute(mode,current,{tab,stack});},[mode,tab,JSON.stringify(stack)]);
 const savedLog=(entry:import('../shared/log').LogEntry)=>{onLogDone?.(entry);setStacks(previous=>{const base=(previous[tab]||[]).slice(0,-1);return {...previous,[tab]:[...(base.length?base:[home]),{view:'log',resourceId:entry.id}]};});};
 const updateContext=(context:Partial<Destination>)=>setStacks(previous=>({...previous,[tab]:[...stack.slice(0,-1),{...current,...context}]}));
 const root=(name:string,view:Screen)=>{setTab(name);setStacks(previous=>({...previous,[name]:[view]}));};
 useEffect(()=>{if(reset){setTab('home');setStacks(previous=>({...previous,home:[home]}));}},[reset]);
 const back=()=>{if(current.view==='log_compose'||current.view==='log'&&current.resourceId)onLogDone?.();setStacks(previous=>({...previous,[tab]:stack.length>1?stack.slice(0,-1):[home]}));};
 useEffect(()=>{
  const panel=main.current,page=panel?.closest<HTMLElement>('.app');if(!active||!panel||!page)return;
  let target:HTMLElement|null=null,unbind=()=>{};
  const connect=()=>{const view=panel.querySelector<HTMLElement>('.mode-pages > .composer-view:not([hidden])');const next=view?.querySelector<HTMLElement>('.direct-messages')||view||null;if(next===target)return;unbind();target=next;if(next)unbind=bindPageChatScroll(page as HTMLDivElement,next as HTMLDivElement,{surface:'content',blocked:()=>getComputedStyle(panel).visibility==='hidden',onScroll:()=>next.dispatchEvent(new Event('scroll'))});};
  connect();const observer=new MutationObserver(connect);observer.observe(panel,{childList:true,subtree:true});return()=>{observer.disconnect();unbind();};
 },[active,key(current),dockOpen]);
 if(!active&&!visited)return null;
 const items=mode==='log'?[{key:'home',title:'Your Log',icon:CalendarDots,view:home}]:mode==='posts'?[{key:'home',title:'All posts',icon:Article,view:home},{key:'people',title:'People',icon:Users,view:{view:'people'} as Screen},{key:'messages',title:'Messages',icon:ChatCircle,view:{view:'messages'} as Screen},{key:'profile',title:'Your profile',icon:UserCircle,view:{view:'person',resourceId:data.user.id} as Screen}]:[{key:'home',title:'Explore',icon:Users,view:home},{key:'messages',title:'Messages & invites',icon:ChatCircle,view:{view:'messages'} as Screen},{key:'profile',title:'Your profile',icon:UserCircle,view:{view:'person',resourceId:data.user.id} as Screen}];
 const content=!data.user.handle?<section className="mode-welcome"><AgentMarkdown text={data.messages.find(message=>message.id.startsWith('intro:'))?.text||'New Drugs. Made in New England.'}/><button className="solid" onClick={signup}>Create account or sign in</button></section>:current.view==='log'?current.resourceId?<LogDetail entryId={current.resourceId} user={data.user} navigate={navigate} onSaved={onLogDone} onCancel={()=>onLogDone?.()}/>:<LogPanel user={data.user} navigate={navigate} initialQuery={current.query} {...current} onStateChange={updateContext}/>:current.view==='log_compose'?<LogEditor user={data.user} date={current.date} cancel={back} onSaved={savedLog}/>:current.view==='feed'?<FeedPanel user={data.user} {...current} variant="timeline" initialQuery={current.query} initialScope={current.scope} onStateChange={updateContext} navigate={navigate}/>:current.view==='people'?<PeoplePanel user={data.user} {...current} initialQuery={current.query} initialScope={current.scope} onStateChange={updateContext} navigate={navigate}/>:current.view==='person'?<PersonPanel personId={current.resourceId||data.user.id} user={data.user} navigate={navigate}/>:current.view==='post'?<PostPanel postId={current.resourceId||''} user={data.user} navigate={navigate}/>:current.view==='post_list'?<SelectedPostsPanel postIds={current.postIds||[]} user={data.user} navigate={navigate}/>:current.view==='messages'||current.view==='connections'?<MessagesPanel userId={data.user.id} connectionId={current.resourceId} navigate={navigate}/>:current.view==='inbox'?<InboxPanel itemId={current.resourceId} navigate={navigate} discuss={discuss}/>:current.view==='automations'?<AutomationsPanel automationId={current.resourceId} navigate={navigate} chatBusy={chatBusy} example={example}/>:current.view==='chat_history'?<ChatSearchPanel initialQuery={current.query} initialRole={current.role} onStateChange={updateContext} openMessage={openMessage}/>:current.view==='compose'?<PostComposer user={data.user} navigate={navigate} submitted={post=>navigate({view:'post',resourceId:post.id})}/>:null;
 const title:string=current.view==='compose'?'New post':current.view==='feed'?'Posts':current.view==='people'?'People':surfaceTitles[current.view];
 return <section className={`social-experience social-${mode}`} hidden={!active} inert={!active} aria-label={`${mode==='log'?'Log':mode==='posts'?'Posts':'Friends'} mode`}><NavigationContext.Provider value={navigate}><PanelVisibilityContext.Provider value={active}>
  <aside className="mode-sidebar"><div className="mode-wordmark">New Drugs<span>Made in New England</span></div><nav aria-label={`${mode} navigation`}>{items.map(item=>{const Icon=item.icon;return <button key={item.key} aria-current={tab===item.key?'page':undefined} onClick={()=>root(item.key,item.view)}><Icon size={22} weight={tab===item.key?'fill':'regular'}/>{item.title}</button>;})}</nav>{mode==='log'&&<button className="mode-compose-button" onClick={()=>root('compose',{view:'log_compose'})}><Plus size={21}/>Log a moment</button>}{mode==='posts'&&<button className="mode-compose-button" onClick={()=>root('compose',{view:'compose'})}><PencilSimple size={21}/>Post</button>}</aside>
  <div className="mode-main" ref={main} style={{marginTop:clearance}}><header className="mode-content-header" onClick={event=>scrollFromPanelHeader(event,main.current?.querySelector<HTMLElement>('.mode-pages > .composer-view:not([hidden])')||null)}>{stack.length>1&&<button aria-label="Back" onClick={back}><ArrowLeft size={22}/></button>}<h1>{title}</h1>{mode==='log'&&<button aria-label="New Log entry" aria-pressed={current.view==='log_compose'} className="mode-mobile-compose" onClick={()=>root('compose',{view:'log_compose'})}><Plus size={22}/></button>}{mode==='posts'&&<button aria-label="New post" aria-pressed={current.view==='compose'} className="mode-mobile-compose" onClick={()=>root('compose',{view:'compose'})}><PencilSimple size={22}/></button>}</header><nav hidden={mode==='log'} className="mode-mobile-nav" aria-label={`${mode} sections`}>{items.map(item=><button key={item.key} aria-pressed={tab===item.key} onClick={()=>root(item.key,item.view)}>{item.title}</button>)}</nav><div className="mode-pages"><PreservedPanels retainVisited activeKey={key(current)} ancestorKeys={Object.values(stacks).flat().map(key)} reset={0}><div className={`mode-page mode-page-${current.view}`}>{content}</div></PreservedPanels></div></div>

 </PanelVisibilityContext.Provider></NavigationContext.Provider></section>;
}
