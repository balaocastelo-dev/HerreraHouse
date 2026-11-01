// Painel do gestor da plataforma (Herrera HOUSE IA): as imobiliárias clientes, os números de cada uma,
// o cadastro de uma nova, ativar/suspender e os valores (mensalidade + parte da comissão).
// Fica em corretordofuturo.app/gestor. Banco: usuário plataforma_app (PLATAFORMA_DATABASE_URL), que só enxerga
// o schema "plataforma" e chama funções que devolvem números das imobiliárias (nunca nomes, telefones ou endereços).
const crypto = require('crypto');
const express = require('express');
const cfg = require('../config');

const HOSTS = new Set(String(process.env.GESTOR_HOSTS || 'corretordofuturo.app,www.corretordofuturo.app,localhost,127.0.0.1')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
const COOKIE = 'gestor_sessao';
const SEGURO = process.env.VERCEL ? '; Secure' : '';
const TEAM = process.env.VERCEL_TEAM_ID || 'team_Mdwt9HWMVtQuaVPBUajlME76';
const { REPO, CONTEUDO_VAZIO: VAZIO } = require('./repo');
const cifraIa = require('../agentes/cifra-ia');
const POOLER = process.env.PLATAFORMA_POOLER || 'aws-1-us-west-2.pooler.supabase.com:6543';
const PROJETO_DB = process.env.PLATAFORMA_PROJETO_DB || 'yufvfitdhfdjdluvymha';
// Endereço padrão de cada imobiliária: <nome>.corretordofuturo.app (pedido do Thiago, 28/10/2026).
const DOMINIO_BASE = process.env.PLATAFORMA_DOMINIO || 'corretordofuturo.app';
const dominioDe = (slug) => `${String(slug).replace(/_/g, '-')}.${DOMINIO_BASE}`;

// ---------- banco (assíncrono, conexão própria) ----------
let POOL = null;
function pool() {
  const url = process.env.PLATAFORMA_DATABASE_URL;
  if (!url) { const e = new Error('Painel sem banco: falta PLATAFORMA_DATABASE_URL.'); e.status = 503; throw e; }
  if (!POOL) {
    const { Pool } = require('pg');
    POOL = new Pool({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''), ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 20000 });
    POOL.on('error', () => {});
  }
  return POOL;
}
const q = async (sql, p = []) => (await pool().query(sql, p)).rows;
const um = async (sql, p = []) => (await q(sql, p))[0] || null;

