import { BOOKS } from '../data/books';
import type { L } from '../data/types';
import { SITE_NAME, useI18n } from '../i18n';
import { portraitUrl, useProfile } from '../lib/profile';
import { PageHeader, useQuickLoader } from './PageHeader';
import './about.css';

/*
  About the site and who made it (/about): the maker's portrait, name and own words on why
  the site exists, then what it is built from. The maker's part is written at the keeper's
  desk (/admin) and is shown as written, in the language it was written in.
*/

const TEXT = {
  eyebrow: { en: 'About', fr: 'À propos' },
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
  count: { en: '{n} books on the wall, {free} of them free to read here.', fr: '{n} livres au mur, dont {free} en lecture libre ici.' },
} satisfies Record<string, L>;

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
  const credits: [L, string][] = [
    [TEXT.made, profile.name],
    [TEXT.texts, tl(TEXT.textsBy)],
    [TEXT.covers, tl(TEXT.coversBy)],
    [TEXT.hands, tl(TEXT.handsBy)],
    [TEXT.type, tl(TEXT.typeBy)],
  ];

  return (
    <div className="about">
      <PageHeader here="about" />
      <main className="about-body">
        <header className="about-head">
          {portraitAt > 0 && <img className="about-portrait" src={portraitUrl(portraitAt)} alt={profile.name} width={640} height={640} />}
          <div>
            <p className="page-eyebrow">{tl(TEXT.eyebrow)}</p>
            <h1>{profile.name}</h1>
            {profile.line && <p className="about-line">{profile.line}</p>}
          </div>
        </header>

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
          <p className="about-count">
            {tl(TEXT.count)
              .replace('{n}', String(BOOKS.length))
              .replace('{free}', String(BOOKS.filter((book) => book.free).length))}
          </p>
        </section>

        <p className="about-foot">{t('developedBy', { name: profile.name })}</p>
      </main>
    </div>
  );
}
