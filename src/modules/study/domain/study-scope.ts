export interface StudyScope {
  deckIds: string[] | null;
}

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/** Empty legacy snapshots mean all decks; invalid snapshots are not reused. */
export function studyScopeFromSnapshot(raw: unknown): StudyScope | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const ids = (raw as Record<string, unknown>)["deckIds"];
  if (ids === undefined || ids === null) return { deckIds: null };
  if (
    !Array.isArray(ids) ||
    ids.length > 100 ||
    !ids.every((id) => typeof id === "string" && UUID.test(id))
  )
    return null;
  return { deckIds: [...new Set(ids.map((id: string) => id.toLowerCase()))] };
}

export function studyScopeFromQuery(raw: unknown): StudyScope | null {
  if (raw === undefined) return { deckIds: null };
  return studyScopeFromSnapshot({ deckIds: typeof raw === "string" ? [raw] : raw });
}

export function studyScopeFromSelection(mode: unknown, deckIds: unknown): StudyScope | null {
  if (mode === "all") return { deckIds: null };
  if (mode !== "selected") return null;
  const scope = studyScopeFromSnapshot({ deckIds });
  return scope?.deckIds && scope.deckIds.length > 0 ? scope : null;
}

export function equalStudyScopes(a: StudyScope, b: StudyScope): boolean {
  if (a.deckIds === null || b.deckIds === null) return a.deckIds === b.deckIds;
  const ids = new Set(a.deckIds);
  return ids.size === b.deckIds.length && b.deckIds.every((id) => ids.has(id));
}
