/**
 * Generate PWA icons from public/icon.svg
 * Run: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const svgBuffer = readFileSync(resolve(root, 'public/icon.svg'));

const targets = [
  { out: 'public/icon-512.png',          size: 512 },
  { out: 'public/icon-192.png',          size: 192 },
  { out: 'public/apple-touch-icon.png',  size: 180 },
  { out: 'public/favicon-32.png',        size: 32  },
];

for (const { out, size } of targets) {
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(resolve(root, out));
  console.log(`✓  ${out}  (${size}×${size})`);
}

// favicon.ico — 32×32 wrapped in ICO
await sharp(svgBuffer)
  .resize(32, 32)
  .png()
  .toFile(resolve(root, 'public/favicon.ico'));
console.log('✓  public/favicon.ico  (32×32)');

console.log('\nAll icons generated.');
