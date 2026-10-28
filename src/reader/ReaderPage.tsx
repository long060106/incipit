import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BOOKS } from '../data/books';
import type { L } from '../data/types';
import { useI18n } from '../i18n';
import { READABLE } from '../data/texts';
import { keptText } from '../lib/kepttext';
import { isOwn, ownBook, ownText, type OwnText } from '../lib/mybooks';
import { useShelf } from '../lib/shelf';
import { fileMarks } from '../notes/folders';
import { bookOf, markLine, markUrl, NOTE_TEXT, NoteEntry, TiePicker } from '../notes/notes';
import type { Mark } from '../lib/shelf';
import { bookUrl } from '../lib/links';
import { pageUrl, useQuickLoader } from '../pages/PageHeader';
import { installAmbience } from './ambience';
import { installConstellation, type Constellation } from './constellation';
import { sceneOf } from './scenes';
import { blockOffsets, paintMarks, selectionIn } from './marks';
import '../pages/pages.css';
import './reader.css';

/*
  Reading a public-domain book on the site (/read/<book id>). One section of the text is on
  the page at a time. The reader's place is kept as they scroll; selecting words offers to
  mark them, and a marked passage opens to a note and to ties with other notes.
*/

interface TextIndex {
  from: 'standardebooks' | 'gutenberg' | 'own' | 'kept';
  source: string;
  start: number;
  sections: { title: string; part?: string; words: number }[];
}

