// Renders the original app icon (src/art/app-icon.js) to the PNG files the web manifest and the
// iOS home screen use, and writes icon.svg next to them.
//
//   node tools/icons.mjs                      write public/assets/icons/*
//   node tools/icons.mjs --preview=sheet.png  also save a contact sheet (home-screen sizes, masks)
//
// Chromium (Playwright) rasterises the SVG at each exact pixel size. The PNGs are then re-encoded
// here: opaque icons lose their alpha channel (iOS paints transparent pixels black), every row
// gets the smallest PNG filter and zlib runs at level 9. An icon still above 40 KB becomes a
// 256-colour palette PNG: the flat fills keep their exact colours and only anti-aliased edge
// pixels are rounded to the nearest of the remaining entries. Every file stays under 60 KB.
// The maskable icon is measured: every visible art pixel must sit inside the central 80% circle.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';
import { appIcon, ART_CIRCLE, SAFE_RADIUS } from '../src/art/app-icon.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = path.join(root, 'public/assets/icons');
const preview = process.argv.slice(2).find(arg => arg.startsWith('--preview='))?.slice('--preview='.length);
const MAX_BYTES = 60 * 1024, QUANTIZE_ABOVE = 40 * 1024;
const ICONS = [
  { file: 'icon-192.png', size: 192, options: {}, transparent: true },
  { file: 'icon-512.png', size: 512, options: {}, transparent: true },
  { file: 'icon-maskable-512.png', size: 512, options: { maskable: true }, transparent: false },
  { file: 'apple-touch-icon.png', size: 180, options: { fullBleed: true }, transparent: false }
];

// ---------------------------------------------------------------- PNG: read 8-bit RGB/RGBA, write RGB/RGBA/palette
const CRC = new Uint32Array(256).map((_, i) => { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = bytes => { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
const predict = (f, a, b, c) => f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? paeth(a, b, c) : 0;

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG file');
  let pos = 8, header = null;
  const idat = [];
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos), type = buffer.toString('latin1', pos + 4, pos + 8), body = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], color: body[9], interlace: body[12] };
    if (type === 'IDAT') idat.push(body);
    if (type === 'IEND') break;
    pos += 12 + length;
  }
  if (!header || header.depth !== 8 || header.interlace !== 0 || ![2, 6].includes(header.color)) throw new Error('Only 8-bit, non-interlaced RGB/RGBA PNGs are supported');
  const channels = header.color === 6 ? 4 : 3, stride = header.width * channels;
  const raw = inflateSync(Buffer.concat(idat)), data = Buffer.alloc(stride * header.height);
  for (let y = 0; y < header.height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1);
    for (let x = 0, at = y * stride; x < stride; x++) {
      const a = x >= channels ? data[at + x - channels] : 0, b = y ? data[at + x - stride] : 0, c = y && x >= channels ? data[at + x - stride - channels] : 0;
      data[at + x] = (line[x] + predict(filter, a, b, c)) & 0xff;
    }
  }
  return { width: header.width, height: header.height, channels, data };
}

function chunk(type, body) {
  const out = Buffer.alloc(12 + body.length), tagged = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  out.writeUInt32BE(body.length, 0); tagged.copy(out, 4); out.writeUInt32BE(crc32(tagged), 8 + body.length);
  return out;
}

