export type GlobalSearchSource='public'|'log'|'chat'|'messages';
export type GlobalSearchKind='person'|'post'|'talk'|'log'|'chat'|'message';
export interface GlobalSearchInput {query:string;sources?:GlobalSearchSource[];limit?:number}
export interface GlobalSearchItem {source:GlobalSearchSource;kind:GlobalSearchKind;id:string;title:string;snippet:string;url:string;score:number}
export interface GlobalSearchResult {items:GlobalSearchItem[];notices:{source:GlobalSearchSource;text:string}[];errors:{source:GlobalSearchSource;message:string}[]}
