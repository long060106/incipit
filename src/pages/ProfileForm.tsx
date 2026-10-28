import { useEffect, useState } from 'react';
import type { L } from '../data/types';
import { useI18n } from '../i18n';
import { dropPortrait, keepPortrait, portraitUrl, useProfile, writeProfile } from '../lib/profile';
import { pageUrl } from './PageHeader';

/*
  The keeper's own page, written from the desk (/admin): the name, the line under it, why the
  site was made, a word about its maker, links, and a portrait. What is saved here is what
  /about shows, and the name is the one in the site's line of credit.
*/

const TEXT = {
  title: { en: 'Your profile', fr: 'Votre profil', ru: 'Ваш профиль', vi: 'Hồ sơ của bạn' },
  note: {
    en: 'This is the page “About”, and the name in “Developed by …”. Write it in the language you want it read in.',
    fr: 'C’est la page « À propos », et le nom dans « Développé par … ». Écrivez-la dans la langue où vous voulez qu’elle soit lue.',
    ru: 'Это страница «О сайте» и имя в строке «Разработчик …». Пишите на том языке, на котором хотите, чтобы её читали.',
    vi: 'Đây là trang “Giới thiệu”, và cái tên trong dòng “Phát triển bởi …”. Hãy viết bằng ngôn ngữ bạn muốn người ta đọc.',
  },
  name: { en: 'Name', fr: 'Nom', ru: 'Имя', vi: 'Tên' },
  line: { en: 'One line under your name', fr: 'Une ligne sous votre nom', ru: 'Одна строка под вашим именем', vi: 'Một dòng dưới tên bạn' },
  why: { en: 'Why you made the site', fr: 'Pourquoi vous avez fait le site', ru: 'Почему появился сайт', vi: 'Vì sao bạn làm trang này' },
  about: { en: 'About you (may be left empty)', fr: 'À propos de vous (peut rester vide)', ru: 'О себе (можно оставить пустым)', vi: 'Về bạn (có thể để trống)' },
  paragraphs: { en: 'Leave an empty line between paragraphs.', fr: 'Laissez une ligne vide entre les paragraphes.', ru: 'Оставляйте пустую строку между абзацами.', vi: 'Để một dòng trống giữa các đoạn.' },
  links: { en: 'Links', fr: 'Liens', ru: 'Ссылки', vi: 'Liên kết' },
  linksNote: {
    en: 'One to a line: a name, then the address. For example “GitHub https://github.com/…” or “Email mailto:you@example.com”.',
    fr: 'Un par ligne : un nom, puis l’adresse. Par exemple « GitHub https://github.com/… » ou « Email mailto:vous@exemple.com ».',
    ru: 'По одной на строку: название, затем адрес. Например, «GitHub https://github.com/…» или «Email mailto:you@example.com».',
    vi: 'Mỗi dòng một liên kết: tên, rồi địa chỉ. Ví dụ “GitHub https://github.com/…” hoặc “Email mailto:you@example.com”.',
  },
  portrait: { en: 'Portrait', fr: 'Portrait', ru: 'Портрет', vi: 'Ảnh chân dung' },
  portraitNote: { en: 'Any picture. It is cut to a square and shown as a circle.', fr: 'N’importe quelle image. Elle est coupée au carré et montrée en cercle.', ru: 'Любая картинка. Она обрезается до квадрата и показывается кругом.', vi: 'Ảnh bất kỳ. Ảnh được cắt vuông và hiện thành hình tròn.' },
  noPortrait: { en: 'No portrait yet.', fr: 'Pas encore de portrait.', ru: 'Портрета пока нет.', vi: 'Chưa có ảnh chân dung.' },
  takeDown: { en: 'Take the portrait down', fr: 'Retirer le portrait', ru: 'Убрать портрет', vi: 'Gỡ ảnh chân dung' },
  save: { en: 'Save the profile', fr: 'Enregistrer le profil', ru: 'Сохранить профиль', vi: 'Lưu hồ sơ' },
  saving: { en: 'Saving…', fr: 'Enregistrement…', ru: 'Сохранение…', vi: 'Đang lưu…' },
  saved: { en: 'Saved.', fr: 'Enregistré.', ru: 'Сохранено.', vi: 'Đã lưu.' },
  failed: { en: 'It could not be saved. Check the name, then try again.', fr: 'Enregistrement impossible. Vérifiez le nom, puis réessayez.', ru: 'Не удалось сохранить. Проверьте имя и попробуйте снова.', vi: 'Không lưu được. Hãy kiểm tra tên rồi thử lại.' },
  see: { en: 'See the page', fr: 'Voir la page', ru: 'Посмотреть страницу', vi: 'Xem trang' },
  close: { en: 'Close', fr: 'Fermer', ru: 'Закрыть', vi: 'Đóng' },
} satisfies Record<string, L>;

