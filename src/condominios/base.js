// Condomínios · reconhecer pelo endereço/mapa, ligar imóveis/Radar/Fisguei e calcular os números de cada prédio.
const { one, all, run } = require('../db');
const cfg = require('../config');
const G = require('./geo');
const { apresentar, fontesVisiveis } = require('./fonte');

const ATIVAS_RADAR = "('nova','em_contato','carta_enviada','aguardando_aprovacao')";
const FORA_FISGUEI = "('descartado','captado')";
// anúncio que é só de aluguel não conta como "à venda" (28/10/2026: a base passou a ter locação)
const SO_VENDA = "coalesce(negocio,'Venda') <> 'Locação'";

// ------------------------------------------------------------------ contornos (horizontais) em memória
let contornos = null, contornosEm = 0;
function listaContornos() {
  if (contornos && Date.now() - contornosEm < 10 * 60e3) return contornos;
  contornos = all('SELECT id, contorno FROM condominios WHERE contorno IS NOT NULL').map((c) => {
    try { const p = JSON.parse(c.contorno); return p.length > 2 ? { id: c.id, p } : null; } catch { return null; }
  }).filter(Boolean);
  contornosEm = Date.now();
  return contornos;
}
const limpaCache = () => { contornos = null; };

// ------------------------------------------------------------------ reconhecer
/** Acha o condomínio de um endereço. Devolve { condominio, como, confianca, alternativas }. */
function reconhecer({ cep, numero, logradouro, lat, lon, condominio_nome, bairro } = {}) {
  const c = G.soDigitos(cep), n = G.numero(numero);
  const pega = (id, como, confianca) => ({ condominio: apresentar(one('SELECT * FROM condominios WHERE id=?', id)), como, confianca });
  if (c && n) {
    const l = all('SELECT id FROM condominios WHERE cep=? AND numero=? ORDER BY (situacao=\'ativa\') DESC, id', c, n);
    if (l.length) return { ...pega(l[0].id, 'CEP e número', 'alta'), alternativas: l.slice(1).map((x) => one('SELECT id,nome FROM condominios WHERE id=?', x.id)) };
  }
  if (logradouro && n) {
    const k = G.chave(logradouro).replace(/^(RUA|R|AVENIDA|AV|ALAMEDA|AL|TRAVESSA|TV|PRACA|ESTRADA|ROD|RODOVIA) /, '');
    if (k.length >= 3) {
      const l = all('SELECT id, logradouro FROM condominios WHERE numero=? AND logradouro LIKE ?', n, `%${k.split(' ').slice(-1)[0]}%`)
        .filter((x) => G.chave(x.logradouro).endsWith(k));
      if (l.length) return { ...pega(l[0].id, 'rua e número', 'alta'), alternativas: [] };
    }
  }
  const la = Number(lat), lo = Number(lon);
  if (la && lo) {
    const h = listaContornos().find((x) => G.dentro(la, lo, x.p));
    if (h) return { ...pega(h.id, 'ponto dentro do condomínio no mapa', 'alta'), alternativas: [] };
    const d = 0.0006; // ~65 m
    const perto = all('SELECT id, nome, lat, lon, tipo FROM condominios WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?', la - d, la + d, lo - d, lo + d)
      .map((x) => ({ ...x, m: G.distancia(la, lo, x.lat, x.lon) })).filter((x) => x.m <= 40).sort((a, b) => a.m - b.m);
    if (perto.length) {
      const porNome = condominio_nome ? perto.find((x) => G.semelhanca(x.nome, condominio_nome) >= 0.6) : null;
      const esc = porNome || perto[0];
      return { ...pega(esc.id, `a ${Math.round(esc.m)} m no mapa`, porNome || perto.length === 1 ? 'media' : 'baixa'), alternativas: perto.filter((x) => x.id !== esc.id).slice(0, 3).map((x) => ({ id: x.id, nome: x.nome })) };
    }
  }
  if (condominio_nome && G.nucleo(condominio_nome).length >= 4) {
    const palavra = G.nucleo(condominio_nome).split(' ').sort((a, b) => b.length - a.length)[0];
    const l = all('SELECT id, nome, bairro FROM condominios WHERE nome_busca LIKE ? LIMIT 200', `%${palavra}%`)
      .map((x) => ({ ...x, s: G.semelhanca(x.nome, condominio_nome) + (bairro && G.chave(x.bairro) === G.chave(bairro) ? 0.15 : 0) }))
      .filter((x) => x.s >= 0.75).sort((a, b) => b.s - a.s);
    if (l.length && (l.length === 1 || l[0].s - l[1].s > 0.1)) return { ...pega(l[0].id, 'nome do condomínio', 'media'), alternativas: l.slice(1, 4).map((x) => ({ id: x.id, nome: x.nome })) };
    if (l.length) return { condominio: null, como: null, confianca: null, alternativas: l.slice(0, 4).map((x) => ({ id: x.id, nome: x.nome })) };
  }
  return { condominio: null, como: null, confianca: null, alternativas: [] };
}

