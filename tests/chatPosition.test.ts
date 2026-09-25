import { expect, it } from 'vitest';
import { clampChat, bottomAnchoredScroll } from '../src/chatPosition';
const dimensions={width:480,gutter:12,radius:36};
it('keeps both sides inside a phone viewport and the composer above its keyboard',()=>{
  const v={width:390,height:420,top:35,left:0};
  const result=clampChat({x:500,y:800},v,156,dimensions);
  expect(result.x).toBe(195); expect(result.y+36).toBeLessThanOrEqual(v.top+v.height-12);
  expect(result.y+36-156).toBeGreaterThanOrEqual(v.top);
});
it('shrinks history from the top while preserving the visible bottom line',()=>{
  expect(bottomAnchoredScroll({top:240,height:400},300,1500)).toBe(340);
  expect(bottomAnchoredScroll({top:1100,height:400},300,1500)).toBe(1200);
});
