import { useMemo, useState } from 'react';
import { BOOKS } from '../data/books';
import type { AxisId, GenreId, KeywordId, Mood } from '../data/types';
import { AXES, countryName, ELSEWHERE, GENRES, KEYWORDS, MOOD_PRESETS, type MoodPresetId } from '../data/vocab';
import { useI18n, type StringKey } from '../i18n';
import { countActive, EMPTY_FILTERS, type EraBand, type Filters, type LengthBand, type LevelBand, type SortId } from '../lib/match';
import type { CSSProperties, ReactNode } from 'react';
import { CountryField, type CountryOption } from './CountryField';
import { BoltIcon, BulbIcon, ChevronIcon, HeartIcon, SearchIcon, StormIcon, SunIcon, TeaIcon } from './Icons';
import { Roll } from './Roll';

const VISIBLE_THEMES = 10;

const LENGTHS: { id: LengthBand; label: StringKey }[] = [
  { id: 'short', label: 'short' },
  { id: 'medium', label: 'medium' },
  { id: 'long', label: 'long' },
];
const ERAS: { id: EraBand; label: StringKey }[] = [
  { id: 'pre1900', label: 'pre1900' },
  { id: 'c20', label: 'c20' },
  { id: 'c21', label: 'c21' },
];
const LEVELS: { id: LevelBand; label: StringKey }[] = [
  { id: 'easy', label: 'easy' },
  { id: 'moderate', label: 'moderate' },
  { id: 'demanding', label: 'demanding' },
];
const RATINGS = [3.8, 4, 4.2];
const SORTS: { id: Exclude<SortId, 'match'>; label: StringKey }[] = [
  { id: 'rating', label: 'sortRating' },
  { id: 'popular', label: 'sortPopular' },
];
const PRESET_ICONS: Record<MoodPresetId, ReactNode> = {
  feelgood: <SunIcon />,
  edgy: <BoltIcon />,
  think: <BulbIcon />,
  emotional: <HeartIcon />,
  cosy: <TeaIcon />,
  dark: <StormIcon />,
};

/** True when the sliders stand exactly where a preset puts them. */
const sameMood = (a: Partial<Mood>, b: Partial<Mood>) => {
  const keys = Object.keys(a) as AxisId[];
  return keys.length === Object.keys(b).length && keys.every((axis) => a[axis] === b[axis]);
};

interface PanelProps {
  /** False during the intro, when the panel is still invisible and must not take focus. */
  active: boolean;
  filters: Filters;
  onChange: (filters: Filters) => void;
  countLabel: string;
  /**
   * Whether the controls are showing. Closed, only the title bar is left: minimised in the
   * corner on a wide screen, a handle along the bottom edge on a narrow one.
   */
  open: boolean;
  onToggle: () => void;
}

