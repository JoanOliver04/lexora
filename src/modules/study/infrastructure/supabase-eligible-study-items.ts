import type { SupabaseClient } from "@supabase/supabase-js";
import { V1_PRACTICE_MODES } from "@/modules/library/domain/taxonomy";
import { studyErrorFrom } from "@/modules/study/application/study-error";
import type { Database } from "@/shared/infrastructure/supabase/database.types";
import { STUDY_PAGE_SIZE, studyIdBatches } from "./read-study-rows";

interface Scope {
  ownerId: string;
  courseId: string;
  deckIds: string[] | null;
}

// Keep old placeholder rows out of queues until they have authored exercise content.
export const studyModeFilter = `mode.in.(${V1_PRACTICE_MODES.join(",")}),config->exercise.not.is.null`;

const membership = "id, concepts!inner(deck_concepts!inner(decks!inner()))";
const state = "id, due_at, phase, revision";
const recall = "stability, last_reviewed_at, scheduler_version, config_version";

function eligiblePage<Fields extends string>(
  client: SupabaseClient<Database>,
  { ownerId, courseId }: Scope,
  fields: Fields,
  batch: string[] | null,
  after: string | null,
) {
  let query = client
    .from("practice_items")
    .select(fields)
    .eq("owner_id", ownerId)
    .eq("enabled", true)
    .or(studyModeFilter)
    .is("archived_at", null)
    .eq("concepts.course_id", courseId)
    .is("concepts.archived_at", null)
    .eq("concepts.deck_concepts.decks.course_id", courseId)
    .is("concepts.deck_concepts.decks.archived_at", null)
    .limit(1, { referencedTable: "concepts.deck_concepts" })
    .order("id")
    .limit(STUDY_PAGE_SIZE);
  if (batch) query = query.in("concepts.deck_concepts.deck_id", batch);
  if (after) query = query.gt("id", after);
  return query;
}

async function* eligiblePages<Row extends { id: string }>(
  deckIds: Scope["deckIds"],
  page: (
    batch: string[] | null,
    after: string | null,
  ) => PromiseLike<{
    data: Row[] | null;
    error: { code: string; message: string } | null;
  }>,
) {
  for (const batch of deckIds === null ? [null] : studyIdBatches(deckIds)) {
    let after: string | null = null;
    for (;;) {
      const { data, error } = await page(batch, after);
      if (error) throw studyErrorFrom(error, "no se pudieron leer los ítems de la cola");
      if (!data) break;
      yield data;
      if (data.length < STUDY_PAGE_SIZE) break;
      after = data[data.length - 1]!.id;
    }
  }
}

export async function listEligibleStudyItemIds(client: SupabaseClient<Database>, scope: Scope) {
  const ids = new Set<string>();
  for await (const rows of eligiblePages(scope.deckIds, (batch, after) =>
    eligiblePage(client, scope, membership, batch, after),
  )) {
    for (const { id } of rows) ids.add(id);
  }
  return [...ids];
}

export function eligibleQueuePages(
  client: SupabaseClient<Database>,
  scope: Scope,
  withRecall: boolean,
) {
  // Left embedding keeps new cards that have no learning state yet.
  const fields = withRecall
    ? (`${membership}, learning_states(${state}, ${recall})` as const)
    : (`${membership}, learning_states(${state})` as const);
  return eligiblePages(scope.deckIds, (batch, after) =>
    eligiblePage(client, scope, fields, batch, after),
  );
}
