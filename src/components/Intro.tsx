import type { CSSProperties, Ref } from 'react';
import { SITE_NAME, useI18n } from '../i18n';
import { useProfile } from '../lib/profile';
import { pageUrl } from '../pages/PageHeader';
import { Roll } from './Roll';

const LETTERS = [...SITE_NAME];

interface IntroProps {
  /** True while the hero is on screen; its controls let go of focus otherwise. */
  active: boolean;
  onBrowse: () => void;
  /** The large name, handed up so the page's light can fall on its letters. */
  wordRef: Ref<HTMLHeadingElement>;
}

const HAND = `${import.meta.env.BASE_URL}hero/hand`;

/**
 * The scroll-driven opening.
 *
 * The hero is the name, what the word means, and one way in. The name is set a letter at a
 * time so each letter can rise on its own when the page opens and can paint its own share of
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
export function Intro({ active, onBrowse, wordRef }: IntroProps) {
  const { t } = useI18n();
  const [{ profile }] = useProfile();

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

        <p className="hero-def">
          <i>{t('defWord')}</i>
          <span className="hero-def-class">{t('defClass')}</span>
          {t('defMeaning')}
        </p>

        {/* Out of reach of the keyboard once the hero has faded. */}
        <div className="hero-actions" inert={!active}>
          <button type="button" className="button" onClick={onBrowse}>
            <Roll>{t('browse')}</Roll>
          </button>
          <span className="hero-hint">{t('scrollHint')}</span>
        </div>
      </section>

      {/* Who made the site, in one small line at the foot of the first page; the page about it says more. Beside it, the keeper's way in. */}
      <p className="hero-credit" inert={!active}>
        <a href={pageUrl('about')}>{t('developedBy', { name: profile.name })}</a>
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
