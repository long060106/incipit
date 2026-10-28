import { useEffect, useMemo, useRef, useState } from 'react';
import { Keeper } from '../components/Keeper';
import { BOOKS } from '../data/books';
import type { Book, L } from '../data/types';
import { useI18n } from '../i18n';
import { card as cards, useCard } from '../lib/card';
import {
  choosePassword,
  decide,
  deskState,
  dropFile,
  FILE_KINDS,
  keepFile,
  keptFiles,
  lockDesk,
  MAX_FILE,
  megabytes,
  openFile,
  printed,
  saveFile,
  unlockDesk,
  useDecided,
  type Desk,
  type Edits,
  type KeptFile,
} from '../lib/keeper';
import { reads } from '../lib/kepttext';
import { bookLinks, bookUrl } from '../lib/links';
import { fold } from '../lib/match';
import { BookForm } from './BookForm';
import { PageHeader, pageUrl, useQuickLoader } from './PageHeader';
import { AccountsDesk } from './AccountsDesk';
import { EssayDesk } from './EssayDesk';
import { MoodReview } from './MoodReview';
import { ProfileForm } from './ProfileForm';
import './admin.css';

/*
  The keeper's desk (/admin), for the card whose role is 'admin': every book of the
  catalogue in one list, with its entry to correct, its download to switch, its articles,
  and a file to put beside it. What a file does follows the book: beside a book out of
  copyright it becomes a download for every reader; beside any other book it stays the
  keeper's own, and the server gives it to no other card.
*/

