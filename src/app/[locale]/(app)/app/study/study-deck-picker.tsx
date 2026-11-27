"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState } from "react";
import { skills, type Skill } from "@/modules/library/domain/eoi";
import { Button, Input, Label } from "@/shared/presentation/components";

const PAGE_SIZE = 24;

function searchKey(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export function StudyDeckPicker({
  decks,
  selected,
  onSelectionChange,
}: {
  decks: readonly { id: string; title: string; category?: string | null }[];
  selected: string[];
  onSelectionChange: (selection: string[]) => void;
}) {
  const t = useTranslations("StudyDeckPicker");
  const eoi = useTranslations("Eoi");
  const [skill, setSkill] = useState<Skill | "">("");
  const id = useId();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [onlySelected, setOnlySelected] = useState(false);
  const filterButton = useRef<HTMLButtonElement>(null);
  const selection = useMemo(() => new Set(selected), [selected]);
  const indexed = useMemo(
    () => decks.map((deck) => ({ deck, key: searchKey(deck.title) })),
    [decks],
  );
  const matching = useMemo(() => {
    if (onlySelected) return indexed.filter(({ deck }) => selection.has(deck.id));
    const key = searchKey(query);
    return indexed.filter(
      (row) =>
        (!skill ||
          row.deck.category === skill ||
          (skill === "speaking" && row.deck.category === "pronunciation")) &&
        (!key || row.key.includes(key)),
    );
  }, [indexed, query, onlySelected, selection, skill]);
  const lastPage = Math.max(0, Math.ceil(matching.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, matching.length);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Button
        ref={filterButton}
        type="button"
        variant="secondary"
        className="w-fit"
        aria-pressed={onlySelected}
        onClick={() => {
          setOnlySelected(!onlySelected);
          setPage(0);
        }}
      >
        {t("onlySelected")}
      </Button>
      {!onlySelected && (
        <>
          {decks.some((d) => d.category) && (
            <label>
              {eoi("template")}
              <select
                className="block min-h-11 w-full rounded border px-2"
                value={skill}
                onChange={(e) => {
                  setSkill(e.target.value as Skill | "");
                  setPage(0);
                }}
              >
                <option value="">—</option>
                {skills.map((s) => (
                  <option key={s} value={s}>
                    {eoi(s)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Label htmlFor={id}>{t("search")}</Label>
          <Input
            id={id}
            type="search"
            maxLength={200}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
          />
        </>
      )}
      <p role="status" className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-(--color-ink-muted)">
        {matching.length === 0 && <span>{t(onlySelected ? "noneSelected" : "noResults")}</span>}
        {lastPage > 0 && (
          <span>{t("range", { start: start + 1, end, total: matching.length })}</span>
        )}
        {selected.length > 0 && <span>{t("selected", { count: selected.length })}</span>}
      </p>
      {matching.length > 0 && (
        <ul className="grid min-w-0 gap-2 sm:grid-cols-2">
          {matching.slice(start, end).map(({ deck }) => (
            <li key={deck.id} className="min-w-0">
              <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-3 rounded-(--radius-control) border border-(--color-border) bg-(--color-surface) p-2.5 has-checked:border-(--color-accent)">
                <input
                  type="checkbox"
                  className="size-5 shrink-0"
                  checked={selection.has(deck.id)}
                  onChange={(event) => {
                    if (onlySelected) filterButton.current?.focus();
                    onSelectionChange(
                      event.target.checked
                        ? [...selected, deck.id]
                        : selected.filter((value) => value !== deck.id),
                    );
                  }}
                />
                <span className="min-w-0 text-sm [overflow-wrap:anywhere]">{deck.title}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {lastPage > 0 && (
        <div role="group" aria-label={t("pagination")} className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            aria-disabled={currentPage === 0}
            className="aria-disabled:opacity-50"
            onClick={() => setPage(Math.max(0, currentPage - 1))}
          >
            {t("previous")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            aria-disabled={currentPage === lastPage}
            className="aria-disabled:opacity-50"
            onClick={() => setPage(Math.min(lastPage, currentPage + 1))}
          >
            {t("next")}
          </Button>
        </div>
      )}
    </div>
  );
}
