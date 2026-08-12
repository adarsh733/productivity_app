import type { SVGProps } from 'react';

/**
 * Tab icons — drawn 22px SVGs.
 *
 * 22×22 viewBox 0 0 24 24, fill="none", stroke="currentColor", strokeWidth="1.5".
 * aria-hidden="true" on all four; text label carries meaning.
 */

export function FeedIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="5" y="7" width="14" height="14" rx="2" />
      <path d="M7 4h10a2 2 0 0 1 2 2v10" opacity="0.5" />
    </svg>
  );
}

export function CaptureIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

export function HindiIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fontSize="16"
        fontFamily="var(--sans)"
        fontWeight="500"
        fill="currentColor"
        stroke="none"
      >
        अ
      </text>
    </svg>
  );
}

export function YouIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <polyline points="4 16 10 12 14 14 20 8" />
      <circle cx="4" cy="16" r="1.5" fill="currentColor" />
      <circle cx="10" cy="12" r="1.5" fill="currentColor" />
      <circle cx="14" cy="14" r="1.5" fill="currentColor" />
      <circle cx="20" cy="8" r="1.5" fill="currentColor" />
    </svg>
  );
}