// image: { width, height, channels: 3 | 4 | 1 (palette indices), data, palette?: [[r,g,b,a]] }
function encodePng({ width, height, channels, data, palette }) {
  const stride = width * channels, rows = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  const filterAll = mode => {
    const out = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
      let best = 0, bestScore = Infinity;
      for (const f of mode === 'adaptive' ? [0, 1, 2, 3, 4] : [mode]) {
        let score = 0;
        for (let x = 0, at = y * stride; x < stride; x++) {
          const a = x >= channels ? data[at + x - channels] : 0, b = y ? data[at + x - stride] : 0, c = y && x >= channels ? data[at + x - stride - channels] : 0;
          const v = (data[at + x] - predict(f, a, b, c)) & 0xff;
          rows[f][x] = v; score += v < 128 ? v : 256 - v;
        }
        if (score < bestScore) { bestScore = score; best = f; }
      }
      out[y * (stride + 1)] = best; rows[best].copy(out, y * (stride + 1) + 1);
    }
    return deflateSync(out, { level: 9, memLevel: 9 });
  };
  const idat = ['adaptive', 0, 1, 2, 4].map(filterAll).reduce((a, b) => (b.length < a.length ? b : a));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = palette ? 3 : channels === 4 ? 6 : 2;
  const extra = [];
  if (palette) {
    extra.push(chunk('PLTE', Buffer.from(palette.flatMap(([r, g, b]) => [r, g, b]))));
    const lastTranslucent = palette.findLastIndex(entry => entry[3] !== 255);
    if (lastTranslucent >= 0) extra.push(chunk('tRNS', Buffer.from(palette.slice(0, lastTranslucent + 1).map(entry => entry[3]))));
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), ...extra, chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// 256-colour palette by weighted median cut. Colours covering at least 0.05% of the picture (the
// flat fills) are kept exactly; the rest (anti-aliased edges) share the remaining entries.
// Deterministic: every sort breaks ties by the colour value.
function quantize({ width, height, channels, data }) {
  const pixels = width * height;
  const key = i => channels === 4 ? data.readUInt32BE(i) : ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | 255) >>> 0;
  const rgba = k => [k >>> 24, (k >>> 16) & 255, (k >>> 8) & 255, k & 255];
  const counts = new Map();
  for (let i = 0; i < data.length; i += channels) { const k = key(i); counts.set(k, (counts.get(k) || 0) + 1); }
  const colours = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const keep = colours.length <= 256 ? colours : colours.filter(([, c], i) => i < 64 && c >= pixels * 0.0005);
  const palette = keep.map(([k]) => rgba(k));
  const rest = colours.length <= 256 ? [] : colours.slice(keep.length).map(([k, c]) => ({ k, v: rgba(k), c }));
  const spread = box => {
    let total = 0; const mean = [0, 0, 0, 0], sse = [0, 0, 0, 0];
    for (const { v, c } of box) { total += c; for (let ch = 0; ch < 4; ch++) mean[ch] += v[ch] * c; }
    for (let ch = 0; ch < 4; ch++) mean[ch] /= total;
    for (const { v, c } of box) for (let ch = 0; ch < 4; ch++) sse[ch] += c * (v[ch] - mean[ch]) ** 2;
    return { mean, sse };
  };
  const boxes = rest.length ? [rest] : [];
  while (boxes.length && boxes.length < 256 - palette.length) {
    let pick = -1, worst = 0, axis = 0;
    boxes.forEach((box, i) => { if (box.length < 2) return; const { sse } = spread(box); const ch = sse.indexOf(Math.max(...sse)); if (sse[ch] > worst) { worst = sse[ch]; pick = i; axis = ch; } });
    if (pick < 0) break;
    const box = boxes[pick].sort((a, b) => a.v[axis] - b.v[axis] || a.k - b.k);
    const half = box.reduce((sum, { c }) => sum + c, 0) / 2;
    let acc = 0, cut = 1;
    for (let i = 0; i < box.length - 1; i++) { acc += box[i].c; if (acc >= half) { cut = i + 1; break; } }
    boxes.splice(pick, 1, box.slice(0, cut), box.slice(cut));
  }
  for (const box of boxes) palette.push(spread(box).mean.map(Math.round));
  // Translucent entries first keeps the tRNS chunk short.
  palette.sort((a, b) => (a[3] === 255) - (b[3] === 255));
  const nearest = new Map(), indices = Buffer.alloc(pixels);
  let error = 0;
  for (let p = 0, i = 0; p < pixels; p++, i += channels) {
    const k = key(i), v = rgba(k);
    let hit = nearest.get(k);
    if (hit === undefined) {
      let best = Infinity;
      palette.forEach((e, j) => { const d = (e[0] - v[0]) ** 2 + (e[1] - v[1]) ** 2 + (e[2] - v[2]) ** 2 + (e[3] - v[3]) ** 2; if (d < best) { best = d; hit = j; } });
      nearest.set(k, hit);
    }
    const e = palette[hit];
    error += (e[0] - v[0]) ** 2 + (e[1] - v[1]) ** 2 + (e[2] - v[2]) ** 2;
    indices[p] = hit;
  }
  const psnr = 10 * Math.log10(255 ** 2 / Math.max(1e-9, error / (pixels * 3)));
  return { width, height, channels: 1, data: indices, palette, unique: colours.length, psnr };
}

