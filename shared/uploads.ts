export const MAX_UPLOAD_BYTES=12*1024*1024;
export const MAX_ACCOUNT_UPLOAD_BYTES=64*1024*1024;
export type UploadPurpose='profile_photo'|'agent_input'|'log_media';
export interface UploadRef { id:string; name:string; purpose:UploadPurpose; bytes:number; mime:string; sha256:string; ready:boolean; uploadUrl:string; url?:string }
