// The server (worker/index.ts), asked directly. Run by tests/run.mjs.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { ask, BASE, googleToken, nameFor, reader, secret } from './helpers.mjs';

const ESSAY = 'seedessay001';
// The server lets one address make ten accounts a day: the tests share where they can.
let shared = null;
const someone = async () => (shared ??= await reader('fay'));

describe('rules sent with every answer', () => {
  for (const path of ['/', '/signin', '/book/frankenstein', `/essays/${ESSAY}`, '/api/books', '/boot/theme.js']) {
    test(path, async () => {
      const response = await fetch(BASE + path);
      assert.equal(response.status, 200);
      const policy = response.headers.get('content-security-policy') ?? '';
      assert.match(policy, /script-src 'self' https:\/\/accounts\.google\.com\/gsi\/client;/);
      assert.match(policy, /frame-src https:\/\/accounts\.google\.com\/gsi\//);
      assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
      assert.match(policy, /frame-ancestors 'none'/);
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(response.headers.get('referrer-policy'));
    });
  }

  test('the sitemap lists the privacy policy and the terms', async () => {
    const xml = await (await fetch(BASE + '/sitemap.xml')).text();
    assert.ok(xml.includes('/privacy</loc>') && xml.includes('/terms</loc>'));
  });

  test('no page carries a script written into it', async () => {
    for (const path of ['/', `/essays/${ESSAY}`, '/book/frankenstein']) {
      const html = await (await fetch(BASE + path)).text();
      // Every <script> either has a src, or is data (the facts about a book for search engines).
      const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>/g)];
      assert.equal(inline.length, 0, `${path}: ${inline.map((match) => match[0]).join(' ')}`);
    }
  });
});

describe('cards and accounts', () => {
  test('a card opens its notebook; a wrong code opens nothing', async () => {
    const { body } = await ask('/api/card', { method: 'POST' });
    assert.match(body.code, /^[0-9A-Z]{20}$/);
    assert.equal((await ask('/api/me', { code: body.code })).status, 200);
    assert.equal((await ask('/api/me', { code: 'ABCDEFGHJK0123456789' })).status, 401);
  });

  test('a name is taken once; it signs in with its name or its email, not with a wrong password', async () => {
    const ana = await reader('ana', { email: `ana${Date.now()}@example.com` });
    assert.equal((await ask(`/api/account/free?name=${ana.name}`)).body.free, false);
    const { body } = await ask('/api/card', { method: 'POST' });
    assert.equal((await ask('/api/account', { method: 'POST', code: body.code, body: { name: ana.name, password: secret(), email: `other${Date.now()}@example.com` } })).status, 409);
    const byName = await ask('/api/account/enter', { method: 'POST', body: { name: ana.name, password: ana.password } });
    assert.equal(byName.status, 200);
    assert.equal(byName.body.code, ana.code);
    assert.equal((await ask('/api/account/enter', { method: 'POST', body: { name: ana.email, password: ana.password } })).status, 200);
    assert.equal((await ask('/api/account/enter', { method: 'POST', body: { name: ana.name, password: 'not-the-password' } })).status, 401);
    assert.equal((await ask('/api/account/enter', { method: 'POST', body: { name: 'nobody-at-all', password: 'whatever1' } })).status, 401);
  });

  test('a password is changed only with the one it has', async () => {
    const ben = await reader('ben');
    const next = secret();
    assert.equal((await ask('/api/account', { method: 'PUT', code: ben.code, body: { current: 'wrong-one', password: next } })).status, 401);
    assert.equal((await ask('/api/account', { method: 'PUT', code: ben.code, body: { current: ben.password, password: 'short' } })).status, 400);
    assert.equal((await ask('/api/account', { method: 'PUT', code: ben.code, body: { current: ben.password, password: next } })).status, 200);
    assert.equal((await ask('/api/account/enter', { method: 'POST', body: { name: ben.name, password: next } })).status, 200);
  });
});

