import type { AxisId, GenreId, KeywordId, L, Lang, LanguageId, Mood } from './types';

export const AXES: { id: AxisId; low: L; high: L }[] = [
  { id: 'tone', low: { en: 'Hopeful', fr: 'Lumineux', ru: 'Светло', vi: 'Tươi sáng' }, high: { en: 'Bleak', fr: 'Sombre', ru: 'Мрачно', vi: 'U ám' } },
  { id: 'voice', low: { en: 'Funny', fr: 'Drôle', ru: 'Смешно', vi: 'Hài hước' }, high: { en: 'Serious', fr: 'Grave', ru: 'Серьёзно', vi: 'Nghiêm trang' } },
  { id: 'intensity', low: { en: 'Gentle', fr: 'Doux', ru: 'Мягко', vi: 'Nhẹ nhàng' }, high: { en: 'Intense', fr: 'Intense', ru: 'Напряжённо', vi: 'Dữ dội' } },
  { id: 'pace', low: { en: 'Slow', fr: 'Lent', ru: 'Медленно', vi: 'Chậm' }, high: { en: 'Fast', fr: 'Rapide', ru: 'Быстро', vi: 'Nhanh' } },
  { id: 'strange', low: { en: 'Familiar', fr: 'Familier', ru: 'Привычно', vi: 'Quen thuộc' }, high: { en: 'Strange', fr: 'Étrange', ru: 'Странно', vi: 'Lạ lùng' } },
];

export type MoodPresetId = 'feelgood' | 'edgy' | 'think' | 'emotional' | 'cosy' | 'dark';

/**
 * Moods to start from, each an answer to "A book to…": each sets the two or three sliders
 * that make it, and leaves the rest alone. The reader can move any slider afterwards.
 * "Shake me up" is not a mood but what a book does to its reader, so it sets no slider and
 * shows the books kept for it in `JOLTS` instead.
 */
export const MOOD_PRESETS: { id: MoodPresetId; label: L; mood: Partial<Mood>; jolt?: true }[] = [
  { id: 'feelgood', label: { en: 'lift my spirits', fr: 'me remonter le moral', ru: 'поднять мне настроение', vi: 'vực dậy tinh thần' }, mood: { tone: 12, voice: 25, intensity: 22 } },
  { id: 'edgy', label: { en: 'shake me up', fr: 'me bousculer', ru: 'перевернуть мой взгляд', vi: 'lay chuyển cách tôi nhìn' }, mood: {}, jolt: true },
  { id: 'think', label: { en: 'make me think', fr: 'me faire réfléchir', ru: 'заставить задуматься', vi: 'khiến tôi suy ngẫm' }, mood: { voice: 90, intensity: 40, pace: 22 } },
  { id: 'emotional', label: { en: 'move me', fr: 'm’émouvoir', ru: 'тронуть меня', vi: 'làm tôi xúc động' }, mood: { tone: 62, voice: 80, intensity: 80 } },
  { id: 'cosy', label: { en: 'wrap me up warm', fr: 'me tenir au chaud', ru: 'согреть меня', vi: 'ủ ấm lòng tôi' }, mood: { tone: 15, intensity: 12, pace: 35 } },
  { id: 'dark', label: { en: 'take me somewhere dark', fr: 'm’emmener dans le noir', ru: 'увести во тьму', vi: 'đưa tôi vào bóng tối' }, mood: { tone: 90, voice: 85, intensity: 86 } },
];

