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

  An account always has an email. A reader may also sign in with Google (Google's own button; the
  token it gives the page is checked by the server). One Google has not met here yet is asked for
  a name, since the name is what others see.

  A reader who has forgotten their password gives the email of their account, confirms it, and a
  link is sent there. The link comes back to this page ("#reset=<token>", in the fragment so that it never
  reaches a server log), where they choose a new one and are signed in.
*/

const TEXT = {
  lead: { en: 'Your notebook, wherever you read.', fr: 'Votre carnet, où que vous lisiez.' },
  point1: { en: 'Your folders of notes, kept safe.', fr: 'Vos dossiers de notes, en lieu sûr.' },
  point2: { en: 'Open them on any of your devices.', fr: 'Ouvrez-les sur tous vos appareils.' },
  point3: { en: 'Rate books and say what you thought.', fr: 'Notez les livres et dites ce que vous en pensez.' },
  signIn: { en: 'Sign in', fr: 'Se connecter' },
  create: { en: 'Create an account', fr: 'Créer un compte' },
  who: { en: 'Name or email', fr: 'Nom ou e-mail' },
  name: { en: 'Name', fr: 'Nom' },
  shownName: { en: 'Name others will see', fr: 'Nom que les autres verront' },
  nameRule: { en: '3 to 24 letters, digits, dots or dashes', fr: '3 à 24 lettres, chiffres, points ou tirets' },
  email: { en: 'Email', fr: 'E-mail' },
  emailRule: {
    en: 'Never shown to anyone. A forgotten password is set again by it, and you can sign in with it or with your name.',
    fr: 'Jamais montré à personne. Un mot de passe oublié se redéfinit par lui, et vous pouvez vous connecter avec lui ou avec votre nom.',
  },
  or: { en: 'or', fr: 'ou' },
  accept: {
    en: 'By making an account, or continuing with Google, you accept the {terms} and the {privacy}.',
    fr: 'En créant un compte, ou en continuant avec Google, vous acceptez les {terms} et la {privacy}.',
  },
  termsName: { en: 'terms of use', fr: 'conditions d’utilisation' },
  privacyName: { en: 'privacy policy', fr: 'politique de confidentialité' },
  googleLead: {
    en: 'Google knows you as {email}. Choose the name others will see beside your reviews and essays.',
    fr: 'Google vous connaît sous {email}. Choisissez le nom que les autres verront près de vos avis et essais.',
  },
  googleLink: { en: 'Open this account with Google too. It must be the same email.', fr: 'Ouvrez aussi ce compte avec Google. Ce doit être le même e-mail.' },
  googleLinked: { en: 'This account can be opened with Google.', fr: 'Ce compte peut être ouvert avec Google.' },
  googleWrong: { en: 'Google could not confirm who you are. Try again.', fr: 'Google n’a pas pu confirmer qui vous êtes. Réessayez.' },
  'has-account': {
    en: 'An account already uses that email. Sign in to it with its password (or ask for a new one: “Forgot your password?”), then open Google from your account page.',
    fr: 'Un compte utilise déjà cet e-mail. Connectez-vous avec son mot de passe (ou demandez-en un nouveau : « Mot de passe oublié ? »), puis ouvrez Google depuis votre page de compte.',
  },
  'email-differs': { en: 'That Google account has another email than this account.', fr: 'Ce compte Google a un autre e-mail que ce compte.' },
  'google-taken': { en: 'That Google account is already tied to another account.', fr: 'Ce compte Google est déjà lié à un autre compte.' },
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
  forgotLead: { en: 'Type the email of your account.', fr: 'Saisissez l’e-mail de votre compte.' },
  forgotNext: { en: 'Continue', fr: 'Continuer' },
  forgotConfirm: { en: 'Is this the right address? A letter with a link to choose a new password will be sent to it.', fr: 'Cette adresse est-elle la bonne ? Une lettre avec un lien pour choisir un nouveau mot de passe y sera envoyée.' },
  forgotSend: { en: 'Send the letter', fr: 'Envoyer la lettre' },
  forgotChange: { en: 'Change the address', fr: 'Changer l’adresse' },
  forgotSent: {
    en: 'If an account uses that email, a letter is on its way. The link works for 30 minutes. Look in your spam folder too.',
    fr: 'Si un compte utilise cet e-mail, une lettre est en route. Le lien fonctionne 30 minutes. Regardez aussi dans vos indésirables.',
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

type Problem = 'taken' | 'email-taken' | 'bad-name' | 'bad-email' | 'bad-password' | 'differ' | 'wrong' | 'too-many' | 'offline' | 'bad-link' | 'has-account' | 'email-differs' | 'google-taken' | 'googleWrong';
type NameState = 'idle' | 'checking' | 'free' | 'taken' | 'bad';

const NAME = /^[a-z0-9][a-z0-9._-]{2,23}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

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
  // The id of the site's client at Google; null while Google is not on, and the button is not shown.
  const [google, setGoogle] = useState<string | null>(null);
  useEffect(() => {
    void card.googleClient().then(setGoogle);
  }, []);
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
            <Account fresh={justReset} google={google} />
          ) : (
            <Doors holdsCard={!!mine} google={google} />
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

/**
 * Google's own button. Google draws it (in a frame of its own: the page never sees the reader's Google
 * password) and hands the page a signed token once they choose an account; the server checks it.
 */
interface GoogleId {
  initialize(options: object): void;
  renderButton(element: HTMLElement, options: object): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let googleScript: Promise<boolean> | null = null;
const loadGoogle = () =>
  (googleScript ??= new Promise<boolean>((resolve) => {
    if (window.google?.accounts?.id) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      googleScript = null;
      resolve(false);
    };
    document.head.append(script);
  }));

/** Who is to be told of the token: the button that is on the page now. */
let tokenTo: ((credential: string) => void) | null = null;
let askedBy = '';

function GoogleButton({ client, onCredential }: { client: string; onCredential: (credential: string) => void }) {
  const { lang } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(true);
  const latest = useRef(onCredential);
  latest.current = onCredential;

  useEffect(() => {
    let live = true;
    void loadGoogle().then((loaded) => {
      const id = window.google?.accounts.id;
      if (!live || !box.current) return;
      if (!loaded || !id) return setShown(false);
      tokenTo = (credential) => latest.current(credential);
      if (askedBy !== client) {
        id.initialize({ client_id: client, callback: (answer: { credential: string }) => tokenTo?.(answer.credential), auto_select: false });
        askedBy = client;
      }
      id.renderButton(box.current, {
        type: 'standard',
        theme: document.documentElement.dataset.theme === 'day' ? 'outline' : 'filled_black',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        logo_alignment: 'left',
        width: Math.min(400, Math.max(200, box.current.clientWidth)),
        locale: lang,
      });
    });
    return () => {
      live = false;
    };
  }, [client, lang]);

  return shown ? <div className="signin-google" ref={box} /> : null;
}

/** Signing in, or creating an account. */
function Doors({ holdsCard, google }: { holdsCard: boolean; google: string | null }) {
  const { tl } = useI18n();
  const [door, setDoor] = useState<'in' | 'new'>(holdsCard ? 'new' : 'in');
  const [who, setWho] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  // Google knows this reader and the account does not exist yet: they choose a name.
  const [pending, setPending] = useState<{ credential: string; email: string } | null>(null);
  const nameState = useNameCheck(door === 'new' || pending ? name : '');

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
    const answer = door === 'in' ? await card.signIn(who, password) : await card.register(name, password, email);
    setBusy(false);
    if (answer !== 'ok') return setProblem(answer);
    done();
  };

  const viaGoogle = async (credential: string, chosen?: string) => {
    setProblem(null);
    setBusy(true);
    const answer = await card.google(credential, chosen);
    setBusy(false);
    if (answer === 'ok') return done();
    if (typeof answer === 'object') {
      setPending({ credential, email: answer.email });
      if (!nameTouched) setName(nameFromEmail(answer.email));
      return;
    }
    if (answer === 'wrong') setPending(null);
    setProblem(answer === 'wrong' ? 'googleWrong' : answer);
  };

  if (pending)
    return (
      <form
        key="google-name"
        className="signin-form"
        onSubmit={(event) => {
          event.preventDefault();
          void viaGoogle(pending.credential, name);
        }}
      >
        <p className="card-note">{tl(TEXT.googleLead).replace('{email}', pending.email)}</p>
        <label>
          <span>{tl(TEXT.shownName)}</span>
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
              autoFocus
              aria-invalid={nameState === 'taken' || nameState === 'bad' || undefined}
            />
            <NameBadge state={nameState} />
          </span>
          <small data-problem={nameState === 'taken' || undefined}>{tl(nameState === 'taken' ? TEXT.taken : TEXT.nameRule)}</small>
        </label>
        <button type="submit" className="button signin-submit" aria-busy={busy || undefined} disabled={busy || nameState === 'taken' || nameState === 'bad' || !name.trim()}>
          {tl(TEXT.create)}
        </button>
        {problem && <p className="card-problem">{tl(TEXT[problem])}</p>}
        <button type="button" className="text-button" onClick={() => (setPending(null), setProblem(null))}>
          {tl(TEXT.cancel)}
        </button>
      </form>
    );

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
            <label>
              <span>{tl(TEXT.shownName)}</span>
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
      {google && (
        <>
          <p className="signin-or" aria-hidden="true">
            <span>{tl(TEXT.or)}</span>
          </p>
          <GoogleButton client={google} onCredential={(credential) => void viaGoogle(credential)} />
        </>
      )}
      {door === 'in' && <Forgot who={who} />}
      <Accept />
    </>
  );
}