describe('a forgotten password', () => {
  test('the server says it can send a link', async () => {
    assert.equal((await ask('/api/account/forgot')).body.mail, true);
  });

  test('the answer is the same for an account that does not exist', async () => {
    const answer = await ask('/api/account/forgot', { method: 'POST', body: { who: 'nobody@example.com' } });
    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body, { ok: true });
  });

  test('an account cannot be made without an email', async () => {
    const { body } = await ask('/api/card', { method: 'POST' });
    const make = (email) => ask('/api/account', { method: 'POST', code: body.code, body: { name: nameFor('cara'), password: secret(), ...(email === undefined ? {} : { email }) } });
    assert.equal((await make()).body.error, 'bad-email');
    assert.equal((await make('')).body.error, 'bad-email');
    assert.equal((await make('not-an-email')).body.error, 'bad-email');
    assert.equal((await make(`ok${Date.now()}@example.com`)).status, 201);
  });

  test('the link sets a new password, once; the notebook and reviews stay; the old code stops working', async () => {
    const dora = await reader('dora', { email: `dora${Date.now()}@example.com` });
    assert.equal((await ask('/api/reviews/frankenstein', { method: 'PUT', code: dora.code, body: { stars: 5, text: 'The creature reads Plutarch.' } })).status, 200);

    const letter = (await ask('/api/account/forgot', { method: 'POST', body: { who: dora.email } })).body.letter;
    assert.equal(letter.to, dora.email);
    const token = /#reset=([0-9a-f]{64})$/.exec(letter.link)?.[1];
    assert.ok(token, letter.link);

    // A password too short is refused, and the link is still good after it.
    assert.equal((await ask('/api/account/reset', { method: 'POST', body: { token, password: 'short' } })).body.error, 'bad-password');
    const next = secret();
    const opened = await ask('/api/account/reset', { method: 'POST', body: { token, password: next } });
    assert.equal(opened.status, 200);
    assert.equal(opened.body.name, dora.name);
    assert.notEqual(opened.body.code, dora.code);

    assert.equal((await ask('/api/account/reset', { method: 'POST', body: { token, password: secret() } })).body.error, 'bad-link');
    assert.equal((await ask('/api/me', { code: dora.code })).status, 401);
    assert.equal((await ask('/api/account/enter', { method: 'POST', body: { name: dora.name, password: dora.password } })).status, 401);
    assert.equal((await ask('/api/account/enter', { method: 'POST', body: { name: dora.name, password: next } })).status, 200);
    const reviews = await ask('/api/reviews/frankenstein', { code: opened.body.code });
    assert.equal(reviews.body.mine?.stars, 5);
  });

  test('a made-up link opens nothing', async () => {
    assert.equal((await ask('/api/account/reset', { method: 'POST', body: { token: 'a'.repeat(64), password: secret() } })).body.error, 'bad-link');
    assert.equal((await ask('/api/account/reset', { method: 'POST', body: { token: 'nope', password: secret() } })).body.error, 'bad-link');
  });

  test('one account is sent three links in a day at most', async () => {
    const eve = await reader('eve', { email: `eve${Date.now()}@example.com` });
    const sent = [];
    for (let n = 0; n < 4; n++) sent.push(!!(await ask('/api/account/forgot', { method: 'POST', body: { who: eve.name } })).body.letter);
    assert.deepEqual(sent, [true, true, true, false]);
  });
});

