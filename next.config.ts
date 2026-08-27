import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sin opciones todavía. Lo que se añada aquí debe justificarse: cada opción
  // de configuración es una diferencia entre lo que hace Next.js por defecto y
  // lo que hace este proyecto, y alguien tendrá que entenderla más adelante.
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
