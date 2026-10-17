import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { L } from '../data/types';
import { useI18n } from '../i18n';
import { card, useCard } from '../lib/card';
import { personUrl, writeUrl } from '../lib/people';
import { CardPanel } from '../notes/CardPanel';
import { PageHeader, pageUrl, useQuickLoader } from './PageHeader';
import { installThreads } from './threads';
import '../notes/notes.css';
import './signin.css';

/*
  Signing in (/signin): a page of its own. A reader signs in with their name or their email
  and a password, or creates an account with either. The name is what others see beside a
  review, so every account has one, and no two accounts share it: while it is typed the
  server is asked whether it is free. An email is never shown to anyone; it is only another way
  in. Signed in, the page shows the account, and the library card behind it.

  "?next=/book/…" sends the reader back where they came from once they are in.

  A reader who has forgotten their password asks here for a link, sent to the email of their
  account. The link comes back to this page ("#reset=<token>", in the fragment so that it never
  reaches a server log), where they choose a new one and are signed in.
*/

const TEXT = {
  lead: { en: 'Your notebook, wherever you read.', fr: 'Votre carnet, où que vous lisiez.' },
  point1: { en: 'Your folders of notes, kept safe.', fr: 'Vos dossiers de notes, en lieu sûr.' },
  point2: { en: 'Open them on any of your devices.', fr: 'Ouvrez-les sur tous vos appareils.' },
  point3: { en: 'Rate books and say what you thought.', fr: 'Notez les livres et dites ce que vous en pensez.' },
  signIn: { en: 'Sign in', fr: 'Se connecter' },
  create: { en: 'Create an account', fr: 'Créer un compte' },
  withName: { en: 'With a name', fr: 'Avec un nom' },
  withEmail: { en: 'With an email', fr: 'Avec un e-mail' },
  who: { en: 'Name or email', fr: 'Nom ou e-mail' },
  name: { en: 'Name', fr: 'Nom' },
  shownName: { en: 'Name others will see', fr: 'Nom que les autres verront' },
  nameRule: { en: '3 to 24 letters, digits, dots or dashes', fr: '3 à 24 lettres, chiffres, points ou tirets' },
  email: { en: 'Email', fr: 'E-mail' },
  emailRule: { en: 'Never shown to anyone. You can sign in with it or with your name.', fr: 'Jamais montré à personne. Vous pouvez vous connecter avec lui ou avec votre nom.' },
  password: { en: 'Password', fr: 'Mot de passe' },
  passwordRule: { en: 'At least 8 characters', fr: 'Au moins 8 caractères' },
  again: { en: 'Password again', fr: 'Encore le mot de passe' },
  current: { en: 'Current password', fr: 'Mot de passe actuel' },
  fresh: { en: 'New password', fr: 'Nouveau mot de passe' },
  checking: { en: 'Checking…', fr: 'Vérification…' },
  free: { en: 'Free', fr: 'Disponible' },
  forgot: {
    en: 'Forgot your password? Write to the address on the About page: it can be set again for you.',
    fr: 'Mot de passe oublié ? Écrivez à l’adresse de la page À propos : il peut être redéfini pour vous.',
  },
  forgotAsk: { en: 'Forgot your password?', fr: 'Mot de passe oublié ?' },
  forgotLead: {
    en: 'Type your name or your email. If your account has an email, a link to choose a new password is sent to it.',
    fr: 'Saisissez votre nom ou votre e-mail. Si votre compte a un e-mail, un lien pour choisir un nouveau mot de passe y est envoyé.',
  },
  forgotSend: { en: 'Send me a link', fr: 'M’envoyer un lien' },
  forgotSent: {
    en: 'If an account with that name or email has an email address, a link is on its way. It works for 30 minutes. Look in your spam folder too. No email on your account? Write to the address on the About page.',
    fr: 'Si un compte avec ce nom ou cet e-mail a une adresse e-mail, un lien est en route. Il fonctionne 30 minutes. Regardez aussi dans vos indésirables. Pas d’e-mail sur votre compte ? Écrivez à l’adresse de la page À propos.',
  },
  resetTitle: { en: 'Choose a new password', fr: 'Choisissez un nouveau mot de passe' },
  resetSave: { en: 'Save and sign in', fr: 'Enregistrer et se connecter' },
  'bad-link': { en: 'This link has expired or was already used. Ask for a new one.', fr: 'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.' },
  as: { en: 'Signed in as', fr: 'Connecté en tant que' },
  notebook: { en: 'Open your notebook', fr: 'Ouvrir votre carnet' },
  page: { en: 'Your page', fr: 'Votre page' },
  write: { en: 'Write an essay', fr: 'Écrire un essai' },
  change: { en: 'Change the password', fr: 'Changer le mot de passe' },
  save: { en: 'Save', fr: 'Enregistrer' },
  cancel: { en: 'Cancel', fr: 'Annuler' },
  signOut: { en: 'Sign out', fr: 'Se déconnecter' },
  changed: { en: 'The password is changed.', fr: 'Le mot de passe est changé.' },
  cardTitle: { en: 'Library card', fr: 'Carte de lecteur' },
  cardWhy: { en: 'No account? Keep your notebook with a library card instead', fr: 'Pas de compte ? Gardez votre carnet avec une carte de lecteur' },
  cardMine: { en: 'The library card behind your account', fr: 'La carte de lecteur derrière votre compte' },
  noName: {
    en: 'This device holds a library card with no account. Create one to put a name and a password in front of it.',
    fr: 'Cet appareil garde une carte de lecteur sans compte. Créez-en un pour lui donner un nom et un mot de passe.',
  },
  taken: { en: 'That name is already taken. Try another.', fr: 'Ce nom est déjà pris. Essayez-en un autre.' },
  'email-taken': { en: 'An account already uses that email. Sign in instead?', fr: 'Un compte utilise déjà cet e-mail. Se connecter plutôt ?' },
  'bad-name': { en: 'A name is 3 to 24 letters, digits, dots or dashes.', fr: 'Un nom compte 3 à 24 lettres, chiffres, points ou tirets.' },
  'bad-email': { en: 'That does not look like an email address.', fr: 'Cela ne ressemble pas à une adresse e-mail.' },
  'bad-password': { en: 'A password needs at least 8 characters.', fr: 'Un mot de passe compte au moins 8 caractères.' },
  differ: { en: 'The two passwords are not the same.', fr: 'Les deux mots de passe ne sont pas identiques.' },
  wrong: { en: 'The name, email or password is not right.', fr: 'Le nom, l’e-mail ou le mot de passe est incorrect.' },
  'too-many': { en: 'Too many tries today. Come back tomorrow.', fr: 'Trop d’essais aujourd’hui. Revenez demain.' },
  offline: { en: 'The server could not be reached. Try again in a moment.', fr: 'Le serveur est injoignable. Réessayez dans un instant.' },
} satisfies Record<string, L>;

