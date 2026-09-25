import { readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export async function prepareVersion(production = false) {
  const files = ['shared/catalog.ts','shared/contracts.ts','shared/navigation.ts','shared/search.ts','shared/geo.ts','server/operations.ts','server/postProjection.ts','server/operationSearch.ts','server/resourceLinks.ts','server/mcp.ts','server/uploads.ts','server/locations.ts',...(await readdir('cli')).filter(name=>name.endsWith('.ts')).map(name=>`cli/${name}`),...(await readdir('server/search')).filter(name=>name.endsWith('.ts')).map(name=>`server/search/${name}`)].sort();
  const hash = createHash('sha256');
  for (const file of files) { hash.update(file); hash.update(await readFile(file)); }
  const operationsHash = hash.digest('hex');
  const previous = JSON.parse(await readFile('release.json','utf8'));
  let next = previous;
  if (production) {
    let [major,minor,patch] = previous.version.split('.').map(Number);
    if (previous.operationsHash && previous.operationsHash !== operationsHash) { minor++; patch=0; }
    patch++;
    next = {version:`${major}.${minor}.${patch}`,operationsHash};
    await writeFile('release.json.tmp',JSON.stringify(next,null,2)+'\n'); await rename('release.json.tmp','release.json');
  }
  // Draft contracts need a precise identity without publishing a new release number.
  const contract = JSON.stringify({ revision: operationsHash }, null, 2)+'\n';
  const oldContract = await readFile('operation-build.json','utf8').catch(()=>'');
  if (contract !== oldContract) { await writeFile('operation-build.json.tmp',contract); await rename('operation-build.json.tmp','operation-build.json'); }
  console.log(`New Drugs v${next.version}`);
  return next.version;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareVersion(process.argv.includes('--prod'));
