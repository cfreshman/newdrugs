import { icons } from '@phosphor-icons/core';
import * as react from '@phosphor-icons/react';
import { readFile, writeFile } from 'node:fs/promises';

const packageVersion = async name => JSON.parse(await readFile(new URL(`../node_modules/${name}/package.json`, import.meta.url), 'utf8')).version;
const entries = icons.filter(icon => Object.hasOwn(react, icon.pascal_name)).map(icon => ({
  name: icon.pascal_name, slug: icon.name, categories: icon.categories, tags: icon.tags,
  ...(icon.alias ? { alias: icon.alias.pascal_name } : {}),
}));
if (process.argv.includes('--write')) {
  const catalog = { source: 'https://github.com/phosphor-icons/core', license: 'MIT, Phosphor Icons',
    reactVersion: await packageVersion('@phosphor-icons/react'), catalogVersion: await packageVersion('@phosphor-icons/core'), icons: entries };
  await writeFile(new URL('../docs/phosphor-icons.json', import.meta.url), JSON.stringify(catalog, null, 2) + '\n');
  console.log(`Wrote ${entries.length} verified React icon names to docs/phosphor-icons.json`);
} else {
  const query = process.argv.slice(2).join(' ').toLowerCase().trim();
  const words = query.split(/\s+/).filter(Boolean);
  const matches = entries.map(icon => ({ ...icon, score: words.reduce((score, word) => score +
    (icon.name.toLowerCase() === word || icon.slug === word ? 20 : icon.name.toLowerCase().includes(word) ? 5 : 0) +
    (icon.tags.some(tag => tag.toLowerCase().includes(word)) ? 3 : 0) + (icon.categories.includes(word) ? 1 : 0), 0) }))
    .filter(icon => !words.length || icon.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 24);
  for (const icon of matches) console.log(`${icon.name}\t${icon.categories.join(', ')}\t${icon.tags.join(', ')}`);
  if (!matches.length) { console.error('No matching installed Phosphor icon. Search a broader term.'); process.exitCode = 1; }
}
