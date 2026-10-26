import type { SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const SunIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const MoonIcon = () => (
  <svg {...base}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
  </svg>
);

/* The six moods to start from (Panel). */
export const BoltIcon = () => (
  <svg {...base}>
    <path d="M13 3 5 13.5h6L10.5 21 19 10.5h-6.2L13 3Z" />
  </svg>
);

export const BulbIcon = () => (
  <svg {...base}>
    <path d="M9 17.5h6M10 20.5h4M8.2 14.6a6 6 0 1 1 7.6 0c-.6.5-.8 1-.8 1.9H9c0-.9-.2-1.4-.8-1.9Z" />
  </svg>
);

export const HeartIcon = () => (
  <svg {...base}>
    <path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10Z" />
  </svg>
);

export const TeaIcon = () => (
  <svg {...base}>
    <path d="M5 10h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5v-4ZM16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 3.500c0 1.2 1 1.3 1 2.500M12 3.500c0 1.2 1 1.3 1 2.5" />
  </svg>
);

export const StormIcon = () => (
  <svg {...base}>
    <path d="M7 15.500a4.5 4.5 0 1 1 1.2-8.800A5.5 5.5 0 0 1 18.8 9 3.3 3.3 0 0 1 18 15.500M12.5 12.5 10 16.500h3.500L11.5 21" />
  </svg>
);

export const BookIcon = () => (
  <svg {...base}>
    <path d="M12 6.5c-1.8-1.3-4.300-1.800-7.5-1.500v12.500c3.200-.3 5.700.2 7.5 1.500 1.800-1.3 4.300-1.800 7.5-1.500V5c-3.200-.3-5.700.2-7.5 1.500ZM12 6.500V19" />
  </svg>
);

export const DiceIcon = () => (
  <svg {...base}>
    <rect x="4.5" y="4.5" width="15" height="15" rx="3" />
    <path d="M9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01" strokeWidth={2.4} />
  </svg>
);

export const SearchIcon = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </svg>
);

export const CloseIcon = () => (
  <svg {...base}>
    <path d="M5 5l14 14M19 5 5 19" />
  </svg>
);

export const ChevronIcon = () => (
  <svg {...base} width={14} height={14}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/** Marks a link that leaves the site. */
export const ExternalIcon = () => (
  <svg {...base} width={12} height={12} strokeWidth={1.75}>
    <path d="M8 6h10v10M18 6 6 18" />
  </svg>
);

export const DownloadIcon = () => (
  <svg {...base} width={16} height={16}>
    <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
  </svg>
);
