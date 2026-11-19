"use client";

import { useId } from "react";
import { Input, Label } from "@/shared/presentation/components";

function searchKey(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export function filterStudyDecks<T extends { title: string }>(decks: T[], query: string): T[] {
  const key = searchKey(query);
  return key ? decks.filter(({ title }) => searchKey(title).includes(key)) : decks;
}

export function DeckSearch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="search"
        maxLength={200}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
      />
    </div>
  );
}
