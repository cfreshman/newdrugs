export async function adminRequest<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch(`/api/admin${path}`,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const result=await response.json();if(!response.ok)throw new Error(result.error?.message||'Request failed.');return result;
}
