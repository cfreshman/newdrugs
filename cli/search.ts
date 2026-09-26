export interface SearchOptions {query:string;mode:'semantic'|'keyword';limit?:number;cursor?:string;all:boolean}
export function parseSearchArgs(args:string[]):SearchOptions {
 const options:SearchOptions={query:'',mode:'semantic',all:false},query:string[]=[];
 for(let i=0;i<args.length;i++){
  const arg=args[i];if(arg==='--'){query.push(...args.slice(i+1));break;}
  if(arg==='--keyword'){options.mode='keyword';continue;}
  if(arg==='--all'){options.all=true;continue;}
  if(arg==='--limit'||arg.startsWith('--limit=')||arg==='--cursor'||arg.startsWith('--cursor=')){
   const [name,...inline]=arg.split('='),value=inline.length?inline.join('='):args[++i];
   if(!value||value.startsWith('--'))throw Error(`Provide a value for ${name}.`);
   if(name==='--limit'){const limit=Number(value);if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('--limit must be an integer from 1 to 50.');options.limit=limit;}
   else options.cursor=value;
  }else if(arg.startsWith('--'))throw Error(`Unknown search option: ${arg}`);
  else query.push(arg);
 }
 options.query=query.join(' ');return options;
}
export interface SearchPage {matches:{name:string;[key:string]:unknown}[];total:number;complete:boolean;nextCursor:string|null;retrieval:unknown}
export async function searchCatalog(options:SearchOptions,fetchPage:(input:Omit<SearchOptions,'all'>)=>Promise<SearchPage>):Promise<SearchPage>{
 const {all,...rest}=options;const input={...rest,...(all&&!rest.limit?{limit:50}:{})};let page=await fetchPage(input);if(!all)return page;
 const matches=[...page.matches],seen=new Set<string>();
 while(!page.complete){
  if(!page.nextCursor||seen.has(page.nextCursor))throw Error('Catalog pagination did not advance. Retry discovery.');
  seen.add(page.nextCursor);page=await fetchPage({...input,cursor:page.nextCursor});matches.push(...page.matches);
 }
 return {...page,matches:[...new Map(matches.map(match=>[match.name,match])).values()]};
}
