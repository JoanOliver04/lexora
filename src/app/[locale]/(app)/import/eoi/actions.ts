"use server";
import {
  saveEoi,
  findEditorSources,
  selectEditorSource,
  maintainEditorAudio,
} from "@/composition/eoi";
export async function submitEoi(
  courseId: string,
  input: string,
  media: Record<string, string>,
  token?: string,
  version?: string,
) {
  try {
    return await saveEoi(courseId, input, media, token, version);
  } catch (error) {
    return { error: error instanceof Error ? error.message.slice(0, 280) : "save-failed" };
  }
}

export async function searchSources(course: string, filter: string) {
  return findEditorSources(course, filter);
}
export async function chooseSource(course: string, key: string) {
  return selectEditorSource(course, key);
}
export async function clearRetiredAudio(course: string) {
  await maintainEditorAudio(course);
}
