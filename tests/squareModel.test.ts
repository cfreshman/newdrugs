import {expect,it} from 'vitest';
import {checkRaster,croppedLayer,emptySquare,resizedLayer,snappedLayer,squareHit,squareLayer,transformedLayer} from '../src/squareModel';

it('checks raster dimensions before decoding and rejects oversized images',()=>{
 const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10],0);png.set([73,72,68,82],12);new DataView(png.buffer).setUint32(16,4000);new DataView(png.buffer).setUint32(20,3000);
 expect(checkRaster(png)).toEqual({width:4000,height:3000});new DataView(png.buffer).setUint32(16,17000);expect(()=>checkRaster(png)).toThrow('too large');
 expect(()=>checkRaster(new Uint8Array([71,73,70,56]))).toThrow('PNG, JPEG or WebP');
});

it('keeps image proportions and the opposite corner fixed during resize',()=>{
 const layer=squareLayer('image',{src:'data:image/png;base64,AA==',x:.25,y:.25,w:.5,h:.5});const resized=resizedLayer(layer,.1,-.1);
 expect(resized.w).toBeCloseTo(.6);expect(resized.h).toBeCloseTo(.6);expect(resized.x).toBeCloseTo(.25);expect(resized.y+resized.h).toBeCloseTo(.75);
});

it('pinches and rotates a layer around the fingers and hit-tests the rotated result',()=>{
 const layer=squareLayer('shape',{x:.3,y:.4,w:.4,h:.2});const next=transformedLayer(layer,[{x:.4,y:.5},{x:.6,y:.5}],[{x:.5,y:.3},{x:.5,y:.7}]);
 expect(next.w).toBeCloseTo(.8);expect(next.h).toBeCloseTo(.4);expect(next.angle).toBeCloseTo(90);expect(next.x+next.w/2).toBeCloseTo(.5);expect(next.y+next.h/2).toBeCloseTo(.5);
 expect(squareHit(next,{x:.5,y:.8})).toBe(true);expect(squareHit(next,{x:.8,y:.5})).toBe(false);
});

it('crops the visible source while retaining its center and snaps near the canvas center',()=>{
 const layer=squareLayer('image',{src:'data:image/png;base64,AA==',x:.1,y:.2,w:.8,h:.6});const cropped=croppedLayer(layer,{x:.25,y:0,w:.5,h:1});
 expect(cropped.w).toBeCloseTo(.4);expect(cropped.h).toBeCloseTo(.6);expect(cropped.x+cropped.w/2).toBeCloseTo(.5);expect(cropped.y+cropped.h/2).toBeCloseTo(.5);
 const snap=snappedLayer({...cropped,x:.31,angle:89},320);expect(snap.x).toBe(true);expect(snap.layer.angle).toBe(90);
 expect(emptySquare().layers).toEqual([]);
});
