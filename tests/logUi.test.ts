import {it,expect,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SocialExperience} from '../src/SocialExperience';
import {LogEditor} from '../src/LogPanel';
const user={id:'me',name:'Test',bio:'',city:'',interests:[],discoverable:false};
const shell=(registered:boolean)=>renderToStaticMarkup(React.createElement(SocialExperience,{mode:'log',active:true,data:{user:{...user,...(registered?{handle:'test'}:{})},messages:[]} as any,dockOpen:false,reset:0,chatBusy:false,onRoute:vi.fn(),globalNavigate:vi.fn(),openAgent:vi.fn(),signup:vi.fn(),discuss:vi.fn(),example:vi.fn(),openMessage:vi.fn()}));
it('gates the Log body for guests and never embeds a functional calendar or editor in its header',()=>{const guest=shell(false);expect(guest).toContain('Create account or sign in');expect(guest).not.toContain('Search your Log');expect(guest).not.toContain('Add entry for');expect(guest).not.toContain('<h1>Log</h1>');const saved=shell(true);expect(saved).not.toContain('Search your Log');expect(saved).not.toContain('Save this view');expect(saved).not.toContain('<h1>Log</h1>');expect(saved).toMatch(/href="\/log\/scan"[^>]*>Scan<\/a>/);expect(saved.match(/class="log-calendar-history"/g)?.length).toBe(1);});
it('uses the chosen local date and makes privacy and the personal contribution explicit before saving',()=>{const editor=renderToStaticMarkup(React.createElement(LogEditor,{user,date:'2026-02-28',onSaved:vi.fn(),cancel:vi.fn()}));expect(editor).toContain('value="2026-02-28"');expect(editor).toContain('>people</button>');expect(editor).not.toContain('invite someone');expect(editor).toContain('Your note');expect(editor).toContain('Save entry');});
