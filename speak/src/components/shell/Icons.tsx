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

export function CheckCircleIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m7.5 12.3 3 3 6-6.3" />
    </IconFrame>
  );
}

/** The Feed tab: one card with two lines on it (glass-B-1). */
export function CardIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect x="3.5" y="4" width="17" height="16" rx="3" />
      <path d="M7.5 10h9M7.5 14h6" />
    </IconFrame>
  );
}

export function ThumbsDownIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </IconFrame>
  );
}

export function FlagIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M5 21V4" />
      <path d="M5 4h13l-4 4.5 4 4.5H5" />
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

export function HomeIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </IconFrame>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.4A8.5 8.5 0 1 1 21 12Z" />
    </IconFrame>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" />
    </IconFrame>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </IconFrame>
  );
}

export function ThumbsUpIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </IconFrame>
  );
}

export function HeartIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
  return (
    <IconFrame {...props} fill={filled ? 'currentColor' : 'none'}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </IconFrame>
  );
}

export function CommentIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </IconFrame>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </IconFrame>
  );
}

export function FriendsIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </IconFrame>
  );
}

export function WorkIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </IconFrame>
  );
}

export function ThinkingIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M12 2a7 7 0 0 0-7 7c0 2.5 1.3 4.7 3.2 6 .5.3.8.9.8 1.5v1.5a1.5 1.5 0 0 0 1.5 1.5h3a1.5 1.5 0 0 0 1.5-1.5V16.5c0-.6.3-1.2.8-1.5 1.9-1.3 3.2-3.5 3.2-6a7 7 0 0 0-7-7Z" />
      <path d="M9 22h6" />
    </IconFrame>
  );
}

export {
  ThumbsUpIcon as ThumbsUp,
  ThumbsDownIcon as ThumbsDown,
  HeartIcon as Heart,
  CommentIcon as Comment,
  SendIcon as Send,
  FriendsIcon as Friends,
  WorkIcon as Work,
  ThinkingIcon as Thinking,
  VolumeIcon as Volume,
  MicrophoneIcon as Microphone,
  CheckIcon as Check,
  HomeIcon as Home,
  ChatIcon as Chat,
  CloseIcon as Close,
};