export const KEYWORDS: Record<KeywordId, L> = {
  love: { en: 'Love', fr: 'Amour', ru: 'Любовь', vi: 'Tình yêu' },
  obsession: { en: 'Obsession', fr: 'Obsession', ru: 'Одержимость', vi: 'Ám ảnh' },
  revenge: { en: 'Revenge', fr: 'Vengeance', ru: 'Месть', vi: 'Báo thù' },
  family: { en: 'Family', fr: 'Famille', ru: 'Семья', vi: 'Gia đình' },
  comingOfAge: { en: 'Coming of age', fr: 'Apprentissage', ru: 'Взросление', vi: 'Trưởng thành' },
  identity: { en: 'Identity', fr: 'Identité', ru: 'Идентичность', vi: 'Bản sắc' },
  society: { en: 'Class and society', fr: 'Classes et société', ru: 'Классы и общество', vi: 'Giai cấp và xã hội' },
  war: { en: 'War', fr: 'Guerre', ru: 'Война', vi: 'Chiến tranh' },
  memory: { en: 'Grief and memory', fr: 'Deuil et mémoire', ru: 'Горе и память', vi: 'Mất mát và ký ức' },
  solitude: { en: 'Solitude', fr: 'Solitude', ru: 'Одиночество', vi: 'Cô đơn' },
  friendship: { en: 'Friendship', fr: 'Amitié', ru: 'Дружба', vi: 'Tình bạn' },
  freedom: { en: 'Freedom', fr: 'Liberté', ru: 'Свобода', vi: 'Tự do' },
  power: { en: 'Power', fr: 'Pouvoir', ru: 'Власть', vi: 'Quyền lực' },
  justice: { en: 'Guilt and justice', fr: 'Faute et justice', ru: 'Вина и справедливость', vi: 'Tội lỗi và công lý' },
  nature: { en: 'Nature', fr: 'Nature', ru: 'Природа', vi: 'Thiên nhiên' },
  science: { en: 'Science', fr: 'Science', ru: 'Наука', vi: 'Khoa học' },
  supernatural: { en: 'The supernatural', fr: 'Surnaturel', ru: 'Сверхъестественное', vi: 'Siêu nhiên' },
  mystery: { en: 'Mystery', fr: 'Mystère', ru: 'Тайна', vi: 'Bí ẩn' },
  adventure: { en: 'Adventure', fr: 'Aventure', ru: 'Приключения', vi: 'Phiêu lưu' },
  madness: { en: 'Madness', fr: 'Folie', ru: 'Безумие', vi: 'Điên loạn' },
  art: { en: 'Art and beauty', fr: 'Art et beauté', ru: 'Искусство и красота', vi: 'Nghệ thuật và cái đẹp' },
  knowledge: { en: 'Books and learning', fr: 'Livres et savoir', ru: 'Книги и знание', vi: 'Sách và tri thức' },
  survival: { en: 'Survival', fr: 'Survie', ru: 'Выживание', vi: 'Sinh tồn' },
  faith: { en: 'Faith', fr: 'Foi', ru: 'Вера', vi: 'Đức tin' },
  money: { en: 'Money', fr: 'Argent', ru: 'Деньги', vi: 'Tiền bạc' },
  research: { en: 'Research and discovery', fr: 'Recherche et découverte', ru: 'Поиск и открытия', vi: 'Tìm tòi và khám phá' },
};

export const GENRES: Record<GenreId, L> = {
  literary: { en: 'Literary fiction', fr: 'Littérature générale', ru: 'Художественная проза', vi: 'Văn chương' },
  gothic: { en: 'Gothic and horror', fr: 'Gothique et horreur', ru: 'Готика и ужасы', vi: 'Gothic và kinh dị' },
  romance: { en: 'Romance', fr: 'Romance', ru: 'Любовный роман', vi: 'Lãng mạn' },
  adventure: { en: 'Adventure', fr: 'Aventure', ru: 'Приключения', vi: 'Phiêu lưu' },
  scifi: { en: 'Science fiction', fr: 'Science-fiction', ru: 'Научная фантастика', vi: 'Khoa học viễn tưởng' },
  fantasy: { en: 'Fantasy and the fantastic', fr: 'Fantasy et fantastique', ru: 'Фэнтези и фантастическое', vi: 'Kỳ ảo và huyền ảo' },
  mystery: { en: 'Mystery', fr: 'Policier et mystère', ru: 'Тайна', vi: 'Bí ẩn' },
  humour: { en: 'Humour', fr: 'Humour', ru: 'Юмор', vi: 'Hài hước' },
  historical: { en: 'Historical fiction', fr: 'Roman historique', ru: 'Исторический роман', vi: 'Tiểu thuyết lịch sử' },
  philosophy: { en: 'Philosophy', fr: 'Philosophie', ru: 'Философия', vi: 'Triết học' },
  memoir: { en: 'Memoir', fr: 'Mémoires', ru: 'Мемуары', vi: 'Hồi ký' },
  history: { en: 'History and ideas', fr: 'Histoire et idées', ru: 'История и идеи', vi: 'Lịch sử và tư tưởng' },
  science: { en: 'Science', fr: 'Sciences', ru: 'Наука', vi: 'Khoa học' },
  economics: { en: 'Economics and money', fr: 'Économie et argent', ru: 'Экономика и деньги', vi: 'Kinh tế và tiền bạc' },
  investing: { en: 'Investing and markets', fr: 'Bourse et placements', ru: 'Инвестиции и рынки', vi: 'Đầu tư và thị trường' },
  psychology: { en: 'Psychology', fr: 'Psychologie', ru: 'Психология', vi: 'Tâm lý học' },
};

