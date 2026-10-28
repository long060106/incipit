import { useEffect, useMemo, useRef, useState } from 'react';
import { OPENINGS } from '../data/openings';
import { GENRES, LANGUAGES } from '../data/vocab';
import type { Book, L } from '../data/types';
import { SITE_NAME, useI18n } from '../i18n';
import { DAILY_BOOKS, drawCard, isOver, isWon, loadGame, saveGame, shareText, splitOpening, squares, streak, todayNumber, TRIES, type DayGame } from '../lib/daily';
import { bookUrl, coverUrl } from '../lib/links';
import { fold } from '../lib/match';
import { PageHeader, pageUrl, useQuickLoader } from './PageHeader';
import './first-pages.css';
import './daily.css';

/*
  The daily first line (/daily): one opening for everyone each day, and five guesses to name its
  book. Each guess that misses, or is passed, brings one more clue. The result is shared as a row
  of squares, and the line itself as a picture that never gives the answer away.
*/

const TEXT = {
  eyebrow: { en: 'The daily first line · No. {n}', fr: 'La première ligne du jour · No {n}', ru: 'Первая строка дня · № {n}', vi: 'Câu mở đầu mỗi ngày · Số {n}' },
  question: { en: 'Whose first line is this?', fr: 'De quel livre est cette première ligne ?', ru: 'Чья это первая строка?', vi: 'Câu mở đầu này của cuốn nào?' },
  shareTitle: { en: 'Incipit, the daily first line', fr: 'Incipit, la première ligne du jour', ru: 'Incipit, первая строка дня', vi: 'Incipit, câu mở đầu mỗi ngày' },
  guessLabel: { en: 'Name the book', fr: 'Nommez le livre', ru: 'Назовите книгу', vi: 'Đoán tên sách' },
  guessPlaceholder: { en: 'Title or author', fr: 'Titre ou auteur', ru: 'Название или автор', vi: 'Tên sách hoặc tác giả' },
  pass: { en: 'Pass, show a clue', fr: 'Passer, voir un indice', ru: 'Пропустить, показать подсказку', vi: 'Bỏ qua, xem gợi ý' },
  left: { en: '{n} guesses left', fr: 'Encore {n} essais', ru: 'Осталось попыток: {n}', vi: 'Còn {n} lượt đoán' },
  leftOne: { en: 'Last guess', fr: 'Dernier essai', ru: 'Последняя попытка', vi: 'Lượt đoán cuối' },
  passed: { en: 'Passed', fr: 'Passé', ru: 'Пропущено', vi: 'Đã bỏ qua' },
  nothing: { en: 'No book of that name here', fr: 'Aucun livre de ce nom ici', ru: 'Книги с таким названием здесь нет', vi: 'Không có cuốn nào tên như vậy ở đây' },
  clueGenre: { en: 'Shelved under: {g}', fr: 'Rangé parmi : {g}', ru: 'Стоит на полке: {g}', vi: 'Xếp ở kệ: {g}' },
  clueWritten: { en: 'Written in {lang}, {year}', fr: 'Écrit en {lang}, {year}', ru: 'Язык: {lang}, {year}', vi: 'Viết bằng {lang}, {year}' },
  clueSet: { en: 'Set in: {place}', fr: 'Se déroule : {place}', ru: 'Место действия: {place}', vi: 'Bối cảnh: {place}' },
  clueAuthor: { en: 'By {author}', fr: 'De {author}', ru: 'Автор: {author}', vi: 'Của {author}' },
  won: { en: 'Found in {n}.', fr: 'Trouvé en {n}.', ru: 'Угадано за {n}.', vi: 'Đoán ra sau {n}.' },
  wonFirst: { en: 'Found at the first line.', fr: 'Trouvé dès la première ligne.', ru: 'Угадано с первой строки.', vi: 'Đoán ra ngay từ câu đầu.' },
  lost: { en: 'This one was', fr: 'C’était', ru: 'Это была', vi: 'Đó là' },
  streak: { en: '{n} days in a row', fr: '{n} jours de suite', ru: 'Дней подряд: {n}', vi: '{n} ngày liền' },
  tomorrow: { en: 'A new first line tomorrow.', fr: 'Une nouvelle première ligne demain.', ru: 'Завтра — новая первая строка.', vi: 'Mai có câu mở đầu mới.' },
  readOn: { en: 'Read on', fr: 'Lire la suite', ru: 'Читать дальше', vi: 'Đọc tiếp' },
  about: { en: 'About this book', fr: 'À propos du livre', ru: 'Об этой книге', vi: 'Về cuốn sách này' },
  share: { en: 'Share the result', fr: 'Partager le résultat', ru: 'Поделиться результатом', vi: 'Chia sẻ kết quả' },
  copied: { en: 'Copied', fr: 'Copié', ru: 'Скопировано', vi: 'Đã chép' },
  picture: { en: 'The line as a picture', fr: 'La ligne en image', ru: 'Строка картинкой', vi: 'Câu văn thành ảnh' },
  pictureNote: { en: 'For a story or a post. It does not give the answer away.', fr: 'Pour une story ou un post. La réponse n’y figure pas.', ru: 'Для сторис или поста. Ответ она не выдаёт.', vi: 'Cho story hay bài đăng. Ảnh không để lộ đáp án.' },
  more: { en: 'More books by their first lines', fr: 'D’autres livres par leurs premières lignes', ru: 'Ещё книги по их первым строкам', vi: 'Thêm sách qua những câu mở đầu' },
} satisfies Record<string, L>;

