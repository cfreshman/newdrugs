import {z} from 'zod';

/** The original Logcal question set. Each answer describes the other person. */
export const quizCategories=[
 {key:'animal',label:'Animal'},
 {key:'food',label:'Food / drink'},
 {key:'media',label:'Movie / show / book / game'},
 {key:'place',label:'Place'},
 {key:'activity',label:'Activity'},
 {key:'color',label:'Color'},
 {key:'plant',label:'Flower / plant'},
 {key:'material',label:'Crystal / mineral / material'},
 {key:'emoji',label:'Emoji'},
 {key:'quote',label:'Quote'},
 {key:'other',label:'Anything else'},
] as const;
export type QuizCategory=typeof quizCategories[number]['key'];
const answer=z.string().trim().max(120);
export const quizAnswers=z.strictObject({animal:answer.optional(),food:answer.optional(),media:answer.optional(),place:answer.optional(),activity:answer.optional(),color:answer.optional(),plant:answer.optional(),material:answer.optional(),emoji:answer.optional(),quote:answer.optional(),other:answer.optional()});
export type QuizAnswers=z.infer<typeof quizAnswers>;
export const quizInitialAnswers=quizAnswers.refine(values=>Object.values(values).some(value=>Boolean(value)),'Answer at least one prompt to send a quiz.');
export const quizAnswerPatch=quizAnswers.refine(values=>Object.keys(values).length>0,'Choose a prompt to update.');
export const quizPerson=z.object({id:z.string(),name:z.string(),handle:z.string().optional(),photoId:z.string().optional()});
export const quizOutput=z.object({id:z.string(),members:z.array(z.string()).length(2),people:z.array(quizPerson).length(2),answers:z.record(z.string(),quizAnswers),myAnswered:z.boolean(),otherAnswered:z.boolean(),pinned:z.boolean().default(false),bff:z.boolean().default(false),revision:z.number().int().positive(),createdAt:z.string(),updatedAt:z.string()});
export const quizPage=z.object({items:z.array(quizOutput),nextCursor:z.string().nullable()});
export type Quiz=z.infer<typeof quizOutput>;
