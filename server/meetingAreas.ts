import {gridDisk,cellToLatLng} from 'h3-js';
import type {Profile} from '../shared/types';
import {coarsePoint,nearestCoarseCell,distanceMeters,sharedAreaDistance,type CoarseArea} from '../shared/geo';
import {rows} from './db';
import {AppError} from './errors';
function center(points:[number,number][]){const sum=[0,0,0];for(const [lat,lon]of points){const a=lat*Math.PI/180,b=lon*Math.PI/180;sum[0]+=Math.cos(a)*Math.cos(b);sum[1]+=Math.cos(a)*Math.sin(b);sum[2]+=Math.sin(a);}if(Math.hypot(...sum)<1e-8)return null;return [Math.atan2(sum[2],Math.hypot(sum[0],sum[1]))*180/Math.PI,Math.atan2(sum[1],sum[0])*180/Math.PI] as [number,number];}
/** All calculations use canonical coarse centers. No venue search, network request or device coordinates. */
export async function meetingAreas(people:Profile[],count:number){
  const missing=people.filter(person=>!person.area).map(person=>person.id);
  if(missing.length)throw new AppError(422,'area_required',`These participants have no shared approximate area: ${missing.join(', ')}.`);
  const participants=people.map(person=>({personId:person.id,name:person.name,handle:person.handle,area:{cell:person.area!.cell,label:person.area!.label,point:coarsePoint(person.area!.cell)}}));
  const points=participants.map(person=>cellToLatLng(person.area.cell) as [number,number]),middle=center(points);
  if(!middle)throw new AppError(422,'meeting_area_ambiguous','These areas have no stable common center. Choose a smaller regional group.');
  const seeds=new Set<string>([nearestCoarseCell(...middle),...participants.map(person=>person.area.cell)]);
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){const midpoint=center([points[i],points[j]]);if(midpoint)seeds.add(nearestCoarseCell(...midpoint));}
  const candidates=new Set<string>();for(const cell of seeds)for(const neighbor of gridDisk(cell,1))candidates.add(neighbor);
  const scores=new Map<string,{cell:string;maximum:number;total:number}>();
  const score=(cell:string)=>{if(!scores.has(cell)){const point=cellToLatLng(cell) as [number,number],distances=points.map(origin=>distanceMeters(origin,point));scores.set(cell,{cell,maximum:Math.max(...distances),total:distances.reduce((a,b)=>a+b,0)});}return scores.get(cell)!;};
  const compare=(a:ReturnType<typeof score>,b:ReturnType<typeof score>)=>a.maximum-b.maximum||a.total-b.total||a.cell.localeCompare(b.cell);
  let best=[...candidates].map(score).sort(compare)[0];
  for(let step=0;step<64;step++){const neighbors=gridDisk(best.cell,1);neighbors.forEach(cell=>candidates.add(cell));const next=neighbors.map(score).sort(compare)[0];if(compare(next,best)>=0)break;best=next;}
  const chosen=[...candidates].map(score).sort(compare).slice(0,count),labels=await rows('locationAreas').find({_id:{$in:chosen.map(item=>item.cell)}},{projection:{label:1}}).toArray();
  return {participants,candidates:chosen.map(item=>{const area:CoarseArea={cell:item.cell,label:String(labels.find(row=>row._id===item.cell)?.label||'Approximate meeting area'),point:coarsePoint(item.cell)};return {area,distances:participants.map((person,index)=>({personId:person.personId,...sharedAreaDistance(person.area.cell,item.cell,distanceMeters(points[index],cellToLatLng(item.cell) as [number,number]))}))};}),method:'Balanced coarse-grid candidates minimizing the largest straight-line area distance, with total distance as a tie-breaker.',notice:'These are approximate shared grid centers, not device locations or travel-time estimates. No venues or events were searched. Use locations.resolve for an area label if needed, then use the agent’s web search to check real places and accessibility.'};
}
