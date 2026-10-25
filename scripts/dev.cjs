const { spawn, spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const vitePath = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const electronCli = path.join(root, 'node_modules', 'electron', 'cli.js');
const children = new Set();
let shuttingDown = false;

function start(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true, ...options });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

function stopAll() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try { child.kill('SIGTERM'); } catch {}
  }
  setTimeout(() => process.exit(), 1000).unref();
}

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

async function waitForServer(url, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Servidor Vite não iniciou: ${url}`);
}

(async () => {
  const electronBuild = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-electron.cjs')], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (electronBuild.error) throw electronBuild.error;
  if (electronBuild.status !== 0) throw new Error(`Compilação do processo Electron falhou (${electronBuild.status ?? electronBuild.signal}).`);
  const defaultPort = Number(process.env.LOTE_CONTROL_DEV_PORT) || 5173;
  const base = process.env.VITE_DEV_SERVER_URL || `http://127.0.0.1:${defaultPort}`;
  const viteUrl = new URL(base);
  const vitePort = Number(viteUrl.port) || defaultPort;
  const vite = start(process.execPath, [vitePath, '--host', viteUrl.hostname, '--port', String(vitePort), '--strictPort']);
  vite.once('exit', (code) => { if (!shuttingDown && code) stopAll(); });
  await waitForServer(base);
  const electron = start(process.execPath, [electronCli, '.'], { env: { ...process.env, VITE_DEV_SERVER_URL: base } });
  electron.once('exit', () => stopAll());
})().catch((error) => {
  console.error(error.message || error);
  stopAll();
  process.exitCode = 1;
});