export const LANGUAGES: Record<LanguageId, L> = {
  en: { en: 'English', fr: 'anglais', ru: 'английский', vi: 'tiếng Anh' },
  fr: { en: 'French', fr: 'français', ru: 'французский', vi: 'tiếng Pháp' },
  ru: { en: 'Russian', fr: 'russe', ru: 'русский', vi: 'tiếng Nga' },
  de: { en: 'German', fr: 'allemand', ru: 'немецкий', vi: 'tiếng Đức' },
  grc: { en: 'Ancient Greek', fr: 'grec ancien', ru: 'древнегреческий', vi: 'tiếng Hy Lạp cổ' },
  es: { en: 'Spanish', fr: 'espagnol', ru: 'испанский', vi: 'tiếng Tây Ban Nha' },
  ja: { en: 'Japanese', fr: 'japonais', ru: 'японский', vi: 'tiếng Nhật' },
  it: { en: 'Italian', fr: 'italien', ru: 'итальянский', vi: 'tiếng Ý' },
  he: { en: 'Hebrew', fr: 'hébreu', ru: 'иврит', vi: 'tiếng Hebrew' },
  vi: { en: 'Vietnamese', fr: 'vietnamien', ru: 'вьетнамский', vi: 'tiếng Việt' },
  zh: { en: 'Chinese', fr: 'chinois', ru: 'китайский', vi: 'tiếng Trung' },
  pt: { en: 'Portuguese', fr: 'portugais', ru: 'португальский', vi: 'tiếng Bồ Đào Nha' },
  ko: { en: 'Korean', fr: 'coréen', ru: 'корейский', vi: 'tiếng Hàn' },
  no: { en: 'Norwegian', fr: 'norvégien', ru: 'норвежский', vi: 'tiếng Na Uy' },
  sv: { en: 'Swedish', fr: 'suédois', ru: 'шведский', vi: 'tiếng Thụy Điển' },
  nl: { en: 'Dutch', fr: 'néerlandais', ru: 'нидерландский', vi: 'tiếng Hà Lan' },
  cs: { en: 'Czech', fr: 'tchèque', ru: 'чешский', vi: 'tiếng Séc' },
  tr: { en: 'Turkish', fr: 'turc', ru: 'турецкий', vi: 'tiếng Thổ Nhĩ Kỳ' },
  ar: { en: 'Arabic', fr: 'arabe', ru: 'арабский', vi: 'tiếng Ả Rập' },
  bn: { en: 'Bengali', fr: 'bengali', ru: 'бенгальский', vi: 'tiếng Bengal' },
  id: { en: 'Indonesian', fr: 'indonésien', ru: 'индонезийский', vi: 'tiếng Indonesia' },
  ang: { en: 'Old English', fr: 'vieil anglais', ru: 'древнеанглийский', vi: 'tiếng Anh cổ' },
  pl: { en: 'Polish', fr: 'polonais', ru: 'польский', vi: 'tiếng Ba Lan' },
  fa: { en: 'Persian', fr: 'persan', ru: 'персидский', vi: 'tiếng Ba Tư' },
  sa: { en: 'Sanskrit', fr: 'sanskrit', ru: 'санскрит', vi: 'tiếng Phạn' },
  da: { en: 'Danish', fr: 'danois', ru: 'датский', vi: 'tiếng Đan Mạch' },
  la: { en: 'Latin', fr: 'latin', ru: 'латынь', vi: 'tiếng Latinh' },
};

/** Stands for books set nowhere on the map, among the ISO country codes of the settings. */
export const ELSEWHERE = 'XX';

const ELSEWHERE_NAME: L = { en: 'Somewhere else entirely', fr: 'Tout à fait ailleurs', ru: 'Где-то совсем в другом месте', vi: 'Một nơi hoàn toàn khác' };
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
  1: { en: 'Very easy', fr: 'Très facile', ru: 'Очень легко', vi: 'Rất dễ' },
  2: { en: 'Easy', fr: 'Facile', ru: 'Легко', vi: 'Dễ' },
  3: { en: 'Moderate', fr: 'Moyen', ru: 'Средне', vi: 'Vừa phải' },
  4: { en: 'Demanding', fr: 'Exigeant', ru: 'Требует усилий', vi: 'Cần chú tâm' },
  5: { en: 'Very demanding', fr: 'Très exigeant', ru: 'Требует больших усилий', vi: 'Rất cần chú tâm' },
};
