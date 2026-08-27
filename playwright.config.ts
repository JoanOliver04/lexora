import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://localhost:3000";

/**
 * El Poco F5 es el dispositivo Android real donde se va a usar Lexora a diario.
 * Su pantalla es 1080x2400 con densidad 2.75, lo que da 393x873 pixeles CSS.
 *
 * Se emula ese tamano concreto en lugar de usar un perfil generico: los fallos
 * de diseno responsive aparecen en anchos concretos, y probar en 375 o en 412
 * no dice nada sobre el telefono en el que esto se va a usar de verdad.
 */
const pocoF5 = {
  ...devices["Pixel 5"],
  viewport: { width: 393, height: 873 },
  deviceScaleFactor: 2.75,
};

export default defineConfig({
  testDir: "./tests/e2e",

  // En la CI, un `test.only` olvidado haria pasar la suite ejecutando un solo
  // test. Aqui falla en su lugar.
  forbidOnly: Boolean(process.env["CI"]),

  // Un reintento en CI absorbe la inestabilidad de red y de arranque; en local,
  // ninguno, para que un test inestable se note en vez de esconderse.
  retries: process.env["CI"] ? 1 : 0,

  // Se omite la clave en local en lugar de asignarle `undefined`.
  // `exactOptionalPropertyTypes` distingue ambas cosas, y con razon: «no he
  // dicho nada» y «he dicho explicitamente que no hay valor» no significan lo
  // mismo. En local, omitirla deja que Playwright elija segun los nucleos.
  ...(process.env["CI"] ? { workers: 1 } : {}),

  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL,
    // La traza solo se guarda cuando un test falla y se reintenta: guardarla
    // siempre llena el disco y ralentiza cada ejecucion.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "escritorio-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "movil-poco-f5", use: pocoF5 },
  ],

  /**
   * Se prueba contra el build de produccion, no contra el servidor de
   * desarrollo. Difieren en renderizado estatico, division de codigo y manejo
   * de errores, y lo que importa es que funcione lo que se despliega.
   */
  webServer: {
    command: "pnpm build && pnpm start",
    url: baseURL,
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
  },
});
