"use server";
import { saveEoi } from "@/composition/eoi";
export async function submitEoi(
  courseId: string,
  input: string,
  media: Record<string, string>,
  token?: string,
) {
  try {
    return await saveEoi(courseId, input, media, token);
  } catch (error) {
    return { error: error instanceof Error ? error.message.slice(0, 280) : "save-failed" };
  }
}
