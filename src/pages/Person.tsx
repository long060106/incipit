import { useEffect, useState, type CSSProperties } from 'react';
import { Avatar } from '../components/Avatar';
import { BOOKS } from '../data/books';
import type { L } from '../data/types';
import { SITE_NAME, useI18n } from '../i18n';
import { useCard } from '../lib/card';
import { bookUrl, coverUrl } from '../lib/links';
import { isProblem, MAX_BIO, people, TONES, toneOf, writeUrl, type EssayStatus, type Person as PersonData } from '../lib/people';
import { EssayCard } from './Essays';
import { PageHeader, pageUrl, useQuickLoader } from './PageHeader';
import '../notes/notes.css';
import './people.css';

/*
  A reader's own page (/u/<name>): their initial on the colour they chose, a few lines of
  their own, the essays of theirs the keeper approved, the books they are reading if they
  choose to show them, and their reviews. On their own page a reader also sees every essay
  they sent and where it stands, and changes what the page shows.
*/

const TEXT = {
  since: { en: 'Reader since {date}', fr: 'Lecteur depuis {date}' },
  edit: { en: 'Edit your page', fr: 'Modifier votre page' },
  write: { en: 'Write an essay', fr: 'Écrire un essai' },
  bio: { en: 'A few words about you', fr: 'Quelques mots sur vous' },
  bioHint: { en: 'What you read, what you look for in a book…', fr: 'Ce que vous lisez, ce que vous cherchez dans un livre…' },
  tone: { en: 'The colour behind your initial', fr: 'La couleur derrière votre initiale' },
  showReading: { en: 'Show the books I am reading on my page', fr: 'Montrer sur ma page les livres que je lis' },
  save: { en: 'Save', fr: 'Enregistrer' },
  cancel: { en: 'Cancel', fr: 'Annuler' },
  essays: { en: 'Essays', fr: 'Essais' },
  noEssays: { en: 'No essay yet.', fr: 'Pas encore d’essai.' },
  noEssaysOwn: { en: 'You have not written an essay yet.', fr: 'Vous n’avez pas encore écrit d’essai.' },
  reading: { en: 'Reading', fr: 'En lecture' },
  readingHidden: { en: 'Only you see this. Turn it on in “Edit your page” to show it.', fr: 'Vous seul voyez ceci. Activez-le dans « Modifier votre page » pour le montrer.' },
  reviews: { en: 'Reviews', fr: 'Avis' },
  noReviews: { en: 'No review yet.', fr: 'Pas encore d’avis.' },
  pending: { en: 'Waiting for the keeper', fr: 'En attente du gardien' },
  approved: { en: 'Approved', fr: 'Approuvé' },
  rejected: { en: 'Not approved', fr: 'Non approuvé' },
  reason: { en: 'The keeper’s word:', fr: 'Le mot du gardien :' },
  editEssay: { en: 'Edit', fr: 'Modifier' },
  missing: { en: 'There is no reader by that name.', fr: 'Aucun lecteur ne porte ce nom.' },
  offline: { en: 'The server could not be reached. Try again in a moment.', fr: 'Le serveur est injoignable. Réessayez dans un instant.' },
  'too-long': { en: 'That is longer than 280 characters.', fr: 'C’est plus long que 280 caractères.' },
  stars: { en: '{n} of 5 stars', fr: '{n} étoiles sur 5' },
} satisfies Record<string, L>;

const BY_ID = new Map(BOOKS.map((book) => [book.id, book]));

export default function Person() {
  const { t, tl } = useI18n();
  const { card: mine } = useCard();
  useQuickLoader();
  const name = decodeURIComponent(location.pathname.split('/')[2] ?? '').toLowerCase();
  const [person, setPerson] = useState<PersonData | null | 'missing' | 'offline'>(null);

  useEffect(() => {
    void people.get(name).then((answer) => {
      if (isProblem(answer)) return setPerson(answer === 'offline' ? 'offline' : 'missing');
      setPerson(answer);
    });
    document.title = `${name} · ${SITE_NAME}`;
  }, [name, mine?.code]);

  return (
    <div className="people-page">
      <PageHeader here={mine?.name === name ? 'signin' : undefined} />
      <main className="people-body">
        {person === 'missing' || person === 'offline' ? (
          <div className="people-missing">
            <p>{tl(person === 'offline' ? TEXT.offline : TEXT.missing)}</p>
            <a className="text-link" href={pageUrl('essays')}>
              ← <span className="u">{t('navEssays')}</span>
            </a>
          </div>
        ) : (
          person && <Page person={person} onChange={setPerson} />
        )}
      </main>
    </div>
  );
}

