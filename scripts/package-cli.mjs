import { mkdir, readFile, writeFile, copyFile, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const release = JSON.parse(await readFile('release.json', 'utf8'));
const app = JSON.parse(await readFile('package.json', 'utf8'));
await mkdir('dist/cli-package/package', { recursive: true });
await mkdir('dist/downloads', { recursive: true });
await copyFile('dist/cli/index.js', 'dist/cli-package/package/index.js');
await chmod('dist/cli-package/package/index.js', 0o755);
await writeFile('dist/cli-package/package/package.json', JSON.stringify({ name: 'newdrugs-cli', version: release.version, type: 'module',
  description: 'Connect an AI agent to New Drugs', engines: { node: '>=22' }, bin: { newdrugs: 'index.js' },
  dependencies: { '@modelcontextprotocol/sdk': app.dependencies['@modelcontextprotocol/sdk'] } }, null, 2));
execFileSync('tar', ['-czf', 'dist/downloads/newdrugs-cli.tgz', '-C', 'dist/cli-package', 'package']);
const sha256 = createHash('sha256').update(await readFile('dist/downloads/newdrugs-cli.tgz')).digest('hex');
await writeFile('dist/downloads/cli.json', JSON.stringify({ name: 'New Drugs CLI', version: release.version, node: '>=22', archive: 'newdrugs-cli.tgz', sha256 }, null, 2));
console.log(`Packaged New Drugs CLI v${release.version}`);
