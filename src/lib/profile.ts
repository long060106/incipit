import { useEffect, useState } from 'react';
import { withCard } from './keeper';

/*
  Who made the site, for the page about it (/about) and the small line of credit. The words
  are the maker's own, written at the keeper's desk (/admin) and kept by the server
  (worker/index.ts, /api/profile and /api/portrait). Until any are written, the ones below
  stand in.
*/

export interface Profile {
  name: string;
  /** One line under the name. */
  line: string;
  /** Why the site was made, and a word about its maker: paragraphs parted by an empty line. */
  why: string;
  about: string;
  links: { label: string; url: string }[];
}

export interface Shown {
  profile: Profile;
  /** When the portrait was kept, or 0 when there is none. It is part of the picture's address. */
  portraitAt: number;
}

export const FIRST_WORDS: Profile = {
  name: 'Long Nguyen',
  line: 'Designer and developer of Incipit',
  why: [
    'I made Incipit because choosing a book had started to feel like filling in a form. Most sites ask for a genre, a rating, a bestseller list. None of them ask the question I actually have when I stand in front of a shelf: how do I want to feel?',
    'So this site works the other way round. You set a mood, and the books that fit it step forward. You can meet a book by its first lines alone, with no cover and no famous name to decide for you. And when a book is out of copyright, you can read it here or keep it, free and legally.',
    'It is also where I learned to build a whole website by myself, from the first page to the server behind it.',
  ].join('\n\n'),
  about: '',
  links: [],
};

const API = `${import.meta.env.BASE_URL}api`;
const KEY = 'incipit:profile';

export const portraitUrl = (at: number) => `${API}/portrait?v=${at}`;

const remembered = (): Shown => {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Shown | null;
    if (kept?.profile?.name) return kept;
  } catch {
    // Nothing kept, or nothing readable: the first words stand in.
  }
  return { profile: FIRST_WORDS, portraitAt: 0 };
};

const remember = (shown: Shown) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(shown));
  } catch {
    // No room to keep it: it is asked for again next time.
  }
};

/** The profile as last seen, then as the server has it now. */
export function useProfile(): [Shown, (shown: Shown) => void] {
  const [shown, setShown] = useState(remembered);
  useEffect(() => {
    let gone = false;
    fetch(`${API}/profile`)
      .then((response) => (response.ok ? (response.json() as Promise<{ profile: Profile | null; portraitAt: number }>) : null))
      .then((answer) => {
        if (!answer || gone) return;
        const next = { profile: answer.profile ?? FIRST_WORDS, portraitAt: answer.portraitAt };
        remember(next);
        setShown(next);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, []);
  return [
    shown,
    (next) => {
      remember(next);
      setShown(next);
    },
  ];
}

export async function writeProfile(code: string, profile: Profile): Promise<Profile | null> {
  const response = await fetch(`${API}/profile`, { method: 'PUT', headers: { ...withCard(code), 'content-type': 'application/json' }, body: JSON.stringify(profile) });
  return response.ok ? ((await response.json()) as { profile: Profile }).profile : null;
}

const PORTRAIT = 640; // px a side

/** The picture chosen, cut to a square from its middle and made small enough to keep. */
async function squared(picture: File): Promise<Blob> {
  const image = await createImageBitmap(picture);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PORTRAIT;
  const side = Math.min(image.width, image.height);
  // A portrait's face is nearer its top than its middle.
  canvas.getContext('2d')!.drawImage(image, (image.width - side) / 2, (image.height - side) * 0.3, side, side, 0, 0, PORTRAIT, PORTRAIT);
  const as = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.86));
  const made = (await as('image/webp')) ?? (await as('image/jpeg'));
  if (!made) throw new Error('no-picture');
  return made;
}

/** Keeps a new portrait and answers with the time it was kept, or null when it was refused. */
export async function keepPortrait(code: string, picture: File): Promise<number | null> {
  const image = await squared(picture);
  const response = await fetch(`${API}/portrait`, { method: 'PUT', headers: { ...withCard(code), 'content-type': image.type }, body: image });
  return response.ok ? ((await response.json()) as { portraitAt: number }).portraitAt : null;
}

export async function dropPortrait(code: string): Promise<boolean> {
  return (await fetch(`${API}/portrait`, { method: 'DELETE', headers: withCard(code) })).ok;
}
