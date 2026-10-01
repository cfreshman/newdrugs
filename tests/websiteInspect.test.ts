import {describe,expect,it} from 'vitest';
import {inspectWebsiteProject} from '../server/websiteInspect';

describe('website draft inspection',()=>{
 it('accepts the site routes and local media that the server serves',()=>{
  const result=inspectWebsiteProject([
   {path:'pages/index.html',content:'<link href="/styles/site.css"><a href="/about/">About</a><img src="/assets/photo.webp">'},
   {path:'pages/about.html',content:'<a href="/">Home</a><script src="../scripts/site.js"></script>'},
   {path:'styles/site.css',content:'body{background:url(../assets/photo.webp)}'},
   {path:'scripts/site.js',content:'document.title="Site"'},
  ],[{path:'assets/photo.webp',fileId:'00000000-0000-4000-8000-000000000001'}]);
  expect(result.issues).toEqual([]);
  expect(result.pages).toEqual(['/','/about']);
 });

 it('reports missing links and executable hrefs without flagging external URLs',()=>{
  const result=inspectWebsiteProject([
   {path:'pages/index.html',content:'<a href="javascript:alert(1)">Bad</a><a href="https://example.com/">External</a><img src="/assets/gone.webp"><div style="background:url(/assets/other.webp)"></div>'},
  ],[]);
  expect(result.issues).toEqual([
   expect.objectContaining({reference:'javascript:alert(1)',kind:'unsafe'}),
   expect.objectContaining({reference:'/assets/gone.webp',kind:'missing'}),
   expect.objectContaining({reference:'/assets/other.webp',kind:'missing'}),
  ]);
 });
});
