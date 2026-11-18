import Image from "next/image";
import { Link } from "@/i18n/navigation";

export function Brand({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`brand ${className}`} aria-label="Lexora">
      <Image
        src="/icons/lexora-v2/brand-128.png"
        width={40}
        height={40}
        alt=""
        className="brand-symbol"
        loading="eager"
        unoptimized
      />
      <span>
        Lexora
        <span className="brand-dot" aria-hidden="true">
          .
        </span>
      </span>
    </Link>
  );
}
