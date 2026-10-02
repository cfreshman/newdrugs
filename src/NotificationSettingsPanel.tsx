import {useEffect,useState} from 'react';
import type {NotificationType,NotificationRuleInput} from '../shared/notificationSettings';
import {notificationTypeLabels} from '../shared/notificationSettings';
import {errorText,operation} from './api';

interface Preference {type:NotificationType;enabled:boolean}
interface Rule {id:string;rule:NotificationRuleInput;enabled:boolean;revision:number;targetName?:string;indexing?:boolean}
const ruleLabel=(item:Rule)=>{const rule=item.rule;switch(rule.kind){
 case 'talk_person':return `Talks by ${item.targetName||'this person'}`;
 case 'post_person':return `Posts by ${item.targetName||'this person'}`;
 case 'talk_topic':return `Talks about “${rule.query}”`;
 case 'post_topic':return `Posts about “${rule.query}”`;
 case 'thread_activity':return 'Replies in a watched thread';
 case 'circle_new':return `New Circle people with ${rule.minMutuals}+ mutual friends`;
 case 'birthday':return `Friends' birthdays${rule.daysBefore?` ${rule.daysBefore} day${rule.daysBefore===1?'':'s'} early`:''}`;
 case 'anniversary':return `Log anniversaries${rule.daysBefore?` ${rule.daysBefore} day${rule.daysBefore===1?'':'s'} early`:''}`;
 case 'credit_low':return `Credit below $${(rule.thresholdNanos/1e9).toFixed(2)}`;
 case 'storage_high':return `Storage above ${Math.round(rule.thresholdBytes/1048576)} MB`;
 }};
export function NotificationSettingsPanel(){
 const [items,setItems]=useState<Preference[]>([]),[rules,setRules]=useState<Rule[]>([]),[cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let active=true;void Promise.all([operation<{items:Preference[]}>('notifications.preferences',{}),operation<{items:Rule[];nextCursor:string|null}>('notifications.rules',{})]).then(([preferences,watches])=>{if(active){setItems(preferences.items);setRules(watches.items);setCursor(watches.nextCursor);}}).catch(cause=>{if(active)setError(errorText(cause));});return()=>{active=false;};},[]);
 const update=async(type:NotificationType,enabled:boolean)=>{setBusy(type);setError('');try{const saved=await operation<Preference>('notifications.preference_set',{type,enabled});setItems(previous=>previous.map(item=>item.type===type?saved:item));}catch(cause){setError(errorText(cause));}finally{setBusy('');}};
 const toggleRule=async(item:Rule)=>{setBusy(item.id);setError('');try{const saved=await operation<Rule>('notifications.rule_set',{ruleId:item.id,revision:item.revision,enabled:!item.enabled});setRules(previous=>previous.map(rule=>rule.id===item.id?{...saved,targetName:item.targetName}:rule));}catch(cause){setError(errorText(cause));}finally{setBusy('');}};
 const removeRule=async(item:Rule)=>{setBusy(item.id);setError('');try{await operation('notifications.rule_delete',{ruleId:item.id,revision:item.revision});setRules(previous=>previous.filter(rule=>rule.id!==item.id));}catch(cause){setError(errorText(cause));}finally{setBusy('');}};
 const more=async()=>{if(!cursor||busy)return;setBusy('more');try{const page=await operation<{items:Rule[];nextCursor:string|null}>('notifications.rules',{before:cursor});setRules(previous=>[...previous,...page.items]);setCursor(page.nextCursor);}catch(cause){setError(errorText(cause));}finally{setBusy('');}};
 return <section className="notification-preferences">{items.map(item=><label className="notification-preference" key={item.type}><span>{notificationTypeLabels[item.type]}</span><input type="checkbox" checked={item.enabled} disabled={Boolean(busy)} onChange={event=>void update(item.type,event.target.checked)}/></label>)}
  {rules.length>0&&<><h3>Saved alerts</h3>{rules.map(item=><div className="notification-rule" key={item.id}><span>{ruleLabel(item)}{item.indexing&&<small>Setting up</small>}</span><button type="button" disabled={Boolean(busy)} onClick={()=>void toggleRule(item)}>{item.enabled?'On':'Off'}</button><button type="button" disabled={Boolean(busy)} onClick={()=>void removeRule(item)}>Remove</button></div>)}{cursor&&<button type="button" className="text-link" disabled={Boolean(busy)} onClick={()=>void more()}>More alerts</button>}</>}
  {error&&<p className="error" role="alert">{error}</p>}</section>;
}
