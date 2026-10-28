import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BOOKS } from '../data/books';
import { OPENINGS } from '../data/openings';
import type { L } from '../data/types';
import { useI18n } from '../i18n';
import { bookUrl, coverUrl } from '../lib/links';
import { PageHeader, pageUrl, useQuickLoader } from './PageHeader';
import './first-pages.css';

/*
  Choosing a book by its voice (/first-pages). The reader is shown the first lines of a book
  and nothing else: no cover, no title, no author. If the voice holds them they turn the page
  over to see what it is, and can read on from the very next line. Only books out of
  copyright are here, since only their text is on the site.
*/

const TEXT = {
  eyebrow: { en: 'A first page', fr: 'Une première page', ru: 'Первая страница', vi: 'Một trang đầu' },
  turn: { en: 'Turn it over', fr: 'Retourner la page', ru: 'Перевернуть', vi: 'Lật trang' },
  another: { en: 'Another voice', fr: 'Une autre voix', ru: 'Другой голос', vi: 'Một giọng khác' },
  readOn: { en: 'Read on', fr: 'Lire la suite', ru: 'Читать дальше', vi: 'Đọc tiếp' },
  about: { en: 'About this book', fr: 'À propos du livre', ru: 'Об этой книге', vi: 'Về cuốn sách này' },
  introTitle: { en: 'Choose a book by its voice', fr: 'Choisir un livre à sa voix', ru: 'Выбрать книгу по голосу', vi: 'Chọn sách qua giọng văn' },
  introLead: {
    en: 'A cover and a famous name decide for you before you have read a word. Here you meet a book the other way round: by its first lines alone, drawn at random.',
    fr: 'Une couverture et un nom célèbre décident à votre place avant que vous ayez lu un mot. Ici, on rencontre un livre à l’envers : par ses seules premières lignes, tirées au hasard.',
    ru: 'Обложка и громкое имя решают за вас ещё до того, как вы прочли хоть слово. Здесь вы знакомитесь с книгой наоборот: только по её первым строкам, выпавшим случайно.',
    vi: 'Một tấm bìa và một cái tên nổi tiếng quyết định thay bạn trước khi bạn đọc chữ nào. Ở đây bạn gặp cuốn sách theo chiều ngược lại: chỉ qua những dòng đầu tiên, rút ngẫu nhiên.',
  },
  step1: { en: 'Read the first lines. Nothing tells you what the book is.', fr: 'Lisez les premières lignes. Rien ne dit de quel livre il s’agit.', ru: 'Прочитайте первые строки. Ничто не подскажет, что это за книга.', vi: 'Đọc những dòng đầu. Không gì cho bạn biết đó là sách nào.' },
  step2: { en: 'If the voice does not hold you, ask for another.', fr: 'Si la voix ne vous retient pas, demandez-en une autre.', ru: 'Если голос вас не держит, попросите другой.', vi: 'Nếu giọng văn không giữ được bạn, hãy xin một giọng khác.' },
  step3: {
    en: 'If it does, turn the page over to see the book, and read on from the very next line.',
    fr: 'Si elle vous retient, retournez la page pour découvrir le livre, et lisez la suite dès la ligne suivante.',
    ru: 'Если держит — переверните страницу, чтобы увидеть книгу, и читайте дальше с той самой следующей строки.',
    vi: 'Nếu giữ được, hãy lật trang để xem đó là cuốn nào, rồi đọc tiếp ngay từ dòng kế tiếp.',
  },
  introNote: { en: '{n} books to meet, all free to read here.', fr: '{n} livres à rencontrer, tous en lecture libre ici.', ru: 'Книг для знакомства: {n}, все бесплатно читаются здесь.', vi: '{n} cuốn sách để làm quen, tất cả đều đọc miễn phí ở đây.' },
  begin: { en: 'Show me a first page', fr: 'Montrez-moi une première page', ru: 'Покажите первую страницу', vi: 'Cho tôi xem một trang đầu' },
  how: { en: 'How this works', fr: 'Comment ça marche', ru: 'Как это устроено', vi: 'Cách hoạt động' },
  hint: {
    en: 'No cover, no name. If the voice holds you, turn the page over.',
    fr: 'Ni couverture, ni nom. Si la voix vous retient, retournez la page.',
    ru: 'Ни обложки, ни имени. Если голос вас держит, переверните страницу.',
    vi: 'Không bìa, không tên. Nếu giọng văn giữ được bạn, hãy lật trang.',
  },
} satisfies Record<string, L>;

