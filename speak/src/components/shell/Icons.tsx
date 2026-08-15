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

