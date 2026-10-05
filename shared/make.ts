import {z} from 'zod';
import {squareLayerSchema,squareProjectSchema} from '../src/squareModel';
import {logEntrySchema} from './log';

const fileSource=z.string().regex(/^file:[0-9a-f-]{36}$/i).describe('An existing image upload owned by the caller; the server embeds its pixels in the draft.');
const imageUrlSource=z.union([z.url().max(2048).refine(value=>value.startsWith('https://'),'Use an HTTPS image URL.'),z.string().regex(/^\/api\/files\/[0-9a-f-]{36}$/i)]).describe('One public HTTPS image URL, or an exact /api/files/<id> path. The server fetches and embeds bounded PNG, JPEG or WebP pixels. Local and private-network targets are blocked.');
const makeLayer=squareLayerSchema.safeExtend({src:z.union([squareLayerSchema.shape.src.unwrap(),fileSource,imageUrlSource]).optional()});
export const makeProjectInput=z.strictObject({version:z.literal(1).default(1),color:z.string().regex(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i).default('#ffffff'),layers:z.array(makeLayer).max(32)}).describe('The complete 512px Square project. Layer x/y/w/h are fractions of the square. Image/drawing src accepts an embedded PNG/JPEG/WebP data URI, file:<owned-upload-UUID>, or a public HTTPS image URL.');
export const makeDraftSummary=z.object({draftId:z.uuid(),revision:z.number().int().positive(),createdAt:z.string(),updatedAt:z.string(),expiresAt:z.string()});
export const makeDraftOutput=makeDraftSummary.extend({project:squareProjectSchema});
export const makeRenderOutput=z.object({draftId:z.uuid(),revision:z.number().int().positive(),mime:z.literal('image/png'),width:z.literal(512),height:z.literal(512),sha256:z.string(),pngBase64:z.string()});
export const makePublishOutput=z.object({draftId:z.uuid(),imageFileId:z.uuid(),entry:logEntrySchema});
