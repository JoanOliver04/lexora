import { z } from "zod";
import { resolveCourseLanguage } from "../domain/course-language";

const inputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  language: z
    .string()
    .trim()
    .normalize()
    .min(1)
    .max(80)
    .refine((name) => /\p{L}/u.test(name) && !/\p{Cc}/u.test(name)),
  profileVersion: z.iso.datetime({ offset: true }),
});

export type CourseDraft = Omit<z.infer<typeof inputSchema>, "language"> &
  ReturnType<typeof resolveCourseLanguage>;
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
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { language, ...draft } = parsed.data;
  let catalogue: string[];
  try {
    catalogue = await repository.listTargetLocales();
  } catch {
    return { ok: false, error: "unavailable" };
  }
  return repository.create({ ...draft, ...resolveCourseLanguage(language, catalogue) });
}
