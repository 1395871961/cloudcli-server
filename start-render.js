// Diagnostic server: passes health check immediately, reports module errors via HTTP
import { createServer } from 'http';
import os from 'os';

const PORT = process.env.PORT || 10000;
const results = [
  `Node: ${process.version}`,
  `Platform: ${os.platform()} ${os.arch()}`,
  `HOME: ${os.homedir()}`,
  `DATABASE_PATH: ${process.env.DATABASE_PATH}`,
  `PORT env: ${process.env.PORT}`,
];

async function runTests() {
  for (const [name, fn] of [
    ['better-sqlite3', async () => {
      const { default: D } = await import('better-sqlite3');
      const db = new D(':memory:');
      db.close();
    }],
    ['bcryptjs', async () => { await import('bcryptjs'); }],
    ['ws', async () => { await import('ws'); }],
    ['express', async () => { await import('express'); }],
  ]) {
    try { await fn(); results.push(`${name}: OK`); }
    catch (e) { results.push(`${name}: FAIL - ${e.message}`); }
  }
  // Try writing to DATABASE_PATH dir
  try {
    const { mkdirSync, writeFileSync } = await import('fs');
    const { dirname } = await import('path');
    const dir = process.env.DATABASE_PATH ? dirname(process.env.DATABASE_PATH) : '/tmp';
    mkdirSync(dir, { recursive: true });
    writeFileSync(dir + '/test.txt', 'ok');
    results.push(`DB dir writable: YES (${dir})`);
  } catch (e) { results.push(`DB dir writable: NO - ${e.message}`); }
}

runTests();

createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(results.join('\n') + '\n');
}).listen(PORT, '0.0.0.0', () => console.log('Diagnostic server on port', PORT));
