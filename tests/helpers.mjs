// What the tests share: the server they talk to, and a way to talk to it as a reader.
import { randomBytes } from 'node:crypto';

export const BASE = process.env.BASE ?? 'http://127.0.0.1:8790';
// These tests make accounts: never against the site itself.
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error(`The tests run against a server on this machine only, not ${BASE}.`);

/** A password made up here, never printed. */
export const secret = () => randomBytes(12).toString('base64url');
/** A name no other run has used. */
export const nameFor = (who) => `${who}${randomBytes(3).toString('hex')}`;

/** Asks the server, as the card `code` if one is given. Resolves to { status, body, headers }. */
export async function ask(path, { method = 'GET', body, code, headers = {} } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: { ...(code ? { authorization: `Card ${code}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed, headers: response.headers };
}

/** A new card, with an account in front of it. */
export async function reader(who, { email = null } = {}) {
  const name = nameFor(who);
  const password = secret();
  const { body } = await ask('/api/card', { method: 'POST' });
  const made = await ask('/api/account', { method: 'POST', code: body.code, body: { name, password, email } });
  if (made.status !== 201) throw new Error(`Could not make an account: ${made.status} ${JSON.stringify(made.body)}`);
  return { name, password, email, code: body.code };
}
