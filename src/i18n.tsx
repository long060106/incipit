import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { L, Lang } from './data/types';

export const SITE_NAME = 'Incipit';

const STRINGS = {
  // Header
  index: { en: 'Index', fr: 'Index' },
  menu: { en: 'Menu', fr: 'Menu' },
  navFirst: { en: 'First pages', fr: 'Premières pages' },
  navGlobe: { en: 'Globe', fr: 'Globe' },
  navNotebook: { en: 'Notebook', fr: 'Carnet' },
  navEssays: { en: 'Essays', fr: 'Essais' },
  navAbout: { en: 'About', fr: 'À propos' },
  navSignIn: { en: 'Sign in', fr: 'Connexion' },
  privacyLink: { en: 'Privacy', fr: 'Confidentialité' },
  developedBy: { en: 'Developed by {name}', fr: 'Développé par {name}' },
  signInAdmin: { en: 'Sign in as admin', fr: 'Connexion administrateur' },
  readHere: { en: 'Read it here', fr: 'Lire ici' },
  readOn: { en: 'Continue reading', fr: 'Reprendre la lecture' },
  downloadShort: { en: 'Download', fr: 'Télécharger' },
  around: { en: 'Around the book', fr: 'Autour du livre' },
  aroundNote: { en: 'Each line opens its Wikipedia article in a new tab: the book, its author, and the time and place it is set in.', fr: 'Chaque ligne ouvre son article Wikipédia dans un nouvel onglet : le livre, son auteur, l’époque et le lieu du récit.' },
  wikiBook: { en: 'The book', fr: 'Le livre' },
  wikiAuthor: { en: 'The author', fr: 'L’auteur' },
  wikiSetting: { en: 'The setting', fr: 'Le cadre' },
  article: { en: 'Article', fr: 'Article' },
  switchToDay: { en: 'Switch to day mode', fr: 'Passer en mode jour' },
  switchToNight: { en: 'Switch to night mode', fr: 'Passer en mode nuit' },
  language: { en: 'Language', fr: 'Langue' },
  backToIntro: { en: 'Back to the introduction', fr: "Retour à l'introduction" },
  firstPage: { en: 'Home', fr: 'Accueil' },

  // Intro
  defWord: { en: 'incipit', fr: 'incipit' },
  defClass: { en: 'noun', fr: 'nom masculin' },
  defMeaning: { en: 'The first words of a book.', fr: "Les premiers mots d'un livre." },
  browse: { en: 'Browse the books', fr: 'Voir les livres' },
  scrollHint: { en: 'or scroll', fr: 'ou faites défiler' },
  line1: { en: 'Most book sites ask what you want to read.', fr: 'La plupart des sites vous demandent ce que vous voulez lire.' },
  line2: { en: 'This one asks how you want to feel.', fr: 'Celui-ci vous demande ce que vous voulez ressentir.' },
  line3: {
    en: 'Set the mood, and the books that fit step into the light.',
    fr: 'Réglez l’ambiance, et les livres qui vous vont entrent dans la lumière.',
  },
  line3sub: {
    en: 'The classics are free to download. The rest you can borrow.',
    fr: 'Les classiques se téléchargent gratuitement. Le reste s’emprunte.',
  },

  // Panel
  panelTitle: { en: 'Find a book', fr: 'Trouver un livre' },
  searchLabel: { en: 'Search by title or author', fr: 'Chercher par titre ou auteur' },
  searchPlaceholder: { en: 'Title or author', fr: 'Titre ou auteur' },
  mood: { en: 'Mood', fr: 'Ambiance' },
  moodHint: { en: 'Start from one, or move only the sliders you care about.', fr: 'Partez de l’une d’elles, ou ne réglez que ce qui compte.' },
  quickMoods: { en: 'Moods to start from', fr: 'Ambiances pour commencer' },
  clear: { en: 'Clear', fr: 'Effacer' },
  anywhere: { en: 'Any', fr: 'Indifférent' },
  themes: { en: 'Themes', fr: 'Thèmes' },
  moreThemes: { en: 'More themes', fr: 'Plus de thèmes' },
  fewerThemes: { en: 'Fewer themes', fr: 'Moins de thèmes' },
  moreFilters: { en: 'More filters', fr: 'Plus de filtres' },
  genre: { en: 'Genre', fr: 'Genre' },
  anyGenre: { en: 'Any genre', fr: 'Tous les genres' },
  length: { en: 'Length', fr: 'Longueur' },
  short: { en: 'Under 200 pages', fr: 'Moins de 200 pages' },
  medium: { en: '200 to 400', fr: '200 à 400' },
  long: { en: 'Over 400', fr: 'Plus de 400' },
  era: { en: 'Published', fr: 'Parution' },
  pre1900: { en: 'Before 1900', fr: 'Avant 1900' },
  c20: { en: '1900 to 1999', fr: '1900 à 1999' },
  c21: { en: '2000 on', fr: 'Depuis 2000' },
  readingLevel: { en: 'Reading level', fr: 'Niveau de lecture' },
  easy: { en: 'Easy', fr: 'Facile' },
  moderate: { en: 'Moderate', fr: 'Moyen' },
  demanding: { en: 'Demanding', fr: 'Exigeant' },
  rating: { en: 'Rating', fr: 'Note' },
  ratingAtLeast: { en: '{n} or higher', fr: '{n} ou plus' },
  setting: { en: 'Set in', fr: 'Se passe en' },
  sortBy: { en: 'Show first', fr: 'Afficher d’abord' },
  sortRating: { en: 'Highest rated', fr: 'Les mieux notés' },
  sortPopular: { en: 'Most read', fr: 'Les plus lus' },
  countryPlaceholder: { en: 'Anywhere. Type a country', fr: 'N’importe où. Tapez un pays' },
  clearCountry: { en: 'Clear the country', fr: 'Effacer le pays' },
  noCountry: { en: 'No book is set there yet.', fr: 'Aucun livre ne s’y passe pour l’instant.' },
  freeOnly: { en: 'Free to download only', fr: 'Téléchargement gratuit uniquement' },
  reset: { en: 'Clear all', fr: 'Tout effacer' },
  showBooks: { en: 'Show the books', fr: 'Voir les livres' },
  openFilters: { en: 'Mood and filters', fr: 'Ambiance et filtres' },

  // Results
  countAll: { en: '{n} books', fr: '{n} livres' },
  countFit: { en: '{n} fit', fr: '{n} correspondent' },
  countFitOne: { en: '1 fits', fr: '1 correspond' },
  countNone: { en: 'None fit', fr: 'Aucun' },
  closest: { en: 'Nothing matches exactly. Closest {n}:', fr: 'Aucun ne correspond exactement. Les {n} plus proches :' },
  noneTitle: { en: 'No book fits all of that.', fr: 'Aucun livre ne réunit tout cela.' },
  noneBody: { en: 'Loosen a filter, or clear them and start again.', fr: 'Relâchez un filtre, ou effacez tout et recommencez.' },
  wallGuide: { en: 'Drag or scroll in any direction', fr: 'Faites glisser ou défiler dans tous les sens' },
  wallGuideNote: { en: 'Up, down, left, right: the wall has no edge.', fr: 'Haut, bas, gauche, droite : le mur n’a pas de bord.' },
  dragHint: { en: 'Drag or scroll to wander', fr: 'Faites glisser ou défiler pour flâner' },
  trayMove: { en: 'Drag to move. Double-click to put it back.', fr: 'Glissez pour déplacer. Double-cliquez pour le remettre en place.' },
  trayGrow: { en: 'Larger, with titles', fr: 'Plus grand, avec les titres' },
  trayShrink: { en: 'Back to one row', fr: 'Revenir à une rangée' },
  trayHide: { en: 'Hide the books', fr: 'Masquer les livres' },
  trayShow: { en: 'Show the books', fr: 'Afficher les livres' },
  zoomOut: { en: 'Stand back: see more covers', fr: 'Prendre du recul : voir plus de couvertures' },
  zoomIn: { en: 'Step closer', fr: 'Se rapprocher' },
  lampOn: { en: 'Light the lamp', fr: 'Allumer la lampe' },
  lampOff: { en: 'Put the lamp out', fr: 'Éteindre la lampe' },

  // Book sheet
  close: { en: 'Close', fr: 'Fermer' },
  by: { en: 'by {author}', fr: 'de {author}' },
  readIf: { en: 'Read it if', fr: 'Lisez-le si' },
  skipIf: { en: 'Skip it if', fr: 'Passez votre chemin si' },
  publicDomain: {
    en: 'In the public domain, so it is free to keep.',
    fr: 'Dans le domaine public : vous pouvez le garder gratuitement.',
  },
  inCopyright: {
    en: 'Still in copyright, so there is no free download. A library loan costs nothing.',
    fr: 'Encore sous droits : pas de téléchargement gratuit. Un prêt en bibliothèque ne coûte rien.',
  },
  downloadBook: { en: 'Download the book', fr: 'Télécharger le livre' },
  downloadNote: {
    en: 'PDF, {size}. Out of copyright, so it is yours to keep.',
    fr: 'PDF, {size}. Libre de droits : il est à vous.',
  },
  megabytes: { en: 'MB', fr: 'Mo' },
  kilobytes: { en: 'kB', fr: 'ko' },
  pdfHelp: {
    en: 'The PDF opens on any computer, phone or tablet. For an e-reader, take the e-reader files instead.',
    fr: 'Le PDF s’ouvre sur tout ordinateur, téléphone ou tablette. Pour une liseuse, prenez plutôt les fichiers pour liseuse.',
  },
  ereaderFiles: { en: 'Files for e-readers, EPUB and Kindle', fr: 'Fichiers pour liseuse, EPUB et Kindle' },
  audiobook: { en: 'Free audiobook (LibriVox)', fr: 'Livre audio gratuit (LibriVox)' },
  borrowOnline: { en: 'Borrow it online', fr: 'L’emprunter en ligne' },
  borrowNote: {
    en: 'The Internet Archive lends this copy free, with an account.',
    fr: 'Internet Archive prête cet exemplaire gratuitement, avec un compte.',
  },
  findLibraryShort: { en: 'Find it in a library', fr: 'Le trouver en bibliothèque' },
  libraryNote: {
    en: 'Still in copyright, so no free download exists. A library loan costs nothing.',
    fr: 'Encore sous droits : aucun téléchargement gratuit n’existe. Un prêt en bibliothèque ne coûte rien.',
  },
  translationNote: {
    en: 'The English translation is still in copyright. The original text is free to read.',
    fr: 'La traduction anglaise est encore sous droits. Le texte original est en accès libre.',
  },
  libby: {
    en: 'Borrow the ebook or audiobook through your library (Libby)',
    fr: 'Emprunter l’ebook ou le livre audio via votre bibliothèque (Libby)',
  },
  yearBC: { en: 'c. {year} BC', fr: 'v. {year} av. J.-C.' },
  fromGutenberg: { en: 'Project Gutenberg', fr: 'Projet Gutenberg' },
  readOnline: { en: 'Read online', fr: 'Lire en ligne' },
  findLibrary: { en: 'Find it in a library near you', fr: 'Le trouver dans une bibliothèque près de chez vous' },
  buyCopy: { en: 'Buy a copy', fr: 'Acheter un exemplaire' },
  details: { en: 'Details', fr: 'Fiche' },
  aroundShort: { en: 'c. {year}', fr: 'v. {year}' },
  pagesLabel: { en: 'pages', fr: 'pages' },
  publishedLabel: { en: 'first published', fr: 'première parution' },
  levelIs: { en: 'Reading level: {level}', fr: 'Niveau de lecture : {level}' },
  writtenIn: { en: 'Written in', fr: 'Écrit en' },
  ratingCount: { en: '{n} ratings on Open Library', fr: '{n} notes sur Open Library' },
  ratingCountBoth: { en: '{n} ratings on Open Library and here', fr: '{n} notes sur Open Library et ici' },
  moodByReaders: { en: 'Moved by how it felt to {n} readers here.', fr: 'Ajustée selon le ressenti de {n} lecteurs ici.' },
  moodByOne: { en: 'Moved by how it felt to one reader here.', fr: 'Ajustée selon le ressenti d’un lecteur ici.' },
  tooFewRatings: { en: 'Too few ratings on Open Library', fr: 'Trop peu de notes sur Open Library' },
  moodOfBook: { en: 'Mood', fr: 'Ambiance' },
  useThisMood: { en: 'Find books with this mood', fr: 'Trouver des livres dans cette ambiance' },
  beforeYouRead: { en: 'Before you read', fr: 'Avant de lire' },
  pace: { en: 'Pace', fr: 'Rythme' },
  headsUp: { en: 'Heads-up', fr: 'À savoir' },
  reviews: { en: 'Reviews', fr: 'Critiques' },
  otherWays: { en: 'Other ways to get it', fr: 'Autres façons de l’obtenir' },
  reviewsOn: { en: 'Reader reviews on {site}', fr: 'Avis de lecteurs sur {site}' },
  similar: { en: 'Similar in mood', fr: 'Dans la même ambiance' },
  opensNewTab: { en: 'opens in a new tab', fr: 'ouvre un nouvel onglet' },

  // Index
  indexTitle: { en: 'Index', fr: 'Index' },
  indexIntro: { en: 'Every book on the wall, in alphabetical order.', fr: 'Tous les livres du mur, par ordre alphabétique.' },
  aboutTitle: { en: 'About', fr: 'À propos' },
  aboutBody: {
    en: 'Incipit helps you choose a book by mood, then get it legally. Books that are out of copyright can be downloaded here as PDFs, made from the Standard Ebooks and Project Gutenberg editions and kept on this site. Their audiobooks are LibriVox recordings. Books still in copyright are never offered for download: they link to lenders, libraries and bookshops. Covers and ratings come from Open Library. Mood scores and reading advice are editorial.',
    fr: 'Incipit vous aide à choisir un livre selon votre humeur, puis à l’obtenir légalement. Les livres libres de droits se téléchargent ici en PDF, réalisés à partir des éditions de Standard Ebooks et du Projet Gutenberg et conservés sur ce site. Leurs livres audio sont des enregistrements LibriVox. Les livres encore sous droits ne sont jamais proposés en téléchargement : ils renvoient vers des prêteurs, des bibliothèques et des librairies. Les couvertures et les notes viennent d’Open Library. Les ambiances et les conseils de lecture sont rédigés par nos soins.',
  },
} satisfies Record<string, L>;

export type StringKey = keyof typeof STRINGS;

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Interface string, with `{name}` placeholders filled from `vars`. */
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  /** Picks the current language out of a localized value. */
  tl: (value: L) => string;
}

const I18nContext = createContext<I18n | null>(null);

function initialLang(): Lang {
  return document.documentElement.lang === 'fr' ? 'fr' : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem('incipit:lang', next);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for this visit only.
    }
  }, []);

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => {
        let text: string = STRINGS[key][lang];
        if (vars) {
          for (const [name, replacement] of Object.entries(vars)) {
            text = text.replace(`{${name}}`, String(replacement));
          }
        }
        return text;
      },
      tl: (localized) => localized[lang],
    }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
