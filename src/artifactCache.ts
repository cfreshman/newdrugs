import {publicArtifactSchema,type ArtifactDetail,type ArtifactVersionSelector,type PublicArtifactDetail} from '../shared/artifacts';
import type {RecordInvalidation} from '../shared/liveState';
import {api,ApiError,errorText,operation} from './api';

export interface ArtifactSnapshot {document?:PublicArtifactDetail;owner?:ArtifactDetail;loading:boolean;error?:string;unavailable?:boolean}
const empty:ArtifactSnapshot={loading:false};
const gone:ArtifactSnapshot={loading:false,unavailable:true,error:'This artifact is no longer available.'};
const unavailable=(error:unknown)=>error instanceof ApiError&&[403,404,410].includes(error.status);
export function artifactCacheKey(id:string,contentRevision?:ArtifactVersionSelector){return contentRevision===undefined?id:`${id}@${contentRevision}`;}
function identity(key:string){const at=key.lastIndexOf('@');return at<0?{id:key,contentRevision:undefined}:{id:key.slice(0,at),contentRevision:key.slice(at+1) as `${number}`|'legacy'};}
function pathFor(key:string,state=false){const {id,contentRevision}=identity(key);return `/artifacts/${encodeURIComponent(id)}${state?'/state':''}${contentRevision===undefined?'':`?version=${encodeURIComponent(contentRevision)}`}`;}
const manifest=(assets:{id:string;sha256:string}[])=>JSON.stringify(assets.map(({id,sha256})=>[id,sha256]).sort((a,b)=>a[0].localeCompare(b[0])));

/** Public render snapshots are keyed by root/version. Private management reads
 * always use the latest owned root and never replace a pinned render document. */
