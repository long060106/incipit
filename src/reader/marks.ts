import type { Mark } from '../lib/shelf';

/*
  Marked passages are kept as two numbers: the first and last character of the section's
  text. These helpers go between those numbers and the page: from a selection to numbers,
  and from numbers to <mark> elements around the right words.
*/

/** How many characters of `root`'s text come before a point inside it. */
export function offsetOf(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** The current selection as a stretch of `root`'s text, or null when it is empty or elsewhere. */
export function selectionIn(root: HTMLElement): { start: number; end: number; quote: string; rect: DOMRect } | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const quote = selection.toString().replace(/\s+/g, ' ').trim();
  if (!quote) return null;
  const start = offsetOf(root, range.startContainer, range.startOffset);
  const end = offsetOf(root, range.endContainer, range.endOffset);
  return end > start ? { start, end, quote, rect: range.getBoundingClientRect() } : null;
}

/** Wraps each mark's words in <mark data-id>. `root` must hold the section's untouched HTML. */
export function paintMarks(root: HTMLElement, marks: Mark[]) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: { node: Text; from: number }[] = [];
  let at = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    texts.push({ node, from: at });
    at += node.data.length;
  }
  // Later passages first, so that splitting a text node never moves one still to be wrapped.
  const ordered = [...marks]
    .filter((mark) => mark.start !== undefined && mark.end !== undefined && mark.end > mark.start)
    .sort((a, b) => b.start! - a.start!);
  for (const mark of ordered) {
    for (let index = texts.length - 1; index >= 0; index -= 1) {
      const { node, from } = texts[index];
      const to = from + node.data.length;
      if (to <= mark.start! || from >= mark.end!) continue;
      const head = Math.max(mark.start!, from) - from;
      const tail = Math.min(mark.end!, to) - from;
      let piece = node;
      if (tail < piece.data.length) piece.splitText(tail);
      if (head > 0) piece = piece.splitText(head);
      if (!piece.data.trim()) continue;
      const wrap = document.createElement('mark');
      wrap.dataset.id = mark.id;
      if (mark.note) wrap.dataset.note = 'true';
      if (mark.links.length) wrap.dataset.tied = 'true';
      piece.replaceWith(wrap);
      wrap.append(piece);
    }
  }
}

/** Where each top-level block of the section starts in its text, for keeping the reader's place. */
export function blockOffsets(root: HTMLElement): { el: HTMLElement; from: number }[] {
  const list: { el: HTMLElement; from: number }[] = [];
  let at = 0;
  for (const child of root.childNodes) {
    if (child instanceof HTMLElement) list.push({ el: child, from: at });
    at += child.textContent?.length ?? 0;
  }
  return list;
}
