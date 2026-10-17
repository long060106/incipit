import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Avatar } from '../components/Avatar';
import { BOOKS } from '../data/books';
import type { Book, L } from '../data/types';
import { SITE_NAME, useI18n } from '../i18n';
import { useCard } from '../lib/card';
import { bookUrl, coverUrl } from '../lib/links';
import { essays, essayUrl, isProblem, MAX_COMMENT, minutes, personUrl, writeUrl, type Comment, type Essay, type EssaySummary } from '../lib/people';
import { Prose } from '../lib/prose';
import { PageHeader, pageUrl, useQuickLoader } from './PageHeader';
import './people.css';

/*
  Essays (/essays): what readers write at more length about the books of the wall, newest
  first, or only those on one book (?book=<id>). /essays/<id> is one essay. Every essay is
  read by the keeper before it appears; until then only its author sees it, with a word on
  where it stands.
*/

export const ESSAY_TEXT = {
  eyebrow: { en: 'Essays', fr: 'Essais' },
  title: { en: 'What readers write', fr: 'Ce qu’écrivent les lecteurs' },
  lead: {
    en: 'Longer thoughts on the books of the wall, by readers of {site}. The keeper reads each one before it appears.',
    fr: 'Des pensées plus longues sur les livres du mur, par des lecteurs de {site}. Le gardien lit chacune avant qu’elle paraisse.',
  },
  write: { en: 'Write an essay', fr: 'Écrire un essai' },
  on: { en: 'On {title}', fr: 'Sur {title}' },
  all: { en: 'All essays', fr: 'Tous les essais' },
  none: { en: 'No essay here yet. Yours could be the first.', fr: 'Aucun essai ici pour l’instant. Le vôtre pourrait être le premier.' },
  more: { en: 'Older essays', fr: 'Essais plus anciens' },
  read: { en: '{n} min read', fr: '{n} min de lecture' },
  by: { en: 'by', fr: 'par' },
  missing: { en: 'This essay is not here, or not yet.', fr: 'Cet essai n’est pas ici, ou pas encore.' },
  pending: {
    en: 'Waiting for the keeper. Until it is approved, only you can see it.',
    fr: 'En attente du gardien. Tant qu’il n’est pas approuvé, vous seul pouvez le voir.',
  },
  rejected: { en: 'The keeper did not approve this essay.', fr: 'Le gardien n’a pas approuvé cet essai.' },
  reason: { en: 'The keeper’s word:', fr: 'Le mot du gardien :' },
  edit: { en: 'Edit', fr: 'Modifier' },
  editAgain: { en: 'Edit and send again', fr: 'Modifier et renvoyer' },
  remove: { en: 'Delete', fr: 'Supprimer' },
  removeSure: { en: 'Yes, delete it', fr: 'Oui, le supprimer' },
  cancel: { en: 'Cancel', fr: 'Annuler' },
  report: { en: 'Report this essay', fr: 'Signaler cet essai' },
  reportSure: {
    en: 'Report it to the keeper, who will read it again?',
    fr: 'Le signaler au gardien, qui le relira ?',
  },
  reportYes: { en: 'Report', fr: 'Signaler' },
  reported: { en: 'Thank you. The keeper will read it again.', fr: 'Merci. Le gardien le relira.' },
  editNote: {
    en: 'Changing it sends it back to the keeper; it is taken down until it is read again.',
    fr: 'Le modifier le renvoie au gardien ; il est retiré jusqu’à ce qu’il soit relu.',
  },
  offline: { en: 'The server could not be reached. Try again in a moment.', fr: 'Le serveur est injoignable. Réessayez dans un instant.' },
  about: { en: 'About the books', fr: 'Les livres' },
  readIt: { en: 'Read the essay', fr: 'Lire l’essai' },
  latest: { en: 'Latest', fr: 'Le plus récent' },
  deskSign: { en: 'Your essay could begin like this.', fr: 'Votre essai pourrait commencer ainsi.' },
  comments: { en: '{n} replies', fr: '{n} réponses' },
  oneComment: { en: '1 reply', fr: '1 réponse' },
} satisfies Record<string, L>;

