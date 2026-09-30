import {z} from 'zod';
/** Shared by manual PAT creation and browser-approved device connections. */
export const agentAccessSchema=z.strictObject({name:z.string().trim().max(60).default('My AI agent').transform(value=>value||'My AI agent'),scope:z.enum(['read','write']),expiresInDays:z.number().int().min(1).max(3650).nullable().default(null)});
export type AgentAccess=z.infer<typeof agentAccessSchema>;
export const deviceStartSchema=z.strictObject({name:z.string().trim().min(1).max(60).default('Remote CLI'),scope:z.enum(['read','write']).default('write')});
export function normalizeUserCode(value:string){const code=value.toUpperCase().replace(/[\s-]/g,'');return /^[A-Z2-9]{8}$/.test(code)?`${code.slice(0,4)}-${code.slice(4)}`:null;}
export interface DeviceStart {device_code:string;user_code:string;verification_uri:string;verification_uri_complete:string;expires_in:number;interval:number}
export interface DevicePreview {userCode:string;name:string;scope:'read'|'write';status:'pending'|'approved'|'denied';expiresAt:string}
export interface DeviceToken {access_token:string;token_type:'Bearer';scope:'read'|'write';expires_in?:number}
