import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BOOKS } from '../data/books';
import type { Book, KeywordId, Mood } from '../data/types';
import { AXES, DIFFICULTY, GENRES, KEYWORDS, LANGUAGES } from '../data/vocab';
import { useI18n } from '../i18n';
import { READABLE } from '../data/texts';
import { saveFile, useDecided } from '../lib/keeper';
import { reads } from '../lib/kepttext';
import { bookLinks, coverUrl } from '../lib/links';
import { blendedMood, blendedRating, useReviews } from '../lib/reviews';
import { useShelf } from '../lib/shelf';
import { MIN_RATINGS, similarBooks } from '../lib/match';
import { coverOrigin, type CoverOrigin } from '../lib/wall';
import { Around } from './Around';
import { Dialog } from './Dialog';
import { Keeper } from './Keeper';
import { BookEssays } from './BookEssays';
import { Readers } from './Readers';
import { CloseIcon, DownloadIcon, ExternalIcon } from './Icons';
import { Roll } from './Roll';

interface BookSheetProps {
  book: Book;
  /** True while the sheet plays its closing animation. */
  leaving: boolean;
  /** Where this book's cover was pressed, if it was: the cover flies from there into the sheet. */
  origin: CoverOrigin | null;
  onClose: () => void;
  onOpenBook: (bookId: string, origin?: CoverOrigin | null) => void;
  onUseMood: (mood: Mood) => void;
  onPickTheme: (theme: KeywordId) => void;
}

/**
 * One book, sized by what matters most to someone deciding whether to read it:
 *
 *   1. the title, then what the book is, in a lead paragraph;
 *   2. the verdict (read it if / skip it if) and four figures: rating, length, year, level;
 *   3. what reading it is like (pace, warnings, mood) and what else is like it;
 *   4. a small reference block for everything else.
 *
 * The way to get the book never scrolls away: it sits in a bar pinned to the bottom. A book
 * out of copyright is handed over from this site as a PDF. A book in copyright is never
 * offered for download; its button goes to a lender when one exists, otherwise to libraries.
 */