const COMMENT_TEXT = {
  title: { en: 'Replies', fr: 'Réponses' },
  none: { en: 'No reply yet. Say what it made you think.', fr: 'Pas encore de réponse. Dites ce qu’il vous a fait penser.' },
  write: { en: 'Your reply…', fr: 'Votre réponse…' },
  send: { en: 'Reply', fr: 'Répondre' },
  signIn: { en: 'Sign in to reply', fr: 'Se connecter pour répondre' },
  remove: { en: 'Remove', fr: 'Retirer' },
  removeSure: { en: 'Yes, remove it', fr: 'Oui, la retirer' },
  cancel: { en: 'Cancel', fr: 'Annuler' },
  author: { en: 'Author', fr: 'Auteur' },
  'too-short': { en: 'Write a little more.', fr: 'Écrivez un peu plus.' },
  'too-long': { en: 'That is longer than 2,000 characters.', fr: 'C’est plus long que 2 000 caractères.' },
  'too-many': { en: 'That is a great many replies for one day. Try again tomorrow.', fr: 'Cela fait beaucoup de réponses pour un jour. Réessayez demain.' },
  failed: { en: 'That could not be sent. Try again in a moment.', fr: 'Cela n’a pas pu être envoyé. Réessayez dans un instant.' },
} satisfies Record<string, L>;

/** First lines typed out on the empty desk, one after another, as examples of a way in. */
const DESK_LINES = {
  en: [
    'The first time I read Jane Eyre, I was the same age she is in the red room…',
    'Nobody warns you that Moby-Dick is funny.',
    'I have read The Odyssey three times, and each time a different man came home.',
    'What frightened me in Frankenstein was not the creature.',
  ],
  fr: [
    'La première fois que j’ai lu Jane Eyre, j’avais l’âge qu’elle a dans la chambre rouge…',
    'Personne ne vous prévient que Moby Dick est drôle.',
    'J’ai lu L’Odyssée trois fois, et chaque fois un autre homme rentrait chez lui.',
    'Ce qui m’a fait peur dans Frankenstein, ce n’était pas la créature.',
  ],
};

const BY_ID = new Map(BOOKS.map((book) => [book.id, book]));
export const booksOf = (ids: string[]) => ids.map((id) => BY_ID.get(id)).filter((book): book is Book => !!book);

const day = (time: number, lang: string) => new Date(time).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });

export default function Essays() {
  const id = location.pathname.split('/')[2];
  useQuickLoader();
  return (
    <div className="people-page">
      <PageHeader here="essays" />
      <main className="people-body">{id ? <OneEssay id={id} /> : <EssayList />}</main>
    </div>
  );
}

/** Where "Write an essay" leads: the page to write on, through signing in if need be. */
export function useWriteHref(book?: string) {
  const { card: mine } = useCard();
  const target = writeUrl({ book });
  return mine?.name ? target : `${pageUrl('signin')}?next=${encodeURIComponent(target)}`;
}

