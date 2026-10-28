import { useEffect, useState } from 'react';
import type { L } from '../data/types';
import { useI18n } from '../i18n';
import { withCard } from '../lib/keeper';

/*
  Readers' accounts, at the keeper's desk: their names, and a new password for one who has
  forgotten theirs. The server makes that password and shows it here once; the keeper passes
  it on, and the reader changes it after signing in.
*/

const TEXT = {
  title: { en: 'Readers’ accounts', fr: 'Comptes des lecteurs', ru: 'Аккаунты читателей', vi: 'Tài khoản bạn đọc' },
  none: { en: 'No reader has made an account yet.', fr: 'Aucun lecteur n’a encore créé de compte.', ru: 'Пока ни один читатель не создал аккаунт.', vi: 'Chưa có bạn đọc nào tạo tài khoản.' },
  note: {
    en: 'A reader who has forgotten their password can be given a new one. Their notebook is kept; their devices are signed out.',
    fr: 'Un lecteur qui a oublié son mot de passe peut en recevoir un nouveau. Son carnet est conservé ; ses appareils sont déconnectés.',
    ru: 'Читателю, забывшему пароль, можно выдать новый. Его блокнот сохранится; на его устройствах будет выполнен выход.',
    vi: 'Bạn đọc quên mật khẩu có thể được cấp mật khẩu mới. Sổ tay của họ vẫn còn; các thiết bị của họ sẽ bị đăng xuất.',
  },
  reset: { en: 'Give a new password', fr: 'Donner un nouveau mot de passe', ru: 'Выдать новый пароль', vi: 'Cấp mật khẩu mới' },
  sure: { en: 'Yes, reset', fr: 'Oui, redéfinir', ru: 'Да, сбросить', vi: 'Vâng, đặt lại' },
  cancel: { en: 'Cancel', fr: 'Annuler', ru: 'Отмена', vi: 'Hủy' },
  made: {
    en: 'New password for {name}, shown once. Send it to the reader:',
    fr: 'Nouveau mot de passe pour {name}, montré une seule fois. Transmettez-le au lecteur :',
    ru: 'Новый пароль для {name}, показывается один раз. Отправьте его читателю:',
    vi: 'Mật khẩu mới cho {name}, chỉ hiện một lần. Hãy gửi cho bạn đọc:',
  },
  failed: { en: 'That could not be done.', fr: 'Cela n’a pas pu être fait.', ru: 'Не получилось.', vi: 'Không làm được.' },
  close: { en: 'Close', fr: 'Fermer', ru: 'Закрыть', vi: 'Đóng' },
} satisfies Record<string, L>;

const API = `${import.meta.env.BASE_URL}api`;

export function AccountsDesk({ code, onClose }: { code: string; onClose: () => void }) {
  const { tl, lang } = useI18n();
  const [list, setList] = useState<{ name: string; created: number }[] | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [made, setMade] = useState<{ name: string; password: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`${API}/accounts`, { headers: withCard(code) })
      .then((response) => (response.ok ? (response.json() as Promise<{ accounts: { name: string; created: number }[] }>) : null))
      .then((answer) => (answer ? setList(answer.accounts) : setFailed(true)))
      .catch(() => setFailed(true));
  }, [code]);

  const reset = async (name: string) => {
    setAsking(null);
    setFailed(false);
    try {
      const response = await fetch(`${API}/accounts/${name}/reset`, { method: 'POST', headers: withCard(code) });
      if (!response.ok) return setFailed(true);
      setMade((await response.json()) as { name: string; password: string });
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="admin-accounts">
      <h2>{tl(TEXT.title)}</h2>
      <p className="card-note">{tl(TEXT.note)}</p>
      {made && (
        <p className="admin-made">
          {tl(TEXT.made).replace('{name}', made.name)} <code>{made.password}</code>
        </p>
      )}
      {failed && <p className="card-problem">{tl(TEXT.failed)}</p>}
      {list?.length === 0 && <p className="card-note">{tl(TEXT.none)}</p>}
      <ul>
        {list?.map((account) => (
          <li key={account.name}>
            <span>{account.name}</span>
            <small>{new Date(account.created).toLocaleDateString(lang)}</small>
            {asking === account.name ? (
              <>
                <button type="button" className="text-button" onClick={() => void reset(account.name)}>
                  {tl(TEXT.sure)}
                </button>
                <button type="button" className="text-button" onClick={() => setAsking(null)}>
                  {tl(TEXT.cancel)}
                </button>
              </>
            ) : (
              <button type="button" className="text-button" onClick={() => setAsking(account.name)}>
                {tl(TEXT.reset)}
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="admin-actions">
        <button type="button" className="text-button" onClick={onClose}>
          {tl(TEXT.close)}
        </button>
      </div>
    </div>
  );
}
