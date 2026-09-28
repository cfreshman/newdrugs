export type ShareLinkResult='shared'|'copied'|'cancelled';
async function copyLink(url:string){
 if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);return;}
 const input=document.createElement('textarea');input.value=url;input.readOnly=true;input.style.position='fixed';input.style.opacity='0';document.body.append(input);input.select();
 try{if(!document.execCommand?.('copy'))throw new Error('Copy is unavailable.');}finally{input.remove();}
}
export async function shareLink(url:string,title:string):Promise<ShareLinkResult>{
 if(navigator.share)try{await navigator.share({title,url});return 'shared';}catch(error){if(error&&typeof error==='object'&&'name' in error&&error.name==='AbortError')return 'cancelled';}
 await copyLink(url);return 'copied';
}