const TEXT = {
  contents: { en: 'Contents', fr: 'Sommaire', ru: 'Оглавление', vi: 'Mục lục' },
  notebook: { en: 'Notebook', fr: 'Carnet', ru: 'Блокнот', vi: 'Sổ tay' },
  smaller: { en: 'Smaller text', fr: 'Texte plus petit', ru: 'Мельче', vi: 'Chữ nhỏ hơn' },
  larger: { en: 'Larger text', fr: 'Texte plus grand', ru: 'Крупнее', vi: 'Chữ lớn hơn' },
  ribbon: { en: 'Bookmark', fr: 'Signet', ru: 'Закладка', vi: 'Dấu trang' },
  toRibbon: { en: 'Go to your bookmark', fr: 'Aller à votre signet', ru: 'К закладке', vi: 'Tới dấu trang' },
  narrower: { en: 'Narrower page', fr: 'Page plus étroite', ru: 'Уже страница', vi: 'Trang hẹp hơn' },
  lamp: { en: 'Lamp', fr: 'Lampe', ru: 'Лампа', vi: 'Đèn' },
  lampHint: { en: 'A lamp that follows the mouse. On or off.', fr: 'Une lampe qui suit la souris. Allumer ou éteindre.', ru: 'Лампа, которая следует за мышью. Вкл. или выкл.', vi: 'Ngọn đèn đi theo con chuột. Bật hoặc tắt.' },
  scene: { en: 'Weather', fr: 'Climat', ru: 'Погода', vi: 'Thời tiết' },
  sceneHint: {
    en: 'The air the book is set in, behind the page: snow, rain, the sea, fog… On or off.',
    fr: 'L’air où se passe le livre, derrière la page : neige, pluie, mer, brume… Activer ou non.',
    ru: 'Воздух, в котором происходит книга, за страницей: снег, дождь, море, туман… Вкл. или выкл.',
    vi: 'Không khí nơi cuốn sách diễn ra, phía sau trang: tuyết, mưa, biển, sương mù… Bật hoặc tắt.',
  },
  wider: { en: 'Wider page', fr: 'Page plus large', ru: 'Шире страница', vi: 'Trang rộng hơn' },
  mark: { en: 'Mark', fr: 'Marquer', ru: 'Отметить', vi: 'Đánh dấu' },
  note: { en: 'Mark and note', fr: 'Marquer et noter', ru: 'Отметить и записать', vi: 'Đánh dấu và ghi chú' },
  next: { en: 'Next', fr: 'Suite', ru: 'Дальше', vi: 'Tiếp' },
  previous: { en: 'Previous', fr: 'Précédent', ru: 'Назад', vi: 'Trước' },
  end: { en: 'The end', fr: 'Fin', ru: 'Конец', vi: 'Hết' },
  backToBook: { en: 'About this book', fr: 'À propos du livre', ru: 'Об этой книге', vi: 'Về cuốn sách này' },
  through: { en: '{n}% read', fr: '{n} % lus', ru: 'Прочитано {n}%', vi: 'Đã đọc {n}%' },
  missing: { en: 'This book cannot be read here.', fr: 'Ce livre ne peut pas être lu ici.', ru: 'Эту книгу нельзя читать здесь.', vi: 'Không đọc được cuốn này ở đây.' },
  missingWhy: {
    en: 'Only books out of copyright have their text on the site.',
    fr: 'Seuls les livres du domaine public ont leur texte sur le site.',
    ru: 'Текст на сайте есть только у книг без авторских прав.',
    vi: 'Chỉ sách đã hết bản quyền mới có văn bản trên trang.',
  },
  home: { en: 'Back to the books', fr: 'Retour aux livres', ru: 'Назад к книгам', vi: 'Trở về các cuốn sách' },
  credit: { en: 'Text in the public domain, from', fr: 'Texte du domaine public, d’après', ru: 'Текст в общественном достоянии, по изданию', vi: 'Văn bản thuộc phạm vi công cộng, theo' },
  ownCopy: { en: 'Your own copy, kept in this browser only.', fr: 'Votre propre exemplaire, conservé dans ce seul navigateur.', ru: 'Ваш собственный экземпляр, хранится только в этом браузере.', vi: 'Bản của riêng bạn, chỉ lưu trong trình duyệt này.' },
  wholeNotebook: { en: 'The whole notebook', fr: 'Tout le carnet', ru: 'Весь блокнот', vi: 'Cả sổ tay' },
  close: { en: 'Close', fr: 'Fermer', ru: 'Закрыть', vi: 'Đóng' },
  toPassage: { en: 'Go to the passage', fr: 'Aller au passage', ru: 'К отрывку', vi: 'Tới đoạn trích' },
  folderEmpty: {
    en: 'Select any words to mark them. This book’s folder fills as you read, with a file for each day: its title and the date.',
    fr: 'Sélectionnez des mots pour les marquer. Le dossier de ce livre se remplit à mesure, avec un fichier par jour : son titre et la date.',
    ru: 'Выделите любые слова, чтобы отметить их. Папка этой книги наполняется по мере чтения: по файлу на каждый день, с её названием и датой.',
    vi: 'Chọn chữ bất kỳ để đánh dấu. Thư mục của cuốn sách này đầy dần khi bạn đọc, mỗi ngày một tệp: tên sách và ngày.',
  },
  select: { en: 'Select any words to mark them.', fr: 'Sélectionnez des mots pour les marquer.', ru: 'Выделите любые слова, чтобы отметить их.', vi: 'Chọn chữ bất kỳ để đánh dấu.' },
} satisfies Record<string, L>;

const SOURCE: Record<string, string> = { standardebooks: 'Standard Ebooks', gutenberg: 'Project Gutenberg' };
const SIZES = [1.125, 1.25, 1.375, 1.5, 1.6875, 1.875];
const SIZE_KEY = 'incipit:read-size';
/** How wide the column of text may be, in rem; the reader steps between these. */
const WIDTHS = [32, 42, 54, 68, 86];
const WIDTH_KEY = 'incipit:read-width';
const LAMP_KEY = 'incipit:read-lamp';
const SCENE_KEY = 'incipit:read-scene';

