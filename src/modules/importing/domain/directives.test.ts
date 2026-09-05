import { describe, expect, it } from "vitest";

import { DEFAULT_TAGS_COLUMN, parseDirectiveLines, splitLeadingDirectiveLines } from "./directives";

describe("splitLeadingDirectiveLines", () => {
  it("corta en la primera línea que no empieza por `#`", () => {
    const { directiveLines, rest, dataStartLine } = splitLeadingDirectiveLines(
      "#separator:tab\n#tags column:3\na\tb\tc\n#no soy directiva\td\te",
    );
    expect(directiveLines).toEqual(["#separator:tab", "#tags column:3"]);
    expect(rest).toBe("a\tb\tc\n#no soy directiva\td\te");
    expect(dataStartLine).toBe(3);
  });

  it("sin directivas: dataStartLine es 1 y rest es el contenido entero", () => {
    const { directiveLines, rest, dataStartLine } = splitLeadingDirectiveLines("a\tb\tc");
    expect(directiveLines).toEqual([]);
    expect(rest).toBe("a\tb\tc");
    expect(dataStartLine).toBe(1);
  });

  it("tolera CRLF", () => {
    const { directiveLines, dataStartLine } = splitLeadingDirectiveLines(
      "#separator:comma\r\na,b,c\r\n",
    );
    expect(directiveLines).toEqual(["#separator:comma"]);
    expect(dataStartLine).toBe(2);
  });
});

describe("parseDirectiveLines", () => {
  it("interpreta separator, tags column y html", () => {
    expect(parseDirectiveLines(["#separator:semicolon", "#tags column:1", "#html:true"])).toEqual({
      separator: "semicolon",
      tagsColumn: 1,
      html: true,
    });
  });

  it("claves sin efecto en Lexora se ignoran sin romper", () => {
    expect(parseDirectiveLines(["#notetype column:1", "#deck column:2", "#columns:3"])).toEqual({
      separator: null,
      tagsColumn: DEFAULT_TAGS_COLUMN,
      html: null,
    });
  });

  it("tags column no numérica o fuera de rango cae en el valor por defecto", () => {
    expect(parseDirectiveLines(["#tags column:cero"]).tagsColumn).toBe(DEFAULT_TAGS_COLUMN);
    expect(parseDirectiveLines(["#tags column:0"]).tagsColumn).toBe(DEFAULT_TAGS_COLUMN);
  });

  it("un separator no reconocido no borra uno válido anterior", () => {
    expect(parseDirectiveLines(["#separator:tab", "#separator:pipe"]).separator).toBe("tab");
  });
});
