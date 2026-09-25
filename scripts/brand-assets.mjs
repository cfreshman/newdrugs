import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { chromium } from '@playwright/test';

await mkdir('public/icons', { recursive: true });
const icon = await readFile('public/icon.svg');
for (const size of [32, 192, 512]) await sharp(icon).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
await sharp(icon).resize(180, 180).flatten({ background: '#e4cdd5' }).png().toFile('public/icons/apple-touch-icon.png');
const safeIcon = await sharp(icon).resize(352, 352).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 3, background: '#e4cdd5' } }).composite([{ input: safeIcon, left: 80, top: 80 }]).png().toFile('public/icons/maskable-512.png');

const css = await readFile('src/style.css', 'utf8');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@500;700&display=swap" rel="stylesheet"><style>${css}
    .brand { position:absolute; left:64px; bottom:64px; color:#121212; }
    .brand h1 { font:700 96px/1.1 'Noto Sans',sans-serif; letter-spacing:-4px; margin:0 0 20px; }
    .brand p { font:500 34px/1.4 'Noto Sans',sans-serif; margin:0; }
    .brand-icon svg { width:100%; height:100%; }
    .brand-icon { position:absolute; top:60px; right:64px; width:140px; height:140px; }
    </style></head><body><div class="app"><div class="atmosphere"></div><div class="grain"></div><div class="brand-icon">${icon.toString()}</div><div class="brand"><h1>New Drugs</h1><p>Made in New England</p></div></div></body></html>`);
  await page.evaluate(async () => { await document.fonts.load('700 96px "Noto Sans"'); await document.fonts.load('500 34px "Noto Sans"'); await document.fonts.ready; });
  await page.screenshot({ path: 'public/share.png' });
  console.log('Generated PWA icons and 1200×630 link preview from the existing icon, gradient and supplied copy.');
} finally { await browser.close(); }
