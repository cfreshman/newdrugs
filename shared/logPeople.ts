export function logPersonGrams(value:string){
 const lower=value.toLowerCase(),grams=new Set<string>();
 for(let size=2;size<=3;size++)for(let start=0;start+size<=lower.length;start++)grams.add(lower.slice(start,start+size));
 return [...grams];
}
