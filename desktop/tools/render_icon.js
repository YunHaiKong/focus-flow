const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      offscreen: true
    }
  });

  const templatePath = path.join(__dirname, 'icon_template.html');
  await win.loadFile(templatePath);

  // Small delay to ensure CSS layout & rendering finish
  await new Promise(r => setTimeout(r, 400));

  const image = await win.webContents.capturePage();
  const assetsDir = path.join(__dirname, '..', 'assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  const pngPath = path.join(assetsDir, 'icon-clean.png');
  fs.writeFileSync(pngPath, image.toPNG());
  console.log('Captured PNG:', pngPath, 'Size:', image.getSize());

  // Also save as primary icon.png
  fs.writeFileSync(path.join(assetsDir, 'icon.png'), image.toPNG());

  // Build multi-size ICO (256, 128, 64, 48, 32, 16)
  const sizes = [256, 128, 64, 48, 32, 16];
  const pngBuffers = [];

  for (const s of sizes) {
    const scaled = image.resize({ width: s, height: s, quality: 'best' });
    const pngData = scaled.toPNG();
    pngBuffers.push({ size: s, data: pngData });
    if (s === 32) fs.writeFileSync(path.join(assetsDir, 'tray.png'), pngData);
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
  
  // Save as both app.ico and icon.ico (app.ico guarantees cache bust on Windows!)
  fs.writeFileSync(path.join(assetsDir, 'app.ico'), icoBuffer);
  fs.writeFileSync(path.join(assetsDir, 'icon.ico'), icoBuffer);
  console.log('Saved app.ico successfully, size:', icoBuffer.length);

  app.quit();
});
