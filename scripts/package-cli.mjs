import { mkdir, readFile, writeFile, copyFile, chmod, rm, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const release = JSON.parse(await readFile('release.json', 'utf8'));
const app = JSON.parse(await readFile('package.json', 'utf8'));
const origin=process.env.NEWDRUGS_RELEASE_ORIGIN||'https://druggie.org';
if(!['https://druggie.org','https://dev.druggie.org'].includes(origin))throw new Error('Invalid CLI release origin.');
await rm('dist/cli-package', { recursive: true, force: true });
await mkdir('dist/cli-package/package', { recursive: true });
await mkdir('dist/downloads', { recursive: true });
for(const file of await readdir('dist/cli'))if(file.endsWith('.js'))await copyFile(`dist/cli/${file}`,`dist/cli-package/package/${file}`);
await chmod('dist/cli-package/package/index.js', 0o755);
await writeFile('dist/cli-package/package/package.json', JSON.stringify({ name: 'newdrugs-cli', version: release.version, type: 'module',
  description: 'Connect an AI agent to New Drugs', engines: { node: '>=22' }, bin: { newdrugs: 'index.js' },
  scripts: {postinstall:'node postinstall.js'},newDrugsReleaseOrigin:origin,
  dependencies: { '@modelcontextprotocol/sdk': app.dependencies['@modelcontextprotocol/sdk'] } }, null, 2));
execFileSync('tar', ['-czf', 'dist/downloads/newdrugs-cli.tgz', '-C', 'dist/cli-package', 'package']);
const archiveBytes=await readFile('dist/downloads/newdrugs-cli.tgz');
if(archiveBytes.length>64*1024*1024)throw new Error('The CLI archive exceeds the updater safety bound.');
const sha256 = createHash('sha256').update(archiveBytes).digest('hex');
await writeFile('dist/downloads/cli.json', JSON.stringify({ name: 'New Drugs CLI', version: release.version, node: '>=22', archive: 'newdrugs-cli.tgz', sha256,nativeManifest:`native-${release.version}.json` }, null, 2));
console.log(`Packaged New Drugs CLI v${release.version}`);