function EssayList() {
  const { tl, lang } = useI18n();
  const book = new URLSearchParams(location.search).get('book') ?? '';
  const on = book ? BY_ID.get(book) : null;
  const [list, setList] = useState<EssaySummary[] | null>(null);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const writeHref = useWriteHref(on?.id);

  const load = async (before?: number) => {
    const answer = await essays.list({ book: book || undefined, before });
    if (isProblem(answer)) return setFailed(true);
    setList((shown) => [...(before ? (shown ?? []) : []), ...answer.essays]);
    setMore(answer.more);
  };

  useEffect(() => {
    document.title = `${tl(ESSAY_TEXT.eyebrow)} · ${SITE_NAME}`;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <header className="essays-head">
        <p className="page-eyebrow">{tl(ESSAY_TEXT.eyebrow)}</p>
        <h1 className="essays-title">
          {(on ? tl(ESSAY_TEXT.on).replace('{title}', on.title) : tl(ESSAY_TEXT.title)).split(' ').map((word, at) => (
            <span key={at} style={{ animationDelay: `${0.1 + at * 0.12}s` }}>
              {word}{' '}
            </span>
          ))}
        </h1>
        <p className="essays-lead">{tl(ESSAY_TEXT.lead).replace('{site}', SITE_NAME)}</p>
        <div className="card-actions">
          <a className="button" href={writeHref}>
            <span className="roll">
              <span>{tl(ESSAY_TEXT.write)}</span>
            </span>
          </a>
          {on && (
            <a className="text-link" href={pageUrl('essays')}>
              <span className="u">{tl(ESSAY_TEXT.all)}</span>
            </a>
          )}
        </div>
      </header>

      {failed && <p className="card-problem">{tl(ESSAY_TEXT.offline)}</p>}
      {list?.length === 0 && <WritingDesk />}
      {list && list.length > 0 && <EssayFeature essay={list[0]} lang={lang} />}
      {list && list.length > 1 && (
        <ol className="essay-list">
          {list.slice(1).map((essay, at) => (
            <li key={essay.id} style={{ animationDelay: `${Math.min(at, 8) * 70}ms` }}>
              <EssayCard essay={essay} lang={lang} />
            </li>
          ))}
        </ol>
      )}
      {more && list && (
        <button type="button" className="button button-quiet essays-more" onClick={() => void load(list[list.length - 1].at)}>
          {tl(ESSAY_TEXT.more)}
        </button>
      )}
    </>
  );
}

/** The newest essay, set large at the head of the list as on the cover of a review. */
function EssayFeature({ essay, lang }: { essay: EssaySummary; lang: string }) {
  const { tl } = useI18n();
  const books = booksOf(essay.books);
  return (
    <article className="essay-feature">
      <a href={essayUrl(essay.id)}>
        <span className="essay-feature-covers" aria-hidden="true" data-count={books.length}>
          {books.length > 0 ? (
            books.map((book) => <img key={book.id} src={coverUrl(book, 'md')} alt="" width={150} height={225} />)
          ) : (
            <span className="essay-feature-initial">{essay.title.trim()[0]}</span>
          )}
        </span>
        <span className="essay-feature-text">
          <span className="page-eyebrow">
            {tl(ESSAY_TEXT.latest)}
            {books.length > 0 && ` · ${books.map((book) => book.title).join(' · ')}`}
          </span>
          <strong>{essay.title}</strong>
          <span className="essay-feature-excerpt">{essay.excerpt}</span>
          <span className="essay-meta">
            <Avatar name={essay.author} tone={essay.tone} size="sm" />
            <span>{essay.author}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={new Date(essay.at).toISOString()}>{day(essay.at, lang)}</time>
            <span aria-hidden="true">·</span>
            <span>{tl(ESSAY_TEXT.read).replace('{n}', String(minutes(essay.words)))}</span>
            {!!essay.comments && (
              <>
                <span aria-hidden="true">·</span>
                <span>{essay.comments === 1 ? tl(ESSAY_TEXT.oneComment) : tl(ESSAY_TEXT.comments).replace('{n}', String(essay.comments))}</span>
              </>
            )}
          </span>
          <span className="essay-feature-go">{tl(ESSAY_TEXT.readIt)} →</span>
        </span>
      </a>
    </article>
  );
}

const STILL = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * No essay yet: a sheet of paper on the desk, on which first lines are typed out and taken
 * back one after another, as ways an essay might begin.
 */
function WritingDesk() {
  const { tl, lang } = useI18n();
  const lines = DESK_LINES[lang === 'fr' ? 'fr' : 'en'];
  const [typed, setTyped] = useState(() => (STILL() ? lines[0] : ''));
  useEffect(() => {
    if (STILL()) return setTyped(lines[0]);
    let line = 0;
    let shown = 0;
    let back = false;
    let timer = 0;
    const step = () => {
      const text = lines[line];
      if (!back) {
        shown += 1;
        setTyped(text.slice(0, shown));
        if (shown >= text.length) {
          back = true;
          timer = window.setTimeout(step, 3200);
        } else {
          // A little longer after a comma or a stop, as a hand would.
          timer = window.setTimeout(step, /[,.…?]/.test(text[shown - 1]) ? 380 : 52 + Math.random() * 60);
        }
      } else {
        shown -= 2;
        setTyped(text.slice(0, Math.max(0, shown)));
        if (shown <= 0) {
          back = false;
          shown = 0;
          line = (line + 1) % lines.length;
          timer = window.setTimeout(step, 700);
        } else timer = window.setTimeout(step, 16);
      }
    };
    setTyped('');
    timer = window.setTimeout(step, 900);
    return () => window.clearTimeout(timer);
  }, [lines]);
  return (
    <div className="writing-desk">
      <div className="writing-sheet">
        <p className="writing-line">
          <span>{typed}</span>
          <i className="writing-caret" aria-hidden="true" />
        </p>
        <p className="writing-sign">{tl(ESSAY_TEXT.deskSign)}</p>
      </div>
      <p className="people-quiet">{tl(ESSAY_TEXT.none)}</p>
    </div>
  );
}

/** One essay in a list: its book, title, first words and who wrote it. */
export function EssayCard({ essay, lang, children }: { essay: EssaySummary; lang: string; children?: ReactNode }) {
  const { tl } = useI18n();
  const books = booksOf(essay.books);
  return (
    <article className="essay-card">
      <a className="essay-card-link" href={essayUrl(essay.id)}>
        {books.length > 0 && (
          <span className="essay-card-covers" aria-hidden="true">
            {books.map((book) => (
              <img key={book.id} src={coverUrl(book, 'sm')} alt="" width={60} height={90} loading="lazy" />
            ))}
          </span>
        )}
        <span className="essay-card-text">
          {books.length > 0 && <small className="essay-card-books">{books.map((book) => book.title).join(' · ')}</small>}
          <strong>{essay.title}</strong>
          <span className="essay-card-excerpt">{essay.excerpt}</span>
          <span className="essay-meta">
            <Avatar name={essay.author} tone={essay.tone} size="sm" />
            <span>{essay.author}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={new Date(essay.at).toISOString()}>{day(essay.at, lang)}</time>
            <span aria-hidden="true">·</span>
            <span>{tl(ESSAY_TEXT.read).replace('{n}', String(minutes(essay.words)))}</span>
            {!!essay.comments && (
              <>
                <span aria-hidden="true">·</span>
                <span>{essay.comments === 1 ? tl(ESSAY_TEXT.oneComment) : tl(ESSAY_TEXT.comments).replace('{n}', String(essay.comments))}</span>
              </>
            )}
          </span>
        </span>
      </a>
      {children}
    </article>
  );
}

/**
 * A gilt thread down the side of the page that fills as the essay is read, and quotations
 * that open as they come into view, their great quotation mark first.
 */
function useReadingThread(article: React.RefObject<HTMLElement | null>, ready: boolean) {
  const [through, setThrough] = useState(0);
  useEffect(() => {
    const body = article.current;
    if (!ready || !body) return;
    let frame = 0;
    const measure = () => {
      const box = body.getBoundingClientRect();
      const room = box.height - window.innerHeight * 0.6;
      setThrough(room > 0 ? Math.min(1, Math.max(0, (window.innerHeight * 0.4 - box.top) / room)) : 1);
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    const quotes = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.shown = 'true';
            quotes.unobserve(entry.target);
          }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    body.querySelectorAll('.essay-body blockquote').forEach((quote) => quotes.observe(quote));
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      quotes.disconnect();
    };
  }, [article, ready]);
  return through;
}