export class ArtifactCache {
  private entries=new Map<string,ArtifactSnapshot>();
  private owners=new Map<string,ArtifactDetail>();
  private listeners=new Set<()=>void>();
  private flights=new Map<string,Promise<void>>();
  private watches=new Map<string,number>();
  private ownerReads=new Set<string>();
  private ownerFlights=new Map<string,Promise<void>>();
  private ownerAgain=new Set<string>();
  private ownerEpochs=new Map<string,number>();
  private epochs=new Map<string,number>();
  private deleted=new Map<string,true>();
  private refreshAgain=new Set<string>();
  private staleOwnerRevisions=new Map<string,number>();
  private pollAgain=new Set<string>();
  private polling=new Set<string>();
  private controllers=new Map<AbortController,string>();
  private candidates=new Map<string,{id:string;expanded:boolean;order:number}>();
  private placements=new Set<string>();
  private slots=new Set<string>();
  private sequence=0;
  private disposed=false;
  version=0;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  snapshot=()=>this.version;
  get=(key:string):ArtifactSnapshot=>{const {id}=identity(key);if(this.deleted.has(id))return gone;const saved=this.entries.get(key)||empty,owner=this.owners.get(id);return owner&&!saved.unavailable?{...saved,owner}:saved;};
  active=(placement:string)=>this.slots.has(placement);
  mounted=(placement:string)=>this.placements.has(placement);
  mount(placement:string){this.placements.add(placement);this.emit();return()=>{this.placements.delete(placement);this.emit();};}
  private emit(){if(this.disposed)return;this.version++;this.listeners.forEach(listener=>listener());}
  private set(key:string,value:ArtifactSnapshot){if(this.disposed)return;this.entries.delete(key);this.entries.set(key,value);this.trim();this.emit();}
  private keysFor(id:string){return [...new Set([...this.entries.keys(),...this.watches.keys(),...this.flights.keys(),...this.polling])].filter(key=>identity(key).id===id);}
  private watchedRoot(id:string){return [...this.watches.keys()].some(key=>identity(key).id===id);}
  private trim(){
    while(this.entries.size>24){const key=[...this.entries.keys()].find(value=>!this.watches.has(value)&&!this.flights.has(value))||this.entries.keys().next().value!;this.entries.delete(key);}
    const roots=new Set([...this.entries.keys(),...this.watches.keys(),...this.flights.keys(),...this.polling].map(key=>identity(key).id));
    for(const id of this.ownerFlights.keys())roots.add(id);
    for(const id of this.owners.keys())if(!roots.has(id))this.owners.delete(id);
    for(const id of this.ownerReads)if(!roots.has(id))this.ownerReads.delete(id);
    for(const id of this.ownerEpochs.keys())if(!roots.has(id))this.ownerEpochs.delete(id);
    for(const id of this.epochs.keys())if(!roots.has(id))this.epochs.delete(id);
    for(const key of this.staleOwnerRevisions.keys())if(!this.entries.has(key)&&!this.flights.has(key))this.staleOwnerRevisions.delete(key);
    while(this.deleted.size>24)this.deleted.delete(this.deleted.keys().next().value!);
  }
  place(placement:string,key:string,visible:boolean,expanded:boolean){
    if(visible||expanded)this.candidates.set(placement,{id:key,expanded,order:++this.sequence});else this.candidates.delete(placement);
    const selected=[...this.candidates].sort((a,b)=>Number(b[1].expanded)-Number(a[1].expanded)||b[1].order-a[1].order).slice(0,4).map(([key])=>key);
    if(selected.length!==this.slots.size||selected.some(key=>!this.slots.has(key))){this.slots=new Set(selected);this.emit();}
  }
  watch(key:string){this.watches.set(key,(this.watches.get(key)||0)+1);return()=>{const count=(this.watches.get(key)||1)-1;if(count)this.watches.set(key,count);else this.watches.delete(key);this.trim();};}
  /** Deleting any placement revokes every cached version of its root. */
  remove(key:string){
    const {id}=identity(key);this.epochs.set(id,(this.epochs.get(id)||0)+1);this.ownerEpochs.set(id,(this.ownerEpochs.get(id)||0)+1);
    this.deleted.delete(id);this.deleted.set(id,true);this.owners.delete(id);this.ownerReads.delete(id);this.ownerAgain.delete(id);
    for(const [controller,root] of this.controllers)if(root===id)controller.abort();
    for(const entry of new Set([id,...this.keysFor(id)])){this.refreshAgain.delete(entry);this.staleOwnerRevisions.delete(entry);this.pollAgain.delete(entry);this.entries.delete(entry);this.entries.set(entry,gone);}
    this.trim();this.emit();
  }
  updateOwner(value:ArtifactDetail){
    const id=value.id;if(this.disposed||this.deleted.has(id)||(this.owners.get(id)?.revision||0)>value.revision)return;
    this.ownerEpochs.set(id,(this.ownerEpochs.get(id)||0)+1);this.ownerAgain.delete(id);this.ownerReads.add(id);this.owners.set(id,value);
    const current=this.entries.get(id),document=current?.document;
    if(document&&document.contentRevision===value.contentRevision)this.entries.set(id,{...current!,document:{...document,title:value.title,revision:value.revision,updatedAt:value.updatedAt}});
    this.trim();this.emit();
    if(document&&document.contentRevision!==value.contentRevision&&this.watches.has(id))void this.load(id,true);
  }
  async load(key:string,force=false){
    const {id,contentRevision}=identity(key);
    if(this.disposed||this.deleted.has(id))return;
    if(this.flights.has(key)){if(force)this.refreshAgain.add(key);return this.flights.get(key);}
    if(!force&&(this.get(key).document||this.get(key).unavailable))return;
    const epoch=this.epochs.get(id)||0,controller=new AbortController();this.controllers.set(controller,id);
    this.set(key,{...this.entries.get(key),loading:true,error:undefined});
    const pending=(async()=>{
      try{
        let value=publicArtifactSchema.parse(await api<PublicArtifactDetail>(pathFor(key),{signal:controller.signal}));
        if(controller.signal.aborted||epoch!==(this.epochs.get(id)||0)||this.deleted.has(id))return;
        if(value.id!==id||(contentRevision!==undefined&&contentRevision!=='legacy'&&value.contentRevision!==Number(contentRevision)))throw Error('The artifact response does not match its saved version.');
        const previous=this.entries.get(key);
        const owner=this.owners.get(id);
        if(contentRevision===undefined&&owner&&owner.revision>value.revision){
          if(owner.contentRevision!==value.contentRevision){
            const retried=this.staleOwnerRevisions.get(key)===owner.revision;
            this.set(key,{...previous,loading:false,...(retried?{error:'This artifact changed while loading. Try again.'}:{})});
            if(!retried&&this.watches.has(key)){this.staleOwnerRevisions.set(key,owner.revision);this.refreshAgain.add(key);}
            return;
          }
          value={...value,title:owner.title,revision:owner.revision,updatedAt:owner.updatedAt};
        }
        if(previous?.document&&previous.document.revision>value.revision){this.set(key,{...previous,loading:false});return;}
        this.staleOwnerRevisions.delete(key);
        this.set(key,{document:value,loading:false});
        // A pinned document's original revision is independent of current owner metadata.
        if(contentRevision===undefined&&owner&&owner.revision<value.revision){this.owners.delete(id);this.ownerReads.delete(id);this.ownerEpochs.set(id,(this.ownerEpochs.get(id)||0)+1);void this.manage(key);}
      }catch(error){if(!controller.signal.aborted&&epoch===(this.epochs.get(id)||0)&&!this.deleted.has(id)){if(unavailable(error)){
        // A never-seen version can be absent without invalidating other ones.
        // A previously loaded immutable version cannot disappear independently.
        if(contentRevision===undefined||this.entries.get(key)?.document)this.remove(id);else this.set(key,{...gone});
      }else this.set(key,{...this.entries.get(key),loading:false,error:errorText(error)});}}
      finally{
        this.controllers.delete(controller);this.flights.delete(key);this.trim();
        if(this.refreshAgain.delete(key)&&this.watches.has(key)&&!this.deleted.has(id))void this.load(key,true);
        else if(this.pollAgain.delete(key)&&this.watches.has(key))void this.pollKey(key);
      }
    })();this.flights.set(key,pending);return pending;
  }
  async manage(key:string){
    const {id}=identity(key);
    if(this.disposed||this.deleted.has(id))return;
    if(this.ownerFlights.has(id))return this.ownerFlights.get(id);
    if(this.ownerReads.has(id))return;
    this.ownerReads.add(id);const controller=new AbortController();this.controllers.set(controller,id);
    const epoch=this.epochs.get(id)||0,ownerEpoch=this.ownerEpochs.get(id)||0;
    const pending=(async()=>{
      try{
        const owner=await operation<ArtifactDetail>('artifacts.get',{artifactId:id},{signal:controller.signal});
        if(!controller.signal.aborted&&epoch===(this.epochs.get(id)||0)&&ownerEpoch===(this.ownerEpochs.get(id)||0)&&!this.deleted.has(id)&&owner.id===id&&(this.owners.get(id)?.revision||0)<=owner.revision){this.owners.set(id,owner);this.emit();}
      }catch{/* Bearer viewing does not require ownership. Management stays absent. */}
      finally{this.controllers.delete(controller);this.ownerFlights.delete(id);this.trim();if(this.ownerAgain.delete(id)&&this.watchedRoot(id))void this.manage(key);}
    })();this.ownerFlights.set(id,pending);return pending;
  }
  invalidate(change:RecordInvalidation){
    if(this.disposed||!change.keys.includes('artifacts'))return;
    const changes:NonNullable<RecordInvalidation['artifacts']>=change.artifacts||[...new Set([...this.watches.keys()].map(key=>identity(key).id))].map(id=>({id}));
    for(const item of changes){
      const id=identity(item.id).id;if(item.deleted){this.remove(id);continue;}if(this.deleted.has(id))continue;
      const manage=this.ownerReads.has(id)||this.ownerFlights.has(id)||this.owners.has(id);
      this.owners.delete(id);this.ownerReads.delete(id);this.ownerEpochs.set(id,(this.ownerEpochs.get(id)||0)+1);
      const visible=document.visibilityState!=='hidden';
      if(manage&&visible&&this.watchedRoot(id)){if(this.ownerFlights.has(id))this.ownerAgain.add(id);else void this.manage(id);}
      for(const key of this.keysFor(id)){
        if(identity(key).contentRevision===undefined){if(visible&&this.watches.has(key))void this.load(key,true);else this.entries.delete(key);}
        else if(visible&&this.watches.has(key)){if(this.flights.has(key))this.pollAgain.add(key);else if(this.get(key).document)void this.pollKey(key);else void this.load(key,true);}
      }
      this.trim();this.emit();
    }
  }
  private async pollKey(key:string){
    const {id,contentRevision}=identity(key);
    if(this.disposed||this.deleted.has(id)||document.visibilityState==='hidden')return;
    if(contentRevision!==undefined&&!this.entries.get(key)?.document)return;
    if(this.flights.has(key)){this.pollAgain.add(key);return;}
    if(this.polling.has(key)){this.pollAgain.add(key);return;}
    this.polling.add(key);const epoch=this.epochs.get(id)||0,controller=new AbortController();this.controllers.set(controller,id);
    try{
      const state=await api<{revision:number;contentRevision?:number;assets?:{id:string;sha256:string}[]}>(pathFor(key,true),{signal:controller.signal});
      if(controller.signal.aborted||epoch!==(this.epochs.get(id)||0)||this.deleted.has(id))return;
      const saved=this.get(key);
      if(contentRevision===undefined&&saved.document&&state.revision<saved.document.revision)return;
      const changed=Boolean(saved.document&&state.assets&&manifest(saved.document.assets)!==manifest(state.assets));
      // Withdraw decoded pixels before reloading a revoked image projection.
      if(changed)this.set(key,{loading:true});
      if(changed||!saved.document||contentRevision===undefined&&state.revision!==saved.document.revision)await this.load(key,true);
    }catch(error){if(!controller.signal.aborted&&epoch===(this.epochs.get(id)||0)&&unavailable(error)){
      // Fixed state rechecks the live root as well as the snapshot. Do not show
      // cached variants after source deletion or suspension is observed.
      this.remove(id);
    }}finally{
      this.controllers.delete(controller);this.polling.delete(key);this.trim();
      if(this.pollAgain.delete(key)&&this.watches.has(key)&&!this.deleted.has(id))void this.pollKey(key);
    }
  }
  async poll(){
    if(this.disposed||document.visibilityState==='hidden')return;
    await Promise.allSettled([...this.watches.keys()].map(key=>this.pollKey(key)));
  }
  dispose(){this.disposed=true;for(const controller of this.controllers.keys())controller.abort();this.entries.clear();this.owners.clear();this.listeners.clear();this.candidates.clear();this.watches.clear();this.ownerReads.clear();this.staleOwnerRevisions.clear();this.deleted.clear();}
}
