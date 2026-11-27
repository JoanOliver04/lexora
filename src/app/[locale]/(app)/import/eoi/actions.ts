"use server";
import { saveEoi } from "@/composition/eoi";
export async function submitEoi(input: string, media: Record<string, string>, token?: string) {
  try {
    return await saveEoi(input, media, token);
  } catch (error) {
    return { error: error instanceof Error ? error.message.slice(0, 280) : "save-failed" };
  }
}
