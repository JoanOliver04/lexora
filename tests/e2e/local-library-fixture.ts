import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/shared/infrastructure/supabase/database.types";
import { PASSWORD } from "./helpers";

export async function checked<T>(
  query: PromiseLike<{ data: T; error: { message: string } | null }>,
) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

/** Synthetic owner fixture, never a hosted backend or administrative credential. */
export async function localLibraryFixture(email: string) {
  if (!email.endsWith("@example.com")) throw new Error("Synthetic account required");
  if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]) process.loadEnvFile(".env.local");
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
    parsed = new URL(url);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.port !== "54321")
    throw new Error("Acceptance fixtures require local Supabase");
  const client = createClient<Database>(url, process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: auth, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !auth.user) throw new Error("Synthetic owner sign-in failed");
  const ownerId = auth.user.id;
  const course = await checked(
    client.from("courses").select("id").eq("owner_id", ownerId).single(),
  );
  if (!course) throw new Error("Onboard the synthetic account first");
  const courseId = course.id,
    deckId = randomUUID(),
    conceptId = randomUUID(),
    itemId = randomUUID();
  async function cleanup() {
    try {
      await checked(client.from("courses").delete().eq("id", courseId).eq("owner_id", ownerId));
    } finally {
      await client.auth.signOut();
    }
  }
  try {
    await checked(
      client
        .from("decks")
        .insert({ id: deckId, owner_id: ownerId, course_id: courseId, title: "Acceptance deck" }),
    );
    await checked(
      client.from("concepts").insert({
        id: conceptId,
        owner_id: ownerId,
        course_id: courseId,
        kind: "vocabulary",
        title: "Acceptance concept",
        summary: "Original synthetic learning content",
      }),
    );
    await checked(
      client
        .from("deck_concepts")
        .insert({ deck_id: deckId, concept_id: conceptId, owner_id: ownerId }),
    );
    await checked(
      client.from("practice_items").insert({
        id: itemId,
        owner_id: ownerId,
        concept_id: conceptId,
        mode: "basic_recall",
        prompt_text: "An original question",
        answer_text: "An original answer",
        config: { mode: "basic_recall" },
      }),
    );
    return { client, email, ownerId, courseId, deckId, conceptId, itemId, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
