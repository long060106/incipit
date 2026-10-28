import { useEffect, useState } from 'react';
import type { Book, L, Mood } from '../data/types';
import { AXES } from '../data/vocab';
import { useI18n } from '../i18n';
import { useCard } from '../lib/card';
import { personUrl } from '../lib/people';
import type { Mine, Problem, Said } from '../lib/reviews';
import { pageUrl } from '../pages/PageHeader';
import { Avatar } from './Avatar';

/*
  What readers say, on a book's page (BookSheet.tsx): the reader's own stars, how the book
  felt to them and a few words, then what the others wrote, newest first. The words of
  others come in by themselves while the page is open (src/lib/reviews.ts).
*/

const TEXT = {
  title: { en: 'Readers', fr: 'Lecteurs', ru: 'Читатели', vi: 'Bạn đọc' },
  average: { en: '{stars} from {n} readers here', fr: '{stars} par {n} lecteurs ici', ru: '{stars} · оценок читателей здесь: {n}', vi: '{stars} từ {n} bạn đọc ở đây' },
  averageOne: { en: '{stars} from one reader here', fr: '{stars} par un lecteur ici', ru: '{stars} · оценка одного читателя здесь', vi: '{stars} từ một bạn đọc ở đây' },
  none: { en: 'No reader has said anything of this book yet.', fr: 'Aucun lecteur n’a encore rien dit de ce livre.', ru: 'Об этой книге читатели пока ничего не сказали.', vi: 'Chưa có bạn đọc nào nói gì về cuốn sách này.' },
  yours: { en: 'Your review', fr: 'Votre avis', ru: 'Ваш отзыв', vi: 'Cảm nhận của bạn' },
  stars: { en: '{n} of 5 stars', fr: '{n} étoiles sur 5', ru: '{n} из 5 звёзд', vi: '{n} trên 5 sao' },
  felt: { en: 'How it felt to you', fr: 'Comment vous l’avez ressenti', ru: 'Какой она показалась вам', vi: 'Bạn thấy cuốn sách thế nào' },
  feltNote: { en: 'Move any of these to add your feeling to the book’s mood.', fr: 'Déplacez l’un de ces curseurs pour ajouter votre ressenti à l’ambiance du livre.', ru: 'Сдвиньте любой из ползунков, чтобы добавить своё ощущение к настроению книги.', vi: 'Kéo bất kỳ thanh nào để góp cảm nhận của bạn vào sắc thái của cuốn sách.' },
  words: { en: 'A few words (optional)', fr: 'Quelques mots (facultatif)', ru: 'Несколько слов (необязательно)', vi: 'Vài dòng (không bắt buộc)' },
  post: { en: 'Post', fr: 'Publier', ru: 'Опубликовать', vi: 'Đăng' },
  update: { en: 'Update', fr: 'Mettre à jour', ru: 'Обновить', vi: 'Cập nhật' },
  posted: { en: 'Posted.', fr: 'Publié.', ru: 'Опубликовано.', vi: 'Đã đăng.' },
  takeBack: { en: 'Take my review back', fr: 'Retirer mon avis', ru: 'Забрать мой отзыв', vi: 'Rút lại cảm nhận của tôi' },
  signIn: { en: 'Sign in or create an account to rate this book and say what you thought.', fr: 'Connectez-vous ou créez un compte pour noter ce livre et dire ce que vous en pensez.', ru: 'Войдите или создайте аккаунт, чтобы оценить эту книгу и сказать, что вы о ней думаете.', vi: 'Đăng nhập hoặc tạo tài khoản để chấm điểm cuốn sách này và nói bạn nghĩ gì.' },
  signInLink: { en: 'Sign in', fr: 'Se connecter', ru: 'Войти', vi: 'Đăng nhập' },
  you: { en: 'you', fr: 'vous', ru: 'вы', vi: 'bạn' },
  takeDown: { en: 'Take down', fr: 'Retirer', ru: 'Снять', vi: 'Gỡ xuống' },
  'needs-account': { en: 'Only a reader with an account can write here.', fr: 'Seul un lecteur avec un compte peut écrire ici.', ru: 'Писать здесь может только читатель с аккаунтом.', vi: 'Chỉ bạn đọc có tài khoản mới viết được ở đây.' },
  'too-long': { en: 'That is longer than 1,000 characters.', fr: 'C’est plus long que 1 000 caractères.', ru: 'Это длиннее 1000 знаков.', vi: 'Đoạn này dài hơn 1.000 ký tự.' },
  'too-many': { en: 'Too many changes today. Come back tomorrow.', fr: 'Trop de changements aujourd’hui. Revenez demain.', ru: 'Слишком много изменений за сегодня. Возвращайтесь завтра.', vi: 'Hôm nay đã sửa quá nhiều lần. Mai bạn quay lại nhé.' },
  offline: { en: 'The server could not be reached. Try again in a moment.', fr: 'Le serveur est injoignable. Réessayez dans un instant.', ru: 'Сервер недоступен. Попробуйте ещё раз чуть позже.', vi: 'Không kết nối được máy chủ. Thử lại sau giây lát.' },
  locked: { en: 'Open the keeper’s desk first.', fr: 'Ouvrez d’abord le bureau du gardien.', ru: 'Сначала откройте стол хранителя.', vi: 'Hãy mở bàn của người giữ sách trước.' },
} satisfies Record<string, L>;

const MOST = 1000;

