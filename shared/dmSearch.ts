export interface DMSearchInput {query:string;connectionId?:string;limit?:number;cursor?:string}
export interface DMSearchItem {id:string;connectionId:string;fromId:string;text:string;createdAt:string;score:number;person:{id:string;name:string;handle?:string;photoId?:string}}
export interface DMSearchResult {items:DMSearchItem[];nextCursor:string|null;mode:'hybrid'|'keyword';indexing:boolean;notices:string[]}
