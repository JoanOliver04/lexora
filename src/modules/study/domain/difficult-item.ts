import type { ReviewRating } from "./memory";

/** Ratings are newest first. Difficulty is independent of today's due date. */
export function isDifficultItem(lapses: number, recentRatings: readonly ReviewRating[]): boolean {
  return (
    lapses >= 3 || recentRatings.slice(0, 3).filter((rating) => rating === "again").length >= 2
  );
}
