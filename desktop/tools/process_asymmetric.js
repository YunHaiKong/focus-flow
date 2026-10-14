const { nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const fPath = 'C:\\Users\\23896\\.gemini\\antigravity\\brain\\1c1a1b47-359d-4406-94c7-4029901edeef\\focus_flow_f_monogram_1791972784164.jpg';
const loopPath = 'C:\\Users\\23896\\.gemini\\antigravity\\brain\\1c1a1b47-359d-4406-94c7-4029901edeef\\focus_flow_interlocking_loop_1791972798710.jpg';

function processIcon(src, outPngName, outIcoName, cropSize = 720, insetFactor = 0.938) {
  const master = nativeImage.createFromPath(src);
  const cropX = Math.round((1024 - cropSize) / 2);
  const cropY = Math.round((1024 - cropSize) / 2);
  const cropped = master.crop({ x: cropX, y: cropY, width: cropSize, height: cropSize });

  const size = 512;
  const resized = cropped.resize({ width: size, height: size, quality: 'best' });
  const bmp = resized.toBitmap();

  const cx = size / 2;
  const cy = size / 2;
  const radius = (size / 2) * insetFactor;
  const n = 4.2;

  const outBuf = Buffer.from(bmp);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = Math.abs(x + 0.5 - cx) / radius;
      const ny = Math.abs(y + 0.5 - cy) / radius;
      const dist = Math.pow(nx, n) + Math.pow(ny, n);
      if (dist > 1.02) {
        outBuf[idx + 3] = 0;
      } else if (dist > 0.96) {
        const factor = (1.02 - dist) / 0.06;
        outBuf[idx + 3] = Math.round(255 * Math.max(0, Math.min(1, factor)));
      } else {
        outBuf[idx + 3] = 255;
      }
    }
  }

  const finalImg = nativeImage.createFromBuffer(outBuf, { width: size, height: size });
  const assetsDir = path.join(__dirname, '..', 'assets');
  const pngPath = path.join(assetsDir, outPngName);
  fs.writeFileSync(pngPath, finalImg.toPNG());

  // Multi-size ICO
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
  const icoPath = path.join(assetsDir, outIcoName);
  fs.writeFileSync(icoPath, icoBuffer);
  console.log('Saved:', pngPath, 'and', icoPath);
}

processIcon(fPath, 'icon-f-monogram.png', 'focus-f.ico');
processIcon(loopPath, 'icon-loop.png', 'focus-loop.ico');

process.exit(0);
