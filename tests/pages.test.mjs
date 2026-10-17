// The pages, opened in a browser with no window. Run by tests/run.mjs.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright-core';
import { ask, BASE, googleToken, nameFor, reader, secret } from './helpers.mjs';

let browser;
before(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge' });
});
after(async () => {
  await browser?.close();
});

/**
 * Google's button stands in for the real one, which needs the site's address to be one Google knows:
 * a button that hands the page the token set in window.__credential, as Google's does when a
 * reader chooses an account.
 */
const FAKE_GOOGLE = `window.google = { accounts: { id: {
  initialize(options) { window.__gsi = options; },
  renderButton(element) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fake-google';
    button.textContent = 'Continue with Google';
    button.onclick = () => window.__gsi.callback({ credential: window.__credential });
    element.append(button);
  },
} } };`;

/** A fresh browser, and what went wrong in it: errors thrown, and anything the site's rules refused. */
async function fresh(width = 1280, height = 860) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark' });
  await context.route('https://accounts.google.com/gsi/client', (route) => route.fulfill({ contentType: 'text/javascript', body: FAKE_GOOGLE }));
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(`error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy|Refused to/i.test(message.text())) problems.push(`refused: ${message.text()}`);
  });
  // The guide over the wall, seen already. (A blank page has no storage, hence the try.)
  await page.addInitScript(() => {
    try {
      localStorage.setItem('incipit:wall-guide', '1');
    } catch {}
  });
  return { page, problems, close: () => context.close() };
}

describe('every page opens, with nothing refused and no error', () => {
  const pages = ['/', '/signin', '/notebook', '/essays', '/essays/seedessay001', '/book/frankenstein', '/read/frankenstein', '/about', '/u/nobody-here'];
  for (const path of pages) {
    test(path, async () => {
      const { page, problems, close } = await fresh();
      await page.goto(BASE + path, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      assert.equal(await page.locator('#root').evaluate((root) => root.childElementCount > 0), true, 'the page drew nothing');
      assert.deepEqual(problems, []);
      await close();
    });
  }

  test('on a phone too, with no sideways scroll', async () => {
    const { page, problems, close } = await fresh(390, 844);
    for (const path of ['/', '/signin', '/essays/seedessay001']) {
      await page.goto(BASE + path, { waitUntil: 'load' });
      await page.waitForTimeout(800);
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, `${path} scrolls sideways`);
    }
    assert.deepEqual(problems, []);
    await close();
  });
});

describe('a forgotten password, from the sign-in page', () => {
  test('ask for a link, follow it, choose a new password, and be signed in', async () => {
    const june = await reader('june', { email: `june${Date.now()}@example.com` });
    const { page, problems, close } = await fresh();
    await page.goto(BASE + '/signin', { waitUntil: 'load' });
    await page.locator('.signin-forgot button', { hasText: 'Forgot your password?' }).click();
    await page.locator('form.signin-forgot input').fill('june-mistyped@example');
    await page.locator('form.signin-forgot button[type=submit]').click();
    assert.equal(await page.locator('.signin-forgot-address').count(), 0, 'a mistyped address goes no further');
    await page.locator('form.signin-forgot input').fill(june.email);
    await page.locator('form.signin-forgot button[type=submit]').click();
    // The address is shown back, and nothing is sent until the reader confirms it.
    await page.waitForSelector('.signin-forgot-address');
    assert.equal(await page.locator('.signin-forgot-address').textContent(), june.email);
    const [request] = await Promise.all([
      page.waitForRequest((request) => request.url().endsWith('/api/account/forgot') && request.method() === 'POST'),
      page.locator('.signin-forgot .button').click(),
    ]);
    assert.equal(request.postDataJSON().who, june.email);
    await page.waitForSelector('p.signin-forgot[role=status]');
    // The letter itself, as the test server hands it back instead of sending it.
    const { letter } = (await ask('/api/account/forgot', { method: 'POST', body: { who: june.email } })).body;

    // As from the letter: a page opened anew, not a change of the address on this one.
    await page.goto('about:blank');
    await page.goto(letter.link, { waitUntil: 'load' });
    const next = secret();
    await page.locator('.signin-reset input[type=password]').nth(0).fill(next);
    await page.locator('.signin-reset input[type=password]').nth(1).fill(next);
    await page.locator('.signin-reset button[type=submit]').click();
    await page.waitForSelector('.signin-name');
    assert.equal(await page.locator('.signin-name').textContent(), june.name);
    assert.equal(new URL(page.url()).hash, '', 'the link is taken out of the address');
    assert.equal((await ask('/api/account/enter', { method: 'POST', body: { name: june.name, password: next } })).status, 200);

    // The same link a second time.
    await page.goto('about:blank');
    await page.goto(letter.link, { waitUntil: 'load' });
    await page.locator('.signin-reset input[type=password]').nth(0).fill(secret() + 'x');
    await page.locator('.signin-reset input[type=password]').nth(1).fill(await page.locator('.signin-reset input[type=password]').nth(0).inputValue());
    await page.locator('.signin-reset button[type=submit]').click();
    await page.waitForSelector('.signin-reset .card-problem');
    assert.match(await page.locator('.signin-reset .card-problem').textContent(), /expired or was already used/);
    assert.deepEqual(problems, []);
    await close();
  });
});

describe('replies under an essay', () => {
  test('a reader signed in replies, and sees it at once', async () => {
    const kim = await reader('kim');
    const { page, problems, close } = await fresh();
    await page.goto(BASE + '/signin', { waitUntil: 'load' });
    await page.locator('input[name=username]').fill(kim.name);
    await page.locator('input[type=password]').fill(kim.password);
    await page.locator('.signin-submit').click();
    await page.waitForSelector('.signin-name');
    await page.goto(BASE + '/essays/seedessay001', { waitUntil: 'load' });
    await page.waitForSelector('.comment-form textarea');
    await page.locator('.comment-form textarea').fill('Read it again last winter. You are right about Plutarch.');
    await page.locator('.comment-form button[type=submit]').click();
    await page.waitForSelector('.comment[data-fresh]');
    assert.match(await page.locator('.comment[data-fresh] .comment-body').first().textContent(), /Plutarch/);
    assert.deepEqual(problems, []);
    await close();
  });
});

describe('signing in with Google, from the sign-in page', () => {
  test('a new person chooses a name and is in; the same person signs in again', async () => {
    const mail = `lou${Date.now()}@example.com`;
    const { token } = googleToken({ email: mail });
    const { page, problems, close } = await fresh();
    await page.goto(BASE + '/signin', { waitUntil: 'load' });
    await page.waitForSelector('.fake-google');
    await page.evaluate((credential) => (window.__credential = credential), token);
    await page.locator('.fake-google').click();
    // Google has told the page who they are, not that they have an account here: a name is asked.
    await page.waitForSelector('.signin-badge[data-good]');
    assert.match(await page.locator('.signin-form .card-note').first().textContent(), new RegExp(mail));
    const name = nameFor('lou');
    await page.locator('input[name=username]').fill(name);
    await page.waitForSelector('.signin-badge[data-good]');
    await page.locator('.signin-submit').click();
    await page.waitForSelector('.signin-name');
    assert.equal(await page.locator('.signin-name').textContent(), name);
    assert.equal(await page.locator('.signin-email').textContent(), mail);
    assert.equal(await page.getByText('Change the password').count(), 0, 'no password to change');
    assert.match(await page.locator('.signin-account .card-note').first().textContent(), /opened with Google/);

    await page.locator('.text-button', { hasText: 'Sign out' }).click();
    await page.waitForSelector('.fake-google');
    await page.locator('.fake-google').click();
    await page.waitForSelector('.signin-name');
    assert.equal(await page.locator('.signin-name').textContent(), name);
    assert.deepEqual(problems, []);
    await close();
  });

  test('an account with a password ties Google to itself from its page', async () => {
    const lia = await reader('lia');
    const { token } = googleToken({ email: lia.email });
    const { page, problems, close } = await fresh();
    await page.goto(BASE + '/signin', { waitUntil: 'load' });
    await page.locator('input[name=username]').fill(lia.name);
    await page.locator('input[type=password]').fill(lia.password);
    await page.locator('.signin-submit').click();
    await page.waitForSelector('.signin-link-google .fake-google');
    await page.evaluate((credential) => (window.__credential = credential), token);
    await page.locator('.fake-google').click();
    await page.waitForFunction(() => /opened with Google/.test(document.querySelector('.signin-account')?.textContent ?? ''));
    assert.equal(await page.getByText('Change the password').count(), 1);
    assert.deepEqual(problems, []);
    await close();
  });

  test('an email an account already has is not opened by Google alone', async () => {
    const mia = await reader('mia');
    const { token } = googleToken({ email: mia.email });
    const { page, problems, close } = await fresh();
    await page.goto(BASE + '/signin', { waitUntil: 'load' });
    await page.waitForSelector('.fake-google');
    await page.evaluate((credential) => (window.__credential = credential), token);
    await page.locator('.fake-google').click();
    await page.waitForSelector('.signin-form .card-problem');
    assert.match(await page.locator('.signin-form .card-problem').textContent(), /already uses that email/);
    assert.deepEqual(problems, []);
    await close();
  });
});

describe('making an account asks for an email', () => {
  test('the form has it, and cannot be sent without it', async () => {
    const { page, close } = await fresh();
    await page.goto(BASE + '/signin', { waitUntil: 'load' });
    await page.locator('.signin-doors button', { hasText: 'Create an account' }).click();
    assert.equal(await page.locator('input[type=email][required]').count(), 1);
    await close();
  });
});