const TEXT = {
  title: { en: 'Keeper’s desk', fr: 'Bureau du gardien', ru: 'Стол хранителя', vi: 'Bàn của người giữ sách' },
  profile: { en: 'Your profile and the About page', fr: 'Votre profil et la page À propos', ru: 'Ваш профиль и страница «О сайте»', vi: 'Hồ sơ của bạn và trang Giới thiệu' },
  accounts: { en: 'Readers’ accounts', fr: 'Comptes des lecteurs', ru: 'Аккаунты читателей', vi: 'Tài khoản bạn đọc' },
  moods: { en: 'Look the moods over', fr: 'Revoir les ambiances', ru: 'Просмотреть настроения', vi: 'Xem lại các tâm trạng' },
  essays: { en: 'Essays to read', fr: 'Essais à lire', ru: 'Эссе на проверку', vi: 'Bài luận cần đọc' },
  signIn: { en: 'Sign in as admin', fr: 'Connexion administrateur', ru: 'Войти как администратор', vi: 'Đăng nhập quản trị' },
  closed: {
    en: 'This page is for the keeper of the site. Enter the keeper’s card; its password is asked for next.',
    fr: 'Cette page est réservée au gardien du site. Saisissez la carte du gardien ; son mot de passe est demandé ensuite.',
    ru: 'Эта страница для хранителя сайта. Введите билет хранителя; затем будет запрошен его пароль.',
    vi: 'Trang này dành cho người giữ trang. Nhập thẻ của người giữ; mật khẩu sẽ được hỏi tiếp theo.',
  },
  cardCode: { en: 'Card code', fr: 'Code de la carte', ru: 'Код билета', vi: 'Mã thẻ' },
  enter: { en: 'Continue', fr: 'Continuer', ru: 'Продолжить', vi: 'Tiếp tục' },
  notKeeper: { en: 'This card is not the keeper’s.', fr: 'Cette carte n’est pas celle du gardien.', ru: 'Это не билет хранителя.', vi: 'Thẻ này không phải của người giữ.' },
  unknownCard: { en: 'No such card.', fr: 'Aucune carte de ce nom.', ru: 'Такого билета нет.', vi: 'Không có thẻ này.' },
  chooseTitle: { en: 'Choose a password for the desk', fr: 'Choisissez un mot de passe pour le bureau', ru: 'Выберите пароль для стола', vi: 'Chọn mật khẩu cho bàn làm việc' },
  chooseNote: {
    en: 'From now on the desk opens only with your card and this password. It is asked for again in each new tab, and after twelve hours. At least 8 characters. Keep it somewhere safe: it cannot be shown to you again.',
    fr: 'Désormais le bureau ne s’ouvre qu’avec votre carte et ce mot de passe. Il est redemandé dans chaque nouvel onglet, et au bout de douze heures. Au moins 8 caractères. Gardez-le en lieu sûr : il ne peut pas vous être montré de nouveau.',
    ru: 'Отныне стол открывается только вашим билетом и этим паролем. Его спросят снова в каждой новой вкладке и через двенадцать часов. Не меньше 8 знаков. Храните его в надёжном месте: показать его вам снова нельзя.',
    vi: 'Từ nay bàn làm việc chỉ mở bằng thẻ của bạn và mật khẩu này. Mật khẩu sẽ được hỏi lại ở mỗi thẻ mới và sau mười hai giờ. Ít nhất 8 ký tự. Hãy cất ở nơi an toàn: không thể hiện lại cho bạn được.',
  },
  lockedTitle: { en: 'The desk is locked', fr: 'Le bureau est verrouillé', ru: 'Стол заперт', vi: 'Bàn làm việc đang khóa' },
  lockedNote: { en: 'Enter the password you chose for it.', fr: 'Saisissez le mot de passe que vous lui avez choisi.', ru: 'Введите пароль, который вы для него выбрали.', vi: 'Nhập mật khẩu bạn đã chọn cho nó.' },
  password: { en: 'Password', fr: 'Mot de passe', ru: 'Пароль', vi: 'Mật khẩu' },
  newPassword: { en: 'New password', fr: 'Nouveau mot de passe', ru: 'Новый пароль', vi: 'Mật khẩu mới' },
  again: { en: 'The same again', fr: 'Encore une fois', ru: 'Ещё раз то же самое', vi: 'Nhập lại lần nữa' },
  setPassword: { en: 'Set the password', fr: 'Définir le mot de passe', ru: 'Задать пароль', vi: 'Đặt mật khẩu' },
  unlock: { en: 'Unlock', fr: 'Déverrouiller', ru: 'Открыть', vi: 'Mở khóa' },
  lockNow: { en: 'Lock the desk', fr: 'Verrouiller le bureau', ru: 'Запереть стол', vi: 'Khóa bàn làm việc' },
  change: { en: 'Change the password', fr: 'Changer le mot de passe', ru: 'Сменить пароль', vi: 'Đổi mật khẩu' },
  changed: { en: 'The password is changed.', fr: 'Le mot de passe est changé.', ru: 'Пароль изменён.', vi: 'Đã đổi mật khẩu.' },
  cancel: { en: 'Cancel', fr: 'Annuler', ru: 'Отмена', vi: 'Hủy' },
  mismatch: { en: 'The two are not the same.', fr: 'Les deux ne sont pas identiques.', ru: 'Пароли не совпадают.', vi: 'Hai mật khẩu không giống nhau.' },
  'bad-password': { en: 'A password needs at least 8 characters.', fr: 'Un mot de passe demande au moins 8 caractères.', ru: 'Пароль должен быть не короче 8 знаков.', vi: 'Mật khẩu cần ít nhất 8 ký tự.' },
  'wrong-password': { en: 'That is not the password.', fr: 'Ce n’est pas le mot de passe.', ru: 'Это не тот пароль.', vi: 'Sai mật khẩu.' },
  'too-many-tries': { en: 'Too many tries from this address today. Try again tomorrow.', fr: 'Trop d’essais depuis cette adresse aujourd’hui. Réessayez demain.', ru: 'Слишком много попыток с этого адреса за сегодня. Попробуйте завтра.', vi: 'Hôm nay địa chỉ này đã thử quá nhiều lần. Mai hãy thử lại.' },
  noAnswer: { en: 'The server gave no answer. Try again in a moment.', fr: 'Le serveur n’a pas répondu. Réessayez dans un instant.', ru: 'Сервер не ответил. Попробуйте ещё раз чуть позже.', vi: 'Máy chủ không trả lời. Thử lại sau giây lát.' },
  count: { en: '{all} books · {free} out of copyright · {held} in copyright', fr: '{all} livres · {free} libres de droits · {held} sous droits', ru: 'Книг: {all} · без авторских прав: {free} · под авторским правом: {held}', vi: '{all} cuốn · {free} hết bản quyền · {held} còn bản quyền' },
  kept: { en: '{n} files kept · {size} of 400 MB', fr: '{n} fichiers conservés · {size} sur 400 Mo', ru: 'Файлов: {n} · {size} из 400 МБ', vi: '{n} tệp đang lưu · {size} trên 400 MB' },
  search: { en: 'Search a title or an author…', fr: 'Chercher un titre ou un auteur…', ru: 'Искать название или автора…', vi: 'Tìm tên sách hoặc tác giả…' },
  all: { en: 'All', fr: 'Tous', ru: 'Все', vi: 'Tất cả' },
  free: { en: 'Out of copyright', fr: 'Libres de droits', ru: 'Без авторских прав', vi: 'Hết bản quyền' },
  held: { en: 'In copyright', fr: 'Sous droits', ru: 'Под авторским правом', vi: 'Còn bản quyền' },
  withFile: { en: 'With a file', fr: 'Avec un fichier', ru: 'С файлом', vi: 'Có tệp' },
  entry: { en: 'Entry', fr: 'Notice', ru: 'Запись', vi: 'Mục' },
  bookTitle: { en: 'Title', fr: 'Titre', ru: 'Название', vi: 'Tên sách' },
  author: { en: 'Author', fr: 'Auteur', ru: 'Автор', vi: 'Tác giả' },
  year: { en: 'Year', fr: 'Année', ru: 'Год', vi: 'Năm' },
  descriptionEn: { en: 'Description (English)', fr: 'Description (anglais)', ru: 'Описание (английский)', vi: 'Mô tả (tiếng Anh)' },
  descriptionFr: { en: 'Description (French)', fr: 'Description (français)', ru: 'Описание (французский)', vi: 'Mô tả (tiếng Pháp)' },
  save: { en: 'Save', fr: 'Enregistrer', ru: 'Сохранить', vi: 'Lưu' },
  saved: { en: 'Saved. Every reader sees it now.', fr: 'Enregistré. Tous les lecteurs le voient.', ru: 'Сохранено. Все читатели это уже видят.', vi: 'Đã lưu. Mọi bạn đọc đều thấy ngay.' },
  reset: { en: 'Back to the catalogue’s wording', fr: 'Revenir au texte du catalogue', ru: 'Вернуть текст каталога', vi: 'Trở về lời của danh mục' },
  failed: { en: 'Not saved. Check the fields and try again.', fr: 'Non enregistré. Vérifiez les champs et réessayez.', ru: 'Не сохранено. Проверьте поля и попробуйте снова.', vi: 'Chưa lưu được. Hãy kiểm tra các ô rồi thử lại.' },
  file: { en: 'File', fr: 'Fichier', ru: 'Файл', vi: 'Tệp' },
  fileFree: {
    en: 'This book is out of copyright, so a file put here starts open: readers get a download button on its sheet, and can read an EPUB or a text file on the site.',
    fr: 'Ce livre est libre de droits : un fichier déposé ici est d’abord ouvert. Les lecteurs ont un bouton de téléchargement sur sa fiche, et peuvent lire sur le site un EPUB ou un fichier texte.',
    ru: 'Авторское право на эту книгу истекло, поэтому файл, положенный сюда, сразу открыт: у читателей на её карточке появится кнопка скачивания, а EPUB или текстовый файл можно будет читать на сайте.',
    vi: 'Cuốn này đã hết bản quyền, nên tệp đặt ở đây sẽ mở ngay: bạn đọc có nút tải về trên trang sách, và đọc được tệp EPUB hay tệp chữ ngay trên trang.',
  },
  fileHeld: {
    en: 'A file put here starts closed: only this card can download it, and readers are not shown it. Opening it to readers is your decision and your responsibility. Do it only if you have the right to share this file where your readers are.',
    fr: 'Un fichier déposé ici est d’abord fermé : seule cette carte peut le télécharger, et les lecteurs ne le voient pas. L’ouvrir aux lecteurs relève de votre décision et de votre responsabilité. Ne le faites que si vous avez le droit de partager ce fichier là où se trouvent vos lecteurs.',
    ru: 'Файл, положенный сюда, сначала закрыт: скачать его может только этот билет, читателям он не показывается. Открыть его читателям — ваше решение и ваша ответственность. Делайте это, только если у вас есть право распространять этот файл там, где находятся ваши читатели.',
    vi: 'Tệp đặt ở đây ban đầu sẽ đóng: chỉ thẻ này tải được, bạn đọc không thấy. Mở nó cho bạn đọc là quyết định và trách nhiệm của bạn. Chỉ làm vậy nếu bạn có quyền chia sẻ tệp này ở nơi bạn đọc của bạn sống.',
  },
  openToAll: { en: 'Readers can download and read this file', fr: 'Les lecteurs peuvent télécharger et lire ce fichier', ru: 'Читатели могут скачать и читать этот файл', vi: 'Bạn đọc có thể tải về và đọc tệp này' },
  addBook: { en: 'Add a book', fr: 'Ajouter un livre', ru: 'Добавить книгу', vi: 'Thêm sách' },
  addedByYou: { en: 'Added by you', fr: 'Ajouté par vous', ru: 'Добавлено вами', vi: 'Do bạn thêm' },
  choose: { en: 'Choose a file', fr: 'Choisir un fichier', ru: 'Выбрать файл', vi: 'Chọn tệp' },
  replace: { en: 'Replace', fr: 'Remplacer', ru: 'Заменить', vi: 'Thay' },
  sending: { en: 'Sending… {n}%', fr: 'Envoi… {n} %', ru: 'Отправка… {n}%', vi: 'Đang gửi… {n}%' },
  download: { en: 'Download', fr: 'Télécharger', ru: 'Скачать', vi: 'Tải về' },
  read: { en: 'Read it on the site', fr: 'Le lire sur le site', ru: 'Читать на сайте', vi: 'Đọc trên trang' },
  remove: { en: 'Remove', fr: 'Retirer', ru: 'Убрать', vi: 'Gỡ' },
  kinds: { en: 'EPUB, PDF, TXT, MOBI or AZW3, up to 60 MB.', fr: 'EPUB, PDF, TXT, MOBI ou AZW3, jusqu’à 60 Mo.', ru: 'EPUB, PDF, TXT, MOBI или AZW3, до 60 МБ.', vi: 'EPUB, PDF, TXT, MOBI hoặc AZW3, tối đa 60 MB.' },
  'bad-name': { en: 'Only EPUB, PDF, TXT, MOBI and AZW3 files can be kept.', fr: 'Seuls les fichiers EPUB, PDF, TXT, MOBI et AZW3 peuvent être conservés.', ru: 'Хранить можно только файлы EPUB, PDF, TXT, MOBI и AZW3.', vi: 'Chỉ lưu được tệp EPUB, PDF, TXT, MOBI và AZW3.' },
  'too-large': { en: 'That file is over 60 MB.', fr: 'Ce fichier dépasse 60 Mo.', ru: 'Этот файл больше 60 МБ.', vi: 'Tệp này lớn hơn 60 MB.' },
  'shelf-full': { en: 'The shelf is full (400 MB). Remove a file first.', fr: 'L’étagère est pleine (400 Mo). Retirez d’abord un fichier.', ru: 'Полка заполнена (400 МБ). Сначала уберите какой-нибудь файл.', vi: 'Kệ đã đầy (400 MB). Hãy gỡ một tệp trước.' },
  fileFailed: { en: 'The file was not kept. Try again.', fr: 'Le fichier n’a pas été conservé. Réessayez.', ru: 'Файл не сохранён. Попробуйте снова.', vi: 'Chưa lưu được tệp. Thử lại nhé.' },
  open: { en: 'Open its sheet', fr: 'Ouvrir sa fiche', ru: 'Открыть её карточку', vi: 'Mở trang sách' },
  pdf: { en: 'PDF made by the site', fr: 'PDF fabriqué par le site', ru: 'PDF, сделанный сайтом', vi: 'PDF do trang tạo' },
  yours: { en: 'yours only', fr: 'à vous seul', ru: 'только вам', vi: 'chỉ mình bạn' },
  everyone: { en: 'for every reader', fr: 'pour tous les lecteurs', ru: 'для всех читателей', vi: 'cho mọi bạn đọc' },
  list: { en: 'List of the books in copyright', fr: 'Liste des livres sous droits', ru: 'Список книг под авторским правом', vi: 'Danh sách sách còn bản quyền' },
} satisfies Record<string, L>;

