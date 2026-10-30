// Leva a chave do Gemini da RUAH para o cofre central da plataforma (29/10/2026).
// Decisão do Thiago: a chave é UMA SÓ, da plataforma, e todas as imobiliárias usam de graça.
// Roda no PC porque é aqui que estão as senhas do banco (.env). A chave nunca é impressa: só os 4 últimos dígitos.
//
//   node scripts/chave-central.js            -> mostra o que vai fazer (não grava)
//   node scripts/chave-central.js --gravar   -> grava no cofre central (plataforma.config)
const path = require('path');
const raiz = path.resolve(__dirname, '..');
process.chdir(raiz);
// o config do sistema já lê o .env
const cfg = require(path.join(raiz, 'src/config'));
const IA = require(path.join(raiz, 'src/agentes/ia'));

const gravar = process.argv.includes('--gravar');

(async () => {
  const a = IA.ajustes();
  console.log('chave desta imobiliária :', a.tem_chave ? `sim (…${a.chave_final})` : 'não');
  console.log('modelo                  :', a.modelo);
  const k = IA.chave();
  if (!k) { console.log('\nNada a migrar: esta instalação não tem chave do Gemini.'); process.exit(1); }

  const url = process.env.PLATAFORMA_DATABASE_URL;
  if (!url) { console.log('\nFalta PLATAFORMA_DATABASE_URL no .env — é o banco do painel do gestor.'); process.exit(2); }
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''),
    ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }, max: 1 });
  try {
    const { rows } = await pool.query("SELECT chave, valor FROM config WHERE chave IN ('ia_central','ia_central_modelo')");
    const atual = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
    console.log('cofre central hoje      :', atual.ia_central ? `chave …${String(atual.ia_central).slice(-4)}` : 'vazio',
      atual.ia_central_modelo ? `(modelo ${atual.ia_central_modelo})` : '');
    if (!gravar) { console.log('\nNada foi gravado. Rode de novo com --gravar para levar a chave ao cofre central.'); return; }
    await pool.query('SELECT plataforma.definir_ia_central($1, $2)', [k, a.modelo]);
    const { rows: conf } = await pool.query("SELECT valor FROM config WHERE chave='ia_central'");
    console.log(`\nPronto: cofre central com a chave …${String(conf[0].valor).slice(-4)} e o modelo ${a.modelo}.`);
    console.log('As 5 imobiliárias passam a usar essa chave sozinhas (cache de 5 min em cada uma).');
  } finally { await pool.end().catch(() => {}); }
})().catch((e) => { console.error('ERRO:', e.message); process.exit(3); });

