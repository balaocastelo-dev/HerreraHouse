// Lista branca do POST /api/ia/consulta e leituras legadas que ainda precisam existir.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { prepararConsulta, LIMITE_MAX, TIMEOUT_MS } = require('../src/api-ia/consulta-segura');

function ok(sql, limite) {
  return prepararConsulta(sql, limite === undefined ? {} : { limite });
}
function nega(sql, trecho) {
  assert.throws(() => prepararConsulta(sql), (e) => {
    assert.ok(e && e.message, sql);
    if (trecho) assert.match(e.message, trecho, `${sql} → ${e.message}`);
    return true;
  }, sql);
}

const leitura = ok('SELECT count(*) AS n FROM imoveis');
assert.equal(leitura.limite, LIMITE_MAX);
assert.equal(leitura.timeoutMs, TIMEOUT_MS);
assert.match(leitura.sql, /LIMIT 500$/);

const curto = ok('SELECT codigo FROM imoveis WHERE bairro = ?'.replace('?', "'Cambuí'"), 10);
assert.match(curto.sql, /LIMIT 10$/);
assert.equal(curto.limite, 10);

const teto = ok('SELECT codigo FROM imoveis ORDER BY valor DESC LIMIT 999999', 20);
assert.match(teto.sql, /LIMIT 20$/);
assert.doesNotMatch(teto.sql, /999999/);

const interno = ok('SELECT * FROM (SELECT codigo FROM imoveis LIMIT 9999) x', 5);
assert.match(interno.sql, /LIMIT 5/);
assert.doesNotMatch(interno.sql, /9999/);
assert.match(interno.sql, /LIMIT 5$/);

const recursivo = ok('WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 20) SELECT i FROM n LIMIT 20', 3);
assert.match(recursivo.sql, /LIMIT 3$/);
assert.doesNotMatch(recursivo.sql, /LIMIT 20/);

ok('SELECT i.codigo, l.nome FROM imoveis i JOIN leads l ON l.id = i.id');
ok('select nome, email from usuarios');
ok('SELECT count(*) FROM usuarios');
ok("SELECT codigo FROM imoveis WHERE descricao = 'limit 1; delete'");
ok('SELECT lower(bairro), count(*) n FROM imoveis GROUP BY bairro ORDER BY n DESC');

for (const sql of [
  'DELETE FROM imoveis',
  'UPDATE imoveis SET valor = 1',
  'INSERT INTO imoveis(codigo) VALUES (1)',
  'DROP TABLE imoveis',
  'SELECT 1; SELECT 2',
  'SELECT 1 FROM imoveis; DELETE FROM imoveis',
  'SELECT 1 FROM imoveis -- LIMIT 1\n',
  'SELECT/**/codigo FROM imoveis',
  'SELECT 1 FROM imoveis /* ; DELETE FROM imoveis */',
  'SELECT pg_sleep(10)',
  'SELECT pg_catalog.pg_sleep(1)',
  'SELECT pg_read_file(\'/etc/passwd\')',
  'SELECT lo_import(\'/etc/passwd\')',
  'SELECT lo_get(1)',
  'SELECT dblink(\'host=x\', \'SELECT 1\')',
  'SELECT dblink_exec(\'host=x\', \'DROP TABLE imoveis\')',
  'COPY imoveis TO STDOUT',
  'SELECT set_config(\'statement_timeout\', \'0\', false)',
  'SELECT pg_terminate_backend(1)',
  'SELECT pg_cancel_backend(1)',
  'SELECT * FROM pg_catalog.pg_tables',
  'SELECT * FROM information_schema.tables',
  'SELECT * FROM base.imoveis',
  'SELECT * FROM sqlite_master',
  'SELECT * FROM sessoes',
  'SELECT * FROM api_chaves',
  'SELECT * FROM config',
  'SELECT senha_hash FROM usuarios',
  'SELECT * FROM usuarios',
  'SELECT * FROM usuarios u JOIN imoveis i ON i.corretor_id = u.id',
  'WITH x AS (DELETE FROM imoveis RETURNING id) SELECT * FROM x',
  'SELECT * FROM imoveis LIMIT -1',
  'SELECT * FROM imoveis LIMIT ALL',
  'SELECT 1; --\nDELETE FROM imoveis',
]) nega(sql);

