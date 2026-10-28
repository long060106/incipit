import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BOOKS } from '../data/books';
import type { L } from '../data/types';
import { SITE_NAME, useI18n } from '../i18n';
import { useCard } from '../lib/card';
import { coverUrl } from '../lib/links';
import { fold } from '../lib/match';
import { essays, essayUrl, isProblem, MAX_ESSAY, MAX_QUOTED, MAX_TITLE, MIN_ESSAY, personUrl, quotedLength, type Essay, type Problem } from '../lib/people';
import { Prose } from '../lib/prose';
import { booksOf } from './Essays';
import { PageHeader, pageUrl, useQuickLoader } from './PageHeader';
import '../notes/notes.css';
import './people.css';

/*
  Writing an essay (/write, or /write?id=<id> to write one again, /write?book=<id> to start on
  a book). It goes to the keeper, who approves it or says why not; the reader follows it on
  their own page. A new essay is kept in this browser as it is written, so that nothing is
  lost to a closed tab.
*/

const TEXT = {
  eyebrow: { en: 'Write an essay', fr: 'Écrire un essai', ru: 'Написать эссе', vi: 'Viết bài luận' },
  again: { en: 'Write it again', fr: 'Le réécrire', ru: 'Переписать', vi: 'Viết lại' },
  title: { en: 'Title', fr: 'Titre', ru: 'Название', vi: 'Tên sách' },
  titleHint: { en: 'A title', fr: 'Un titre', ru: 'Заголовок', vi: 'Tiêu đề' },
  books: { en: 'The books it is about (up to three)', fr: 'Les livres dont il parle (trois au plus)', ru: 'Книги, о которых оно (до трёх)', vi: 'Những cuốn sách bài viết bàn tới (tối đa ba)' },
  find: { en: 'Find a book by its title or author', fr: 'Trouver un livre par son titre ou son auteur', ru: 'Найти книгу по названию или автору', vi: 'Tìm sách theo tên hoặc tác giả' },
  body: { en: 'Your essay', fr: 'Votre essai', ru: 'Ваше эссе', vi: 'Bài luận của bạn' },
  bodyHint: { en: 'Begin anywhere. A blank line starts a new paragraph.', fr: 'Commencez où vous voulez. Une ligne vide commence un nouveau paragraphe.', ru: 'Начните откуда угодно. Пустая строка начинает новый абзац.', vi: 'Bắt đầu từ đâu cũng được. Một dòng trống mở đoạn mới.' },
  writeTab: { en: 'Write', fr: 'Écrire', ru: 'Писать', vi: 'Viết' },
  preview: { en: 'Preview', fr: 'Aperçu', ru: 'Просмотр', vi: 'Xem trước' },
  bold: { en: 'Bold', fr: 'Gras', ru: 'Жирный', vi: 'Đậm' },
  italic: { en: 'Italic', fr: 'Italique', ru: 'Курсив', vi: 'Nghiêng' },
  heading: { en: 'Heading', fr: 'Intertitre', ru: 'Подзаголовок', vi: 'Tiêu đề phụ' },
  quote: { en: 'Quotation', fr: 'Citation', ru: 'Цитата', vi: 'Trích dẫn' },
  list: { en: 'List', fr: 'Liste', ru: 'Список', vi: 'Danh sách' },
  link: { en: 'Link', fr: 'Lien', ru: 'Ссылка', vi: 'Liên kết' },
  chars: { en: '{n} characters', fr: '{n} caractères', ru: 'Знаков: {n}', vi: '{n} ký tự' },
  needs: { en: 'at least {n}', fr: 'au moins {n}', ru: 'не меньше {n}', vi: 'ít nhất {n}' },
  quoted: { en: 'Quoted: {n} of {most}', fr: 'Cité : {n} sur {most}', ru: 'Цитаты: {n} из {most}', vi: 'Trích dẫn: {n} trên {most}' },
  send: { en: 'Send to the keeper', fr: 'Envoyer au gardien', ru: 'Отправить хранителю', vi: 'Gửi người giữ sách' },
  sendAgain: { en: 'Send again to the keeper', fr: 'Renvoyer au gardien', ru: 'Снова отправить хранителю', vi: 'Gửi lại người giữ sách' },
  sending: { en: 'Sending…', fr: 'Envoi…', ru: 'Отправка…', vi: 'Đang gửi…' },
  sent: { en: 'Sent. The keeper will read it soon.', fr: 'Envoyé. Le gardien le lira bientôt.', ru: 'Отправлено. Хранитель скоро прочитает.', vi: 'Đã gửi. Người giữ sách sẽ sớm đọc.' },
  sentNote: {
    en: 'Until it is approved, only you can see it. You can follow it on your page.',
    fr: 'Tant qu’il n’est pas approuvé, vous seul pouvez le voir. Vous pouvez le suivre sur votre page.',
    ru: 'Пока его не одобрят, видите его только вы. Следить за ним можно на своей странице.',
    vi: 'Khi chưa được duyệt, chỉ bạn thấy bài này. Bạn có thể theo dõi nó trên trang của mình.',
  },
  open: { en: 'See it', fr: 'Le voir', ru: 'Посмотреть', vi: 'Xem bài' },
  page: { en: 'Your page', fr: 'Votre page', ru: 'Ваша страница', vi: 'Trang của bạn' },
  how: { en: 'How it works', fr: 'Comment cela se passe', ru: 'Как это устроено', vi: 'Cách hoạt động' },
  how1: { en: 'Your essay goes to the keeper of the site, who reads it.', fr: 'Votre essai va au gardien du site, qui le lit.', ru: 'Ваше эссе попадает к хранителю сайта, который его читает.', vi: 'Bài luận của bạn được gửi tới người giữ trang để đọc.' },
  how2: {
    en: 'Once approved, it appears among the essays, on your page and beside the books it is about.',
    fr: 'Une fois approuvé, il paraît parmi les essais, sur votre page et à côté des livres dont il parle.',
    ru: 'После одобрения оно появляется среди эссе, на вашей странице и рядом с книгами, о которых оно.',
    vi: 'Khi được duyệt, bài sẽ hiện trong mục bài luận, trên trang của bạn và bên cạnh những cuốn sách nó bàn tới.',
  },
  how3: { en: 'If you change it later, it is read again.', fr: 'Si vous le modifiez ensuite, il est relu.', ru: 'Если вы потом его измените, его прочитают снова.', vi: 'Nếu sau này bạn sửa, bài sẽ được đọc lại.' },
  rules: { en: 'What is welcome', fr: 'Ce qui est bienvenu', ru: 'Что приветствуется', vi: 'Điều được hoan nghênh' },
  rule1: { en: 'Your own words. Quote the book as you need, up to 1,500 characters in all.', fr: 'Vos propres mots. Citez le livre autant qu’il le faut, 1 500 caractères au plus en tout.', ru: 'Ваши собственные слова. Цитируйте книгу сколько нужно, но не больше 1500 знаков в сумме.', vi: 'Lời của chính bạn. Trích sách tùy ý, tổng cộng tối đa 1.500 ký tự.' },
  rule2: { en: 'Warn before you give an ending away.', fr: 'Prévenez avant de dévoiler une fin.', ru: 'Предупреждайте, прежде чем раскрыть концовку.', vi: 'Hãy báo trước khi tiết lộ đoạn kết.' },
  rule3: { en: 'Kindness to other readers. No advertising.', fr: 'De la bienveillance envers les autres lecteurs. Pas de publicité.', ru: 'Доброта к другим читателям. Никакой рекламы.', vi: 'Tử tế với các bạn đọc khác. Không quảng cáo.' },
  signIn: { en: 'Sign in or create an account to write an essay.', fr: 'Connectez-vous ou créez un compte pour écrire un essai.', ru: 'Войдите или создайте аккаунт, чтобы написать эссе.', vi: 'Đăng nhập hoặc tạo tài khoản để viết bài luận.' },
  signInLink: { en: 'Sign in', fr: 'Se connecter', ru: 'Войти', vi: 'Đăng nhập' },
  notYours: { en: 'This essay cannot be written again from here.', fr: 'Cet essai ne peut pas être réécrit d’ici.', ru: 'Это эссе нельзя переписать отсюда.', vi: 'Không thể viết lại bài luận này từ đây.' },
  draft: { en: 'Draft kept in this browser', fr: 'Brouillon gardé dans ce navigateur', ru: 'Черновик хранится в этом браузере', vi: 'Bản nháp được giữ trong trình duyệt này' },
  'needs-account': { en: 'Only a reader with an account can write here.', fr: 'Seul un lecteur avec un compte peut écrire ici.', ru: 'Писать здесь может только читатель с аккаунтом.', vi: 'Chỉ bạn đọc có tài khoản mới viết được ở đây.' },
  'not-found': { en: 'This essay is no longer there.', fr: 'Cet essai n’existe plus.', ru: 'Этого эссе больше нет.', vi: 'Bài luận này không còn nữa.' },
  'bad-title': { en: 'Give it a title, of 140 characters at most.', fr: 'Donnez-lui un titre, de 140 caractères au plus.', ru: 'Дайте ему заголовок не длиннее 140 знаков.', vi: 'Hãy đặt tiêu đề, tối đa 140 ký tự.' },
  'too-short': { en: 'An essay needs at least 300 characters.', fr: 'Un essai demande au moins 300 caractères.', ru: 'Эссе должно быть не короче 300 знаков.', vi: 'Bài luận cần ít nhất 300 ký tự.' },
  'too-long': { en: 'That is longer than 20,000 characters.', fr: 'C’est plus long que 20 000 caractères.', ru: 'Это длиннее 20 000 знаков.', vi: 'Bài này dài hơn 20.000 ký tự.' },
  'too-much-quoted': { en: 'More than 1,500 characters are quoted. Keep the quotations shorter.', fr: 'Plus de 1 500 caractères sont cités. Raccourcissez les citations.', ru: 'Цитат больше 1500 знаков. Сократите их.', vi: 'Phần trích dẫn quá 1.500 ký tự. Hãy rút ngắn lại.' },
  'bad-books': { en: 'One of the books is not on the wall.', fr: 'L’un des livres n’est pas sur le mur.', ru: 'Одной из книг нет на стене.', vi: 'Một trong các cuốn sách không có trên tường.' },
  'too-many': { en: 'Too many essays sent today. Come back tomorrow.', fr: 'Trop d’essais envoyés aujourd’hui. Revenez demain.', ru: 'Слишком много эссе за сегодня. Возвращайтесь завтра.', vi: 'Hôm nay đã gửi quá nhiều bài luận. Mai quay lại nhé.' },
  'too-many-waiting': { en: 'Five of your essays are already waiting for the keeper.', fr: 'Cinq de vos essais attendent déjà le gardien.', ru: 'Пять ваших эссе уже ждут хранителя.', vi: 'Đã có năm bài luận của bạn đang chờ người giữ sách.' },
  locked: { en: 'That could not be done.', fr: 'Cela n’a pas pu être fait.', ru: 'Не получилось.', vi: 'Không làm được.' },
  offline: { en: 'The server could not be reached. Try again in a moment.', fr: 'Le serveur est injoignable. Réessayez dans un instant.', ru: 'Сервер недоступен. Попробуйте ещё раз чуть позже.', vi: 'Không kết nối được máy chủ. Thử lại sau giây lát.' },
} satisfies Record<string, L>;

