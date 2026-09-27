import {z} from 'zod';
export const appearanceMode=z.enum(['light','dark','system']);
export type AppearanceMode=z.infer<typeof appearanceMode>;
export function resolvedAppearance(mode:AppearanceMode,systemDark:boolean):'light'|'dark'{return mode==='system'?(systemDark?'dark':'light'):mode;}
