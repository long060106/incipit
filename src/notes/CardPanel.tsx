import { useEffect, useState } from 'react';
import type { L } from '../data/types';
import { useI18n } from '../i18n';
import { card, printed, useCard } from '../lib/card';

/*
  The library card, folded under the door of the sign-in page (/signin): taking one, typing in one from
  another device, and, once there is a card, its number and whether the notebook is in step.
*/

const TEXT = {
  title: { en: 'Library card', fr: 'Carte de lecteur' },
  none: {
    en: 'Or keep it with no name at all: a library card keeps a copy safe and opens it on your other devices. The card’s number is the key.',
    fr: 'Ou gardez-le sans aucun nom : une carte de lecteur en garde une copie et l’ouvre sur vos autres appareils. Le numéro de la carte est la clé.',
  },
  take: { en: 'Take a card', fr: 'Prendre une carte' },
  have: { en: 'I have a card', fr: 'J’ai déjà une carte' },
  placeholder: { en: 'XXXXX-XXXXX-XXXXX-XXXXX', fr: 'XXXXX-XXXXX-XXXXX-XXXXX' },
  open: { en: 'Open', fr: 'Ouvrir' },
  cancel: { en: 'Cancel', fr: 'Annuler' },
  unknown: { en: 'No card has that number.', fr: 'Aucune carte ne porte ce numéro.' },
  offline: { en: 'The server could not be reached. Try again in a moment.', fr: 'Le serveur est injoignable. Réessayez dans un instant.' },
  keep: {
    en: 'Write this number down. Without an account it is the only way to open your notebook on another device, and it cannot be recovered if lost.',
    fr: 'Notez ce numéro. Sans compte, c’est le seul moyen d’ouvrir votre carnet sur un autre appareil, et il ne peut pas être retrouvé s’il est perdu.',
  },
  copy: { en: 'Copy', fr: 'Copier' },
  copied: { en: 'Copied', fr: 'Copié' },
  inStep: { en: 'In step with the server', fr: 'À jour avec le serveur' },
  syncing: { en: 'Exchanging…', fr: 'Échange en cours…' },
  notReached: { en: 'Not reached; will try again', fr: 'Injoignable ; nouvel essai plus tard' },
  gone: { en: 'This card no longer exists on the server.', fr: 'Cette carte n’existe plus sur le serveur.' },
  now: { en: 'Sync now', fr: 'Synchroniser' },
  leave: { en: 'Put the card away on this device', fr: 'Ranger la carte sur cet appareil' },
  erase: { en: 'Erase the card and its copy', fr: 'Effacer la carte et sa copie' },
  eraseSure: {
    en: 'Erase for good? The copy on the server is deleted; the notebook stays in this browser.',
    fr: 'Effacer pour de bon ? La copie sur le serveur est supprimée ; le carnet reste dans ce navigateur.',
  },
  yes: { en: 'Yes, erase', fr: 'Oui, effacer' },
  admin: { en: 'Keeper of the library', fr: 'Gardien de la bibliothèque' },
  desk: { en: 'Open the keeper’s desk', fr: 'Ouvrir le bureau du gardien' },
  claimFirst: { en: 'Take a card (or open yours) to become the keeper of the site.', fr: 'Prenez une carte (ou ouvrez la vôtre) pour devenir le gardien du site.' },
  claimDone: {
    en: 'This card now keeps the site. Open the keeper’s desk below, or any book to find the keeper’s corner at the foot of its sheet.',
    fr: 'Cette carte garde désormais le site. Ouvrez un livre : le coin du gardien se trouve au bas de sa fiche.',
  },
  claimRefused: { en: 'That keeper’s link has already been used, or is not valid.', fr: 'Ce lien de gardien a déjà servi, ou n’est pas valide.' },
} satisfies Record<string, L>;

