import { isIanaTimeZone } from "../domain/study-day";
import { summarizeStatistics, type StatisticsData } from "../domain/statistics";

export interface StatisticsRepository {
  read(input: {
    courseId: string;
    days: number;
    now: Date;
    timeZone: string;
    deckId: string | null;
  }): Promise<StatisticsData>;
}

export async function getStatistics(
  repository: StatisticsRepository,
  input: {
    ownerId: string;
    courseId: string;
    now: Date;
    timeZone: string;
    days: unknown;
    deck: unknown;
  },
) {
  if (!input.ownerId.trim()) throw new Error("Verified owner required");
  const days =
    input.days === undefined || input.days === ""
      ? 7
      : typeof input.days === "string" && ["7", "30", "90"].includes(input.days)
        ? Number(input.days)
        : null;
  const deckId = input.deck === undefined || input.deck === "" ? null : input.deck;
  if (
    !days ||
    !isIanaTimeZone(input.timeZone) ||
    (deckId !== null &&
      (typeof deckId !== "string" ||
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(deckId)))
  )
    return { ok: false as const };
  const data = await repository.read({
    courseId: input.courseId,
    days,
    now: input.now,
    timeZone: input.timeZone,
    deckId,
  });
  return {
    ok: true as const,
    days,
    deckId,
    statistics: summarizeStatistics(data, input.now, input.timeZone, days),
  };
}
