// Banco online (Postgres/Supabase). O sistema inteiro foi escrito com chamadas síncronas
// (one/all/run); para não reescrever tudo, cada consulta roda num worker e esperamos a resposta.
const path = require('path');
const { createSyncFn } = require('synckit');
const traduz = require('./sql-pg');

const consulta = createSyncFn(path.join(__dirname, 'pg-worker.js'), { timeout: 45000 });

const paraBuffer = (r) => {
  for (const k in r) if (r[k] instanceof Uint8Array && !Buffer.isBuffer(r[k])) r[k] = Buffer.from(r[k]);
  return r;
};

function exec(sql, params) {
  const t = traduz(sql);
  const p = params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
  const r = consulta(t.text, p);
  if (r && r.erro) {
    const e = new Error(r.erro.message);
    Object.assign(e, r.erro);
    e.sql = t.text;
    throw e;
  }
  r.rows = r.rows.map(paraBuffer);
  return r;
}

const one = (sql, ...p) => exec(sql, p).rows[0];
const all = (sql, ...p) => exec(sql, p).rows;
function leitura(sql, opts = {}) {
  const t = traduz(sql);
  const r = consulta(t.text, [], { leitura: true, timeoutMs: opts.timeoutMs });
  if (r && r.erro) {
    const e = new Error(r.erro.message);
    Object.assign(e, r.erro);
    e.sql = t.text;
    throw e;
  }
  return (r.rows || []).map(paraBuffer);
}
const run = (sql, ...p) => {
  const r = exec(sql, p);
  return { changes: r.rowCount, lastInsertRowid: r.rows[0] ? r.rows[0].id : undefined };
};

function getConfig(k) { const r = one('SELECT valor FROM config WHERE chave=?', k); return r ? r.valor : null; }
function setConfig(k, v) {
  if (v === null || v === undefined) return run('DELETE FROM config WHERE chave=?', k);
  run('INSERT INTO config(chave,valor) VALUES(?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor', k, String(v));
}
function audit(usuarioId, acao, detalhe) {
  run('INSERT INTO auditoria(usuario_id,acao,detalhe) VALUES(?,?,?)', usuarioId ?? null, acao, detalhe ? String(detalhe).slice(0, 1000) : null);
}

module.exports = { db: null, one, all, run, leitura, getConfig, setConfig, audit, PG: true };
