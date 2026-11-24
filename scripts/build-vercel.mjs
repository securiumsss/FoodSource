import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeFileTrace } from '@vercel/nft';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = join(root, '.vercel/output');
const entry = 'backend/dist/vercel.js';
const fn = join(output, 'functions/api.func');
const { fileList } = await nodeFileTrace([join(root, entry)], {
  base: root,
  processCwd: root,
  ignore: [
    'backend/dist/storage/sqlite-storage.js',
    'data/**',
    '**/node_modules/better-sqlite3/**',
    '**/.env*',
  ],
});

await rm(output, { recursive: true, force: true });
await cp(join(root, 'frontend/dist'), join(output, 'static'), { recursive: true });
const files = [...fileList];
// Copy real package files first: npm workspace dependencies are relative symlinks.
await Promise.all(files.map(async file => {
  const dest = join(fn, file);
  await mkdir(dirname(dest), { recursive: true });
  await cp(join(root, file), dest, { verbatimSymlinks: true });
}));
await writeFile(join(fn, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs22.x', handler: entry, launcherType: 'Nodejs' }));
await writeFile(join(output, 'config.json'), JSON.stringify({ version: 3, routes: [
  { src: '/api(?:/.*)?', dest: '/api' },
  { handle: 'filesystem' },
  { src: '/.*', dest: '/index.html' },
] }));
console.log('Vercel output: static SPA and one API function (%d traced files)', files.length);
