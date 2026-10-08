import {z} from 'zod';
export const DEFAULT_OPENROUTER_MODEL='~anthropic/claude-haiku-latest';
export const agentModelSelection=z.strictObject({model:z.string().trim().min(1).max(150),revision:z.number().int().min(0)});
export interface ModelPrice {input:number;cached:number;cacheWrite:number;output:number;threshold?:number;long?:Omit<ModelPrice,'threshold'|'long'>}
export interface AgentModel {id:string;name:string;context:number;outputLimit:number;reasoning:boolean;price:ModelPrice}
export interface AgentModelSettings {model:string;revision:number;keyConfigured:boolean}
export interface AgentModelSnapshot extends AgentModel {provider:'openrouter';revision:number;selectedAt:string}