// limite ausente, zero ou inválido usa o teto. Não aceita LIMIT negativo no SQL.
const zero = ok('SELECT codigo FROM imoveis', 0);
assert.equal(zero.limite, LIMITE_MAX);

// Leituras legadas: arquivo antigo e valor antigo de fonte, sem gravar de novo.
const { caminhoDoBanco, NOME_ATUAL, NOME_LEGADO } = require('../src/db-arquivo');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-db-'));
const existe = (p) => fs.existsSync(p);
assert.equal(path.basename(caminhoDoBanco(dir, { existe })), NOME_ATUAL);
fs.writeFileSync(path.join(dir, NOME_LEGADO), '');
assert.equal(path.basename(caminhoDoBanco(dir, { existe })), NOME_LEGADO);
fs.writeFileSync(path.join(dir, NOME_ATUAL), '');
assert.equal(path.basename(caminhoDoBanco(dir, { existe })), NOME_ATUAL);
assert.equal(caminhoDoBanco(dir, { houseDb: path.join(dir, 'outro.db'), existe }), path.join(dir, 'outro.db'));
fs.rmSync(dir, { recursive: true, force: true });

const { FONTE_CASA, FONTE_LEGADA, fonteDaCasa, fontesVisiveis } = require('../src/condominios/fonte');
assert.equal(fonteDaCasa(FONTE_CASA), true);
assert.equal(fonteDaCasa(FONTE_LEGADA), true);
assert.equal(fonteDaCasa('cnpj'), false);
assert.equal(fontesVisiveis(`cnpj,${FONTE_LEGADA}`), `cnpj,${FONTE_CASA}`);
assert.equal(fs.readFileSync(path.join(__dirname, '../public/condominios.js'), 'utf8').toLowerCase().includes(FONTE_LEGADA), false);

const cifra = require('../src/agentes/cifra-ia');
const crypto = require('crypto');
const material = 'postgres://teste';
const iv = crypto.randomBytes(12);
const key = crypto.createHash('sha256').update(cifra.PREFIXO_ANTIGO + material).digest();
const c = crypto.createCipheriv('aes-256-gcm', key, iv);
const enc = Buffer.concat([c.update('antiga', 'utf8'), c.final()]);
const pacote = [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
assert.equal(cifra.decifra(material, pacote), 'antiga');
assert.equal(cifra.decifra(material, cifra.cifra(material, 'nova')), 'nova');
assert.ok(!cifra.cifra(material, 'nova').startsWith(cifra.PREFIXO_ANTIGO));

// Menção ao nome antigo só nos pontos de leitura legada, na migração que o dono ainda não rodou
// e no plano de mudança de repositório.
const { execFileSync } = require('child_process');
const raiz = path.join(__dirname, '..');
let lista = '';
try {
  lista = execFileSync('rg', ['-i', '-l', 'ruah', '.', '--glob', '!node_modules/**', '--glob', '!package-lock.json'], { cwd: raiz, encoding: 'utf8' });
} catch (e) {
  if (e.status !== 1) throw e;
  lista = e.stdout ? String(e.stdout) : '';
}
const achados = lista.split('\n').map((s) => s.trim().replace(/^\.\//, '')).filter(Boolean).sort();
const permitidos = [
  'docs/PLANO-CENTRALIZACAO.md',
  'sql/migrar-schema-ruah-para-base-rollback.sql',
  'sql/migrar-schema-ruah-para-base.sql',
  'sql/opcional-remover-cadastro-ruah.sql',
  'sql/plataforma-base-comum.sql',
  'sql/plataforma.sql',
  'src/agentes/cifra-ia.js',
  'src/condominios/fonte.js',
  'src/db-arquivo.js',
  'test/consulta-segura.js',
];
assert.deepEqual(achados, permitidos, 'menção fora da lista: ' + achados.filter((a) => !permitidos.includes(a)).join(', '));

console.log('ok · consulta segura e leituras legadas');