/**
 * The replies under an essay, oldest first, and a place to write one for a reader with an
 * account. A reply can be taken away by whoever wrote it, by the essay's author, and by the
 * keeper at the open desk. A new reply comes in at the foot with a light along its edge.
 */
function Comments({ essay }: { essay: Essay }) {
  const { tl, lang } = useI18n();
  const { card: mine } = useCard();
  const [list, setList] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<keyof typeof COMMENT_TEXT | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => {
    void essays.comments(essay.id).then((answer) => setList(isProblem(answer) ? [] : answer.comments));
  }, [essay.id, mine?.code]);

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const answer = await essays.comment(essay.id, text);
    setBusy(false);
    if (isProblem(answer)) return setProblem(answer === 'too-short' || answer === 'too-long' || answer === 'too-many' ? answer : 'failed');
    setList((before) => [...(before ?? []), answer]);
    setFresh(answer.id);
    setText('');
  };

  const remove = async (comment: Comment) => {
    setAsking(null);
    const answer = await essays.dropComment(essay.id, comment.id);
    if (!isProblem(answer)) setList((before) => before?.filter((other) => other.id !== comment.id) ?? null);
  };

  const signIn = `${pageUrl('signin')}?next=${encodeURIComponent(essayUrl(essay.id))}`;

  return (
    <section className="comments" aria-labelledby="comments-title">
      <h2 id="comments-title" className="page-eyebrow">
        {tl(COMMENT_TEXT.title)} <span>{list?.length || ''}</span>
      </h2>
      {list?.length === 0 && <p className="people-quiet">{tl(COMMENT_TEXT.none)}</p>}
      {list && list.length > 0 && (
        <ol className="comment-list">
          {list.map((comment) => (
            <li key={comment.id} className="comment" data-fresh={comment.id === fresh || undefined}>
              <a href={personUrl(comment.author)} className="comment-who" tabIndex={-1} aria-hidden="true">
                <Avatar name={comment.author} tone={comment.tone} size="sm" />
              </a>
              <div className="comment-main">
                <p className="comment-head">
                  <a href={personUrl(comment.author)}>{comment.author}</a>
                  {comment.author === essay.author && <span className="comment-badge">{tl(COMMENT_TEXT.author)}</span>}
                  <time dateTime={new Date(comment.at).toISOString()}>{new Date(comment.at).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })}</time>
                </p>
                {comment.body.split(/\n\s*\n/).map((paragraph, at) => (
                  <p key={at} className="comment-body">
                    {paragraph}
                  </p>
                ))}
                {comment.removable &&
                  (asking === comment.id ? (
                    <p className="comment-actions">
                      <button type="button" className="text-button" onClick={() => void remove(comment)}>
                        <span className="u">{tl(COMMENT_TEXT.removeSure)}</span>
                      </button>
                      <button type="button" className="text-button" onClick={() => setAsking(null)}>
                        {tl(COMMENT_TEXT.cancel)}
                      </button>
                    </p>
                  ) : (
                    <p className="comment-actions">
                      <button type="button" className="text-button" onClick={() => setAsking(comment.id)}>
                        {tl(COMMENT_TEXT.remove)}
                      </button>
                    </p>
                  ))}
              </div>
            </li>
          ))}
        </ol>
      )}
      {mine?.name ? (
        <form
          className="comment-form"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <Avatar name={mine.name} size="sm" />
          <div className="comment-main">
            <textarea
              value={text}
              onChange={(event) => {
                setText(event.target.value.slice(0, MAX_COMMENT));
                setProblem(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void send();
              }}
              placeholder={tl(COMMENT_TEXT.write)}
              aria-label={tl(COMMENT_TEXT.write)}
              rows={2}
              maxLength={MAX_COMMENT}
            />
            <div className="comment-form-row">
              {text.length > MAX_COMMENT * 0.8 && <small>{MAX_COMMENT - text.length}</small>}
              {problem && <span className="card-problem">{tl(COMMENT_TEXT[problem])}</span>}
              <button type="submit" className="button" disabled={text.trim().length < 2 || busy} aria-busy={busy || undefined}>
                {tl(COMMENT_TEXT.send)}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <a className="button button-quiet comment-sign-in" href={signIn}>
          {tl(COMMENT_TEXT.signIn)}
        </a>
      )}
    </section>
  );
}