const bookId = () => decodeURIComponent(location.pathname.split('/')[2] ?? '');
/** The keeper's code, if this browser holds the keeper's card: a file closed to readers is read with it. */
const keeperCode = (): string | null => {
  try {
    const kept = JSON.parse(localStorage.getItem('incipit:card') ?? 'null');
    return kept?.role === 'admin' && typeof kept.code === 'string' ? kept.code : null;
  } catch {
    return null;
  }
};
/** "#12:3400" asks for section 12 at character 3400. */
const hashPlace = () => {
  const [, section, offset] = /^#(\d+)(?::(\d+))?$/.exec(location.hash) ?? [];
  return section ? { section: Number(section), offset: Number(offset ?? 0), asked: true } : null;
};

export default function ReaderPage() {
  const { tl } = useI18n();
  const shelf = useShelf();
  useQuickLoader();
  // Elsewhere the site hides the page's scrollbar; a book needs one to take hold of.
  useEffect(() => {
    document.documentElement.classList.add('is-reading');
    return () => document.documentElement.classList.remove('is-reading');
  }, []);
  const [width, setWidth] = useState(() => {
    const kept = Number(localStorage.getItem(WIDTH_KEY));
    return WIDTHS.includes(kept) ? kept : WIDTHS[2];
  });
  const widen = (step: number) => {
    const next = WIDTHS[Math.min(WIDTHS.length - 1, Math.max(0, WIDTHS.indexOf(width) + step))];
    setWidth(next);
    try {
      localStorage.setItem(WIDTH_KEY, String(next));
    } catch {
      // The width then lasts for this visit only.
    }
  };
  // A book of the catalogue, or one the reader added from their own device (src/lib/mybooks.ts).
  const book = useMemo(() => {
    const id = bookId();
    const found = isOwn(id) ? ownBook(id) : BOOKS.find((entry) => entry.id === id);
    // `local`: the text is not among the site's files but read in this browser, from the reader's own
    // file or from the one the keeper keeps beside the book.
    return found ? { id: found.id, title: found.title, author: found.author, own: isOwn(id), local: isOwn(id) || !READABLE.has(id) } : undefined;
  }, []);
  // The room at night: stars behind the page and a lamp on it (./ambience.ts), unless the reader puts it out.
  const readerRef = useRef<HTMLDivElement>(null);
  const [lamp, setLamp] = useState(() => localStorage.getItem(LAMP_KEY) !== 'off');
  useEffect(() => {
    try {
      localStorage.setItem(LAMP_KEY, lamp ? 'on' : 'off');
    } catch {
      // The choice then lasts for this visit only.
    }
  }, [lamp]);
  // The book's own weather behind the page (./scenes.ts), where it has one, unless the reader would rather the plain sky.
  const scene = useMemo(() => sceneOf(BOOKS.find((entry) => entry.id === book?.id)), [book]);
  const [weather, setWeather] = useState(() => localStorage.getItem(SCENE_KEY) !== 'off');
  useEffect(() => {
    try {
      localStorage.setItem(SCENE_KEY, weather ? 'on' : 'off');
    } catch {
      // The choice then lasts for this visit only.
    }
    if (readerRef.current) return installAmbience(readerRef.current, weather ? scene : 'night');
  }, [weather, scene]);
  const ownSections = useRef<OwnText['sections']>([]);
  const [index, setIndex] = useState<TextIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [section, setSection] = useState(0);
  const [html, setHtml] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [barHidden, setBarHidden] = useState(false);
  const [size, setSize] = useState(() => {
    const kept = Number(localStorage.getItem(SIZE_KEY));
    return SIZES.includes(kept) ? kept : SIZES[2];
  });
  const [picked, setPicked] = useState<{ start: number; end: number; quote: string; x: number; y: number } | null>(null);
  const [open, setOpen] = useState<{ id: string; x: number; y: number } | null>(null);
  const [tying, setTying] = useState(false);

  const articleRef = useRef<HTMLElement>(null);
  const blocks = useRef<{ el: HTMLElement; from: number }[]>([]);
  /** Where to put the reader once the section is on the page. */
  const landing = useRef<{ offset: number; asked?: boolean } | null>(null);
  /** The text the reader was last put in place on, so that it happens once for each. */
  const landedOn = useRef<string | null>(null);
  const [jump, setJump] = useState(0);
  /** The section on the page, for callbacks that outlive a render. */
  const shown = useRef(0);
  shown.current = section;
  const base = `${import.meta.env.BASE_URL}texts/${book?.id}`;

  // The list of sections, then the place to start: the address, the kept place, or the story's start.
  useEffect(() => {
    if (!book) return;
    const loading: Promise<TextIndex> = book.local
      ? (book.own ? ownText(book.id) : keptText(book.id, keeperCode())).then((text) => {
          if (!text) throw new Error('gone');
          ownSections.current = text.sections;
          return { from: book.own ? 'own' : 'kept', source: '', start: 0, sections: text.sections.map(({ title, words }) => ({ title, words })) };
        })
      : fetch(`${base}/index.json`).then((response) => (response.ok ? response.json() : Promise.reject()));
    loading
      .then((loaded: TextIndex) => {
        const place = hashPlace() ?? shelf.place(book.id) ?? { section: loaded.start, offset: 0 };
        landing.current = place;
        setSection(Math.min(Math.max(0, place.section), loaded.sections.length - 1));
        setIndex(loaded);
      })
      .catch(() => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book]);

  useEffect(() => {
    if (!index) return;
    let stale = false;
    setHtml(null);
    setPicked(null);
    setOpen(null);
    (book?.local
      ? Promise.resolve(ownSections.current[section]?.html ?? '')
      : fetch(`${base}/${section}.txt`).then((response) => (response.ok ? response.text() : Promise.reject()))
    )
      .then((text) => !stale && setHtml(text))
      .catch(() => !stale && setFailed(true));
    return () => {
      stale = true;
    };
  }, [index, section, base]);

  // Each passage marked is a star in the margins (./constellation.ts); a new one flies there from its words.
  const bookMarks = book ? shelf.marks().filter((mark) => mark.bookId === book.id) : [];
  const starMarks = useRef(bookMarks);
  starMarks.current = bookMarks;
  const stars = useRef<Constellation | null>(null);
  const goRef = useRef<(mark: Mark) => void>(() => {});
  useEffect(() => {
    if (!readerRef.current || !book) return;
    const installed = installConstellation(readerRef.current, () => starMarks.current, (mark) => goRef.current(mark));
    stars.current = installed;
    return () => {
      installed.remove();
      stars.current = null;
    };
  }, [book]);

  const marks = book ? shelf.marksIn(book.id, section) : [];
  const marksKey = marks.map((mark) => `${mark.id}:${mark.note ? 1 : 0}:${mark.links.length}`).join(',');
  /** The one paragraph of the book the reader has put a ribbon on. */
  const ribbon = book ? shelf.bookmark(book.id) : undefined;
  const ribbonHere = ribbon?.section === section ? ribbon.offset : -1;

  // The text goes onto the page by hand, so that marks can be painted into it.
  useEffect(() => {
    const article = articleRef.current;
    if (!article || html === null) return;
    article.innerHTML = html;
    paintMarks(article, marks);
    blocks.current = blockOffsets(article);
    blocks.current.find((entry) => entry.from === ribbonHere)?.el.setAttribute('data-ribbon', 'true');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, marksKey, ribbonHere]);

  /** Puts the ribbon on a paragraph, or takes it off if it is already there. */
  const setRibbon = (offset: number) => {
    if (!book) return;
    if (ribbonHere === offset) shelf.clearBookmark(book.id);
    else shelf.setBookmark(book.id, { section, offset });
  };
  /** The paragraph at the top of the screen. */
  const topBlock = () => blocks.current.find((entry) => entry.el.getBoundingClientRect().bottom > 96) ?? blocks.current[0];

  // Once a section arrives, go to the place asked for; otherwise to its top.
  useEffect(() => {
    if (html === null || landedOn.current === html) return;
    landedOn.current = html;
    const target = landing.current;
    landing.current = null;
    const block = target?.offset ? [...blocks.current].reverse().find((entry) => entry.from <= target.offset) : null;
    if (!block) {
      window.scrollTo(0, 0);
      return;
    }
    block.el.scrollIntoView({ block: 'start' });
    if (target?.asked) {
      const flash = [...(articleRef.current?.querySelectorAll<HTMLElement>('mark') ?? [])].find((el) => shelf.mark(el.dataset.id!)?.start === target.offset);
      (flash || block.el).animate([{ backgroundColor: 'color-mix(in srgb, var(--accent) 34%, transparent)' }, { backgroundColor: 'transparent' }], { duration: 2200, easing: 'ease-out' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, jump]);

  const total = useMemo(() => index?.sections.reduce((sum, entry) => sum + entry.words, 0) ?? 1, [index]);
  const before = useMemo(() => index?.sections.slice(0, section).reduce((sum, entry) => sum + entry.words, 0) ?? 0, [index, section]);
  const [through, setThrough] = useState(0);

  // Keep the reader's place as they scroll, and tuck the bar away while they read on.
  useEffect(() => {
    if (!book || !index || html === null) return;
    let frame = 0;
    let timer = 0;
    let last = window.scrollY;
    const measure = () => {
      const top = blocks.current.find((entry) => entry.el.getBoundingClientRect().bottom > 96) ?? blocks.current.at(-1);
      const offset = top?.from ?? 0;
      const room = document.documentElement.scrollHeight - window.innerHeight;
      const part = room > 0 ? Math.min(1, window.scrollY / room) : 1;
      const done = Math.min(1, (before + index.sections[section].words * part) / total);
      setThrough(done);
      return { section, offset, through: done };
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        if (Math.abs(y - last) > 6) setBarHidden(y > last && y > 120);
        last = y;
        const place = measure();
        window.clearTimeout(timer);
        timer = window.setTimeout(() => shelf.setPlace(book.id, place), 500);
      });
    };
    measure();
    // Opening a section counts as being there, even before any scrolling.
    timer = window.setTimeout(() => shelf.setPlace(book.id, measure()), 1200);
    // Reaching for the top of the window brings the bar back.
    const onPointer = (event: PointerEvent) => {
      if (event.clientY < 72) setBarHidden(false);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointer, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointer);
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, index, html, section]);

  // Selected words offer to be marked. Touch screens show their own menu above, so ours goes below.
  useEffect(() => {
    let timer = 0;
    const onSelection = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const article = articleRef.current;
        const found = article && selectionIn(article);
        if (!found) return setPicked(null);
        const coarse = window.matchMedia('(pointer: coarse)').matches;
        setOpen(null);
        setPicked({
          start: found.start,
          end: found.end,
          quote: found.quote,
          x: Math.min(window.innerWidth - 110, Math.max(110, found.rect.left + found.rect.width / 2)),
          y: window.scrollY + (coarse ? found.rect.bottom + 14 : Math.max(64, found.rect.top - 52)),
        });
      }, 250);
    };
    document.addEventListener('selectionchange', onSelection);
    return () => {
      document.removeEventListener('selectionchange', onSelection);
      window.clearTimeout(timer);
    };
  }, []);

  const go = useCallback((to: number, offset = 0, asked = false) => {
    landing.current = { offset, asked };
    landedOn.current = null;
    setTocOpen(false);
    setOpen(null);
    // Already in that section, the text is on the page and only the place changes. Otherwise
    // the place waits for the new section's text.
    if (to === shown.current) setJump((count) => count + 1);
    setSection(to);
    if (!asked) history.replaceState(history.state, '', location.pathname);
  }, []);

  // A link to a passage of this same book changes only the address after the #.
  useEffect(() => {
    const onHash = () => {
      const place = hashPlace();
      if (place) go(place.section, place.offset, true);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [go]);

  const resize = (step: number) => {
    const next = SIZES[Math.min(SIZES.length - 1, Math.max(0, SIZES.indexOf(size) + step))];
    setSize(next);
    try {
      localStorage.setItem(SIZE_KEY, String(next));
    } catch {
      // The size then lasts for this visit only.
    }
  };

  goRef.current = (mark) => go(mark.section ?? 0, mark.start ?? 0, true);

  const addMark = (withNote: boolean) => {
    if (!picked || !book) return;
    const selection = window.getSelection();
    const words = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).getBoundingClientRect() : null;
    const mark = shelf.addMark({ bookId: book.id, section, start: picked.start, end: picked.end, quote: picked.quote });
    if (words && words.width > 0) stars.current?.launch(mark.id, { x: words.left + words.width / 2, y: words.top + words.height / 2 });
    selection?.removeAllRanges();
    setPicked(null);
    if (withNote) setOpen({ id: mark.id, x: picked.x, y: picked.y + 40 });
  };

  const onArticleClick = (event: React.MouseEvent) => {
    // A press in the margin beside a paragraph, where its ribbon hangs, moves the ribbon there.
    const beside = blocks.current.find((entry) => entry.el === event.target);
    if (beside && event.clientX < beside.el.getBoundingClientRect().left) return setRibbon(beside.from);
    const el = (event.target as HTMLElement).closest<HTMLElement>('mark[data-id]');
    if (!el || !window.getSelection()?.isCollapsed) return;
    const rect = el.getBoundingClientRect();
    setTying(false);
    setOpen({ id: el.dataset.id!, x: Math.min(window.innerWidth - 180, Math.max(180, rect.left + rect.width / 2)), y: window.scrollY + rect.bottom + 10 });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(null);
        setTocOpen(false);
        setDrawer(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!book || failed) {
    return (
      <div className="reader reader-missing">
        <h1>{tl(TEXT.missing)}</h1>
        <p>{tl(TEXT.missingWhy)}</p>
        <a className="button" href={book ? bookUrl(book.id) : pageUrl('')}>
          {tl(book ? TEXT.backToBook : TEXT.home)}
        </a>
      </div>
    );
  }

  const here = index?.sections[section];
  const opened = open ? shelf.mark(open.id) : undefined;

  return (
    <div className="reader" ref={readerRef} data-lamp={lamp ? 'lit' : 'out'} style={{ '--read-size': `${size}rem`, '--read-width': `${width}rem` } as React.CSSProperties}>
      <div className="reader-progress" style={{ transform: `scaleX(${through})` }} />

      <header className="reader-bar" data-hidden={barHidden && !tocOpen && !drawer}>
        <a className="reader-back" href={book.own ? pageUrl('notebook') : bookUrl(book.id)} aria-label={tl(book.own ? TEXT.notebook : TEXT.backToBook)}>
          <span aria-hidden="true">←</span>
          <span className="reader-book">{book.title}</span>
        </a>
        <nav className="page-nav">
          <button type="button" onClick={() => setTocOpen((value) => !value)} aria-expanded={tocOpen}>
            {tl(TEXT.contents)}
          </button>
          <button type="button" onClick={() => topBlock() && setRibbon(topBlock().from)} aria-pressed={ribbonHere >= 0 && topBlock()?.from === ribbonHere}>
            {tl(TEXT.ribbon)}
          </button>
          <button type="button" className="reader-lamp" onClick={() => setLamp(!lamp)} aria-pressed={lamp} title={tl(TEXT.lampHint)}>
            {tl(TEXT.lamp)}
          </button>
          {scene !== 'night' && (
            <button type="button" className="reader-lamp" onClick={() => setWeather(!weather)} aria-pressed={weather} title={tl(TEXT.sceneHint)}>
              {tl(TEXT.scene)}
            </button>
          )}
          <button type="button" className="reader-size reader-width" onClick={() => widen(-1)} aria-label={tl(TEXT.narrower)} title={tl(TEXT.narrower)} disabled={width === WIDTHS[0]}>
            →←
          </button>
          <button type="button" className="reader-size reader-width" onClick={() => widen(1)} aria-label={tl(TEXT.wider)} title={tl(TEXT.wider)} disabled={width === WIDTHS.at(-1)}>
            ←→
          </button>
          <button type="button" className="reader-size" onClick={() => resize(-1)} aria-label={tl(TEXT.smaller)} disabled={size === SIZES[0]}>
            A−
          </button>
          <button type="button" className="reader-size" onClick={() => resize(1)} aria-label={tl(TEXT.larger)} disabled={size === SIZES.at(-1)}>
            A+
          </button>
          <button type="button" onClick={() => (setDrawer((value) => !value), setTocOpen(false))} aria-pressed={drawer} aria-controls="reader-drawer">
            {tl(TEXT.notebook)}
          </button>
        </nav>
      </header>

      {tocOpen && index && (
        <>
          <div className="reader-scrim" onClick={() => setTocOpen(false)} />
          <aside className="reader-toc" data-scroll>
            {ribbon && (
              <button type="button" className="reader-toc-ribbon" onClick={() => go(ribbon.section, ribbon.offset, true)}>
                <span className="page-eyebrow">{tl(TEXT.toRibbon)}</span>
                <span>{index.sections[ribbon.section]?.title || '·'}</span>
              </button>
            )}
            <p className="page-eyebrow">{tl(TEXT.contents)}</p>
            <ol>
              {index.sections.map((entry, at) => (
                <li key={at}>
                  {entry.part && <span className="reader-part">{entry.part}</span>}
                  <button type="button" aria-current={at === section ? 'true' : undefined} onClick={() => go(at)}>
                    {entry.title || '·'}
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        </>
      )}

      <main className="reader-page">
        {here && (
          <header className="reader-head">
            <p className="page-eyebrow">
              {[book.author, book.title].filter(Boolean).join(' · ')}
            </p>
            {here.part && <p className="reader-part">{here.part}</p>}
            {here.title && <h1>{here.title}</h1>}
          </header>
        )}
        <article ref={articleRef} className="reader-text" onClick={onArticleClick} data-loading={html === null} />
        {index && html !== null && (
          <footer className="reader-foot">
            {section + 1 < index.sections.length ? (
              <button type="button" className="reader-next" onClick={() => go(section + 1)}>
                <span className="page-eyebrow">{tl(TEXT.next)}</span>
                <span>{index.sections[section + 1].title || '→'}</span>
              </button>
            ) : (
              <p className="reader-end">{tl(TEXT.end)}</p>
            )}
            <div className="reader-foot-row">
              {section > 0 && (
                <button type="button" className="text-button" onClick={() => go(section - 1)}>
                  ← {tl(TEXT.previous)}
                </button>
              )}
              <span>{tl(TEXT.through).replace('{n}', String(Math.round(through * 100)))}</span>
            </div>
            <p className="reader-credit">
              {index.from === 'own' ? (
                tl(TEXT.ownCopy)
              ) : index.from === 'kept' ? null : (
                <>
                  {tl(TEXT.credit)}{' '}
                  <a href={index.source} target="_blank" rel="noopener noreferrer">
                    {SOURCE[index.from]}
                  </a>
                  .
                </>
              )}{' '}
              {bookMarks.length === 0 && tl(TEXT.select)}
            </p>
          </footer>
        )}
      </main>

      <NotebookDrawer
        open={drawer}
        bookId={book.id}
        title={book.title}
        marks={bookMarks}
        onClose={() => setDrawer(false)}
        goTo={(mark) => {
          go(mark.section ?? 0, mark.start ?? 0, true);
          if (window.matchMedia('(max-width: 900px)').matches) setDrawer(false);
        }}
      />

      {picked && (
        <div className="reader-pick" style={{ left: picked.x, top: picked.y }} onPointerDown={(event) => event.preventDefault()}>
          <button type="button" onClick={() => addMark(false)}>
            {tl(TEXT.mark)}
          </button>
          <button type="button" onClick={() => addMark(true)}>
            {tl(TEXT.note)}
          </button>
        </div>
      )}

      {open && opened && (
        <div className="reader-note" style={{ left: open.x, top: open.y }}>
          {tying ? (
            <TiePicker
              markId={opened.id}
              onPick={(id) => {
                shelf.tie(opened.id, id);
                setTying(false);
              }}
              onClose={() => setTying(false)}
            />
          ) : (
            <>
              <textarea
                key={opened.id}
                defaultValue={opened.note}
                placeholder={tl(NOTE_TEXT.write)}
                onChange={(event) => shelf.editMark(opened.id, { note: event.target.value })}
                autoFocus={!opened.note}
                rows={3}
              />
              {opened.links.length > 0 && (
                <ul className="reader-ties">
                  {opened.links.map((id) => {
                    const other = shelf.mark(id);
                    if (!other) return null;
                    const url = markUrl(other);
                    return (
                      <li key={id}>
                        <a href={url ?? `${pageUrl('notebook')}#${id}`}>
                          <span>{markLine(other, 70)}</span>
                          <small>{bookOf(other)?.title ?? tl(NOTE_TEXT.thought)}</small>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="reader-note-row">
                <button type="button" className="text-button" onClick={() => setTying(true)}>
                  {tl(NOTE_TEXT.tie)}
                </button>
                <button
                  type="button"
                  className="text-button reader-remove"
                  onClick={() => {
                    shelf.removeMark(opened.id);
                    setOpen(null);
                  }}
                >
                  {tl(NOTE_TEXT.remove)}
                </button>
                <button type="button" className="text-button" onClick={() => setOpen(null)}>
                  {tl(NOTE_TEXT.done)}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The notebook beside the book: this book's folder, a file for each day, every note in it to
 * read and edit, each leading back to its passage. It slides in from the right and leaves the
 * page where it is.
 */
function NotebookDrawer({ open, bookId, title, marks, onClose, goTo }: { open: boolean; bookId: string; title: string; marks: Mark[]; onClose: () => void; goTo: (mark: Mark) => void }) {
  const { tl } = useI18n();
  const files = useMemo(() => fileMarks(marks, title)[0]?.files ?? [], [marks, title]);
  const follow = (other: Mark) => {
    if (other.bookId === bookId) goTo(other);
    else location.href = markUrl(other) ?? `${pageUrl('notebook')}#${other.id}`;
  };
  return (
    <>
      {open && <div className="reader-drawer-scrim" onClick={onClose} />}
      <aside id="reader-drawer" className="reader-drawer" data-open={open || undefined} aria-hidden={!open} inert={!open}>
        <header className="reader-drawer-head">
          <div>
            <p className="page-eyebrow">{tl(TEXT.notebook)}</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="reader-drawer-close" onClick={onClose} aria-label={tl(TEXT.close)}>
            ×
          </button>
        </header>
        <div className="reader-drawer-body" data-scroll>
          {files.length === 0 ? (
            <p className="card-note">{tl(TEXT.folderEmpty)}</p>
          ) : (
            files.map((file, at) => (
              <details key={file.id} className="reader-drawer-file" open={at === 0 || undefined}>
                <summary>
                  <svg className="file-icon" viewBox="0 0 16 20" width="12" height="15" aria-hidden="true">
                    <path d="M1.5 1.5h8l5 5v12h-13z M9.5 1.5v5h5" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                  </svg>
                  <span>{file.name}</span>
                  <small>{file.marks.length}</small>
                </summary>
                {file.marks.map((mark) => (
                  <NoteEntry
                    key={mark.id}
                    mark={mark}
                    follow={follow}
                    place={
                      <button type="button" className="text-link" onClick={() => goTo(mark)}>
                        {tl(TEXT.toPassage)} →
                      </button>
                    }
                  />
                ))}
              </details>
            ))
          )}
        </div>
        <a className="reader-drawer-foot text-link" href={pageUrl('notebook')}>
          {tl(TEXT.wholeNotebook)} →
        </a>
      </aside>
    </>
  );
}
