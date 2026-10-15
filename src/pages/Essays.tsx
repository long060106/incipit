import { useEffect, useState, type ReactNode } from 'react';
import { Avatar } from '../components/Avatar';
import { BOOKS } from '../data/books';
import type { Book, L } from '../data/types';
import { SITE_NAME, useI18n } from '../i18n';
import { useCard } from '../lib/card';
import { bookUrl, coverUrl } from '../lib/links';
import { essays, essayUrl, isProblem, minutes, personUrl, writeUrl, type Essay, type EssaySummary } from '../lib/people';
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
} satisfies Record<string, L>;

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
        <h1>{on ? tl(ESSAY_TEXT.on).replace('{title}', on.title) : tl(ESSAY_TEXT.title)}</h1>
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
      {list?.length === 0 && <p className="people-quiet">{tl(ESSAY_TEXT.none)}</p>}
      <ol className="essay-list">
        {list?.map((essay, at) => (
          <li key={essay.id} style={{ animationDelay: `${Math.min(at, 8) * 70}ms` }}>
            <EssayCard essay={essay} lang={lang} />
          </li>
        ))}
      </ol>
      {more && list && (
        <button type="button" className="button button-quiet essays-more" onClick={() => void load(list[list.length - 1].at)}>
          {tl(ESSAY_TEXT.more)}
        </button>
      )}
    </>
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
          </span>
        </span>
      </a>
      {children}
    </article>
  );
}

function OneEssay({ id }: { id: string }) {
  const { tl, lang } = useI18n();
  const { card: mine } = useCard();
  const [essay, setEssay] = useState<Essay | null | 'missing' | 'offline'>(null);
  const [asking, setAsking] = useState<'remove' | 'report' | null>(null);
  const [reported, setReported] = useState(false);
  const [problem, setProblem] = useState(false);

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
    <article className="essay">
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