const BY_ID = new Map(DAILY_BOOKS.map((book) => [book.id, book]));
const SUGGESTIONS = 6;

/** What a guess is matched on: the words of the title, the original title and the author, folded. */
const SEARCH = DAILY_BOOKS.map((book) => ({ book, words: fold(`${book.title} ${book.originalTitle ?? ''} ${book.author}`).split(/[^\p{L}\p{N}]+/u) }));

function find(query: string, skip: Set<string>): Book[] {
  const folded = fold(query.trim());
  if (!folded) return [];
  const parts = folded.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  // The title typed in full comes first, then titles that begin with what is typed.
  const rank = (book: Book) => {
    const title = fold(book.title);
    return title === folded ? 0 : title.startsWith(folded) ? 1 : 2;
  };
  return SEARCH.filter(({ book, words }) => !skip.has(book.id) && parts.every((part) => words.some((word) => word.startsWith(part))))
    .sort((a, b) => rank(a.book) - rank(b.book))
    .slice(0, SUGGESTIONS)
    .map(({ book }) => book);
}

const yearOf = (book: Book) => (book.year < 0 ? `${-book.year} BC` : String(book.year));

export default function Daily() {
  const { tl } = useI18n();
  useQuickLoader();
  const no = useMemo(() => todayNumber(), []);
  const [game, setGame] = useState<DayGame>(() => loadGame(no));
  const book = BY_ID.get(game.book)!;
  const opening = OPENINGS[game.book];
  const { first, more } = useMemo(() => splitOpening(opening.lines), [opening]);
  const over = isOver(game);
  const won = isWon(game);

  // The clues, in the order they are given: more of the page (or its shelf, when the page is all
  // there is), then the language and year, the place, and last the author.
  const clues = useMemo(() => {
    const genre = book.genres.map((id) => tl(GENRES[id])).join(', ');
    return [
      more.length ? { lines: more } : { text: tl(TEXT.clueGenre).replace('{g}', genre) },
      { text: tl(TEXT.clueWritten).replace('{lang}', tl(LANGUAGES[book.language])).replace('{year}', yearOf(book)) },
      { text: tl(TEXT.clueSet).replace('{place}', tl(book.setting.place)) },
      { text: tl(TEXT.clueAuthor).replace('{author}', book.author) },
    ];
  }, [book, more, tl]);
  const shown = clues.slice(0, over ? clues.length : game.guesses.length);

  const play = (guess: string | null) => {
    if (over) return;
    const next = { ...game, guesses: [...game.guesses, guess] };
    setGame(next);
    saveGame(no, next);
  };

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const guessed = useMemo(() => new Set(game.guesses.filter((id): id is string => !!id)), [game.guesses]);
  const found = useMemo(() => find(query, guessed), [query, guessed]);
  useEffect(() => setActive(0), [query]);
  const choose = (chosen: Book) => {
    setQuery('');
    play(chosen.id);
  };

  // Over, the answer comes into view below the lines.
  const answerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (over) answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [over]);

  const address = `${location.origin}${pageUrl('daily')}`;
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const text = shareText(no, game, tl(TEXT.shareTitle), address);
    // A phone has its own sheet for sharing; elsewhere the result is copied, to paste.
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ text }).catch(() => undefined);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      window.prompt('', text);
    }
  };

  const [drawing, setDrawing] = useState(false);
  const picture = async () => {
    setDrawing(true);
    try {
      const blob = await drawCard({
        no,
        line: first.join('\n'),
        eyebrow: `${SITE_NAME} · No. ${no}`,
        question: tl(TEXT.question),
        address: address.replace(/^https?:\/\//, ''),
      });
      const file = new File([blob], `incipit-first-line-${no}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ files: [file] }).catch(() => undefined);
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = file.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
      }
    } finally {
      setDrawing(false);
    }
  };

  const left = TRIES - game.guesses.length;
  const days = streak(no);

  return (
    <div className="first daily">
      <PageHeader here="daily" />
      <main className="first-stage daily-stage">
        <p className="page-eyebrow">{tl(TEXT.eyebrow).replace('{n}', String(no))}</p>
        <h1 className="daily-question">{tl(TEXT.question)}</h1>

        <div className="first-lines">
          {first.map((line, index) => (
            <p key={index} className={line.includes('\n') ? 'is-verse' : undefined}>
              {line}
            </p>
          ))}
        </div>

        {shown.length > 0 && (
          <ol className="daily-clues">
            {shown.map((clue, index) => (
              <li key={index}>
                {'lines' in clue ? (
                  <div className="daily-more">
                    {clue.lines!.map((line, at) => (
                      <p key={at} className={line.includes('\n') ? 'is-verse' : undefined}>
                        {line}
                      </p>
                    ))}
                  </div>
                ) : (
                  clue.text
                )}
              </li>
            ))}
          </ol>
        )}

        {!over && game.guesses.length > 0 && (
          <ul className="daily-guesses" aria-label={tl(TEXT.guessLabel)}>
            {game.guesses.map((guess, index) => (
              <li key={index} data-right={guess === game.book || undefined}>
                {guess === null ? tl(TEXT.passed) : `${BY_ID.get(guess)?.title ?? guess}`}
              </li>
            ))}
          </ul>
        )}

        {!over && (
          <div className="daily-play">
            <div className="daily-field">
              <label className="field-label" htmlFor="daily-guess">
                {tl(TEXT.guessLabel)}
              </label>
              <input
                id="daily-guess"
                type="text"
                role="combobox"
                aria-expanded={found.length > 0}
                aria-controls="daily-found"
                aria-activedescendant={found.length ? `daily-found-${active}` : undefined}
                aria-autocomplete="list"
                autoComplete="off"
                spellCheck={false}
                placeholder={tl(TEXT.guessPlaceholder)}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' && found.length) {
                    event.preventDefault();
                    setActive((value) => (value + 1) % found.length);
                  } else if (event.key === 'ArrowUp' && found.length) {
                    event.preventDefault();
                    setActive((value) => (value - 1 + found.length) % found.length);
                  } else if (event.key === 'Enter' && found[active]) {
                    event.preventDefault();
                    choose(found[active]);
                  } else if (event.key === 'Escape') setQuery('');
                }}
              />
              {query.trim() && (
                <ul className="daily-found" id="daily-found" role="listbox">
                  {found.length ? (
                    found.map((option, index) => (
                      <li
                        key={option.id}
                        id={`daily-found-${index}`}
                        role="option"
                        aria-selected={index === active}
                        onPointerEnter={() => setActive(index)}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          choose(option);
                        }}
                      >
                        <span className="daily-found-title">{option.title}</span>
                        <span className="daily-found-author">{option.author}</span>
                      </li>
                    ))
                  ) : (
                    <li className="daily-found-none">{tl(TEXT.nothing)}</li>
                  )}
                </ul>
              )}
            </div>
            <div className="daily-under">
              <span className="first-hint">{left === 1 ? tl(TEXT.leftOne) : tl(TEXT.left).replace('{n}', String(left))}</span>
              <button type="button" className="text-button daily-pass" onClick={() => play(null)}>
                {tl(TEXT.pass)}
              </button>
            </div>
          </div>
        )}

        {over && (
          <section className="daily-answer" ref={answerRef}>
            <p className="daily-verdict">
              {won ? (game.guesses.length === 1 ? tl(TEXT.wonFirst) : tl(TEXT.won).replace('{n}', String(game.guesses.length))) : tl(TEXT.lost)}
              <span className="daily-squares" aria-hidden="true">
                {squares(game)}
              </span>
            </p>
            <div className="first-book">
              <img src={coverUrl(book, 'md')} alt="" width={132} height={198} />
              <div>
                <h2>{book.title}</h2>
                <p className="first-author">
                  {book.author}, {yearOf(book)}
                </p>
                <p className="first-place">{tl(book.setting.place)}</p>
                <div className="first-actions">
                  <a className="button" href={`${pageUrl('')}read/${book.id}#${opening.section}:0`}>
                    {tl(TEXT.readOn)}
                  </a>
                  <a className="button button-quiet" href={bookUrl(book.id)}>
                    {tl(TEXT.about)}
                  </a>
                </div>
              </div>
            </div>

            <div className="daily-share">
              <button type="button" className="button" onClick={share}>
                {copied ? tl(TEXT.copied) : tl(TEXT.share)}
              </button>
              <button type="button" className="button button-quiet" onClick={picture} disabled={drawing} aria-busy={drawing || undefined}>
                {tl(TEXT.picture)}
              </button>
            </div>
            <p className="first-hint">{tl(TEXT.pictureNote)}</p>

            <p className="daily-after">
              {days > 1 && <span>{tl(TEXT.streak).replace('{n}', String(days))} · </span>}
              {tl(TEXT.tomorrow)}{' '}
              <a className="text-link" href={pageUrl('first-pages')}>
                {tl(TEXT.more)} →
              </a>
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
