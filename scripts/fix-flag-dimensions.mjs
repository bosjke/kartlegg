#!/usr/bin/env node
/* Flags are displayed at their natural aspect ratio via an <img> that
   shrink-wraps. SVGs with only a viewBox have no intrinsic size and collapse,
   so stamp width/height attributes derived from the viewBox (normalized to
   150 px tall). Run after replacing anything in data/flags/. */
import fs from 'node:fs';
import path from 'node:path';

const dir = new URL('../data/flags/', import.meta.url).pathname;
let fixed = 0, skipped = 0;

for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith('.svg')) continue;
  const p = path.join(dir, file);
  let s = fs.readFileSync(p, 'utf8');
  const open = s.match(/<svg\b[^>]*>/);
  if (!open) { skipped++; continue; }
  const tag = open[0];
  const vb = tag.match(/viewBox="([\d.\s+-]+)"/);
  if (!vb) { skipped++; continue; }
  const [, , w, h] = vb[1].trim().split(/\s+/).map(Number);
  if (!(w > 0 && h > 0)) { skipped++; continue; }
  const H = 150, W = Math.round((150 * w / h) * 100) / 100;
  let nt = tag
    .replace(/\s(width|height)="[^"]*"/g, '')            // drop any existing
    .replace('<svg', `<svg width="${W}" height="${H}"`); // stamp normalized
  s = s.replace(tag, nt);
  fs.writeFileSync(p, s);
  fixed++;
}
console.log(`flags: ${fixed} stamped, ${skipped} skipped`);