/** "GitHub https://…" a line: the address is the last word, the name whatever comes before. */
const linksFrom = (text: string) =>
  text
    .split('\n')
    .map((row) => row.trim().match(/^(.*?)\s*((?:https:\/\/|mailto:)\S+)$/i))
    .filter((found): found is RegExpMatchArray => !!found)
    .map(([, label, url]) => ({ label: label.trim() || url.replace(/^(https:\/\/|mailto:)/i, '').replace(/\/$/, ''), url }));

export function ProfileForm({ code, onClose }: { code: string; onClose: () => void }) {
  const { tl } = useI18n();
  const [shown, setShown] = useProfile();
  const [name, setName] = useState(shown.profile.name);
  const [line, setLine] = useState(shown.profile.line);
  const [why, setWhy] = useState(shown.profile.why);
  const [about, setAbout] = useState(shown.profile.about);
  const [links, setLinks] = useState(shown.profile.links.map((link) => `${link.label} ${link.url}`).join('\n'));
  const [picture, setPicture] = useState<File | null>(null);
  const [touched, setTouched] = useState(false);
  const [state, setState] = useState<'saving' | 'saved' | 'failed' | null>(null);

  // What the server holds arrives a moment after the form opens: it fills the form unless the keeper has begun to write.
  useEffect(() => {
    if (touched) return;
    setName(shown.profile.name);
    setLine(shown.profile.line);
    setWhy(shown.profile.why);
    setAbout(shown.profile.about);
    setLinks(shown.profile.links.map((link) => `${link.label} ${link.url}`).join('\n'));
  }, [shown, touched]);

  const write =
    (set: (value: string) => void) =>
    (event: { target: { value: string } }) => {
      setTouched(true);
      setState(null);
      set(event.target.value);
    };

  const save = async () => {
    setState('saving');
    try {
      const profile = await writeProfile(code, { name, line, why, about, links: linksFrom(links) });
      if (!profile) throw new Error('refused');
      let portraitAt = shown.portraitAt;
      if (picture) {
        const kept = await keepPortrait(code, picture);
        if (!kept) throw new Error('refused');
        portraitAt = kept;
        setPicture(null);
      }
      setTouched(false);
      setShown({ profile, portraitAt });
      setState('saved');
    } catch {
      setState('failed');
    }
  };

  const takeDown = async () => {
    if (await dropPortrait(code)) setShown({ ...shown, portraitAt: 0 });
    else setState('failed');
  };

  return (
    <form
      className="admin-entry admin-profile"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2>{tl(TEXT.title)}</h2>
      <p className="card-note">{tl(TEXT.note)}</p>
      <div className="admin-pair">
        <label>
          {tl(TEXT.name)}
          <input value={name} onChange={write(setName)} maxLength={80} required />
        </label>
        <label>
          {tl(TEXT.line)}
          <input value={line} onChange={write(setLine)} maxLength={160} />
        </label>
      </div>
      <label>
        {tl(TEXT.why)}
        <textarea value={why} onChange={write(setWhy)} rows={9} maxLength={6000} />
      </label>
      <label>
        {tl(TEXT.about)}
        <textarea value={about} onChange={write(setAbout)} rows={5} maxLength={6000} />
      </label>
      <p className="card-note">{tl(TEXT.paragraphs)}</p>
      <label>
        {tl(TEXT.links)}
        <textarea value={links} onChange={write(setLinks)} rows={3} spellCheck={false} />
      </label>
      <p className="card-note">{tl(TEXT.linksNote)}</p>
      <div className="admin-portrait">
        {shown.portraitAt > 0 ? <img src={portraitUrl(shown.portraitAt)} alt="" width={96} height={96} /> : <span className="card-note">{tl(TEXT.noPortrait)}</span>}
        <label>
          {tl(TEXT.portrait)}
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              setPicture(event.target.files?.[0] ?? null);
              setState(null);
            }}
          />
        </label>
      </div>
      <p className="card-note">{tl(TEXT.portraitNote)}</p>
      <div className="admin-actions">
        <button type="submit" className="button" disabled={state === 'saving' || !name.trim()}>
          {tl(state === 'saving' ? TEXT.saving : TEXT.save)}
        </button>
        {shown.portraitAt > 0 && (
          <button type="button" className="text-button" onClick={() => void takeDown()}>
            {tl(TEXT.takeDown)}
          </button>
        )}
        <a className="text-link" href={pageUrl('about')} target="_blank" rel="noopener">
          {tl(TEXT.see)}
        </a>
        <button type="button" className="text-button" onClick={onClose}>
          {tl(TEXT.close)}
        </button>
        {state === 'saved' && <span className="card-note">{tl(TEXT.saved)}</span>}
        {state === 'failed' && <span className="card-problem">{tl(TEXT.failed)}</span>}
      </div>
    </form>
  );
}