type Show = 'all' | 'free' | 'held' | 'file';

/**
 * The way in for someone who does not hold the keeper's card on this device: the card's code
 * first. The server says whose card it is; only the keeper's goes on to the password.
 */
function SignIn({ held }: { held: boolean }) {
  const { tl } = useI18n();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  // A reader's card already on this device is not the keeper's: say so from the start.
  const [problem, setProblem] = useState<L | null>(held ? TEXT.notKeeper : null);

  const submit = async () => {
    setBusy(true);
    setProblem(null);
    const before = cards.code();
    const answer = await cards.enter(typed);
    setBusy(false);
    if (answer === 'unknown') return setProblem(TEXT.unknownCard);
    if (answer === 'offline') return setProblem(TEXT.noAnswer);
    // A reader's card opens nothing here, and is not left on the device in place of the one that was there.
    if (cards.role() !== 'admin') {
      if (before) await cards.enter(before);
      else cards.leave();
      setProblem(TEXT.notKeeper);
    }
  };

  return (
    <form
      className="admin-door"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h1>{tl(TEXT.signIn)}</h1>
      <p>{tl(TEXT.closed)}</p>
      <label>
        {tl(TEXT.cardCode)}
        <input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={60} required autoFocus />
      </label>
      <div className="admin-actions">
        <button type="submit" className="button" disabled={busy || !typed.trim()}>
          {tl(TEXT.enter)}
        </button>
      </div>
      {problem && <p className="card-problem">{tl(problem)}</p>}
    </form>
  );
}