// ------------------------------------------------------------------ ligar a carteira, o Radar e o Fisguei aos condomínios
// Cada anúncio é conferido uma vez (cond_checado); "tudo" refaz a conferência de todos.
// Anúncio novo em prédio-alvo vira alerta (condominio_alertas) para o Painel e a tela de Condomínios.
function alertar(condId, origem, refId, texto) {
  const c = one('SELECT alvo, nome FROM condominios WHERE id=?', condId);
  if (!c || !c.alvo) return;
  run('INSERT INTO condominio_alertas(condominio_id,origem,ref_id,texto) VALUES(?,?,?,?) ON CONFLICT(origem,ref_id) DO NOTHING', condId, origem, refId, `${texto} em ${c.nome}`);
}
const brl = (v) => (v ? 'R$ ' + Math.round(v).toLocaleString('pt-BR') : 'valor não informado');
// Comparação em memória: os condomínios são lidos uma vez e cada anúncio é comparado aqui, sem ir ao banco
// (antes eram várias consultas por anúncio e, com milhares de anúncios novos, o servidor ficava parado por muito tempo).
// Mesma ordem do reconhecer(): CEP e número, rua e número, ponto dentro do contorno, até 40 m, nome do condomínio.
function reconhecedor() {
  const conds = all("SELECT id, nome, cep, numero, logradouro, lat, lon, situacao, alvo FROM condominios WHERE coalesce(tipo,'') <> 'comercial' OR tipo IS NULL");
  const porCep = new Map(), porNum = new Map(), grade = new Map(), porId = new Map();
  const cel = (la, lo) => `${Math.round(la * 1000)}|${Math.round(lo * 1000)}`;
  const tira = (k) => k.replace(/^(RUA|R|AVENIDA|AV|ALAMEDA|AL|TRAVESSA|TV|PRACA|ESTRADA|ROD|RODOVIA) /, '');
  for (const c of conds) {
    porId.set(c.id, c);
    const cep = G.soDigitos(c.cep), n = G.numero(c.numero);
    c._rua = tira(G.chave(c.logradouro)); c._nucleo = G.nucleo(c.nome);
    if (cep && n) { const k = `${cep}|${n}`; if (!porCep.has(k)) porCep.set(k, []); porCep.get(k).push(c); }
    if (n) { if (!porNum.has(n)) porNum.set(n, []); porNum.get(n).push(c); }
    if (c.lat && c.lon) { const k = cel(c.lat, c.lon); if (!grade.has(k)) grade.set(k, []); grade.get(k).push(c); }
  }
  for (const l of porCep.values()) l.sort((x, y) => (y.situacao === 'ativa') - (x.situacao === 'ativa') || x.id - y.id);
  const cont = listaContornos();
  return (x) => {
    const cep = G.soDigitos(x.cep), n = G.numero(x.numero);
    if (cep && n && porCep.has(`${cep}|${n}`)) return { c: porCep.get(`${cep}|${n}`)[0], confianca: 'alta' };
    if (x.logradouro && n) {
      const k = tira(G.chave(x.logradouro));
      if (k.length >= 3) { const c = (porNum.get(n) || []).find((y) => y._rua && y._rua.endsWith(k)); if (c) return { c, confianca: 'alta' }; }
    }
    const la = Number(x.lat), lo = Number(x.lon);
    if (la && lo) {
      const h = cont.find((y) => G.dentro(la, lo, y.p));
      if (h && porId.has(h.id)) return { c: porId.get(h.id), confianca: 'alta' };
      const perto = [];
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const c of grade.get(`${Math.round(la * 1000) + i}|${Math.round(lo * 1000) + j}`) || []) {
        const m = G.distancia(la, lo, c.lat, c.lon); if (m <= 40) perto.push({ c, m });
      }
      perto.sort((p1, p2) => p1.m - p2.m);
      if (perto.length) {
        const porNome = x.condominio_nome ? perto.find((p) => G.semelhanca(p.c.nome, x.condominio_nome) >= 0.6) : null;
        return { c: (porNome || perto[0]).c, confianca: porNome || perto.length === 1 ? 'media' : 'baixa' };
      }
    }
    if (x.condominio_nome && G.nucleo(x.condominio_nome).length >= 4) {
      const palavra = G.nucleo(x.condominio_nome).split(' ').sort((p1, p2) => p2.length - p1.length)[0];
      const l = conds.filter((c) => c._nucleo.includes(palavra)).map((c) => ({ c, s: G.semelhanca(c.nome, x.condominio_nome) })).filter((y) => y.s >= 0.75).sort((p1, p2) => p2.s - p1.s);
      if (l.length && (l.length === 1 || l[0].s - l[1].s > 0.1)) return { c: l[0].c, confianca: 'media' };
    }
    return null;
  };
}
// grava em lote: blocos de 400 anúncios por UPDATE (CASE id WHEN … THEN condomínio), poucas idas ao banco no total
function gravaLote(tabela, achados, semPredio) {
  for (let i = 0; i < achados.length; i += 400) {
    const p = achados.slice(i, i + 400);
    run(`UPDATE ${tabela} SET condominio_id = CASE id ${p.map(() => 'WHEN ? THEN CAST(? AS INTEGER)').join(' ')} END, cond_checado=1 WHERE id IN (${p.map(() => '?').join(',')})`,
      ...p.flat(), ...p.map((x) => x[0]));
  }
  for (let i = 0; i < semPredio.length; i += 1000) { const p = semPredio.slice(i, i + 1000); run(`UPDATE ${tabela} SET cond_checado=1 WHERE id IN (${p.map(() => '?').join(',')})`, ...p); }
}
function vincular({ tudo = false, limite = 20000 } = {}) {
  const r = { imoveis: 0, radar: 0, fisguei: 0, conferidos: 0 };
  const acha = reconhecedor();
  for (const im of all(`SELECT i.id, i.cep, i.numero, i.logradouro, i.lat, i.lon, i.bairro FROM imoveis i WHERE ${tudo ? '1=1' : 'i.condominio_id IS NULL'}`)) {
    const x = acha(im);
    if (x && x.confianca !== 'baixa') { run('UPDATE imoveis SET condominio_id=? WHERE id=?', x.c.id, im.id); r.imoveis++; }
  }
  for (const [tabela, sql, origem, ativo] of [
    ['oportunidades', `SELECT id, logradouro, numero, bairro, condominio_nome, valor, tipo, status FROM oportunidades WHERE ${tudo ? '1=1' : 'cond_checado=0'} ORDER BY id DESC LIMIT ?`, 'radar', (x) => ['nova', 'em_contato'].includes(x.status)],
    ['fisguei_anuncios', `SELECT id, cep, logradouro, numero, bairro, lat, lon, titulo, valor, tipo, status FROM fisguei_anuncios WHERE ${tudo ? '1=1' : 'cond_checado=0'} ORDER BY id DESC LIMIT ?`, 'fisguei', (x) => !['descartado', 'captado'].includes(x.status)],
  ]) {
    const achados = [], sem = [];
    for (const a of all(sql, limite)) {
      r.conferidos++;
      const x = tabela === 'oportunidades' && !((a.logradouro && a.numero) || a.condominio_nome) ? null : acha(a);
      if (x && x.confianca !== 'baixa') {
        achados.push([a.id, x.c.id]); r[origem]++;
        if (x.c.alvo && ativo(a)) alertar(x.c.id, origem, a.id, `${a.tipo || 'Imóvel'} anunciado por ${brl(a.valor)}`);
      } else sem.push(a.id);
    }
    gravaLote(tabela, achados, sem);
  }
  return r;
}

