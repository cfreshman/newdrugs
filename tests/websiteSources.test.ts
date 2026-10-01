import {expect,it} from 'vitest';
import {inspectWebsiteSource,websiteSourceOperation} from '../server/websiteSources';

it('outlines public source links, styles and media without treating text as instructions',()=>{
 const source=inspectWebsiteSource('<title>Walking Club</title><h1>Walks <em>nearby</em></h1><a href="/about">About us</a><link rel="stylesheet" href="/site.css"><img src="/walk.webp">','https://example.com/','html');
 expect(source.title).toBe('Walking Club');
 expect(source.headings).toEqual(['Walks nearby']);
 expect(source.links).toEqual([{url:'https://example.com/about',label:'About us'}]);
 expect(source.resourceUrls).toEqual(['https://example.com/site.css']);
 expect(source.mediaUrls).toEqual(['https://example.com/walk.webp']);
});

it('rejects private or non-HTTPS source URLs before fetching',async()=>{
 const actor={userId:'owner',source:'external',scope:'read'} as const;
 await expect(websiteSourceOperation('website.source.open',{url:'https://127.0.0.1/admin'},actor)).rejects.toMatchObject({code:'website_source_url'});
 await expect(websiteSourceOperation('website.source.open',{url:'http://example.com/'},actor)).rejects.toMatchObject({code:'website_source_url'});
});
