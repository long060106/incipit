import { useEffect, useRef } from 'react';
import { BOOKS } from '../data/books';
import { OPENINGS } from '../data/openings';
import type { L } from '../data/types';
import { SITE_NAME, useI18n } from '../i18n';
import { portraitUrl, useProfile } from '../lib/profile';
import { installIncipits } from './incipits';
import { PageHeader, useQuickLoader } from './PageHeader';
import './about.css';

/*
  About the site and who made it (/about): first what the site is, then the maker's portrait,
  name and own words on why it exists, then what it is built from. The maker's part is written at the keeper's
  desk (/admin) and is shown as written, in the language it was written in.
*/

const TEXT = {
  eyebrow: { en: 'About', fr: 'À propos' },
  what: {
    en: '{site} is a place to find your next book by how you want to feel. Most book sites ask what you want to read. This one asks for a mood, and the books that fit it step into the light.',
    fr: '{site} est un lieu où trouver son prochain livre d’après ce que l’on veut ressentir. La plupart des sites demandent ce que vous voulez lire. Celui-ci demande une humeur, et les livres qui lui répondent s’avancent dans la lumière.',
  },
  how: {
    en: 'There are {n} books on its wall, to filter by mood, theme, era and language, to find on a globe by where they are set, or to meet by their first page alone. {free} of them are out of copyright and can be read here or downloaded, free and legally. For the others, the site says what the book is like and points to a library or a bookshop.',
    fr: 'Son mur porte {n} livres, à filtrer par humeur, thème, époque et langue, à retrouver sur un globe d’après leur décor, ou à rencontrer par leur seule première page. {free} d’entre eux sont dans le domaine public et se lisent ici ou se téléchargent, gratuitement et légalement. Pour les autres, le site dit à quoi ressemble le livre et indique une bibliothèque ou une librairie.',
  },
  name: {
    en: 'An incipit is the first words of a book.',
    fr: 'Un incipit, ce sont les premiers mots d’un livre.',
  },
  developed: { en: 'Developed by', fr: 'Développé par' },
  why: { en: 'Why I made {site}', fr: 'Pourquoi j’ai fait {site}' },
  about: { en: 'About me', fr: 'À propos de moi' },
  find: { en: 'Find me', fr: 'Me trouver' },
  credits: { en: 'Credits', fr: 'Crédits' },
  made: { en: 'Design, writing and code', fr: 'Conception, textes et code' },
  texts: { en: 'Texts of the books', fr: 'Textes des livres' },
  textsBy: {
    en: 'Project Gutenberg and Standard Ebooks, whose volunteers keep books out of copyright free to read. Audiobooks by LibriVox.',
    fr: 'Project Gutenberg et Standard Ebooks, dont les bénévoles gardent en lecture libre les livres du domaine public. Livres audio de LibriVox.',
  },
  covers: { en: 'Covers and catalogue', fr: 'Couvertures et catalogue' },
  coversBy: { en: 'Open Library, a project of the Internet Archive.', fr: 'Open Library, un projet d’Internet Archive.' },
  hands: { en: 'The two hands', fr: 'Les deux mains' },
  handsBy: {
    en: 'From Michelangelo’s Creation of Adam, on the ceiling of the Sistine Chapel, about 1511.',
    fr: 'D’après La Création d’Adam de Michel-Ange, au plafond de la chapelle Sixtine, vers 1511.',
  },
  type: { en: 'Typefaces', fr: 'Caractères' },
  typeBy: {
    en: 'Cinzel Decorative, Brygada 1918, Monsieur La Doulaise and Hanken Grotesk, all under open licences.',
    fr: 'Cinzel Decorative, Brygada 1918, Monsieur La Doulaise et Hanken Grotesk, tous sous licence libre.',
  },
} satisfies Record<string, L>;