function alertas({ todos = false } = {}) {
  return all(`SELECT a.*, c.nome condominio FROM condominio_alertas a JOIN condominios c ON c.id=a.condominio_id ${todos ? '' : 'WHERE a.visto=0'} ORDER BY a.id DESC LIMIT 50`)
    .map((a) => ({ ...a, href: a.origem === 'radar' ? `#/radar/${a.ref_id}` : `#/fisguei/${a.ref_id}` }));
}

// ------------------------------------------------------------------ lista
// ordem → [expressão, sentido padrão]. dir 'asc' = menor → maior; 'desc' = maior → menor. Sem o dado vai para o fim.
const ORDENS = {
  venda: ['(coalesce(op.n,0)+coalesce(fg.n,0)+coalesce(im.n,0))', 'desc'],
  preco: ['coalesce(fg.v, op.v, im.v)', 'asc'],
  unidades: ['c.unidades', 'desc'],
  andares: ['c.andares', 'desc'],
  giro: ['coalesce(g.n,0)', 'desc'],
  nome: ['c.nome', 'asc'],
  recentes: ['c.id', 'desc'],
};
function ordemSQL(ordem, dir) {
  const [ex, pad] = ORDENS[ordem] || ORDENS.venda;
  const d = (dir === 'asc' || dir === 'desc' ? dir : pad).toUpperCase();
  return `CASE WHEN ${ex} IS NULL THEN 1 ELSE 0 END, ${ex} ${d}, c.nome`;
}
function listar({ q, bairro, tipo, alvo, comVenda, ordem = 'venda', dir, pagina = 1, porPagina = 60 } = {}) {
  const w = ["coalesce(c.tipo,'') <> 'comercial'"], p = [];
  if (q) { w.push('(c.nome_busca LIKE ? OR c.logradouro LIKE ? OR c.cnpj LIKE ?)'); const k = `%${G.chave(q)}%`; p.push(k, `%${q}%`, `%${G.soDigitos(q) || '#'}%`); }
  if (bairro) { w.push('c.bairro LIKE ?'); p.push(`%${bairro}%`); }
  if (tipo) { w.push('c.tipo=?'); p.push(tipo); }
  if (alvo) w.push('c.alvo=1');
  if (comVenda) w.push('(coalesce(op.n,0)+coalesce(fg.n,0)+coalesce(im.n,0)) > 0');
  const de = `FROM condominios c
    LEFT JOIN (SELECT condominio_id, count(*) n, avg(valor) v FROM oportunidades WHERE status IN ${ATIVAS_RADAR} GROUP BY condominio_id) op ON op.condominio_id=c.id
    LEFT JOIN (SELECT condominio_id, count(*) n, avg(valor) v FROM fisguei_anuncios WHERE status NOT IN ${FORA_FISGUEI} AND ${SO_VENDA} GROUP BY condominio_id) fg ON fg.condominio_id=c.id
    LEFT JOIN (SELECT condominio_id, count(*) n, avg(valor) v FROM imoveis WHERE status IN ('publicado','off_market','captacao','aguardando_autorizacao') GROUP BY condominio_id) im ON im.condominio_id=c.id
    ${ordem === 'giro' ? `LEFT JOIN (SELECT condominio_id, count(*) n FROM (SELECT condominio_id FROM oportunidades WHERE criado_em >= datetime('now','localtime','-90 day') UNION ALL SELECT condominio_id FROM fisguei_anuncios WHERE criado_em >= datetime('now','localtime','-90 day')) t GROUP BY condominio_id) g ON g.condominio_id=c.id` : ''}
    WHERE ${w.join(' AND ')}`;
  const total = one(`SELECT count(*) n ${de}`, ...p).n;
  const itens = all(`SELECT c.id, c.nome, c.tipo, c.bairro, c.logradouro, c.numero, c.cep, c.lat, c.lon, c.andares, c.torres, c.unidades, c.fontes, c.alvo, c.situacao, c.slug,
      coalesce(op.n,0) radar, coalesce(fg.n,0) fisguei, coalesce(im.n,0) carteira, coalesce(fg.v, op.v, im.v) preco_medio${ordem === 'giro' ? ', coalesce(g.n,0) giro' : ''} ${de} ORDER BY ${ordemSQL(ordem, dir)} LIMIT ? OFFSET ?`,
  ...p, porPagina, (Math.max(1, pagina) - 1) * porPagina);
  for (const c of itens) c.fontes = fontesVisiveis(c.fontes);
  const resumo = one(`SELECT count(*) total, sum(CASE WHEN tipo='vertical' THEN 1 ELSE 0 END) verticais, sum(CASE WHEN tipo='horizontal' THEN 1 ELSE 0 END) horizontais,
    sum(CASE WHEN lat IS NOT NULL THEN 1 ELSE 0 END) no_mapa, sum(alvo) alvos FROM condominios WHERE coalesce(tipo,'') <> 'comercial'`);
  return { total, pagina: +pagina, porPagina, itens, resumo };
}

