import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  collectionPageQuery,
  withoutCollectionFilter,
  COLLECTION_PAGE_SIZE,
} from "../library-query";

type CollectionPath = "/decks" | "/concepts";
type CollectionQuery = Record<string, string>;

export function CollectionResults({
  pathname,
  query,
  filters,
  total,
  page,
}: {
  pathname: CollectionPath;
  query: CollectionQuery;
  filters: { key: string; label: string }[];
  total: number;
  page: number;
}) {
  const t = useTranslations("Collection");
  const from = total === 0 ? 0 : (page - 1) * COLLECTION_PAGE_SIZE + 1;
  return (
    <div className="collection-results">
      <p className="collection-count" role="status">
        {t("results", { from, to: Math.min(page * COLLECTION_PAGE_SIZE, total), total })}
      </p>
      {filters.length > 0 && (
        <ul className="collection-filters" aria-label={t("activeFilters")}>
          {filters.map((filter) => (
            <li key={filter.key}>
              <Link
                href={{ pathname, query: withoutCollectionFilter(query, filter.key) }}
                aria-label={t("removeFilter", { label: filter.label })}
                className="collection-chip"
              >
                <span>{filter.label}</span>
                <span aria-hidden="true">×</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CollectionPagination({
  pathname,
  query,
  page,
  pages,
}: {
  pathname: CollectionPath;
  query: CollectionQuery;
  page: number;
  pages: number;
}) {
  const t = useTranslations("Collection");
  if (pages <= 1) return null;
  return (
    <nav className="collection-pagination" aria-label={t("pagination")}>
      {page > 1 ? (
        <Link rel="prev" href={{ pathname, query: collectionPageQuery(query, page - 1) }}>
          {t("previous")}
        </Link>
      ) : (
        <span />
      )}
      <span>{t("page", { page, pages })}</span>
      {page < pages ? (
        <Link rel="next" href={{ pathname, query: collectionPageQuery(query, page + 1) }}>
          {t("next")}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function CollectionEmpty({
  pathname,
  filtered,
  message,
}: {
  pathname: CollectionPath;
  filtered: boolean;
  message: string;
}) {
  const t = useTranslations("Collection");
  return (
    <div className="collection-empty">
      <p>{message}</p>
      <Link
        href={
          filtered ? pathname : `${pathname}#${pathname === "/decks" ? "new-deck" : "new-concept"}`
        }
        className="collection-action"
      >
        {t(filtered ? "clear" : "create")}
      </Link>
    </div>
  );
}
