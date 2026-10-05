import {postMentionTokens} from '../shared/postFeatures';

export interface ComposerSelection {start:number;end:number}
export function completedMentionHandles(text:string,selection:ComposerSelection|null){
 const handles=postMentionTokens(text).filter(token=>{
  if(!selection)return true;
  if(selection.start===selection.end)return selection.start<token.start||selection.start>token.end;
  return selection.end<=token.start||selection.start>=token.end;
 }).map(token=>token.handle);
 return [...new Set(handles)];
}
