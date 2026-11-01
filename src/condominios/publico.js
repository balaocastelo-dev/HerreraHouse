// Condomínios · índice público (/condominios), a página de cada condomínio (/condominios/<slug>) e os dados do 3D para o visitante.
// Mostra só o que é público e do cliente (a imobiliária): nome, bairro, tamanho do prédio (Censo), lazer, o que tem perto, o 3D
// e os imóveis do cliente à venda ali. Nada do Radar, do Fisguei, de proprietários ou de concorrentes; sem rua e número.
// Fica fora do Google (noindex) até a imobiliária decidir divulgar (CONDOMINIOS_PUBLICOS=1 no .env/Vercel).
const express = require('express');
const { one, all } = require('../db');
const paginas = require('../portal/paginas');
const fonte = require('../portal/fonte');
const { perto } = require('./perto');
const { cena3d } = require('./cena3d');
const G = require('./geo');
const { CLIENTE_NOME: CLIENTE } = require('../config'); // nome da imobiliária, da configuração

const SLUG = /^[a-z0-9][a-z0-9-]{1,90}$/;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const LAZER = require('./base').LAZER;

function listarPublicos() {
  return all(`SELECT nome, slug, bairro, tipo, andares, torres, unidades, ano_construcao
    FROM condominios
    WHERE slug IS NOT NULL AND slug <> '' AND lat IS NOT NULL AND coalesce(tipo,'') <> 'comercial'`)
    .filter((c) => SLUG.test(c.slug))
    .sort((a, b) => String(a.bairro || '').localeCompare(String(b.bairro || ''), 'pt-BR')
      || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}

function fatosPublicos(c) {
  const vertical = c.tipo !== 'horizontal';
  return [
    vertical && c.andares ? `${c.andares} andares` : null,
    c.torres ? `${c.torres} ${vertical ? 'torres' : 'quadras'}` : null,
    c.unidades ? `${c.unidades} ${vertical ? 'apartamentos' : 'casas'}` : null,
    c.ano_construcao ? `construído em ${c.ano_construcao}` : null,
  ].filter(Boolean);
}

function paginaLista(req, lista) {
  const indexar = process.env.CONDOMINIOS_PUBLICOS === '1' && lista.length > 0;
  const grupos = new Map();
  for (const c of lista) {
    const bairro = c.bairro || 'Campinas';
    if (!grupos.has(bairro)) grupos.set(bairro, []);
    grupos.get(bairro).push(c);
  }
  const corpo = lista.length ? `
<section class="p-hero p-hero-curto">
  <h1>Condomínios</h1>
  <p class="p-sobre depois">Campinas</p>
  <p class="p-hero-l">Prédios e condomínios de casas com página na ${esc(CLIENTE)}: o que tem perto, a visita em 3D e os imóveis à venda.</p>
</section>
${[...grupos].map(([bairro, itens]) => `<section class="p-cd-sec"><h2>${esc(bairro)}</h2>
<ul class="p-cd-lista">${itens.map((c) => {
    const tipo = c.tipo === 'horizontal' ? 'Condomínio de casas' : 'Prédio residencial';
    return `<li><a href="/condominios/${esc(c.slug)}"><b>${esc(c.nome)}</b><span>${esc([tipo, ...fatosPublicos(c)].join(' · '))}</span></a></li>`;
  }).join('')}</ul></section>`).join('')}`
    : `<div class="p-vazio p-vazio-g"><h1>Condomínios</h1><p>As páginas dos condomínios chegam em breve.</p><a class="p-botao" href="/imoveis">Ver os imóveis à venda</a></div>`;
  const descricao = `Condomínios e prédios de Campinas com página na ${CLIENTE}: estrutura, o que tem perto e imóveis à venda.`;
  return paginas.casca(req, { titulo: 'Condomínios em Campinas', descricao, caminho: '/condominios', corpo, classe: 'p-cd', semIndice: !indexar });
}

function porSlug(slug) {
  if (!SLUG.test(slug)) return null;
  const c = one("SELECT * FROM condominios WHERE slug=? AND coalesce(tipo,'') <> 'comercial'", slug);
  return c && c.lat ? c : null;
}

function html(res, corpo, status = 200) {
  res.status(status);
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Cache-Control', status === 200 ? 'public, max-age=120, s-maxage=600, stale-while-revalidate=3600' : 'no-store');
  res.type('html').send(corpo);
}

async function pagina(req, c) {
  const noAr = (await fonte.noAr().catch(() => [])).filter((x) => x.imovel.condominio && G.chave(x.imovel.condominio) === G.chave(c.nome));
  const textos = [c.lazer, ...all('SELECT descricao FROM imoveis WHERE condominio_id=? AND status=\'publicado\'', c.id).map((i) => i.descricao)].filter(Boolean).join(' ');
  const lazer = LAZER.filter(([, re]) => re.test(textos)).map(([n]) => n);
  let p = null; try { p = await perto(c); } catch {}
  const cats = p ? p.categorias.filter((x) => x.itens.length) : [];
  const vertical = c.tipo !== 'horizontal';
  const fatos = [
    vertical && c.andares ? `${c.andares} andares` : null,
    c.torres ? `${c.torres} ${vertical ? 'torres' : 'quadras'}` : null,
    c.unidades ? `${c.unidades} ${vertical ? 'apartamentos' : 'casas'}` : null,
    c.ano_construcao ? `construído em ${c.ano_construcao}` : null,
  ].filter(Boolean);
  const titulo = `${c.nome}${c.bairro ? ` · ${c.bairro}` : ''}, Campinas`;
  const descricao = `${c.nome}, ${vertical ? 'prédio residencial' : 'condomínio de casas'} no ${c.bairro || 'Campinas'}${fatos.length ? ` com ${fatos.join(', ')}` : ''}. Veja em 3D, o que tem perto e os imóveis à venda com a ${CLIENTE}.`;
  const indexar = process.env.CONDOMINIOS_PUBLICOS === '1' && noAr.length > 0;
  const corpo = `
<section class="p-hero p-hero-curto">
  <h1>${esc(c.nome)}</h1>
  <p class="p-sobre depois">${vertical ? 'Prédio residencial' : 'Condomínio de casas'}${c.bairro ? ` · ${esc(c.bairro)}` : ''} · Campinas</p>
  ${fatos.length ? `<p class="p-hero-l">${esc(fatos.join(' · '))}${c.unidades_fonte && /censo/i.test(c.unidades_fonte) ? ' <span class="p-cd-fonte">(Censo 2022, IBGE)</span>' : ''}</p>` : ''}
  <p><a class="p-botao" href="/condominios/${esc(c.slug)}/3d">Explorar o condomínio em 3D</a> <a class="p-botao sec" href="#contato">Quero morar aqui</a></p>
</section>
${noAr.length ? `<section class="p-cd-sec"><h2>À venda com a ${esc(CLIENTE)} neste condomínio</h2><div class="p-grade">${noAr.map((x) => paginas.cartao(x)).join('')}</div></section>` : ''}
${lazer.length ? `<section class="p-cd-sec"><h2>Lazer e estrutura</h2><ul class="p-cd-chips">${lazer.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></section>` : ''}
${cats.length ? `<section class="p-cd-sec"><h2>O que tem perto</h2><p class="p-cd-sub">A pé, a partir da portaria.</p><div class="p-cd-perto">${cats.map((cat) => `<div class="p-cd-cat"><h3><span aria-hidden="true">${cat.icone}</span> ${esc(cat.nome)}</h3><ul>${cat.itens.slice(0, 4).map((x) => `<li><span>${esc(x.nome)}</span><span>${x.min} min</span></li>`).join('')}</ul></div>`).join('')}</div><p class="p-cd-sub p-cd-nota">Fonte: ${esc(p.fonte)}.</p></section>` : ''}
<section class="p-contato" id="contato" aria-labelledby="contato-t">
<div class="p-contato-txt"><h2 id="contato-t">Quer morar no ${esc(c.nome)}?</h2>
<p>Deixe seu contato: a ${esc(CLIENTE)} avisa quando surgir um imóvel aqui e mostra as opções parecidas no ${esc(c.bairro || 'bairro')}.</p></div>
<form class="p-form" data-interesse novalidate>
  <input type="hidden" name="condominio" value="${esc(c.slug)}">
  <label class="p-armadilha" aria-hidden="true">Empresa<input name="empresa" tabindex="-1" autocomplete="off"></label>
  <label class="p-campo"><span>Nome</span><input name="nome" required autocomplete="name" maxlength="120"></label>
  <label class="p-campo"><span>WhatsApp ou telefone</span><input name="telefone" required inputmode="tel" autocomplete="tel" maxlength="20" placeholder="(19) 99999-9999"></label>
  <label class="p-campo"><span>E-mail <i>(opcional)</i></span><input name="email" type="email" autocomplete="email" maxlength="120"></label>
  <label class="p-campo p-largo"><span>Mensagem</span><textarea name="mensagem" rows="3" maxlength="1000">Quero ser avisado quando houver imóvel à venda no ${esc(c.nome)}.</textarea></label>
  <label class="p-check p-largo"><input type="checkbox" name="aceite" value="1" required> Concordo que a ${esc(CLIENTE)} use estes dados só para falar comigo sobre imóveis. Posso pedir para sair a qualquer momento.</label>
  <button class="p-botao p-largo" type="submit">Quero ser avisado</button>
  <p class="p-form-msg p-largo" role="status" aria-live="polite" hidden></p>
</form></section>`;
  const ld = [{ '@context': 'https://schema.org', '@type': vertical ? 'ApartmentComplex' : 'GatedResidenceCommunity', name: c.nome, description: descricao,
    address: { '@type': 'PostalAddress', addressLocality: 'Campinas', addressRegion: 'SP', addressCountry: 'BR', ...(c.bairro ? { streetAddress: c.bairro } : {}) },
    ...(c.unidades ? { numberOfAccommodationUnits: c.unidades } : {}) }];
  return paginas.casca(req, { titulo, descricao, caminho: `/condominios/${c.slug}`, ld, corpo, classe: 'p-cd', semIndice: !indexar });
}

const router = express.Router();
function indice(req, res, next) {
  // Com a rota folgada do Express, /condominios e /condominios/ caem no mesmo lugar: a barra volta para o endereço limpo.
  const caminho = req.originalUrl.split('?')[0];
  if (caminho.length > 1 && caminho.endsWith('/')) return res.redirect(301, caminho.replace(/\/+$/, ''));
  try { html(res, paginaLista(req, listarPublicos())); }
  catch (e) { next(e); }
}
router.get(['/condominios', '/condominios/'], indice);
router.get('/condominios/:slug', async (req, res, next) => {
  const c = porSlug(req.params.slug);
  if (!c) return next();
  html(res, await pagina(req, c));
});
router.get('/condominios/:slug/3d', (req, res, next) => {
  const c = porSlug(req.params.slug);
  if (!c) return next();
  const im = req.query.imovel && /^[A-Z]{2}\d{3,6}$/i.test(req.query.imovel) ? `&imovel=${encodeURIComponent(String(req.query.imovel).toUpperCase())}` : '';
  res.redirect(302, `/condominio-3d.html?slug=${encodeURIComponent(c.slug)}${im}`);
});

// API pública do 3D: só o prédio, o entorno e (se pedir) o andar de um imóvel do cliente publicado ali.
const api = express.Router();
// chave do Google Maps para o 3D realista (restrita aos sites da imobiliária no console do Google)
// altitude do terreno (Copernicus DEM pelo Open-Meteo) para encaixar o 3D do Google no chão certo
const elev = new Map();
api.get('/elevacao', async (req, res) => {
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  if (!(lat > -24 && lat < -22 && lon > -48 && lon < -46)) return res.status(400).json({ erro: 'Fora de Campinas.' });
  const k = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (!elev.has(k)) {
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`, { signal: AbortSignal.timeout(6000) });
      const j = await r.json(); const h = j && j.elevation && Number(j.elevation[0]);
      if (Number.isFinite(h)) { elev.set(k, h); if (elev.size > 5000) elev.clear(); }
    } catch {}
  }
  res.setHeader('Cache-Control', 'public, max-age=86400');
  // o 3D do Google usa altura sobre o elipsoide: em Campinas o geoide fica ~5,5 m abaixo
  res.json({ altitude: elev.get(k) ?? null, elipsoide: elev.has(k) ? elev.get(k) - 5.5 : null });
});
api.get('/mapas', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ chave: require('./fachada').chave() || null }); });
api.get('/:slug/3d', async (req, res) => {
  const c = porSlug(req.params.slug);
  if (!c) return res.status(404).json({ erro: 'Condomínio não encontrado.' });
  const cena = await cena3d(c);
  let imovel = null;
  if (req.query.imovel) {
    const im = one("SELECT id, codigo, unidade, tipo FROM imoveis WHERE codigo=? AND condominio_id=? AND status='publicado'", String(req.query.imovel).toUpperCase(), c.id);
    if (im) imovel = { codigo: im.codigo, tipo: im.tipo, ...G.andarDaUnidade(im.unidade, c.numeracao), unidade: null };
  }
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
  res.json({ condominio: { nome: c.nome, tipo: c.tipo, andares: c.andares, torres: c.torres, unidades: c.unidades, bairro: c.bairro }, cena, imovel, unidades: [] });
});
api.get('/:slug/perto', async (req, res) => {
  const c = porSlug(req.params.slug);
  if (!c) return res.status(404).json({ erro: 'Condomínio não encontrado.' });
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  res.json((await perto(c)) || { categorias: [] });
});

module.exports = router;
module.exports.api = api;
module.exports.porSlug = porSlug;
