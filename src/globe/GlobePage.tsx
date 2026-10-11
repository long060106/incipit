import { useEffect, useMemo, useRef, useState } from 'react';
import { BOOKS } from '../data/books';
import type { L } from '../data/types';
import { countryName } from '../data/vocab';
import { SITE_NAME, useI18n } from '../i18n';
import { coverUrl } from '../lib/links';
import { runLoader } from '../lib/loader';
import { createGlobe, type GlobeHandle } from './globe';
import './globe.css';

/*
  A trial of choosing books by where they are set, on a globe (the page at /globe). It
  stands apart from the main page for now: opening a book leads back there.
*/

const TEXT = {
  tag: { en: 'The globe · a trial', fr: 'Le globe · un essai' },
  title: { en: 'Where shall we read?', fr: 'Où lire, ce soir ?' },
  lead: {
    en: '{books} books set in {countries} countries. Turn the globe and choose one.',
    fr: '{books} livres situés dans {countries} pays. Tournez le globe et choisissez.',
  },
  most: { en: 'Most books', fr: 'Les mieux garnis' },
  one: { en: '1 book set here', fr: '1 livre situé ici' },
  many: { en: '{n} books set here', fr: '{n} livres situés ici' },
  none: { en: 'No book here yet', fr: 'Aucun livre ici pour le moment' },
  back: { en: 'The whole globe', fr: 'Tout le globe' },
  hint: { en: 'Drag to turn · scroll to come closer', fr: 'Glissez pour tourner · défilez pour approcher' },
} satisfies Record<string, L>;

export default function GlobePage() {
  const { lang, tl } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const globeRef = useRef<GlobeHandle | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);

  const byCountry = useMemo(() => {
    const map = new Map<string, typeof BOOKS>();
    for (const book of BOOKS) {
      for (const code of book.setting.countries) map.set(code, [...(map.get(code) ?? []), book]);
    }
    return map;
  }, []);

  const placed = useMemo(() => BOOKS.filter((book) => book.setting.countries.length).length, []);
  const leading = useMemo(
    () => [...byCountry].sort((a, b) => b[1].length - a[1].length).slice(0, 8),
    [byCountry],
  );

  useEffect(() => runLoader(() => undefined), []);

  useEffect(() => {
    const globe = createGlobe(canvasRef.current!, {
      counts: new Map([...byCountry].map(([code, books]) => [code, books.length])),
      onHover: (code, at) => setHover(code && at ? { code, ...at } : null),
      onSelect: setSelected,
    });
    globeRef.current = globe;
    return () => globe.destroy();
  }, [byCountry]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') choose(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const choose = (code: string | null) => {
    setSelected(code);
    globeRef.current?.select(code);
  };

  const count = (n: number) => (n === 1 ? tl(TEXT.one) : tl(TEXT.many).replace('{n}', String(n)));
  const books = selected ? byCountry.get(selected) ?? [] : [];

  return (
    <div className="globe-page">
      <header className="globe-head">
        <a className="globe-wordmark" href={import.meta.env.BASE_URL}>
          {SITE_NAME}
        </a>
        <span className="globe-tag">{tl(TEXT.tag)}</span>
      </header>

      <div className="globe-stage">
        <canvas ref={canvasRef} className="globe-canvas" aria-label={tl(TEXT.title)} />
        {hover && (
          <div className="globe-label" style={{ left: hover.x, top: hover.y }}>
            <strong>{countryName(hover.code, lang)}</strong>
            <span>{byCountry.has(hover.code) ? count(byCountry.get(hover.code)!.length) : tl(TEXT.none)}</span>
          </div>
        )}
        <p className="globe-hint">{tl(TEXT.hint)}</p>
      </div>

      <aside className="globe-side" data-scroll>
        {selected ? (
          <div className="globe-country" key={selected}>
            <button type="button" className="globe-back" onClick={() => choose(null)}>
              ← {tl(TEXT.back)}
            </button>
            <h1 className="globe-title">{countryName(selected, lang)}</h1>
            <p className="globe-lead">{count(books.length)}</p>
            <ul className="globe-books">
              {books.map((book) => (
                <li key={book.id}>
                  <a className="globe-book" href={`${import.meta.env.BASE_URL}#book=${book.id}`}>
                    <img src={coverUrl(book, 'sm')} alt="" width={54} height={81} loading="lazy" />
                    <span>
                      <strong>{book.title}</strong>
                      <em>
                        {book.author}, {book.year < 0 ? `${-book.year} BC` : book.year}
                      </em>
                      <small>{tl(book.setting.place)}</small>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="globe-country" key="all">
            <h1 className="globe-title">{tl(TEXT.title)}</h1>
            <p className="globe-lead">
              {tl(TEXT.lead).replace('{books}', String(placed)).replace('{countries}', String(byCountry.size))}
            </p>
            <h2 className="globe-sub">{tl(TEXT.most)}</h2>
            <ul className="globe-places">
              {leading.map(([code, list]) => (
                <li key={code}>
                  <button type="button" onClick={() => choose(code)}>
                    <span>{countryName(code, lang)}</span>
                    <span>{list.length}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
