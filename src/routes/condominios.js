// Condomínios: a base de prédios e condomínios de Campinas, a ficha com os números cruzados e a cena 3D.
const express = require('express');
const A = require('../auth');
const { one, all, run, audit } = require('../db');
const cfg = require('../config');
const { falha, num, int, txt } = require('../util');
const B = require('../condominios/base');
const G = require('../condominios/geo');
const { perto } = require('../condominios/perto');
const { cena3d } = require('../condominios/cena3d');
const { apagaCache } = require('../condominios/overpass');
const { apresentar } = require('../condominios/fonte');

const r = express.Router();

const condominio = (id) => { const c = one('SELECT * FROM condominios WHERE id=?', int(id)); if (!c) falha(404, 'Condomínio não encontrado.'); return apresentar(c); };

r.get('/condominios', (req, res) => {
  const q = req.query;
  const l = B.listar({ q: txt(q.q, 80), bairro: txt(q.bairro, 60), tipo: ['vertical', 'horizontal', 'indefinido'].includes(q.tipo) ? q.tipo : null, alvo: q.alvo === '1', comVenda: q.venda === '1', ordem: q.ordem, dir: q.dir, pagina: int(q.pagina) || 1 });
  // foto de cada condomínio da página: do imóvel da carteira; senão, do anúncio mais recente do Fisguei no prédio
  const ids = (l.itens || []).map((c) => c.id);
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const capa = new Map(all(`SELECT i.condominio_id cid, min(f.id) capa FROM imoveis i JOIN arquivos f ON f.imovel_id=i.id AND f.categoria='Fotos' AND f.mime LIKE 'image/%' WHERE i.condominio_id IN (${ph}) GROUP BY i.condominio_id`, ...ids).map((x) => [x.cid, x.capa]));
    // um anúncio por prédio (o mais recente com foto): prédios com centenas de anúncios não trazem as fotos de todos
    const fg = new Map();
    const ult = all(`SELECT max(id) id FROM fisguei_anuncios WHERE condominio_id IN (${ph}) AND fotos LIKE '[%' GROUP BY condominio_id`, ...ids).map((x) => x.id).filter(Boolean);
    if (ult.length) for (const x of all(`SELECT condominio_id cid, fotos FROM fisguei_anuncios WHERE id IN (${ult.map(() => '?').join(',')})`, ...ult)) {
      try { const f = (JSON.parse(x.fotos || '[]') || [])[0]; if (f) fg.set(x.cid, f); } catch {}
    }
    for (const c of l.itens) { c.foto = capa.has(c.id) ? `/api/arquivos/${capa.get(c.id)}` : fg.get(c.id) || null; }
  }
  res.json(l);
});
r.get('/condominios/mapa', (req, res) => { res.setHeader('Cache-Control', 'private, max-age=120'); res.json(B.pontosMapa()); });
r.get('/condominios/reconhecer', (req, res) => res.json(B.reconhecer(req.query)));
r.get('/condominios/alertas', (req, res) => res.json(B.alertas({ todos: req.query.todos === '1' })));
r.post('/condominios/alertas/visto', (req, res) => { run('UPDATE condominio_alertas SET visto=1 WHERE visto=0'); res.json({ ok: true }); });
r.get('/condominios/bairros', (req, res) => res.json(all("SELECT bairro, count(*) n FROM condominios WHERE bairro IS NOT NULL AND coalesce(tipo,'') <> 'comercial' GROUP BY bairro HAVING count(*) >= 3 ORDER BY bairro").map((x) => x.bairro)));

