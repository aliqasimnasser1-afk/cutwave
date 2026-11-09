export default function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="logo-mark"
    >
      <defs>
        <linearGradient id="cw-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c5cff" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#cw-logo)" />
      <g fill="#fff">
        <rect x="11" y="27" width="4" height="10" rx="2" opacity=".55" />
        <rect x="25" y="19" width="4" height="26" rx="2" />
        <rect x="32" y="14" width="4" height="36" rx="2" />
        <rect x="39" y="22" width="4" height="20" rx="2" />
        <rect x="49" y="28" width="4" height="8" rx="2" opacity=".55" />
      </g>
      <path
        d="M22 16h-3v32h3M46 16h3v32h-3"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
