// Copia o banco local do PC (data/house.db, ou o arquivo anterior se o novo ainda não existir, + data/arquivos) para o banco online.
// Uso (no PC):  node scripts/migrar-para-online.js "postgres://..."
// Mantém os mesmos ids, então links, assinaturas e históricos continuam batendo.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { Client } = require('pg');

const RAIZ = path.join(__dirname, '..');
const DATA = path.join(RAIZ, 'data');
const { caminhoDoBanco } = require('../src/db-arquivo');
const url = process.argv[2] || process.env.DATABASE_URL;
if (!url) { console.error('Informe a DATABASE_URL.'); process.exit(1); }

const ORDEM = ['usuarios', 'config', 'condominios', 'proprietarios', 'imoveis', 'arquivos', 'leads', 'links_internos', 'links_acessos',
  'interacoes', 'visitas', 'mensagens', 'assinaturas', 'oportunidades', 'oportunidade_eventos', 'aprovacoes', 'auditoria'];

(async () => {
  const arquivo = caminhoDoBanco(DATA, { existe: (p) => fs.existsSync(p) });
  if (!fs.existsSync(arquivo)) { console.error('Não achei o banco local (data/house.db).'); process.exit(1); }
  const lite = new DatabaseSync(arquivo, { readOnly: true });
  const pg = new Client({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''), ssl: /sslmode=disable/.test(url) ? false : { rejectUnauthorized: false } });
  await pg.connect();
  const ja = (await pg.query('SELECT count(*)::int n FROM usuarios')).rows[0].n;
  if (ja && !process.argv.includes('--forcar')) { console.error(`O banco online já tem ${ja} usuário(s). Nada foi copiado.`); process.exit(2); }

  await pg.query('BEGIN');
  try {
    for (const t of ORDEM) {
      const colsLite = lite.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
      if (!colsLite.length) { console.log(`- ${t}: não existe no banco local`); continue; }
      const colsPg = (await pg.query("SELECT column_name FROM information_schema.columns WHERE table_schema='base' AND table_name=$1", [t])).rows.map((r) => r.column_name);
      const cols = colsLite.filter((c) => colsPg.includes(c));
      const sobra = colsLite.filter((c) => !colsPg.includes(c));
      if (sobra.length) console.log(`  aviso: ${t} tem colunas só no local (não copiadas): ${sobra.join(', ')}`);
      const linhas = lite.prepare(`SELECT ${cols.join(',')} FROM ${t}`).all();
      // em lotes: menos idas e vindas até o servidor (o banco fica nos EUA)
      const LOTE = Math.max(1, Math.floor(30000 / cols.length));
      for (let k = 0; k < linhas.length; k += LOTE) {
        const parte = linhas.slice(k, k + LOTE);
        const vals = [], params = [];
        parte.forEach((l, li) => { vals.push('(' + cols.map((c, ci) => '$' + (li * cols.length + ci + 1)).join(',') + ')'); cols.forEach((c) => params.push(l[c])); });
        await pg.query(`INSERT INTO ${t}(${cols.join(',')}) VALUES ${vals.join(',')}`, params);
      }
      if (cols.includes('id')) await pg.query(`SELECT setval(pg_get_serial_sequence('base.${t}','id'), (SELECT coalesce(max(id),0)+1 FROM ${t}), false)`);
      console.log(`- ${t}: ${linhas.length} registro(s)`);
    }
    // conteúdo dos arquivos
    let ok = 0, faltando = 0, bytes = 0;
    for (const a of lite.prepare('SELECT id, caminho_local FROM arquivos').all()) {
      const p = a.caminho_local ? path.join(DATA, a.caminho_local) : null;
      if (!p || !fs.existsSync(p)) { faltando++; continue; }
      const buf = fs.readFileSync(p);
      await pg.query('INSERT INTO arquivos_dados(arquivo_id,dados) VALUES($1,$2) ON CONFLICT(arquivo_id) DO UPDATE SET dados=excluded.dados', [a.id, buf]);
      ok++; bytes += buf.length;
    }
    console.log(`- arquivos (conteúdo): ${ok} copiado(s), ${(bytes / 1048576).toFixed(1)} MB${faltando ? `, ${faltando} sem arquivo no PC` : ''}`);
    await pg.query('COMMIT');
    console.log('\nMIGRAÇÃO CONCLUÍDA');
  } catch (e) {
    await pg.query('ROLLBACK');
    console.error('\nERRO — nada foi gravado no banco online:', e.message);
    process.exitCode = 1;
  } finally {
    await pg.end();
  }
})();
