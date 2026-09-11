/**
 * Puerto `Clock` (LEX-5.12).
 *
 * El comportamiento depende del tiempo; `new Date()` repartido por el
 * negocio hace imposible probar medianoche, DST y vencimientos. El
 * reloj se inyecta. La implementación de sistema vive en infraestructura.
 * Los tests usan `createFixedClock`.
 */

export interface Clock {
  now(): Date;
}

export function createFixedClock(instant: Date): Clock {
  const frozen = instant.getTime();
  return {
    now() {
      return new Date(frozen);
    },
  };
}