interface ReadersProps {
  book: Book;
  said: Said | null;
  /** The book's mood as it is shown, readers counted in: where the sliders start. */
  mood: Mood;
  save: (review: Mine) => Promise<Problem | null>;
  remove: () => Promise<Problem | null>;
  takeDown: (name: string) => Promise<Problem | null>;
}

const Stars = ({ n }: { n: number }) => (
  <span className="review-stars" aria-hidden="true">
    {'★'.repeat(n)}
    <span>{'★'.repeat(5 - n)}</span>
  </span>
);

export function Readers({ book, said, mood, save, remove, takeDown }: ReadersProps) {
  const { tl, lang } = useI18n();
  const { card: mine } = useCard();
  const own = said?.mine ?? null;
  const [stars, setStars] = useState<number | null>(null);
  const [felt, setFelt] = useState<Mood | null>(null);
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [posted, setPosted] = useState(false);

  // The form starts from what the reader said before, once it has arrived.
  const ownKey = own ? `${own.stars}|${own.text}|${JSON.stringify(own.mood)}` : '';
  useEffect(() => {
    setStars(own?.stars ?? null);
    setFelt(own?.mood ?? null);
    setWords(own?.text ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, ownKey]);

  const summary = said?.summary;
  const number = (value: number) => value.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const named = !!mine?.name;
  const changed = stars !== (own?.stars ?? null) || words.trim() !== (own?.text ?? '') || JSON.stringify(felt) !== JSON.stringify(own?.mood ?? null);

  const post = async () => {
    setBusy(true);
    setProblem(null);
    const answer = await save({ stars, mood: felt, text: words.trim() || null });
    setBusy(false);
    setProblem(answer);
    setPosted(!answer);
  };

  return (
    <section className="sheet-section readers" aria-labelledby="readers-title">
      <h2 id="readers-title">{tl(TEXT.title)}</h2>
      {summary?.stars ? (
        <p className="readers-average">
          <Stars n={Math.round(summary.stars)} />{' '}
          {tl(summary.starsN === 1 ? TEXT.averageOne : TEXT.average)
            .replace('{stars}', number(summary.stars))
            .replace('{n}', String(summary.starsN))}
        </p>
      ) : (
        said && !said.reviews.length && <p className="readers-average">{tl(TEXT.none)}</p>
      )}

      {named ? (
        <form
          className="review-form"
          onSubmit={(event) => {
            event.preventDefault();
            void post();
          }}
        >
          <p className="review-label">{tl(TEXT.yours)}</p>
          <div className="review-pick" role="radiogroup" aria-label={tl(TEXT.yours)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={tl(TEXT.stars).replace('{n}', String(n))}
                className={stars !== null && n <= stars ? 'is-on' : ''}
                onClick={() => {
                  setStars(stars === n ? null : n);
                  setPosted(false);
                }}
              >
                ★
              </button>
            ))}
          </div>

          <details className="review-felt" open={!!felt}>
            <summary>{tl(TEXT.felt)}</summary>
            <p className="card-note">{tl(TEXT.feltNote)}</p>
            <ul className="mood-profile review-mood">
              {AXES.map((axis) => (
                <li key={axis.id}>
                  <span>{tl(axis.low)}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={(felt ?? mood)[axis.id]}
                    aria-label={`${tl(axis.low)} – ${tl(axis.high)}`}
                    onChange={(event) => {
                      setFelt({ ...(felt ?? mood), [axis.id]: Number(event.target.value) });
                      setPosted(false);
                    }}
                  />
                  <span>{tl(axis.high)}</span>
                </li>
              ))}
            </ul>
          </details>

          <label className="review-words">
            {tl(TEXT.words)}
            <textarea
              value={words}
              onChange={(event) => {
                setWords(event.target.value.slice(0, MOST));
                setPosted(false);
              }}
              rows={3}
              maxLength={MOST}
            />
            {words.length > MOST * 0.8 && <small>{MOST - words.length}</small>}
          </label>

          <div className="card-actions">
            <button type="submit" className="button" disabled={busy || !changed || (stars === null && !felt && !words.trim())}>
              {tl(own ? TEXT.update : TEXT.post)}
            </button>
            {own && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setProblem(await remove());
                  setBusy(false);
                  setPosted(false);
                }}
              >
                {tl(TEXT.takeBack)}
              </button>
            )}
            {posted && !changed && <span className="card-note">{tl(TEXT.posted)}</span>}
          </div>
          {problem && <p className="card-problem">{tl(TEXT[problem])}</p>}
        </form>
      ) : (
        <p className="readers-sign-in">
          {tl(TEXT.signIn)}{' '}
          <a className="text-link" href={`${pageUrl('signin')}?next=${encodeURIComponent(location.pathname)}`}>
            {tl(TEXT.signInLink)} →
          </a>
        </p>
      )}

      {!!said?.reviews.length && (
        <ul className="reviews">
          {said.reviews.map((review) => (
            <li key={`${review.name}-${review.changed}`}>
              <p className="review-head">
                <a className="review-name" href={personUrl(review.name)}>
                  <Avatar name={review.name} tone={review.tone} size="sm" />
                  <span>{review.name}</span>
                  {review.mine && <small> · {tl(TEXT.you)}</small>}
                </a>
                {review.stars && <Stars n={review.stars} />}
                <time dateTime={new Date(review.changed).toISOString()}>{new Date(review.changed).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })}</time>
                {mine?.role === 'admin' && !review.mine && (
                  <button type="button" className="text-button" onClick={async () => setProblem(await takeDown(review.name))}>
                    {tl(TEXT.takeDown)}
                  </button>
                )}
              </p>
              <p className="review-text">{review.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