describe('signing in with Google', () => {
  const enter = (credential, name) => ask('/api/account/google', { method: 'POST', body: { credential, ...(name ? { name } : {}) } });
  const email = () => `g${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;

  test('the page is told the client id', async () => {
    assert.equal((await ask('/api/account/google')).body.client, 'test-client.apps.googleusercontent.com');
  });

  test('a person Google has not met here is asked for a name, then given an account with no password', async () => {
    const mail = email();
    const { token } = googleToken({ email: mail });
    const first = await enter(token);
    assert.equal(first.status, 404);
    assert.deepEqual(first.body, { error: 'new', email: mail });
    assert.equal((await enter(token, 'No')).body.error, 'bad-name');
    const name = nameFor('gina');
    const made = await enter(token, name);
    assert.equal(made.status, 201);
    assert.equal(made.body.name, name);
    assert.equal(made.body.google, true);
    assert.equal(made.body.password, false);
    const me = await ask('/api/me', { code: made.body.code });
    assert.deepEqual([me.body.name, me.body.email, me.body.google, me.body.password], [name, mail, true, false]);
    // The same person signs in again, to the same card.
    const again = await enter(token);
    assert.equal(again.status, 200);
    assert.equal(again.body.code, made.body.code);
    // And no password opens it.
    assert.equal((await ask('/api/account/enter', { method: 'POST', body: { name, password: secret() } })).status, 401);
    assert.equal((await ask('/api/account', { method: 'PUT', code: made.body.code, body: { current: '', password: secret() } })).status, 400);
  });

  test('a token that cannot be trusted opens nothing', async () => {
    const mail = email();
    const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
    const bad = {
      'another audience': googleToken({ email: mail, aud: 'someone-elses-client' }),
      'another issuer': googleToken({ email: mail, iss: 'https://evil.example.com' }),
      'expired': googleToken({ email: mail, exp: Math.floor(Date.now() / 1000) - 3600 }),
      'an email Google has not confirmed': googleToken({ email: mail, verified: false }),
      'signed with another key': googleToken({ email: mail, key: stranger }),
      'no algorithm': { token: `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'test-client.apps.googleusercontent.com', sub: 'x', email: mail, email_verified: true, exp: 9999999999 })).toString('base64url')}.` },
      'not a token': { token: 'nonsense' },
    };
    for (const [why, { token }] of Object.entries(bad)) assert.equal((await enter(token, nameFor('bad'))).status, 401, why);
    assert.equal((await ask('/api/account/google', { method: 'POST', body: {} })).status, 401);
  });

  test('an email an account already has is not opened by Google alone; its owner ties Google to it', async () => {
    const hugo = await reader('hugo');
    const hugosGoogle = googleToken({ email: hugo.email });
    const { token } = hugosGoogle;
    assert.equal((await enter(token, nameFor('copy'))).body.error, 'has-account');
    // A card with another email, or with no account, cannot tie it.
    const other = await reader('other');
    assert.equal((await ask('/api/account/link', { method: 'POST', code: other.code, body: { credential: token } })).body.error, 'email-differs');
    const bare = await ask('/api/card', { method: 'POST' });
    assert.equal((await ask('/api/account/link', { method: 'POST', code: bare.body.code, body: { credential: token } })).body.error, 'no-account');
    assert.equal((await ask('/api/account/link', { method: 'POST', body: { credential: token } })).status, 401);
    // Its owner can.
    assert.equal((await ask('/api/account/link', { method: 'POST', code: hugo.code, body: { credential: token } })).status, 200);
    assert.equal((await ask('/api/me', { code: hugo.code })).body.google, true);
    const entered = await enter(token);
    assert.equal(entered.status, 200);
    assert.equal(entered.body.code, hugo.code);
    assert.equal(entered.body.password, true);
    // One Google person is tied to one account.
    const ida = await reader('ida');
    const same = googleToken({ email: ida.email, sub: hugosGoogle.sub });
    assert.equal((await ask('/api/account/link', { method: 'POST', code: ida.code, body: { credential: same.token } })).body.error, 'google-taken');
  });

  test('a password set again by email keeps Google working, with the card’s new code', async () => {
    const jan = await reader('jan');
    const jansGoogle = googleToken({ email: jan.email });
    assert.equal((await ask('/api/account/link', { method: 'POST', code: jan.code, body: { credential: jansGoogle.token } })).status, 200);
    const letter = (await ask('/api/account/forgot', { method: 'POST', body: { who: jan.email } })).body.letter;
    const reset = /#reset=([0-9a-f]{64})$/.exec(letter.link)[1];
    const opened = await ask('/api/account/reset', { method: 'POST', body: { token: reset, password: secret() } });
    assert.equal(opened.status, 200);
    assert.equal(opened.body.google, true);
    assert.notEqual(opened.body.code, jan.code);
    // Google opens the card at its new code, not the old one.
    const viaGoogle = await enter(jansGoogle.token);
    assert.equal(viaGoogle.status, 200);
    assert.equal(viaGoogle.body.code, opened.body.code);
    assert.equal((await ask('/api/me', { code: jan.code })).status, 401);
  });

  test('an account opened with Google can set a password by the emailed link, and then use both', async () => {
    const mail = email();
    const { token: credential } = googleToken({ email: mail });
    const name = nameFor('kai');
    const made = await enter(credential, name);
    assert.equal(made.status, 201);
    const letter = (await ask('/api/account/forgot', { method: 'POST', body: { who: mail } })).body.letter;
    assert.equal(letter.to, mail);
    const reset = /#reset=([0-9a-f]{64})$/.exec(letter.link)[1];
    const password = secret();
    const opened = await ask('/api/account/reset', { method: 'POST', body: { token: reset, password } });
    assert.equal(opened.status, 200);
    assert.equal(opened.body.password, true);
    assert.equal((await ask('/api/account/enter', { method: 'POST', body: { name, password } })).body.code, opened.body.code);
    // Google still opens it, at the card's new code.
    const viaGoogle = await enter(credential);
    assert.equal(viaGoogle.status, 200);
    assert.equal(viaGoogle.body.code, opened.body.code);
  });
});

describe('replies under essays', () => {
  test('a reader replies, and only they may take it away', async () => {
    const fay = await someone();
    const gus = await reader('gus');
    assert.equal((await ask(`/api/essays/${ESSAY}/comments`, { method: 'POST', code: fay.code, body: { body: 'x' } })).status, 400);
    assert.equal((await ask(`/api/essays/${ESSAY}/comments`, { method: 'POST', code: fay.code, body: { body: 'a'.repeat(2001) } })).status, 400);
    const sent = await ask(`/api/essays/${ESSAY}/comments`, { method: 'POST', code: fay.code, body: { body: 'The creature as a reader: yes.' } });
    assert.equal(sent.status, 201);
    const id = sent.body.comment.id;
    const list = await ask(`/api/essays/${ESSAY}/comments`);
    assert.ok(list.body.comments.some((comment) => comment.id === id));
    assert.equal((await ask(`/api/essays/${ESSAY}/comments/${id}`, { method: 'DELETE', code: gus.code })).status, 403);
    assert.equal((await ask(`/api/essays/${ESSAY}/comments/${id}`, { method: 'DELETE', code: fay.code })).status, 200);
    assert.equal((await ask(`/api/essays/zzzzzzzzzzzz/comments`, { method: 'POST', code: fay.code, body: { body: 'hello there' } })).status, 404);
  });

  test('signed out, a reply is refused', async () => {
    assert.equal((await ask(`/api/essays/${ESSAY}/comments`, { method: 'POST', body: { body: 'hello there' } })).status, 401);
  });
});

describe('passages on a reader’s page', () => {
  test('only words of a book out of copyright, twelve at most, short enough', async () => {
    const hal = await someone();
    const put = (quotes) => ask('/api/people/quotes', { method: 'PUT', code: hal.code, body: { quotes } });
    assert.equal((await put([{ id: 'abcd1234', book: 'beloved', quote: 'Some words.' }])).status, 400);
    assert.equal((await put(Array.from({ length: 13 }, (_, n) => ({ id: `abcd${1000 + n}`, book: 'frankenstein', quote: 'Some words.' })))).status, 400);
    assert.equal((await put([{ id: 'abcd1234', book: 'frankenstein', quote: 'a'.repeat(501) }])).status, 400);
    assert.equal((await put([{ id: 'abcd1234', book: 'frankenstein', quote: 'I was benevolent and good; misery made me a fiend.' }])).status, 200);
    const page = await ask(`/api/people/${hal.name}`);
    assert.equal(page.body.quotes?.length ?? page.body.person?.quotes?.length, 1);
  });
});

describe('erasing a card', () => {
  test('takes the account with it, and frees the name', async () => {
    const ivy = await reader('ivy');
    assert.equal((await ask('/api/card', { method: 'DELETE', code: ivy.code })).status, 200);
    assert.equal((await ask('/api/account/enter', { method: 'POST', body: { name: ivy.name, password: ivy.password } })).status, 401);
    assert.equal((await ask(`/api/account/free?name=${ivy.name}`)).body.free, true);
  });
});
