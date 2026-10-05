import {generateAuthenticationOptions,generateRegistrationOptions,verifyAuthenticationResponse,verifyRegistrationResponse,type AuthenticationResponseJSON,type RegistrationResponseJSON} from '@simplewebauthn/server';
import {rows} from './db';
import {config} from './config';
import {currentUser,hash,type User} from './auth';
import {verifyAccountPassword} from './account';
import {AppError} from './errors';

interface PasskeyRow {
 _id:string;userId:string;publicKey:string;counter:number;transports:string[];
 deviceType:'singleDevice'|'multiDevice';backedUp:boolean;createdAt:string;lastUsedAt?:string;
}
interface ChallengeRow {
 _id:string;purpose:'register'|'login';sessionId:string;challenge:string;
 userId?:string;passwordHash?:string;expiresAt:Date;
}
const passkeys=()=>rows<PasskeyRow>('passkeys'),challenges=()=>rows<ChallengeRow>('passkeyChallenges');
const origin=new URL(config.uiOrigin).origin,rpID=new URL(config.uiOrigin).hostname;
const challengeId=(purpose:ChallengeRow['purpose'],sessionId:string)=>hash(`passkey:${purpose}:${sessionId}`);
const unavailable=()=>new AppError(401,'passkey','The passkey request expired or could not be verified. Try again.');
const validSession=(sessionId:string)=>{if(!/^[a-f0-9]{64}$/.test(sessionId))throw unavailable();return sessionId;};

async function saveChallenge(purpose:ChallengeRow['purpose'],sessionId:string,challenge:string,user?:User){
 await challenges().updateOne({_id:challengeId(purpose,sessionId)},{$set:{purpose,sessionId,challenge,...(user?{userId:user._id,passwordHash:user.passwordHash}:{}),expiresAt:new Date(Date.now()+5*60000)}},{upsert:true});
}
async function takeChallenge(purpose:ChallengeRow['purpose'],sessionId:string){
 const row=await challenges().findOneAndDelete({_id:challengeId(purpose,sessionId),purpose,sessionId,expiresAt:{$gt:new Date()}});
 if(!row)throw unavailable();
 return row;
}
export async function listPasskeys(userId:string){
 const items=await passkeys().find({userId},{projection:{publicKey:0,counter:0,transports:0}}).sort({createdAt:-1}).limit(10).toArray();
 return {items:items.map(row=>({id:row._id,createdAt:row.createdAt,lastUsedAt:row.lastUsedAt||null}))};
}
export async function beginPasskeyRegistration(userId:string,sessionId:string,currentPassword:string){
 validSession(sessionId);
 const user=await verifyAccountPassword(userId,currentPassword);
 if(!user.handle)throw new AppError(403,'account_required','Save your account before adding a passkey.');
 const existing=await passkeys().find({userId},{projection:{_id:1,transports:1}}).limit(11).toArray();
 if(existing.length>=10)throw new AppError(409,'passkey_limit','Remove a passkey before adding another.');
 const options=await generateRegistrationOptions({rpName:'New Drugs',rpID,userID:new Uint8Array(Buffer.from(user._id,'utf8')),userName:user.handle,userDisplayName:user.name||user.handle,attestationType:'none',authenticatorSelection:{residentKey:'required',userVerification:'required'},excludeCredentials:existing.map(row=>({id:row._id,transports:row.transports}))});
 await saveChallenge('register',sessionId,options.challenge,user);
 return options;
}
export async function completePasskeyRegistration(userId:string,sessionId:string,response:RegistrationResponseJSON){
 validSession(sessionId);
 const challenge=await takeChallenge('register',sessionId);
 const user=await currentUser(userId);
 if(challenge.userId!==userId||challenge.passwordHash!==user.passwordHash)throw unavailable();
 let verified:Awaited<ReturnType<typeof verifyRegistrationResponse>>;
 try{verified=await verifyRegistrationResponse({response,expectedChallenge:challenge.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true});}catch{throw unavailable();}
 if(!verified.verified)throw unavailable();
 const {credential,credentialDeviceType,credentialBackedUp}=verified.registrationInfo;
 const row:PasskeyRow={_id:credential.id,userId,publicKey:Buffer.from(credential.publicKey).toString('base64url'),counter:credential.counter,transports:credential.transports||[],deviceType:credentialDeviceType,backedUp:credentialBackedUp,createdAt:new Date().toISOString()};
 try{await passkeys().insertOne(row);}catch(error){if((error as {code?:number}).code===11000)throw new AppError(409,'passkey_exists','This passkey is already saved.');throw error;}
 return {id:row._id,createdAt:row.createdAt};
}
export async function beginPasskeyLogin(sessionId:string){
 validSession(sessionId);
 const options=await generateAuthenticationOptions({rpID,userVerification:'required',allowCredentials:[]});
 await saveChallenge('login',sessionId,options.challenge);
 return options;
}
export async function completePasskeyLogin(sessionId:string,response:AuthenticationResponseJSON){
 validSession(sessionId);
 const challenge=await takeChallenge('login',sessionId);
 const row=typeof response.id==='string'?await passkeys().findOne({_id:response.id}):null;
 if(!row)throw unavailable();
 let verified:Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
 try{verified=await verifyAuthenticationResponse({response,expectedChallenge:challenge.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,credential:{id:row._id,publicKey:new Uint8Array(Buffer.from(row.publicKey,'base64url')),counter:row.counter,transports:row.transports}});}catch{throw unavailable();}
 if(!verified.verified)throw unavailable();
 const user=await currentUser(row.userId);
 if(response.response.userHandle&&response.response.userHandle!==Buffer.from(user._id,'utf8').toString('base64url'))throw unavailable();
 const updated=await passkeys().updateOne({_id:row._id,userId:row.userId,counter:row.counter},{$set:{counter:verified.authenticationInfo.newCounter,lastUsedAt:new Date().toISOString()}});
 if(!updated.matchedCount)throw unavailable();
 return user;
}
export async function removePasskey(userId:string,id:string,currentPassword:string){
 await verifyAccountPassword(userId,currentPassword);
 const removed=await passkeys().deleteOne({_id:id,userId});
 if(!removed.deletedCount)throw new AppError(404,'passkey_missing','This passkey is no longer saved.');
 return {removed:true};
}
