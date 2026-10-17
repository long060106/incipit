// The site's tests: `npm test` (server and pages), `npm run test:api` (server only, no browser).
//
// Builds the site, then starts a server of its own on this machine (wrangler dev, port 8790)
// with a database made new for this run in .wrangler/test-state, so that the tests never
// touch the site itself nor the database `npm run dev` uses. The tests make accounts there,
// with passwords made up as they run and never printed.
//
//   --api-only   skip the pages (no browser needed)
//   --no-build   test the build already in ./dist
//
// The pages are opened in Microsoft Edge (BROWSER_CHANNEL=chrome for Chrome).
import { generateKeyPairSync } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 8790;
const BASE = `http://127.0.0.1:${PORT}`;
const STATE = join('.wrangler', 'test-state');
const args = process.argv.slice(2);
const apiOnly = args.includes('--api-only');
const windows = process.platform === 'win32';

const step = (title, command) => {
  console.log(`\n── ${title}`);
  const done = spawnSync(command, { stdio: 'inherit', shell: true, env: { ...process.env, CI: '1' } });
  if (done.status !== 0) {
    console.error(`\n${title}: failed.`);
    process.exit(done.status ?? 1);
  }
};

if (!args.includes('--no-build')) step('Building', 'npm run build');
try {
  rmSync(STATE, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
} catch {
  console.error(`\n${STATE} is held by something else: is a test server from an earlier run still open? Close it and run again.`);
  process.exit(1);
}
step('A new database', `npx wrangler d1 migrations apply incipit --local --persist-to ${STATE}`);
step('Its essays', `npx wrangler d1 execute incipit --local --persist-to ${STATE} --file tests/seed.sql`);

// Google is stood in for: the server is told to trust a pair of keys made here, and the tests sign
// the tokens "from Google" with the other half (worker/index.ts, keysOfGoogle). These keys sign
// nothing outside this run.
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const keys = Buffer.from(JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' }] })).toString('base64url');
process.env.TEST_GOOGLE_KEY = Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64');

console.log(`\n── A server at ${BASE}`);
// MAIL_DEV: a letter is handed back in the answer instead of sent (worker/index.ts, mailDev).
const vars = `--var MAIL_DEV:1 --var GOOGLE_CLIENT_ID:test-client.apps.googleusercontent.com --var ACCOUNT_SEAL_KEY:a-seal-key-for-this-run-only --var GOOGLE_DEV_KEYS:${keys}`;
const server = spawn(`npx wrangler dev --ip 127.0.0.1 --port ${PORT} --persist-to ${STATE} ${vars} --show-interactive-dev-session=false`, {
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: !windows,
});
let log = '';
server.stdout.on('data', (chunk) => (log += chunk));
server.stderr.on('data', (chunk) => (log += chunk));

const stop = () => {
  if (server.exitCode !== null) return;
  if (windows) spawnSync(`taskkill /pid ${server.pid} /T /F`, { shell: true, stdio: 'ignore' });
  else process.kill(-server.pid, 'SIGTERM');
};
process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));

let up = false;
for (let tries = 0; tries < 120 && !up && server.exitCode === null; tries++) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  up = await fetch(`${BASE}/api/books`).then((response) => response.ok, () => false);
}
if (!up) {
  console.error(log || 'The server did not start.');
  process.exit(1);
}

const files = ['tests/api.test.mjs', ...(apiOnly ? [] : ['tests/pages.test.mjs'])];
const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit', env: { ...process.env, BASE } });
if (run.status !== 0) {
  const errors = log.split('\n').filter((line) => /error/i.test(line));
  if (errors.length) console.error(`\nThe server said:\n${errors.slice(-20).join('\n')}`);
}
process.exit(run.status ?? 1);
