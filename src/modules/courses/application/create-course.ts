import { z } from "zod";

const inputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  targetLocale: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/),
  profileVersion: z.iso.datetime({ offset: true }),
});

export type CourseDraft = z.infer<typeof inputSchema>;
export type CreateCourseError = "invalid" | "conflict" | "limit" | "unavailable";
export type CreateCourseResult = { ok: true } | { ok: false; error: CreateCourseError };

export interface CourseCreationRepository {
  listTargetLocales(): Promise<string[]>;
  create(draft: CourseDraft): Promise<CreateCourseResult>;
}

export async function createCourse(
  repository: CourseCreationRepository,
  input: unknown,
): Promise<CreateCourseResult> {
  const parsed = inputSchema.safeParse(input);
  return parsed.success ? repository.create(parsed.data) : { ok: false, error: "invalid" };
}