// RGBA with every alpha at 255 → RGB; fully transparent pixels → (0,0,0,0) for better compression.
function tidy(image) {
  const { width, height, data } = image;
  if (image.channels === 3) return image;
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) { if (data[i] !== 255) opaque = false; if (data[i] === 0) data[i - 3] = data[i - 2] = data[i - 1] = 0; }
  if (!opaque) return image;
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) { rgb[j] = data[i]; rgb[j + 1] = data[i + 1]; rgb[j + 2] = data[i + 2]; }
  return { width, height, channels: 3, data: rgb };
}

// ---------------------------------------------------------------- rendering
const page0 = (body, css = '') => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block}${css}</style></head><body>${body}</body></html>`;

async function render(page, svg, size, { transparent, css } = {}) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(page0(svg, css));
  return decodePng(await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } }));
}

// Largest distance of a visible art pixel from the centre, as a fraction of the icon width.
function artReach({ width, height, channels, data }) {
  let reach = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * channels + 3] > 24) reach = Math.max(reach, Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2));
  }
  return reach / width;
}

// Smallest circle around every visible pixel (pixel corners included), in pixels. The farthest
// point is always a row or column extreme, and the max-distance function is convex, so a shrinking
// pattern search over those extremes finds the centre.
function enclosingCircle({ width, height, channels, data }) {
  const seen = (x, y) => data[(y * width + x) * channels + 3] > 24, pts = [];
  for (let y = 0; y < height; y++) { let a = -1, b = -1; for (let x = 0; x < width; x++) if (seen(x, y)) { if (a < 0) a = x; b = x; } if (a >= 0) pts.push([a, y], [b + 1, y], [a, y + 1], [b + 1, y + 1]); }
  for (let x = 0; x < width; x++) { let a = -1, b = -1; for (let y = 0; y < height; y++) if (seen(x, y)) { if (a < 0) a = y; b = y; } if (a >= 0) pts.push([x, a], [x + 1, a], [x, b + 1], [x + 1, b + 1]); }
  const far = (cx, cy) => pts.reduce((m, [x, y]) => Math.max(m, Math.hypot(x - cx, y - cy)), 0);
  let cx = width / 2, cy = height / 2, r = far(cx, cy);
  for (let step = width / 8; step > 0.05;) {
    let moved = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const d = far(cx + dx * step, cy + dy * step);
      if (d < r - 1e-9) { cx += dx * step; cy += dy * step; r = d; moved = true; break; }
    }
    if (!moved) step /= 2;
  }
  return { cx, cy, r };
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  const built = [];
  for (const icon of ICONS) {
    const image = tidy(await render(page, appIcon({ ...icon.options, size: icon.size }), icon.size, { transparent: icon.transparent }));
    if (!icon.transparent && image.channels !== 3) throw new Error(`${icon.file} must be opaque`);
    let png = encodePng(image), note = image.channels === 3 ? 'RGB' : 'RGBA';
    if (png.length > QUANTIZE_ABOVE) {
      const indexed = quantize(image);
      png = encodePng(indexed);
      note = `palette of ${indexed.palette.length} from ${indexed.unique} colours, PSNR ${indexed.psnr.toFixed(1)} dB`;
    }
    built.push({ ...icon, png });
    console.log(`${icon.file.padEnd(22)} ${icon.size}x${icon.size} ${(png.length / 1024).toFixed(1).padStart(5)} KB  ${note}`);
  }
  // The art alone (background hidden): its enclosing circle sets ART_CIRCLE, and the maskable art
  // must stay inside the W3C safe zone.
  const artOnly = '[data-part="background"]{display:none}';
  const circle = enclosingCircle(await render(page, appIcon({ fullBleed: true, size: 512 }), 512, { transparent: true, css: artOnly }));
  const fits = Math.hypot(circle.cx - ART_CIRCLE.cx, circle.cy - ART_CIRCLE.cy) + circle.r <= ART_CIRCLE.r + 0.5;
  console.log(`art circle: cx ${circle.cx.toFixed(1)}, cy ${circle.cy.toFixed(1)}, r ${circle.r.toFixed(1)} (ART_CIRCLE ${JSON.stringify(ART_CIRCLE)}${fits ? '' : ' does not contain it: update ART_CIRCLE in src/art/app-icon.js'})`);
  const reach = artReach(await render(page, appIcon({ maskable: true, size: 512 }), 512, { transparent: true, css: artOnly }));
  console.log(`maskable art reaches ${(reach * 100).toFixed(1)}% of the width from the centre (safe zone ${SAFE_RADIUS * 100}%)`);

  if (preview) {
    const [i192, i512, mask, apple] = built.map(icon => `data:image/png;base64,${icon.png.toString('base64')}`);
    const tile = (src, px, shape = '') => `<figure><img src="${src}" width="${px}" height="${px}" style="${shape}"><figcaption>${px}px</figcaption></figure>`;
    const row = (label, bg, cells) => `<section style="background:${bg}"><h2>${label}</h2><div class="row">${cells}</div></section>`;
    const html = page0(`<main>
