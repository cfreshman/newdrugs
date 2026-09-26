import {textLinks} from '../shared/links';
interface Node {type:string;value?:string;url?:string;children?:Node[];position?:{start:{offset?:number};end:{offset?:number}}}
/** Linkify prose after Markdown parsing, preserving code and authored links. */
export function remarkBareLinks(){
 return (tree:Node,file:{value?:unknown})=>{
  const source=String(file.value||'');
  const visit=(node:Node)=>{
   if(['link','linkReference','code','inlineCode','html'].includes(node.type)||!node.children)return;
   node.children=node.children.flatMap(child=>{
    // GFM creates some bare-www links before this transform. Normalize only
    // literal autolinks, never an explicitly authored Markdown destination.
    if(child.type==='link'&&child.children?.length===1&&child.children[0].type==='text'&&child.position){
     const raw=source.slice(child.position.start.offset,child.position.end.offset),label=child.children[0].value||'';
     if(raw===label){const matches=textLinks(raw);if(matches.length===1&&matches[0].start===0&&matches[0].end===raw.length)child.url=matches[0].url;else return child.children;}
     return [child];
    }
    if(child.type!=='text'){visit(child);return [child];}
    const text=child.value||'',matches=textLinks(text);if(!matches.length)return [child];
    const result:Node[]=[];let offset=0;
    for(const match of matches){if(match.start>offset)result.push({type:'text',value:text.slice(offset,match.start)});result.push({type:'link',url:match.url,children:[{type:'text',value:text.slice(match.start,match.end)}]});offset=match.end;}
    if(offset<text.length)result.push({type:'text',value:text.slice(offset)});
    return result;
   });
  };
  visit(tree);
 };
}
