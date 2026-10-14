const { nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const assetsDir = path.join(__dirname, '..', 'assets');

// Use the 3D Fluid Infinity Ribbon (matching Antigravity caliber) as primary
const fluidImg = nativeImage.createFromPath(path.join(assetsDir, 'test-d1-fluid.png'));
// Also keep Obsidian Loop (matching Qoder/Trae caliber)
const obsidianImg = nativeImage.createFromPath(path.join(assetsDir, 'test-d3-obsidian.png'));

function buildIco(img, icoFileName) {
  const sizes = [256, 128, 64, 48, 32, 16];
  const pngBuffers = [];

  for (const s of sizes) {
    const scaled = img.resize({ width: s, height: s, quality: 'best' });
    const pngData = scaled.toPNG();
    pngBuffers.push({ size: s, data: pngData });
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
  const icoPath = path.join(assetsDir, icoFileName);
  fs.writeFileSync(icoPath, icoBuffer);
  console.log('Saved ICO:', icoPath, 'Size:', icoBuffer.length);
}

// Generate ICOs
buildIco(fluidImg, 'focus-fluid.ico');
buildIco(obsidianImg, 'focus-obsidian.ico');

// Set primary icon (fluid infinity) to focus.ico & icon.png
buildIco(fluidImg, 'focus.ico');
fs.writeFileSync(path.join(assetsDir, 'icon.png'), fluidImg.toPNG());
fs.writeFileSync(path.join(assetsDir, 'tray.png'), fluidImg.resize({ width: 32, height: 32, quality: 'best' }).toPNG());

process.exit(0);
