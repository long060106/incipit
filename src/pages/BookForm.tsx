import { useState } from 'react';
import { BOOKS } from '../data/books';
import type { AxisId, Book, BookL, GenreId, KeywordId, L, LanguageId, Mood } from '../data/types';
import { AXES, GENRES, KEYWORDS, LANGUAGES } from '../data/vocab';
import { useI18n } from '../i18n';
import { shelve, unshelve } from '../lib/added';
import { withCard } from '../lib/keeper';

/*
  The form the keeper fills to add a book of their own to the site, or to write one of
  theirs again (/admin). The book is kept by the server (PUT /api/added/<id>) with a cover
  (PUT /api/covers/<id>): the picture chosen, cut to the shape of the others, or a plain
  one made here from the title when none is chosen.
*/

const TEXT = {
  add: { en: 'Add a book', fr: 'Ajouter un livre', ru: 'Добавить книгу', vi: 'Thêm sách' },
  edit: { en: 'Edit this book', fr: 'Modifier ce livre', ru: 'Изменить эту книгу', vi: 'Sửa cuốn sách này' },
  title: { en: 'Title', fr: 'Titre', ru: 'Название', vi: 'Tên sách' },
  original: { en: 'Title in the original language (if translated)', fr: 'Titre original (si traduit)', ru: 'Название на языке оригинала (если это перевод)', vi: 'Tên theo ngôn ngữ gốc (nếu là sách dịch)' },
  author: { en: 'Author', fr: 'Auteur', ru: 'Автор', vi: 'Tác giả' },
  year: { en: 'Year', fr: 'Année', ru: 'Год', vi: 'Năm' },
  pages: { en: 'Pages', fr: 'Pages', ru: 'Страниц', vi: 'Số trang' },
  language: { en: 'Written in', fr: 'Langue d’origine', ru: 'Язык оригинала', vi: 'Ngôn ngữ gốc' },
  difficulty: { en: 'Level (1 easy, 5 demanding)', fr: 'Niveau (1 facile, 5 exigeant)', ru: 'Сложность (1 — легко, 5 — требует усилий)', vi: 'Độ khó (1 dễ, 5 cần chú tâm)' },
  genres: { en: 'Genres (one to four)', fr: 'Genres (un à quatre)', ru: 'Жанры (от одного до четырёх)', vi: 'Thể loại (một đến bốn)' },
  keywords: { en: 'Themes (up to eight)', fr: 'Thèmes (huit au plus)', ru: 'Темы (до восьми)', vi: 'Chủ đề (tối đa tám)' },
  place: { en: 'Where it is set', fr: 'Lieu de l’histoire', ru: 'Место действия', vi: 'Bối cảnh' },
  countries: { en: 'Countries, as two-letter codes (GB, FR) for the globe', fr: 'Pays, en codes à deux lettres (GB, FR) pour le globe', ru: 'Страны, двухбуквенными кодами (GB, FR), для глобуса', vi: 'Các nước, theo mã hai chữ cái (GB, FR), cho quả địa cầu' },
  mood: { en: 'Mood', fr: 'Ambiance', ru: 'Настроение', vi: 'Tâm trạng' },
  descriptionEn: { en: 'Description (English)', fr: 'Description (anglais)', ru: 'Описание (английский)', vi: 'Mô tả (tiếng Anh)' },
  descriptionFr: { en: 'Description (French, optional)', fr: 'Description (français, facultatif)', ru: 'Описание (французский, необязательно)', vi: 'Mô tả (tiếng Pháp, không bắt buộc)' },
  pace: { en: 'Pace (optional)', fr: 'Rythme (facultatif)', ru: 'Темп (необязательно)', vi: 'Nhịp truyện (không bắt buộc)' },
  headsUp: { en: 'Heads-up (optional)', fr: 'À savoir (facultatif)', ru: 'Имейте в виду (необязательно)', vi: 'Lưu ý (không bắt buộc)' },
  readIf: { en: 'Read it if… (optional)', fr: 'À lire si… (facultatif)', ru: 'Читайте, если… (необязательно)', vi: 'Hãy đọc nếu… (không bắt buộc)' },
  skipIf: { en: 'Skip it if… (optional)', fr: 'À éviter si… (facultatif)', ru: 'Пропустите, если… (необязательно)', vi: 'Bỏ qua nếu… (không bắt buộc)' },
  cover: { en: 'Cover', fr: 'Couverture', ru: 'Обложка', vi: 'Bìa' },
  chooseCover: { en: 'Choose a picture', fr: 'Choisir une image', ru: 'Выбрать картинку', vi: 'Chọn ảnh' },
  coverNote: { en: 'With no picture, a plain cover is made from the title.', fr: 'Sans image, une couverture simple est composée avec le titre.', ru: 'Без картинки обложка будет простой, из названия.', vi: 'Nếu không có ảnh, một bìa trơn sẽ được làm từ tên sách.' },
  save: { en: 'Save the book', fr: 'Enregistrer le livre', ru: 'Сохранить книгу', vi: 'Lưu sách' },
  saving: { en: 'Saving…', fr: 'Enregistrement…', ru: 'Сохранение…', vi: 'Đang lưu…' },
  cancel: { en: 'Cancel', fr: 'Annuler', ru: 'Отмена', vi: 'Hủy' },
  remove: { en: 'Remove this book from the site', fr: 'Retirer ce livre du site', ru: 'Убрать эту книгу с сайта', vi: 'Gỡ cuốn sách này khỏi trang' },
  sure: { en: 'Remove it, with its cover and its file?', fr: 'Le retirer, avec sa couverture et son fichier ?', ru: 'Убрать её вместе с обложкой и файлом?', vi: 'Gỡ đi, cùng với bìa và tệp của nó?' },
  failed: { en: 'Not saved. Check the fields (a genre is needed) and try again.', fr: 'Non enregistré. Vérifiez les champs (il faut un genre) et réessayez.', ru: 'Не сохранено. Проверьте поля (нужен жанр) и попробуйте снова.', vi: 'Chưa lưu được. Hãy kiểm tra các ô (cần một thể loại) rồi thử lại.' },
  fileNext: { en: 'Once saved, open the book in the list below to put a file beside it.', fr: 'Une fois enregistré, ouvrez le livre dans la liste ci-dessous pour y joindre un fichier.', ru: 'После сохранения откройте книгу в списке ниже, чтобы положить рядом файл.', vi: 'Lưu xong, hãy mở cuốn sách trong danh sách bên dưới để đặt tệp bên cạnh.' },
} satisfies Record<string, L>;