/** The first sentence of each book's opening, for the page's backdrop, with the book it opens. */
function incipits(): string[] {
  const titles = new Map(BOOKS.map((book) => [book.id, book.title]));
  const lines: string[] = [];
  for (const [id, opening] of Object.entries(OPENINGS)) {
    const first = opening.lines[0]?.replace(/\s+/g, ' ').trim();
    if (!first || !titles.has(id)) continue;
    const sentence = first.match(/^.{20,}?[.!?](?=\s|$)/)?.[0] ?? first;
    const cut = sentence.length > 120 ? `${sentence.slice(0, sentence.lastIndexOf(' ', 118))}…` : sentence;
    lines.push(`${cut}  — ${titles.get(id)}`);
  }
  // Shuffled, so that the page does not always open on the same books.
  for (let at = lines.length - 1; at > 0; at--) {
    const other = Math.floor(Math.random() * (at + 1));
    [lines[at], lines[other]] = [lines[other], lines[at]];
  }
  return lines;
}

const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

export default function About() {
  const { t, tl } = useI18n();
  useQuickLoader();
  const [{ profile, portraitAt }] = useProfile();
  const why = paragraphs(profile.why);
  const about = paragraphs(profile.about);
  const fill = (text: string) =>
    text
      .replace('{site}', SITE_NAME)
      .replace('{n}', String(BOOKS.length))
      .replace('{free}', String(BOOKS.filter((book) => book.free).length));
  const pageRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLElement>(null);

  // The first lines of the books, rising behind the page (./incipits.ts).
  useEffect(() => installIncipits(pageRef.current!, bodyRef.current!, incipits()), []);

  // Each part of the page comes up as it is scrolled to.
  useEffect(() => {
    const parts = [...bodyRef.current!.querySelectorAll<HTMLElement>(':scope > section, :scope > .about-foot')];
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.shown = '';
          seen.unobserve(entry.target);
        }
      },
      { root: bodyRef.current, rootMargin: '0px 0px -8% 0px' },
    );
    for (const part of parts) seen.observe(part);
    return () => seen.disconnect();
  }, [why.length, about.length, profile.links.length]);

  const credits: [L, string][] = [
    [TEXT.made, profile.name],
    [TEXT.texts, tl(TEXT.textsBy)],
    [TEXT.covers, tl(TEXT.coversBy)],
    [TEXT.hands, tl(TEXT.handsBy)],
    [TEXT.type, tl(TEXT.typeBy)],
  ];

  return (
    <div className="about has-backdrop" ref={pageRef}>
      <PageHeader here="about" />
      <main className="about-body" ref={bodyRef}>
        <header className="about-site">
          <p className="page-eyebrow">{tl(TEXT.eyebrow)}</p>
          <h1 aria-label={SITE_NAME}>
            {[...SITE_NAME].map((letter, at) => (
              <span key={at} aria-hidden="true" style={{ animationDelay: `${0.15 + at * 0.07}s` }}>
                {letter}
              </span>
            ))}
          </h1>
          <p>{fill(tl(TEXT.what))}</p>
          <p>{fill(tl(TEXT.how))}</p>
          <p>{tl(TEXT.name)}</p>
        </header>

        <section className="about-head">
          {portraitAt > 0 && <img className="about-portrait" src={portraitUrl(portraitAt)} alt={profile.name} width={640} height={640} />}
          <div>
            <p className="page-eyebrow">{tl(TEXT.developed)}</p>
            <p className="about-name">{profile.name}</p>
            {profile.line && <p className="about-line">{profile.line}</p>}
          </div>
        </section>

        {why.length > 0 && (
          <section className="about-words">
            <h2>{tl(TEXT.why).replace('{site}', SITE_NAME)}</h2>
            {why.map((paragraph, at) => (
              <p key={at}>{paragraph}</p>
            ))}
          </section>
        )}

        {about.length > 0 && (
          <section className="about-words">
            <h2>{tl(TEXT.about)}</h2>
            {about.map((paragraph, at) => (
              <p key={at}>{paragraph}</p>
            ))}
          </section>
        )}

        {profile.links.length > 0 && (
          <section className="about-links">
            <h2>{tl(TEXT.find)}</h2>
            <ul>
              {profile.links.map((link) => (
                <li key={link.url}>
                  <a className="text-link" href={link.url} target={link.url.startsWith('mailto:') ? undefined : '_blank'} rel="noopener noreferrer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="about-credits">
          <h2>{tl(TEXT.credits)}</h2>
          <dl>
            {credits.map(([label, value]) => (
              <div key={label.en}>
                <dt>{tl(label)}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="about-foot">{t('developedBy', { name: profile.name })}</p>
      </main>
    </div>
  );
}
