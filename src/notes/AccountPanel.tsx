import { useEffect, useRef, useState } from 'react';
import type { L } from '../data/types';
import { useI18n } from '../i18n';
import { card, useCard } from '../lib/card';

/*
  The account, above the library card at the foot of the notebook's list: a name and a
  password in front of the card (src/lib/card.ts), so that a reader opens their notebook on
  any device without the card's long code. Creating one, signing in, changing the password,
  signing out.
*/

const TEXT = {
  title: { en: 'Account', fr: 'Compte' },
  none: {
    en: 'Your notebook is kept in this browser only. With an account it is kept safe, and opens on your other devices with a name and a password.',
    fr: 'Votre carnet n’est conservé que dans ce navigateur. Avec un compte, il est gardé en lieu sûr et s’ouvre sur vos autres appareils avec un nom et un mot de passe.',
  },
  noName: {
    en: 'This card has no account yet. Add a name and a password to open it on any device without its code.',
    fr: 'Cette carte n’a pas encore de compte. Ajoutez un nom et un mot de passe pour l’ouvrir sur tout appareil sans son code.',
  },
  create: { en: 'Create an account', fr: 'Créer un compte' },
  signIn: { en: 'Sign in', fr: 'Se connecter' },
  name: { en: 'Name', fr: 'Nom' },
  nameRule: { en: '3 to 24 letters, digits, dots or dashes', fr: '3 à 24 lettres, chiffres, points ou tirets' },
  password: { en: 'Password', fr: 'Mot de passe' },
  passwordRule: { en: 'At least 8 characters', fr: 'Au moins 8 caractères' },
  again: { en: 'Password again', fr: 'Encore le mot de passe' },
  current: { en: 'Current password', fr: 'Mot de passe actuel' },
  fresh: { en: 'New password', fr: 'Nouveau mot de passe' },
  cancel: { en: 'Cancel', fr: 'Annuler' },
  save: { en: 'Save', fr: 'Enregistrer' },
  as: { en: 'Signed in as', fr: 'Connecté en tant que' },
  change: { en: 'Change the password', fr: 'Changer le mot de passe' },
  signOut: { en: 'Sign out', fr: 'Se déconnecter' },
  changed: { en: 'The password is changed.', fr: 'Le mot de passe est changé.' },
  forgot: {
    en: 'If you forget the password, write to the address on the About page: it can be set again for you.',
    fr: 'En cas d’oubli du mot de passe, écrivez à l’adresse de la page À propos : il peut être redéfini pour vous.',
  },
  taken: { en: 'That name is already taken.', fr: 'Ce nom est déjà pris.' },
  'bad-name': { en: 'A name is 3 to 24 letters, digits, dots or dashes.', fr: 'Un nom compte 3 à 24 lettres, chiffres, points ou tirets.' },
  'bad-password': { en: 'A password needs at least 8 characters.', fr: 'Un mot de passe compte au moins 8 caractères.' },
  differ: { en: 'The two passwords are not the same.', fr: 'Les deux mots de passe ne sont pas identiques.' },
  wrong: { en: 'The name or the password is not right.', fr: 'Le nom ou le mot de passe est incorrect.' },
  'too-many': { en: 'Too many tries today. Come back tomorrow.', fr: 'Trop d’essais aujourd’hui. Revenez demain.' },
  offline: { en: 'The server could not be reached. Try again in a moment.', fr: 'Le serveur est injoignable. Réessayez dans un instant.' },
} satisfies Record<string, L>;

type Problem = 'taken' | 'bad-name' | 'bad-password' | 'differ' | 'wrong' | 'too-many' | 'offline';

export function AccountPanel() {
  const { tl } = useI18n();
  const { card: mine } = useCard();
  const [mode, setMode] = useState<'create' | 'enter' | 'change' | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [current, setCurrent] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [changed, setChanged] = useState(false);
  const panel = useRef<HTMLElement>(null);

  // The header's "Sign in" leads here.
  useEffect(() => {
    if (location.hash !== '#account') return;
    panel.current?.scrollIntoView({ block: 'center' });
    if (!card.code()) setMode('enter');
  }, []);

  const open = (next: typeof mode) => {
    setMode(next);
    setProblem(null);
    setChanged(false);
    setPassword('');
    setAgain('');
    setCurrent('');
  };

  const submit = async () => {
    if (mode !== 'enter' && password !== again) return setProblem('differ');
    setBusy(true);
    setProblem(null);
    const answer = mode === 'create' ? await card.register(name, password) : mode === 'enter' ? await card.signIn(name, password) : await card.changePassword(current, password);
    setBusy(false);
    if (answer !== 'ok') return setProblem(answer);
    setChanged(mode === 'change');
    setMode(null);
    setName('');
    setPassword('');
    setAgain('');
    setCurrent('');
  };

  const form = mode && (
    <form
      className="account-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {mode !== 'change' && (
        <label>
          {tl(TEXT.name)}
          <input value={name} onChange={(event) => setName(event.target.value)} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={24} required autoFocus />
          {mode === 'create' && <small>{tl(TEXT.nameRule)}</small>}
        </label>
      )}
      {mode === 'change' && (
        <label>
          {tl(TEXT.current)}
          <input type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" maxLength={200} required autoFocus />
        </label>
      )}
      <label>
        {tl(mode === 'change' ? TEXT.fresh : TEXT.password)}
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={mode === 'enter' ? 'current-password' : 'new-password'}
          minLength={mode === 'enter' ? undefined : 8}
          maxLength={200}
          required
        />
        {mode !== 'enter' && <small>{tl(TEXT.passwordRule)}</small>}
      </label>
      {mode !== 'enter' && (
        <label>
          {tl(TEXT.again)}
          <input type="password" value={again} onChange={(event) => setAgain(event.target.value)} autoComplete="new-password" maxLength={200} required />
        </label>
      )}
      <div className="card-actions">
        <button type="submit" className="button" disabled={busy}>
          {tl(mode === 'create' ? TEXT.create : mode === 'enter' ? TEXT.signIn : TEXT.save)}
        </button>
        <button type="button" className="text-button" onClick={() => open(null)}>
          {tl(TEXT.cancel)}
        </button>
      </div>
      {mode === 'create' && <p className="card-note">{tl(TEXT.forgot)}</p>}
    </form>
  );

  return (
    <section className="account-panel" id="account" ref={panel}>
      <p className="page-eyebrow">{tl(TEXT.title)}</p>
      {mine?.name ? (
        <>
          <p className="account-name">
            <span>{tl(TEXT.as)}</span> {mine.name}
          </p>
          {form ?? (
            <div className="card-actions card-quiet">
              <button type="button" className="text-button" onClick={() => open('change')}>
                {tl(TEXT.change)}
              </button>
              <button type="button" className="text-button" onClick={() => card.leave()}>
                {tl(TEXT.signOut)}
              </button>
            </div>
          )}
          {changed && <p className="card-note">{tl(TEXT.changed)}</p>}
        </>
      ) : (
        <>
          <p className="card-note">{tl(mine ? TEXT.noName : TEXT.none)}</p>
          {form ?? (
            <div className="card-actions">
              <button type="button" className="button" onClick={() => open('create')}>
                {tl(TEXT.create)}
              </button>
              {!mine && (
                <button type="button" className="text-button" onClick={() => open('enter')}>
                  {tl(TEXT.signIn)}
                </button>
              )}
            </div>
          )}
        </>
      )}
      {problem && <p className="card-problem">{tl(TEXT[problem])}</p>}
    </section>
  );
}
