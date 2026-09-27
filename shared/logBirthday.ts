import {z} from 'zod';
import {Temporal} from '@js-temporal/polyfill';
export const birthdaySchema=z.strictObject({month:z.number().int().min(1).max(12),day:z.number().int().min(1).max(31)}).refine(value=>{try{Temporal.PlainDate.from({year:2000,...value},{overflow:'reject'});return true;}catch{return false;}},'Choose a valid month and day.');
export type Birthday=z.infer<typeof birthdaySchema>;
export const birthdayPersonSchema=birthdaySchema.safeExtend({personId:z.string(),name:z.string(),handle:z.string().optional()});
export type BirthdayPerson=z.infer<typeof birthdayPersonSchema>;
export function birthdayOn(birthday:Birthday,date:string){const day=Temporal.PlainDate.from(date);return Temporal.PlainDate.from({year:day.year,month:birthday.month,day:birthday.day},{overflow:'constrain'}).equals(day);}

/** The full birthday is owner-only. Public projections continue to use birthdaySchema. */
export const ownBirthdaySchema=birthdaySchema.safeExtend({year:z.number().int().min(1).max(9999).nullable().optional()}).refine(value=>{
 if(value.year==null)return true;
 try{return value.year<=Temporal.Now.plainDateISO().year&&Temporal.PlainDate.from({year:value.year,month:value.month,day:value.day},{overflow:'reject'}).toString().length>0;}catch{return false;}
},'Choose a valid birth year and date.');
export type OwnBirthday=z.infer<typeof ownBirthdaySchema>;
/** Logcal marks whole ages and quarter-years on the week containing each milestone. */
export function logLifeQuarter(birthday:OwnBirthday|null,week:Temporal.PlainDate){
 if(!birthday?.year)return null;
 let birth:Temporal.PlainDate;try{birth=Temporal.PlainDate.from({year:birthday.year,month:birthday.month,day:birthday.day},{overflow:'reject'});}catch{return null;}
 const end=week.add({days:6}),firstMonth=(week.year-birth.year)*12+week.month-birth.month;
 for(const months of [firstMonth,firstMonth+1]){
  if(months<0||months%3)continue;const milestone=birth.add({months},{overflow:'constrain'});
  if(Temporal.PlainDate.compare(milestone,week)<0||Temporal.PlainDate.compare(milestone,end)>0)continue;
  const years=Math.floor(months/12),quarter=months%12/3;return {label:quarter?['','1/4','1/2','3/4'][quarter]:String(years),years,months:quarter*3};
 }
 return null;
}
