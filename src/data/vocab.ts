import type { AxisId, GenreId, KeywordId, L, Lang, LanguageId, Mood } from './types';

export const AXES: { id: AxisId; low: L; high: L }[] = [
  { id: 'tone', low: { en: 'Hopeful', fr: 'Lumineux' }, high: { en: 'Bleak', fr: 'Sombre' } },
  { id: 'voice', low: { en: 'Funny', fr: 'Drôle' }, high: { en: 'Serious', fr: 'Grave' } },
  { id: 'intensity', low: { en: 'Gentle', fr: 'Doux' }, high: { en: 'Intense', fr: 'Intense' } },
  { id: 'pace', low: { en: 'Slow', fr: 'Lent' }, high: { en: 'Fast', fr: 'Rapide' } },
  { id: 'strange', low: { en: 'Familiar', fr: 'Familier' }, high: { en: 'Strange', fr: 'Étrange' } },
];

export type MoodPresetId = 'feelgood' | 'edgy' | 'think' | 'emotional' | 'cosy' | 'dark';

/**
 * Moods to start from: each sets the two or three sliders that make it, and leaves the
 * rest alone. The reader can move any slider afterwards.
 */
export const MOOD_PRESETS: { id: MoodPresetId; label: L; mood: Partial<Mood> }[] = [
  { id: 'feelgood', label: { en: 'Feelgood', fr: 'Réconfortant' }, mood: { tone: 12, voice: 25, intensity: 22 } },
  { id: 'edgy', label: { en: 'Edgy', fr: 'Qui bouscule' }, mood: { intensity: 82, pace: 66, strange: 70 } },
  { id: 'think', label: { en: 'Make me think', fr: 'À méditer' }, mood: { voice: 90, intensity: 40, pace: 22 } },
  { id: 'emotional', label: { en: 'Emotional', fr: 'Émouvant' }, mood: { tone: 62, voice: 80, intensity: 80 } },
  { id: 'cosy', label: { en: 'Cosy escape', fr: 'Évasion douce' }, mood: { tone: 15, intensity: 12, pace: 35 } },
  { id: 'dark', label: { en: 'Dark and gritty', fr: 'Noir et âpre' }, mood: { tone: 90, voice: 85, intensity: 86 } },
];

export const KEYWORDS: Record<KeywordId, L> = {
  love: { en: 'Love', fr: 'Amour' },
  obsession: { en: 'Obsession', fr: 'Obsession' },
  revenge: { en: 'Revenge', fr: 'Vengeance' },
  family: { en: 'Family', fr: 'Famille' },
  comingOfAge: { en: 'Coming of age', fr: 'Apprentissage' },
  identity: { en: 'Identity', fr: 'Identité' },
  society: { en: 'Class and society', fr: 'Classes et société' },
  war: { en: 'War', fr: 'Guerre' },
  memory: { en: 'Grief and memory', fr: 'Deuil et mémoire' },
  solitude: { en: 'Solitude', fr: 'Solitude' },
  friendship: { en: 'Friendship', fr: 'Amitié' },
  freedom: { en: 'Freedom', fr: 'Liberté' },
  power: { en: 'Power', fr: 'Pouvoir' },
  justice: { en: 'Guilt and justice', fr: 'Faute et justice' },
  nature: { en: 'Nature', fr: 'Nature' },
  science: { en: 'Science', fr: 'Science' },
  supernatural: { en: 'The supernatural', fr: 'Surnaturel' },
  mystery: { en: 'Mystery', fr: 'Mystère' },
  adventure: { en: 'Adventure', fr: 'Aventure' },
  madness: { en: 'Madness', fr: 'Folie' },
  art: { en: 'Art and beauty', fr: 'Art et beauté' },
  knowledge: { en: 'Books and learning', fr: 'Livres et savoir' },
  survival: { en: 'Survival', fr: 'Survie' },
  faith: { en: 'Faith', fr: 'Foi' },
  money: { en: 'Money', fr: 'Argent' },
  research: { en: 'Research and discovery', fr: 'Recherche et découverte' },
};

