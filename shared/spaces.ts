import {z} from 'zod';

export const spaceSchema=z.object({id:z.uuid(),title:z.string(),description:z.string(),hostId:z.string(),hostName:z.string(),status:z.enum(['live','ended']),revision:z.number().int(),createdAt:z.string(),endedAt:z.string().optional(),speakerIds:z.array(z.string()),speakers:z.array(z.object({id:z.string(),name:z.string(),photoId:z.string().optional()})),myRole:z.enum(['host','speaker','listener']).optional(),myRequest:z.enum(['pending','approved','declined']).nullable().optional()});
export const spacePageSchema=z.object({items:z.array(spaceSchema),nextCursor:z.string().nullable()});
export const speakerRequestSchema=z.object({spaceId:z.uuid(),personId:z.string(),name:z.string(),status:z.enum(['pending','approved','declined']),createdAt:z.string()});
export const speakerRequestsSchema=z.object({items:z.array(speakerRequestSchema)});
export type Space=z.infer<typeof spaceSchema>;
