import {z} from 'zod';
import {Temporal} from '@js-temporal/polyfill';
export const birthdaySchema=z.strictObject({month:z.number().int().min(1).max(12),day:z.number().int().min(1).max(31)}).refine(value=>{try{Temporal.PlainDate.from({year:2000,...value},{overflow:'reject'});return true;}catch{return false;}},'Choose a valid month and day.');
export type Birthday=z.infer<typeof birthdaySchema>;
export const birthdayPersonSchema=birthdaySchema.safeExtend({personId:z.string(),name:z.string(),handle:z.string().optional()});
export type BirthdayPerson=z.infer<typeof birthdayPersonSchema>;
export function birthdayOn(birthday:Birthday,date:string){const day=Temporal.PlainDate.from(date);return Temporal.PlainDate.from({year:day.year,month:birthday.month,day:birthday.day},{overflow:'constrain'}).equals(day);}
