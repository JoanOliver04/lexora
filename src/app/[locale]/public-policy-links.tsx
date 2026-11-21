import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const linkClass =
  "inline-flex min-h-11 min-w-11 items-center text-sm text-(--color-accent) underline underline-offset-4";

export function PublicPolicyLinks() {
  const privacy = useTranslations("Privacy");
  const terms = useTranslations("Terms");

  return (
    <nav aria-label={terms("navigation")} className="flex flex-wrap items-center gap-x-5">
      <Link href="/privacy" className={linkClass}>
        {privacy("title")}
      </Link>
      <Link href="/terms" className={linkClass}>
        {terms("title")}
      </Link>
    </nav>
  );
}
