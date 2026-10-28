import { useEffect, useMemo, useRef, useState } from 'react';
import { BOOKS } from '../data/books';
import { ERAS, eraOf, settingYear } from '../data/eras';
import type { Book, L } from '../data/types';
import { countryName } from '../data/vocab';
import { useI18n } from '../i18n';
import { bookUrl, coverUrl } from '../lib/links';
import { PageHeader, useQuickLoader } from '../pages/PageHeader';
import { createGlobe, type GlobeHandle } from './globe';
import { installSky } from './sky';
import './globe.css';

/*
  Choosing books by where and when they are set (/globe). The globe lights the countries
  that have books; the line under it moves through the centuries, and the globe then shows
  only the stories of that time. Opening a book leads back to the main page.
*/

const TEXT = {
  title: { en: 'Where shall we read?', fr: 'Où lire, ce soir ?', ru: 'Где сегодня почитаем?', vi: 'Tối nay ta đọc ở đâu?' },
  lead: {
    en: '{books} books set in {countries} countries. Turn the globe and choose one, or move through time below.',
    fr: '{books} livres situés dans {countries} pays. Tournez le globe et choisissez, ou parcourez le temps ci-dessous.',
    ru: 'Книг: {books}, их действие происходит в странах: {countries}. Поверните глобус и выберите одну или пройдите сквозь время ниже.',
    vi: '{books} cuốn sách lấy bối cảnh ở {countries} quốc gia. Xoay quả địa cầu và chọn một nơi, hoặc đi xuyên thời gian ở bên dưới.',
  },
  eraLead: { en: '{books} books set in {countries} countries.', fr: '{books} livres situés dans {countries} pays.', ru: 'Книг: {books}, стран: {countries}.', vi: '{books} cuốn sách lấy bối cảnh ở {countries} quốc gia.' },
  most: { en: 'Most books', fr: 'Les mieux garnis', ru: 'Больше всего книг', vi: 'Nhiều sách nhất' },
  one: { en: '1 book set here', fr: '1 livre situé ici', ru: 'Здесь происходит 1 книга', vi: '1 cuốn sách lấy bối cảnh ở đây' },
  many: { en: '{n} books set here', fr: '{n} livres situés ici', ru: 'Книг, действие которых здесь: {n}', vi: '{n} cuốn sách lấy bối cảnh ở đây' },
  none: { en: 'No book here yet', fr: 'Aucun livre ici pour le moment', ru: 'Здесь пока нет книг', vi: 'Chưa có cuốn sách nào ở đây' },
  noneThen: { en: 'No book set here in these years', fr: 'Aucun livre situé ici à cette époque', ru: 'В эти годы здесь не происходит ни одна книга', vi: 'Chưa có cuốn sách nào lấy bối cảnh ở đây vào những năm này' },
  back: { en: 'The whole globe', fr: 'Tout le globe', ru: 'Весь глобус', vi: 'Cả quả địa cầu' },
  allTime: { en: 'All time', fr: 'Toutes les époques', ru: 'Все времена', vi: 'Mọi thời' },
  time: { en: 'When the story is set', fr: 'L’époque du récit', ru: 'Когда происходит действие', vi: 'Thời điểm câu chuyện diễn ra' },
  hint: { en: 'Drag to turn · scroll to come closer', fr: 'Glissez pour tourner · défilez pour approcher', ru: 'Тяните, чтобы вращать · прокручивайте, чтобы приблизить', vi: 'Kéo để xoay · cuộn để lại gần' },
} satisfies Record<string, L>;

const PLACED = BOOKS.filter((book) => book.setting.countries.length);
const year = (book: Book) => {
  const when = settingYear(book);
  return when < 0 ? `${-when} BC` : String(when);
};

