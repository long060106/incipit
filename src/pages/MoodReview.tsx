import { useMemo, useState } from 'react';
import { BOOKS } from '../data/books';
import type { Book, L, Mood } from '../data/types';
import { AXES } from '../data/vocab';
import { useI18n } from '../i18n';
import { decide, printed, useDecided } from '../lib/keeper';
import { bookUrl, coverUrl } from '../lib/links';

/*
  Looking the catalogue over, at the keeper's desk: the mood of each book on its five axes,
  to move where they are wrong, and a mark once a book has been looked at. The books not yet
  looked at come first. What is saved here is the keeper's correction (src/lib/keeper.ts),
  shown to every reader and used by the wall's sliders.
*/

const TEXT = {
  title: { en: 'Look the moods over', fr: 'Revoir les ambiances', ru: 'Просмотреть настроения', vi: 'Xem lại các tâm trạng' },
  note: {
    en: 'Move a slider where a book’s mood is wrong, then mark it looked over. The books not yet looked over come first.',
    fr: 'Déplacez un curseur là où l’ambiance d’un livre est fausse, puis marquez-le comme revu. Les livres pas encore revus viennent en premier.',
    ru: 'Сдвиньте ползунок там, где настроение книги неверно, затем отметьте её как просмотренную. Непросмотренные книги идут первыми.',
    vi: 'Kéo một thanh nếu tâm trạng của sách chưa đúng, rồi đánh dấu là đã xem. Những cuốn chưa xem đứng trước.',
  },
  progress: { en: '{done} of {all} looked over', fr: '{done} sur {all} revus', ru: 'Просмотрено: {done} из {all}', vi: 'Đã xem {done} trên {all}' },
  onlyLeft: { en: 'Only those not yet looked over', fr: 'Seulement ceux pas encore revus', ru: 'Только непросмотренные', vi: 'Chỉ những cuốn chưa xem' },
  save: { en: 'Save, looked over', fr: 'Enregistrer, revu', ru: 'Сохранить как просмотренную', vi: 'Lưu, đã xem' },
  saved: { en: 'Looked over', fr: 'Revu', ru: 'Просмотрено', vi: 'Đã xem' },
  back: { en: 'Back to the catalogue’s', fr: 'Revenir à celle du catalogue', ru: 'Вернуть настроение каталога', vi: 'Trở về tâm trạng của danh mục' },
  failed: { en: 'Not saved. Is the desk still open?', fr: 'Non enregistré. Le bureau est-il encore ouvert ?', ru: 'Не сохранено. Стол ещё открыт?', vi: 'Chưa lưu được. Bàn làm việc còn mở không?' },
  more: { en: 'Show more', fr: 'Afficher plus', ru: 'Показать ещё', vi: 'Xem thêm' },
  done: { en: 'Every book has been looked over.', fr: 'Tous les livres ont été revus.', ru: 'Все книги просмотрены.', vi: 'Mọi cuốn sách đều đã được xem.' },
  close: { en: 'Close', fr: 'Fermer', ru: 'Закрыть', vi: 'Đóng' },
  open: { en: 'Open its page', fr: 'Ouvrir sa page', ru: 'Открыть его страницу', vi: 'Mở trang của bài' },
} satisfies Record<string, L>;

const STEP = 20;

export function MoodReview({ code, onClose }: { code: string; onClose: () => void }) {
  const { tl } = useI18n();
  const decided = useDecided();
  const [onlyLeft, setOnlyLeft] = useState(true);
  const [shown, setShown] = useState(STEP);
  const looked = (book: Book) => !!decided[book.id]?.edits?.reviewed;
  const done = BOOKS.filter(looked).length;
  // The order is fixed when the list opens, so a book just marked does not jump away under the pointer.
  const order = useMemo(() => [...BOOKS].sort((a, b) => Number(looked(a)) - Number(looked(b))), [onlyLeft]); // eslint-disable-line react-hooks/exhaustive-deps
  const [marked] = useState(() => new Set<string>());
  const list = order.filter((book) => !onlyLeft || !looked(book) || marked.has(book.id));

  return (
    <div className="mood-review">
      <h2>{tl(TEXT.title)}</h2>
      <p className="card-note">{tl(TEXT.note)}</p>
      <div className="mood-review-bar">
        <span>{tl(TEXT.progress).replace('{done}', String(done)).replace('{all}', String(BOOKS.length))}</span>
        <label>
          <input type="checkbox" checked={onlyLeft} onChange={(event) => setOnlyLeft(event.target.checked)} /> {tl(TEXT.onlyLeft)}
        </label>
      </div>
      {list.length === 0 && <p className="card-note">{tl(TEXT.done)}</p>}
      <ul>
        {list.slice(0, shown).map((book) => (
          <MoodRow key={book.id} book={book} code={code} looked={looked(book)} onSaved={() => marked.add(book.id)} />
        ))}
      </ul>
      <div className="admin-actions">
        {list.length > shown && (
          <button type="button" className="text-button" onClick={() => setShown(shown + STEP)}>
            {tl(TEXT.more)}
          </button>
        )}
        <button type="button" className="text-button" onClick={onClose}>
          {tl(TEXT.close)}
        </button>
      </div>
    </div>
  );
}

function MoodRow({ book, code, looked, onSaved }: { book: Book; code: string; looked: boolean; onSaved: () => void }) {
  const { tl } = useI18n();
  const decided = useDecided()[book.id];
  const [mood, setMood] = useState<Mood>(() => ({ ...book.mood }));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const first = printed(book.id)?.mood;
  const moved = JSON.stringify(mood) !== JSON.stringify(book.mood);

  const save = async (next: Mood | null) => {
    setBusy(true);
    setFailed(false);
    const edits = { ...(decided?.edits ?? {}), reviewed: true };
    if (next && JSON.stringify(next) !== JSON.stringify(first)) edits.mood = next;
    else delete edits.mood;
    // Kept in the list while it is saved, so that it does not vanish from under the pointer.
    onSaved();
    const ok = await decide(code, book.id, { edits });
    setBusy(false);
    setFailed(!ok);
    if (ok && !next && first) setMood({ ...first });
  };

  return (
    <li className="mood-review-row" data-looked={looked || undefined}>
      <img src={coverUrl(book, 'sm')} alt="" loading="lazy" />
      <div>
        <p className="mood-review-name">
          <a href={bookUrl(book.id)} target="_blank" rel="noopener" title={tl(TEXT.open)}>
            {book.title}
          </a>{' '}
          <span>
            {book.author}, {book.year}
          </span>
        </p>
        <ul className="mood-profile review-mood">
          {AXES.map((axis) => (
            <li key={axis.id}>
              <span>{tl(axis.low)}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={mood[axis.id]}
                aria-label={`${book.title}: ${tl(axis.low)} – ${tl(axis.high)}`}
                onChange={(event) => setMood({ ...mood, [axis.id]: Number(event.target.value) })}
              />
              <span>{tl(axis.high)}</span>
              <output>{mood[axis.id]}</output>
            </li>
          ))}
        </ul>
        <div className="card-actions">
          <button type="button" className="button" disabled={busy || (looked && !moved)} onClick={() => void save(mood)}>
            {looked && !moved ? `✓ ${tl(TEXT.saved)}` : tl(TEXT.save)}
          </button>
          {decided?.edits?.mood && (
            <button type="button" className="text-button" disabled={busy} onClick={() => void save(null)}>
              {tl(TEXT.back)}
            </button>
          )}
          {failed && <span className="card-problem">{tl(TEXT.failed)}</span>}
        </div>
      </div>
    </li>
  );
}
