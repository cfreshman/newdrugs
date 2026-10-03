import {z} from 'zod';
import type {UploadRef} from './uploads';
export const storageTypes=['all','images','audio','video','documents'] as const;
export const storageLocations=['all','hangouts','profile','posts','chat','websites'] as const;
export type StorageLocation=typeof storageLocations[number];
export type StorageType=typeof storageTypes[number];
export const storageAttachmentSchema=z.object({label:z.string(),destination:z.object({view:z.enum(['person','post','chat','log']),resourceId:z.string()}).optional(),url:z.string()});
export type StorageAttachment=z.infer<typeof storageAttachmentSchema>;
export interface StoredFile extends UploadRef {kind?:'upload';createdAt:string;attached:boolean;inProfile:boolean;inWebsite?:boolean;posterBytes?:number;attachments:StorageAttachment[];attachmentCursor?:string|null}
export interface LinkedVideoItem {kind:'linked_video';id:string;sourceUrl:string;title:string;posterUrl?:string;bytes:number;createdAt:string;postId:string;attachments:StorageAttachment[];attachmentCursor?:string|null}
export interface StoragePage {usedBytes:number;limitBytes:number;items:(StoredFile|LinkedVideoItem)[];nextCursor:string|null;indexing?:boolean}
