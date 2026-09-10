/**
 * Informe descargable de filas fallidas (LEX-4.9). Texto plano, una línea
 * por error: número, mensaje seguro, muestra saneada. No incluye el archivo
 * original. `.txt` a propósito: un CSV dispararía las fórmulas de una hoja.
 */

export function formatImportErrorReport(
  errors: ReadonlyArray<{
    rowNumber: number;
    message: string;
    rowSample: string | null;
  }>,
): string {
  return errors
    .map((error) => {
      const sample = error.rowSample ?? "";
      return sample === ""
        ? `${error.rowNumber}\t${error.message}`
        : `${error.rowNumber}\t${error.message}\t${sample}`;
    })
    .join("\n");
}
