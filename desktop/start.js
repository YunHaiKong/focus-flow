// Launch script: clears env vars that break Electron
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;

const electron = require('electron');
const logFile = path.join(__dirname, 'app.log');
const outLog = fs.openSync(logFile, 'a');

const child = spawn(electron, ['.', '--disable-gpu', '--no-sandbox'], {
  stdio: ['ignore', outLog, outLog],
  env,
  cwd: path.join(__dirname, '.'),
  detached: true
});

child.unref();
process.exit(0);
