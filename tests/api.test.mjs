// The server (worker/index.ts), asked directly. Run by tests/run.mjs.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ask, BASE, reader, secret } from './helpers.mjs';

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
      assert.match(policy, /script-src 'self';/);
      assert.match(policy, /frame-ancestors 'none'/);
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(response.headers.get('referrer-policy'));
    });
  }

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
    assert.equal((await ask('/api/account', { method: 'POST', code: body.code, body: { name: ana.name, password: secret() } })).status, 409);
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

  test('an account with no email is sent nothing', async () => {
    const cara = await reader('cara');
    const answer = await ask('/api/account/forgot', { method: 'POST', body: { who: cara.name } });
    assert.deepEqual(answer.body, { ok: true });
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
