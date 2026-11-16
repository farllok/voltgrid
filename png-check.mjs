// Decode a PNG with the browser itself: render into a canvas in headless
// Chrome and report pixel statistics, so we know shots are not blank.
// Usage: node png-check.mjs <file.png>
import { readFileSync } from 'node:fs';

// Minimal PNG decode: use zlib inflate + unfilter. Node has zlib built in.
import { inflateSync } from 'node:zlib';

const file = process.argv[2];
const buf = readFileSync(file);
// Parse chunks
let pos = 8;
let width = 0, height = 0, bitDepth = 0, colorType = 0;
const idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('ascii', pos + 4, pos + 8);
  if (type === 'IHDR') {
    width = buf.readUInt32BE(pos + 8);
    height = buf.readUInt32BE(pos + 12);
    bitDepth = buf[pos + 16];
    colorType = buf[pos + 17];
  } else if (type === 'IDAT') {
    idat.push(buf.subarray(pos + 8, pos + 8 + len));
  }
  pos += 12 + len;
}
const raw = inflateSync(Buffer.concat(idat));
const channels = colorType === 6 ? 4 : 3; // truecolor w/wo alpha (Chrome writes 8-bit RGBA)
const stride = width * channels;
// Unfilter
const out = Buffer.alloc(height * stride);
let rp = 0;
for (let y = 0; y < height; y += 1) {
  const filter = raw[rp]; rp += 1;
  const row = raw.subarray(rp, rp + stride); rp += stride;
  const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
  const cur = out.subarray(y * stride, (y + 1) * stride);
  for (let x = 0; x < stride; x += 1) {
    const a = x >= channels ? cur[x - channels] : 0;
    const b = prev ? prev[x] : 0;
    const c = x >= channels && prev ? prev[x - channels] : 0;
    let v = row[x];
    if (filter === 1) v = (v + a) & 0xff;
    else if (filter === 2) v = (v + b) & 0xff;
    else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
    else if (filter === 4) {
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
    }
    cur[x] = v;
  }
}
// Stats
let unique = new Set();
let bright = 0, total = width * height;
let colorSum = [0, 0, 0];
for (let y = 0; y < height; y += 4) {
  for (let x = 0; x < width; x += 4) {
    const i = y * stride + x * channels;
    const r = out[i], g = out[i + 1], b = out[i + 2];
    unique.add((r << 16) | (g << 8) | b);
    if (r + g + b > 150) bright += 1;
    colorSum[0] += r; colorSum[1] += g; colorSum[2] += b;
  }
}
const sampled = Math.ceil(height / 4) * Math.ceil(width / 4);
console.log(JSON.stringify({
  file, width, height, bitDepth, colorType,
  uniqueColors: unique.size,
  brightShare: +(bright / sampled).toFixed(3),
  avgColor: colorSum.map(v => Math.round(v / sampled)),
}));
