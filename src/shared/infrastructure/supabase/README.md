# Supabase — infraestructura compartida

## `database.types.ts`

**Generado. No se edita a mano.**

```bash
pnpm db:types
```

Se produce desde el esquema real de la base de datos local, que a su vez sale de
las migraciones versionadas. El esquema es la fuente de verdad; este fichero es
su reflejo en TypeScript.

**Se regenera en el mismo commit que la migración que lo cambia.** Si se separan,
el tipo y la tabla dejan de coincidir y el compilador empieza a aprobar consultas
que la base de datos rechazará en tiempo de ejecución. La CI comprobará la
alineación a partir de LEX-1.12.

Está excluido de Prettier y de ESLint: formatear un fichero generado produce un
diff en cada regeneración y no aporta nada.