export function BookSheet({ book, leaving, origin, onClose, onOpenBook, onUseMood, onPickTheme }: BookSheetProps) {
  const { t, tl, lang } = useI18n();
  const shelf = useShelf();
  // The keeper of the site can switch a book's download off (src/lib/keeper.ts).
  const decided = useDecided()[book.id];
  const whole = bookLinks(book);
  const links = decided?.download === false ? { ...whole, pdf: null, pdfBytes: 0 } : whole;
  // A file the keeper keeps beside this book and has opened to readers.
  const kept = decided?.file;
  // An EPUB or a text file is read on the site, at the book's own address (src/lib/kepttext.ts).
  const keptReads = reads(kept) && !READABLE.has(book.id);
  const similar = useMemo(() => similarBooks(book, BOOKS), [book]);
  // What readers say, asked again every few seconds while the page is open (src/lib/reviews.ts).
  const { said, save, remove, takeDown } = useReviews(book.id);
  const mood = blendedMood(book, said?.summary ?? null);
  const scored = blendedRating(book, said?.summary ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLImageElement>(null);
  // Fixed for the life of the sheet: whether it opened with a cover in flight decides how
  // the sheet itself arrives, and that must not change when the reader moves to another book.
  const [arrivedByFlight] = useState(() => Boolean(origin));

  // Runs before paint for each book shown: back to the top, then the cover's flight.
  useLayoutEffect(() => {
    // Moving to a similar book reuses the sheet, so start it from the top again.
    scrollRef.current?.scrollTo({ top: 0 });
    scrollRef.current?.closest('.sheet')?.scrollTo({ top: 0 });

    const img = coverRef.current;
    const stage = img?.closest('.stage');
    if (!img || !stage || !origin || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // The image is letterboxed inside its box; find where the picture itself will sit.
    const box = img.getBoundingClientRect();
    const width = Math.min(box.width, box.height * origin.ratio);
    const height = width / origin.ratio;
    const left = box.left + (box.width - width) / 2;
    const top = box.top + (box.height - height) / 2;
    const px = (n: number) => `${n.toFixed(1)}px`;

    // A stand-in outside the sheet makes the trip, because the sheet clips its own contents.
    const flyer = document.createElement('img');
    flyer.className = 'flyer';
    flyer.alt = '';
    flyer.src = origin.src;
    stage.append(flyer);
    img.style.visibility = 'hidden';

    const animation = flyer.animate(
      [
        {
          left: px(origin.left),
          top: px(origin.top),
          width: px(origin.width),
          height: px(origin.height),
          filter: 'grayscale(1) brightness(0.7)',
        },
        { left: px(left), top: px(top), width: px(width), height: px(height), filter: 'grayscale(0) brightness(1)' },
      ],
      { duration: 760, easing: 'cubic-bezier(0.22, 0.8, 0.2, 1)', fill: 'forwards' },
    );

    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      img.style.visibility = '';
      flyer.remove();
    };
    // Swap to the real image only once it can paint, so there is no blank frame.
    animation.finished.then(() => img.decode().catch(() => undefined)).then(land, land);

    return () => {
      animation.cancel();
      land();
    };
    // Deliberately keyed on the book alone: `origin` is read as it was when that book opened.
  }, [book.id]);

  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
  const number = (n: number) => n.toLocaleString(locale);
  const year =
    book.year < 0
      ? t('yearBC', { year: -book.year })
      : book.year < 1000
        ? t('aroundShort', { year: book.year })
        : String(book.year);
  const megabytes = links.pdfBytes / 1048576;
  const size =
    megabytes >= 1
      ? `${megabytes.toLocaleString(locale, { maximumFractionDigits: 1 })} ${t('megabytes')}`
      : `${Math.round(links.pdfBytes / 1024).toLocaleString(locale)} ${t('kilobytes')}`;
  const note = book.free
    ? book.free.note
      ? tl(book.free.note)
      : links.pdf
        ? t('downloadNote', { size })
        : t('publicDomain')
    : links.borrow
      ? t('borrowNote')
      : book.original
        ? t('translationNote')
        : t('libraryNote');
  const readable = READABLE.has(book.id) || keptReads;
  const rated = scored.count >= MIN_RATINGS;
  const rating = scored.value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <Dialog
      onClose={onClose}
      leaving={leaving}
      labelledBy="sheet-title"
      className={`sheet ${arrivedByFlight ? 'has-flight' : ''}`}
    >
      <button type="button" className="icon-button sheet-close" onClick={onClose} aria-label={t('close')}>
        <CloseIcon />
      </button>

      <div className="sheet-cover">
        <img ref={coverRef} key={book.id} className={origin ? 'is-landing' : ''} src={coverUrl(book, 'md')} alt="" />
      </div>

      <div className="sheet-body" ref={scrollRef} data-scroll>
        {/* First in the markup so the keyboard reaches it first; CSS pins it to the bottom. */}
        <div className="sheet-actions">
          {readable && (
            // Its text is on the site: reading starts here, at the place kept from last time.
            <a className="button button-large" href={`${import.meta.env.BASE_URL}read/${book.id}`} data-outbound="read-here">
              <Roll>{shelf.place(book.id) ? t('readOn') : t('readHere')}</Roll>
            </a>
          )}
          {links.pdf ? (
            // The file itself, named after the book. No new tab: the browser just saves it.
            <a className={readable ? 'button button-large button-quiet' : 'button button-large'} href={links.pdf} download={links.pdfName} data-outbound="pdf">
              <DownloadIcon />
              <Roll>{readable ? t('downloadShort') : t('downloadBook')}</Roll>
            </a>
          ) : readable || kept ? null : links.readOnline ? (
            // Out of copyright, but its PDF has not been made yet.
            <a className="button button-large" href={links.readOnline} target="_blank" rel="noopener noreferrer" data-outbound="read">
              <Roll>{t('readOnline')}</Roll>
            </a>
          ) : links.borrow ? (
            <a className="button button-large" href={links.borrow} target="_blank" rel="noopener noreferrer" data-outbound="borrow">
              <Roll>{t('borrowOnline')}</Roll>
            </a>
          ) : (
            <a className="button button-large" href={links.worldcat} target="_blank" rel="noopener noreferrer" data-outbound="library">
              <Roll>{t('findLibraryShort')}</Roll>
            </a>
          )}
          {kept && (
            <button type="button" className="button button-large button-quiet" onClick={() => void saveFile(book.id, kept)} data-outbound="file">
              <DownloadIcon />
              <Roll>{kept.name.split('.').pop()!.toUpperCase()}</Roll>
            </button>
          )}
          <p className="actions-note">{note}</p>
        </div>

        <div className="sheet-content">
          <header className="sheet-head">
            <h1 id="sheet-title" className="sheet-title">
              {book.title}
            </h1>
            <p className="sheet-author">{t('by', { author: book.author })}</p>
          </header>

          <p className="sheet-lead">{tl(book.description)}</p>

          <dl className="stats">
            <div>
              <dt>{rated ? t(scored.ours ? 'ratingCountBoth' : 'ratingCount', { n: number(scored.count) }) : t('tooFewRatings')}</dt>
              <dd>
                {rated ? rating : '–'}
                {rated && <span className="stat-unit">/ 5</span>}
              </dd>
            </div>
            <div>
              <dt>{t('pagesLabel')}</dt>
              <dd>{number(book.pages)}</dd>
            </div>
            <div>
              <dt>{t('publishedLabel')}</dt>
              <dd>{year}</dd>
            </div>
            <div>
              <dt>{t('levelIs', { level: tl(DIFFICULTY[book.difficulty]).toLocaleLowerCase(locale) })}</dt>
              <dd className="stat-pips" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((step) => (
                  <span key={step} className={step <= book.difficulty ? 'is-on' : ''} />
                ))}
              </dd>
            </div>
          </dl>

          {(book.advice.readIf.en || book.advice.skipIf.en) && (
          <div className="verdict">
            <div className="verdict-yes">
              <h2>{t('readIf')}</h2>
              <p>{tl(book.advice.readIf)}</p>
            </div>
            <div className="verdict-no">
              <h2>{t('skipIf')}</h2>
              <p>{tl(book.advice.skipIf)}</p>
            </div>
          </div>
          )}

          {/* A book the keeper added may come without advice. */}
          <section className="sheet-section" hidden={!book.advice.pace.en && !book.advice.headsUp.en}>
            <h2>{t('beforeYouRead')}</h2>
            <dl className="advice">
              <div>
                <dt>{t('pace')}</dt>
                <dd>{tl(book.advice.pace)}</dd>
              </div>
              <div>
                <dt>{t('headsUp')}</dt>
                <dd>{tl(book.advice.headsUp)}</dd>
              </div>
            </dl>
          </section>

          <section className="sheet-section">
            <h2>{t('moodOfBook')}</h2>
            <ul className="mood-profile">
              {AXES.map((axis) => (
                <li key={axis.id}>
                  <span>{tl(axis.low)}</span>
                  <span className="mood-track" aria-hidden="true">
                    <span className="mood-dot" style={{ left: `${mood[axis.id]}%` }} />
                  </span>
                  <span>{tl(axis.high)}</span>
                </li>
              ))}
            </ul>
            {!!said?.summary.moodN && <p className="mood-readers">{t(said.summary.moodN === 1 ? 'moodByOne' : 'moodByReaders', { n: number(said.summary.moodN) })}</p>}
            <button type="button" className="text-button" onClick={() => onUseMood(mood)}>
              <span className="u">{t('useThisMood')}</span>
            </button>
          </section>

          <Readers book={book} said={said} mood={mood} save={save} remove={remove} takeDown={takeDown} />

          <BookEssays book={book} />

          <section className="sheet-section">
            <h2>{t('similar')}</h2>
            <ul className="similar">
              {similar.map((other) => (
                <li key={other.id}>
                  <button
                    type="button"
                    onClick={(event) => onOpenBook(other.id, coverOrigin(event.currentTarget.querySelector('.similar-cover')))}
                  >
                    <span className="similar-cover">
                      <img src={coverUrl(other, 'sm')} alt="" loading="lazy" />
                    </span>
                    <span className="similar-title">{other.title}</span>
                    <span className="similar-author">{other.author}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <Around bookId={book.id} articles={decided?.articles} />
          <Keeper bookId={book.id} hasPdf={!!whole.pdf} />

          <section className="sheet-reference" aria-label={t('details')}>
            <dl className="facts">
              <div>
                <dt>{t('writtenIn')}</dt>
                <dd>
                  {tl(LANGUAGES[book.language])}
                  {book.originalTitle && (
                    <span className="facts-note" lang={book.language}>
                      {book.originalTitle}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt>{t('setting')}</dt>
                <dd>{tl(book.setting.place)}</dd>
              </div>
              <div>
                <dt>{t('genre')}</dt>
                <dd>{book.genres.map((id) => tl(GENRES[id])).join(', ')}</dd>
              </div>
            </dl>

            <div className="reference-row">
              <h3>{t('themes')}</h3>
              <div className="chips">
                {book.keywords.map((id) => (
                  <button key={id} type="button" className="chip" onClick={() => onPickTheme(id)}>
                    {tl(KEYWORDS[id])}
                  </button>
                ))}
              </div>
            </div>

            <div className="reference-row">
              <h3>{t('otherWays')}</h3>
              <p className="reference-note">{book.free ? t('pdfHelp') : book.original ? t('translationNote') : t('inCopyright')}</p>
              <ul className="link-list">
                {links.readOnline && (
                  <li>
                    <Outbound href={links.readOnline}>{`${t('readOnline')} (${t('fromGutenberg')})`}</Outbound>
                  </li>
                )}
                {links.ereader && (
                  <li>
                    <Outbound href={links.ereader}>
                      {`${t('ereaderFiles')} (${links.ereaderSource === 'standardebooks' ? 'Standard Ebooks' : t('fromGutenberg')})`}
                    </Outbound>
                  </li>
                )}
                {links.audiobook && (
                  <li>
                    <Outbound href={links.audiobook}>{t('audiobook')}</Outbound>
                  </li>
                )}
                {links.also.map((edition) => (
                  <li key={edition.url}>
                    <Outbound href={edition.url}>{tl(edition.label)}</Outbound>
                  </li>
                ))}
                {!book.free && (
                  <li>
                    <Outbound href={links.libby}>{t('libby')}</Outbound>
                  </li>
                )}
                <li>
                  <Outbound href={links.worldcat}>{t('findLibrary')}</Outbound>
                </li>
                <li>
                  <Outbound href={links.bookshop}>{t('buyCopy')}</Outbound>
                </li>
              </ul>
            </div>

            <div className="reference-row">
              <h3>{t('reviews')}</h3>
              <ul className="link-list">
                <li>
                  <Outbound href={links.goodreads}>{t('reviewsOn', { site: 'Goodreads' })}</Outbound>
                </li>
                <li>
                  <Outbound href={links.storygraph}>{t('reviewsOn', { site: 'The StoryGraph' })}</Outbound>
                </li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </Dialog>
  );
}

function Outbound({ href, children }: { href: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <a className="text-link outbound" href={href} target="_blank" rel="noopener noreferrer">
      <span className="u">{children}</span>
      <ExternalIcon />
      <span className="sr-only">({t('opensNewTab')})</span>
    </a>
  );
}