function pontosMapa() {
  return all(`SELECT c.id, c.nome, c.tipo, c.lat, c.lon, c.alvo,
      (SELECT count(*) FROM oportunidades o WHERE o.condominio_id=c.id AND o.status IN ${ATIVAS_RADAR}) +
      (SELECT count(*) FROM fisguei_anuncios f WHERE f.condominio_id=c.id AND f.status NOT IN ${FORA_FISGUEI} AND ${SO_VENDA}) +
      (SELECT count(*) FROM imoveis i WHERE i.condominio_id=c.id AND i.status IN ('publicado','off_market')) venda
    FROM condominios c WHERE c.lat IS NOT NULL AND coalesce(c.tipo,'') <> 'comercial'`)
    .map((c) => [c.id, Math.round(c.lat * 1e5) / 1e5, Math.round(c.lon * 1e5) / 1e5, c.tipo === 'horizontal' ? 'h' : c.tipo === 'vertical' ? 'v' : 'i', +c.venda || 0, c.alvo ? 1 : 0, c.nome]);
}

// ------------------------------------------------------------------ números do prédio
const LAZER = [
  ['Piscina', /piscina/i], ['Piscina aquecida', /piscina aquecida|piscina coberta/i], ['Academia', /academia|fitness|gin[áa]stica/i],
  ['Salão de festas', /sal[ãa]o de festas?/i], ['Espaço gourmet', /gourmet|churrasqueira/i], ['Playground', /playground|brinquedoteca/i],
  ['Quadra', /quadra|poliesportiva/i], ['Quadra de tênis', /t[êe]nis/i], ['Portaria 24 h', /portaria 24|vigil[âa]ncia 24|seguran[çc]a 24/i],
  ['Sauna', /sauna/i], ['Espaço pet', /pet place|espa[çc]o pet|pet care/i], ['Coworking', /coworking/i], ['Elevador', /elevador/i],
  ['Gerador', /gerador/i], ['Bicicletário', /biciclet[áa]rio/i], ['Sala de jogos', /sala de jogos|sal[ãa]o de jogos/i],
  ['Lago', /\blago\b/i], ['Trilha / bosque', /trilha|bosque|[áa]rea verde/i], ['Campo de futebol', /campo de futebol|society/i], ['Spa', /\bspa\b/i],
];
const med = (l) => { const s = l.filter((x) => x > 0).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const dias = (d) => (d ? Math.max(0, Math.round((Date.now() - new Date(String(d).slice(0, 10) + 'T12:00').getTime()) / 864e5)) : null);

function numeros(id) {
  const c = one('SELECT * FROM condominios WHERE id=?', id);
  const carteira = all(`SELECT i.id, i.codigo, i.tipo, i.status, i.unidade, i.quartos, i.suites, i.vagas, i.area_util, i.valor, i.valor_condominio, i.iptu, i.descricao, i.criado_em, i.atualizado_em, i.finalidade, i.valor_locacao,
      (SELECT a.id FROM arquivos a WHERE a.imovel_id=i.id AND a.categoria IN ('Fotos','Fotos internas') ORDER BY CASE WHEN a.categoria='Fotos' THEN 0 ELSE 1 END, a.id LIMIT 1) foto
    FROM imoveis i WHERE i.condominio_id=? ORDER BY i.status, i.valor DESC`, id);
  const radar = all(`SELECT id, portal, link, titulo, tipo, unidade, quartos, vagas, area, valor, valor_anterior, anunciante_tipo, anunciante_nome, publicado_em, criado_em, status, foto
    FROM oportunidades WHERE condominio_id=? ORDER BY criado_em DESC`, id);
  const fisguei = all(`SELECT f.id, f.portal, f.link, f.titulo, f.tipo, f.complemento, f.quartos, f.vagas, f.area_util, f.valor, f.valor_condominio, f.iptu, f.anunciante_nome, f.anunciante_tipo, f.publicado_em, f.criado_em, f.status, f.fotos, f.negocio, f.aluguel,
      (SELECT count(*) FROM fisguei_pessoas p WHERE p.anuncio_id=f.id) pessoas
    FROM fisguei_anuncios f WHERE f.condominio_id=? ORDER BY f.criado_em DESC`, id);
  const fisgueiLoc = fisguei.filter((f) => f.aluguel > 0);
  const fisgueiVenda = fisguei.filter((f) => f.valor > 0 || f.negocio !== 'Locação');

  const aVenda = [
    ...carteira.filter((i) => ['publicado', 'off_market'].includes(i.status) && i.finalidade !== 'locacao').map((i) => ({ origem: cfg.CLIENTE_NOME, ref: i.codigo, href: `#/imoveis/${i.id}`, valor: i.valor, area: i.area_util, quartos: i.quartos, unidade: i.unidade, desde: i.criado_em, anunciante: cfg.CLIENTE_NOME, foto: i.foto ? `/api/arquivos/${i.foto}` : null })),
    ...radar.filter((o) => ['nova', 'em_contato', 'carta_enviada', 'aguardando_aprovacao'].includes(o.status)).map((o) => ({ origem: 'Radar', ref: 'OP-' + String(o.id).padStart(4, '0'), href: `#/radar/${o.id}`, valor: o.valor, area: o.area, quartos: o.quartos, unidade: o.unidade, desde: o.publicado_em || o.criado_em, anunciante: o.anunciante_nome || (o.anunciante_tipo === 'particular' ? 'Particular' : null), portal: o.portal, foto: o.foto || null })),
    ...fisgueiVenda.filter((f) => !['descartado', 'captado'].includes(f.status)).map((f) => ({ origem: 'Fisguei', ref: 'FG-' + String(f.id).padStart(5, '0'), href: `#/fisguei/${f.id}`, valor: f.valor, area: f.area_util, quartos: f.quartos, unidade: f.complemento, desde: f.publicado_em || f.criado_em, anunciante: f.anunciante_nome || (f.anunciante_tipo === 'particular' ? 'Particular' : null), portal: f.portal, foto: (() => { try { return (JSON.parse(f.fotos || '[]') || [])[0] || null; } catch { return null; } })() })),
  ];
  // o mesmo apartamento costuma aparecer no Radar e no Fisguei: junta por valor e área parecidos
  const unicos = [];
  for (const a of aVenda) {
    const igual = unicos.find((u) => u.valor && a.valor && Math.abs(u.valor - a.valor) / a.valor < 0.01 && (!u.area || !a.area || Math.abs(u.area - a.area) <= 2));
    if (igual) { igual.tambem = [...(igual.tambem || []), a.origem]; continue; }
    unicos.push({ ...a, dias: dias(a.desde) });
  }
  // para alugar: carteira em locação + anúncios de aluguel do Fisguei (o valor é o aluguel mensal)
  const fotoDe = (f) => { try { return (JSON.parse(f.fotos || '[]') || [])[0] || null; } catch { return null; } };
  const aLocarTodos = [
    ...carteira.filter((i) => ['publicado', 'off_market'].includes(i.status) && i.finalidade !== 'venda' && i.valor_locacao).map((i) => ({ origem: cfg.CLIENTE_NOME, ref: i.codigo, href: `#/imoveis/${i.id}`, valor: i.valor_locacao, area: i.area_util, quartos: i.quartos, unidade: i.unidade, desde: i.criado_em, anunciante: cfg.CLIENTE_NOME, foto: i.foto ? `/api/arquivos/${i.foto}` : null })),
    ...fisgueiLoc.filter((f) => !['descartado', 'captado'].includes(f.status)).map((f) => ({ origem: 'Fisguei', ref: 'FG-' + String(f.id).padStart(5, '0'), href: `#/fisguei/${f.id}`, valor: f.aluguel, area: f.area_util, quartos: f.quartos, unidade: f.complemento, desde: f.publicado_em || f.criado_em, anunciante: f.anunciante_nome || (f.anunciante_tipo === 'particular' ? 'Particular' : null), portal: f.portal, foto: fotoDe(f) })),
  ];
  const aLocar = [];
  for (const a of aLocarTodos) {
    const igual = aLocar.find((u) => u.valor && a.valor && Math.abs(u.valor - a.valor) / a.valor < 0.01 && (!u.area || !a.area || Math.abs(u.area - a.area) <= 2));
    if (igual) { igual.tambem = [...(igual.tambem || []), a.origem]; continue; }
    aLocar.push({ ...a, dias: dias(a.desde) });
  }
  const precos = unicos.map((a) => a.valor).filter(Boolean);
  const m2 = unicos.filter((a) => a.valor && a.area > 20).map((a) => a.valor / a.area);
  // histórico (inclui vendidos/retirados) dá o m² de referência quando não há nada à venda
  const hist = [...carteira.map((i) => [i.valor, i.area_util]), ...radar.map((o) => [o.valor, o.area]), ...fisgueiVenda.map((f) => [f.valor, f.area_util])].filter(([v, a]) => v && a > 20);
  const taxas = [...carteira.map((i) => i.valor_condominio), ...fisguei.map((f) => f.valor_condominio)].filter((v) => v > 50 && v < 30000);
  const iptus = [...carteira.map((i) => i.iptu), ...fisguei.map((f) => f.iptu)].filter((v) => v > 50);
  const areas = hist.map(([, a]) => a);

  const imob = {};
  for (const x of [...radar.filter((o) => o.anunciante_tipo === 'imobiliaria'), ...fisguei.filter((f) => f.anunciante_tipo === 'imobiliaria')]) {
    const n = (x.anunciante_nome || 'Imobiliária sem nome').trim(); imob[n] = (imob[n] || 0) + 1;
  }
  const textos = [c.lazer, ...carteira.map((i) => i.descricao), ...radar.map((o) => o.titulo), ...fisguei.map((f) => f.titulo)].filter(Boolean).join(' \n ');
  const lazer = LAZER.filter(([, re]) => re.test(textos)).map(([n]) => n);
  const quartos = {}; for (const x of [...carteira, ...radar, ...fisguei]) if (x.quartos) quartos[x.quartos] = (quartos[x.quartos] || 0) + 1;

  return {
    aVenda: unicos.sort((a, b) => (a.valor || 9e12) - (b.valor || 9e12)),
    aLocar: aLocar.sort((a, b) => (a.valor || 9e12) - (b.valor || 9e12)),
    resumo: {
      a_venda: unicos.length, a_locar: aLocar.length, aluguel_mediano: med(aLocar.map((a) => a.valor)),
      preco_mediano: med(precos), preco_min: precos.length ? Math.min(...precos) : null, preco_max: precos.length ? Math.max(...precos) : null,
      m2_mediano: med(m2) || null,
      m2_historico: med(hist.map(([v, a]) => v / a)),
      area_tipica: med(areas),
      taxa_condominio: med(taxas), iptu: med(iptus),
      dias_anunciado: med(unicos.map((a) => a.dias)),
      imobiliarias: Object.entries(imob).sort((a, b) => b[1] - a[1]).map(([nome, n]) => ({ nome, n })),
      particulares: unicos.filter((a) => a.anunciante === 'Particular').length,
      quartos: Object.entries(quartos).sort((a, b) => a[0] - b[0]).map(([q, n]) => ({ q: +q, n })),
      lazer,
      proprietarios_conhecidos: fisguei.reduce((s, f) => s + (f.pessoas || 0), 0),
      donos_confirmados: fisguei.filter((f) => f.status === 'confirmado').length,
      vendidos: carteira.filter((i) => i.status === 'vendido').length,
    },
    carteira: carteira.map(({ descricao, ...i }) => i),
    radar, fisguei,
  };
}

module.exports = { LAZER, reconhecer, vincular, alertas, listar, pontosMapa, numeros, limpaCache, ATIVAS_RADAR, FORA_FISGUEI };
