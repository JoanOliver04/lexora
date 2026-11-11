import { getTranslations } from "next-intl/server";
import { CONCEPT_KINDS, type ConceptKind } from "@/modules/library/domain/taxonomy";
import { MEMORY_PHASES } from "@/modules/study/domain/memory";
import type { StatisticsBreakdown } from "@/modules/study/domain/statistics";

export async function StatisticsBreakdowns({
  byKind,
  byLevel,
  locale,
}: {
  byKind: StatisticsBreakdown[];
  byLevel: StatisticsBreakdown[];
  locale: string;
}) {
  const t = await getTranslations("Statistics");
  const h = await getTranslations("History");
  const c = await getTranslations("Concepts");
  const n = new Intl.NumberFormat(locale);
  return (
    <section
      aria-labelledby="breakdowns-title"
      className="flex min-w-0 flex-col gap-5 border-t border-(--color-border) pt-7"
    >
      <h2 id="breakdowns-title" className="text-xl font-semibold break-words">
        {t("breakdowns")}
      </h2>
      <p className="max-w-prose text-sm leading-relaxed text-(--color-ink-muted)">
        {t("breakdownNote")}
      </p>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        {[
          { kind: true, rows: byKind, title: t("byKind") },
          { kind: false, rows: byLevel, title: t("byLevel") },
        ].map(({ kind, rows, title }) => (
          <details
            key={title}
            className="min-w-0 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-4 sm:p-5"
          >
            <summary className="min-h-11 cursor-pointer py-2 font-semibold break-words">
              {title}
            </summary>
            {rows.length === 0 ? (
              <p className="py-4 text-sm text-(--color-ink-muted)">{t("noBreakdown")}</p>
            ) : (
              <ul className="divide-y divide-(--color-border)">
                {rows.map((row) => {
                  const label =
                    kind && CONCEPT_KINDS.includes(row.key as ConceptKind)
                      ? c(`kinds.${row.key}`)
                      : row.key === "unassigned"
                        ? t("unassigned")
                        : row.key;
                  return (
                    <li key={row.key} className="min-w-0 py-4">
                      <h3 className="mb-3 font-medium break-words">{label}</h3>
                      <dl className="grid gap-3 text-sm">
                        <div className="flex flex-wrap justify-between gap-2">
                          <dt className="text-(--color-ink-muted)">{t("reviewsInPeriod")}</dt>
                          <dd className="font-medium tabular-nums">{n.format(row.reviews)}</dd>
                        </div>
                        {MEMORY_PHASES.map((phase) => (
                          <div key={phase} className="flex flex-wrap justify-between gap-2">
                            <dt>{h(`phases.${phase}`)}</dt>
                            <dd className="tabular-nums">{n.format(row.states[phase])}</dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  );
                })}
              </ul>
            )}
          </details>
        ))}
      </div>
    </section>
  );
}
