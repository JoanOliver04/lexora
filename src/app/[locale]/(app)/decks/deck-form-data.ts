import type { DeckFieldDefaults } from "./deck-fields";

export function draftFromForm(formData: FormData) {
  return {
    title: formData.get("title"),
    description: formData.get("description"),
    cefrLevel: formData.get("cefrLevel"),
    category: formData.get("category"),
  };
}

export function fieldValuesFromForm(formData: FormData): DeckFieldDefaults {
  const draft = draftFromForm(formData);
  const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "");
  return {
    title: text(draft.title),
    description: text(draft.description),
    cefrLevel: text(draft.cefrLevel),
    category: text(draft.category),
  };
}
