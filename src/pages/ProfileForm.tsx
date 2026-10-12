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
  title: { en: 'Your profile', fr: 'Votre profil' },
  note: {
    en: 'This is the page “About”, and the name in “Developed by …”. Write it in the language you want it read in.',
    fr: 'C’est la page « À propos », et le nom dans « Développé par … ». Écrivez-la dans la langue où vous voulez qu’elle soit lue.',
  },
  name: { en: 'Name', fr: 'Nom' },
  line: { en: 'One line under your name', fr: 'Une ligne sous votre nom' },
  why: { en: 'Why you made the site', fr: 'Pourquoi vous avez fait le site' },
  about: { en: 'About you (may be left empty)', fr: 'À propos de vous (peut rester vide)' },
  paragraphs: { en: 'Leave an empty line between paragraphs.', fr: 'Laissez une ligne vide entre les paragraphes.' },
  links: { en: 'Links', fr: 'Liens' },
  linksNote: {
    en: 'One to a line: a name, then the address. For example “GitHub https://github.com/…” or “Email mailto:you@example.com”.',
    fr: 'Un par ligne : un nom, puis l’adresse. Par exemple « GitHub https://github.com/… » ou « Email mailto:vous@exemple.com ».',
  },
  portrait: { en: 'Portrait', fr: 'Portrait' },
  portraitNote: { en: 'Any picture. It is cut to a square and shown as a circle.', fr: 'N’importe quelle image. Elle est coupée au carré et montrée en cercle.' },
  noPortrait: { en: 'No portrait yet.', fr: 'Pas encore de portrait.' },
  takeDown: { en: 'Take the portrait down', fr: 'Retirer le portrait' },
  save: { en: 'Save the profile', fr: 'Enregistrer le profil' },
  saving: { en: 'Saving…', fr: 'Enregistrement…' },
  saved: { en: 'Saved.', fr: 'Enregistré.' },
  failed: { en: 'It could not be saved. Check the name, then try again.', fr: 'Enregistrement impossible. Vérifiez le nom, puis réessayez.' },
  see: { en: 'See the page', fr: 'Voir la page' },
  close: { en: 'Close', fr: 'Fermer' },
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
