import {z} from 'zod';

const spacePerson=z.object({id:z.string(),name:z.string(),photoId:z.string().optional()});
const spaceParticipant=z.object({id:z.string(),name:z.string(),handle:z.string().optional()});
const spacePin=z.object({id:z.uuid(),kind:z.enum(['post','link']),url:z.string(),postId:z.string().optional(),postText:z.string().optional(),postAuthor:z.string().optional(),addedBy:z.string(),addedByName:z.string().optional(),createdAt:z.string()});
export const spaceSchema=z.object({id:z.uuid(),title:z.string(),description:z.string(),hostId:z.string(),hostName:z.string(),status:z.enum(['starting','live','ended']),revision:z.number().int(),createdAt:z.string(),endedAt:z.string().optional(),speakerIds:z.array(z.string()),speakers:z.array(spacePerson),profileIds:z.array(z.string()).optional(),participantCards:z.array(spaceParticipant).optional(),pins:z.array(spacePin).optional(),speakingCount:z.number().int().nonnegative().optional(),listeningCount:z.number().int().nonnegative().optional(),presentSpeakers:z.array(spacePerson).optional(),presentListeners:z.array(spacePerson).optional(),myRole:z.enum(['host','speaker','listener']).optional(),myRequest:z.enum(['pending','approved','declined']).nullable().optional(),mySpeakerInvite:z.boolean().optional(),invitedSpeakerIds:z.array(z.string()).optional(),hostOffer:z.object({id:z.uuid(),toId:z.string(),expiresAt:z.string()}).optional()});
export const spacePageSchema=z.object({items:z.array(spaceSchema),nextCursor:z.string().nullable()});
export const speakerRequestSchema=z.object({spaceId:z.uuid(),personId:z.string(),name:z.string(),status:z.enum(['pending','approved','declined']),createdAt:z.string()});
export const speakerRequestsSchema=z.object({items:z.array(speakerRequestSchema)});
export type Space=z.infer<typeof spaceSchema>;
