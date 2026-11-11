import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  // Cada opción aquí es una diferencia respecto al default de Next.js y hay
  // que poder explicarla.
  experimental: {
    // El tope por defecto de una Server Action es 1 MB. La importación admite
    // archivos de 5 MB (LEX-4.5, MASTER_SPEC §9.7); el cuerpo multipart añade
    // unos KB de frontera, así que 6 MB deja holgura sin aceptar subidas
    // ilimitadas. Un archivo de más de 5 MB sigue rechazándose en
    // `previewImportAction` antes de parsear.
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
