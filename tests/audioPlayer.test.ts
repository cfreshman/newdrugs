// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {AudioPlayer} from '../src/AudioPlayer';
import {setupDOM} from './dom';
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{
 dom=setupDOM();
 vi.spyOn(HTMLMediaElement.prototype,'play').mockImplementation(function(this:HTMLMediaElement){Object.defineProperty(this,'paused',{configurable:true,value:false});this.dispatchEvent(new Event('play'));this.dispatchEvent(new Event('playing'));return Promise.resolve();});
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(function(this:HTMLMediaElement){Object.defineProperty(this,'paused',{configurable:true,value:true});this.dispatchEvent(new Event('pause'));});
});
afterEach(()=>dom.cleanup());
const render=(active=true)=>act(async()=>dom.root.render(createElement(AudioPlayer,{src:'https://example.com/audio.mp3',active})));
it('uses custom accessible controls with no native menu or download action',async()=>{
 await render();const audio=dom.container.querySelector('audio')!;
 expect(audio.hidden).toBe(true);expect(audio.controls).toBe(false);expect(dom.container.querySelector('[download]')).toBeNull();expect(dom.container.querySelector('a')).toBeNull();
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('[aria-label="Play audio"]')!.click());expect(dom.container.querySelector('[aria-label="Pause audio"]')).not.toBeNull();
 act(()=>dom.container.querySelector<HTMLButtonElement>('[aria-label="Pause audio"]')!.click());expect(audio.paused).toBe(true);
});
it('shows progress, supports seeking, and preserves time when hidden',async()=>{
 await render();const audio=dom.container.querySelector('audio')!;Object.defineProperty(audio,'duration',{configurable:true,value:120});
 act(()=>{audio.currentTime=20;audio.dispatchEvent(new Event('loadedmetadata'));});
 expect(dom.container.querySelector('.audio-time')?.textContent).toBe('0:20 / 2:00');
 const seek=dom.container.querySelector<HTMLInputElement>('[aria-label="Seek audio"]')!;
 act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(seek,'45');seek.dispatchEvent(new Event('input',{bubbles:true}));});expect(audio.currentTime).toBe(45);
 expect(dom.container.querySelector('[aria-label="Audio volume"]')).toBeNull();expect(dom.container.querySelector('[aria-label="Mute audio"]')).toBeNull();
 await render(false);expect(audio.paused).toBe(true);expect(audio.currentTime).toBe(45);
});
it('stops the other custom player when another one begins playing',async()=>{
 await act(async()=>dom.root.render(createElement('div',null,createElement(AudioPlayer,{src:'https://example.com/a.mp3'}),createElement(AudioPlayer,{src:'https://example.com/b.mp3'}))));
 const players=dom.container.querySelectorAll<HTMLAudioElement>('audio');const buttons=dom.container.querySelectorAll<HTMLButtonElement>('[aria-label="Play audio"]');
 await act(async()=>buttons[0].click());expect(players[0].paused).toBe(false);
 await act(async()=>buttons[1].click());expect(players[0].paused).toBe(true);expect(players[1].paused).toBe(false);
});
it('does not let a delayed play request restart audio in a hidden tab',async()=>{
 let finish!:()=>void;vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
 await render();await act(async()=>dom.container.querySelector<HTMLButtonElement>('[aria-label="Play audio"]')!.click());await render(false);
 vi.mocked(HTMLMediaElement.prototype.pause).mockClear();await act(async()=>finish());expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
});

it('keeps Log voice playback compact and interruption restarts from the beginning',async()=>{
 await act(async()=>dom.root.render(createElement(AudioPlayer,{src:'/voice.m4a',voiceNote:true,editor:true})));
 const audio=dom.container.querySelector('audio')!;
 expect(dom.container.textContent).toBe('Play voice note');expect(dom.container.querySelector('input')).toBeNull();
 Object.defineProperty(audio,'duration',{configurable:true,value:15});act(()=>audio.dispatchEvent(new Event('loadedmetadata')));
 await act(async()=>dom.container.querySelector('button')!.click());
 act(()=>{audio.currentTime=4;audio.dispatchEvent(new Event('timeupdate'));});expect(dom.container.textContent).toBe('Interrupt 11s');
 act(()=>{audio.currentTime=14.2;audio.dispatchEvent(new Event('timeupdate'));});expect(dom.container.textContent).toBe('Interrupt 1s');
 await act(async()=>dom.container.querySelector('button')!.click());expect(audio.paused).toBe(true);expect(audio.currentTime).toBe(0);expect(dom.container.textContent).toBe('Play voice note');
});
it('uses compatible voice audio without seeking before iOS loads metadata',async()=>{
 const id='a9e1a8b9-fa7c-4dc4-93a7-73a72abd738b';
 await act(async()=>dom.root.render(createElement(AudioPlayer,{src:`/api/files/${id}`,voiceNote:true})));
 const audio=dom.container.querySelector('audio')!;
 expect(audio.getAttribute('src')).toBe(`/api/files/${id}/playback`);
 Object.defineProperty(audio,'currentTime',{configurable:true,get:()=>0,set:()=>{throw Error('Seek before metadata.');}});
 await act(async()=>dom.container.querySelector('button')!.click());
 expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
 expect(dom.container.textContent).toContain('Interrupt');
});
