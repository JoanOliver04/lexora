import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/infrastructure/supabase/database.types";
import { deckDetailSchema, type DeckDetailRepository } from "../application/deck-detail";
import { LibraryError, libraryErrorFrom } from "../application/library-error";

export function createSupabaseDeckDetailRepository(
  client: SupabaseClient<Database>,
): DeckDetailRepository {
  return {
    async read(input) {
      const { data, error } = await client
        .rpc("read_library_deck_detail", {
          p_owner_id: input.ownerId,
          p_course_id: input.courseId,
          p_deck_id: input.deckId,
          p_member_search: input.memberSearch,
          p_available_search: input.availableSearch,
          p_member_offset: input.memberOffset,
          p_available_offset: input.availableOffset,
          p_limit: input.limit,
        })
        .abortSignal(AbortSignal.timeout(12000));
      if (error) throw libraryErrorFrom(error, "no se pudo leer el detalle del mazo");
      if (data === null) return null;
      const result = deckDetailSchema.safeParse(data);
      if (
        !result.success ||
        result.data.deck.id !== input.deckId ||
        result.data.deck.courseId !== input.courseId ||
        result.data.deck.ownerId !== input.ownerId
      )
        throw new LibraryError("unavailable", "detalle de mazo no valido");
      return result.data;
    },
  };
}
