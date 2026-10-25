const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'lotecontrol-smoke-'));
const env = {
  ...process.env,
  LOTE_CONTROL_TEST_USER_DATA: userData,
  LOTE_CONTROL_DISABLE_DRIVE_SYNC: '1',
  LOTE_CONTROL_SMOKE_TEST: '1',
};

try {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules', 'electron', 'cli.js'), '.'], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
    timeout: 60000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Smoke test Electron terminou com código ${result.status ?? result.signal}.`);
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
} finally {
  fs.rmSync(userData, { recursive: true, force: true });
}
