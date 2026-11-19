import "server-only";
import { changePreferences } from "@/modules/preferences/application/preferences";
import { createSupabasePreferencesRepository } from "@/modules/preferences/infrastructure/supabase-preferences-repository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server-client";

async function context() {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getClaims();
  const ownerId = data?.claims.sub;
  return error || !ownerId
    ? null
    : { ownerId, repository: createSupabasePreferencesRepository(client) };
}
export async function getPreferencesForCurrentUser() {
  const ctx = await context();
  return ctx ? ctx.repository.read(ctx.ownerId) : null;
}
export async function savePreferencesForCurrentUser(input: unknown, courseOnly = false) {
  const ctx = await context();
  return ctx ? changePreferences(ctx.repository, ctx.ownerId, input, courseOnly) : null;
}
export async function getIntervalPreviewForCurrentUser(courseId: string) {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims.sub) return true;
  const result = await client
    .from("course_settings")
    .select("show_interval_preview")
    .eq("course_id", courseId)
    .eq("user_id", data.claims.sub)
    .maybeSingle();
  if (result.error) throw new Error("Study appearance unavailable");
  return result.data?.show_interval_preview ?? true;
}
