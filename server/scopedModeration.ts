import type {Document} from 'mongodb';
/** Join only the candidate's actors or members, never enumerate suspended accounts globally. */
export function unsuspendedActors(field:string):Document[]{return [
 {$lookup:{from:'users',localField:field,foreignField:'_id',pipeline:[{$match:{suspendedAt:{$type:'string'}}},{$project:{_id:1}},{$limit:1}],as:'_suspendedActors'}},
 {$match:{'_suspendedActors.0':{$exists:false}}},{$unset:'_suspendedActors'},
];}
