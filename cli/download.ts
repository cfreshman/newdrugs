import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Login } from './config';
import { MAX_UPLOAD_BYTES } from '../shared/uploads';
export async function downloadFile(login:Login,id:string,path:string) {
  if(!/^[a-zA-Z0-9-]{1,100}$/.test(id)||!path)throw new Error('Use file-download <file-id> <destination>.');
  const response=await fetch(new URL(`/api/files/${encodeURIComponent(id)}`,login.url),{redirect:'error',signal:AbortSignal.timeout(60000),headers:{Authorization:`Bearer ${login.token}`}});
  if(!response.ok)throw new Error(`The file is unavailable (${response.status}).`);
  if(!response.body)throw new Error('The file has no contents.');
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_UPLOAD_BYTES){await reader.cancel();throw new Error('The file exceeds the supported size.');}parts.push(value);}
  const destination=resolve(path),file=await open(destination,'wx',0o600);
  try{await file.writeFile(Buffer.concat(parts));}finally{await file.close();}
  return {path:destination,bytes:size};
}
