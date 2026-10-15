import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import type { L } from '../data/types';
import { useI18n } from '../i18n';
import { essays, essayUrl, isProblem, minutes, personUrl, type Essay } from '../lib/people';
import { Prose } from '../lib/prose';
import { booksOf } from './Essays';

/*
  Essays to read, at the keeper's desk: every essay waiting to be approved, the oldest first,
  and every approved one that readers have flagged since. The keeper reads each and approves
  it, or refuses it with a word to its author, who sees that word on their own page.
*/

const TEXT = {
  title: { en: 'Essays to read', fr: 'Essais à lire' },
  note: {
    en: 'An essay appears to readers only once you approve it. A refusal can carry a word to its author, which they see on their page.',
    fr: 'Un essai ne paraît aux lecteurs qu’une fois approuvé. Un refus peut porter un mot à son auteur, qu’il voit sur sa page.',
  },
  none: { en: 'Nothing to read. Every essay has been seen.', fr: 'Rien à lire. Chaque essai a été vu.' },
  waiting: { en: 'Waiting', fr: 'En attente' },
  flagged: { en: 'Flagged by {n} reader(s)', fr: 'Signalé par {n} lecteur(s)' },
  read: { en: 'Read it', fr: 'Le lire' },
  fold: { en: 'Fold it away', fr: 'Le replier' },
  approve: { en: 'Approve', fr: 'Approuver' },
  keep: { en: 'Keep it up', fr: 'Le laisser en ligne' },
  refuse: { en: 'Refuse', fr: 'Refuser' },
  takeDown: { en: 'Take it down', fr: 'Le retirer' },
  reason: { en: 'A word to the author (optional)', fr: 'Un mot à l’auteur (facultatif)' },
  sure: { en: 'Refuse it', fr: 'Le refuser' },
  cancel: { en: 'Cancel', fr: 'Annuler' },
  open: { en: 'Open its page', fr: 'Ouvrir sa page' },
  close: { en: 'Close', fr: 'Fermer' },
  failed: { en: 'That could not be done. Is the desk still open?', fr: 'Cela n’a pas pu être fait. Le bureau est-il encore ouvert ?' },
  words: { en: '{n} words · {m} min', fr: '{n} mots · {m} min' },
} satisfies Record<string, L>;

export function EssayDesk({ onClose }: { onClose: () => void }) {
  const { tl, lang } = useI18n();
  const [queue, setQueue] = useState<Essay[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [refusing, setRefusing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void essays.queue().then((answer) => (isProblem(answer) ? setFailed(true) : setQueue(answer.essays)));
  }, []);

  const decide = async (essay: Essay, approve: boolean) => {
    setFailed(false);
    const answer = await essays.decide(essay.id, approve, approve ? '' : reason);
    if (isProblem(answer)) return setFailed(true);
    setQueue((before) => before?.filter((other) => other.id !== essay.id) ?? null);
    setRefusing(null);
    setReason('');
  };

  return (
    <div className="admin-essays">
      <h2>
        {tl(TEXT.title)} {queue && queue.length > 0 && <span className="badge">{queue.length}</span>}
      </h2>
      <p className="card-note">{tl(TEXT.note)}</p>
      {failed && <p className="card-problem">{tl(TEXT.failed)}</p>}
      {queue?.length === 0 && <p className="card-note">{tl(TEXT.none)}</p>}
      <ul>
        {queue?.map((essay) => {
          const flagged = essay.status === 'approved';
          const books = booksOf(essay.books);
          return (
            <li key={essay.id} data-flagged={flagged || undefined}>
              <div className="admin-essay-head">
                <Avatar name={essay.author} tone={essay.tone} size="sm" />
                <div>
                  <strong>{essay.title}</strong>
                  <small>
                    <a className="text-link" href={personUrl(essay.author)} target="_blank" rel="noopener">
                      {essay.author}
                    </a>{' '}
                    · {new Date(essay.at).toLocaleDateString(lang)} · {tl(TEXT.words).replace('{n}', String(essay.words)).replace('{m}', String(minutes(essay.words)))}
                    {books.length > 0 && ` · ${books.map((book) => book.title).join(', ')}`}
                  </small>
                </div>
                <em data-flagged={flagged || undefined}>{flagged ? tl(TEXT.flagged).replace('{n}', String(essay.reports ?? 0)) : tl(TEXT.waiting)}</em>
              </div>
              {open === essay.id ? <Prose text={essay.body} className="prose admin-essay-body" /> : <p className="admin-essay-excerpt">{essay.excerpt}</p>}
              {refusing === essay.id ? (
                <div className="admin-essay-refuse">
                  <label>
                    <span>{tl(TEXT.reason)}</span>
                    <textarea value={reason} onChange={(event) => setReason(event.target.value.slice(0, 400))} rows={2} maxLength={400} autoFocus />
                  </label>
                  <div className="admin-actions">
                    <button type="button" className="button" onClick={() => void decide(essay, false)}>
                      {tl(TEXT.sure)}
                    </button>
                    <button type="button" className="text-button" onClick={() => setRefusing(null)}>
                      {tl(TEXT.cancel)}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="admin-actions">
                  <button type="button" className="button" onClick={() => void decide(essay, true)}>
                    {tl(flagged ? TEXT.keep : TEXT.approve)}
                  </button>
                  <button type="button" className="button button-quiet" onClick={() => (setRefusing(essay.id), setReason(''))}>
                    {tl(flagged ? TEXT.takeDown : TEXT.refuse)}
                  </button>
                  <button type="button" className="text-button" onClick={() => setOpen(open === essay.id ? null : essay.id)}>
                    {tl(open === essay.id ? TEXT.fold : TEXT.read)}
                  </button>
                  <a className="text-link" href={essayUrl(essay.id)} target="_blank" rel="noopener">
                    {tl(TEXT.open)} ↗
                  </a>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="admin-actions">
        <button type="button" className="text-button" onClick={onClose}>
          {tl(TEXT.close)}
        </button>
      </div>
    </div>
  );
}
