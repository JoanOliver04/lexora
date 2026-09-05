import { describe, expect, it } from "vitest";

import { classifyRow, isImportRowIssue } from "./row";

describe("classifyRow", () => {
  it("tres columnas con contenido → fila válida; etiquetas por espacios", () => {
    expect(classifyRow(["break the ice", "romper el hielo", "idioms phrasal_verbs"], 1, 3)).toEqual(
      {
        rowNumber: 1,
        front: "break the ice",
        back: "romper el hielo",
        tags: ["idioms", "phrasal_verbs"],
      },
    );
  });

  it("recorta los extremos de frente, reverso y campo de etiquetas", () => {
    const row = classifyRow(["  a  ", "  b  ", "  t  "], 7, 3);
    expect(row).toEqual({ rowNumber: 7, front: "a", back: "b", tags: ["t"] });
  });

  it("campo de etiquetas vacío → sin etiquetas, no una etiqueta en blanco", () => {
    const row = classifyRow(["a", "b", ""], 1, 3);
    expect(isImportRowIssue(row)).toBe(false);
    expect((row as { tags: string[] }).tags).toEqual([]);
  });

  it("menos de tres columnas → too_few_columns", () => {
    expect(classifyRow(["solo una"], 3, 3)).toEqual({ rowNumber: 3, code: "too_few_columns" });
  });

  it("más de tres columnas → too_many_columns", () => {
    expect(classifyRow(["a", "b", "c", "d"], 4, 3)).toEqual({
      rowNumber: 4,
      code: "too_many_columns",
    });
  });

  it("frente en blanco → front_empty; reverso en blanco → back_empty", () => {
    expect(classifyRow(["", "b", "t"], 1, 3)).toEqual({ rowNumber: 1, code: "front_empty" });
    expect(classifyRow(["a", "   ", "t"], 2, 3)).toEqual({ rowNumber: 2, code: "back_empty" });
  });

  it("`tagsColumn` mueve qué columna son las etiquetas; las otras dos, en orden, son frente y reverso", () => {
    expect(classifyRow(["idioms", "break the ice", "romper el hielo"], 1, 1)).toEqual({
      rowNumber: 1,
      front: "break the ice",
      back: "romper el hielo",
      tags: ["idioms"],
    });
  });
});
