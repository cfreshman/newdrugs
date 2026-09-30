import type {Upload} from './uploads';

interface LogContributionRef {userId:string;fileIds:string[]}
interface LogCoverEntry {members:string[];coverFileId?:string|null;contributions:LogContributionRef[]}

export function orderedLogContributions<T extends LogContributionRef>(entry:{members:string[];contributions:T[]}){
 const byUser=new Map(entry.contributions.map(contribution=>[contribution.userId,contribution]));
 return entry.members.flatMap(userId=>{const contribution=byUser.get(userId);return contribution?[contribution as T]:[];});
}

/** Match Logcal: explicit cover, then earliest photo, then event user/file order when time is unavailable or tied. */
export function selectLogCoverUpload<T extends Pick<Upload,'_id'|'userId'|'mime'> & {createdAt?:string}>(entry:LogCoverEntry,byFile:ReadonlyMap<string,T>){
 const candidates=orderedLogContributions(entry).flatMap((contribution,userOrder)=>contribution.fileIds.flatMap((id,fileOrder)=>{
  const file=byFile.get(id);return file?.userId===contribution.userId&&file.mime.startsWith('image/')?[{file,userOrder,fileOrder}]:[];
 }));
 const explicit=candidates.find(candidate=>candidate.file._id===entry.coverFileId);if(explicit)return explicit.file;
 const timestamp=(value?:string)=>{const parsed=value?Date.parse(value):NaN;return Number.isFinite(parsed)?parsed:null;};
 const times=candidates.map(candidate=>timestamp(candidate.file.createdAt)),allTimed=times.every(value=>value!==null);
 const eventOrder=(a:typeof candidates[number],b:typeof candidates[number])=>a.userOrder-b.userOrder||a.fileOrder-b.fileOrder||a.file._id.localeCompare(b.file._id);
 return [...candidates].sort((a,b)=>allTimed?(timestamp(a.file.createdAt)!-timestamp(b.file.createdAt)!||eventOrder(a,b)):eventOrder(a,b))[0]?.file;
}
