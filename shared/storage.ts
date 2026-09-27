import {z} from 'zod';
import type {UploadRef} from './uploads';
export const storageTypes=['all','images','audio','video','documents'] as const;
export const storageLocations=['all','hangouts','profile','posts','chat'] as const;
export type StorageLocation=typeof storageLocations[number];
export type StorageType=typeof storageTypes[number];
export const storageAttachmentSchema=z.object({label:z.string(),destination:z.object({view:z.enum(['person','post','chat','log']),resourceId:z.string()}),url:z.string()});
export type StorageAttachment=z.infer<typeof storageAttachmentSchema>;
export interface StoredFile extends UploadRef {createdAt:string;attached:boolean;inProfile:boolean;attachments:StorageAttachment[]}
export interface StoragePage {usedBytes:number;limitBytes:number;items:StoredFile[];nextCursor:string|null}
