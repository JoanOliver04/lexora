import { z } from "zod";
import { isIanaTimeZone } from "@/shared/domain/time-zone";
import { THEMES, type PreferencesSnapshot } from "../domain/preferences";

const version = z.iso.datetime({ offset: true });
const courseSelection = z.object({ courseId: z.uuid(), profileVersion: version }).strict();
const schema = courseSelection
  .extend({
    settingsVersion: version,
    uiLocale: z.enum(["es", "en"]),
    theme: z.enum(THEMES),
    timeZone: z.string().max(100).refine(isIanaTimeZone),
    dailyNewLimit: z.number().int().min(0).max(100),
    maximumReviews: z.number().int().min(0).max(2000).nullable(),
    showIntervals: z.boolean(),
  })
  .strict();

export type PreferenceChange = z.infer<typeof schema>;
export type CourseSelection = z.infer<typeof courseSelection>;
export class PreferencesError extends Error {
  constructor(public readonly kind: "conflict" | "unavailable" | "generic") {
    super(kind);
    this.name = "PreferencesError";
  }
}
export interface PreferencesRepository {
  read(ownerId: string): Promise<PreferencesSnapshot | null>;
  save(ownerId: string, change: PreferenceChange): Promise<void>;
  selectCourse(ownerId: string, change: CourseSelection): Promise<void>;
}
export type PreferencesResult =
  | { ok: true; locale?: "es" | "en" }
  | {
      ok: false;
      error: "invalid" | "conflict" | "unavailable" | "generic";
      fields: string[];
    };

export async function changePreferences(
  repository: PreferencesRepository,
  ownerId: string,
  input: unknown,
  courseOnly = false,
): Promise<PreferencesResult> {
  const parsed = courseOnly ? courseSelection.safeParse(input) : schema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: "invalid",
      fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "form")))],
    };
  try {
    if (courseOnly) await repository.selectCourse(ownerId, parsed.data);
    else await repository.save(ownerId, parsed.data as PreferenceChange);
    const locale = "uiLocale" in parsed.data ? parsed.data.uiLocale : undefined;
    return locale === "es" || locale === "en" ? { ok: true, locale } : { ok: true };
  } catch (error) {
    if (!(error instanceof PreferencesError)) throw error;
    return { ok: false, error: error.kind, fields: [] };
  }
}
