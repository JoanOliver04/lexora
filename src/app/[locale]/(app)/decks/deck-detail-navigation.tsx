import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { DeckDetail } from "@/modules/library/application/deck-detail";

export async function DeckDetailNavigation({
  deckId,
  result,
  pageSize,
  pageKey,
  query,
  label,
}: {
  deckId: string;
  result: DeckDetail["members"];
  pageSize: number;
  pageKey: "memberPage" | "availablePage";
  query: Record<string, string>;
  label: string;
}) {
  if (result.total <= pageSize) return null;
  const t = await getTranslations("Library");
  const page = Math.floor(result.offset / pageSize) + 1,
    pages = Math.ceil(result.total / pageSize);
  const target = (next: number) => ({
    pathname: `/decks/${deckId}`,
    query: { ...query, [pageKey]: String(next) },
  });
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 text-sm">
      {page > 1 ? (
        <Link
          href={target(page - 1)}
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          {t("pagination.previous")}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-(--color-ink-muted)">{t("pagination.status", { page, pages })}</span>
      {page < pages ? (
        <Link
          href={target(page + 1)}
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          {t("pagination.next")}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
