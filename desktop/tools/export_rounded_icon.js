const { nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const assetsDir = path.join(__dirname, '..', 'assets');
const srcPng = path.join(assetsDir, 'test-rounded-26pct.png');
const finalImg = nativeImage.createFromPath(srcPng);

// Save primary PNG files
fs.writeFileSync(path.join(assetsDir, 'icon-rounded.png'), finalImg.toPNG());
fs.writeFileSync(path.join(assetsDir, 'icon.png'), finalImg.toPNG());
fs.writeFileSync(path.join(assetsDir, 'icon-clean.png'), finalImg.toPNG());

// Build multi-size Windows ICO: 256, 128, 64, 48, 32, 16
const sizes = [256, 128, 64, 48, 32, 16];
const pngBuffers = [];

for (const s of sizes) {
  const scaled = finalImg.resize({ width: s, height: s, quality: 'best' });
  pngBuffers.push({ size: s, data: scaled.toPNG() });
}

const count = pngBuffers.length;
const headerSize = 6 + count * 16;
let currentOffset = headerSize;

const entryBuffers = [];
const dataBuffers = [];

for (const item of pngBuffers) {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(item.size >= 256 ? 0 : item.size, 0);
  entry.writeUInt8(item.size >= 256 ? 0 : item.size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(item.data.length, 8);
  entry.writeUInt32LE(currentOffset, 12);
  entryBuffers.push(entry);
  dataBuffers.push(item.data);
  currentOffset += item.data.length;
}

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(count, 4);

const icoBuffer = Buffer.concat([header, ...entryBuffers, ...dataBuffers]);

const icoTargets = [
  path.join(assetsDir, 'focus-rounded.ico'),
  path.join(assetsDir, 'focus.ico'),
  path.join(assetsDir, 'icon.ico'),
  path.join(assetsDir, 'app.ico')
];

for (const target of icoTargets) {
  fs.writeFileSync(target, icoBuffer);
}

console.log('Successfully exported rounded squircle icon package!');
process.exit(0);
