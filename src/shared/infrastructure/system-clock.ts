import type { Clock } from "@/shared/application/clock";

/**
 * Reloj del servidor (LEX-5.12). Único sitio de infraestructura
 * compartida que llama a `new Date()` sin argumentos. El navegador no
 * es autoridad.
 */
export function createSystemClock(): Clock {
  return {
    now() {
      return new Date();
    },
  };
}
