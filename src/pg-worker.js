// Worker que conversa com o Postgres (usado por db-pg.js).
const { runAsWorker } = require('synckit');
const { Pool, types } = require('pg');

types.setTypeParser(20, (v) => (v === null ? null : Number(v)));   // bigint (count, sum)
types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric

let pool;
function abre() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL || require('./config').DATABASE_URL;
  pool = new Pool({
    connectionString: url.replace(/[?&]sslmode=[^&]*/, ''),
    ssl: /sslmode=disable/.test(url) ? false : { rejectUnauthorized: false },
    max: Number(process.env.PG_POOL_MAX || 3),
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 15000,
  });
  pool.on('error', () => {});
  return pool;
}

runAsWorker(async (text, params, opts) => {
  const p = (params || []).map((v) => (v instanceof Uint8Array && !Buffer.isBuffer(v) ? Buffer.from(v) : v));
  const leitura = !!(opts && opts.leitura);
  for (let tentativa = 0; ; tentativa++) {
    let client;
    let derruba = false;
    try {
      if (leitura) {
        const timeoutMs = Number(opts.timeoutMs) || 4000;
        if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 15000) {
          return { rows: [], rowCount: 0, erro: { message: 'Tempo limite inválido.' } };
        }
        client = await abre().connect();
        await client.query('BEGIN READ ONLY');
        await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
        await client.query(`SET LOCAL lock_timeout = ${Math.min(2000, timeoutMs)}`);
        await client.query(`SET LOCAL idle_in_transaction_session_timeout = ${timeoutMs + 1000}`);
        const r = await client.query(text, p);
        await client.query('COMMIT');
        return { rows: r.rows || [], rowCount: r.rowCount || 0 };
      }
      const r = await abre().query(text, p);
      return { rows: r.rows || [], rowCount: r.rowCount || 0 };
    } catch (e) {
      if (client) { try { await client.query('ROLLBACK'); } catch { /* a transação já acabou */ } }
      const conexao = /ECONNRESET|ETIMEDOUT|terminat|Connection|socket/i.test(String(e.message)) && !e.code?.match(/^[0-9A-Z]{5}$/);
      if (conexao && tentativa < 2) derruba = true;
      else return { rows: [], rowCount: 0, erro: { message: e.message, code: e.code, detail: e.detail, constraint: e.constraint } };
    } finally {
      if (client) client.release();
    }
    if (derruba) { try { await pool.end(); } catch {} pool = null; continue; }
  }
});
