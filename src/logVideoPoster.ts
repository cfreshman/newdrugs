export function logVideoPoster(src:string,id:string){
 const invite=/^\/api\/log-invites\/[a-f0-9]{32}\/media\/[0-9a-f-]{36}$/.test(src);
 return invite?`${src}/poster`:`/api/files/${id}/poster`;
}
