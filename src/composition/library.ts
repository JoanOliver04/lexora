import { type DeckRepository } from "@/modules/library/application/deck";
import { type ConceptRepository } from "@/modules/library/application/concept";
import { type PracticeItemRepository } from "@/modules/library/application/practice-item";
import { type TagRepository } from "@/modules/library/application/tag";
import { createSupabaseConceptRepository } from "@/modules/library/infrastructure/supabase-concept-repository";
import { createSupabaseDeckRepository } from "@/modules/library/infrastructure/supabase-deck-repository";
import { createSupabasePracticeItemRepository } from "@/modules/library/infrastructure/supabase-practice-item-repository";
import { createSupabaseTagRepository } from "@/modules/library/infrastructure/supabase-tag-repository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server-client";

/**
 * Raíz de composición del módulo `library` (LEX-3.4).
 *
 * `src/composition/` es el único sitio que conoce a la vez los puertos y sus
 * implementaciones concretas (ADR-001). Aquí no hay lógica: solo cableado.
 *
 * En vez de exponer veinte funciones `hacerXParaElUsuarioActual`, se expone
 * **un contexto**: el `ownerId` del usuario autenticado en la petición y los
 * cuatro repositorios ya ligados a su cliente. Las Server Actions de LEX-3.5+
 * lo piden una vez y llaman a los casos de uso de `application/` con
 * `contexto.ownerId` y el repositorio que toque. Los repositorios se devuelven
 * con el **tipo de puerto**, no la clase concreta: la presentación nunca ve
 * infraestructura.
 */

export interface LibraryContext {
  ownerId: string;
  decks: DeckRepository;
  concepts: ConceptRepository;
  practiceItems: PracticeItemRepository;
  tags: TagRepository;
}

/**
 * Contexto de biblioteca del usuario **autenticado en la petición en curso**, o
 * `null` si no hay sesión válida. La identidad sale de `getClaims()` —firma
 * verificada—, nunca de un parámetro (MASTER_SPEC §16.1). Quién puede llegar
 * hasta aquí sin sesión lo decide la protección de rutas (LEX-2.6).
 */
export async function getLibraryContextForCurrentUser(): Promise<LibraryContext | null> {
  const client = await createSupabaseServerClient();

  const { data, error } = await client.auth.getClaims();
  const ownerId = data?.claims.sub;
  if (error || !ownerId) {
    return null;
  }

  return {
    ownerId,
    decks: createSupabaseDeckRepository(client),
    concepts: createSupabaseConceptRepository(client),
    practiceItems: createSupabasePracticeItemRepository(client),
    tags: createSupabaseTagRepository(client),
  };
}
