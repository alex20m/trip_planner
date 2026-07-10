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
      <g transform="translate(256,460) scale(17.5) translate(-12,-22)">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#FAF8F4" />
      </g>
      <circle cx="224" cy="204" r="32" fill="#C15F3C" />
      <path d="M176 300 a48 40 0 0 1 96 0 Z" fill="#C15F3C" />
      <g stroke="#FAF8F4" strokeWidth="10">
        <circle cx="288" cy="204" r="32" fill="#E8842C" />
        <path d="M240 300 a48 40 0 0 1 96 0 Z" fill="#E8842C" />
      </g>
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
