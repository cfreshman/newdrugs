import {useEffect,useState} from 'react';
import type {PostPoll as Poll} from '../shared/postFeatures';

export function PostPoll({poll,vote,busy,canVote}:{poll:Poll;vote(index:number):void;busy:boolean;canVote:boolean}){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{
  setNow(Date.now());if(!poll.expiresAt)return;const remaining=Date.parse(poll.expiresAt)-Date.now();
  if(remaining<=0)return;
  const timer=setTimeout(()=>setNow(Date.now()),remaining+50);
  return()=>clearTimeout(timer);
 },[poll.expiresAt]);
 const expired=poll.expired||Boolean(poll.expiresAt&&Date.parse(poll.expiresAt)<=now),showResults=expired||poll.userVoteIndex!==null||!canVote;
 return <section className="post-poll" aria-label="Poll">
  <div className="view-tabs post-poll-options">{poll.items.map((item,index)=>{
   const count=poll.counts[index]||0,percent=poll.totalVotes?Math.round(count*100/poll.totalVotes):0,selected=poll.userVoteIndex===index;
   return <button key={index} className="post-poll-option" type="button" aria-pressed={showResults?selected:undefined} disabled={busy||showResults} onClick={()=>vote(index)}>
    {showResults&&<span className="post-poll-fill" style={{width:`${percent}%`}} aria-hidden="true"/>}
    <span className="post-poll-option-content"><span>{item}</span>{showResults&&<strong>{percent}%</strong>}</span>
   </button>;
  })}</div>
  <p className="quiet small post-poll-footer">{poll.totalVotes} {poll.totalVotes===1?'vote':'votes'} · {expired?'Ended':poll.expiresAt?`Ends ${new Date(poll.expiresAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`:'Ongoing'}</p>
 </section>;
}
