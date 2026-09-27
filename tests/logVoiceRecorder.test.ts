// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {LogVoiceRecorder} from '../src/LogVoiceRecorder';
import {PanelVisibilityContext} from '../src/PanelReadiness';
import {setupDOM} from './dom';
let dom:ReturnType<typeof setupDOM>;
const stopTrack=vi.fn(),getUserMedia=vi.fn();
class Recorder {
 static isTypeSupported=()=>true;
 static current:Recorder;
 state='inactive';mimeType='audio/webm';ondataavailable:any;onstop:any;onerror:any;
 constructor(){Recorder.current=this;}
 start(){this.state='recording';}
 stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['audio'],{type:this.mimeType})});this.onstop?.();}
}
const add=vi.fn(),error=vi.fn(),change=vi.fn();
beforeEach(()=>{dom=setupDOM();vi.useFakeTimers();vi.clearAllMocks();add.mockResolvedValue(undefined);getUserMedia.mockResolvedValue({getTracks:()=>[{stop:stopTrack}]});vi.stubGlobal('MediaRecorder',Recorder);Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia}});});
afterEach(()=>{dom.cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
const render=(visible=true)=>act(async()=>dom.root.render(createElement(PanelVisibilityContext.Provider,{value:visible},createElement(LogVoiceRecorder,{add,error,change,disabled:false}))));
const click=()=>act(async()=>dom.container.querySelector('button')!.click());
it('records a short note with the progress control, then uploads on the 15 second limit',async()=>{
 await render();await click();expect(change).toHaveBeenLastCalledWith(true);expect(dom.container.querySelector('.log-voice-track')?.getAttribute('data-step')).toBe('0');expect(dom.container.querySelector('.log-voice-track svg')).not.toBeNull();
 await act(async()=>vi.advanceTimersByTime(3000));expect(dom.container.querySelector('.log-voice-track')?.getAttribute('data-step')).toBe('3');
 await act(async()=>vi.advanceTimersByTime(12000));expect(add).toHaveBeenCalledOnce();expect(add.mock.calls[0][0].type).toBe('audio/webm');expect(stopTrack).toHaveBeenCalled();expect(change).toHaveBeenLastCalledWith(false);
});
it('cancels without uploading and stops the microphone',async()=>{
 await render();await click();await act(async()=>dom.container.querySelectorAll<HTMLButtonElement>('button')[1].click());
 expect(add).not.toHaveBeenCalled();expect(stopTrack).toHaveBeenCalledOnce();expect(dom.container.textContent).toBe('Record voice note');
});
it('finishes a recording when hidden and disables another take while processing',async()=>{
 let finish!:()=>void;add.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
 await render();await click();await render(false);expect(add).toHaveBeenCalledOnce();expect(dom.container.textContent).toBe('Processing…');expect(dom.container.querySelector('button')!.disabled).toBe(true);
 await act(async()=>finish());expect(change).toHaveBeenLastCalledWith(false);
});
it('releases a late microphone permission result without recording after unmount',async()=>{
 let permit!:()=>void;getUserMedia.mockImplementation(()=>new Promise(resolve=>{permit=()=>resolve({getTracks:()=>[{stop:stopTrack}]});}));
 await render();await click();await act(async()=>dom.root.render(null));await act(async()=>permit());expect(stopTrack).toHaveBeenCalledOnce();expect(add).not.toHaveBeenCalled();expect(change).toHaveBeenLastCalledWith(false);
});
