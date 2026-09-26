import {z} from 'zod';

/** Normalize a URL, never accept pasted markup or browser-script protocols. */
export function attachmentUrl(value:string):string {
  const raw=value.trim();
  if(!raw||raw.length>2048||/[<>\u0000-\u001f]/.test(raw))throw new Error('Enter a website URL.');
  const url=new URL(/^[a-z][a-z\d+.-]*:/i.test(raw)?raw:`https://${raw}`);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port)throw new Error('Use a public http or https URL.');
  const host=url.hostname.toLowerCase();
  if(!host.includes('.')||/(^|\.)(localhost|local|internal|test|invalid)$/.test(host)||/^\d+(\.\d+){3}$/.test(host)||host.includes(':'))throw new Error('Use a public website URL.');
  return url.href;
}
export const postLinksSchema=z.array(z.string().trim().max(2048).refine(value=>{try{attachmentUrl(value);return true;}catch{return false;}},'Use a public website URL.')).max(3).optional();
export function normalizedPostLinks(values:unknown):string[]{return [...new Set((Array.isArray(values)?values:[]).map(value=>attachmentUrl(String(value))))];}

export interface ProviderEmbed {provider:string;src:string;height:number;video?:boolean}
export const EMBED_ORIGINS=['https://open.spotify.com','https://w.soundcloud.com','https://bandcamp.com','https://www.youtube-nocookie.com','https://player.vimeo.com','https://embed.music.apple.com'];
/** Construct player URLs from known resource IDs. No arbitrary iframe HTML reaches the page. */
export function providerEmbed(value:string):ProviderEmbed|null {
  let url:URL;try{url=new URL(attachmentUrl(value));}catch{return null;}
  const host=url.hostname.replace(/^www\./,''),path=url.pathname;
  if(host==='open.spotify.com'){
    const match=path.match(/^\/(?:intl-[a-z]{2}\/)?(?:embed\/)?(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]{22})\/?$/);
    if(match)return {provider:'Spotify',src:`https://open.spotify.com/embed/${match[1]}/${match[2]}`,height:152};
  }
  if(host==='w.soundcloud.com'&&path==='/player/'){const original=url.searchParams.get('url');return original?providerEmbed(original):null;}
  if((host==='soundcloud.com'||host==='api.soundcloud.com')&&/^\/[^/]+\/[^/]+/.test(path)){
    const player=new URL('https://w.soundcloud.com/player/');player.search=new URLSearchParams({url:url.href,auto_play:'false',visual:'false',show_artwork:'true',show_comments:'false',single_active:'true'}).toString();
    return {provider:'SoundCloud',src:player.href,height:166};
  }
  if(host==='bandcamp.com'&&path.startsWith('/EmbeddedPlayer/')){
    const album=path.match(/\/album=(\d{1,16})(?:\/|$)/)?.[1],track=path.match(/\/track=(\d{1,16})(?:\/|$)/)?.[1];
    if(album||track)return {provider:'Bandcamp',src:`https://bandcamp.com/EmbeddedPlayer/${album?`album=${album}/`:''}${track?`track=${track}/`:''}size=large/bgcol=ffffff/linkcol=2867bf/tracklist=false/artwork=small/transparent=true/`,height:120};
  }
  if(['youtube.com','m.youtube.com','youtube-nocookie.com','youtu.be'].includes(host)){
    const id=host==='youtu.be'?path.split('/')[1]:path==='/watch'?url.searchParams.get('v'):path.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
    if(id&&/^[\w-]{11}$/.test(id)){const player=new URL(`https://www.youtube-nocookie.com/embed/${id}`);player.searchParams.set('playsinline','1');const start=url.searchParams.get('t')||url.searchParams.get('start');if(start&&/^\d+s?$/.test(start))player.searchParams.set('start',String(parseInt(start)));return {provider:'YouTube',src:player.href,height:315,video:true};}
  }
  if(host==='vimeo.com'||host==='player.vimeo.com'){
    const match=path.match(/^\/(?:video\/)?(\d{1,12})(?:\/([a-zA-Z0-9]+))?\/?$/);if(match){const player=new URL(`https://player.vimeo.com/video/${match[1]}`);const hash=match[2]||url.searchParams.get('h');if(hash&&/^[a-zA-Z0-9]+$/.test(hash))player.searchParams.set('h',hash);player.searchParams.set('dnt','1');return {provider:'Vimeo',src:player.href,height:315,video:true};}
  }
  if(['music.apple.com','embed.music.apple.com'].includes(host)&&/^\/[a-z]{2}\/(album|song|playlist)\//.test(path)){
    const player=new URL(`https://embed.music.apple.com${path}`);const song=url.searchParams.get('i');if(song&&/^\d+$/.test(song))player.searchParams.set('i',song);return {provider:'Apple Music',src:player.href,height:175};
  }
  return null;
}
