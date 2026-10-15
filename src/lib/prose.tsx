import type { ReactNode } from 'react';

/*
  The little Markdown an essay is written in, made into page elements. Nothing in it is ever
  taken as HTML, so what a reader writes cannot become a script on another reader's page.

    ## A heading          ### A smaller one
    > A quotation          - An item of a list
    ---  a break           a blank line between paragraphs
    *italic*  **bold**  [a link](https://…)
*/

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h2' | 'h3'; text: string }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'rule' };

function blocks(text: string): Block[] {
  const out: Block[] = [];
  let paragraph: string[] = [];
  /** The quotation or list that the next line of the same kind joins; a blank line ends it. */
  let open: Block | null = null;
  const close = () => {
    if (paragraph.length) out.push({ kind: 'p', text: paragraph.join(' ') });
    paragraph = [];
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    let match: RegExpMatchArray | null;
    if (!line.trim()) {
      close();
      open = null;
    } else if ((match = line.match(/^(#{2,3})\s+(.*)$/))) {
      close();
      out.push({ kind: match[1].length === 2 ? 'h2' : 'h3', text: match[2] });
      open = null;
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      close();
      out.push({ kind: 'rule' });
      open = null;
    } else if ((match = line.match(/^>\s?(.*)$/))) {
      close();
      if (open?.kind === 'quote') open.lines.push(match[1]);
      else out.push((open = { kind: 'quote', lines: [match[1]] }));
    } else if ((match = line.match(/^\s*[-*]\s+(.*)$/))) {
      close();
      if (open?.kind === 'list') open.items.push(match[1]);
      else out.push((open = { kind: 'list', items: [match[1]] }));
    } else {
      paragraph.push(line.trim());
      open = null;
    }
  }
  close();
  return out;
}

const SAFE_LINK = /^https?:\/\/[^\s<>"']+$/i;

/** Bold, italic and links within a line. */
function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let at = 0;
  let n = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > at) out.push(text.slice(at, match.index));
    const id = `${key}-${n++}`;
    if (match[1] !== undefined) out.push(<strong key={id}>{inline(match[1], id)}</strong>);
    else if (match[2] !== undefined || match[3] !== undefined) out.push(<em key={id}>{inline(match[2] ?? match[3], id)}</em>);
    else if (SAFE_LINK.test(match[5]))
      out.push(
        <a key={id} className="text-link" href={match[5]} target="_blank" rel="nofollow ugc noopener noreferrer">
          <span className="u">{match[4]}</span>
        </a>,
      );
    else out.push(match[0]);
    at = match.index! + match[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

export function Prose({ text, className = 'prose' }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {blocks(text).map((block, at) => {
        const key = `b${at}`;
        switch (block.kind) {
          case 'h2':
            return <h2 key={key}>{inline(block.text, key)}</h2>;
          case 'h3':
            return <h3 key={key}>{inline(block.text, key)}</h3>;
          case 'rule':
            return <hr key={key} />;
          case 'quote':
            return (
              <blockquote key={key}>
                {block.lines
                  .join('\n')
                  .split(/\n\s*\n/)
                  .map((part, n) => (
                    <p key={n}>{inline(part.replace(/\n/g, ' '), `${key}-${n}`)}</p>
                  ))}
              </blockquote>
            );
          case 'list':
            return (
              <ul key={key}>
                {block.items.map((item, n) => (
                  <li key={n}>{inline(item, `${key}-${n}`)}</li>
                ))}
              </ul>
            );
          default:
            return <p key={key}>{inline(block.text, key)}</p>;
        }
      })}
    </div>
  );
}