export default function GlobePage() {
  const { lang, tl } = useI18n();
  useQuickLoader();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeHandle | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  /** Which stop of the timeline, or null for all of time. */
  const [era, setEra] = useState<number | null>(null);

  const books = useMemo(
    () => PLACED.filter((book) => era === null || eraOf(book) === era).sort((a, b) => settingYear(a) - settingYear(b)),
    [era],
  );
  const byCountry = useMemo(() => {
    const map = new Map<string, Book[]>();
    for (const book of books) {
      for (const code of book.setting.countries) map.set(code, [...(map.get(code) ?? []), book]);
    }
    return map;
  }, [books]);
  const leading = useMemo(() => [...byCountry].sort((a, b) => b[1].length - a[1].length).slice(0, 8), [byCountry]);

  useEffect(() => {
    const globe = createGlobe(canvasRef.current!, {
      counts: new Map(),
      onHover: (code, at) => setHover(code && at ? { code, ...at } : null),
      onSelect: setSelected,
    });
    globeRef.current = globe;
    return () => globe.destroy();
  }, []);

  // The stars behind it all (./sky.ts).
  useEffect(() => installSky(pageRef.current!), []);

  useEffect(() => {
    globeRef.current?.setCounts(new Map([...byCountry].map(([code, list]) => [code, list.length])));
  }, [byCountry]);

  const choose = (code: string | null) => {
    setSelected(code);
    globeRef.current?.select(code);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') choose(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const count = (n: number) => (n === 1 ? tl(TEXT.one) : tl(TEXT.many).replace('{n}', String(n)));
  const fill = (text: L) => tl(text).replace('{books}', String(books.length)).replace('{countries}', String(byCountry.size));
  const here = selected ? byCountry.get(selected) ?? [] : [];
  const eraLabel = era === null ? tl(TEXT.allTime) : tl(ERAS[era].label);

  const list = (entries: Book[]) => (
    <ul className="globe-books">
      {entries.map((book) => (
        <li key={book.id}>
          <a className="globe-book" href={bookUrl(book.id)}>
            <img src={coverUrl(book, 'sm')} alt="" width={54} height={81} loading="lazy" />
            <span>
              <strong>{book.title}</strong>
              <em>{book.author}</em>
              <small>
                {tl(book.setting.place)}
                {/\d{3}/.test(tl(book.setting.place)) ? '' : ` · ${year(book)}`}
              </small>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="globe-page" ref={pageRef}>
      <PageHeader here="globe" />

      <div className="globe-stage">
        <canvas ref={canvasRef} className="globe-canvas" aria-label={tl(TEXT.title)} />
        {hover && (
          <div className="globe-label" style={{ left: hover.x, top: hover.y }}>
            <strong>{countryName(hover.code, lang)}</strong>
            <span>{byCountry.has(hover.code) ? count(byCountry.get(hover.code)!.length) : tl(era === null ? TEXT.none : TEXT.noneThen)}</span>
          </div>
        )}

        <div className="globe-time">
          <p className="page-eyebrow">{tl(TEXT.time)}</p>
          <p className="globe-era" key={eraLabel}>
            {eraLabel}
          </p>
          <input
            type="range"
            min={0}
            max={ERAS.length}
            step={1}
            value={era === null ? 0 : era + 1}
            onChange={(event) => setEra(Number(event.target.value) === 0 ? null : Number(event.target.value) - 1)}
            aria-label={tl(TEXT.time)}
            aria-valuetext={eraLabel}
            style={{ '--at': (era === null ? 0 : era + 1) / ERAS.length } as React.CSSProperties}
          />
          <div className="globe-ticks" aria-hidden="true">
            {[null, ...ERAS.keys()].map((stop) => (
              <button key={String(stop)} type="button" tabIndex={-1} data-on={stop === era} onClick={() => setEra(stop)} />
            ))}
          </div>
        </div>
      </div>

      <aside className="globe-side" data-scroll>
        {selected ? (
          <div className="globe-country" key={`${selected}-${era}`}>
            <button type="button" className="globe-back" onClick={() => choose(null)}>
              ← {tl(TEXT.back)}
            </button>
            <h1 className="globe-title">{countryName(selected, lang)}</h1>
            <p className="globe-lead">
              {here.length ? count(here.length) : tl(TEXT.noneThen)}
              {era !== null && ` · ${eraLabel}`}
            </p>
            {list(here)}
          </div>
        ) : era === null ? (
          <div className="globe-country" key="all">
            <h1 className="globe-title">{tl(TEXT.title)}</h1>
            <p className="globe-lead">{fill(TEXT.lead)}</p>
            <h2 className="globe-sub">{tl(TEXT.most)}</h2>
            <ul className="globe-places">
              {leading.map(([code, entries]) => (
                <li key={code}>
                  <button type="button" onClick={() => choose(code)}>
                    <span>{countryName(code, lang)}</span>
                    <span>{entries.length}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="globe-hint">{tl(TEXT.hint)}</p>
          </div>
        ) : (
          <div className="globe-country" key={`era-${era}`}>
            <h1 className="globe-title">{eraLabel}</h1>
            <p className="globe-lead">{fill(TEXT.eraLead)}</p>
            {list(books)}
          </div>
        )}
      </aside>
    </div>
  );
}
