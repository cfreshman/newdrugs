import {z} from 'zod';
import {destinationPath,parseDestination,type Destination} from './navigation';
export const pageContextCandidate=z.strictObject({route:z.string().min(1).max(2000)});
export type PageContextCandidate=z.infer<typeof pageContextCandidate>;
export interface AgentPageContext extends PageContextCandidate {url:string;surfaceId:Destination['view'];resourceType?:string;resourceId?:string}
/** Only recognized internal routes, without fragments or unrelated query parameters. */
export function capturePageContext(value:string,origin:string):PageContextCandidate|undefined{
 try{const url=new URL(value,origin);if(url.origin!==new URL(origin).origin)return;const destination=parseDestination(url.href,origin);if(!destination)return;const route=destinationPath(destination);if(route.length<=2000)return {route};}catch{return;}
}
