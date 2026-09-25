import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function IconFrame({ children, ...props }: IconProps) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function FeedIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </IconFrame>
  );
}

export function BrowseIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </IconFrame>
  );
}

export function SpeakIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 18v4M8 22h8" />
    </IconFrame>
  );
}

export function YouIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </IconFrame>
  );
}

export function DailyIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M7 8h10M7 12h7" />
    </IconFrame>
  );
}


export function LibraryIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m19 11-8-8-8 8" />
      <path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10" />
      <path d="M9 21v-6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6" />
    </IconFrame>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </IconFrame>
  );
}

export function VoiceGymIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 18v4M8 22h8" />
    </IconFrame>
  );
}

export function SavedIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </IconFrame>
  );
}

export function StarIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
  return (
    <IconFrame {...props} fill={filled ? 'currentColor' : 'none'}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </IconFrame>
  );
}

export function TodayIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M5 4.5h14v15H5z" />
      <path d="M8 2.5v4M16 2.5v4M8 10h8M8 14h5" />
    </IconFrame>
  );
}

export function CoachIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M5 14a7 7 0 0 1 14 0" />
      <path d="M8 14v3M12 11v6M16 13v4" />
      <path d="M4 19h16" />
    </IconFrame>
  );
}

export function PracticeIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M7 4h10a2 2 0 0 1 2 2v12H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </IconFrame>
  );
}

export function ProgressIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 18V9M10 18V5M16 18v-7M22 18V3" />
      <path d="M3 20h19" />
    </IconFrame>
  );
}

export function CaptureIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M12 5v14M5 12h14" />
    </IconFrame>
  );
}

export function MicrophoneIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
    </IconFrame>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </IconFrame>
  );
}

export function BookmarkIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
  return (
    <IconFrame {...props} fill={filled ? 'currentColor' : 'none'}>
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
    </IconFrame>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M15 5l-7 7 7 7" />
    </IconFrame>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m9 5 7 7-7 7" />
    </IconFrame>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m4 12.5 5 5L20 6.5" />
    </IconFrame>
  );
}

export function ThumbsDownIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Zm2 9h8.5a2 2 0 0 0 2-1.6l1.5-6A2 2 0 0 0 19 9h-5l1-5a2 2 0 0 0-3.9-1L9 10v10Z" />
    </IconFrame>
  );
}

export function VolumeIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
    </IconFrame>
  );
}