export function Panel({ active, filters, onChange, countLabel, open, onToggle }: PanelProps) {
  const { t, tl, lang } = useI18n();
  const [allThemes, setAllThemes] = useState(false);
  const activeCount = countActive(filters);

  // Themes ordered by how many books carry them, so the short list is the useful one.
  const themes = useMemo(() => {
    const counts = new Map<KeywordId, number>();
    for (const book of BOOKS) for (const k of book.keywords) counts.set(k, (counts.get(k) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, []);

  const genres = useMemo(() => {
    const present = new Set<GenreId>(BOOKS.flatMap((book) => book.genres));
    return (Object.keys(GENRES) as GenreId[]).filter((id) => present.has(id));
  }, []);

  // Every country a book is set in, by name, with "somewhere else entirely" last.
  const countries = useMemo<CountryOption[]>(() => {
    const counts = new Map<string, number>();
    for (const book of BOOKS) {
      const codes = book.setting.countries.length ? book.setting.countries : [ELSEWHERE];
      for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([code, count]) => ({ code, count, name: countryName(code, lang) }))
      .sort((a, b) => (a.code === ELSEWHERE ? 1 : b.code === ELSEWHERE ? -1 : a.name.localeCompare(b.name, lang)));
  }, [lang]);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({ ...filters, [key]: value });

  const setMood = (axis: AxisId, value: number | undefined) => {
    const mood = { ...filters.mood };
    if (value === undefined) delete mood[axis];
    else mood[axis] = value;
    set('mood', mood);
  };

  const toggleTheme = (id: KeywordId) =>
    set('keywords', filters.keywords.includes(id) ? filters.keywords.filter((k) => k !== id) : [...filters.keywords, id]);

  const shownThemes = allThemes
    ? themes
    : themes.filter((id, i) => i < VISIBLE_THEMES || filters.keywords.includes(id));

  return (
    <aside className={`panel ${open ? 'is-open' : ''}`} aria-label={t('panelTitle')} inert={!active}>
      {/* The title bar: it stays when the panel is closed, and opens and closes it. */}
      <button type="button" className="panel-handle" onClick={onToggle} aria-expanded={open} aria-controls="panel-controls">
        <span className="panel-handle-label">
          {t('openFilters')}
          {activeCount > 0 && <span className="badge">{activeCount}</span>}
        </span>
        <span className="panel-handle-count">
          <span className="panel-handle-figure">{countLabel}</span>
          <ChevronIcon />
        </span>
      </button>

      <div className="panel-body" id="panel-controls" data-scroll>
        <label className="search">
          <span className="sr-only">{t('searchLabel')}</span>
          <SearchIcon />
          <input
            type="search"
            value={filters.query}
            placeholder={t('searchPlaceholder')}
            onChange={(event) => set('query', event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <section className="panel-section">
          <div className="panel-heading">
            <h2>{t('mood')}</h2>
            <p>{t('moodHint')}</p>
          </div>
          <div className="quick" role="group" aria-label={t('quickMoods')}>
            {MOOD_PRESETS.map((preset) => {
              const on = sameMood(filters.mood, preset.mood);
              return (
                <button key={preset.id} type="button" aria-pressed={on} onClick={() => set('mood', on ? {} : { ...preset.mood })}>
                  {PRESET_ICONS[preset.id]}
                  <span>{tl(preset.label)}</span>
                </button>
              );
            })}
          </div>
          {AXES.map((axis) => (
            <MoodSlider
              key={axis.id}
              low={tl(axis.low)}
              high={tl(axis.high)}
              value={filters.mood[axis.id]}
              onChange={(value) => setMood(axis.id, value)}
            />
          ))}
        </section>

        <section className="panel-section">
          <div className="panel-heading">
            <h2>{t('themes')}</h2>
          </div>
          <div className="chips">
            {shownThemes.map((id) => (
              <button
                key={id}
                type="button"
                className="chip"
                aria-pressed={filters.keywords.includes(id)}
                onClick={() => toggleTheme(id)}
              >
                {tl(KEYWORDS[id])}
              </button>
            ))}
            <button type="button" className="chip chip-more" onClick={() => setAllThemes((value) => !value)}>
              {allThemes ? t('fewerThemes') : t('moreThemes')}
            </button>
          </div>
        </section>

        <section className="panel-section panel-order">
          <Segmented
            label={t('sortBy')}
            options={SORTS}
            value={filters.sort === 'match' ? null : filters.sort}
            onChange={(v) => set('sort', v ?? 'match')}
          />
          <CountryField label={t('setting')} options={countries} value={filters.country} onChange={(code) => set('country', code)} />
        </section>

        <details className="panel-section more">
          <summary>
            <h2>{t('moreFilters')}</h2>
            <ChevronIcon />
          </summary>

          <div className="field">
            <label htmlFor="filter-genre">{t('genre')}</label>
            <select
              id="filter-genre"
              value={filters.genre ?? ''}
              onChange={(event) => set('genre', (event.target.value || null) as GenreId | null)}
            >
              <option value="">{t('anyGenre')}</option>
              {genres.map((id) => (
                <option key={id} value={id}>
                  {tl(GENRES[id])}
                </option>
              ))}
            </select>
          </div>

          <Segmented label={t('length')} options={LENGTHS} value={filters.length} onChange={(v) => set('length', v)} />
          <Segmented label={t('era')} options={ERAS} value={filters.era} onChange={(v) => set('era', v)} />
          <Segmented label={t('readingLevel')} options={LEVELS} value={filters.level} onChange={(v) => set('level', v)} />

          <div className="field">
            <span className="field-label" id="filter-rating">
              {t('rating')}
            </span>
            <div className="segmented" role="group" aria-labelledby="filter-rating">
              {RATINGS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={filters.minRating === n}
                  onClick={() => set('minRating', filters.minRating === n ? null : n)}
                >
                  {t('ratingAtLeast', { n: n.toFixed(1) })}
                </button>
              ))}
            </div>
          </div>

          <label className="check">
            <input type="checkbox" checked={filters.freeOnly} onChange={(event) => set('freeOnly', event.target.checked)} />
            <span>{t('freeOnly')}</span>
          </label>
        </details>
      </div>

      <div className="panel-foot">
        <span className="panel-count" aria-live="polite">
          {/* Re-keyed on change so the new figure ticks into place. */}
          <span key={countLabel}>{countLabel}</span>
        </span>
        <button type="button" className="text-button" disabled={activeCount === 0} onClick={() => onChange(EMPTY_FILTERS)}>
          <span className="u">{t('reset')}</span>
        </button>
        <button type="button" className="button panel-show" onClick={onToggle}>
          <Roll>{t('showBooks')}</Roll>
        </button>
      </div>
    </aside>
  );
}

interface MoodSliderProps {
  low: string;
  high: string;
  /** Undefined until the reader touches the slider; untouched axes are ignored. */
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

/** The slider stops at eleven notches, 0 to 10 tenths of the way along; the values it hands on are 0 to 100. */
const NOTCHES = 11;
const NOTCH_STEP = 100 / (NOTCHES - 1);
/** The notch in the middle, where an untouched slider rests: the scale runs both ways from it. */
const MIDDLE = (NOTCHES - 1) / 2;

function MoodSlider({ low, high, value, onChange }: MoodSliderProps) {
  const { t } = useI18n();
  const isSet = value !== undefined;
  // The notch the bead rests on (a value from a preset may lie between two: it is drawn on the nearer).
  const at = Math.round((value ?? 50) / NOTCH_STEP);

  return (
    // --v lets the stylesheet weight the two words by how far the bead sits towards each; --lo and --hi
    // are the stretch of the scale between the middle and the bead, which is drawn in brass.
    <div
      className={`mood ${isSet ? 'is-set' : ''}`}
      style={{ '--v': (value ?? 50) / 100, '--lo': Math.min(at, MIDDLE) / (NOTCHES - 1), '--hi': Math.max(at, MIDDLE) / (NOTCHES - 1) } as CSSProperties}
    >
      <div className="mood-ends">
        <span>{low}</span>
        {isSet && (
          <button type="button" className="mood-clear" onClick={() => onChange(undefined)}>
            {t('clear')}
          </button>
        )}
        <span>{high}</span>
      </div>
      <div className="mood-scale">
        {/* The notches of the scale; once a level is chosen, those between the middle and the bead are lit. */}
        <div className="mood-notches" aria-hidden="true">
          {Array.from({ length: NOTCHES }, (_, notch) => (
            <i key={notch} data-major={notch % 5 === 0 || undefined} data-on={(isSet && notch >= Math.min(at, MIDDLE) && notch <= Math.max(at, MIDDLE)) || undefined} />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={NOTCH_STEP}
          value={at * NOTCH_STEP}
          aria-label={`${low} / ${high}`}
          aria-valuetext={isSet ? `${at} / ${NOTCHES - 1}` : t('anywhere')}
          onChange={(event) => onChange(Number(event.target.value))}
          // A click that lands on the resting middle position changes nothing, so no change
          // event fires; treat the release as choosing that position.
          onPointerUp={(event) => {
            if (!isSet) onChange(Number(event.currentTarget.value));
          }}
        />
      </div>
    </div>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  options: { id: T; label: StringKey }[];
  value: T | null;
  onChange: (value: T | null) => void;
}

/** One-of-many choice where pressing the selected option again clears it. */
function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>) {
  const { t } = useI18n();
  const labelId = `segmented-${options[0].id}`;
  return (
    <div className="field">
      <span className="field-label" id={labelId}>
        {label}
      </span>
      <div className="segmented" role="group" aria-labelledby={labelId}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value === option.id}
            onClick={() => onChange(value === option.id ? null : option.id)}
          >
            {t(option.label)}
          </button>
        ))}
      </div>
    </div>
  );
}