const DRAFT = 'incipit:essay-draft';

interface Draft {
  title: string;
  body: string;
  books: string[];
}

const readDraft = (): Draft | null => {
  try {
    return JSON.parse(localStorage.getItem(DRAFT) ?? 'null') as Draft | null;
  } catch {
    return null;
  }
};

export default function Write() {
  const { tl } = useI18n();
  const { card: mine } = useCard();
  useQuickLoader();
  const asked = new URLSearchParams(location.search);
  const id = asked.get('id');

  useEffect(() => {
    document.title = `${tl(TEXT.eyebrow)} · ${SITE_NAME}`;
  }, [tl]);

  return (
    <div className="people-page">
      <PageHeader here="essays" />
      <main className="people-body">
        {mine?.name ? (
          <Desk id={id} startBook={asked.get('book')} />
        ) : (
          <div className="people-missing">
            <p>{tl(TEXT.signIn)}</p>
            <a className="button" href={`${pageUrl('signin')}?next=${encodeURIComponent(location.pathname + location.search)}`}>
              {tl(TEXT.signInLink)} →
            </a>
          </div>
        )}
      </main>
    </div>
  );
}

function Desk({ id, startBook }: { id: string | null; startBook: string | null }) {
  const { tl, lang } = useI18n();
  const { card: mine } = useCard();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [books, setBooks] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(!id);
  const [notYours, setNotYours] = useState(false);
  const [view, setView] = useState<'write' | 'preview'>('write');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [sent, setSent] = useState<Essay | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  // What to start from: the essay written before, or the draft kept here, or a book to write on.
  useEffect(() => {
    if (id) {
      void essays.get(id).then((answer) => {
        if (isProblem(answer) || !answer.mine) return setNotYours(true);
        setTitle(answer.title);
        setBody(answer.body);
        setBooks(answer.books);
        setLoaded(true);
      });
      return;
    }
    const draft = readDraft();
    if (draft) {
      setTitle(draft.title);
      setBody(draft.body);
      setBooks(draft.books);
    }
    if (startBook && BOOKS.some((book) => book.id === startBook)) setBooks((before) => (before.includes(startBook) ? before : [startBook, ...before].slice(0, 3)));
  }, [id, startBook]);

  // A new essay is kept in this browser as it is written.
  useEffect(() => {
    if (id || sent || !loaded) return;
    try {
      if (title || body) localStorage.setItem(DRAFT, JSON.stringify({ title, body, books }));
    } catch {
      // No storage here: nothing is kept.
    }
  }, [id, sent, loaded, title, body, books]);

  // The page to write on grows with what is written on it.
  useEffect(() => {
    const field = area.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.max(field.scrollHeight, 320)}px`;
  }, [body, view]);

  if (notYours) return <p className="people-missing">{tl(TEXT.notYours)}</p>;
  if (!loaded) return null;

  const quoted = quotedLength(body);
  const length = body.trim().length;
  const ready = title.trim() && length >= MIN_ESSAY && length <= MAX_ESSAY && quoted <= MAX_QUOTED;

  /** Puts marks around what is chosen in the text (or a word to write over, if nothing is), or at the start of its lines. */
  const mark = (before: string, after = '', lines = false, stand = '') => {
    const field = area.current;
    if (!field) return;
    const { selectionStart: start, selectionEnd: end } = field;
    let next: string;
    let from: number;
    let to: number;
    if (lines) {
      const lineStart = body.lastIndexOf('\n', start - 1) + 1;
      const chosen = body.slice(lineStart, end) || '';
      const marked = chosen
        .split('\n')
        .map((line) => before + line)
        .join('\n');
      next = body.slice(0, lineStart) + marked + body.slice(end);
      from = lineStart + before.length;
      to = lineStart + marked.length;
    } else {
      const chosen = body.slice(start, end) || stand;
      next = body.slice(0, start) + before + chosen + after + body.slice(end);
      from = start + before.length;
      to = from + chosen.length;
    }
    setBody(next.slice(0, MAX_ESSAY));
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(from, to);
    });
  };

  const send = async () => {
    setBusy(true);
    setProblem(null);
    const answer = await essays.send({ title: title.trim(), body, books }, id ?? undefined);
    setBusy(false);
    if (isProblem(answer)) return setProblem(answer);
    setSent(answer);
    if (!id)
      try {
        localStorage.removeItem(DRAFT);
      } catch {
        // Nothing was kept.
      }
  };

  if (sent)
    return (
      <div className="write-sent">
        <span className="write-seal" aria-hidden="true">
          ✓
        </span>
        <h1>{tl(TEXT.sent)}</h1>
        <p>{tl(TEXT.sentNote)}</p>
        <div className="card-actions">
          <a className="button" href={essayUrl(sent.id)}>
            {tl(TEXT.open)} →
          </a>
          <a className="text-link" href={personUrl(mine!.name!)}>
            <span className="u">{tl(TEXT.page)}</span>
          </a>
        </div>
      </div>
    );

  const tools: [string, L, () => void][] = [
    ['B', TEXT.bold, () => mark('**', '**', false, tl(TEXT.bold).toLowerCase())],
    ['I', TEXT.italic, () => mark('*', '*', false, tl(TEXT.italic).toLowerCase())],
    ['H', TEXT.heading, () => mark('## ', '', true)],
    ['❝', TEXT.quote, () => mark('> ', '', true)],
    ['•', TEXT.list, () => mark('- ', '', true)],
    ['↗', TEXT.link, () => mark('[', '](https://)', false, tl(TEXT.link).toLowerCase())],
  ];

  return (
    <div className="write">
      <form
        className="write-page"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <p className="page-eyebrow">{tl(id ? TEXT.again : TEXT.eyebrow)}</p>
        <label className="write-title">
          <span className="sr-only">{tl(TEXT.title)}</span>
          <textarea
            rows={1}
            value={title}
            onChange={(event) => setTitle(event.target.value.replace(/\n/g, ' ').slice(0, MAX_TITLE))}
            placeholder={tl(TEXT.titleHint)}
            maxLength={MAX_TITLE}
            required
          />
        </label>

        <BookPicker chosen={books} onChange={setBooks} />

        <div className="write-bar">
          <div className="write-views" role="tablist" style={{ '--at': view === 'write' ? 0 : 1 } as CSSProperties}>
            {(['write', 'preview'] as const).map((which) => (
              <button key={which} type="button" role="tab" aria-selected={view === which} onClick={() => setView(which)}>
                {tl(which === 'write' ? TEXT.writeTab : TEXT.preview)}
              </button>
            ))}
          </div>
          {view === 'write' && (
            <div className="write-tools" role="toolbar" aria-label={tl(TEXT.body)}>
              {tools.map(([sign, label, act]) => (
                <button key={sign} type="button" title={tl(label)} aria-label={tl(label)} onClick={act} data-sign={sign}>
                  {sign}
                </button>
              ))}
            </div>
          )}
        </div>

        {view === 'write' ? (
          <label className="write-body">
            <span className="sr-only">{tl(TEXT.body)}</span>
            <textarea ref={area} value={body} onChange={(event) => setBody(event.target.value.slice(0, MAX_ESSAY))} placeholder={tl(TEXT.bodyHint)} />
          </label>
        ) : (
          <div className="write-preview">
            <h1>{title || tl(TEXT.titleHint)}</h1>
            <Prose text={body} className="prose essay-body" />
          </div>
        )}

        <div className="write-counts">
          <span data-low={length < MIN_ESSAY || undefined}>
            {tl(TEXT.chars).replace('{n}', length.toLocaleString(lang))}
            {length < MIN_ESSAY && ` · ${tl(TEXT.needs).replace('{n}', String(MIN_ESSAY))}`}
          </span>
          {quoted > 0 && (
            <span data-low={quoted > MAX_QUOTED || undefined}>
              {tl(TEXT.quoted).replace('{n}', quoted.toLocaleString(lang)).replace('{most}', MAX_QUOTED.toLocaleString(lang))}
            </span>
          )}
          {!id && (title || body) && <span>{tl(TEXT.draft)}</span>}
        </div>

        <div className="card-actions">
          <button type="submit" className="button button-large" disabled={busy || !ready} aria-busy={busy || undefined}>
            {tl(busy ? TEXT.sending : id ? TEXT.sendAgain : TEXT.send)}
          </button>
        </div>
        {problem && <p className="card-problem">{tl(TEXT[problem])}</p>}
      </form>

      <aside className="write-aside">
        <h2 className="page-eyebrow">{tl(TEXT.how)}</h2>
        <ol>
          <li>{tl(TEXT.how1)}</li>
          <li>{tl(TEXT.how2)}</li>
          <li>{tl(TEXT.how3)}</li>
        </ol>
        <h2 className="page-eyebrow">{tl(TEXT.rules)}</h2>
        <ul>
          <li>{tl(TEXT.rule1)}</li>
          <li>{tl(TEXT.rule2)}</li>
          <li>{tl(TEXT.rule3)}</li>
        </ul>
        <pre className="write-help" aria-hidden="true">
          {'## A heading\n> A quotation\n- An item\n*italic*  **bold**\n[a link](https://…)'}
        </pre>
      </aside>
    </div>
  );
}

/** Up to three books of the wall, found by title or author. */
function BookPicker({ chosen, onChange }: { chosen: string[]; onChange: (books: string[]) => void }) {
  const { tl } = useI18n();
  const [query, setQuery] = useState('');
  const found = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return BOOKS.filter((book) => !chosen.includes(book.id) && words.every((word) => fold(`${book.title} ${book.author}`).includes(word))).slice(0, 6);
  }, [query, chosen]);

  return (
    <div className="write-books">
      <p className="write-label">{tl(TEXT.books)}</p>
      {chosen.length > 0 && (
        <ul className="write-chosen">
          {booksOf(chosen).map((book) => (
            <li key={book.id}>
              <img src={coverUrl(book, 'sm')} alt="" width={28} height={42} />
              <span>{book.title}</span>
              <button type="button" aria-label="×" onClick={() => onChange(chosen.filter((id) => id !== book.id))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {chosen.length < 3 && (
        <div className="write-find">
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tl(TEXT.find)} aria-label={tl(TEXT.find)} />
          {found.length > 0 && (
            <ul>
              {found.map((book) => (
                <li key={book.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange([...chosen, book.id]);
                      setQuery('');
                    }}
                  >
                    <img src={coverUrl(book, 'sm')} alt="" width={28} height={42} loading="lazy" />
                    <span>
                      <strong>{book.title}</strong>
                      <small>
                        {book.author} · {book.year}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