r.get('/condominios/:id', (req, res) => {
  const c = condominio(req.params.id);
  const { contorno, ...resto } = c;
  res.json({ ...resto, tem_contorno: !!contorno, ...B.numeros(c.id) });
});
r.get('/condominios/:id/perto', async (req, res) => res.json(await perto(condominio(req.params.id)) || { categorias: [] }));
r.get('/condominios/:id/3d', async (req, res) => {
  const c = condominio(req.params.id);
  const cena = await cena3d(c, { renovar: req.query.renovar === '1' && A.veTudo(req.usuario) });
  let imovel = null;
  if (req.query.imovel) {
    const im = one('SELECT id, codigo, unidade, tipo, quartos, area_util, valor, status FROM imoveis WHERE id=? AND condominio_id=?', int(req.query.imovel), c.id);
    if (im) imovel = { ...im, ...G.andarDaUnidade(im.unidade, c.numeracao) };
  }
  const unidades = all("SELECT id, codigo, unidade, status FROM imoveis WHERE condominio_id=? AND unidade IS NOT NULL AND status <> 'suspenso'", c.id).map((i) => ({ ...i, ...G.andarDaUnidade(i.unidade, c.numeracao) })).filter((i) => i.andar !== null);
  res.json({ condominio: { id: c.id, nome: c.nome, tipo: c.tipo, andares: c.andares, torres: c.torres, unidades: c.unidades, logradouro: c.logradouro, numero: c.numero, bairro: c.bairro, geo_fonte: c.geo_fonte }, cena, imovel, unidades });
});

// Edição pela ficha: dados do prédio, posição no mapa e prédio-alvo.
const EDITAVEIS = { nome: 120, tipo: 20, andares: 'int', torres: 'int', unidades: 'int', unidades_fonte: 120, construtora: 120, ano_construcao: 10, lazer: 300, administradora: 120, bairro: 80, logradouro: 150, numero: 20, cep: 9 };
r.put('/condominios/:id', (req, res) => {
  const c = condominio(req.params.id);
  const b = req.body || {};
  const set = [], vals = [];
  for (const [k, t] of Object.entries(EDITAVEIS)) {
    if (!(k in b)) continue;
    let v = t === 'int' ? int(b[k]) : txt(b[k], t);
    if (k === 'tipo' && v && !['vertical', 'horizontal', 'comercial', 'indefinido'].includes(v)) falha(400, 'Tipo inválido.');
    if (k === 'cep') v = G.soDigitos(v) || null;
    if (t === 'int' && v !== null && (v < 0 || v > 5000)) falha(400, `Valor inválido em ${k}.`);
    set.push(`${k}=?`); vals.push(v);
    if (k === 'nome') { set.push('nome_busca=?'); vals.push(G.chave(v)); }
    if (k === 'unidades' && !('unidades_fonte' in b)) { set.push('unidades_fonte=?'); vals.push(`Informado pela ${cfg.CLIENTE_NOME}`); }
  }
  if ('alvo' in b) { set.push('alvo=?'); vals.push(b.alvo ? 1 : 0); }
  let mexeuPosicao = false;
  if ('lat' in b && 'lon' in b) {
    const la = num(b.lat), lo = num(b.lon);
    if (!(la > -23.2 && la < -22.6 && lo > -47.4 && lo < -46.8)) falha(400, 'A posição precisa estar em Campinas.');
    set.push('lat=?', 'lon=?', "geo_fonte='ajustado'"); vals.push(la, lo); mexeuPosicao = true;
  }
  if ('osm_ref' in b) { set.push('osm_ref=?'); vals.push(txt(b.osm_ref, 40)); }
  if (!set.length) falha(400, 'Nada para salvar.');
  run(`UPDATE condominios SET ${set.join(',')}, atualizado_em=datetime('now','localtime') WHERE id=?`, ...vals, c.id);
  if (mexeuPosicao) { apagaCache(c.id); B.limpaCache(); }
  audit(req.usuario.id, 'condominio_alterado', `${c.id} ${c.nome}`);
  res.json({ ok: true });
});

r.post('/condominios/vincular', A.exigePerfil('adm', 'gestor'), (req, res) => res.json(B.vincular({ tudo: !!(req.body && req.body.tudo) })));

module.exports = r;
