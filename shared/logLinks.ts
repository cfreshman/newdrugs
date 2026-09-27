/** Diary links may include an internal app URL; previews still use public-fetch validation. */
export function logLinkUrl(value:string){
 const text=value.trim();if(!text||text.length>2048||/[<>\s]/.test(text))throw Error('Enter a website link.');
 const url=new URL(/^[a-z][a-z\d+.-]*:/i.test(text)?text:`https://${text}`);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Use an http or https link without login details.');
 return url.pathname==='/'?`${url.origin}${url.search}${url.hash}`:url.href;
}
export function addedLogLinks(links:string[],value:string){const result=[...new Set([...links.map(logLinkUrl),logLinkUrl(value)])];if(result.length>8)throw Error('A hangout can hold eight links.');return result;}
