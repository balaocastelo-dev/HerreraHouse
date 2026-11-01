// Controle do sistema por IAs: chave de API em qualquer rota /api + rotas /api/ia (catálogo, estado, executar).
const express = require('express');
const { one, all, run, leitura, getConfig, setConfig, audit, PG } = require('../db');
const { falha, txt, int } = require('../util');
const A = require('../auth');
const cfg = require('../config');
const K = require('./chaves');
const R = require('./registro');
const C = require('./consulta-segura');

// ---- entra pela chave: Authorization: Bearer hh_... (ou x-api-key) ----
function porChave(req, res, next) {
  const h = String(req.headers.authorization || '');
  const bruta = (h.match(/^Bearer\s+(\S+)$/i) || [])[1] || req.headers['x-api-key'];
  if (!bruta) return next();                       // sem chave: segue para a sessão do navegador
  const achou = K.porChave(bruta);
  if (!achou) return res.status(401).json({ erro: 'Chave de API inválida, revogada ou vencida.' });
  const { chave, usuario } = achou;
  const ip = req.ip || '';
  if (chave.ips && !String(chave.ips).split(',').map((s) => s.trim()).filter(Boolean).some((p) => ip.includes(p)))
    return res.status(403).json({ erro: 'Esta chave só vale nos endereços de IP autorizados.' });
  if (!K.dentroDoLimite(chave.id, chave.limite_min)) return res.status(429).json({ erro: `Limite de ${chave.limite_min} chamadas por minuto para esta chave.` });
  if (chave.somente_leitura && !['GET', 'HEAD'].includes(req.method)) return res.status(403).json({ erro: 'Chave somente de leitura.' });
  const caminho = req.baseUrl + req.path;
  const escopos = String(chave.escopos || '*').split(',');
  const preciso = K.escopoDe(caminho);
  if (!escopos.includes('*') && !escopos.includes(preciso))
    return res.status(403).json({ erro: `Esta chave não tem o escopo "${preciso}". Escopos dela: ${escopos.join(', ')}.` });
  req.usuario = usuario;
  req.apiChave = chave;
  const t0 = Date.now();
  res.on('finish', () => K.registraUso(chave.id, { metodo: req.method, caminho, status: res.statusCode, ms: Date.now() - t0, ip, acao: req.acaoIA }));
  next();
}