const API = `${import.meta.env.BASE_URL}api`;
const COVER = { width: 320, height: 480 };

/** An address for a new book: its title in plain letters, told apart from any book already there. */
function slug(title: string, author: string) {
  const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const taken = new Set(BOOKS.map((book) => book.id));
  let id = plain(title) || 'book';
  if (taken.has(id)) id = `${id}-${plain(author.split(' ').pop() ?? '') || 'x'}`.slice(0, 70);
  for (let n = 2; taken.has(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`;
  return id;
}

/** The cover as it will be kept: the picture cut to two by three, or the title set on a dark ground. */
async function makeCover(picture: File | null, title: string, author: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = COVER.width;
  canvas.height = COVER.height;
  const pen = canvas.getContext('2d')!;
  if (picture) {
    const image = await createImageBitmap(picture);
    const scale = Math.max(COVER.width / image.width, COVER.height / image.height);
    const [width, height] = [image.width * scale, image.height * scale];
    pen.drawImage(image, (COVER.width - width) / 2, (COVER.height - height) / 2, width, height);
  } else {
    pen.fillStyle = '#1d1a16';
    pen.fillRect(0, 0, COVER.width, COVER.height);
    pen.strokeStyle = '#c9a55c';
    pen.strokeRect(14.5, 14.5, COVER.width - 29, COVER.height - 29);
    pen.fillStyle = '#efe7d6';
    pen.textAlign = 'center';
    pen.font = '34px Georgia, serif';
    const lines: string[] = [];
    for (const word of title.split(/\s+/)) {
      const last = lines[lines.length - 1];
      if (last && pen.measureText(`${last} ${word}`).width < COVER.width - 70) lines[lines.length - 1] = `${last} ${word}`;
      else lines.push(word);
    }
    lines.slice(0, 7).forEach((line, at) => pen.fillText(line, COVER.width / 2, 130 + at * 42, COVER.width - 60));
    pen.fillStyle = '#c9a55c';
    pen.font = '17px Georgia, serif';
    pen.fillText(author, COVER.width / 2, COVER.height - 50, COVER.width - 60);
  }
  const as = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82));
  const made = (await as('image/webp')) ?? (await as('image/jpeg'));
  if (!made) throw new Error('no-cover');
  // A browser that cannot write WebP answers with a PNG; the server takes the type the image says it is.
  return made;
}

const mid: Mood = { tone: 50, voice: 50, intensity: 50, pace: 50, strange: 50 };

export function BookForm({ code, book, onDone, onCancel }: { code: string; book?: Book; onDone: (book: Book | null) => void; onCancel: () => void }) {
  const { tl } = useI18n();
  const [title, setTitle] = useState(book?.title ?? '');
  const [original, setOriginal] = useState(book?.originalTitle ?? '');
  const [author, setAuthor] = useState(book?.author ?? '');
  const [year, setYear] = useState(book ? String(book.year) : '');
  const [pages, setPages] = useState(book ? String(book.pages) : '');
  const [language, setLanguage] = useState<LanguageId>(book?.language ?? 'en');
  const [difficulty, setDifficulty] = useState<number>(book?.difficulty ?? 3);
  const [genres, setGenres] = useState<GenreId[]>(book?.genres ?? []);
  const [keywords, setKeywords] = useState<KeywordId[]>(book?.keywords ?? []);
  const [place, setPlace] = useState(book?.setting.place.en ?? '');
  const [countries, setCountries] = useState(book?.setting.countries.join(', ') ?? '');
  const [mood, setMood] = useState<Mood>(book?.mood ?? mid);
  const [en, setEn] = useState(book?.description.en ?? '');
  const [fr, setFr] = useState(book && book.description.fr !== book.description.en ? book.description.fr : '');
  const [advice, setAdvice] = useState({ pace: book?.advice.pace.en ?? '', headsUp: book?.advice.headsUp.en ?? '', readIf: book?.advice.readIf.en ?? '', skipIf: book?.advice.skipIf.en ?? '' });
  const [picture, setPicture] = useState<File | null>(null);
  const [state, setState] = useState<'saving' | 'failed' | null>(null);

  const flip = <T,>(list: T[], item: T, most: number) => (list.includes(item) ? list.filter((entry) => entry !== item) : list.length < most ? [...list, item] : list);
  const send = (path: string, init: RequestInit) => fetch(`${API}${path}`, { ...init, headers: { ...withCard(code), ...init.headers } });

  const save = async () => {
    setState('saving');
    try {
      const id = book?.id ?? slug(title, author);
      // French is left to follow the English wherever the keeper wrote none.
      const said = (text: string, before?: BookL) => ({ en: text.trim(), fr: before && before.en === text.trim() ? before.fr : '' });
      const entry = {
        title,
        originalTitle: original,
        author,
        year: Number(year),
        pages: Number(pages),
        language,
        difficulty,
        genres,
        keywords,
        setting: { place: said(place, book?.setting.place), countries: countries.toUpperCase().match(/[A-Z]{2}/g) ?? [] },
        mood,
        description: { en, fr },
        advice: {
          pace: said(advice.pace, book?.advice.pace),
          headsUp: said(advice.headsUp, book?.advice.headsUp),
          readIf: said(advice.readIf, book?.advice.readIf),
          skipIf: said(advice.skipIf, book?.advice.skipIf),
        },
      };
      const kept = await send(`/added/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) });
      if (!kept.ok) throw new Error('refused');
      const saved = ((await kept.json()) as { book: Book }).book;
      let coverAt = book?.coverAt ?? 0;
      if (picture || !book || title !== book.title || author !== book.author) {
        // A cover made from the title follows the title; a picture chosen earlier is kept unless another is chosen.
        if (picture || !book || !book.coverAt || localStorage.getItem(`incipit:plain-cover:${id}`)) {
          const image = await makeCover(picture, saved.title, saved.author);
          const covered = await send(`/covers/${id}`, { method: 'PUT', headers: { 'content-type': image.type }, body: image });
          if (!covered.ok) throw new Error('refused');
          coverAt = ((await covered.json()) as { coverAt: number }).coverAt;
          if (picture) localStorage.removeItem(`incipit:plain-cover:${id}`);
          else localStorage.setItem(`incipit:plain-cover:${id}`, '1');
        }
      }
      const whole = { ...saved, coverAt };
      shelve(whole);
      onDone(whole);
    } catch {
      setState('failed');
    }
  };

  const remove = async () => {
    if (!book || !confirm(tl(TEXT.sure))) return;
    if (!(await send(`/added/${book.id}`, { method: 'DELETE' })).ok) return setState('failed');
    unshelve(book.id);
    onDone(null);
  };

  return (
    <form
      className="admin-entry admin-new"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2>{tl(book ? TEXT.edit : TEXT.add)}</h2>
      <label>
        {tl(TEXT.title)}
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required />
      </label>
      <label>
        {tl(TEXT.original)}
        <input value={original} onChange={(event) => setOriginal(event.target.value)} maxLength={200} />
      </label>
      <div className="admin-pair">
        <label>
          {tl(TEXT.author)}
          <input value={author} onChange={(event) => setAuthor(event.target.value)} maxLength={200} required />
        </label>
        <label>
          {tl(TEXT.year)}
          <input value={year} onChange={(event) => setYear(event.target.value)} inputMode="numeric" pattern="-?[0-9]{1,4}" required />
        </label>
      </div>
      <div className="admin-three">
        <label>
          {tl(TEXT.pages)}
          <input value={pages} onChange={(event) => setPages(event.target.value)} inputMode="numeric" pattern="[0-9]{1,5}" required />
        </label>
        <label>
          {tl(TEXT.language)}
          <select value={language} onChange={(event) => setLanguage(event.target.value as LanguageId)}>
            {(Object.keys(LANGUAGES) as LanguageId[]).map((id) => (
              <option key={id} value={id}>
                {tl(LANGUAGES[id])}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tl(TEXT.difficulty)}
          <select value={difficulty} onChange={(event) => setDifficulty(Number(event.target.value))}>
            {[1, 2, 3, 4, 5].map((level) => (
              <option key={level}>{level}</option>
            ))}
          </select>
        </label>
      </div>

      <fieldset>
        <legend>{tl(TEXT.genres)}</legend>
        {(Object.keys(GENRES) as GenreId[]).map((id) => (
          <button key={id} type="button" className="admin-chip" aria-pressed={genres.includes(id)} onClick={() => setGenres(flip(genres, id, 4))}>
            {tl(GENRES[id])}
          </button>
        ))}
      </fieldset>
      <fieldset>
        <legend>{tl(TEXT.keywords)}</legend>
        {(Object.keys(KEYWORDS) as KeywordId[]).map((id) => (
          <button key={id} type="button" className="admin-chip" aria-pressed={keywords.includes(id)} onClick={() => setKeywords(flip(keywords, id, 8))}>
            {tl(KEYWORDS[id])}
          </button>
        ))}
      </fieldset>

      <div className="admin-pair admin-even">
        <label>
          {tl(TEXT.place)}
          <input value={place} onChange={(event) => setPlace(event.target.value)} maxLength={200} />
        </label>
        <label>
          {tl(TEXT.countries)}
          <input value={countries} onChange={(event) => setCountries(event.target.value)} maxLength={40} />
        </label>
      </div>

      <fieldset className="admin-mood">
        <legend>{tl(TEXT.mood)}</legend>
        {AXES.map((axis) => (
          <label key={axis.id}>
            <span>{tl(axis.low)}</span>
            <input type="range" min={0} max={100} step={5} value={mood[axis.id as AxisId]} onChange={(event) => setMood({ ...mood, [axis.id]: Number(event.target.value) })} aria-label={`${tl(axis.low)} – ${tl(axis.high)}`} />
            <span>{tl(axis.high)}</span>
          </label>
        ))}
      </fieldset>

      <label>
        {tl(TEXT.descriptionEn)}
        <textarea value={en} onChange={(event) => setEn(event.target.value)} rows={3} maxLength={1200} required />
      </label>
      <label>
        {tl(TEXT.descriptionFr)}
        <textarea value={fr} onChange={(event) => setFr(event.target.value)} rows={3} maxLength={1200} />
      </label>
      <div className="admin-pair admin-even">
        {(['readIf', 'skipIf', 'pace', 'headsUp'] as const).map((field) => (
          <label key={field}>
            {tl(TEXT[field])}
            <textarea value={advice[field]} onChange={(event) => setAdvice({ ...advice, [field]: event.target.value })} rows={2} maxLength={600} />
          </label>
        ))}
      </div>

      <label>
        {tl(TEXT.cover)}
        <input type="file" accept="image/*" onChange={(event) => setPicture(event.target.files?.[0] ?? null)} />
      </label>
      <p className="card-note">
        {tl(TEXT.coverNote)} {!book && tl(TEXT.fileNext)}
      </p>

      <div className="admin-actions">
        <button type="submit" className="button" disabled={state === 'saving' || genres.length === 0}>
          {tl(state === 'saving' ? TEXT.saving : TEXT.save)}
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          {tl(TEXT.cancel)}
        </button>
        {book && (
          <button type="button" className="text-button" onClick={() => void remove()}>
            {tl(TEXT.remove)}
          </button>
        )}
      </div>
      {state === 'failed' && <p className="card-problem">{tl(TEXT.failed)}</p>}
    </form>
  );
}