export function CardPanel() {
  const { tl } = useI18n();
  const { card: mine, status } = useCard();
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<'unknown' | 'offline' | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [erasing, setErasing] = useState(false);
  // The owner of the site arrives once with "#claim=<code>", which makes their card the keeper's.
  const [claim, setClaim] = useState<'waiting' | 'done' | 'refused' | null>(() => (location.hash.startsWith('#claim=') ? 'waiting' : null));

  useEffect(() => {
    const onHash = () => location.hash.startsWith('#claim=') && setClaim('waiting');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (claim !== 'waiting' || !mine) return;
    void card.claim(decodeURIComponent(location.hash.slice('#claim='.length))).then((taken) => {
      setClaim(taken ? 'done' : 'refused');
      if (taken) history.replaceState(history.state, '', location.pathname);
    });
  }, [claim, mine]);

  const take = async () => {
    setBusy(true);
    setProblem((await card.take()) ? null : 'offline');
    setBusy(false);
  };

  const enter = async () => {
    setBusy(true);
    const result = await card.enter(typed);
    setProblem(result === 'ok' ? null : result);
    if (result === 'ok') {
      setTyping(false);
      setTyped('');
    }
    setBusy(false);
  };

  if (!mine) {
    return (
      <section className="card-panel">
        <p className="page-eyebrow">{tl(TEXT.title)}</p>
        <p className="card-note">{tl(TEXT.none)}</p>
        {typing ? (
          <form
            className="card-form"
            onSubmit={(event) => {
              event.preventDefault();
              void enter();
            }}
          >
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={tl(TEXT.placeholder)}
              aria-label={tl(TEXT.title)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
            />
            <button type="submit" className="button" disabled={busy || typed.replace(/[^0-9a-z]/gi, '').length < 20}>
              {tl(TEXT.open)}
            </button>
            <button type="button" className="text-button" onClick={() => (setTyping(false), setProblem(null))}>
              {tl(TEXT.cancel)}
            </button>
          </form>
        ) : (
          <div className="card-actions">
            <button type="button" className="button" onClick={take} disabled={busy}>
              {tl(TEXT.take)}
            </button>
            <button type="button" className="text-button" onClick={() => (setTyping(true), setProblem(null))}>
              {tl(TEXT.have)}
            </button>
          </div>
        )}
        {problem && <p className="card-problem">{tl(TEXT[problem])}</p>}
        {claim === 'waiting' && <p className="card-problem">{tl(TEXT.claimFirst)}</p>}
      </section>
    );
  }

  return (
    <section className="card-panel">
      <p className="page-eyebrow">
        {tl(TEXT.title)}
        {mine.role === 'admin' && ` · ${tl(TEXT.admin)}`}
      </p>
      {mine.role === 'admin' && (
        <a className="text-link" href={`${import.meta.env.BASE_URL}admin`}>
          {tl(TEXT.desk)} →
        </a>
      )}
      <div className="card-face">
        <code>{printed(mine.code)}</code>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            void navigator.clipboard?.writeText(printed(mine.code)).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1800);
            });
          }}
        >
          {tl(copied ? TEXT.copied : TEXT.copy)}
        </button>
      </div>
      <p className="card-note">{tl(TEXT.keep)}</p>
      {claim === 'done' && <p className="card-problem">{tl(TEXT.claimDone)}</p>}
      {claim === 'refused' && <p className="card-problem">{tl(TEXT.claimRefused)}</p>}
      <p className="card-status" data-status={status}>
        {tl(status === 'syncing' ? TEXT.syncing : status === 'offline' ? TEXT.notReached : status === 'unknown' ? TEXT.gone : TEXT.inStep)}
        {status !== 'syncing' && status !== 'unknown' && (
          <button type="button" className="text-button" onClick={() => void card.sync()}>
            {tl(TEXT.now)}
          </button>
        )}
      </p>
      {erasing ? (
        <div className="card-actions">
          <span className="card-note">{tl(TEXT.eraseSure)}</span>
          <button type="button" className="text-button" onClick={async () => setErasing(!(await card.erase()))}>
            {tl(TEXT.yes)}
          </button>
          <button type="button" className="text-button" onClick={() => setErasing(false)}>
            {tl(TEXT.cancel)}
          </button>
        </div>
      ) : (
        <div className="card-actions card-quiet">
          <button type="button" className="text-button" onClick={() => card.leave()}>
            {tl(TEXT.leave)}
          </button>
          <button type="button" className="text-button" onClick={() => setErasing(true)}>
            {tl(TEXT.erase)}
          </button>
        </div>
      )}
    </section>
  );
}