/** What making an account means, with the two pages it points to. */
function Accept() {
  const { tl } = useI18n();
  const link = (page: 'terms' | 'privacy', name: string) => (
    <a key={page} className="text-link" href={pageUrl(page)} target="_blank" rel="noopener">
      <span className="u">{name}</span>
    </a>
  );
  const parts = tl(TEXT.accept).split(/(\{terms\}|\{privacy\})/);
  return (
    <p className="card-note signin-accept">
      {parts.map((part, at) => (part === '{terms}' ? link('terms', tl(TEXT.termsName)) : part === '{privacy}' ? link('privacy', tl(TEXT.privacyName)) : <span key={at}>{part}</span>))}
    </p>
  );
}

/** A forgotten password: the email of the account, confirmed, and a letter sent there. */
function Forgot({ who }: { who: string }) {
  const { tl, lang } = useI18n();
  const [step, setStep] = useState<'closed' | 'ask' | 'confirm' | 'sent'>('closed');
  const [mail, setMail] = useState<boolean | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'bad-email' | 'too-many' | 'offline' | null>(null);

  const begin = async () => {
    setStep('ask');
    setTyped(who.includes('@') ? who.trim() : '');
    setMail(await card.canMail());
  };

  const send = async () => {
    setBusy(true);
    setProblem(null);
    const answer = await card.forgot(typed.trim(), lang);
    setBusy(false);
    if (answer === 'no-mail') return setMail(false);
    if (answer === 'sent') return setStep('sent');
    setProblem(answer);
  };

  if (step === 'closed')
    return (
      <p className="card-note signin-forgot">
        <button type="button" className="text-button" onClick={() => void begin()}>
          <span className="u">{tl(TEXT.forgotAsk)}</span>
        </button>
      </p>
    );
  if (mail === false) return <p className="card-note signin-forgot">{tl(TEXT.forgot)}</p>;
  if (step === 'sent')
    return (
      <p className="card-note signin-forgot" role="status">
        {tl(TEXT.forgotSent)}
      </p>
    );
  if (step === 'confirm')
    return (
      <div className="signin-form signin-forgot">
        <p className="card-note">{tl(TEXT.forgotConfirm)}</p>
        <p className="signin-forgot-address">{typed.trim()}</p>
        <div className="card-actions">
          <button type="button" className="button button-quiet" aria-busy={busy || undefined} disabled={busy} onClick={() => void send()}>
            {tl(TEXT.forgotSend)}
          </button>
          <button type="button" className="text-button" onClick={() => (setStep('ask'), setProblem(null))}>
            {tl(TEXT.forgotChange)}
          </button>
        </div>
        {problem && <p className="card-problem">{tl(TEXT[problem])}</p>}
      </div>
    );
  return (
    <form
      className="signin-form signin-forgot"
      onSubmit={(event) => {
        event.preventDefault();
        if (!EMAIL.test(typed.trim())) return setProblem('bad-email');
        setProblem(null);
        setStep('confirm');
      }}
    >
      <p className="card-note">{tl(TEXT.forgotLead)}</p>
      <label>
        <span>{tl(TEXT.email)}</span>
        <input type="email" value={typed} onChange={(event) => setTyped(event.target.value)} name="forgot" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} required autoFocus />
      </label>
      <button type="submit" className="button button-quiet" disabled={mail === null || !typed.trim()}>
        {tl(TEXT.forgotNext)}
      </button>
      {problem && <p className="card-problem">{tl(TEXT[problem])}</p>}
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
function Account({ fresh = false, google }: { fresh?: boolean; google: string | null }) {
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

  const link = async (credential: string) => {
    setProblem(null);
    const answer = await card.linkGoogle(credential);
    if (answer !== 'ok') setProblem(answer === 'wrong' ? 'googleWrong' : answer);
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
      {google &&
        (mine?.google ? (
          <p className="card-note">{tl(TEXT.googleLinked)}</p>
        ) : (
          <div className="signin-link-google">
            <p className="card-note">{tl(TEXT.googleLink)}</p>
            <GoogleButton client={google} onCredential={(credential) => void link(credential)} />
          </div>
        ))}
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
          {mine?.password !== false && (
            <button type="button" className="text-button" onClick={() => (setChanging(true), setChanged(false))}>
              {tl(TEXT.change)}
            </button>
          )}
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
