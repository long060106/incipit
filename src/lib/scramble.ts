/*
  The links in the bar across the top: when the pointer meets one, its letters shuffle, then settle
  back one by one from the left. The type there is a monospace, so the word does not change width
  while it shuffles. Not for touch, and not where the reader has asked for less motion.
*/

const SELECTOR = '.page-nav > a, .page-nav > button, .header-link';
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/+=#%&*';
/** All of it, from the first shuffle to the last letter settled. */
const DURATION = 700;
/** How long every letter is a stranger before the first one comes back. */
const LEAD = 140;
const FRAME = 50;

const running = new WeakSet<Element>();

const randomChar = () => CHARS[Math.floor(Math.random() * CHARS.length)];

function textNodesOf(element: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if ((node as Text).data.trim()) nodes.push(node as Text);
  return nodes;
}

function scramble(element: HTMLElement) {
  // A button with a name of its own (the signs →← and A− of the reader) is not a word to shuffle.
  if (element.hasAttribute('aria-label')) return;
  const nodes = textNodesOf(element);
  if (!nodes.length) return;
  const words = nodes.map((node) => node.data);
  const total = words.reduce((sum, word) => sum + word.length, 0);
  // What a screen reader says stays the word, not the letters passing through it.
  const hadLabel = element.hasAttribute('aria-label');
  if (!hadLabel) element.setAttribute('aria-label', element.textContent?.trim() ?? '');
  running.add(element);

  const started = performance.now();
  const timer = window.setInterval(() => {
    const elapsed = performance.now() - started;
    const done = elapsed >= DURATION;
    const settled = done ? total : Math.floor((Math.max(0, elapsed - LEAD) / (DURATION - LEAD)) * total);
    let at = 0;
    nodes.forEach((node, index) => {
      if (!node.isConnected) return;
      node.data = [...words[index]].map((letter) => (at++ < settled || letter === ' ' ? letter : randomChar())).join('');
    });
    if (done) {
      window.clearInterval(timer);
      running.delete(element);
      if (!hadLabel) element.removeAttribute('aria-label');
    }
  }, FRAME);
}

export function installScramble() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch' || !document.documentElement.dataset.type) return;
    const element = (event.target as Element | null)?.closest<HTMLElement>(SELECTOR);
    if (!element || running.has(element) || element.contains(event.relatedTarget as Node | null)) return;
    scramble(element);
  });
}
