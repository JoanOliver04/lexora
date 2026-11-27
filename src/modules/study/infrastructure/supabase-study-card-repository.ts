import type { SupabaseClient } from "@supabase/supabase-js";

import { parsePracticeItemConfig } from "@/modules/library/application/practice-item";
import {
  practiceItemContentFrom,
  type PracticeItemContent,
} from "@/modules/library/application/practice-item-content";
import { PRACTICE_MODES } from "@/modules/library/domain/taxonomy";
import type { FreeStudyCard } from "@/modules/study/application/free-study";
import type { StudyCardRepository } from "@/modules/study/application/study-card";
import { StudyError, studyErrorFrom } from "@/modules/study/application/study-error";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

import { sourceContent, type SourceContent } from "@/modules/library/domain/eoi";
async function sourcesFor(client: SupabaseClient<Database>, courseId: string, rows: ItemRow[]) {
  const keys = [
    ...new Set(rows.flatMap((r) => parsePracticeItemConfig(r.config)?.exercise?.source ?? [])),
  ];
  if (!keys.length) return {} as Record<string, SourceContent>;
  const { data, error } = await client.rpc("eoi_read_sources", {
    p_course: courseId,
    p_keys: keys,
  });
  if (error) throw studyErrorFrom(error, "Could not read sources");
  return sourceContent(data);
}
const itemFields = "id, mode, prompt_text, answer_text, hint_text, config";

export function createSupabaseStudyCardRepository(
  client: SupabaseClient<Database>,
): StudyCardRepository {
  return {
    async findContent({ ownerId, courseId, practiceItemId }) {
      const { data, error } = await studyContentQuery(
        client,
        { ownerId, courseId },
        `${itemFields}, concepts!inner(id, example, explanation)`,
      )
        .eq("id", practiceItemId)
        .maybeSingle();
      if (error) throw studyErrorFrom(error, "Could not read study card content");
      if (!data) return null;
      const content = readContent(data, await sourcesFor(client, courseId, [data]));
      if (!content) throw new StudyError("unavailable", "Study card content is invalid");
      return {
        ...content,
        conceptId: data.concepts.id,
        exampleText: data.concepts.example,
        explanationText: data.concepts.explanation,
      };
    },
  };
}

function studyContentQuery<Fields extends string>(
  client: SupabaseClient<Database>,
  { ownerId, courseId }: { ownerId: string; courseId: string },
  fields: Fields,
) {
  return client
    .from("practice_items")
    .select(fields)
    .eq("owner_id", ownerId)
    .eq("enabled", true)
    .is("archived_at", null)
    .in("mode", [...PRACTICE_MODES])
    .eq("concepts.course_id", courseId)
    .is("concepts.archived_at", null);
}

type ItemRow = Pick<
  Database["public"]["Tables"]["practice_items"]["Row"],
  "mode" | "prompt_text" | "answer_text" | "hint_text" | "config"
>;

function readContent(
  row: ItemRow,
  sources: Record<string, SourceContent>,
): PracticeItemContent | null {
  const config = parsePracticeItemConfig(row.config);
  if (!config) return null;
  return practiceItemContentFrom(
    {
      mode: row.mode,
      promptText: row.prompt_text,
      answerText: row.answer_text,
      hintText: row.hint_text,
      config,
    },
    config.exercise?.source ? sources[config.exercise.source] : undefined,
  );
}

/** Free study reads owned content in small batches without reading or writing learning states. */
export async function listFreeStudyCards(
  client: SupabaseClient<Database>,
  scope: { ownerId: string; courseId: string },
  itemIds: string[],
): Promise<FreeStudyCard[]> {
  const { data, error } = await studyContentQuery(
    client,
    scope,
    `${itemFields}, concepts!inner()`,
  ).in("id", itemIds);
  if (error) throw studyErrorFrom(error, "Could not read free study cards");
  const sources = await sourcesFor(client, scope.courseId, data ?? []);
  return (data ?? []).flatMap((row) => {
    const content = readContent(row, sources);
    return content ? [{ id: row.id, content }] : [];
  });
}
