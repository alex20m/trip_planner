import type { ReactNode } from "react";

type IconProps = { className?: string };

const base = "h-4 w-4";

function Svg({ className = base, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M15 18l-6-6 6-6" />
    </Svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 18l6-6-6-6" />
    </Svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function PencilIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </Svg>
  );
}

export function ShareIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.5l6.8-3.9M8.6 13.5l6.8 3.9" />
    </Svg>
  );
}

export function RefreshIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" />
      <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" />
      <path d="M3 16v4h4" />
      <path d="M21 8V4h-4" />
    </Svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 7h16" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
    </Svg>
  );
}

export function XIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M18 6L6 18M6 6l12 12" />
    </Svg>
  );
}

export function MoreIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M20 6L9 17l-5-5" />
    </Svg>
  );
}

export function SunIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  );
}

export function MoonIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </Svg>
  );
}

export function MonitorIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Svg>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 19h16" />
    </Svg>
  );
}

export function BedIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7" />
      <path d="M3 15h18" />
      <path d="M3 18v2M21 18v2" />
      <circle cx="8" cy="11" r="1.5" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function CompassIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" />
    </Svg>
  );
}

export function PlaneIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </Svg>
  );
}

export function NoteIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-5-5z" />
      <path d="M15 3v5h5" />
      <path d="M8 13h8M8 17h5" />
    </Svg>
  );
}

export function LogOutIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </Svg>
  );
}
