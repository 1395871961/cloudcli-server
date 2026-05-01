// Diagnostic server: passes health check, tries to import full server, reports errors
import { createServer } from 'http';
import os from 'os';

const PORT = process.env.PORT || 10000;
const results = [
  `Node: ${process.version}`,
  `HOME: ${os.homedir()}`,
  `DATABASE_PATH: ${process.env.DATABASE_PATH}`,
  `PORT env: ${process.env.PORT}`,
  `---`,
];

// Start HTTP server immediately so health check passes
const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(results.join('\n') + '\n');
});

httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log('Diagnostic server on port', PORT);

  // Test individual modules
  for (const [name, fn] of [
    ['better-sqlite3', async () => {
      const { default: D } = await import('better-sqlite3');
      const db = new D(':memory:'); db.close();
    }],
    ['bcryptjs', async () => { await import('bcryptjs'); }],
    ['web-push', async () => { await import('web-push'); }],
    ['electron-store', async () => { await import('electron-store'); }],
  ]) {
    try { await fn(); results.push(`${name}: OK`); }
    catch (e) { results.push(`${name}: FAIL - ${e.message}`); }
  }

  // Try loading specific server modules
  for (const mod of [
    './dist-server/server/utils/runtime-paths.js',
    './dist-server/server/database/db.js',
    './dist-server/server/middleware/auth.js',
    './dist-server/server/routes/auth.js',
    './dist-server/server/modules/signal.js',
  ]) {
    try { await import(mod); results.push(`import ${mod.split('/').pop()}: OK`); }
    catch (e) { results.push(`import ${mod.split('/').pop()}: FAIL - ${e.message.slice(0,100)}`); break; }
  }

  results.push('--- done ---');
  console.log(results.join('\n'));
});
