// Genera assets/icon.ico con el murciélago dorado (32x32)
const fs = require('fs');
const path = require('path');
const { deflateSync } = require('zlib');

function makeBatPNG(W, H, rows) {
  const raw = Buffer.alloc(H * (1 + W * 4), 0);
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    const mask = (rows[y] || 0) >>> 0;
    for (let x = 0; x < W; x++) {
      if ((mask >>> (31 - x)) & 1) {
        const o = y * (1 + W * 4) + 1 + x * 4;
        raw[o] = 0xFF; raw[o+1] = 0xD7; raw[o+2] = 0x00; raw[o+3] = 0xFF;
      }
    }
  }
  const compressed = deflateSync(raw);

  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[i] = c;
  }
  const crc32 = (buf) => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const chunk = (type, data) => {
    const tb = Buffer.from(type, 'ascii');
    const lb = Buffer.allocUnsafe(4); lb.writeUInt32BE(data.length);
    const cb = Buffer.allocUnsafe(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])));
    return Buffer.concat([lb, tb, data, cb]);
  };

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Bat design — 32x32 gold silhouette
const ROWS_32 = [
  0x00000000, 0x00000000,
  0x000C3000,  // ear tips
  0x001E7800,  // ears wider
  0x003FFC00,  // head
  0x0FBFFDF0,  // wings start
  0x3FFFFFFC,
  0x7FFFFFFE,
  0xFFFFFFFF,  // full width
  0xFFFFFFFF,
  0x7FFFFFFE,
  0x3FFFFFFC,
  0x1FFFFFF8,
  0x0FFFFFF0,
  0x07FFFFE0,
  0x03FFFFC0,
  0x00FFFF00,
  0x003FFC00,
  0x000FF000,
  0x0007E000,
  0x0003C000,
  0x00018000,
  ...Array(10).fill(0),
];

// Scale 32x32 → 256x256 (8x scale, each pixel becomes 8x8 block)
function scaleRows(rows32, scale) {
  const W = 32 * scale;
  const rows = [];
  for (const row of rows32) {
    for (let sy = 0; sy < scale; sy++) {
      // For W > 32 we need BigInt or a different approach
      // Store as array of pixel values instead
      const pixels = [];
      for (let x = 0; x < 32; x++) {
        const bit = (row >>> (31 - x)) & 1;
        for (let sx = 0; sx < scale; sx++) pixels.push(bit);
      }
      rows.push(pixels);
    }
  }
  return rows;
}

function makeBatPNGScaled(scale) {
  const W = 32 * scale, H = 32 * scale;
  const scaledRows = scaleRows(ROWS_32, scale);

  const raw = Buffer.alloc(H * (1 + W * 4), 0);
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    const row = scaledRows[y] || [];
    for (let x = 0; x < W; x++) {
      if (row[x]) {
        const o = y * (1 + W * 4) + 1 + x * 4;
        raw[o] = 0xFF; raw[o+1] = 0xD7; raw[o+2] = 0x00; raw[o+3] = 0xFF;
      }
    }
  }

  const compressed = deflateSync(raw);
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[i] = c;
  }
  const crc32 = (buf) => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const chunk = (type, data) => {
    const tb = Buffer.from(type, 'ascii');
    const lb = Buffer.allocUnsafe(4); lb.writeUInt32BE(data.length);
    const cb = Buffer.allocUnsafe(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])));
    return Buffer.concat([lb, tb, data, cb]);
  };

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Wrap PNG(s) in ICO container
function makeIco(sizes) {
  const pngs = sizes.map(({ scale, w }) => ({ png: makeBatPNGScaled(scale), w }));
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * pngs.length;

  let offset = headerSize + dirSize;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  const dirs = pngs.map(({ png, w }) => {
    const dir = Buffer.alloc(16);
    dir[0] = w >= 256 ? 0 : w;
    dir[1] = w >= 256 ? 0 : w;
    dir[2] = 0; dir[3] = 0;
    dir.writeUInt16LE(1, 4);
    dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(png.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += png.length;
    return dir;
  });

  return Buffer.concat([header, ...dirs, ...pngs.map(p => p.png)]);
}

const outDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const ico = makeIco([
  { scale: 1, w: 32 },
  { scale: 4, w: 128 },
  { scale: 8, w: 256 },
]);

fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);
console.log('✓ assets/icon.ico generado');
