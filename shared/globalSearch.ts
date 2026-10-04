export type GlobalSearchSource='public'|'log'|'chat'|'messages';
export type GlobalSearchKind='person'|'post'|'talk'|'log'|'chat'|'message';
export interface GlobalSearchInput {query:string;sources?:GlobalSearchSource[];limitPerSource?:number}
export interface GlobalSearchItem {kind:GlobalSearchKind;id:string;title:string;snippet:string;url:string}
export interface GlobalSearchGroup {source:GlobalSearchSource;items:GlobalSearchItem[];nextCursor:string|null;notices:string[]}
export interface GlobalSearchResult {groups:GlobalSearchGroup[];errors:{source:GlobalSearchSource;message:string}[]}
