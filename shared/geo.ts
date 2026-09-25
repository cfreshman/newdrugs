import { latLngToCell, cellToLatLng, gridDisk, isValidCell, getResolution } from 'h3-js';

export const LOCATION_RESOLUTION = 5;
export const METERS_PER_MILE = 1609.344;
export const LOCATION_METHOD = 'Locations are snapped to fixed coarse grid points, roughly ten miles apart. The server stores the shared area center, not a person’s exact device coordinates. Search radii and distances compare those shared area centers. People at the same point are only in the same approximate area; never describe them as physically 0 miles away, at the same address, or at the user’s location. Prefer the area label and "in your approximate area" for same-area results. A post’s tagged area describes the post, not proof of where its author is.';
export function sharedAreaDistance(originCell: string, targetCell: string, meters: number) {
  const sameArea = originCell === targetCell;
  const approximateMiles = Math.max(5, Math.round(meters / METERS_PER_MILE / 5) * 5);
  return { sameArea, distanceLabel: sameArea ? 'In your approximate area' : `About ${approximateMiles} miles between shared areas`, ...(sameArea ? {} : { approximateMiles }) };
}
export interface CoarseArea { cell: string; label: string; point: { type: 'Point'; coordinates: [number, number] } }
export function isCoarseCell(cell: string) { return isValidCell(cell) && getResolution(cell) === LOCATION_RESOLUTION; }
export function coarsePoint(cell: string): CoarseArea['point'] {
  if (!isCoarseCell(cell)) throw new Error('Choose an approximate location from the map grid.');
  const [latitude, longitude] = cellToLatLng(cell);
  return { type: 'Point', coordinates: [longitude, latitude] };
}
export function distanceMeters(a: [number, number], b: [number, number]) {
  const radians = Math.PI / 180;
  const dLat = (b[0]-a[0])*radians, dLng=(b[1]-a[1])*radians;
  const h=Math.sin(dLat/2)**2+Math.cos(a[0]*radians)*Math.cos(b[0]*radians)*Math.sin(dLng/2)**2;
  return 6371008.8 * 2 * Math.asin(Math.min(1,Math.sqrt(h)));
}
/** Called on the device before any location request. Return only a fixed grid point ID. */
export function nearestCoarseCell(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180) throw new Error('Invalid coordinates.');
  const containing = latLngToCell(latitude, longitude, LOCATION_RESOLUTION);
  return gridDisk(containing, 1).map(cell=>({cell,distance:distanceMeters([latitude,longitude],cellToLatLng(cell))}))
    .sort((a,b)=>a.distance-b.distance || a.cell.localeCompare(b.cell))[0].cell;
}
