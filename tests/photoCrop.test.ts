import {it,expect} from 'vitest';
import {centeredCrop,boundCrop,moveCrop,zoomCrop} from '../src/photoCrop';
it('centers a square inside portrait and landscape photos',()=>{
 expect(centeredCrop({width:4000,height:3000})).toEqual({x:500,y:0,size:3000});expect(centeredCrop({width:3000,height:4000})).toEqual({x:0,y:500,size:3000});
});
it('keeps drags inside the source and bounds zoom to the reference’s 1–6 range',()=>{
 const image={width:4000,height:3000},crop=centeredCrop(image);
 expect(boundCrop(image,{size:3000,x:8000,y:-20})).toEqual({x:1000,y:0,size:3000});
 expect(zoomCrop(image,crop,100).size).toBe(500);expect(zoomCrop(image,crop,.1).size).toBe(3000);
});
it('keeps the source under the pinch focal point while panning and zooming together',()=>{
 const image={width:4000,height:3000},crop={x:1000,y:500,size:1000},from={x:.3,y:.7},to={x:.5,y:.6};
 const next=moveCrop(image,crop,600,from,to);
 expect(next.x+to.x*next.size).toBeCloseTo(crop.x+from.x*crop.size);expect(next.y+to.y*next.size).toBeCloseTo(crop.y+from.y*crop.size);
});
it('reverses a drag without jumps when changing between one and two pointers',()=>{
 const image={width:4000,height:3000},crop={x:1000,y:800,size:1000};
 const dragged=moveCrop(image,crop,crop.size,{x:.5,y:.5},{x:.6,y:.5});expect(dragged).toEqual({x:900,y:800,size:1000});
 const pinched=moveCrop(image,dragged,800,{x:.5,y:.5},{x:.5,y:.5});
 expect(moveCrop(image,pinched,1000,{x:.5,y:.5},{x:.5,y:.5})).toEqual(dragged);
});
