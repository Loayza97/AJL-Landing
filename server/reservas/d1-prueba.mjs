// D1 falso sobre node:sqlite para las pruebas. D1 es SQLite, así que la SQL
// (índices parciales, INSERT … SELECT, ON CONFLICT) se comporta igual; aquí
// solo se imita la forma de la API que usan los módulos.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

export function d1DePrueba() {
  const sqlite = new DatabaseSync(':memory:');
  // Todas las migraciones, en orden, como las aplica D1.
  const dir = new URL('../../db/d1/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(f, dir), 'utf8'));
  }

  const plano = (fila) => (fila ? { ...fila } : null);
  function sentencia(sql, params = []) {
    const ejecutar = () => {
      const r = sqlite.prepare(sql).run(...params);
      return { meta: { changes: Number(r.changes) } };
    };
    return {
      bind: (...p) => sentencia(sql, p),
      first: async () => plano(sqlite.prepare(sql).get(...params)),
      all: async () => ({ results: sqlite.prepare(sql).all(...params).map(plano) }),
      run: async () => ejecutar(),
      _ejecutar: ejecutar,
    };
  }

  return {
    prepare: (sql) => sentencia(sql),
    batch: async (sentencias) => {
      sqlite.exec('BEGIN');
      try {
        const res = sentencias.map((s) => s._ejecutar());
        sqlite.exec('COMMIT');
        return res;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
