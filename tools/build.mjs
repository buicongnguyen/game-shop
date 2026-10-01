// Builds the static site for GitHub Pages into dist/ (or `--out=<dir>`, which the tests use).
//
// Copies the page, the web manifest, the service worker, src/ and public/assets/, then stamps
// the service worker with this build's id and precache list:
// - build id: the first 12 hex digits of a SHA-256 over every built file's path and content (the
//   worker counted before stamping), so any change to the site changes sw.js and browsers update;
// - precache list: every built file except sw.js and .nojekyll, as './…' URLs, plus './'.
// The output folder is emptied first, so stale files are neither deployed nor precached.
import { createHash } from 'node:crypto';
import { copyFile, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outArg = process.argv.slice(2).find(arg => arg.startsWith('--out='));
const out = path.resolve(root, outArg ? outArg.slice('--out='.length) : 'dist');
const BUILD_ID_PLACEHOLDER = "const BUILD_ID = 'dev';";
const PRECACHE_PLACEHOLDER = 'const PRECACHE_URLS = [];';
const NOT_PRECACHED = new Set(['sw.js', '.nojekyll']);

// Refuse to empty anything that is not plainly a build folder.
async function emptyOutput() {
  const inside = path.relative(root, out), holder = path.relative(out, root);
  if (!inside || !holder.startsWith('..')) throw new Error(`Refusing to build into ${out}: it contains the project.`);
  if (!inside.startsWith('..') && !path.isAbsolute(inside) && inside.split(path.sep)[0] !== 'dist') throw new Error(`Inside the project, only dist/ may be built into (got ${inside}).`);
  const existing = await readdir(out).catch(() => null);
  if (existing?.length && !(existing.includes('index.html') && existing.includes('.nojekyll'))) throw new Error(`Refusing to empty ${out}: it does not look like an earlier build.`);
  await rm(out, { recursive: true, force: true });
}

async function filesUnder(dir, prefix = '') {
  const list = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) list.push(...await filesUnder(path.join(dir, entry.name), relative));
    else if (entry.isFile()) list.push(relative);
  }
  return list;
}

function replaceOnce(text, placeholder, value) {
  const at = text.indexOf(placeholder);
  if (at < 0 || text.indexOf(placeholder, at + 1) >= 0) throw new Error(`sw.js must contain exactly one "${placeholder}"`);
  return text.slice(0, at) + value + text.slice(at + placeholder.length);
}

await emptyOutput();
await mkdir(out, { recursive: true });
for (const file of ['index.html', 'manifest.webmanifest', 'sw.js']) await copyFile(path.join(root, file), path.join(out, file));
await cp(path.join(root, 'src'), path.join(out, 'src'), { recursive: true });
await cp(path.join(root, 'public/assets'), path.join(out, 'assets'), { recursive: true });
await writeFile(path.join(out, '.nojekyll'), '');

// Plain code-unit order, so the id is the same on every machine and in every locale.
const files = (await filesUnder(out)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const hash = createHash('sha256');
for (const file of files) {
  const content = await readFile(path.join(out, file));
  hash.update(`${file}\0${content.length}\0`).update(content);
}
const buildId = hash.digest('hex').slice(0, 12);
const precache = ['./', ...files.filter(file => !NOT_PRECACHED.has(file)).map(file => './' + file.split('/').map(encodeURIComponent).join('/'))];
const worker = await readFile(path.join(out, 'sw.js'), 'utf8');
const stamped = replaceOnce(replaceOnce(worker, BUILD_ID_PLACEHOLDER, `const BUILD_ID = '${buildId}';`), PRECACHE_PLACEHOLDER, `const PRECACHE_URLS = ${JSON.stringify(precache)};`);
await writeFile(path.join(out, 'sw.js'), stamped);
const shown = path.relative(root, out);
console.log(`Static app built in ${shown.startsWith('..') ? out : shown.replace(/\\/g, '/')}/ (build ${buildId}, ${precache.length} precached URLs)`);
