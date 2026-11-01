import type { CSSProperties, Ref } from 'react';
import { MOOD_PRESETS } from '../data/vocab';
import { SITE_NAME, useI18n } from '../i18n';
import type { Filters } from '../lib/match';
import { pageUrl } from '../pages/PageHeader';
import { BookIcon } from './Icons';
import { PRESET_ICONS, SurpriseButton } from './Panel';
import { Roll } from './Roll';

const LETTERS = [...SITE_NAME];

interface IntroProps {
  /** True while the hero is on screen; its controls let go of focus otherwise. */
  active: boolean;
  onBrowse: () => void;
  /** Shows the wall answering what the reader pressed. */
  onWish: (wanted: Partial<Filters>) => void;
  /** Opens a book picked at random. */
  onSurprise: () => void;
  /** The large name, handed up so the page's light can fall on its letters. */
  wordRef: Ref<HTMLHeadingElement>;
}

const HAND = `${import.meta.env.BASE_URL}hero/hand`;

/**
 * The scroll-driven opening.
 *
 * The hero is the name, the same eight answers the panel opens with, so the first press can
 * already be "lift my spirits", and what the word means. The name is set a letter at a time so each letter can rise on its own when the page opens and can paint its own share of
 * the light that moves across the word (see lib/light.ts).
 *
 * The name arrives between two arms, Adam's and God's from Michelangelo's ceiling (cut out
 * by scripts/make-hands.mjs). They start almost touching, draw apart until each reaches in
 * from its side of the page to an end of the word, and then keep breathing towards each
 * other. A phone has no room beside the word, so there they meet above it, cut shorter.
 *
 * After the hero come three lines that say what the site does while the covers gather into
 * the wall. Opacity and position of each part come from CSS variables that App writes onto
 * the stage as the page scrolls.
 */
export function Intro({ active, onBrowse, onWish, onSurprise, wordRef }: IntroProps) {
  const { t, tl } = useI18n();

  return (
    <div className="intro">
      <section className="hero">
        <h1 className="hero-word" ref={wordRef} aria-label={SITE_NAME}>
          <span className="hands" aria-hidden="true">
            {(['left', 'right'] as const).map((side) => (
              <span key={side} className={`hand-rail hand-rail-${side}`}>
                <span className="hand">
                  <img src={`${HAND}-${side}.webp`} alt="" draggable={false} />
                </span>
              </span>
            ))}
          </span>
          {LETTERS.map((char, index) => (
            <span
              key={index}
              className="hero-letter"
              // --i counts from the left; --d is how far the letter stands from the middle.
              style={{ '--i': index, '--d': Math.abs(index - (LETTERS.length - 1) / 2) } as CSSProperties}
              aria-hidden="true"
            >
              <span className="hero-glyph">{char}</span>
            </span>
          ))}
        </h1>

        {/* Out of reach of the keyboard once the hero has faded. */}
        <div className="hero-actions" inert={!active}>
          <p className="hero-ask">{t('aBookTo')}</p>
          <div className="quick hero-quick" role="group" aria-label={t('aBookTo')}>
            {MOOD_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onWish({ mood: { ...preset.mood }, jolt: Boolean(preset.jolt) })}
              >
                {PRESET_ICONS[preset.id]}
                <span>{tl(preset.label)}</span>
              </button>
            ))}
            <button type="button" onClick={() => onWish({ kind: 'learn' })}>
              <BookIcon />
              <span>{t('teachMe')}</span>
            </button>
            <SurpriseButton onSurprise={onSurprise} />
          </div>
          <div className="hero-browse">
            <button type="button" className="button" onClick={onBrowse}>
              <Roll>{t('browse')}</Roll>
            </button>
            <span className="hero-hint">{t('scrollHint')}</span>
          </div>
        </div>

        <p className="hero-def">
          <i>{t('defWord')}</i>
          <span className="hero-def-class">{t('defClass')}</span>
          {t('defMeaning')}
        </p>
      </section>

      {/* The privacy policy, in one small line at the foot of the first page. Beside it, the keeper's way in. */}
      <p className="hero-credit" inert={!active}>
        <a href={pageUrl('privacy')}>{t('privacyLink')}</a>
        <a href={`${import.meta.env.BASE_URL}admin`}>{t('signInAdmin')}</a>
      </p>

      <p className="line line-1">{t('line1')}</p>
      <p className="line line-2">{t('line2')}</p>
      <div className="line line-3">
        <p>{t('line3')}</p>
        <p className="line-sub">{t('line3sub')}</p>
      </div>
    </div>
  );
}
