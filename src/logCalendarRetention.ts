/** Keep visited DOM/image elements warm without retaining an unlimited diary. */
export const LOG_RETAINED_WEEKS=260,LOG_RETAINED_THUMBNAILS=512;
export function retainCalendarWeeks(previous:Map<string,number>,visible:string[],imageCount:(week:string)=>number){
 const retained=new Map(previous),protectedWeeks=new Set(visible);
 for(const week of retained.keys())retained.set(week,imageCount(week));
 for(const week of visible){retained.delete(week);retained.set(week,imageCount(week));}
 let images=[...retained.values()].reduce((sum,count)=>sum+count,0);
 for(const [week,count]of retained){
  if(retained.size<=LOG_RETAINED_WEEKS&&images<=LOG_RETAINED_THUMBNAILS)break;
  if(protectedWeeks.has(week))continue;
  retained.delete(week);images-=count;
 }
 return retained;
}
