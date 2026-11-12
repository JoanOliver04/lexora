import { Link } from "@/i18n/navigation";

export function Brand({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`brand ${className}`} aria-label="Lexora">
      <span className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 28 28" fill="none" focusable="false">
          <path
            d="M6 5.5h6.5c3 0 4.5 1.5 4.5 4.5v12H10a4 4 0 0 1-4-4V5.5Z"
            fill="currentColor"
            opacity=".35"
          />
          <path d="M11 5.5h11V18a4 4 0 0 1-4 4h-7V5.5Z" fill="currentColor" />
          <path
            d="M14.5 11h4M14.5 14.5H18"
            stroke="var(--color-accent)"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span>
        Lexora
        <span className="brand-dot" aria-hidden="true">
          .
        </span>
      </span>
    </Link>
  );
}
