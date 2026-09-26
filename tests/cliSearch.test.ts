import {it,expect,vi} from 'vitest';
import {parseSearchArgs,searchCatalog} from '../cli/search';
it('keeps pagination options out of the query, including equals syntax',()=>{
 expect(parseSearchArgs(['saved','posts','--keyword','--limit=7','--cursor','opaque-cursor'])).toEqual({query:'saved posts',mode:'keyword',limit:7,cursor:'opaque-cursor',all:false});
 expect(parseSearchArgs(['--all','--limit','50'])).toEqual({query:'',mode:'semantic',all:true,limit:50});
 for(const args of [['--limit','0'],['--limit=51'],['--cursor'],['--wat']])expect(()=>parseSearchArgs(args)).toThrow();
});
it('follows every returned cursor once without changing the query or hiding failures',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce({matches:[{name:'a'}],total:2,complete:false,nextCursor:'page2',retrieval:{mode:'keyword'}}).mockResolvedValueOnce({matches:[{name:'b'}],total:2,complete:true,nextCursor:null,retrieval:{mode:'keyword'}});
 expect((await searchCatalog(parseSearchArgs(['something','--all','--keyword','--limit','1']),fetch)).matches.map(x=>x.name)).toEqual(['a','b']);
 expect(fetch.mock.calls[1][0]).toEqual({query:'something',mode:'keyword',limit:1,cursor:'page2'});
 const stuck=vi.fn().mockResolvedValue({matches:[],complete:false,nextCursor:'repeat'});
 await expect(searchCatalog(parseSearchArgs(['--all']),stuck)).rejects.toThrow('did not advance');
});
