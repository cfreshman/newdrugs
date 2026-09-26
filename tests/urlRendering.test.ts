// @vitest-environment jsdom
import {expect,it} from 'vitest';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {textLinks,compactUrlLabel} from '../shared/links';import {LinkedText} from '../src/LinkedText';import {AgentMarkdown} from '../src/AgentMarkdown';
it('recognizes public TLDs, country domains and international domains without a protocol',()=>{
 const input='freshman.dev example.photography example.museum example.co.uk example.io пример.рф';
 expect(textLinks(input).map(x=>x.url)).toEqual(input.split(' ').map(x=>'https://'+x));
 expect(textLinks('v0.13.9 plant.webp made.upnotatld cyrus@freshman.dev')).toEqual([]);
});
it('preserves explicit HTTP targets and uses HTTPS for bare URLs without swallowing punctuation',()=>{
 const text='See (freshman.dev/hello?q=1), http://www.example.org/path#part and https://user:pass@example.com/private';
 expect(textLinks(text).map(x=>x.url)).toEqual(['https://freshman.dev/hello?q=1','http://www.example.org/path#part']);
 expect(compactUrlLabel('https://www.example.org/path?q=1#part')).toBe('example.org/path?q=1#part');
 expect(compactUrlLabel('A descriptive title')).toBe('A descriptive title');
});
it('uses compact labels without changing destinations in social text',()=>{
 const node=document.createElement('div');node.innerHTML=renderToStaticMarkup(createElement(LinkedText,{text:'www.freshman.dev http://www.example.org/path'}));
 expect([...node.querySelectorAll('a')].map(a=>[a.textContent,a.getAttribute('href')])).toEqual([['freshman.dev','https://www.freshman.dev'],['example.org/path','http://www.example.org/path']]);
});
it('linkifies Markdown prose without touching code or existing labels, or nesting anchors',()=>{
 const node=document.createElement('div');node.innerHTML=renderToStaticMarkup(createElement(AgentMarkdown,{text:'freshman.dev **example.photography** https://www.example.org/path [A title](https://www.example.com) `code.dev`\n\n```txt\ncode.dev\n```'}));
 expect([...node.querySelectorAll('a')].map(a=>a.textContent)).toEqual(['freshman.dev','example.photography','example.org/path','A title']);
 expect(node.querySelector('a a')).toBeNull();expect(node.querySelector('code a')).toBeNull();
 expect(node.querySelector('a')?.getAttribute('href')).toBe('https://freshman.dev');
});

it('treats literal www links consistently while preserving explicitly authored protocols',()=>{
 const node=document.createElement('div');node.innerHTML=renderToStaticMarkup(createElement(AgentMarkdown,{text:'www.freshman.dev [www.example.org](http://www.example.org) www.example.notarealtld'}));
 expect([...node.querySelectorAll('a')].map(a=>[a.textContent,a.getAttribute('href')])).toEqual([['freshman.dev','https://www.freshman.dev'],['example.org','http://www.example.org']]);
 expect(node.textContent).toContain('www.example.notarealtld');
});