${row('any 512 / 192 (desktop, manifest)', '#2a2f3a', tile(i512, 256) + tile(i192, 192) + tile(i192, 96) + tile(i192, 60) + tile(i192, 48) + tile(i192, 32))}
${row('maskable: full / safe circle / circle mask / squircle mask', '#e9eef3', `<figure style="position:relative"><img src="${mask}" width="256" height="256"><i class="safe"></i><figcaption>safe 80%</figcaption></figure>` + tile(mask, 256, 'border-radius:50%') + tile(mask, 60, 'border-radius:50%') + tile(mask, 48, 'border-radius:50%') + tile(mask, 60, 'border-radius:22%'))}
${row('apple-touch-icon 180 (iOS squircle) on light and dark wallpapers', 'linear-gradient(90deg,#f4efe6 50%,#1d2333 50%)', tile(apple, 180, 'border-radius:22.5%') + tile(apple, 60, 'border-radius:22.5%') + tile(apple, 60, 'border-radius:22.5%') + tile(apple, 45, 'border-radius:22.5%'))}
</main>`, 'body{background:#fff;font:14px system-ui}section{padding:10px 16px}h2{margin:0 0 8px;font-size:14px;color:#888}.row{display:flex;gap:18px;align-items:flex-end}figure{margin:0;text-align:center;color:#999}.safe{position:absolute;left:25.6px;top:25.6px;width:204.8px;height:204.8px;border:2px dashed #0a0;border-radius:50%;box-sizing:border-box}');
    await page.setViewportSize({ width: 1180, height: 900 });
    await page.setContent(html);
    await page.waitForFunction(() => [...document.images].every(img => img.complete));
    await page.screenshot({ path: preview, fullPage: true });
    console.log(`preview written to ${preview}`);
  }

  const tooBig = built.filter(icon => icon.png.length > MAX_BYTES);
  if (tooBig.length) throw new Error(`Over ${MAX_BYTES} bytes: ${tooBig.map(icon => `${icon.file} (${icon.png.length})`).join(', ')}`);
  if (reach > SAFE_RADIUS) throw new Error('The maskable art leaves the safe zone');
  await mkdir(outDir, { recursive: true });
  for (const icon of built) await writeFile(path.join(outDir, icon.file), icon.png);
  await writeFile(path.join(outDir, 'icon.svg'), appIcon({ size: 512 }).replace(/\n/g, '') + '\n');
  console.log(`wrote ${built.length} PNGs and icon.svg to public/assets/icons/`);
} finally {
  await browser.close();
}