const r = express.Router();
const admOuGestor = (req, res, nx) => (A.veTudo(req.usuario) ? nx() : res.status(403).json({ erro: 'Só adm e gestor.' }));
const base = (req) => (cfg.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

// O escopo "plataforma" só pode ser concedido por quem é gestor da plataforma:
// sessão do painel neste endereço, ou o mesmo e-mail de um gestor ativo.
const cacheGestor = new Map();
async function ehGestorPlataforma(req) {
  const email = String((req.usuario && req.usuario.email) || '').trim().toLowerCase();
  if (!email || !process.env.PLATAFORMA_DATABASE_URL) return false;
  const agora = Date.now();
  const c = cacheGestor.get(email);
  if (c && c.ate > agora) return c.ok;
  let ok = false;
  try {
    const G = require('../plataforma/gestor');
    const sess = await G.gestorDa(req);
    if (sess) ok = true;
    else {
      const rows = await G.consulta('SELECT id FROM gestores WHERE lower(email) = $1 AND ativo = 1 LIMIT 1', [email]);
      ok = rows.length > 0;
    }
  } catch { ok = false; }
  cacheGestor.set(email, { ok, ate: agora + 60e3 });
  if (cacheGestor.size > 500) for (const [k, v] of cacheGestor) if (v.ate <= agora) cacheGestor.delete(k);
  return ok;
}
function pediuPlataforma(escopos) {
  if (escopos == null || escopos === '*' || escopos === '') return false;
  const lista = Array.isArray(escopos) ? escopos : String(escopos).split(',');
  return lista.some((s) => String(s).trim() === 'plataforma');
}

// ---- chaves de API ----
r.get('/chaves', admOuGestor, (req, res) => res.json(K.lista()));
r.get('/chaves/log', admOuGestor, (req, res) => res.json(K.log(Math.min(500, int(req.query.limite) || 100), int(req.query.chave_id))));
r.post('/chaves', admOuGestor, async (req, res) => {
  const b = req.body || {};
  if (pediuPlataforma(b.escopos) && !(await ehGestorPlataforma(req))) falha(403, 'O escopo "plataforma" só pode ser concedido pelo gestor da plataforma.');
  const alvo = int(b.usuario_id) || req.usuario.id;
  if (alvo !== req.usuario.id && !A.veTudo(req.usuario)) falha(403, 'Só adm e gestor criam chave para outro usuário.');
  const nova = K.criar({ ...b, usuarioId: alvo, criadaPor: req.usuario.id });
  audit(req.usuario.id, 'api_chave_criada', `${nova.prefixo} · ${b.nome || ''}`);
  res.json({ ...nova, aviso: 'Guarde a chave agora: ela não aparece de novo.' });
});
r.delete('/chaves/:id', admOuGestor, (req, res) => { const o = K.revogar(int(req.params.id)); audit(req.usuario.id, 'api_chave_revogada', req.params.id); res.json(o); });

// ---- mapas para a IA ----
const escopoDaChave = (req) => (req.apiChave ? String(req.apiChave.escopos).split(',') : ['*']);
r.get('/ia/manifesto', (req, res) => res.json({
  sistema: cfg.SISTEMA_NOME, imobiliaria: cfg.CLIENTE_NOME, empresa: cfg.EMPRESA, endereco: base(req),
  banco: PG ? 'postgres' : 'sqlite',
  quem: { id: req.usuario.id, nome: req.usuario.nome, perfil: req.usuario.perfil },
  chave: req.apiChave ? { nome: req.apiChave.nome, escopos: escopoDaChave(req), somente_leitura: !!req.apiChave.somente_leitura, limite_min: req.apiChave.limite_min } : 'sessão do navegador',
  escopos_possiveis: K.ESCOPOS,
  acoes: R.ACOES.length,
  mapas: { acoes: '/api/ia/acoes', ferramentas: '/api/ia/ferramentas.json', openapi: '/api/ia/openapi.json', estado: '/api/ia/estado', esquema: '/api/ia/esquema', executar: '/api/ia/executar' },
  como_usar: 'Mande Authorization: Bearer <chave> em qualquer rota /api. Uma ferramenta só: POST /api/ia/executar {"acao":"imoveis.listar","query":{...}}.',
}));
r.get('/ia/acoes', (req, res) => {
  const q = String(req.query.q || '').toLowerCase(), esc = req.query.escopo;
  res.json(R.ACOES.filter((a) => (!esc || a.escopo === esc) && (!q || (a.nome + a.resumo + a.caminho).toLowerCase().includes(q))));
});
r.get('/ia/ferramentas.json', (req, res) => res.json(R.ferramentas(req.query.formato === 'openai' ? 'openai' : 'anthropic', req.query.escopo ? [req.query.escopo] : escopoDaChave(req))));
r.get('/ia/openapi.json', (req, res) => res.json(R.openapi(base(req), cfg.SISTEMA_NOME)));

// ---- retrato do sistema ----
const n = (sql, ...p) => { try { return one(sql, ...p).n; } catch { return null; } };
r.get('/ia/estado', (req, res) => {
  const robo = (() => { try { return require('../fisguei/robo').situacao(); } catch { return null; } })();
  res.json({
    em: new Date().toISOString(), sistema: cfg.SISTEMA_NOME, imobiliaria: cfg.CLIENTE_NOME, banco: PG ? 'postgres' : 'sqlite',
    carteira: {
      imoveis: n('SELECT count(*) n FROM imoveis'),
      publicados: n("SELECT count(*) n FROM imoveis WHERE status='publicado'"),
      captacao: n("SELECT count(*) n FROM imoveis WHERE status='captacao'"),
      vendidos: n("SELECT count(*) n FROM imoveis WHERE status IN ('vendido','alugado')"),
      sem_dono: n('SELECT count(*) n FROM imoveis WHERE proprietario_id IS NULL'),
      vgv: (() => { try { return one("SELECT sum(valor) v FROM imoveis WHERE status='publicado'").v || 0; } catch { return null; } })(),
    },
    crm: {
      leads: n('SELECT count(*) n FROM leads'),
      quentes: n("SELECT count(*) n FROM leads WHERE temperatura='quente'"),
      visitas_futuras: n("SELECT count(*) n FROM visitas WHERE quando >= ?", new Date().toISOString().slice(0, 10)),
    },
    captacao: {
      oportunidades: n('SELECT count(*) n FROM oportunidades'),
      anuncios_base: n('SELECT count(*) n FROM fisguei_anuncios'),
      pedidos_na_fila: n("SELECT count(*) n FROM fisguei_pedidos WHERE situacao='fila'"),
      aprovacoes_pendentes: n("SELECT count(*) n FROM aprovacoes WHERE situacao='pendente'"),
    },
    conteudo: { posts_agendados: n("SELECT count(*) n FROM social_posts WHERE status='agendado'") },
    robo_whatsapp: robo,
    usuarios: n('SELECT count(*) n FROM usuarios WHERE ativo=1'),
    chaves_api: n('SELECT count(*) n FROM api_chaves WHERE ativo=1'),
  });
});
r.get('/ia/eventos', (req, res) => {
  const desde = int(req.query.desde) || 0, lim = Math.min(500, int(req.query.limite) || 100);
  const ev = all('SELECT id,usuario_id,acao,detalhe,criado_em FROM auditoria WHERE id > ? ORDER BY id LIMIT ?', desde, lim);
  res.json({ ultimo: ev.length ? ev[ev.length - 1].id : desde, eventos: ev });
});

// ---- configurações guardadas no banco ----
const SEGREDO = /(chave|senha|token|secret|key)/i;
r.get('/ia/config', (req, res) => {
  const uma = txt(req.query.chave, 80);
  const linhas = uma ? [{ chave: uma, valor: getConfig(uma) }] : all('SELECT chave, valor FROM config ORDER BY chave');
  res.json(linhas.map((l) => ({ chave: l.chave, valor: l.valor == null ? null : SEGREDO.test(l.chave) ? `··· ${String(l.valor).slice(-4)}` : l.valor })));
});
r.put('/ia/config', (req, res) => {
  if (req.usuario.perfil !== 'adm') falha(403, 'Só o administrador grava configuração.');
  const { chave, valor } = req.body || {};
  if (!txt(chave, 80)) falha(400, 'Informe a chave da configuração.');
  setConfig(txt(chave, 80), valor === null || valor === undefined ? null : String(valor));
  audit(req.usuario.id, 'config_gravada', chave);
  res.json({ ok: true });
});

// ---- banco: esquema e consulta de leitura ----
r.get('/ia/esquema', (req, res) => {
  const t = txt(req.query.tabela, 60);
  if (PG) {
    return res.json(all(`SELECT table_name AS tabela, column_name AS coluna, data_type AS tipo
                         FROM information_schema.columns WHERE table_schema = current_schema()
                         ${t ? 'AND table_name = ?' : ''} ORDER BY table_name, ordinal_position`, ...(t ? [t] : [])));
  }
  const tabelas = all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'" + (t ? ' AND name=?' : '') + ' ORDER BY name', ...(t ? [t] : []));
  res.json(tabelas.map((x) => ({ tabela: x.name, colunas: all(`PRAGMA table_info(${x.name})`).map((c) => `${c.name} ${c.type}`) })));
});
r.post('/ia/consulta', (req, res) => {
  if (!A.veTudo(req.usuario)) falha(403, 'Só adm e gestor consultam o banco por SQL.');
  let preparado;
  try { preparado = C.prepararConsulta(String((req.body || {}).sql || ''), { limite: (req.body || {}).limite }); }
  catch (e) { falha(400, e.message); }
  try {
    res.json({ linhas: leitura(preparado.sql, { timeoutMs: preparado.timeoutMs }), limite: preparado.limite });
  } catch (e) { falha(400, 'Consulta recusada: ' + e.message); }
});

// ---- uma ferramenta só: executa qualquer ação pelo nome ----
r.post('/ia/executar', async (req, res) => {
  const { acao, dados, query } = req.body || {};
  const a = R.PORNOME.get(String(acao || ''));
  if (!a) falha(404, `Ação desconhecida. Veja o catálogo em /api/ia/acoes.`);
  if (a.auth !== 'chave') falha(400, `A ação "${a.nome}" tem entrada própria (${a.auth}) e não passa por aqui.`);
  if (a.nome === 'ia.executar') falha(400, 'Essa ação não chama a si mesma.');
  const d = { ...(dados || {}) };
  let caminho = a.caminho;
  for (const p of a.parametros) {
    if (d[p] === undefined) falha(400, `Falta "${p}" em dados.`);
    caminho = caminho.replace(`:${p}`, encodeURIComponent(d[p])); delete d[p];
  }
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...(query || {}), ...(a.metodo === 'GET' ? d : {}) })) if (v !== undefined && v !== null) qs.append(k, String(v));
  const destino = (process.env.VERCEL ? `https://${req.get('host')}` : `http://127.0.0.1:${cfg.PORT}`) + caminho + (qs.toString() ? `?${qs}` : '');
  req.acaoIA = a.nome;
  try {
    const resp = await fetch(destino, {
      method: a.metodo,
      headers: { 'content-type': 'application/json', authorization: req.headers.authorization || '', 'x-api-key': req.headers['x-api-key'] || '', cookie: req.headers.cookie || '' },
      body: a.metodo === 'GET' ? undefined : JSON.stringify(d),
    });
    const texto = await resp.text();
    let corpo; try { corpo = JSON.parse(texto); } catch { corpo = texto.slice(0, 4000); }
    res.status(resp.ok ? 200 : resp.status).json({ acao: a.nome, metodo: a.metodo, caminho, status: resp.status, resultado: corpo });
  } catch (e) { falha(502, `Não consegui falar com o próprio sistema (${destino}): ${e.message}`); }
});

module.exports = { porChave, rotas: r, ESCOPOS: K.ESCOPOS, ehGestorPlataforma };
