import type { SupabaseClient } from "@supabase/supabase-js";

import { parsePracticeItemConfig } from "@/modules/library/application/practice-item";
import { practiceItemContentFrom } from "@/modules/library/application/practice-item-content";
import { V1_PRACTICE_MODES } from "@/modules/library/domain/taxonomy";
import type { StudyCardRepository } from "@/modules/study/application/study-card";
import { StudyError, studyErrorFrom } from "@/modules/study/application/study-error";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

export function createSupabaseStudyCardRepository(
  client: SupabaseClient<Database>,
): StudyCardRepository {
  return {
    async findContent({ ownerId, courseId, practiceItemId }) {
      const { data, error } = await client
        .from("practice_items")
        .select(
          "mode, prompt_text, answer_text, hint_text, config, concepts!inner(course_id, archived_at, example, explanation)",
        )
        .eq("owner_id", ownerId)
        .eq("id", practiceItemId)
        .eq("enabled", true)
        .is("archived_at", null)
        .in("mode", [...V1_PRACTICE_MODES])
        .eq("concepts.course_id", courseId)
        .is("concepts.archived_at", null)
        .maybeSingle();
      if (error) throw studyErrorFrom(error, "Could not read study card content");
      if (!data) return null;
      const config = parsePracticeItemConfig(data.config);
      const content =
        config &&
        practiceItemContentFrom({
          mode: data.mode,
          promptText: data.prompt_text,
          answerText: data.answer_text,
          hintText: data.hint_text,
          config,
        });
      if (!content) throw new StudyError("unavailable", "Study card content is invalid");
      return {
        ...content,
        exampleText: data.concepts.example,
        explanationText: data.concepts.explanation,
      };
    },
  };
}