const BY_ID = new Map(BOOKS.map((book) => [book.id, book]));
const SEEN_KEY = 'incipit:first-pages-seen';

function shuffled<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function FirstPages() {
  const { tl } = useI18n();
  useQuickLoader();
  const order = useMemo(() => shuffled(Object.keys(OPENINGS).filter((id) => BY_ID.has(id) && OPENINGS[id].lines.length)), []);
  const [at, setAt] = useState(0);
  const [turned, setTurned] = useState(false);
  // A first visit begins with what the page is for; after that it goes straight to a book.
  const [intro, setIntro] = useState(() => {
    try {
      return !localStorage.getItem(SEEN_KEY);
    } catch {
      return true;
    }
  });
  const begin = () => {
    setIntro(false);
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // The introduction then shows again next time.
    }
  };

  const id = order[at % order.length];
  const book = BY_ID.get(id)!;
  const opening = OPENINGS[id];

  // Turned over, the book comes into view below the lines.
  const bookRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (turned) bookRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [turned]);

  const another = useCallback(() => {
    setTurned(false);
    setAt((value) => value + 1);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (intro) return;
      if (event.key === 'ArrowRight') another();
      if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement)) setTurned(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [another, intro]);

  const year = book.year < 0 ? `${-book.year} BC` : String(book.year);

  if (intro) {
    return (
      <div className="first">
        <PageHeader here="first-pages" />
        <main className="first-stage first-intro">
          <p className="page-eyebrow">{tl(TEXT.eyebrow)}</p>
          <h1>{tl(TEXT.introTitle)}</h1>
          <p className="first-intro-lead">{tl(TEXT.introLead)}</p>
          <ol>
            <li>{tl(TEXT.step1)}</li>
            <li>{tl(TEXT.step2)}</li>
            <li>{tl(TEXT.step3)}</li>
          </ol>
          <button type="button" className="button button-large" onClick={begin} autoFocus>
            {tl(TEXT.begin)}
          </button>
          <p className="first-hint">{tl(TEXT.introNote).replace('{n}', String(order.length))}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="first">
      <PageHeader here="first-pages" />
      <main className="first-stage">
        <p className="page-eyebrow">{tl(TEXT.eyebrow)}</p>

        <div className="first-lines" key={id}>
          {opening.lines.map((line, index) => (
            <p key={index} className={line.includes('\n') ? 'is-verse' : undefined}>
              {line}
            </p>
          ))}
        </div>

        {turned ? (
          <section className="first-book" key={`${id}-book`} ref={bookRef}>
            <img src={coverUrl(book, 'md')} alt="" width={132} height={198} />
            <div>
              <h1>{book.title}</h1>
              <p className="first-author">
                {book.author}, {year}
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
          </section>
        ) : (
          <p className="first-hint">{tl(TEXT.hint)}</p>
        )}

        <div className="first-choice">
          {!turned && (
            <button type="button" className="button" onClick={() => setTurned(true)}>
              {tl(TEXT.turn)}
            </button>
          )}
          <button type="button" className="button button-quiet" onClick={another}>
            {tl(TEXT.another)} →
          </button>
        </div>
        <button type="button" className="text-button first-how" onClick={() => setIntro(true)}>
          {tl(TEXT.how)}
        </button>
      </main>
    </div>
  );
}
