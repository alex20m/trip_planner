export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" role="img" aria-labelledby="planpal-mark-title">
      <title id="planpal-mark-title">PlanPal</title>
      <defs>
        <linearGradient id="planpal-bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3A2E26" />
          <stop offset="1" stopColor="#1A1613" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#planpal-bg)" />
      <g transform="translate(256,256) scale(15) translate(-12,-12)">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#FAF8F4" />
      </g>
      <circle cx="222" cy="205" r="40" fill="#C15F3C" />
      <circle cx="290" cy="205" r="52" fill="#FAF8F4" />
      <circle cx="290" cy="205" r="40" fill="#E8842C" />
    </svg>
  );
}

export default function Logo({
  className = "h-8 w-8",
  textClassName = "text-xl",
  hideWordmark = false
}: {
  className?: string;
  textClassName?: string;
  hideWordmark?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark className={className} />
      {!hideWordmark && (
        <span className={`font-bold tracking-tight ${textClassName}`}>PlanPal</span>
      )}
    </span>
  );
}
