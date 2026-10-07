import { studyErrorFrom } from "@/modules/study/application/study-error";

// Below PostgREST's 1,000-row cap; bounded ID lists also keep URLs short.
export const STUDY_PAGE_SIZE = 500;
export const STUDY_ID_BATCH_SIZE = 100;

export function studyIdBatches(ids: readonly string[]): string[][] {
  const unique = [...new Set(ids)];
  const batches: string[][] = [];
  for (let offset = 0; offset < unique.length; offset += STUDY_ID_BATCH_SIZE) {
    batches.push(unique.slice(offset, offset + STUDY_ID_BATCH_SIZE));
  }
  return batches;
}

export async function readStudyRows<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { code?: string | null; message?: string } | null;
  }>,
  context: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += STUDY_PAGE_SIZE) {
    const { data, error } = await page(from, from + STUDY_PAGE_SIZE - 1);
    if (error) throw studyErrorFrom(error, context);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < STUDY_PAGE_SIZE) return rows;
  }
}
