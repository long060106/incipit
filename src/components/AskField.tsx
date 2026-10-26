import { useEffect, useState, type FormEvent } from 'react';
import { useI18n, type StringKey } from '../i18n';
import { askForBook, askReady, type AskError } from '../lib/ask';
import type { Filters } from '../lib/match';
import { pageUrl } from '../pages/PageHeader';

const ERRORS: Record<AskError, StringKey> = { 'too-many': 'askTooMany', resting: 'askResting', failed: 'askFailed' };

/**
 * A wish in a few words ("sad and short, set in Russia"), turned into the filters below it.
 * Shown only when the server can read words; the books still come from the catalogue alone.
 */
export function AskField({ onWish }: { onWish: (filters: Partial<Filters>) => void }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');

  useEffect(() => {
    let live = true;
    askReady().then((ready) => live && setShown(ready));
    return () => {
      live = false;
    };
  }, []);

  if (!shown) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const wish = text.trim();
    if (!wish || busy) return;
    setBusy(true);
    setSaid(t('askBusy'));
    const answer = await askForBook(wish);
    setBusy(false);
    if ('error' in answer) {
      setSaid(t(ERRORS[answer.error]));
      return;
    }
    if (!Object.keys(answer.filters).length) {
      setSaid(t('askNothing'));
      return;
    }
    onWish(answer.filters);
    setSaid(answer.note ? t('askUnderstood', { note: answer.note }) : '');
  };

  return (
    <form className="ask" onSubmit={submit}>
      <label className="ask-field">
        <span className="sr-only">{t('askLabel')}</span>
        <input type="text" value={text} maxLength={240} placeholder={t('askPlaceholder')} onChange={(event) => setText(event.target.value)} autoComplete="off" />
        <button type="submit" className="ask-go" disabled={busy || !text.trim()} aria-busy={busy || undefined}>
          {t('askGo')}
        </button>
      </label>
      <p className="ask-said" aria-live="polite">
        {said}
      </p>
      <p className="ask-credit">
        {t('askCredit')}{' '}
        <a className="text-link" href={pageUrl('privacy')}>
          {t('privacyLink')}
        </a>
      </p>
    </form>
  );
}
