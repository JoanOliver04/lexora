import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Regresión de la regla de dependencia entre capas (ADR-001, LEX-1.3).
 *
 * LEX-1.3 dejó la regla comprobada **a mano**: se escribieron ficheros que la
 * violaban, se vio fallar el lint y se borraron. Eso demuestra que funcionaba
 * aquel día. No impide que un cambio futuro en `eslint.config.mjs` la desactive
 * sin que nadie lo note, y una regla de arquitectura que ha dejado de aplicarse
 * en silencio es peor que no tenerla: da una seguridad que ya no existe.
 *
 * Este test cierra ese hueco. Ejecuta ESLint sobre código que viola la regla y
 * exige que falle. No comprueba el código del proyecto: comprueba **la regla**.
 *
 * `lintText` recibe un `filePath` que no existe en disco. Es deliberado: la ruta
 * es lo que determina qué bloque de configuración se aplica, así que basta con
 * que tenga la forma correcta.
 */

const eslint = new ESLint();

async function lint(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages ?? [];
}

function restrictedImportErrors(messages: Awaited<ReturnType<typeof lint>>) {
  return messages.filter((message) => message.ruleId === "no-restricted-imports");
}

describe("la capa de dominio", () => {
  it("no puede importar React", async () => {
    const messages = await lint(
      "src/modules/example/domain/thing.ts",
      `import { useState } from "react";\nexport const x = useState;\n`,
    );
    expect(restrictedImportErrors(messages)).toHaveLength(1);
  });

  it("no puede importar Next.js", async () => {
    const messages = await lint(
      "src/modules/example/domain/thing.ts",
      `import { redirect } from "next/navigation";\nexport const x = redirect;\n`,
    );
    expect(restrictedImportErrors(messages)).toHaveLength(1);
  });

  it("no puede importar el cliente de la base de datos ni el planificador", async () => {
    const messages = await lint(
      "src/modules/example/domain/thing.ts",
      `import { createClient } from "@supabase/supabase-js";\nimport { fsrs } from "ts-fsrs";\nexport const x = [createClient, fsrs];\n`,
    );
    expect(restrictedImportErrors(messages)).toHaveLength(2);
  });

  it("no puede importar otra capa, ni por ruta relativa ni por alias", async () => {
    const messages = await lint(
      "src/modules/example/domain/thing.ts",
      `import { a } from "../infrastructure/repo";\nimport { b } from "@/modules/example/application/use-case";\nexport const x = [a, b];\n`,
    );
    expect(restrictedImportErrors(messages)).toHaveLength(2);
  });

  it("sí puede importar dentro de su propia capa", async () => {
    const messages = await lint(
      "src/modules/example/domain/thing.ts",
      `import { other } from "./other";\nexport const x = other;\n`,
    );
    expect(restrictedImportErrors(messages)).toHaveLength(0);
  });
});

describe("la capa de aplicación", () => {
  it("no puede importar el framework", async () => {
    const messages = await lint(
      "src/modules/example/application/use-case.ts",
      `import { redirect } from "next/navigation";\nexport const x = redirect;\n`,
    );
    expect(restrictedImportErrors(messages)).toHaveLength(1);
  });

  it("no puede importar implementaciones concretas, solo puertos", async () => {
    const messages = await lint(
      "src/modules/example/application/use-case.ts",
      `import { createClient } from "@supabase/supabase-js";\nexport const x = createClient;\n`,
    );
    expect(restrictedImportErrors(messages)).toHaveLength(1);
  });

  it("sí puede importar del dominio", async () => {
    const messages = await lint(
      "src/modules/example/application/use-case.ts",
      `import { Concept } from "../domain/concept";\nexport const x = Concept;\n`,
    );
    expect(restrictedImportErrors(messages)).toHaveLength(0);
  });
});

describe("la capa de presentación y las rutas", () => {
  it("no puede llamar a un repositorio desde un componente", async () => {
    const messages = await lint(
      "src/modules/example/presentation/view.tsx",
      `import { repo } from "@/modules/example/infrastructure/repo";\nexport const x = repo;\n`,
    );
    expect(restrictedImportErrors(messages)).toHaveLength(1);
  });

  it("tampoco desde una ruta de App Router", async () => {
    const messages = await lint(
      "src/app/[locale]/page.tsx",
      `import { repo } from "@/modules/example/infrastructure/repo";\nexport const x = repo;\n`,
    );
    expect(restrictedImportErrors(messages)).toHaveLength(1);
  });

  it("sí puede llamar a un caso de uso", async () => {
    const messages = await lint(
      "src/modules/example/presentation/view.tsx",
      `import { useCase } from "../application/use-case";\nexport const x = useCase;\n`,
    );
    expect(restrictedImportErrors(messages)).toHaveLength(0);
  });
});