// ---------- utilidades ----------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
function hashSenha(senha) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(senha, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
}
function confere(senha, guardado) {
  const [alg, s, h] = String(guardado || '').split('$');
  if (alg !== 'scrypt' || !s || !h) return false;
  const x = crypto.scryptSync(String(senha), Buffer.from(s, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const y = Buffer.from(h, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const chaveCifra = () => crypto.createHash('sha256').update(String(cfg.SECRET_KEY) + '|plataforma').digest();
function cifra(txt) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', chaveCifra(), iv);
  const d = Buffer.concat([c.update(String(txt), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), d].map((b) => b.toString('base64')).join('.');
}
function decifra(s) {
  const [iv, tag, d] = String(s || '').split('.').map((b) => Buffer.from(b, 'base64'));
  const c = crypto.createDecipheriv('aes-256-gcm', chaveCifra(), iv); c.setAuthTag(tag);
  return Buffer.concat([c.update(d), c.final()]).toString('utf8');
}
const senhaForte = () => crypto.randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 30);
const txt = (v, max = 200) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const num = (v) => { if (v === '' || v === null || v === undefined) return null; const n = Number(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const slugDe = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.com.*$/, '').replace(/[^a-z0-9]+/g, '').slice(0, 30);
const falha = (status, msg) => { const e = new Error(msg); e.status = status; throw e; };
function lerCookie(req, nome) {
  for (const p of String(req.headers.cookie || '').split(';')) { const [k, ...v] = p.trim().split('='); if (k === nome) return decodeURIComponent(v.join('=')); }
  return null;
}
const evento = (gestorId, imobId, acao, detalhe) => q('INSERT INTO eventos(gestor_id, imobiliaria_id, acao, detalhe) VALUES ($1,$2,$3,$4)', [gestorId, imobId, acao, detalhe]).catch(() => {});

// ---------- sessão ----------
async function gestorDa(req) {
  const t = lerCookie(req, COOKIE); if (!t) return null;
  return um(`SELECT g.id, g.nome, g.email FROM sessoes s JOIN gestores g ON g.id = s.gestor_id WHERE s.token_hash = $1 AND s.expira_em > now() AND g.ativo = 1`, [sha256(t)]);
}
const exige = (fn, erroSeguro) => async (req, res) => {
  try {
    if (req.method !== 'GET' && req.get('x-gestor') !== '1') falha(403, 'Pedido recusado.');
    const g = await gestorDa(req); if (!g) falha(401, 'Entre de novo.');
    req.gestor = g; await fn(req, res);
  } catch (e) { res.status(e.status || 500).json({ erro: e.status ? e.message : erroSeguro || 'Algo deu errado: ' + e.message }); }
};

// ---------- Vercel (opcional: só com VERCEL_TOKEN) ----------
async function vercel(caminho, metodo = 'GET', corpo) {
  const tok = process.env.VERCEL_TOKEN; if (!tok) return null;
  const r = await fetch(`https://api.vercel.com${caminho}${caminho.includes('?') ? '&' : '?'}teamId=${TEAM}`, {
    method: metodo, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) falha(502, 'Vercel: ' + ((j.error && j.error.message) || r.status));
  return j;
}
function variaveis(im, dbUrl, segredo) {
  const v = {
    DATABASE_URL: dbUrl, SECRET_KEY: segredo, CLIENTE_NOME: im.nome, EMPRESA: im.empresa || im.nome,
    BLOG_NOME: `${im.nome} Blog`, BLOG_LEGENDA: `Casa, bairro e jeito de morar, pela ${im.empresa || im.nome}`,
    BLOG_DIARIO_URL: `${VAZIO}/blog`, PORTAL_CONTEUDO_URL: `${VAZIO}/portal`, BAIRROS_CONTEUDO_URL: `${VAZIO}/bairros`,
    IA_MODO: 'desligado', RADAR_PORTAIS: '0', FISGUEI_ROBO: '0', ESCRITORIO: '0', DRIVE_ROOT_NAME: `${im.nome} Imóveis`,
  };
  if (im.fundo) v.PORTAL_FUNDO = im.fundo; // papel de parede do portal: um lugar-símbolo de Campinas, diferente para cada imobiliária
  if (im.link) { v.PUBLIC_URL = im.link; v.LINK_ONLINE = im.link; }
  return v;
}
// Cada imobiliária ganha um papel de parede próprio, pela ordem de criação.
async function comFundo(im) {
  const r = await um(`SELECT count(*)::int AS n FROM imobiliarias WHERE id < $1`, [im.id]);
  const { SEQUENCIA } = require('../portal/fundos');
  return { ...im, fundo: SEQUENCIA[((r && r.n) || 0) % SEQUENCIA.length] };
}
async function publicaNaVercel(im, vars) {
  const nome = ('imob-' + im.slug).slice(0, 40);
  const p = await vercel('/v11/projects', 'POST', {
    name: nome, framework: null, serverlessFunctionRegion: 'pdx1', gitRepository: { type: 'github', repo: REPO },
    environmentVariables: Object.entries(vars).map(([key, value]) => ({ key, value, type: /URL$|KEY$/.test(key) && key !== 'BLOG_DIARIO_URL' ? 'encrypted' : 'plain', target: ['production', 'preview'] })),
  });
  if (!p) return null;
  // endereço padrão <nome>.corretordofuturo.app ligado ao projeto (o domínio já é da equipe na Vercel)
  try { await vercel(`/v10/projects/${p.id}/domains`, 'POST', { name: dominioDe(im.slug) }); } catch (e) { console.error('[gestor] domínio', e.message); }
  const [org, repo] = REPO.split('/');
  await vercel('/v13/deployments', 'POST', { name: nome, project: p.id, target: 'production', gitSource: { type: 'github', org, repo, ref: 'main' } });
  return p;
}
// link do projeto (a Vercel escolhe o endereço .vercel.app na primeira publicação)
async function linkDaVercel(projeto) {
  try {
    const d = await vercel(`/v9/projects/${encodeURIComponent(projeto)}/domains?production=true`);
    const l = d && (d.domains || []).map((x) => x.name).sort((a, b) => (b.endsWith('.' + DOMINIO_BASE) - a.endsWith('.' + DOMINIO_BASE)) || a.length - b.length);
    return l && l.length ? 'https://' + l[0] : null;
  } catch { return null; }
}

// ---------- rotas ----------
const api = express.Router();
api.use(express.json({ limit: '200kb' }));
// O parser também pode incluir parte do corpo no erro: nunca ecoar uma chave enviada com JSON inválido.
// As rotas do Express aceitam maiúsculas e minúsculas; a proteção deve reconhecer as mesmas variações.
api.use((err, req, res, next) => {
  if (/^\/cerebro(?:\/|$)/i.test(req.path)) return res.status(err.status === 413 ? 413 : 400).json({ erro: 'Pedido inválido. Confira os campos e tente novamente.' });
  next(err);
});

api.post('/login', async (req, res) => {
  try {
    const email = txt(req.body && req.body.email, 160) || '', senha = String((req.body && req.body.senha) || '');
    const chave = sha256((req.ip || '') + '|' + email.toLowerCase());
    const n = await um(`SELECT count(*)::int n FROM tentativas WHERE chave = $1 AND em > now() - interval '15 minutes'`, [chave]);
    if (n && n.n >= 8) falha(429, 'Muitas tentativas. Espere 15 minutos.');
    const g = await um('SELECT * FROM gestores WHERE email = $1 AND ativo = 1', [email]);
    if (!g || !confere(senha, g.senha_hash)) { await q('INSERT INTO tentativas(chave) VALUES ($1)', [chave]); falha(401, 'E-mail ou senha não conferem.'); }
    const token = crypto.randomBytes(32).toString('hex');
    await q(`INSERT INTO sessoes(token_hash, gestor_id, expira_em) VALUES ($1, $2, now() + interval '12 hours')`, [sha256(token), g.id]);
    await q(`DELETE FROM sessoes WHERE expira_em < now()`);
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${SEGURO}`);
    evento(g.id, null, 'login', req.ip);
    res.json({ nome: g.nome, email: g.email });
  } catch (e) { res.status(e.status || 500).json({ erro: e.status ? e.message : 'Não foi possível entrar agora.' }); }
});
api.post('/logout', async (req, res) => {
  const t = lerCookie(req, COOKIE); if (t) await q('DELETE FROM sessoes WHERE token_hash = $1', [sha256(t)]).catch(() => {});
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${SEGURO}`); res.json({ ok: true });
});
api.get('/eu', exige(async (req, res) => res.json(req.gestor)));
api.post('/senha', exige(async (req, res) => {
  const nova = String((req.body && req.body.nova) || '');
  if (nova.length < 10) falha(400, 'A senha nova precisa ter pelo menos 10 caracteres.');
  const g = await um('SELECT senha_hash FROM gestores WHERE id = $1', [req.gestor.id]);
  if (!confere(String(req.body.atual || ''), g.senha_hash)) falha(400, 'A senha atual não confere.');
  await q('UPDATE gestores SET senha_hash = $1 WHERE id = $2', [hashSenha(nova), req.gestor.id]);
  await q('DELETE FROM sessoes WHERE gestor_id = $1 AND token_hash <> $2', [req.gestor.id, sha256(lerCookie(req, COOKIE))]);
  evento(req.gestor.id, null, 'senha', null); res.json({ ok: true });
}));

const COLS = 'id, slug, nome, empresa, materias_dia, onboarding, contato_nome, contato_email, contato_telefone, link, dominio, vercel_projeto, plano, mensalidade, comissao_pct, comissao_venda_pct, creditos_fisgar_mes, situacao, publicada, notas, criado_em, atualizado_em';
api.get('/imobiliarias', exige(async (req, res) => {
  const lista = await q(`SELECT ${COLS} FROM imobiliarias ORDER BY id`);
  { // papel de parede de cada imobiliária (o mesmo do portal dela), para o fundo do cartão
    const { SEQUENCIA, fundoDe } = require('../portal/fundos'); let k = 0;
    for (const im of lista) { const f = fundoDe(SEQUENCIA[(k++) % SEQUENCIA.length], im.nome); im.fundo = { src: f.src, lugar: f.lugar, posicao: f.posicao }; }
  }
  await Promise.all(lista.map(async (im) => {
    try { im.numeros = (await um('SELECT numeros($1) AS n', [im.slug])).n; } catch (e) { im.numeros = null; im.erro = e.message; }
    if (!im.link && im.vercel_projeto && process.env.VERCEL_TOKEN) {
      im.link = await linkDaVercel(im.vercel_projeto);
      if (im.link) await q('UPDATE imobiliarias SET link = $1, publicada = 1 WHERE id = $2', [im.link, im.id]);
    }
    for (const k of ['mensalidade', 'comissao_pct', 'comissao_venda_pct']) im[k] = Number(im[k]);
    const n = im.numeros || {};
    im.comissao_mes = Math.round(Number(n.valor_vendido_mes || 0) * (im.comissao_venda_pct / 100) * (im.comissao_pct / 100));
    im.comissao_total = Math.round(Number(n.valor_vendido_total || 0) * (im.comissao_venda_pct / 100) * (im.comissao_pct / 100));
  }));
  const ativas = lista.filter((i) => i.situacao === 'ativa');
  res.json({
    imobiliarias: lista,
    resumo: {
      total: lista.length, ativas: ativas.length, suspensas: lista.filter((i) => i.situacao === 'suspensa').length, implantacao: lista.filter((i) => i.situacao === 'implantacao').length,
      mensalidades: ativas.reduce((s, i) => s + i.mensalidade, 0),
      comissao_mes: lista.reduce((s, i) => s + i.comissao_mes, 0),
      vgv: lista.reduce((s, i) => s + Number((i.numeros || {}).vgv_carteira || 0), 0),
      imoveis: lista.reduce((s, i) => s + Number((i.numeros || {}).imoveis || 0), 0),
      leads_30d: lista.reduce((s, i) => s + Number((i.numeros || {}).leads_30d || 0), 0),
      creditos_mes: lista.reduce((s, i) => s + Number((i.numeros || {}).creditos_mes || 0), 0),
      vercel_automatico: !!process.env.VERCEL_TOKEN,
    },
  });
}));

const EDITAVEIS = { nome: 120, empresa: 160, contato_nome: 120, contato_email: 160, contato_telefone: 40, link: 300, dominio: 200, plano: 40, notas: 2000 };
const NUMEROS = ['mensalidade', 'comissao_pct', 'comissao_venda_pct', 'creditos_fisgar_mes'];
api.patch('/imobiliarias/:id', exige(async (req, res) => {
  const im = await um(`SELECT ${COLS} FROM imobiliarias WHERE id = $1`, [Number(req.params.id)]) || falha(404, 'Imobiliária não encontrada.');
  const b = req.body || {}, sets = [], p = [];
  for (const [k, max] of Object.entries(EDITAVEIS)) if (b[k] !== undefined) { if (k === 'nome' && !txt(b[k])) falha(400, 'O nome não pode ficar vazio.'); sets.push(`${k} = $${p.push(txt(b[k], max))}`); }
  for (const k of NUMEROS) if (b[k] !== undefined) { const v = num(b[k]); if (v === null || v < 0 || (k.endsWith('_pct') && v > 100)) falha(400, `Valor inválido em ${k}.`); sets.push(`${k} = $${p.push(k === 'creditos_fisgar_mes' ? Math.round(v) : v)}`); }
  if (b.link !== undefined && b.link && !/^https:\/\/[a-z0-9.-]+(\/.*)?$/i.test(b.link)) falha(400, 'O link precisa começar com https://');
  if (!sets.length) return res.json({ ok: true });
  sets.push(`atualizado_em = to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS')`);
  await q(`UPDATE imobiliarias SET ${sets.join(', ')} WHERE id = $${p.push(im.id)}`, p);
  evento(req.gestor.id, im.id, 'editou', Object.keys(b).join(', '));
  res.json({ ok: true });
}));

api.post('/imobiliarias/:id/situacao', exige(async (req, res) => {
  const im = await um('SELECT id, slug, nome FROM imobiliarias WHERE id = $1', [Number(req.params.id)]) || falha(404, 'Imobiliária não encontrada.');
  const suspensa = !!(req.body && req.body.suspensa);
  await q('SELECT suspender($1, $2)', [im.slug, suspensa]);
  evento(req.gestor.id, im.id, suspensa ? 'suspendeu' : 'reativou', im.nome);
  res.json({ ok: true, situacao: suspensa ? 'suspensa' : 'ativa' });
}));

// Nova imobiliária: cadastro + banco próprio + administrador; publica na Vercel sozinho se houver VERCEL_TOKEN.
api.post('/imobiliarias', exige(async (req, res) => {
  const b = req.body || {};
  const nome = txt(b.nome, 120) || falha(400, 'Informe o nome da imobiliária.');
  const slug = slugDe(b.slug || nome);
  if (!/^[a-z][a-z0-9_]{2,30}$/.test(slug)) falha(400, 'Nome técnico inválido: use letras e números (começando por letra).');
  const adminEmail = txt(b.admin_email, 160); if (!adminEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) falha(400, 'Informe o e-mail do administrador da imobiliária.');
  const adminSenha = String(b.admin_senha || ''); if (adminSenha.length < 8) falha(400, 'A senha do administrador precisa ter pelo menos 8 caracteres.');
  if (await um('SELECT 1 FROM imobiliarias WHERE slug = $1', [slug])) falha(409, `Já existe uma imobiliária com o nome técnico "${slug}".`);
  const im = await um(`INSERT INTO imobiliarias(slug, nome, empresa, contato_nome, contato_email, contato_telefone, plano, mensalidade, comissao_pct, comissao_venda_pct, creditos_fisgar_mes, situacao, notas, link, dominio)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'implantacao',$12,$13,$14) RETURNING ${COLS}`,
  [slug, nome, txt(b.empresa, 160) || nome, txt(b.contato_nome, 120), txt(b.contato_email, 160) || adminEmail, txt(b.contato_telefone, 40), txt(b.plano, 40) || 'essencial',
    num(b.mensalidade) || 0, num(b.comissao_pct) ?? 20, num(b.comissao_venda_pct) ?? 6, Math.round(num(b.creditos_fisgar_mes) || 0), txt(b.notas, 2000),
    `https://${dominioDe(slug)}`, dominioDe(slug)]);
  const dbSenha = senhaForte();
  try {
    await q('SELECT criar_imobiliaria($1, $2, $3, $4, $5)', [slug, dbSenha, txt(b.admin_nome, 120) || `Administrador ${nome}`, adminEmail, hashSenha(adminSenha)]);
  } catch (e) { await q('DELETE FROM imobiliarias WHERE id = $1', [im.id]); falha(400, 'Não foi possível criar o banco: ' + e.message); }
  const dbUrl = `postgres://${slug}_app.${PROJETO_DB}:${dbSenha}@${POOLER}/postgres`;
  const segredo = crypto.randomBytes(32).toString('hex');
  await q('UPDATE imobiliarias SET db_url_cifrada = $1 WHERE id = $2', [cifra(JSON.stringify({ dbUrl, segredo })), im.id]);
  evento(req.gestor.id, im.id, 'criou', `${nome} (${slug})`);
  let publicada = false, aviso = null;
  if (process.env.VERCEL_TOKEN) {
    try {
      const p = await publicaNaVercel(im, variaveis(await comFundo(im), dbUrl, segredo));
      if (p) { publicada = true; await q(`UPDATE imobiliarias SET vercel_projeto = $1, publicada = 1, situacao = 'ativa' WHERE id = $2`, [p.name, im.id]); }
    } catch (e) { aviso = e.message; }
  }
  res.json({ ok: true, id: im.id, slug, publicada, aviso });
}));

// Dados de instalação (para publicar à mão na Vercel): variáveis com a conexão do banco.
api.get('/imobiliarias/:id/instalacao', exige(async (req, res) => {
  const im = await um(`SELECT ${COLS}, db_url_cifrada FROM imobiliarias WHERE id = $1`, [Number(req.params.id)]) || falha(404, 'Imobiliária não encontrada.');
  if (!im.db_url_cifrada) return res.json({ variaveis: null, aviso: 'Esta imobiliária foi instalada antes do painel: as variáveis estão no projeto dela na Vercel.' });
  const { dbUrl, segredo } = JSON.parse(decifra(im.db_url_cifrada));
  evento(req.gestor.id, im.id, 'viu_instalacao', null);
  res.json({ variaveis: variaveis(await comFundo(im), dbUrl, segredo), repo: REPO, dominio: im.dominio || dominioDe(im.slug), vercel_automatico: !!process.env.VERCEL_TOKEN });
}));
api.post('/imobiliarias/:id/publicada', exige(async (req, res) => {
  const link = txt(req.body && req.body.link, 300);
  if (link && !/^https:\/\/[a-z0-9.-]+(\/.*)?$/i.test(link)) falha(400, 'O link precisa começar com https://');
  await q(`UPDATE imobiliarias SET publicada = 1, situacao = CASE WHEN situacao = 'implantacao' THEN 'ativa' ELSE situacao END, link = coalesce($1, link), vercel_projeto = coalesce($2, vercel_projeto) WHERE id = $3`,
    [link, txt(req.body && req.body.vercel_projeto, 100), Number(req.params.id)]);
  evento(req.gestor.id, Number(req.params.id), 'publicada', link); res.json({ ok: true });
}));
// ---------- Assistente "Nova imobiliária" com o Herrera (avatar de treinamento) ----------
// Os passos da configuração; o painel guarda em imobiliarias.onboarding o que já foi feito e conferido.
const PASSOS = ['boas-vindas', 'dados', 'administrador', 'publicar', 'marca', 'gemini', 'google-maps', 'facebook-instagram', 'google-meu-negocio', 'whatsapp', 'pronto'];
async function marcaPasso(im, gestorId, passo, feito, detalhe) {
  if (!PASSOS.includes(passo)) falha(400, 'Passo desconhecido.');
  const v = feito ? { feito: true, em: new Date().toISOString(), por: gestorId, ...(detalhe ? { detalhe: String(detalhe).slice(0, 300) } : {}) } : null;
  await q(`UPDATE imobiliarias SET onboarding = CASE WHEN $1::jsonb IS NULL THEN onboarding - $2 ELSE jsonb_set(onboarding, ARRAY[$2], $1::jsonb) END WHERE id = $3`, [v ? JSON.stringify(v) : null, passo, im.id]);
}
async function imobDoAssistente(id) {
  return await um(`SELECT ${COLS}, db_url_cifrada IS NOT NULL AS automatico FROM imobiliarias WHERE id = $1`, [Number(id)]) || falha(404, 'Imobiliária não encontrada.');
}
async function noAr(link) {
  if (!link) return { ok: false, motivo: 'Ainda sem link.' };
  try {
    const r = await fetch(link.replace(/\/+$/, '') + '/imoveis', { redirect: 'manual', signal: AbortSignal.timeout(9000), headers: { 'User-Agent': 'HerreraHouseIA-assistente/1.0' } });
    return r.status < 400 ? { ok: true, status: r.status } : { ok: false, status: r.status, motivo: `O endereço respondeu ${r.status}.` };
  } catch (e) { return { ok: false, motivo: 'Ainda não respondeu (' + e.message + ').' }; }
}
async function configurado(slug) { try { return (await um('SELECT configurado($1) AS c', [slug])).c || {}; } catch { return {}; } }
api.get('/imobiliarias/:id/assistente', exige(async (req, res) => {
  const im = await imobDoAssistente(req.params.id);
  res.json({ imobiliaria: im, passos: PASSOS, onboarding: im.onboarding || {}, configurado: await configurado(im.slug), publicacao: await noAr(im.link) });
}));
api.post('/imobiliarias/:id/assistente/passo', exige(async (req, res) => {
  const im = await imobDoAssistente(req.params.id);
  const b = req.body || {};
  await marcaPasso(im, req.gestor.id, String(b.passo || ''), b.feito !== false, b.detalhe);
  evento(req.gestor.id, im.id, 'assistente', `${b.passo}${b.feito === false ? ' (desmarcado)' : ''}`);
  res.json({ ok: true });
}));
// Confere de verdade: o site no ar, as redes conectadas, os números de WhatsApp, a equipe.
api.post('/imobiliarias/:id/assistente/conferir/:passo', exige(async (req, res) => {
  const im = await imobDoAssistente(req.params.id);
  const passo = req.params.passo;
  const c = await configurado(im.slug);
  const redes = c.redes || [];
  let r;
  if (passo === 'publicar') r = await noAr(im.link);
  else if (passo === 'facebook-instagram') r = redes.includes('instagram') && redes.includes('facebook') ? { ok: true } : { ok: false, motivo: redes.includes('facebook') ? 'O Facebook está conectado, mas falta o Instagram (ele precisa ser conta profissional ligada à Página).' : 'Ainda não há Facebook nem Instagram conectados no sistema da imobiliária.' };
  else if (passo === 'google-meu-negocio') r = redes.includes('google') ? { ok: true } : { ok: false, motivo: 'O Google Meu Negócio ainda não foi conectado no sistema da imobiliária.' };
  else if (passo === 'whatsapp') r = Number(c.linhas_whatsapp) > 0 ? { ok: true, detalhe: `${c.linhas_whatsapp} número(s) conectado(s)` } : { ok: false, motivo: 'Nenhum número de WhatsApp conectado aos agentes ainda.' };
  else if (passo === 'gemini') r = c.gemini ? { ok: true } : { ok: false, motivo: 'A chave do Gemini ainda não está no sistema da imobiliária.' };
  else if (passo === 'google-maps') r = c.google_maps ? { ok: true } : { ok: false, motivo: 'A chave do Google Maps ainda não está no sistema da imobiliária.' };
  else if (passo === 'administrador') r = Number(c.usuarios) > 0 ? { ok: true } : { ok: false, motivo: 'Sem usuário ativo.' };
  else falha(400, 'Esse passo não tem conferência automática.');
  if (r.ok) await marcaPasso(im, req.gestor.id, passo, true, r.detalhe || 'conferido');
  res.json(r);
}));
// Chave do Gemini: testa no Google e, se a imobiliária foi criada pelo painel, grava já cifrada na configuração dela
// (mesma cifra do sistema: derivada da conexão do banco da imobiliária). A chave nunca fica no banco da plataforma.
api.post('/imobiliarias/:id/assistente/gemini', exige(async (req, res) => {
  const im = await imobDoAssistente(req.params.id);
  const chave = String((req.body || {}).chave || '').trim();
  if (!/^[A-Za-z0-9_\-.]{20,200}$/.test(chave)) falha(400, 'Isso não parece uma chave do Gemini (começa com "AIza…").');
  const t = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=50', { headers: { 'x-goog-api-key': chave }, signal: AbortSignal.timeout(15000) });
  const j = await t.json().catch(() => ({}));
  if (!t.ok) return res.json({ ok: false, motivo: t.status === 400 || t.status === 403 ? 'O Google recusou essa chave. Confira se copiou inteira e se ela é do Google AI Studio.' : `O Google respondeu ${t.status}.` });
  const modelos = (j.models || []).map((m) => String(m.name || '').replace(/^models\//, ''));
  const modelo = modelos.includes('gemini-flash-latest') ? 'gemini-flash-latest' : modelos.find((m) => /flash/.test(m) && !/image|tts|live/.test(m)) || 'gemini-flash-latest';
  if (!im.automatico) return res.json({ ok: true, gravado: false, modelo, motivo: 'Chave válida. Esta imobiliária foi instalada antes do painel: cole a chave no sistema dela, em Escritório virtual › Configuração geral.' });
  const row = await um('SELECT db_url_cifrada FROM imobiliarias WHERE id = $1', [im.id]);
  const { dbUrl } = JSON.parse(decifra(row.db_url_cifrada));
  const valor = JSON.stringify({ chave: cifraIa.cifra(dbUrl, chave), modelo, por: 'Assistente Herrera (painel do gestor)', em: new Date().toISOString(), teste_ok: true, testado_em: new Date().toISOString() });
  await q('SELECT definir_config($1, $2, $3)', [im.slug, 'escritorio_ia', valor]);
  await marcaPasso(im, req.gestor.id, 'gemini', true, `chave …${chave.slice(-4)} · ${modelo}`);
  evento(req.gestor.id, im.id, 'assistente', `gemini …${chave.slice(-4)}`);
  res.json({ ok: true, gravado: true, modelo });
}));
// Chave do Google Maps: testa o 3D realista (Map Tiles) e a foto de fachada (Street View Static) como se fosse o site da
// imobiliária (a chave deve estar restrita ao endereço dela) e grava na configuração dela.
api.post('/imobiliarias/:id/assistente/maps', exige(async (req, res) => {
  const im = await imobDoAssistente(req.params.id);
  const chave = String((req.body || {}).chave || '').trim();
  if (!/^[A-Za-z0-9_\-]{30,60}$/.test(chave)) falha(400, 'Isso não parece uma chave do Google Maps (começa com "AIza…").');
  const ref = { Referer: (im.link || `https://${dominioDe(im.slug)}`).replace(/\/?$/, '/') };
  const testes = {};
  try { const t = await fetch(`https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(chave)}`, { headers: ref, signal: AbortSignal.timeout(15000) }); testes.map_tiles = t.ok ? 'ok' : `recusou (${t.status})`; } catch (e) { testes.map_tiles = 'sem resposta'; }
  try { const t = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=-22.8997,-47.0606&key=${encodeURIComponent(chave)}`, { headers: ref, signal: AbortSignal.timeout(15000) }); const j = await t.json().catch(() => ({})); testes.street_view = j.status === 'OK' || j.status === 'ZERO_RESULTS' ? 'ok' : `recusou (${j.status || t.status})`; } catch { testes.street_view = 'sem resposta'; }
  if (testes.map_tiles !== 'ok' && testes.street_view !== 'ok') return res.json({ ok: false, testes, motivo: 'O Google recusou a chave nas duas APIs. Ative a Map Tiles API e a Street View Static API no projeto e confira a restrição de site.' });
  await q('SELECT definir_config($1, $2, $3)', [im.slug, 'google_maps_chave', chave]);
  const parcial = testes.map_tiles !== 'ok' || testes.street_view !== 'ok';
  await marcaPasso(im, req.gestor.id, 'google-maps', true, `chave …${chave.slice(-4)}${parcial ? ' (parcial)' : ''}`);
  evento(req.gestor.id, im.id, 'assistente', `google maps …${chave.slice(-4)}`);
  res.json({ ok: true, testes, parcial, motivo: parcial ? `Gravada, mas uma das APIs ainda recusa: ${testes.map_tiles !== 'ok' ? 'Map Tiles (3D realista)' : 'Street View Static (fachadas)'}. Ative no Google Cloud.` : null });
}));

// ---------- Cérebro central (somente sessão do gestor; segredos ficam no servidor) ----------
const GEMINI_API = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta';
const MODELO_CENTRAL = 'gemini-flash-latest';
const exigeCerebro = (fn) => exige(fn, 'Não foi possível acessar o cérebro central. Tente novamente.');
function modeloCentral(v) {
  if (typeof v !== 'string') falha(400, 'Escolha um modelo Gemini válido.');
  const m = v.trim().replace(/^models\//, '');
  if (!/^gemini-[A-Za-z0-9._-]{1,73}$/.test(m)) falha(400, 'Escolha um modelo Gemini válido.');
  return m;
}
async function estadoCentral() {
  // Até a consulta de estado recebe somente o sufixo. Nunca devolver config ou o resultado bruto da função.
  const r = await um(`SELECT
    nullif(right(btrim((SELECT valor FROM plataforma.config WHERE chave = 'ia_central')), 4), '') AS chave_final,
    coalesce(nullif((SELECT valor FROM plataforma.config WHERE chave = 'ia_central_modelo'), ''), $1) AS modelo,
    (SELECT max(em) FROM plataforma.eventos WHERE acao = 'ia_central_chave') AS alterada_em`, [MODELO_CENTRAL]);
  return { tem_chave: !!r.chave_final, chave_final: r.chave_final, modelo: r.modelo, alterada_em: r.alterada_em };
}
async function segredoCentral() {
  const rows = await q(`SELECT chave, valor FROM plataforma.config WHERE chave IN ('ia_central', 'ia_central_modelo')`);
  const c = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
  const chave = String(c.ia_central || '').trim();
  if (!chave) falha(400, 'Guarde a chave central do Gemini primeiro.');
  return { chave, modelo: modeloCentral(c.ia_central_modelo || MODELO_CENTRAL) };
}
const erroGemini = (status) => status === 400 || status === 401 || status === 403 ? 'O Google recusou a chave ou o pedido. Confira a chave e as permissões do projeto.'
  : status === 404 ? 'Modelo não disponível para esta chave. Atualize a lista de modelos.'
    : status === 429 ? 'Limite de uso do Gemini atingido. Tente novamente em alguns minutos.'
      : status >= 500 ? 'O Gemini está indisponível agora. Tente novamente em alguns minutos.' : 'Não foi possível consultar o Gemini.';

api.get('/cerebro', exigeCerebro(async (req, res) => {
  const periodo = req.query.periodo || 'mes';
  if (!['hoje', 'mes', 'mes_passado'].includes(periodo)) falha(400, 'Período inválido.');
  const [configuracao, imobiliarias, dias] = await Promise.all([
    estadoCentral(),
    q(`WITH relogio AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje),
      limites AS (SELECT
        CASE $1 WHEN 'hoje' THEN hoje WHEN 'mes' THEN date_trunc('month', hoje)::date
          ELSE (date_trunc('month', hoje) - interval '1 month')::date END AS inicio,
        CASE $1 WHEN 'hoje' THEN hoje + 1 WHEN 'mes' THEN (date_trunc('month', hoje) + interval '1 month')::date
          ELSE date_trunc('month', hoje)::date END AS fim FROM relogio),
      uso AS (SELECT imobiliaria, sum(chamadas) AS chamadas, sum(tokens_entrada) AS tokens_entrada,
        sum(tokens_saida) AS tokens_saida, sum(erros) AS erros FROM plataforma.ia_uso, limites
        WHERE dia >= inicio AND dia < fim GROUP BY imobiliaria)
      SELECT coalesce(i.slug, u.imobiliaria) AS slug,
        coalesce(i.nome, CASE WHEN u.imobiliaria = 'plataforma' THEN 'Plataforma (testes)' ELSE u.imobiliaria END) AS nome,
        coalesce(u.chamadas, 0) AS chamadas, coalesce(u.tokens_entrada, 0) AS tokens_entrada,
        coalesce(u.tokens_saida, 0) AS tokens_saida, coalesce(u.erros, 0) AS erros
      FROM plataforma.imobiliarias i FULL JOIN uso u ON u.imobiliaria = i.slug
      ORDER BY (coalesce(u.tokens_entrada, 0) + coalesce(u.tokens_saida, 0)) DESC, chamadas DESC, nome`, [periodo]),
    q(`WITH relogio AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje)
      SELECT to_char(d.dia, 'YYYY-MM-DD') AS dia, coalesce(sum(u.chamadas), 0) AS chamadas,
        coalesce(sum(u.tokens_entrada), 0) AS tokens_entrada, coalesce(sum(u.tokens_saida), 0) AS tokens_saida,
        coalesce(sum(u.erros), 0) AS erros FROM relogio,
        LATERAL generate_series(hoje - 29, hoje, interval '1 day') AS d(dia)
      LEFT JOIN plataforma.ia_uso u ON u.dia = d.dia::date GROUP BY d.dia ORDER BY d.dia`),
  ]);
  const campos = ['chamadas', 'tokens_entrada', 'tokens_saida', 'erros'];
  for (const r of [...imobiliarias, ...dias]) for (const c of campos) r[c] = Number(r[c]);
  const total = Object.fromEntries(campos.map((c) => [c, imobiliarias.reduce((s, r) => s + r[c], 0)]));
  res.json({ configuracao, periodo, imobiliarias, total, dias });
}));
api.post('/cerebro/chave', exigeCerebro(async (req, res) => {
  const b = req.body || {}, manter = b.chave === undefined;
  if (manter && b.modelo === undefined) falha(400, 'Informe uma chave ou escolha um modelo.');
  if (!manter && b.chave !== null && (typeof b.chave !== 'string' || !/^[A-Za-z0-9_\-.]{20,200}$/.test(b.chave.trim()))) falha(400, 'Isso não parece uma chave do Gemini. Cole a chave inteira ou use Remover.');
  const modelo = b.modelo === undefined ? null : modeloCentral(b.modelo);
  // A leitura da chave para mudar só o modelo e a gravação ficam na mesma instrução, sem cache nem ida ao cliente.
  // Evento e troca são atômicos. A função é a única responsável por escrever no cofre.
  await q(`WITH troca AS MATERIALIZED (
      SELECT plataforma.definir_ia_central(CASE WHEN $3::boolean THEN
        (SELECT valor FROM plataforma.config WHERE chave = 'ia_central') ELSE $1::text END, $2::text))
    INSERT INTO plataforma.eventos(gestor_id, imobiliaria_id, acao, detalhe)
      SELECT $4, NULL, $5, $6 FROM troca`,
  [manter || b.chave === null ? null : b.chave.trim(), modelo, manter, req.gestor.id,
    manter ? 'ia_central_modelo' : 'ia_central_chave', manter ? 'Modelo central atualizado' : b.chave === null ? 'Chave central removida' : 'Chave central atualizada']);
  res.json({ ok: true });
}));
api.get('/cerebro/modelos', exigeCerebro(async (req, res) => {
  const { chave } = await segredoCentral(), modelos = new Map(), paginas = new Set();
  let pagina = '';
  const signal = AbortSignal.timeout(15000);
  try {
    do {
      const r = await fetch(`${GEMINI_API}/models?pageSize=200${pagina ? '&pageToken=' + encodeURIComponent(pagina) : ''}`, { headers: { 'x-goog-api-key': chave }, signal });
      if (!r.ok) return res.status(502).json({ erro: erroGemini(r.status) });
      const j = await r.json();
      for (const m of j.models || []) {
        const id = String(m.name || '').replace(/^models\//, '');
        // Mesmos modelos de texto de IA.testar; nenhuma resposta bruta do provedor chega ao navegador.
        if ((m.supportedGenerationMethods || []).includes('generateContent') && /^gemini-[A-Za-z0-9._-]{1,73}$/.test(id) && !/embedding|image|tts|audio|live/i.test(id) && !id.includes(chave)) {
          modelos.set(id, { id, nome: String(m.displayName || id).split(chave).join('…' + chave.slice(-4)).slice(0, 120) });
        }
      }
      pagina = j.nextPageToken || '';
      if (pagina && paginas.has(pagina)) throw new Error('Paginação repetida');
      paginas.add(pagina);
    } while (pagina);
    res.json({ modelos: [...modelos.values()] });
  } catch { res.status(502).json({ erro: 'Não foi possível listar os modelos do Gemini. Tente novamente.' }); }
}));
api.post('/cerebro/testar', exigeCerebro(async (req, res) => {
  const { chave, modelo: atual } = await segredoCentral();
  const modelo = req.body && req.body.modelo !== undefined ? modeloCentral(req.body.modelo) : atual;
  const inicio = Date.now(); let ok = false, mensagem, uso = {};
  try {
    // Mesmo generateContent de IA.testar, sempre com a chave central e sem alterar a configuração da imobiliária.
    const r = await fetch(`${GEMINI_API}/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Responda apenas: OK.' }] }], generationConfig: { maxOutputTokens: 256 } }),
      signal: AbortSignal.timeout(30000),
    });
    const j = await r.json(); uso = j.usageMetadata || {};
    ok = r.ok && (j.candidates || []).some((c) => (c.content?.parts || []).some((p) => !p.thought && typeof p.text === 'string' && p.text.trim()));
    mensagem = ok ? 'O Gemini respondeu à pergunta de teste.' : r.ok ? 'O Gemini não devolveu texto. Tente novamente ou escolha outro modelo.' : erroGemini(r.status);
  } catch { mensagem = 'O Gemini não respondeu ao teste. Confira a conexão e tente novamente.'; }
  const ms = Date.now() - inicio;
  const tokens = (v) => Number.isSafeInteger(v) && v >= 0 ? v : 0;
  // O teste também consome tokens; fica separado das imobiliárias e não derruba o resultado se a medição falhar.
  await q(`INSERT INTO plataforma.ia_uso(imobiliaria, dia, modelo, chamadas, tokens_entrada, tokens_saida, erros)
    VALUES ('plataforma', (now() AT TIME ZONE 'America/Sao_Paulo')::date, $1, 1, $2, $3, $4)
    ON CONFLICT (imobiliaria, dia, modelo) DO UPDATE SET chamadas = ia_uso.chamadas + 1,
      tokens_entrada = ia_uso.tokens_entrada + EXCLUDED.tokens_entrada, tokens_saida = ia_uso.tokens_saida + EXCLUDED.tokens_saida,
      erros = ia_uso.erros + EXCLUDED.erros, atualizado_em = now()`,
  [modelo, tokens(uso.promptTokenCount), tokens(uso.candidatesTokenCount), ok ? 0 : 1]).catch(() => {});
  res.json({ ok, mensagem, ms });
}));

// Banco de matérias do blog: estoque, entregas e o ciclo (sincronizar o ramo + entregar) na hora.
const banco = require('./banco');
api.get('/banco', exige(async (req, res) => res.json(await banco.situacao(q))));
api.post('/banco/ciclo', exige(async (req, res) => {
  const r = await banco.ciclo(q);
  evento(req.gestor.id, null, 'banco_ciclo', `${r.sincronizacao.novas} nova(s) no banco; ${(r.hoje.entregues || []).length + ((r.amanha && r.amanha.entregues) || []).length} entregue(s)`);
  res.json(r);
}));
api.post('/imobiliarias/:id/materias', exige(async (req, res) => {
  const v = req.body && req.body.materias_dia;
  const n = v === null || v === '' || v === undefined ? null : Math.round(Number(v));
  if (n !== null && !(n >= 0 && n <= 3)) falha(400, 'Matérias por dia: de 0 a 3 (vazio = pelo plano).');
  await q('UPDATE imobiliarias SET materias_dia = $1 WHERE id = $2', [n, Number(req.params.id)]);
  evento(req.gestor.id, Number(req.params.id), 'materias_dia', n === null ? 'pelo plano' : String(n)); res.json({ ok: true });
}));
// LGPD: pedidos de titulares feitos em corretordofuturo.app/privacidade (prazo de 15 dias) e a lista comum "não contatar".
api.get('/lgpd', exige(async (req, res) => {
  const pedidos = await q(`SELECT id, protocolo, tipo, nome, email, telefone, mensagem, imobiliaria, situacao, resposta,
    to_char(criado_em AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI') criado_em, to_char(prazo AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') prazo,
    to_char(atendido_em AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI') atendido_em
    FROM titular_pedidos ORDER BY (situacao = 'aberto') DESC, id DESC LIMIT 200`);
  const n = await um('SELECT count(*)::int n FROM nao_contatar');
  res.json({ pedidos, nao_contatar: n ? n.n : 0, tipos: require('../lgpd').TIPOS });
}));
api.post('/lgpd/:id/atender', exige(async (req, res) => {
  const resposta = txt(req.body && req.body.resposta, 4000) || falha(400, 'Escreva o que foi feito ou respondido ao titular.');
  const p = await um(`UPDATE titular_pedidos SET situacao = 'atendido', resposta = $1, atendido_em = now() WHERE id = $2 RETURNING protocolo`, [resposta, Number(req.params.id)]) || falha(404, 'Pedido não encontrado.');
  evento(req.gestor.id, null, 'lgpd_atendido', p.protocolo); res.json({ ok: true });
}));
api.get('/eventos', exige(async (req, res) => res.json(await q(`SELECT e.acao, e.detalhe, e.em, i.nome imobiliaria FROM eventos e LEFT JOIN imobiliarias i ON i.id = e.imobiliaria_id WHERE e.acao <> 'login' ORDER BY e.id DESC LIMIT 30`))));
api.use((req, res) => res.status(404).json({ erro: 'Não encontrado.' }));

const PAGINA = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<title>Painel do gestor · Herrera HOUSE IA</title><meta name="robots" content="noindex,nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/gestor/gestor.css"><link rel="stylesheet" href="/gestor/herrera.css"></head><body><div id="raiz"></div><script src="/gestor/gestor.js"></script><script src="/gestor/herrera.js"></script></body></html>`;

// Fora do painel: o ciclo chamado pelo pg_cron (token em plataforma.config 'banco_ciclo_token') e um resumo
// sem segredo para a rotina que escreve (quantas há em estoque, consumo por dia e temas já usados).
async function bancoPublico(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.path === '/banco-ciclo') {
      if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
      const t = await um(`SELECT valor FROM config WHERE chave = 'banco_ciclo_token'`);
      const dado = String(req.get('x-banco-ciclo') || '');
      const ok = t && t.valor && dado.length === t.valor.length && crypto.timingSafeEqual(Buffer.from(dado), Buffer.from(t.valor));
      if (!ok) return res.status(403).json({ erro: 'Sem permissão.' });
      return res.json(await banco.ciclo(q));
    }
    const s = await banco.situacao(q);
    const nomes = (await q(`SELECT nome FROM imobiliarias`)).map((r) => r.nome);
    res.json({ livres: s.livres, total_livres: s.total_livres, consumo_dia: s.consumo_dia, dias_de_estoque: s.dias_de_estoque, temas: s.temas, nomes });
  } catch (e) { res.status(e.status || 500).json({ erro: e.status ? e.message : 'Não foi possível agora.' }); }
}

function gestor(req, res, next) {
  const host = String(req.hostname || '').toLowerCase();
  if (HOSTS.has(host) && (req.path === '/banco-ciclo' || req.path === '/banco-materias/situacao.json')) return bancoPublico(req, res);
  const SIM = { '/gestor/dashboard': 'dashboard', '/gestor/projecao': 'projecao' }[req.path.replace(/\/$/, '')];
  const cerebro = req.path.replace(/\/$/, '') === '/gestor/cerebro';
  const ehGestor = req.path === '/gestor' || req.path === '/gestor/' || !!SIM || cerebro || req.path.startsWith('/gestor-api/');
  if (!ehGestor) return next();
  if (!HOSTS.has(host)) return res.status(404).type('text/plain').send('Não encontrado.');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  if (req.path.startsWith('/gestor-api/')) { req.url = req.url.replace(/^\/gestor-api/, ''); return api(req, res, next); }
  if (cerebro) return res.type('html').send(PAGINA.replace('<body>', '<body data-pagina="cerebro">').replace('<title>Painel do gestor', '<title>Cérebro · Painel do gestor'));
  if (SIM) return res.type('html').send(PAGINA.replace('<body>', `<body data-pagina="${SIM}">`).replace('/gestor/gestor.js', '/gestor/simulacao.js').replace('/gestor/gestor.css">', '/gestor/gestor.css"><link rel="stylesheet" href="/gestor/bi.css">')
    .replace(/<title>[^<]*<\/title>/, `<title>${SIM === 'dashboard' ? 'Dashboard' : 'Projeção'} · Painel do gestor</title>`));
  res.type('html').send(PAGINA);
}

module.exports = { gestor, gestorDa, slugDe, cifra, decifra, hashSenha, confere, consulta: (sql, p) => q(sql, p) };
