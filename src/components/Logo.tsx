interface LogoProps {
  size?: number;
  className?: string;
}

export default function Logo({ size = 48, className = '' }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bpGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0d9488" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill="url(#bpGrad)" />
      <path
        d="M10 25h6l2.5-6 4 11 3-7 2 2h10.5"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="25" r="2" fill="#fff" />
      <circle cx="38" cy="25" r="2" fill="#fff" />
      <path
        d="M10 38c4 2 8 2 12 0s8-2 12 0"
        stroke="#99f6e4"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