/** The door of the desk: choosing its password the first time (or a new one), or giving it to come in. */
function Door({ code, choosing, changingFrom, onOpen, onCancel }: { code: string; choosing: boolean; changingFrom?: boolean; onOpen: () => void; onCancel?: () => void }) {
  const { tl } = useI18n();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<L | null>(null);

  const submit = async () => {
    if (choosing && password !== again) return setProblem(TEXT.mismatch);
    if (choosing && password.length < 8) return setProblem(TEXT['bad-password']);
    setBusy(true);
    setProblem(null);
    const answer = await (choosing ? choosePassword(code, password) : unlockDesk(code, password));
    setBusy(false);
    if (answer === 'open') return onOpen();
    setProblem(answer === 'bad-password' || answer === 'wrong-password' || answer === 'too-many-tries' ? TEXT[answer] : TEXT.noAnswer);
  };

  return (
    <form
      className="admin-door"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {!changingFrom && <h1>{tl(choosing ? TEXT.chooseTitle : TEXT.lockedTitle)}</h1>}
      {!changingFrom && <p>{tl(choosing ? TEXT.chooseNote : TEXT.lockedNote)}</p>}
      <label>
        {tl(choosing ? TEXT.newPassword : TEXT.password)}
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={choosing ? 'new-password' : 'current-password'} minLength={choosing ? 8 : undefined} maxLength={200} required autoFocus />
      </label>
      {choosing && (
        <label>
          {tl(TEXT.again)}
          <input type="password" value={again} onChange={(event) => setAgain(event.target.value)} autoComplete="new-password" maxLength={200} required />
        </label>
      )}
      <div className="admin-actions">
        <button type="submit" className="button" disabled={busy}>
          {tl(choosing ? TEXT.setPassword : TEXT.unlock)}
        </button>
        {onCancel && (
          <button type="button" className="text-button" onClick={onCancel}>
            {tl(TEXT.cancel)}
          </button>
        )}
      </div>
      {problem && <p className="card-problem">{tl(problem)}</p>}
    </form>
  );
}

