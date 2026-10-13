// Launch script: clears env vars that break Electron
// (ELECTRON_RUN_AS_NODE makes electron behave as plain node;
//  NODE_OPTIONS with --use-system-ca is rejected by electron.exe)
const { spawn } = require('child_process');
const path = require('path');

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;

const electron = require('electron');
const child = spawn(electron, ['.', '--disable-gpu', '--no-sandbox'], {
  stdio: 'inherit',
  env,
  cwd: path.join(__dirname, '.')
});
child.on('close', (code) => process.exit(code));
