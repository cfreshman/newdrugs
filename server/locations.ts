import { rows } from './db';
import { AppError } from './errors';
import { coarsePoint, nearestCoarseCell, type CoarseArea } from '../shared/geo';
import { hash } from './auth';
import type { Document } from 'mongodb';

const origin = 'https://photon.komoot.io';
type Feature = { geometry?: { coordinates?: unknown[] }; properties?: Record<string, unknown> };
async function geocode(path: string, parameters: Record<string, string>) {
  const url = new URL(path, origin); for (const [key,value] of Object.entries(parameters)) url.searchParams.set(key,value);
  const response = await fetch(url, { signal: AbortSignal.timeout(7000), headers: { 'User-Agent': 'New Drugs location lookup (https://druggie.org)', Accept:'application/json' } });
  if (!response.ok) throw new AppError(503,'location_lookup_unavailable','Place search is temporarily unavailable. You can use your device location.');
  const data = await response.json() as {features?: Feature[]};
  return Array.isArray(data.features) ? data.features.slice(0,10) : [];
}
const part = (value: unknown) => typeof value==='string' ? value.slice(0,120) : '';
export async function searchPlaces(query: string) {
  const features=await geocode('/api/',{q:query,limit:'6',lang:'en',layer:'city'});
  const items=features.flatMap(feature=>{
    const [longitude,latitude]=feature.geometry?.coordinates || [];
    const p=feature.properties || {};
    if (typeof latitude!=='number'||typeof longitude!=='number'||!Number.isFinite(latitude)||!Number.isFinite(longitude)) return [];
    const label=[...new Set([part(p.name),part(p.state),part(p.country)].filter(Boolean))].join(', ');
    if (!label) return [];
    return [{id:`osm:${part(p.osm_type)}:${String(p.osm_id)}`,label,cell:nearestCoarseCell(latitude,longitude)}];
  });
  return {items,attribution:'OpenStreetMap contributors · Photon'};
}
export async function resolveArea(cell: string): Promise<CoarseArea> {
  const point=coarsePoint(cell);
  const cached=await rows('locationAreas').findOne({_id:cell});
  if (cached) return {cell,label:String(cached.label),point};
  const [longitude,latitude]=point.coordinates;
  let label='Nearby area';
  try {
    // Reverse lookup receives the grid point, never a person's original coordinates.
    const [feature]=await geocode('/reverse',{lat:String(latitude),lon:String(longitude),limit:'1',lang:'en'});
    const p=feature?.properties || {};
    const locality=part(p.city)||part(p.county)||part(p.state);
    if (locality) label=[...new Set([`${locality} area`,part(p.state),part(p.country)].filter(Boolean))].join(', ');
  } catch { /* The coarse point remains usable during a geocoder outage. */ }
  await rows('locationAreas').updateOne({_id:cell},{$setOnInsert:{label,point,createdAt:new Date().toISOString()}},{upsert:true});
  return {cell,label,point};
}
export function geoPage(input: { cell: string; radiusMiles: number; interest?: string; before?: string }, userId: string) {
  const identity=hash(JSON.stringify([userId,input.cell,input.radiusMiles,input.interest||'']));
  let after: {distance:number;id:string}|null=null;
  if (input.before) {
    try { const cursor=JSON.parse(Buffer.from(input.before,'base64url').toString('utf8')); if(cursor.identity!==identity||!Number.isFinite(cursor.distance)||cursor.distance<0||typeof cursor.id!=='string')throw new Error(); after=cursor; }
    catch { throw new AppError(409,'location_query_changed','The area or filters changed. Start from the first page.'); }
  }
  const stages: Document[]=after ? [{$match:{$or:[{distanceMeters:{$gt:after.distance}},{distanceMeters:after.distance,_id:{$gt:after.id}}]}}] : [];
  return {stages,cursor:(row:{_id:string;distanceMeters:number})=>Buffer.from(JSON.stringify({identity,distance:row.distanceMeters,id:row._id})).toString('base64url')};
}