type Problem = 'taken' | 'email-taken' | 'bad-name' | 'bad-email' | 'bad-password' | 'differ' | 'wrong' | 'too-many' | 'offline' | 'bad-link';
type NameState = 'idle' | 'checking' | 'free' | 'taken' | 'bad';

const NAME = /^[a-z0-9][a-z0-9._-]{2,23}$/;

/** Where to go once signed in: only a page of this site. */
const nextPage = () => {
  const next = new URLSearchParams(location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
};

/** A name made from an email's first part, for the reader to keep or change. */
const nameFromEmail = (email: string) =>
  email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '')
    .replace(/^[._-]+/, '')
    .slice(0, 24);

export default function SignIn() {
  const { tl } = useI18n();
  const { card: mine } = useCard();
  useQuickLoader();
  const claiming = location.hash.startsWith('#claim=');
  const [resetToken, setResetToken] = useState(() => /^#reset=([0-9a-f]{64})$/.exec(location.hash)?.[1] ?? null);
  const [justReset, setJustReset] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  // Threads of gilt drifting behind it all (./threads.ts).
  useEffect(() => installThreads(pageRef.current!), []);

  return (
    <div className="signin has-backdrop" ref={pageRef}>
      <PageHeader here="signin" />
      <main className="signin-body">
        <section className="signin-aside">
          <p className="signin-initial" aria-hidden="true">
            I
          </p>
          <h1>{tl(TEXT.lead)}</h1>
          <ul>
            <li>{tl(TEXT.point1)}</li>
            <li>{tl(TEXT.point2)}</li>
            <li>{tl(TEXT.point3)}</li>
          </ul>
        </section>
        <section className="signin-card">
          {resetToken ? (
            <Reset
              token={resetToken}
              onDone={() => {
                history.replaceState(history.state, '', location.pathname + location.search);
                setResetToken(null);
                setJustReset(true);
              }}
            />
          ) : mine?.name ? (
            <Account fresh={justReset} />
          ) : (
            <Doors holdsCard={!!mine} />
          )}
          <details className="signin-library" open={claiming || (!!mine && !mine.name) || undefined}>
            <summary>{tl(mine?.name ? TEXT.cardMine : TEXT.cardWhy)}</summary>
            <CardPanel />
          </details>
        </section>
      </main>
    </div>
  );
}

/** Signing in, or creating an account. */
function Doors({ holdsCard }: { holdsCard: boolean }) {
  const { tl } = useI18n();
  const [door, setDoor] = useState<'in' | 'new'>(holdsCard ? 'new' : 'in');
  const [by, setBy] = useState<'name' | 'email'>('name');
  const [who, setWho] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const nameState = useNameCheck(door === 'new' ? name : '');

  const switchDoor = (next: 'in' | 'new') => {
    setDoor(next);
    setProblem(null);
    setPassword('');
    setAgain('');
  };

  const done = () => {
    const next = nextPage();
    if (next) location.href = next;
  };

  const submit = async () => {
    setProblem(null);
    if (door === 'new') {
      if (password !== again) return setProblem('differ');
      if (nameState === 'taken') return setProblem('taken');
      if (nameState === 'bad') return setProblem('bad-name');
    }
    setBusy(true);
    const answer = door === 'in' ? await card.signIn(who, password) : await card.register(name, password, by === 'email' ? email : null);
    setBusy(false);
    if (answer !== 'ok') return setProblem(answer);
    done();
  };

  return (
    <>
      <div className="signin-doors" role="tablist" style={{ '--at': door === 'in' ? 0 : 1 } as CSSProperties}>
        <button type="button" role="tab" aria-selected={door === 'in'} onClick={() => switchDoor('in')}>
          {tl(TEXT.signIn)}
        </button>
        <button type="button" role="tab" aria-selected={door === 'new'} onClick={() => switchDoor('new')}>
          {tl(TEXT.create)}
        </button>
      </div>
      {holdsCard && door === 'new' && <p className="card-note">{tl(TEXT.noName)}</p>}
      <form
        key={door}
        className="signin-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {door === 'in' ? (
          <label>
            <span>{tl(TEXT.who)}</span>
            <input value={who} onChange={(event) => setWho(event.target.value)} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} required autoFocus />
          </label>
        ) : (
          <>
            <div className="signin-by" role="radiogroup" style={{ '--at': by === 'name' ? 0 : 1 } as CSSProperties}>
              {(['name', 'email'] as const).map((choice) => (
                <button key={choice} type="button" role="radio" aria-checked={by === choice} onClick={() => setBy(choice)}>
                  {tl(choice === 'name' ? TEXT.withName : TEXT.withEmail)}
                </button>
              ))}
            </div>
            {by === 'email' && (
              <label>
                <span>{tl(TEXT.email)}</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (!nameTouched) setName(nameFromEmail(event.target.value));
                  }}
                  name="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  autoFocus
                />
                <small>{tl(TEXT.emailRule)}</small>
              </label>
            )}
            <label>
              <span>{tl(by === 'email' ? TEXT.shownName : TEXT.name)}</span>
              <span className="signin-field">
                <input
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value.toLowerCase());
                    setNameTouched(true);
                  }}
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={24}
                  required
                  autoFocus={by === 'name'}
                  aria-invalid={nameState === 'taken' || nameState === 'bad' || undefined}
                />
                <NameBadge state={nameState} />
              </span>
              <small data-problem={nameState === 'taken' || undefined}>{tl(nameState === 'taken' ? TEXT.taken : TEXT.nameRule)}</small>
            </label>
          </>
        )}
        <label>
          <span>{tl(TEXT.password)}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={door === 'in' ? 'current-password' : 'new-password'}
            minLength={door === 'in' ? undefined : 8}
            maxLength={200}
            required
          />
          {door === 'new' && <small>{tl(TEXT.passwordRule)}</small>}
        </label>
        {door === 'new' && (
          <label>
            <span>{tl(TEXT.again)}</span>
            <input type="password" value={again} onChange={(event) => setAgain(event.target.value)} autoComplete="new-password" maxLength={200} required />
          </label>
        )}
        <button type="submit" className="button signin-submit" aria-busy={busy || undefined} disabled={busy || (door === 'new' && (nameState === 'taken' || nameState === 'bad'))}>
          {tl(door === 'in' ? TEXT.signIn : TEXT.create)}
        </button>
        {problem && <p className="card-problem">{tl(TEXT[problem])}</p>}
      </form>
      {door === 'in' && <Forgot who={who} />}
    </>
  );
}

