const http = require('http');
const path = require('path');
const SyncClient = require('../desktop/src/sync-client');

// Start server
process.env.PORT = 23125;
const server = require('./server');

async function runTest() {
  console.log('--- Starting Tri-Platform Sync Integration Test ---');
  const serverUrl = 'http://localhost:23125';
  const syncKey = 'test_room_' + Date.now();

  let clientBReceivedTasks = false;
  let clientAReceivedFocus = false;

  // 1. Initialize Desktop Client
  const clientA = new SyncClient({
    serverUrl,
    syncKey,
    deviceId: 'client-desktop',
    enabled: true,
    onTasksReceived: tasks => {
      console.log('Client A (Desktop) received tasks:', tasks.map(t => t.title));
    },
    onFocusReceived: fState => {
      console.log('Client A (Desktop) received focus state:', fState.status, fState.remaining);
      if (fState.status === 'running') clientAReceivedFocus = true;
    }
  });

  // 2. Initialize Web/Mobile Client
  const clientB = new SyncClient({
    serverUrl,
    syncKey,
    deviceId: 'client-mobile-web',
    enabled: true,
    onTasksReceived: tasks => {
      console.log('Client B (Mobile/Web) received tasks:', tasks.map(t => t.title));
      if (tasks.some(t => t.title === '跨端同步测试任务')) {
        clientBReceivedTasks = true;
      }
    },
    onFocusReceived: fState => {
      console.log('Client B received focus state:', fState.status);
    }
  });

  clientA.connect();
  clientB.connect();

  await new Promise(r => setTimeout(r, 1200));

  console.log('1. Client A pushes task...');
  clientA.pushTasks([{
    id: 't-test-1',
    title: '跨端同步测试任务',
    date: '2026-10-15',
    status: 'todo',
    priority: 'high',
    updatedAt: Date.now(),
    deleted: false
  }]);

  await new Promise(r => setTimeout(r, 800));

  console.log('2. Client B starts focus...');
  clientB.pushFocus({
    status: 'running',
    running: true,
    paused: false,
    endsAt: Date.now() + 1500 * 1000,
    remaining: 1500,
    totalSeconds: 1500,
    updatedAt: Date.now()
  });

  await new Promise(r => setTimeout(r, 800));

  clientA.disconnect();
  clientB.disconnect();

  if (clientBReceivedTasks && clientAReceivedFocus) {
    console.log('✅ ALL TESTS PASSED: Cross-platform task and focus sync verified!');
    process.exit(0);
  } else {
    console.error('❌ TEST FAILED: clientBReceivedTasks =', clientBReceivedTasks, ', clientAReceivedFocus =', clientAReceivedFocus);
    process.exit(1);
  }
}

setTimeout(runTest, 1000);