function OneEssay({ id }: { id: string }) {
  const { tl, lang } = useI18n();
  const articleRef = useRef<HTMLElement>(null);
  const { card: mine } = useCard();
  const [essay, setEssay] = useState<Essay | null | 'missing' | 'offline'>(null);
  const [asking, setAsking] = useState<'remove' | 'report' | null>(null);
  const [reported, setReported] = useState(false);
  const [problem, setProblem] = useState(false);

  const through = useReadingThread(articleRef, typeof essay === 'object' && essay !== null);

  useEffect(() => {
    void essays.get(id).then((answer) => {
      if (isProblem(answer)) return setEssay(answer === 'offline' ? 'offline' : 'missing');
      setEssay(answer);
      document.title = `${answer.title} · ${answer.author} · ${SITE_NAME}`;
    });
    // Signing in or out may change what may be seen.
  }, [id, mine?.code]);

  if (essay === null) return null;
  if (essay === 'missing' || essay === 'offline')
    return (
      <div className="people-missing">
        <p>{tl(essay === 'offline' ? ESSAY_TEXT.offline : ESSAY_TEXT.missing)}</p>
        <a className="text-link" href={pageUrl('essays')}>
          ← <span className="u">{tl(ESSAY_TEXT.all)}</span>
        </a>
      </div>
    );

  const books = booksOf(essay.books);
  const remove = async () => {
    const answer = await essays.drop(essay.id);
    if (isProblem(answer)) return setProblem(true);
    location.href = mine?.name ? personUrl(mine.name) : pageUrl('essays');
  };
  const report = async () => {
    setAsking(null);
    const answer = await essays.report(essay.id);
    if (isProblem(answer)) return setProblem(true);
    setReported(true);
  };

  return (
    <article className="essay" ref={articleRef}>
      <div className="essay-thread" aria-hidden="true">
        <i style={{ transform: `scaleY(${through})` }} />
        <b style={{ top: `${through * 100}%` }} />
      </div>
      <a className="text-link essay-back" href={pageUrl('essays')}>
        ← <span className="u">{tl(ESSAY_TEXT.all)}</span>
      </a>

      {essay.mine && essay.status && essay.status !== 'approved' && (
        <div className="essay-status" data-status={essay.status}>
          <p>{tl(essay.status === 'pending' ? ESSAY_TEXT.pending : ESSAY_TEXT.rejected)}</p>
          {essay.reason && (
            <p>
              <span>{tl(ESSAY_TEXT.reason)}</span> {essay.reason}
            </p>
          )}
          {essay.status === 'rejected' && (
            <a className="text-link" href={writeUrl({ id: essay.id })}>
              <span className="u">{tl(ESSAY_TEXT.editAgain)}</span> →
            </a>
          )}
        </div>
      )}

      <header className="essay-head">
        {books.length > 0 && <p className="page-eyebrow">{books.map((book) => book.title).join(' · ')}</p>}
        <h1>{essay.title}</h1>
        <p className="essay-meta essay-byline">
          <a href={personUrl(essay.author)} className="essay-author">
            <Avatar name={essay.author} tone={essay.tone} />
            <span>{essay.author}</span>
          </a>
          <time dateTime={new Date(essay.at).toISOString()}>{day(essay.at, lang)}</time>
          <span aria-hidden="true">·</span>
          <span>{tl(ESSAY_TEXT.read).replace('{n}', String(minutes(essay.words)))}</span>
        </p>
      </header>

      <Prose text={essay.body} className="prose essay-body" />

      {books.length > 0 && (
        <section className="essay-books">
          <h2 className="page-eyebrow">{tl(ESSAY_TEXT.about)}</h2>
          <ul>
            {books.map((book) => (
              <li key={book.id}>
                <a href={bookUrl(book.id)}>
                  <img src={coverUrl(book, 'sm')} alt="" width={60} height={90} loading="lazy" />
                  <span>
                    <strong>{book.title}</strong>
                    <small>
                      {book.author} · {book.year}
                    </small>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(essay.status === undefined || essay.status === 'approved') && <Comments essay={essay} />}

      <footer className="essay-foot card-actions card-quiet">
        {essay.mine ? (
          asking === 'remove' ? (
            <>
              <button type="button" className="text-button" onClick={() => void remove()}>
                <span className="u">{tl(ESSAY_TEXT.removeSure)}</span>
              </button>
              <button type="button" className="text-button" onClick={() => setAsking(null)}>
                {tl(ESSAY_TEXT.cancel)}
              </button>
            </>
          ) : (
            <>
              <a className="text-link" href={writeUrl({ id: essay.id })}>
                <span className="u">{tl(ESSAY_TEXT.edit)}</span>
              </a>
              <button type="button" className="text-button" onClick={() => setAsking('remove')}>
                <span className="u">{tl(ESSAY_TEXT.remove)}</span>
              </button>
              {essay.status === 'approved' && <small className="people-quiet">{tl(ESSAY_TEXT.editNote)}</small>}
            </>
          )
        ) : (
          mine?.name &&
          essay.status === undefined &&
          !reported &&
          (asking === 'report' ? (
            <>
              <span className="people-quiet">{tl(ESSAY_TEXT.reportSure)}</span>
              <button type="button" className="text-button" onClick={() => void report()}>
                <span className="u">{tl(ESSAY_TEXT.reportYes)}</span>
              </button>
              <button type="button" className="text-button" onClick={() => setAsking(null)}>
                {tl(ESSAY_TEXT.cancel)}
              </button>
            </>
          ) : (
            <button type="button" className="text-button essay-report" onClick={() => setAsking('report')}>
              {tl(ESSAY_TEXT.report)}
            </button>
          ))
        )}
        {reported && <span className="people-quiet">{tl(ESSAY_TEXT.reported)}</span>}
        {problem && <span className="card-problem">{tl(ESSAY_TEXT.offline)}</span>}
      </footer>
    </article>
  );
}