export default function Admin() {
  const { tl } = useI18n();
  const { card } = useCard();
  useQuickLoader();
  useDecided();
  const [files, setFiles] = useState<Record<string, KeptFile>>({});
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Counts the books added, written again or removed here, so that the list is drawn again.
  const [turn, setTurn] = useState(0);
  const keeper = card?.role === 'admin' ? card.code : null;

  // Holding the keeper's card is not enough: the desk has a password, asked for in each new tab.
  const [desk, setDesk] = useState<Desk | 'asking' | 'unreachable'>('asking');
  const [changing, setChanging] = useState(false);
  const [profiling, setProfiling] = useState(false);
  const [accounting, setAccounting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reading, setReading] = useState(false);
  useEffect(() => {
    if (keeper) void deskState(keeper).then((state) => setDesk(state ?? 'unreachable'));
  }, [keeper]);

  useEffect(() => {
    if (keeper && desk === 'open') keptFiles(keeper).then(setFiles, () => undefined);
  }, [keeper, desk]);

  const wanted = fold(query.trim());
  const shown = useMemo(
    () =>
      [...BOOKS]
        .sort((a, b) => a.title.localeCompare(b.title))
        .filter((book) => (show === 'free' ? book.free : show === 'held' ? !book.free : show === 'file' ? files[book.id] : true))
        .filter((book) => !wanted || fold(`${book.title} ${book.author}`).includes(wanted)),
    [wanted, show, files, turn],
  );

  if (!keeper) {
    return (
      <div className="admin">
        <PageHeader />
        <main className="admin-closed">
          <SignIn held={!!card} />
        </main>
      </div>
    );
  }

  if (desk !== 'open') {
    return (
      <div className="admin">
        <PageHeader />
        <main className="admin-closed">
          {desk === 'asking' ? null : desk === 'unreachable' ? (
            <p>{tl(TEXT.noAnswer)}</p>
          ) : (
            <Door code={keeper} choosing={desk === 'unset'} onOpen={() => setDesk('open')} />
          )}
        </main>
      </div>
    );
  }

  const free = BOOKS.filter((book) => book.free).length;
  const keptBytes = Object.values(files).reduce((sum, file) => sum + file.bytes, 0);
  const setFile = (bookId: string, file: KeptFile | null) =>
    setFiles((before) => {
      const next = { ...before };
      if (file) next[bookId] = file;
      else delete next[bookId];
      return next;
    });

  return (
    <div className="admin">
      <PageHeader />
      <main className="admin-body">
        <h1>{tl(TEXT.title)}</h1>
        <p className="admin-count">
          {tl(TEXT.count).replace('{all}', String(BOOKS.length)).replace('{free}', String(free)).replace('{held}', String(BOOKS.length - free))}
          <br />
          {tl(TEXT.kept).replace('{n}', String(Object.keys(files).length)).replace('{size}', megabytes(keptBytes))}
        </p>
        <div className="admin-actions admin-lock">
          <button
            type="button"
            className="text-button"
            onClick={async () => {
              await lockDesk(keeper);
              setDesk('locked');
            }}
          >
            {tl(TEXT.lockNow)}
          </button>
          <button type="button" className="text-button" onClick={() => setChanging(!changing)} aria-expanded={changing}>
            {tl(TEXT.change)}
          </button>
          <button type="button" className="text-button" onClick={() => setProfiling(!profiling)} aria-expanded={profiling}>
            {tl(TEXT.profile)}
          </button>
          <button type="button" className="text-button" onClick={() => setAccounting(!accounting)} aria-expanded={accounting}>
            {tl(TEXT.accounts)}
          </button>
          <button type="button" className="text-button" onClick={() => setReviewing(!reviewing)} aria-expanded={reviewing}>
            {tl(TEXT.moods)}
          </button>
          <button type="button" className="text-button" onClick={() => setReading(!reading)} aria-expanded={reading}>
            {tl(TEXT.essays)}
          </button>
        </div>
        {reading && (
          <div className="admin-desk">
            <EssayDesk onClose={() => setReading(false)} />
          </div>
        )}
        {reviewing && (
          <div className="admin-desk">
            <MoodReview code={keeper} onClose={() => setReviewing(false)} />
          </div>
        )}
        {accounting && (
          <div className="admin-desk">
            <AccountsDesk code={keeper} onClose={() => setAccounting(false)} />
          </div>
        )}
        {profiling && (
          <div className="admin-desk">
            <ProfileForm code={keeper} onClose={() => setProfiling(false)} />
          </div>
        )}
        {changing && <Door code={keeper} choosing changingFrom onOpen={() => setChanging(false)} onCancel={() => setChanging(false)} />}

        <div className="admin-tools">
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tl(TEXT.search)} aria-label={tl(TEXT.search)} />
          <div className="admin-show" role="group">
            {(['all', 'free', 'held', 'file'] as const).map((id) => (
              <button key={id} type="button" className="text-button" aria-pressed={show === id} onClick={() => setShow(id)}>
                {tl(TEXT[id === 'file' ? 'withFile' : id])}
              </button>
            ))}
            <button type="button" className="button button-quiet admin-add" onClick={() => setAdding(true)} disabled={adding}>
              + {tl(TEXT.addBook)}
            </button>
          </div>
        </div>

        {adding && (
          <div className="admin-desk">
            <BookForm
              code={keeper}
              onCancel={() => setAdding(false)}
              onDone={(book) => {
                setAdding(false);
                setTurn(turn + 1);
                if (book) setOpen(book.id);
              }}
            />
          </div>
        )}

        <ul className="admin-list">
          {shown.map((book) => {
            const file = files[book.id];
            return (
              <li key={book.id} data-open={open === book.id || undefined}>
                <button type="button" className="admin-row" aria-expanded={open === book.id} onClick={() => setOpen(open === book.id ? null : book.id)}>
                  <strong>{book.title}</strong>
                  <span>
                    {book.author} · {book.year}
                  </span>
                  <small data-free={book.free ? '' : undefined}>{tl(book.added ? TEXT.addedByYou : book.free ? TEXT.free : TEXT.held)}</small>
                  <small>{file ? `${file.name} · ${tl(file.open ? TEXT.everyone : TEXT.yours)}` : ''}</small>
                </button>
                {open === book.id && (
                  <Desk
                    book={book}
                    code={keeper}
                    file={file}
                    setFile={(next) => setFile(book.id, next)}
                    onChanged={(next) => {
                      setTurn(turn + 1);
                      if (!next) setOpen(null);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}

function Desk({
  book,
  code,
  file,
  setFile,
  onChanged,
}: {
  book: Book;
  code: string;
  file: KeptFile | undefined;
  setFile: (file: KeptFile | null) => void;
  onChanged: (book: Book | null) => void;
}) {
  const { tl } = useI18n();
  // A book the keeper added is not in the catalogue's printed list; it is edited whole, in its own form.
  const first = printed(book.id) ?? { title: book.title, author: book.author, year: book.year, description: book.description };
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [year, setYear] = useState(String(book.year));
  const [en, setEn] = useState(book.description.en);
  const [fr, setFr] = useState(book.description.fr);
  const [state, setState] = useState<'saved' | 'failed' | null>(null);
  const [sending, setSending] = useState<number | null>(null);
  const [problem, setProblem] = useState<L | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const links = bookLinks(book);

  const save = async (edits: Edits) => setState((await decide(code, book.id, { edits })) ? 'saved' : 'failed');
  const submit = () => {
    // Only what differs from the catalogue is kept, so the rest follows it if it changes.
    const edits: Edits = {};
    if (title.trim() !== first.title) edits.title = title.trim();
    if (author.trim() !== first.author) edits.author = author.trim();
    if (Number(year) !== first.year) edits.year = Number(year);
    const description: NonNullable<Edits['description']> = {};
    if (en.trim() !== first.description.en) description.en = en.trim();
    if (fr.trim() !== first.description.fr) description.fr = fr.trim();
    if (description.en || description.fr) edits.description = description;
    void save(edits);
  };
  const reset = () => {
    setTitle(first.title);
    setAuthor(first.author);
    setYear(String(first.year));
    setEn(first.description.en);
    setFr(first.description.fr);
    void save({});
  };

  const send = async (chosen: File | undefined) => {
    if (!chosen) return;
    setProblem(null);
    if (!FILE_KINDS.test(chosen.name)) return setProblem(TEXT['bad-name']);
    if (chosen.size > MAX_FILE) return setProblem(TEXT['too-large']);
    setSending(0);
    try {
      setFile(await keepFile(code, book.id, chosen, setSending));
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      setProblem(reason === 'bad-name' || reason === 'too-large' || reason === 'shelf-full' ? TEXT[reason] : TEXT.fileFailed);
    }
    setSending(null);
  };

  return (
    <div className="admin-desk">
      {book.added ? (
        <BookForm key={`${book.id}-${book.coverAt}`} code={code} book={book} onCancel={() => onChanged(book)} onDone={onChanged} />
      ) : (
      <form
        className="admin-entry"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h2>{tl(TEXT.entry)}</h2>
        <label>
          {tl(TEXT.bookTitle)}
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required />
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
        <label>
          {tl(TEXT.descriptionEn)}
          <textarea value={en} onChange={(event) => setEn(event.target.value)} rows={4} maxLength={1200} required />
        </label>
        <label>
          {tl(TEXT.descriptionFr)}
          <textarea value={fr} onChange={(event) => setFr(event.target.value)} rows={4} maxLength={1200} required />
        </label>
        <div className="admin-actions">
          <button type="submit" className="button">
            {tl(TEXT.save)}
          </button>
          <button type="button" className="text-button" onClick={reset}>
            {tl(TEXT.reset)}
          </button>
          <a className="text-link" href={bookUrl(book.id)}>
            {tl(TEXT.open)} →
          </a>
        </div>
        {state && <p className={state === 'saved' ? 'card-note' : 'card-problem'}>{tl(TEXT[state])}</p>}
      </form>
      )}

      <div className="admin-side">
        <section className="admin-file">
          <h2>{tl(TEXT.file)}</h2>
          <p className="card-note">{tl(book.free ? TEXT.fileFree : TEXT.fileHeld)}</p>
          {file && (
            <p className="admin-kept">
              <strong>{file.name}</strong>
              <small>
                {megabytes(file.bytes)} · {tl(file.open ? TEXT.everyone : TEXT.yours)}
              </small>
            </p>
          )}
          {file && (
            <label className="check">
              <input type="checkbox" checked={!!file.open} onChange={async (event) => setFile((await openFile(code, book.id, file, event.target.checked)) ?? file)} />
              {tl(TEXT.openToAll)}
            </label>
          )}
          <div className="admin-actions">
            <button type="button" className="button button-quiet" disabled={sending !== null} onClick={() => fileRef.current?.click()}>
              {sending !== null ? tl(TEXT.sending).replace('{n}', String(Math.round(sending * 100))) : tl(file ? TEXT.replace : TEXT.choose)}
            </button>
            {file && sending === null && (
              <>
                <button type="button" className="text-button" onClick={() => void saveFile(book.id, file, code)}>
                  {tl(TEXT.download)}
                </button>
                {reads(file) && (
                  <a className="text-link" href={`${pageUrl('')}read/${book.id}`}>
                    {tl(TEXT.read)}
                  </a>
                )}
                <button type="button" className="text-button" onClick={async () => (await dropFile(code, book.id)) && setFile(null)}>
                  {tl(TEXT.remove)}
                </button>
              </>
            )}
            <input ref={fileRef} type="file" accept=".epub,.pdf,.txt,.mobi,.azw3" hidden onChange={(event) => void send(event.target.files?.[0])} />
          </div>
          <p className="card-note">{tl(TEXT.kinds)}</p>
          {problem && <p className="card-problem">{tl(problem)}</p>}
          {links.pdf && (
            <p className="card-note">
              {tl(TEXT.pdf)} · {megabytes(links.pdfBytes)}
            </p>
          )}
        </section>
        <Keeper bookId={book.id} hasPdf={!!links.pdf} />
      </div>
    </div>
  );
}