/** Asking for a link that sets a new password; or, while the site cannot send one, who to write to. */
function Forgot({ who }: { who: string }) {
  const { tl, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [mail, setMail] = useState<boolean | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<'sent' | 'too-many' | 'offline' | null>(null);

  const begin = async () => {
    setOpen(true);
    setTyped(who.trim());
    setMail(await card.canMail());
  };

  const send = async () => {
    setBusy(true);
    const answer = await card.forgot(typed, lang);
    setBusy(false);
    if (answer === 'no-mail') return setMail(false);
    setState(answer);
  };

  if (!open)
    return (
      <p className="card-note signin-forgot">
        <button type="button" className="text-button" onClick={() => void begin()}>
          <span className="u">{tl(TEXT.forgotAsk)}</span>
        </button>
      </p>
    );
  if (mail === false) return <p className="card-note signin-forgot">{tl(TEXT.forgot)}</p>;
  if (state === 'sent') return <p className="card-note signin-forgot" role="status">{tl(TEXT.forgotSent)}</p>;
  return (
    <form
      className="signin-form signin-forgot"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <p className="card-note">{tl(TEXT.forgotLead)}</p>
      <label>
        <span>{tl(TEXT.who)}</span>
        <input value={typed} onChange={(event) => setTyped(event.target.value)} name="forgot" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} required autoFocus />
      </label>
      <button type="submit" className="button button-quiet" aria-busy={busy || undefined} disabled={busy || mail === null || !typed.trim()}>
        {tl(TEXT.forgotSend)}
      </button>
      {state && <p className="card-problem">{tl(TEXT[state])}</p>}
    </form>
  );
}