function Page({ person, onChange }: { person: PersonData; onChange: (person: PersonData) => void }) {
  const { tl, lang } = useI18n();
  const [editing, setEditing] = useState(false);
  const since = new Date(person.joined).toLocaleDateString(lang, { month: 'long', year: 'numeric' });
  const reading = (person.reading ?? []).map((id) => BY_ID.get(id)).filter((book) => !!book);

  return (
    <div className="person">
      <header className="person-head">
        <Avatar name={person.name} tone={person.tone} size="lg" />
        <div className="person-who">
          <h1>{person.name}</h1>
          <p className="person-since">{tl(TEXT.since).replace('{date}', since)}</p>
          {person.bio &&
            person.bio.split(/\n\s*\n/).map((paragraph, at) => (
              <p key={at} className="person-bio">
                {paragraph}
              </p>
            ))}
          {person.own && !editing && (
            <div className="card-actions">
              <a className="button" href={writeUrl()}>
                <span className="roll">
                  <span>{tl(TEXT.write)}</span>
                </span>
              </a>
              <button type="button" className="text-button" onClick={() => setEditing(true)}>
                <span className="u">{tl(TEXT.edit)}</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {editing && (
        <EditPage
          person={person}
          onDone={(next) => {
            if (next) onChange(next);
            setEditing(false);
          }}
        />
      )}

      <section className="person-section">
        <h2 className="page-eyebrow">
          {tl(TEXT.essays)} <span>{person.essays.length || ''}</span>
        </h2>
        {person.essays.length === 0 ? (
          <p className="people-quiet">{tl(person.own ? TEXT.noEssaysOwn : TEXT.noEssays)}</p>
        ) : (
          <ol className="essay-list">
            {person.essays.map((essay) => (
              <li key={essay.id}>
                <EssayCard essay={essay} lang={lang}>
                  {person.own && essay.status && (
                    <p className="essay-standing" data-status={essay.status}>
                      <span>{tl(TEXT[essay.status as EssayStatus])}</span>
                      {essay.reason && (
                        <span>
                          {tl(TEXT.reason)} {essay.reason}
                        </span>
                      )}
                      <a className="text-link" href={writeUrl({ id: essay.id })}>
                        <span className="u">{tl(TEXT.editEssay)}</span>
                      </a>
                    </p>
                  )}
                </EssayCard>
              </li>
            ))}
          </ol>
        )}
      </section>

      {reading.length > 0 && (
        <section className="person-section">
          <h2 className="page-eyebrow">{tl(TEXT.reading)}</h2>
          {person.own && !person.showsReading && <p className="people-quiet">{tl(TEXT.readingHidden)}</p>}
          <ul className="person-reading">
            {reading.map((book) => (
              <li key={book!.id}>
                <a href={bookUrl(book!.id)} title={`${book!.title} · ${book!.author}`}>
                  <img src={coverUrl(book!, 'md')} alt={book!.title} width={120} height={180} loading="lazy" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="person-section">
        <h2 className="page-eyebrow">
          {tl(TEXT.reviews)} <span>{person.reviews.length || ''}</span>
        </h2>
        {person.reviews.length === 0 ? (
          <p className="people-quiet">{tl(TEXT.noReviews)}</p>
        ) : (
          <ul className="person-reviews">
            {person.reviews.map((review) => {
              const book = BY_ID.get(review.book);
              if (!book) return null;
              return (
                <li key={review.book}>
                  <a href={bookUrl(book.id)}>
                    <img src={coverUrl(book, 'sm')} alt="" width={48} height={72} loading="lazy" />
                  </a>
                  <div>
                    <p className="person-review-head">
                      <a href={bookUrl(book.id)}>{book.title}</a>
                      {review.stars && (
                        <span className="review-stars" aria-label={tl(TEXT.stars).replace('{n}', String(review.stars))}>
                          {'★'.repeat(review.stars)}
                          <span>{'★'.repeat(5 - review.stars)}</span>
                        </span>
                      )}
                      <time dateTime={new Date(review.changed).toISOString()}>{new Date(review.changed).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })}</time>
                    </p>
                    {review.text && <p className="person-review-text">{review.text}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function EditPage({ person, onDone }: { person: PersonData; onDone: (person: PersonData | null) => void }) {
  const { tl } = useI18n();
  const [bio, setBio] = useState(person.bio);
  const [tone, setTone] = useState(person.tone);
  const [reading, setReading] = useState(person.showsReading);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'too-long' | 'offline' | null>(null);
  const given = toneOf(person.name);

  const save = async () => {
    setBusy(true);
    setProblem(null);
    const answer = await people.save({ bio, tone, reading });
    setBusy(false);
    if (isProblem(answer)) return setProblem(answer === 'too-long' ? 'too-long' : 'offline');
    onDone(answer);
  };

  return (
    <form
      className="person-edit"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset className="person-tones">
        <legend>{tl(TEXT.tone)}</legend>
        <div role="radiogroup" aria-label={tl(TEXT.tone)}>
          {TONES.map((colour, at) => {
            const chosen = tone === at || (tone === -1 && colour === given);
            return (
              <button
                key={colour}
                type="button"
                role="radio"
                aria-checked={chosen}
                aria-label={colour}
                style={{ '--tone': colour } as CSSProperties}
                onClick={() => setTone(at)}
              >
                {person.name.charAt(0).toUpperCase()}
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className="person-bio-field">
        <span>{tl(TEXT.bio)}</span>
        <textarea value={bio} onChange={(event) => setBio(event.target.value.slice(0, MAX_BIO))} rows={3} maxLength={MAX_BIO} placeholder={tl(TEXT.bioHint)} />
        <small>{MAX_BIO - bio.length}</small>
      </label>
      <label className="person-check">
        <input type="checkbox" checked={reading} onChange={(event) => setReading(event.target.checked)} />
        <span>{tl(TEXT.showReading)}</span>
      </label>
      <div className="card-actions">
        <button type="submit" className="button" disabled={busy} aria-busy={busy || undefined}>
          {tl(TEXT.save)}
        </button>
        <button type="button" className="text-button" onClick={() => onDone(null)}>
          {tl(TEXT.cancel)}
        </button>
      </div>
      {problem && <p className="card-problem">{tl(TEXT[problem])}</p>}
    </form>
  );
}
