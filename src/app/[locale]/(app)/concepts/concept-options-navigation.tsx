import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function ConceptOptionsNavigation({
  conceptId,
  label,
  result,
  pageKey,
  otherPage,
}: {
  conceptId: string;
  label: string;
  result: { total: number; offset: number };
  pageKey: "tagPage" | "itemPage";
  otherPage: number;
}) {
  if (result.total <= 20) return null;
  const t = await getTranslations("Library");
  const current = result.offset / 20 + 1,
    pages = Math.ceil(result.total / 20);
  const href = (p: number) => ({
    pathname: `/concepts/${conceptId}`,
    query: {
      [pageKey]: String(p),
      [pageKey === "tagPage" ? "itemPage" : "tagPage"]: String(otherPage),
    },
  });
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 text-sm">
      {current > 1 ? (
        <Link href={href(current - 1)} className="inline-flex min-h-11 items-center underline">
          {t("pagination.previous")}
        </Link>
      ) : (
        <span />
      )}
      <span>{t("pagination.status", { page: current, pages })}</span>
      {current < pages ? (
        <Link href={href(current + 1)} className="inline-flex min-h-11 items-center underline">
          {t("pagination.next")}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
