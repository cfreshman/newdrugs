import {createContext,useContext} from 'react';
import type {AppMode} from '../shared/experience';
import type {Destination} from '../shared/navigation';
export interface RecordContext {kind:'post'|'person'|'message'|'log';id:string;title:string}
export interface MediaItem {id:string;url:string;name:string;previewUrl?:string;width?:number;height?:number;element?:HTMLElement}
export interface ExperienceActions {mode:AppMode;changeMode(mode:AppMode):void;ask(context:RecordContext):void;media(items:MediaItem[],index:number):void;navigate(destination:Destination):void}
export const ExperienceContext=createContext<ExperienceActions|null>(null);
export const useExperience=()=>useContext(ExperienceContext);
