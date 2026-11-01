// Entrada única da plataforma: app.corretordofuturo.app.
// A pessoa digita e-mail e senha uma vez; o servidor descobre de qual imobiliária ela é
// (funções plataforma.login_busca / login_entrega, usuário plataforma_app) e a manda já logada
// para o sistema dela, no endereço dela. Imobiliária suspensa ou fora do ar não aparece.
// Do lado da imobiliária, /entrar-pela-plataforma troca o passe (2 min, uma vez só) por uma sessão normal.
const crypto = require('crypto');
const express = require('express');

let POOL = null;
function pool() {
  const url = process.env.PLATAFORMA_DATABASE_URL;
  if (!url) { const e = new Error('Entrada sem banco: falta PLATAFORMA_DATABASE_URL.'); e.status = 503; throw e; }
  if (!POOL) {
    const { Pool } = require('pg');
    POOL = new Pool({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''), ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 20000 });
    POOL.on('error', () => {});
  }
  return POOL;
}
const q = async (sql, p = []) => (await pool().query(sql, p)).rows;

function confere(senha, guardado) {
  const [alg, s, h] = String(guardado || '').split('$');
  if (alg !== 'scrypt' || !s || !h) return false;
  const x = crypto.scryptSync(String(senha), Buffer.from(s, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const y = Buffer.from(h, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
// Contra tentativa de senha em sequência: por IP e por e-mail (memória da instância + tabela da plataforma).
const hits = new Map();
function demais(chave, max) {
  const agora = Date.now();
  const h = (hits.get(chave) || []).filter((t) => agora - t < 15 * 60e3);
  hits.set(chave, h);
  if (hits.size > 5000) hits.clear();
  return h.length >= max;
}
const anota = (chave) => { const h = hits.get(chave) || []; h.push(Date.now()); hits.set(chave, h); };

const NOME = process.env.SISTEMA_NOME || 'Herrera HOUSE IA';
const PAGINA = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="robots" content="noindex"><title>Entrar · ${NOME}</title>
<style>
:root{--fundo:#f6f4ef;--cartao:#fff;--texto:#1f2326;--suave:#6b6a66;--linha:#e3e0d8;--marca:#1f4d3a;--erro:#a8322d}
@media (prefers-color-scheme:dark){:root{--fundo:#141615;--cartao:#1d201f;--texto:#ecebe7;--suave:#a3a19b;--linha:#2f3331;--marca:#7fc4a2;--erro:#f08a84}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--fundo);color:var(--texto);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}
main{width:100%;max-width:400px;background:var(--cartao);border:1px solid var(--linha);border-radius:16px;padding:32px 28px}
h1{font-size:22px;margin:0 0 4px}p.sub{margin:0 0 24px;color:var(--suave);font-size:14px}
label{display:block;font-size:14px;font-weight:600;margin:0 0 14px}input,select{display:block;width:100%;margin-top:6px;padding:12px;font:inherit;font-size:16px;color:inherit;background:transparent;border:1px solid var(--linha);border-radius:10px}
input:focus,select:focus{outline:2px solid var(--marca);outline-offset:1px}
button{width:100%;padding:13px;margin-top:6px;border:0;border-radius:10px;background:var(--marca);color:#fff;font:inherit;font-weight:600;cursor:pointer}
@media (prefers-color-scheme:dark){button{color:#0f1a15}}button:disabled{opacity:.6;cursor:wait}
.erro{color:var(--erro);font-size:14px;min-height:20px;margin:10px 0 0}.rodape{margin-top:22px;font-size:13px;color:var(--suave);text-align:center}.rodape a{color:inherit}
#escolha{display:none}
</style></head><body><main>
<h1>Entrar no sistema</h1><p class="sub">${NOME} · use o e-mail e a senha da sua imobiliária.</p>
<form id="f" autocomplete="on">
<label>E-mail<input name="email" type="email" required autocomplete="username" autofocus></label>
<label>Senha<input name="senha" type="password" required autocomplete="current-password"></label>
<label id="escolha">Imobiliária<select name="imobiliaria_id"></select></label>
<button type="submit">Entrar</button><p class="erro" id="erro" role="alert"></p>
</form>
<p class="rodape"><a href="https://corretordofuturo.app/">corretordofuturo.app</a></p>
</main><script src="/entrada.js"></script></body></html>`;

const SCRIPT = `(function(){var f=document.getElementById('f'),e=document.getElementById('erro'),b=f.querySelector('button'),esc=document.getElementById('escolha'),sel=f.querySelector('select');
f.addEventListener('submit',function(ev){ev.preventDefault();e.textContent='';b.disabled=true;
var d={email:f.email.value.trim(),senha:f.senha.value};if(esc.style.display==='block')d.imobiliaria_id=Number(sel.value);
fetch('/entrada-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})}).then(function(x){
if(x.ok&&x.j.ir){location.href=x.j.ir;return}
if(x.ok&&x.j.escolher){sel.innerHTML='';x.j.escolher.forEach(function(o){var op=document.createElement('option');op.value=o.id;op.textContent=o.nome;sel.appendChild(op)});esc.style.display='block';e.textContent='Seu e-mail está em mais de uma imobiliária: escolha qual.';b.disabled=false;return}
e.textContent=(x.j&&x.j.erro)||'Não foi possível entrar.';b.disabled=false}).catch(function(){e.textContent='Sem conexão. Tente de novo.';b.disabled=false})})})();`;

const api = express.Router();
api.use(express.json({ limit: '4kb' }));
api.post('/entrada-api', async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase().slice(0, 200);
  const senha = String((req.body && req.body.senha) || '').slice(0, 200);
  const ip = req.ip || 'ip';
  if (!email || !senha) return res.status(400).json({ erro: 'Digite o e-mail e a senha.' });
  if (demais('ip:' + ip, 20) || demais('em:' + email, 6)) return res.status(429).json({ erro: 'Muitas tentativas. Espere 15 minutos.' });
  try {
    const linhas = await q('SELECT * FROM plataforma.login_busca($1)', [email]);
    const certas = linhas.filter((l) => confere(senha, l.senha_hash));
    if (!certas.length) { anota('ip:' + ip); anota('em:' + email); return res.status(401).json({ erro: 'E-mail ou senha não conferem.' }); }
    const pedida = Number(req.body.imobiliaria_id) || null;
    const alvo = pedida ? certas.find((l) => l.imobiliaria_id === pedida) : (certas.length === 1 ? certas[0] : null);
    if (!alvo) return res.json({ escolher: certas.map((l) => ({ id: l.imobiliaria_id, nome: l.nome })) });
    const token = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const [{ ok }] = await q('SELECT plataforma.login_entrega($1,$2,$3) AS ok', [alvo.imobiliaria_id, alvo.usuario_id, hash]);
    if (!ok) return res.status(423).json({ erro: 'Esta imobiliária está temporariamente fora do ar.' });
    hits.delete('em:' + email);
    res.json({ ir: `${String(alvo.link).replace(/\/+$/, '')}/entrar-pela-plataforma?t=${token}` });
  } catch (e) {
    console.error('[entrada]', e.message);
    res.status(e.status || 500).json({ erro: 'A entrada está indisponível agora. Tente em instantes.' });
  }
});

// Só no endereço de entrada da plataforma (APP_HOSTS): nada de sistema ou portal de cliente aqui.
function entrada(req, res, next) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.path === '/robots.txt') return res.type('text/plain').send('User-agent: *\nDisallow: /\n');
  if (req.path === '/entrada.js') return res.type('application/javascript').set('Cache-Control', 'public, max-age=300').send(SCRIPT);
  if (req.path === '/entrada-api') return api(req, res, next);
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(404).json({ erro: 'Não encontrado.' });
  if (req.path !== '/') return res.redirect(302, '/');
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(PAGINA);
}

// Lado da imobiliária: troca o passe da plataforma por uma sessão normal (uma vez só, até 2 minutos).
function trocaPasse(req, res) {
  const A = require('../auth');
  const { one, run } = require('../db');
  const t = String(req.query.t || '');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(t)) return res.redirect(302, '/entrar');
  const chave = 'passe:' + A.sha256(t);
  const s = one('SELECT usuario_id FROM sessoes WHERE token_hash=? AND expira_em>?', chave, Date.now());
  run('DELETE FROM sessoes WHERE token_hash=?', chave);
  if (!s) return res.redirect(302, '/entrar');
  const u = one('SELECT id FROM usuarios WHERE id=? AND ativo=1', s.usuario_id);
  if (!u) return res.redirect(302, '/entrar');
  A.setCookie(res, A.criarSessao(u.id));
  try { require('../db').audit(u.id, 'login', 'pela plataforma (app.corretordofuturo.app)'); } catch {}
  res.redirect(302, '/#/painel');
}

module.exports = { entrada, trocaPasse };
