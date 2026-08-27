/**
 * Comprueba el contraste WCAG de las combinaciones de color declaradas.
 *
 * Existe porque «contraste AA» es de las afirmaciones mas faciles de hacer sin
 * comprobar. Lee los tokens de `src/app/globals.css`, convierte de oklch a sRGB,
 * calcula la relacion de contraste de cada pareja y falla si alguna no llega al
 * minimo. Se puede ejecutar en la CI.
 *
 *   node scripts/check-contrast.mjs
 *
 * Umbrales WCAG 2.1:
 *   AA  texto normal   4.5:1
 *   AA  texto grande   3:1
 *   AA  componentes    3:1   (bordes, iconos, indicadores de foco)
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

// --------------------------------------------------------------------------
// Conversion de color. oklch -> OKLab -> LMS -> sRGB lineal -> sRGB
// --------------------------------------------------------------------------

function oklchToSrgb(lightness, chroma, hueDegrees) {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Luminancia relativa segun WCAG, a partir de sRGB lineal. */
function relativeLuminance([r, g, b]) {
  const clamp = (v) => Math.min(Math.max(v, 0), 1);
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b);
}

function contrastRatio(colorA, colorB) {
  const a = relativeLuminance(colorA);
  const b = relativeLuminance(colorB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

// --------------------------------------------------------------------------
// Autocomprobacion: si la conversion estuviera mal, el informe daria confianza
// falsa, que es peor que no comprobar nada.
// --------------------------------------------------------------------------

const white = oklchToSrgb(1, 0, 0);
const black = oklchToSrgb(0, 0, 0);
const selfTest = contrastRatio(white, black);

if (Math.abs(selfTest - 21) > 0.1) {
  console.error(
    `✖ La conversion de color esta mal: blanco/negro da ${selfTest.toFixed(2)}, no 21.`,
  );
  process.exit(1);
}

// --------------------------------------------------------------------------
// Extraccion de tokens por tema
// --------------------------------------------------------------------------

function extractTokens(blockSelector) {
  // Se construye con String.raw a proposito: en un template literal normal,
  // `\s` es un escape desconocido y JavaScript lo convierte en `s`, de modo que
  // la expresion regular deja de significar lo que parece.
  const pattern = new RegExp(blockSelector + String.raw`\s*\{([\s\S]*?)\n\}`);
  const block = pattern.exec(css);
  if (!block) throw new Error(`No se encontro el bloque ${blockSelector}`);

  const tokens = {};
  const tokenPattern = /--(color-[\w-]+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/g;
  let match;
  while ((match = tokenPattern.exec(block[1])) !== null) {
    tokens[match[1]] = oklchToSrgb(Number(match[2]) / 100, Number(match[3]), Number(match[4]));
  }
  return tokens;
}

// --------------------------------------------------------------------------
// Parejas que deben cumplir, y por que
// --------------------------------------------------------------------------

const pairs = [
  ["color-ink", "color-canvas", 4.5, "Texto principal sobre el fondo"],
  ["color-ink", "color-surface", 4.5, "Texto principal sobre una superficie"],
  ["color-ink-muted", "color-canvas", 4.5, "Texto secundario: sigue siendo texto"],
  ["color-ink-subtle", "color-canvas", 3.0, "Texto de apoyo, tamano grande"],
  ["color-on-accent", "color-accent", 4.5, "Texto dentro de un boton principal"],
  ["color-on-danger", "color-danger", 4.5, "Texto dentro de un boton destructivo"],
  ["color-accent", "color-canvas", 3.0, "Enlaces y bordes de acento"],
  ["color-border-strong", "color-canvas", 3.0, "Borde de un control con el que se interactua"],
  ["color-focus", "color-canvas", 3.0, "Indicador de foco: quien navega con teclado depende de el"],
];

const themes = [
  ["claro", extractTokens(":root")],
  ["oscuro", extractTokens(String.raw`\[data-theme="dark"\]`)],
];

let failures = 0;

console.log(`Autocomprobacion blanco/negro: ${selfTest.toFixed(2)}:1  ✓\n`);

for (const [themeName, tokens] of themes) {
  console.log(`Tema ${themeName}`);
  for (const [foreground, background, minimum, description] of pairs) {
    const fg = tokens[foreground];
    const bg = tokens[background];
    if (!fg || !bg) {
      console.log(`  ?  ${foreground} / ${background}  — token no encontrado`);
      failures += 1;
      continue;
    }
    const ratio = contrastRatio(fg, bg);
    const passes = ratio >= minimum;
    if (!passes) failures += 1;
    const mark = passes ? "✓" : "✖";
    console.log(`  ${mark}  ${ratio.toFixed(2).padStart(5)}:1  (min ${minimum})  ${description}`);
  }
  console.log("");
}

if (failures > 0) {
  console.error(`✖ ${failures} combinacion(es) por debajo del minimo.`);
  process.exit(1);
}

console.log("✓ Todas las combinaciones cumplen el minimo exigido.");
