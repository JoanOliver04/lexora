import { checkHealth, type HealthReport } from "@/shared/application/health/check-health";
import { createSupabaseDatabaseProbe } from "@/shared/infrastructure/health/supabase-database-probe";

/**
 * Raíz de composición.
 *
 * `src/composition/` existe para resolver una tensión real de la regla de
 * dependencia: la presentación no puede importar infraestructura —lo impide
 * ESLint y lo exige ADR-001—, pero alguien tiene que unir un caso de uso con su
 * implementación concreta.
 *
 * Ese «alguien» es esta carpeta, y **solo** esta carpeta. Aquí se permite
 * conocer ambos lados porque su única responsabilidad es el cableado: no hay
 * lógica de negocio, ni consultas, ni decisiones.
 *
 * La alternativa habría sido añadir una excepción de lint para las rutas. Es
 * peor: una excepción abre la puerta a que la siguiente ruta meta una consulta
 * directamente, y entonces la regla deja de significar nada.
 */
export function getHealthReport(): Promise<HealthReport> {
  return checkHealth(createSupabaseDatabaseProbe());
}
