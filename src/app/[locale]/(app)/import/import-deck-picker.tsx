"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Label } from "@/shared/presentation/components";
import type { DeckOptions } from "@/modules/library/application/library-options";
import { searchImportDeckOptions } from "./deck-options-action";

export function ImportDeckPicker({
  initial,
  selected,
  onSelect,
}: {
  initial: DeckOptions;
  selected: { id: string; title: string } | null;
  onSelect: (deck: { id: string; title: string }) => void;
}) {
  const t = useTranslations("Import");
  const [page, setPage] = useState(initial),
    [search, setSearch] = useState(""),
    [applied, setApplied] = useState(""),
    [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const latest = useRef(0);
  const load = (offset: number, term = applied) => {
    const request = ++latest.current;
    setFailed(false);
    start(async () => {
      try {
        const response = await searchImportDeckOptions({
          search: term.trim().replaceAll("\0", "").slice(0, 200).toWellFormed(),
          offset,
        });
        if (request !== latest.current) return;
        if (!response.ok) {
          setFailed(true);
          return;
        }
        setPage(response.page);
        setApplied(term);
      } catch {
        if (request === latest.current) setFailed(true);
      }
    });
  };
  const options =
    selected && !page.items.some((d) => d.id === selected.id)
      ? [selected, ...page.items]
      : page.items;
  return (
    <div className="flex min-w-0 flex-col gap-3" aria-busy={pending}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor="import-deck-search">{t("deckSearch")}</Label>
          <Input
            id="import-deck-search"
            type="search"
            maxLength={200}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                load(0, search);
              }
            }}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => load(0, search)}
        >
          {t("deckSearchSubmit")}
        </Button>
      </div>
      <Label htmlFor="import-deck">{t("execute.deck")}</Label>
      <select
        id="import-deck"
        name="deckId"
        value={selected?.id ?? ""}
        required
        className="w-full min-w-0 max-w-full min-h-11 rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-3"
        onChange={(e) => {
          const d = options.find((d) => d.id === e.target.value);
          if (d) onSelect(d);
        }}
      >
        {!selected ? (
          <option value="" disabled>
            {t("deckChoose")}
          </option>
        ) : null}
        {options.map((d) => (
          <option key={d.id} value={d.id}>
            {d.title}
          </option>
        ))}
      </select>
      <p role="status" className="text-sm text-(--color-ink-muted)">
        {failed
          ? t("deckSearchFailed")
          : t("deckSearchStatus", {
              total: page.total,
              page: page.offset / 20 + 1,
              pages: Math.max(1, Math.ceil(page.total / 20)),
            })}
      </p>
      <nav aria-label={t("deckPages")} className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={pending || page.offset === 0}
          onClick={() => load(Math.max(0, page.offset - 20))}
        >
          {t("deckPrevious")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending || page.offset + 20 >= page.total}
          onClick={() => load(page.offset + 20)}
        >
          {t("deckNext")}
        </Button>
      </nav>
    </div>
  );
}
