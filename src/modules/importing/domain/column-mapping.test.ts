import { describe, expect, it } from "vitest";

import { DEFAULT_COLUMN_MAPPING, applyColumnMapping } from "./column-mapping";
import type { RawImportRow } from "./row";

const rows: RawImportRow[] = [
  { rowNumber: 1, columns: ["break the ice", "romper el hielo", "idioms phrasal_verbs"] },
  { rowNumber: 2, columns: ["take off", "despegar", "phrasal_verbs"] },
];

describe("applyColumnMapping", () => {
  it("mapeo por defecto: frente 0, reverso 1, tags 2", () => {
    const { rows: mapped, issues } = applyColumnMapping(rows, DEFAULT_COLUMN_MAPPING);
    expect(issues).toEqual([]);
    expect(mapped).toEqual([
      {
        rowNumber: 1,
        front: "break the ice",
        back: "romper el hielo",
        tags: ["idioms", "phrasal_verbs"],
      },
      { rowNumber: 2, front: "take off", back: "despegar", tags: ["phrasal_verbs"] },
    ]);
  });

  it("reasignar columnas: tags en la primera, frente y reverso en las otras", () => {
    const { rows: mapped } = applyColumnMapping(
      [{ rowNumber: 1, columns: ["idioms", "break the ice", "romper el hielo"] }],
      { front: 1, back: 2, tags: 0 },
    );
    expect(mapped).toEqual([
      { rowNumber: 1, front: "break the ice", back: "romper el hielo", tags: ["idioms"] },
    ]);
  });

  it("sin columna de tags: filas válidas sin etiquetas", () => {
    const { rows: mapped } = applyColumnMapping([{ rowNumber: 1, columns: ["a", "b"] }], {
      front: 0,
      back: 1,
      tags: null,
    });
    expect(mapped).toEqual([{ rowNumber: 1, front: "a", back: "b", tags: [] }]);
  });

  it("una columna mapeada que no existe en la fila → too_few_columns", () => {
    const { rows: mapped, issues } = applyColumnMapping(
      [{ rowNumber: 3, columns: ["solo una"] }],
      DEFAULT_COLUMN_MAPPING,
    );
    expect(mapped).toEqual([]);
    expect(issues).toEqual([{ rowNumber: 3, code: "too_few_columns" }]);
  });

  it("frente o reverso en blanco → su código", () => {
    const { issues } = applyColumnMapping(
      [
        { rowNumber: 1, columns: ["", "b", "t"] },
        { rowNumber: 2, columns: ["a", "   ", "t"] },
      ],
      DEFAULT_COLUMN_MAPPING,
    );
    expect(issues).toEqual([
      { rowNumber: 1, code: "front_empty" },
      { rowNumber: 2, code: "back_empty" },
    ]);
  });

  it("columnas de más se ignoran: mapear entre 5 columnas es válido", () => {
    const { rows: mapped, issues } = applyColumnMapping(
      [{ rowNumber: 1, columns: ["a", "b", "c", "d", "e"] }],
      { front: 0, back: 4, tags: 2 },
    );
    expect(issues).toEqual([]);
    expect(mapped).toEqual([{ rowNumber: 1, front: "a", back: "e", tags: ["c"] }]);
  });
});
