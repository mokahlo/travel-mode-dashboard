const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');

const projectRoot = path.resolve(__dirname, '..');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : null;
      server.close((err) => {
        if (err) return reject(err);
        if (!port) return reject(new Error('Could not determine free port'));
        resolve(port);
      });
    });
  });
}

async function startServer() {
  const port = await getFreePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Server did not start in time. stderr: ${stderr}`));
    }, 5000);

    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      if (text.includes('HydroLogix server listening')) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.once('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited early with code ${code}. stderr: ${stderr}`));
    });
  });

  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();

  for (let i = 0; i < 10; i += 1) {
    if (child.exitCode !== null) return;
    await wait(50);
  }

  child.kill('SIGKILL');
}

test('serves dashboard HTML from root route', async (t) => {
  const { child, baseUrl } = await startServer();
  t.after(async () => {
    await stopServer(child);
  });

  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 200);

  const body = await response.text();
  assert.match(body, /Travel Mode Cost and Environment Dashboard/i);
});

test('estimates distance for PHX to SJC', async (t) => {
  const { child, baseUrl } = await startServer();
  t.after(async () => {
    await stopServer(child);
  });

  const response = await fetch(`${baseUrl}/api/estimate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'PHX', to: 'SJC' }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(payload.from.code, 'PHX');
  assert.equal(payload.to.code, 'SJC');
  assert.ok(payload.distanceMiles > 500 && payload.distanceMiles < 700);
});
