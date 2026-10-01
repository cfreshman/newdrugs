export const DIRECT_MESSAGE_GROUP_MS=60_000,DIRECT_MESSAGE_TIME_GAP_MS=60*60_000;
type DatedMessage={fromId:string;createdAt:string};
const timestamp=(value:string)=>{const time=Date.parse(value);return Number.isFinite(time)?time:null;};

export function directMessageLayout(messages:DatedMessage[]){
 return messages.map((message,index)=>{
  const at=timestamp(message.createdAt),previous=messages[index-1],next=messages[index+1],previousAt=previous?timestamp(previous.createdAt):null,nextAt=next?timestamp(next.createdAt):null;
  const previousGap=at!==null&&previousAt!==null?at-previousAt:null,nextGap=at!==null&&nextAt!==null?nextAt-at:null;
  return {
   groupWithPrevious:Boolean(previous&&previous.fromId===message.fromId&&previousGap!==null&&previousGap>=0&&previousGap<=DIRECT_MESSAGE_GROUP_MS),
   groupWithNext:Boolean(next&&next.fromId===message.fromId&&nextGap!==null&&nextGap>=0&&nextGap<=DIRECT_MESSAGE_GROUP_MS),
   showTime:index===0||previousGap===null||previousGap>=DIRECT_MESSAGE_TIME_GAP_MS,
  };
 });
}

export function directMessageTimeLabel(value:string,now=new Date()){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 const start=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime(),day=new Date(date.getFullYear(),date.getMonth(),date.getDate()).getTime(),days=Math.round((start-day)/86_400_000);
 const time=date.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
 if(days===0)return `Today ${time}`;
 if(days===1)return `Yesterday ${time}`;
 if(days>1&&days<7)return `${date.toLocaleDateString(undefined,{weekday:'long'})} ${time}`;
 const calendar=date.toLocaleDateString(undefined,{month:'short',day:'numeric',...(date.getFullYear()===now.getFullYear()?{}:{year:'numeric'})});
 return `${calendar}, ${time}`;
}

export function inboxTimeLabel(value:string,now=new Date()){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 if(date.toDateString()===now.toDateString())return date.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
 return date.toLocaleDateString(undefined,{month:'short',day:'numeric',...(date.getFullYear()===now.getFullYear()?{}:{year:'numeric'})});
}
