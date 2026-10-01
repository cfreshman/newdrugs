import {createCanvas,GlobalFonts,loadImage} from '@napi-rs/canvas';
import {resolve} from 'node:path';
import {SquarePainter,type SquarePainterPlatform} from './squareRenderer';
import {parseSquareProject,squareFonts,SQUARE_SIZE} from './squareModel';

const loaded=new Set<string>();
const fontFiles=[...Object.entries(squareFonts).map(([key,family])=>[`${key}.ttf`,family]),['sansItalic.ttf','Noto Sans'],['serifItalic.ttf','Noto Serif'],['emoji.ttf','Noto Color Emoji']];

/** Load pinned font files once per process. No render makes a network request. */
function loadFonts(directory:string){
 const path=resolve(directory);if(loaded.has(path))return;
 for(const [file,family] of fontFiles){
  if(!GlobalFonts.registerFromPath(resolve(path,file),family))throw Error(`Could not load image font ${family}.`);
 }
 loaded.add(path);
}

/** Render the same bounded Square project with Skia Canvas in Node. */
export async function renderSquareNode(raw:unknown,fontDirectory:string){
 const project=parseSquareProject(raw);loadFonts(fontDirectory);
 const platform:SquarePainterPlatform={
  createCanvas:()=>createCanvas(1,1) as unknown as HTMLCanvasElement,
  image:async src=>await loadImage(src) as unknown as HTMLImageElement,
  fonts:async()=>{},
 };
 const painter=new SquarePainter(platform),canvas=createCanvas(SQUARE_SIZE,SQUARE_SIZE);
 try{
  const images=await painter.prepare(project);
  painter.paint(canvas as unknown as HTMLCanvasElement,project,images);
  return canvas.toBuffer('image/png');
 }finally{painter.dispose();}
}
