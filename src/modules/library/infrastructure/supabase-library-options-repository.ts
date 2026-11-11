import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/infrastructure/supabase/database.types";
import {
  conceptOptionsSchema,
  deckOptionsWireSchema,
  tagPreviewsSchema,
  type LibraryOptionsRepository,
} from "../application/library-options";
import { LibraryError, libraryErrorFrom } from "../application/library-error";

export function createSupabaseLibraryOptionsRepository(
  client: SupabaseClient<Database>,
): LibraryOptionsRepository {
  return {
    async concept(input) {
      const { data, error } = await client
        .rpc("read_library_concept_options", {
          p_owner_id: input.ownerId,
          p_course_id: input.courseId,
          p_concept_id: input.conceptId,
          p_tag_offset: input.tagOffset,
          p_item_offset: input.itemOffset,
        })
        .abortSignal(AbortSignal.timeout(12000));
      if (error) throw libraryErrorFrom(error, "concept options unavailable");
      if (data === null) return null;
      const result = conceptOptionsSchema.safeParse(data);
      if (!result.success) throw new LibraryError("unavailable", "invalid concept options");
      return result.data;
    },
    async tagPreviews(input) {
      if (input.conceptIds.length === 0) return [];
      const { data, error } = await client
        .rpc("read_library_tag_previews", {
          p_owner_id: input.ownerId,
          p_concept_ids: input.conceptIds,
        })
        .abortSignal(AbortSignal.timeout(12000));
      if (error) throw libraryErrorFrom(error, "tag previews unavailable");
      const result = tagPreviewsSchema.safeParse(data);
      if (!result.success || result.data.some((p) => !input.conceptIds.includes(p.conceptId)))
        throw new LibraryError("unavailable", "invalid tag previews");
      return result.data;
    },
    async decks(input) {
      const { data, error } = await client
        .rpc("read_library_deck_options", {
          p_owner_id: input.ownerId,
          p_course_id: input.courseId,
          p_search: input.search,
          p_offset: input.offset,
          ...(input.selectedId ? { p_selected_id: input.selectedId } : {}),
        })
        .abortSignal(AbortSignal.timeout(12000));
      if (error) throw libraryErrorFrom(error, "deck options unavailable");
      const result = deckOptionsWireSchema.safeParse(data);
      if (!result.success || (result.data.selected && result.data.selected.id !== input.selectedId))
        throw new LibraryError("unavailable", "invalid deck options");
      return result.data;
    },
  };
}