/** A link from that letter: a new password, twice, and the reader is in. */
function Reset({ token, onDone }: { token: string; onDone: () => void }) {
  const { tl } = useI18n();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  const save = async () => {
    setProblem(null);
    if (password !== again) return setProblem('differ');
    setBusy(true);
    const answer = await card.reset(token, password);
    setBusy(false);
    if (answer !== 'ok') return setProblem(answer);
    onDone();
  };

  return (
    <form
      className="signin-form signin-reset"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2 className="page-eyebrow">{tl(TEXT.resetTitle)}</h2>
      <label>
        <span>{tl(TEXT.fresh)}</span>
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={200} required autoFocus />
        <small>{tl(TEXT.passwordRule)}</small>
      </label>
      <label>
        <span>{tl(TEXT.again)}</span>
        <input type="password" value={again} onChange={(event) => setAgain(event.target.value)} autoComplete="new-password" maxLength={200} required />
      </label>
      <button type="submit" className="button signin-submit" aria-busy={busy || undefined} disabled={busy}>
        {tl(TEXT.resetSave)}
      </button>
      {problem && <p className="card-problem">{tl(TEXT[problem])}</p>}
      {problem === 'bad-link' && (
        <p className="card-note">
          <a className="text-link" href={pageUrl('signin')}>
            <span className="u">{tl(TEXT.forgotAsk)}</span> →
          </a>
        </p>
      )}
    </form>
  );
}

