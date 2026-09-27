import {z} from 'zod';
import {appearanceMode} from './appearance';
import {parseDestination,type Destination} from './navigation';
export const fontFamilySchema=z.enum(['mono','sans','serif']);
export const landingPageSchema=z.enum(['agent','posts','friends','log']);
export const accountPreferencesSchema=z.object({font:fontFamilySchema.default('mono'),appearance:appearanceMode,landingPage:landingPageSchema,revision:z.number().int().nonnegative()});
export type AccountPreferences=z.infer<typeof accountPreferencesSchema>;
export const defaultPreferences:AccountPreferences={font:'mono',appearance:'light',landingPage:'agent',revision:0};
export function initialDestination(url:string,origin:string,landing:AccountPreferences['landingPage']):Destination|null{
 const value=new URL(url,origin);
 if(value.pathname==='/'&&!value.search&&!value.hash)return {view:landing==='posts'?'feed':landing==='friends'?'people':landing==='log'?'log':'chat'};
 return parseDestination(url,origin);
}
