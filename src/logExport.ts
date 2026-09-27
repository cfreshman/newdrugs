import {logPlainText,type LogPage,type LogEntry} from '../shared/log';
import {operation} from './api';
export async function downloadLog(format:'json'|'txt'){
 const entries:LogEntry[]=[];let before:string|undefined;do{const page=await operation<LogPage>('log.export',{scope:'all',limit:30,...(before?{before}:{})});entries.push(...page.items);before=page.nextCursor||undefined;}while(before);
 const content=format==='json'?JSON.stringify({format:'New Drugs Log',version:1,site:location.origin,exportedAt:new Date().toISOString(),entries},null,2):`New Drugs Log\n${location.origin}\n\n${logPlainText(entries)}`;
 const url=URL.createObjectURL(new Blob([content],{type:format==='json'?'application/json':'text/plain'})),anchor=document.createElement('a');anchor.href=url;anchor.download=`new-drugs-log-${new Date().toISOString().slice(0,10)}.${format}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
