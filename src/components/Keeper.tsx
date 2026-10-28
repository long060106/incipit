import { useState } from 'react';
import type { L } from '../data/types';
import { useI18n } from '../i18n';
import { useCard } from '../lib/card';
import { decide, deskKey, useDecided } from '../lib/keeper';

/*
  The keeper's own corner of a book's sheet, shown only to the card whose role is 'admin':
  switching the download on or off, and listing articles beside the book.
*/

const TEXT = {
  title: { en: 'Keeper', fr: 'Gardien', ru: 'Хранитель', vi: 'Người giữ sách' },
  note: { en: 'Only you see this. Changes show for every reader at once.', fr: 'Vous seul voyez ceci. Les changements valent aussitôt pour tous les lecteurs.', ru: 'Это видите только вы. Изменения сразу видны всем читателям.', vi: 'Chỉ bạn thấy phần này. Thay đổi hiện ngay cho mọi bạn đọc.' },
  download: { en: 'Offer the PDF download', fr: 'Proposer le téléchargement du PDF', ru: 'Предлагать скачать PDF', vi: 'Cho tải bản PDF' },
  articles: { en: 'Articles beside this book', fr: 'Articles autour de ce livre', ru: 'Статьи рядом с этой книгой', vi: 'Bài viết bên cạnh cuốn sách này' },
  articleTitle: { en: 'Title of the article', fr: 'Titre de l’article', ru: 'Название статьи', vi: 'Tên bài viết' },
  articleUrl: { en: 'https://…', fr: 'https://…', ru: 'https://…', vi: 'https://…' },
  add: { en: 'Add', fr: 'Ajouter', ru: 'Добавить', vi: 'Thêm' },
  remove: { en: 'Remove', fr: 'Retirer', ru: 'Убрать', vi: 'Gỡ' },
  failed: { en: 'Not saved. Check the address and try again.', fr: 'Non enregistré. Vérifiez l’adresse et réessayez.', ru: 'Не сохранено. Проверьте адрес и попробуйте снова.', vi: 'Chưa lưu được. Hãy kiểm tra địa chỉ rồi thử lại.' },
  locked: { en: 'The desk is locked. Changing a book needs its password.', fr: 'Le bureau est verrouillé. Modifier un livre demande son mot de passe.', ru: 'Стол заперт. Чтобы изменить книгу, нужен пароль.', vi: 'Bàn làm việc đang khóa. Muốn sửa sách cần có mật khẩu.' },
  unlock: { en: 'Unlock the desk', fr: 'Déverrouiller le bureau', ru: 'Открыть стол', vi: 'Mở khóa bàn làm việc' },
} satisfies Record<string, L>;

export function Keeper({ bookId, hasPdf }: { bookId: string; hasPdf: boolean }) {
  const { tl } = useI18n();
  const { card } = useCard();
  const decided = useDecided()[bookId];
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);

  if (card?.role !== 'admin') return null;
  // The keeper's card is not enough: the desk must have been opened with its password in this tab.
  if (!deskKey()) {
    return (
      <section className="sheet-section keeper">
        <h2>{tl(TEXT.title)}</h2>
        <p className="around-note">
          {tl(TEXT.locked)}{' '}
          <a className="text-link" href={`${import.meta.env.BASE_URL}admin`}>
            {tl(TEXT.unlock)} →
          </a>
        </p>
      </section>
    );
  }
  const articles = decided?.articles ?? [];
  const save = async (change: Parameters<typeof decide>[2]) => {
    const taken = await decide(card.code, bookId, change);
    setFailed(!taken);
    return taken;
  };

  return (
    <section className="sheet-section keeper">
      <h2>{tl(TEXT.title)}</h2>
      <p className="around-note">{tl(TEXT.note)}</p>
      {hasPdf && (
        <label className="check">
          <input type="checkbox" checked={decided?.download ?? true} onChange={(event) => void save({ download: event.target.checked })} />
          {tl(TEXT.download)}
        </label>
      )}
      <h3>{tl(TEXT.articles)}</h3>
      {articles.length > 0 && (
        <ul className="keeper-articles">
          {articles.map((article, at) => (
            <li key={`${article.url}-${at}`}>
              <span>{article.title}</span>
              <button type="button" className="text-button" onClick={() => void save({ articles: articles.filter((_, index) => index !== at) })}>
                {tl(TEXT.remove)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="keeper-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await save({ articles: [...articles, { title: title.trim(), url: url.trim() }] })) {
            setTitle('');
            setUrl('');
          }
        }}
      >
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={tl(TEXT.articleTitle)} aria-label={tl(TEXT.articleTitle)} maxLength={160} />
        <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder={tl(TEXT.articleUrl)} aria-label="URL" type="url" maxLength={500} />
        <button type="submit" className="button button-quiet" disabled={!title.trim() || !/^https?:\/\/\S+$/i.test(url.trim())}>
          {tl(TEXT.add)}
        </button>
      </form>
      {failed && <p className="keeper-problem">{tl(TEXT.failed)}</p>}
    </section>
  );
}
