export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" role="img" aria-labelledby="planpal-mark-title">
      <title id="planpal-mark-title">PlanPal</title>
      <defs>
        <linearGradient id="planpal-bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#232F42" />
          <stop offset="1" stopColor="#0F141B" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#planpal-bg)" />
      <path
        d="M160 352 Q176 176 352 176"
        fill="none"
        stroke="#F6F7F9"
        strokeOpacity="0.3"
        strokeWidth="16"
        strokeLinecap="round"
      />
      <circle cx="160" cy="352" r="36" fill="#3B6EF6" />
      <circle cx="216" cy="220" r="34" fill="#E8842C" />
      <circle cx="352" cy="176" r="40" fill="#2FA36B" />
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