export const GENRES: Record<GenreId, L> = {
  literary: { en: 'Literary fiction', fr: 'Littérature générale' },
  gothic: { en: 'Gothic and horror', fr: 'Gothique et horreur' },
  romance: { en: 'Romance', fr: 'Romance' },
  adventure: { en: 'Adventure', fr: 'Aventure' },
  scifi: { en: 'Science fiction', fr: 'Science-fiction' },
  fantasy: { en: 'Fantasy and the fantastic', fr: 'Fantasy et fantastique' },
  mystery: { en: 'Mystery', fr: 'Policier et mystère' },
  humour: { en: 'Humour', fr: 'Humour' },
  historical: { en: 'Historical fiction', fr: 'Roman historique' },
  philosophy: { en: 'Philosophy', fr: 'Philosophie' },
  memoir: { en: 'Memoir', fr: 'Mémoires' },
  history: { en: 'History and ideas', fr: 'Histoire et idées' },
  science: { en: 'Science', fr: 'Sciences' },
  economics: { en: 'Economics and money', fr: 'Économie et argent' },
  investing: { en: 'Investing and markets', fr: 'Bourse et placements' },
  psychology: { en: 'Psychology', fr: 'Psychologie' },
};

export const LANGUAGES: Record<LanguageId, L> = {
  en: { en: 'English', fr: 'anglais' },
  fr: { en: 'French', fr: 'français' },
  ru: { en: 'Russian', fr: 'russe' },
  de: { en: 'German', fr: 'allemand' },
  grc: { en: 'Ancient Greek', fr: 'grec ancien' },
  es: { en: 'Spanish', fr: 'espagnol' },
  ja: { en: 'Japanese', fr: 'japonais' },
  it: { en: 'Italian', fr: 'italien' },
  he: { en: 'Hebrew', fr: 'hébreu' },
  vi: { en: 'Vietnamese', fr: 'vietnamien' },
  zh: { en: 'Chinese', fr: 'chinois' },
  pt: { en: 'Portuguese', fr: 'portugais' },
  ko: { en: 'Korean', fr: 'coréen' },
  no: { en: 'Norwegian', fr: 'norvégien' },
  sv: { en: 'Swedish', fr: 'suédois' },
  nl: { en: 'Dutch', fr: 'néerlandais' },
  cs: { en: 'Czech', fr: 'tchèque' },
  tr: { en: 'Turkish', fr: 'turc' },
  ar: { en: 'Arabic', fr: 'arabe' },
  bn: { en: 'Bengali', fr: 'bengali' },
  id: { en: 'Indonesian', fr: 'indonésien' },
  ang: { en: 'Old English', fr: 'vieil anglais' },
  pl: { en: 'Polish', fr: 'polonais' },
  fa: { en: 'Persian', fr: 'persan' },
  sa: { en: 'Sanskrit', fr: 'sanskrit' },
  da: { en: 'Danish', fr: 'danois' },
  la: { en: 'Latin', fr: 'latin' },
};

/** Stands for books set nowhere on the map, among the ISO country codes of the settings. */
export const ELSEWHERE = 'XX';

const ELSEWHERE_NAME: L = { en: 'Somewhere else entirely', fr: 'Tout à fait ailleurs' };
const regionNames: Partial<Record<Lang, Intl.DisplayNames>> = {};

/** A country's name in the interface language, from the browser's own list. */
export function countryName(code: string, lang: Lang): string {
  if (code === ELSEWHERE) return ELSEWHERE_NAME[lang];
  try {
    regionNames[lang] ??= new Intl.DisplayNames([lang], { type: 'region' });
    return regionNames[lang].of(code) ?? code;
  } catch {
    return code;
  }
}

export const DIFFICULTY: Record<1 | 2 | 3 | 4 | 5, L> = {
  1: { en: 'Very easy', fr: 'Très facile' },
  2: { en: 'Easy', fr: 'Facile' },
  3: { en: 'Moderate', fr: 'Moyen' },
  4: { en: 'Demanding', fr: 'Exigeant' },
  5: { en: 'Very demanding', fr: 'Très exigeant' },
};