/** Asks the server, a moment after the reader stops typing, whether a name is free. */
function useNameCheck(name: string): NameState {
  const [state, setState] = useState<NameState>('idle');
  const asked = useRef(0);
  useEffect(() => {
    const wanted = name.trim().toLowerCase();
    if (!wanted) return setState('idle');
    if (!NAME.test(wanted)) return setState(wanted.length < 3 ? 'idle' : 'bad');
    setState('checking');
    const ticket = ++asked.current;
    const timer = window.setTimeout(async () => {
      const free = await card.nameFree(wanted);
      if (ticket === asked.current) setState(free === null ? 'idle' : free ? 'free' : 'taken');
    }, 400);
    return () => window.clearTimeout(timer);
  }, [name]);
  return state;
}

function NameBadge({ state }: { state: NameState }) {
  const { tl } = useI18n();
  if (state === 'checking') return <em className="signin-badge">{tl(TEXT.checking)}</em>;
  if (state === 'free') return <em className="signin-badge" data-good="">✓ {tl(TEXT.free)}</em>;
  if (state === 'taken') return <em className="signin-badge" data-bad="">✕</em>;
  return null;
}

/** Signed in: who, how to change the password, and the way out. */
function Account({ fresh = false }: { fresh?: boolean }) {
  const { tl } = useI18n();
  const { card: mine } = useCard();
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [changed, setChanged] = useState(fresh);

  const save = async () => {
    if (password !== again) return setProblem('differ');
    setBusy(true);
    setProblem(null);
    const answer = await card.changePassword(current, password);
    setBusy(false);
    if (answer !== 'ok') return setProblem(answer);
    setChanging(false);
    setChanged(true);
    setCurrent('');
    setPassword('');
    setAgain('');
  };

  return (
    <div className="signin-account">
      <p className="page-eyebrow">{tl(TEXT.as)}</p>
      <p className="signin-name">{mine?.name}</p>
      {mine?.email && <p className="signin-email">{mine.email}</p>}
      <a className="button" href={nextPage() ?? pageUrl('notebook')}>
        <span className="roll">
          <span>{tl(TEXT.notebook)} →</span>
        </span>
      </a>
      <div className="signin-more">
        <a className="text-link" href={personUrl(mine!.name!)}>
          <span className="u">{tl(TEXT.page)}</span>
        </a>
        <a className="text-link" href={writeUrl()}>
          <span className="u">{tl(TEXT.write)}</span>
        </a>
      </div>
      {changing ? (
        <form
          className="signin-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label>
            <span>{tl(TEXT.current)}</span>
            <input type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" maxLength={200} required autoFocus />
          </label>
          <label>
            <span>{tl(TEXT.fresh)}</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={200} required />
            <small>{tl(TEXT.passwordRule)}</small>
          </label>
          <label>
            <span>{tl(TEXT.again)}</span>
            <input type="password" value={again} onChange={(event) => setAgain(event.target.value)} autoComplete="new-password" maxLength={200} required />
          </label>
          <div className="card-actions">
            <button type="submit" className="button" disabled={busy}>
              {tl(TEXT.save)}
            </button>
            <button type="button" className="text-button" onClick={() => (setChanging(false), setProblem(null))}>
              {tl(TEXT.cancel)}
            </button>
          </div>
        </form>
      ) : (
        <div className="card-actions card-quiet">
          <button type="button" className="text-button" onClick={() => (setChanging(true), setChanged(false))}>
            {tl(TEXT.change)}
          </button>
          <button type="button" className="text-button" onClick={() => card.leave()}>
            {tl(TEXT.signOut)}
          </button>
        </div>
      )}
      {changed && <p className="card-note">{tl(TEXT.changed)}</p>}
      {problem && <p className="card-problem">{tl(TEXT[problem])}</p>}
    </div>
  );
}
