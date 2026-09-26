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
  await page.setContent(`<html><head><style>${css}</style></head><body><div class="app"><div class="atmosphere"></div></div></body></html>`);
  await page.screenshot({ path: 'public/share.png' });
  console.log('Generated PWA icons and gradient-only 1200×630 link preview.');
} finally { await browser.close(); }
