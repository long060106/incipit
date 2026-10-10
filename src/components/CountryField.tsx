import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n } from '../i18n';
import { fold } from '../lib/match';
import { CloseIcon } from './Icons';

export interface CountryOption {
  code: string;
  name: string;
  /** How many books are set there. */
  count: number;
}

interface CountryFieldProps {
  label: string;
  options: CountryOption[];
  /** The chosen country's code, or null for anywhere. */
  value: string | null;
  onChange: (code: string | null) => void;
}

/**
 * Choosing a country by typing its name. The list under the field narrows as the reader
 * types; the arrow keys walk it, Enter takes the highlighted country and Escape gives up.
 * An empty field means anywhere.
 */
export function CountryField({ label, options, value, onChange }: CountryFieldProps) {
  const { t } = useI18n();
  const id = useId();
  const listRef = useRef<HTMLUListElement>(null);
  /** What the reader has typed, or null while the field just shows the chosen country. */
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const selected = options.find((option) => option.code === value) ?? null;
  const query = fold((text ?? '').trim());

  const matches = useMemo(() => {
    if (!query) return options;
    // Names that begin with what was typed come before names that only contain it.
    const rank = (option: CountryOption) => {
      const name = fold(option.name);
      return name.startsWith(query) ? 0 : name.split(/[\s-]/).some((word) => word.startsWith(query)) ? 1 : name.includes(query) ? 2 : 3;
    };
    return options.filter((option) => rank(option) < 3).sort((a, b) => rank(a) - rank(b));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  // The list opens below the field; bring it into view inside the scrolling panel.
  useEffect(() => {
    if (open) listRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  const close = () => {
    setOpen(false);
    setText(null);
  };

  const choose = (code: string | null) => {
    onChange(code);
    close();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(Math.max(0, matches.findIndex((option) => option.code === value)));
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index) => (matches.length ? (index + step + matches.length) % matches.length : 0));
    } else if (event.key === 'Enter') {
      if (!open) return;
      event.preventDefault();
      if (matches[active]) choose(matches[active].code);
      else if (text !== null && !text.trim()) choose(null);
    } else if (event.key === 'Escape') {
      if (!open) return;
      // Only the list closes; the dialog or panel around it stays.
      event.stopPropagation();
      close();
    }
  };

  // Leaving the field with nothing in it clears the choice; leaving it half typed keeps the old one.
  const onBlur = () => {
    if (text !== null && !text.trim() && value) onChange(null);
    close();
  };

  return (
    <div className="field combo">
      <label htmlFor={id}>{label}</label>
      <div className="combo-box">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${id}-${matches[active].code}` : undefined}
          value={text ?? selected?.name ?? ''}
          placeholder={t('countryPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        />
        {selected && (
          <button
            type="button"
            className="combo-clear"
            aria-label={t('clearCountry')}
            // Keeps the field from taking the press as a blur first.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(null)}
          >
            <CloseIcon />
          </button>
        )}
      </div>
      {open && (
        <ul className="combo-list" id={`${id}-list`} role="listbox" aria-label={label} ref={listRef} data-scroll>
          {matches.map((option, index) => (
            <li
              key={option.code}
              id={`${id}-${option.code}`}
              role="option"
              aria-selected={option.code === value}
              data-active={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option.code)}
            >
              <span>{option.name}</span>
              <span className="combo-count">{option.count}</span>
            </li>
          ))}
          {matches.length === 0 && <li className="combo-empty">{t('noCountry')}</li>}
        </ul>
      )}
    </div>
  );
}
