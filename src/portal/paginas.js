// Portal do cliente (a imobiliária) · as páginas públicas, montadas no servidor (o Google lê o texto
// e a ficha direto do HTML, sem depender de JavaScript).
//
//   /imoveis                 vitrine com busca e filtros
//   /imoveis/favoritos       os imóveis que o visitante marcou (guardados no aparelho dele)
//   /imoveis/<endereço>      a página única do imóvel

const cfg = require('../config');
// Portal de demonstração (PORTAL_DEMONSTRACAO=1): fora do Google e com aviso de imagens ilustrativas.
const DEMONSTRACAO = /^(1|sim|true)$/i.test(String(process.env.PORTAL_DEMONSTRACAO || '').trim());
const og = require('../og');
const { AMBIENTES, CHAMADAS } = require('./config');
const { lerTextoRico, montarSumario, dataPorExtenso, cortar, semAcento } = require('../blog/texto');
const { SITE_CLIENTE, INSTAGRAM_CLIENTE } = require('../blog/categorias');
// O nome da imobiliária vem da configuração: CLIENTE (curto, a marca) e EMPRESA (nome completo).
const CLIENTE = cfg.CLIENTE_NOME;
const FUNDO = require('./fundos').fundoDe(process.env.PORTAL_FUNDO, CLIENTE);
const EMPRESA = cfg.EMPRESA;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const POR_PAGINA = 18;
// Versão dos arquivos do portal no endereço (?v=…): quem já visitou recebe o CSS e o JS novos na hora.
const VERSAO_ASSETS = (() => {
  try {
    const fs = require('fs'), p = require('path');
    const h = require('crypto').createHash('sha1');
    for (const f of ['portal.css', 'portal.js']) h.update(fs.readFileSync(p.join(__dirname, '..', '..', 'public', 'portal-assets', f)));
    return h.digest('hex').slice(0, 10);
  } catch { return String(Date.now()); }
})();
const { SIGNATURE } = require('./edicoes');

/** Acima do limite da seleção Signature o valor fica reservado aos membros do clube (página /imoveis/signature). */
const reservado = (im) => !!(im && im.valor && im.valor >= SIGNATURE.limite);
const RESERVADO = `${CLIENTE} Signature · valor para membros`;
const valorTexto = (im) => (reservado(im) ? RESERVADO : im.valor ? reais(im.valor) : 'Sob consulta');

function rico(texto) {
  const desenhar = (t) => t.map((x) => (x.tipo === 'texto' ? esc(x.valor) : x.tipo === 'negrito' ? `<strong>${desenhar(x.filhos)}</strong>`
    : x.tipo === 'italico' ? `<em>${desenhar(x.filhos)}</em>` : desenhar(x.filhos))).join('');
  return desenhar(lerTextoRico(texto));
}

// ------------------------------------------------------------------ formatos
const reais = (v) => (v ? `R$ ${Math.round(v).toLocaleString('pt-BR')}` : null);
const metros = (v) => (v ? `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²` : null);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const lugar = (im) => [im.bairro, im.cidade].filter(Boolean).join(', ');
// ?v=2: fotos externas passaram a ser entregues pelo próprio site (o redirecionamento antigo ficou guardado nos navegadores).
const fotoUrl = (id) => `/imoveis/foto/${id}?v=2`;

function urlBase(req) {
  const fixo = (process.env.PORTAL_URL || process.env.BLOG_URL || cfg.PUBLIC_URL || '').replace(/\/+$/, '');
  return fixo || `${req.protocol}://${req.get('host')}`;
}

function telefoneWhats(im) {
  let n = String((im && im.corretor && im.corretor.telefone) || cfg.WHATSAPP_CLIENTE || '').replace(/\D/g, '');
  if (!n) return null;
  if (n.length <= 11) n = `55${n}`;
  return n;
}
function whatsapp(im, mensagem) {
  const n = telefoneWhats(im);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(mensagem)}` : null;
}

/** Os grupos de tipo do filtro. */
const GRUPOS = [
  { slug: 'apartamento', nome: 'Apartamentos', tipos: ['Apartamento', 'Cobertura', 'Flat', 'Studio', 'Kitnet'] },
  { slug: 'casa', nome: 'Casas', tipos: ['Casa', 'Casa em condomínio', 'Sobrado'] },
  { slug: 'terreno', nome: 'Terrenos', tipos: ['Terreno'] },
  { slug: 'rural', nome: 'Chácaras e sítios', tipos: ['Chácara', 'Sítio', 'Fazenda'] },
  { slug: 'comercial', nome: 'Comerciais', tipos: ['Sala comercial', 'Loja', 'Galpão', 'Prédio', 'Hotel', 'Ponto comercial'] },
];
const grupoDo = (tipo) => GRUPOS.find((g) => g.tipos.includes(tipo)) || null;
const residencial = (tipo) => ['apartamento', 'casa', 'rural'].includes((grupoDo(tipo) || {}).slug);

function specs(im, curto = false) {
  const s = [];
  const area = im.area_util || im.area_total;
  if (area) s.push(curto ? metros(area) : `${metros(area)}${im.area_util ? ' úteis' : ''}`);
  if (im.quartos) s.push(plural(im.quartos, 'quarto', 'quartos'));
  if (im.suites) s.push(plural(im.suites, 'suíte', 'suítes'));
  if (im.vagas) s.push(plural(im.vagas, 'vaga', 'vagas'));
  return s;
}

// --------------------------------------------------------------------- casca
function blocoImagem(base, imagem, largura, altura, tipo) {
  if (!imagem) return '<meta name="twitter:card" content="summary">';
  const url = /^https?:\/\//i.test(imagem) ? imagem : base + imagem;
  const linhas = [`<meta property="og:image" content="${esc(url)}">`];
  if (tipo) linhas.push(`<meta property="og:image:type" content="${esc(tipo)}">`);
  const w = Number(largura), h = Number(altura);
  if (w > 0 && h > 0) {
    linhas.push(`<meta property="og:image:width" content="${Math.round(w)}">`);
    linhas.push(`<meta property="og:image:height" content="${Math.round(h)}">`);
  }
  linhas.push('<meta name="twitter:card" content="summary_large_image">');
  return linhas.join('\n');
}

function casca(req, { titulo, descricao, caminho, imagem, imagemLargura, imagemAltura, imagemTipo, ld = [], corpo, classe = '', semIndice = false }) {
  const base = urlBase(req);
  const canonico = base + caminho;
  const zap = whatsapp(null, `Olá! Vim pelo portal da ${CLIENTE} e quero ajuda para encontrar um imóvel.`);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<link rel="canonical" href="${esc(canonico)}">
${semIndice || DEMONSTRACAO ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:site_name" content="${esc(EMPRESA)}">
<meta property="og:locale" content="pt_BR">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${esc(canonico)}">
${blocoImagem(base, imagem, imagemLargura, imagemAltura, imagemTipo)}
<meta name="theme-color" content="#FBFAF8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap">
<link rel="stylesheet" href="/portal-assets/portal.css?v=${VERSAO_ASSETS}">${require('../tema').head()}
${ld.map((o) => `<script type="application/ld+json">${json(o)}</script>`).join('\n')}
</head>
<body class="${classe}${DEMONSTRACAO ? ' p-demo' : ''}">
<a class="pular" href="#conteudo">Ir para o conteúdo</a>
<header class="p-topo">
  <a class="p-marca" href="/imoveis">${require('../tema').logo(CLIENTE, 'p-marca-logo') || `<span class="p-marca-n">${esc(CLIENTE)}</span>`}<span class="p-marca-l">Imóveis à venda em Campinas e região</span></a>
  <nav class="p-nav" aria-label="Portal">
    <a href="/imoveis"${['/imoveis', '/imoveis/revista'].includes(req.path) ? ' aria-current="page"' : ''}>Imóveis</a>
    <a class="p-nav-sig" href="/imoveis/signature"${req.path.startsWith('/imoveis/signature') ? ' aria-current="page"' : ''}>Signature</a>
    <a href="/imoveis/favoritos"${req.path === '/imoveis/favoritos' ? ' aria-current="page"' : ''}>Favoritos <span class="p-fav-n" data-fav-n hidden></span></a>
    <a href="/bairros"${req.path.startsWith('/bairros') ? ' aria-current="page"' : ''}>Bairros</a>
    <a href="/condominios"${req.path.startsWith('/condominios') ? ' aria-current="page"' : ''}>Condomínios</a>
    <a href="/blog">${esc(cfg.BLOG_NOME)}</a>
    ${zap ? `<a class="p-nav-zap" href="${esc(zap)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
    <a class="p-nav-entrar" href="/entrar" rel="nofollow">Entrar</a>
  </nav>
</header>
<main id="conteudo">${corpo}</main>
<footer class="p-rodape">
  <div><p class="p-rodape-n">${esc(EMPRESA)}</p><p>Imobiliária de venda em Campinas, SP.${process.env.BLOG_CRECI ? ` CRECI ${esc(process.env.BLOG_CRECI)}.` : ''}</p></div>
  <nav aria-label="${esc(CLIENTE)}"><a href="/imoveis">Imóveis à venda</a><a href="/bairros">Bairros de Campinas</a><a href="/condominios">Condomínios</a><a href="/blog">${esc(cfg.BLOG_NOME)}</a>${INSTAGRAM_CLIENTE ? `<a href="${esc(INSTAGRAM_CLIENTE)}" target="_blank" rel="noopener">Instagram</a>` : ''}${SITE_CLIENTE ? `<a href="${esc(SITE_CLIENTE)}" target="_blank" rel="noopener">Site da ${esc(CLIENTE)}</a>` : ''}<a href="/privacidade">Privacidade e seus dados</a><a href="/termos">Termos de uso</a><a href="/entrar" rel="nofollow">Área da equipe</a></nav>
  <p class="p-rodape-p">Valores, áreas e condições conferidos na ficha do imóvel e sujeitos a alteração sem aviso; confirme com o corretor antes de qualquer decisão. Os textos das páginas foram escritos a partir das fotos e da ficha de cada imóvel. O endereço exato é informado pelo corretor.</p>${DEMONSTRACAO ? `
  <p class="p-rodape-p"><strong>Portal de demonstração.</strong> As fotos são imagens ilustrativas, criadas para esta demonstração: não mostram os imóveis reais.</p>` : ''}
</footer>
<script src="/portal-assets/portal.js?v=${VERSAO_ASSETS}" defer></script>
</body></html>`;
}

// ------------------------------------------------------------------- cartões
function cartao(x, { eager = false } = {}) {
  const { imovel: im, pagina: p } = x;
  const busca = semAcento(`${p.titulo} ${p.resumo} ${im.tipo} ${im.bairro || ''} ${im.cidade || ''} ${im.condominio || ''} ${im.codigo}`);
  return `<article class="p-cartao" data-codigo="${esc(im.codigo)}" data-busca="${esc(busca)}">
<a class="p-cartao-img" href="/imoveis/${p.slug}"><img src="${fotoUrl(p.capa.foto)}" alt="${esc(p.capa.alt)}" width="1280" height="853" loading="${eager ? 'eager' : 'lazy'}" decoding="async"><span class="p-cartao-n">${im.fotos.length} fotos</span></a>
<button class="p-fav" type="button" data-fav="${esc(im.codigo)}" aria-pressed="false" aria-label="Guardar ${esc(im.codigo)} nos favoritos" title="Guardar nos favoritos"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.1 3.6 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.6 0 5.7 3.6 4.5 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg></button>
<div class="p-cartao-t">
<h3><a href="/imoveis/${p.slug}">${esc(p.titulo)}</a></h3>
<p class="p-cartao-tipo">${esc(im.tipo)} · ${esc(lugar(im))}</p>
<p class="p-specs">${specs(im, true).map(esc).join('<span aria-hidden="true"> · </span>')}</p>
<p class="p-preco${reservado(im) ? ' p-preco-sig' : ''}">${reservado(im) ? `<a href="/imoveis/signature/${esc(im.codigo.toLowerCase())}">${RESERVADO}</a>` : im.valor ? esc(reais(im.valor)) : 'Valor sob consulta'}</p>
</div></article>`;
}

// ------------------------------------------------------------------- vitrine
function filtrar(lista, q) {
  let r = lista;
  const g = GRUPOS.find((x) => x.slug === q.tipo);
  if (g) r = r.filter((x) => g.tipos.includes(x.imovel.tipo));
  if (q.bairro) r = r.filter((x) => semAcento(x.imovel.bairro || '') === semAcento(q.bairro));
  const quartos = parseInt(q.quartos, 10);
  if (quartos > 0) r = r.filter((x) => (x.imovel.quartos || 0) >= quartos);
  const ate = Number(String(q.ate || '').replace(/\D/g, ''));
  if (ate > 0) r = r.filter((x) => x.imovel.valor && !reservado(x.imovel) && x.imovel.valor <= ate);
  const de = Number(String(q.de || '').replace(/\D/g, ''));
  if (de > 0) r = r.filter((x) => x.imovel.valor && !reservado(x.imovel) && x.imovel.valor >= de);
  const termos = semAcento(String(q.q || '').slice(0, 80)).split(/\s+/).filter(Boolean);
  if (termos.length) {
    r = r.filter((x) => {
      const t = semAcento(`${x.pagina.titulo} ${x.pagina.resumo} ${x.imovel.tipo} ${x.imovel.bairro || ''} ${x.imovel.cidade || ''} ${x.imovel.condominio || ''} ${x.imovel.codigo}`);
      return termos.every((k) => t.includes(k));
    });
  }
  const ordem = {
    'menor-valor': (a, b) => (a.imovel.valor || Infinity) - (b.imovel.valor || Infinity),
    'maior-valor': (a, b) => (b.imovel.valor || 0) - (a.imovel.valor || 0),
    'maior-area': (a, b) => (b.imovel.area_util || b.imovel.area_total || 0) - (a.imovel.area_util || a.imovel.area_total || 0),
  }[q.ordem];
  return ordem ? [...r].sort(ordem) : r;
}

const FAIXAS = [500000, 800000, 1000000, 1500000, 2000000, 3000000, 5000000, 10000000];

function paginaVitrine(req, lista, guiaDoBairro = null) {
  const q = req.query || {};
  const achados = filtrar(lista, q);
  const pagina = Math.max(1, parseInt(q.pagina, 10) || 1);
  const paginas = Math.max(1, Math.ceil(achados.length / POR_PAGINA));
  const daPagina = achados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const bairros = [...lista.reduce((m, x) => (x.imovel.bairro ? m.set(x.imovel.bairro, (m.get(x.imovel.bairro) || 0) + 1) : m), new Map())]
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  const grupos = GRUPOS.filter((g) => lista.some((x) => g.tipos.includes(x.imovel.tipo)));
  const sel = (v, atual) => (String(v) === String(atual || '') ? ' selected' : '');
  const filtrado = ['tipo', 'bairro', 'quartos', 'ate', 'de', 'q'].some((k) => q[k]);
  const link = (n) => { const u = new URLSearchParams(Object.entries(q).filter(([k, v]) => k !== 'pagina' && v)); if (n > 1) u.set('pagina', n); const s = u.toString(); return `/imoveis${s ? `?${s}` : ''}`; };
  const grupo = GRUPOS.find((g) => g.slug === q.tipo);
  const titulo = grupo ? `${grupo.nome} à venda${q.bairro ? ` no ${q.bairro}` : ''} · ${CLIENTE}` : q.bairro ? `Imóveis à venda no ${q.bairro} · ${CLIENTE}` : `Imóveis à venda em Campinas e região · ${CLIENTE}`;

  const corpo = `
${require('./versoes').seletor('vitrine')}
<section class="p-hero p-hero-foto p-hero-direita">
  <div class="p-hero-fundo" aria-hidden="true"><img src="${esc(FUNDO.src)}"${FUNDO.srcset ? ` srcset="${esc(FUNDO.srcset)}" sizes="100vw"` : ''} alt="" width="${FUNDO.largura}" height="${FUNDO.altura}" style="object-position:${esc(FUNDO.posicao)}" fetchpriority="high" decoding="async"></div>
  <div class="p-hero-txt">
  <h1>${grupo ? esc(grupo.nome) : 'Imóveis'} à venda${q.bairro ? ` no ${esc(q.bairro)}` : ' em Campinas e região'}</h1>
  <p class="p-sobre depois">Portal ${esc(CLIENTE)}</p>
  <p class="p-hero-l">${lista.length} imóveis com fotos, ficha completa e uma página para cada um. Encontrou? Fale com o corretor pela própria página.</p>
  </div>
  <form class="p-filtros" method="get" action="/imoveis" role="search" data-filtros>
    <label class="p-campo p-campo-q"><span>Procurar</span><input type="search" name="q" value="${esc(q.q || '')}" placeholder="Bairro, condomínio, código…" autocomplete="off" maxlength="80"></label>
    <label class="p-campo"><span>Tipo</span><select name="tipo"><option value="">Todos</option>${grupos.map((g) => `<option value="${g.slug}"${sel(g.slug, q.tipo)}>${esc(g.nome)}</option>`).join('')}</select></label>
    <label class="p-campo"><span>Bairro</span><select name="bairro"><option value="">Todos</option>${bairros.map(([b, n]) => `<option value="${esc(b)}"${sel(b, q.bairro)}>${esc(b)} (${n})</option>`).join('')}</select></label>
    <label class="p-campo"><span>Quartos</span><select name="quartos"><option value="">Qualquer</option>${[1, 2, 3, 4].map((n) => `<option value="${n}"${sel(n, q.quartos)}>${n}+</option>`).join('')}</select></label>
    <label class="p-campo"><span>Até</span><select name="ate"><option value="">Qualquer valor</option>${FAIXAS.map((v) => `<option value="${v}"${sel(v, q.ate)}>${esc(reais(v))}</option>`).join('')}</select></label>
    <label class="p-campo"><span>Ordem</span><select name="ordem"><option value="">Mais recentes</option><option value="menor-valor"${sel('menor-valor', q.ordem)}>Menor valor</option><option value="maior-valor"${sel('maior-valor', q.ordem)}>Maior valor</option><option value="maior-area"${sel('maior-area', q.ordem)}>Maior área</option></select></label>
    <button class="p-botao" type="submit">Buscar</button>
  </form>
  <p class="p-hero-credito">${esc(FUNDO.lugar)}${FUNDO.credito ? ` · <a href="${esc(FUNDO.link)}" target="_blank" rel="noopener nofollow">${esc(FUNDO.credito)}</a>` : ''}</p>
</section>
<section class="p-resultado" aria-live="polite">
  ${guiaDoBairro ? `<p class="p-guia">Quer conhecer melhor o bairro? <a href="/bairros/${esc(guiaDoBairro.slug)}">Guia do ${esc(guiaDoBairro.nome)}</a>: história, parques, escolas, comércio e prédios.</p>` : ''}
  <div class="p-resultado-cab"><p><b>${achados.length}</b> ${achados.length === 1 ? 'imóvel encontrado' : 'imóveis encontrados'}</p>${filtrado ? '<a href="/imoveis">Limpar filtros</a>' : ''}</div>
  ${daPagina.length ? `<h2 class="oculto">${lista.length} imóveis</h2><div class="p-grade">${daPagina.map((x, i) => cartao(x, { eager: i < 3 })).join('')}</div>` : `<div class="p-vazio"><p>${lista.length ? 'Nenhum imóvel com esses filtros.' : 'Os imóveis chegam em breve.'}</p>${filtrado ? '<a class="p-botao sec" href="/imoveis">Ver todos os imóveis</a>' : ''}${whatsapp(null, 'Olá! Procuro um imóvel e não achei no portal.') ? `<a class="p-botao" href="${esc(whatsapp(null, 'Olá! Procuro um imóvel e não achei no portal.'))}" target="_blank" rel="noopener">Contar o que procuro</a>` : ''}</div>`}
  ${paginas > 1 ? `<nav class="p-paginas" aria-label="Páginas">${pagina > 1 ? `<a href="${esc(link(pagina - 1))}" rel="prev"><span class="p-seta p-seta-volta" aria-hidden="true"></span> Anteriores</a>` : '<span></span>'}<span>Página ${pagina} de ${paginas}</span>${pagina < paginas ? `<a href="${esc(link(pagina + 1))}" rel="next">Próximos <span class="p-seta" aria-hidden="true"></span></a>` : '<span></span>'}</nav>` : ''}
</section>`;
  const base = urlBase(req);
  const ld = [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: titulo, numberOfItems: achados.length,
    itemListElement: daPagina.map((x, i) => ({ '@type': 'ListItem', position: (pagina - 1) * POR_PAGINA + i + 1, url: `${base}/imoveis/${x.pagina.slug}`, name: x.pagina.titulo })),
  }];
  const capaOg = daPagina[0] ? og.metaFotoPortal(daPagina[0].pagina.capa.foto) : {};
  return casca(req, {
    titulo, descricao: `${lista.length} imóveis à venda pela ${CLIENTE} em Campinas e região: apartamentos, casas em condomínio e terrenos, com fotos, ficha completa e contato direto com o corretor.`,
    caminho: link(pagina), imagem: capaOg.caminho, imagemLargura: capaOg.largura, imagemAltura: capaOg.altura, imagemTipo: capaOg.tipo, ld, corpo, classe: 'p-vitrine', semIndice: filtrado && !(grupo && Object.keys(q).length === 1),
  });
}

function paginaFavoritos(req, lista) {
  const corpo = `
<section class="p-hero p-hero-curto"><h1>Seus favoritos</h1><p class="p-sobre depois">Portal ${esc(CLIENTE)}</p>
<p class="p-hero-l">Os imóveis que você marcou com o coração ficam guardados neste aparelho. Nada é enviado para a ${esc(CLIENTE)} até você pedir contato.</p></section>
<section class="p-resultado" data-favoritos>
  <h2 class="oculto">Imóveis guardados</h2><div class="p-grade">${lista.map((x) => cartao(x)).join('')}</div>
  <div class="p-vazio" data-favoritos-vazio hidden><p>Você ainda não guardou nenhum imóvel. Toque no coração de um imóvel para guardar aqui.</p><a class="p-botao" href="/imoveis">Ver os imóveis</a></div>
</section>`;
  return casca(req, { titulo: `Favoritos · ${CLIENTE}`, descricao: `Os imóveis da ${CLIENTE} que você guardou.`, caminho: '/imoveis/favoritos', corpo, classe: 'p-vitrine', semIndice: true });
}

// --------------------------------------------------------- página do imóvel
function chamada(tema, im) {
  const c = CHAMADAS[tema];
  const zap = tema === 'corretor' && whatsapp(im, `Olá! Tenho uma dúvida sobre o imóvel ${im.codigo}.`);
  const href = zap || '#contato';
  return `<aside class="p-chamada" aria-label="${esc(c.titulo)}"><div><p class="p-chamada-t">${esc(c.titulo)}</p><p>${esc(c.texto)}</p></div>
<a class="p-botao" href="${esc(href)}"${zap ? ' target="_blank" rel="noopener"' : ` data-contato="${tema === 'visita' ? 'visita' : 'interesse'}"`}>${esc(c.rotulo)}</a></aside>`;
}

function bloco(b, ids, ctx) {
  switch (b.tipo) {
    case 'paragrafo': return `<p>${rico(b.texto)}</p>`;
    case 'titulo': return `<h${b.nivel} id="${esc(ids.get(b))}">${esc(b.texto)}</h${b.nivel}>`;
    case 'resumo': return `<section class="p-destaques" aria-label="${esc(b.titulo || 'Destaques')}"><p class="p-destaques-t">${esc(b.titulo || 'Destaques')}</p><ul>${b.itens.map((i) => `<li>${rico(i)}</li>`).join('')}</ul></section>`;
    case 'lista': return `<ul class="p-lista">${b.itens.map((i) => `<li>${rico(i)}</li>`).join('')}</ul>`;
    case 'destaque': return `<div class="p-nota ${esc(b.tom)}">${b.titulo ? `<p class="p-nota-t">${esc(b.titulo)}</p>` : ''}<p>${rico(b.texto)}</p></div>`;
    case 'fotos': {
      const fotos = b.fotos.filter((f) => ctx.existe.has(f.foto));
      if (!fotos.length) return '';
      return `<div class="p-fotos p-fotos-${fotos.length}">${fotos.map((f) => `<figure><button type="button" data-ver="${f.foto}" aria-label="Ampliar: ${esc(f.legenda)}"><img src="${fotoUrl(f.foto)}" alt="${esc(f.legenda)}" loading="lazy" decoding="async" width="1280" height="853"></button><figcaption>${esc(f.legenda)}</figcaption></figure>`).join('')}</div>`;
    }
    case 'chamada': return chamada(b.tema, ctx.im);
    default: return '';
  }
}

/** A galeria na ordem da página; fotos novas (ainda sem legenda) entram no fim. */
function galeriaDe(im, p) {
  const existe = new Set(im.fotos);
  const g = p.galeria.filter((x) => existe.has(x.foto));
  const ja = new Set(g.map((x) => x.foto));
  for (const f of im.fotos) if (!ja.has(f)) g.push({ foto: f, legenda: `Foto do imóvel ${im.codigo}`, ambiente: 'outro' });
  return g;
}

function ficha(im) {
  const linhas = [
    ['Tipo', im.tipo], ['Código', im.codigo], ['Bairro', im.bairro], ['Cidade', [im.cidade, im.uf].filter(Boolean).join(' – ')],
    ['Condomínio', im.condominio], ['Área útil', metros(im.area_util)], ['Área total', metros(im.area_total)],
    ['Quartos', im.quartos], ['Suítes', im.suites], ['Vagas', im.vagas],
    ['Valor de venda', valorTexto(im)],
    ['Condomínio (mês)', reais(im.valor_condominio)], ['IPTU (ano)', reais(im.iptu)],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');
  return `<dl class="p-ficha">${linhas.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
${im.lazer ? `<p class="p-lazer"><b>Lazer do condomínio:</b> ${esc(im.lazer)}</p>` : ''}`;
}

function formulario(im, p) {
  const msg = `Olá! Tenho interesse no imóvel ${im.codigo}: ${p.titulo}.`;
  return `<section class="p-contato" id="contato" aria-labelledby="contato-t">
<div class="p-contato-txt"><h2 id="contato-t">Fale com a ${esc(CLIENTE)} sobre este imóvel</h2>
<p>Deixe seu contato e um corretor responde, em horário comercial, com o que você quiser saber: documentação, condomínio, condições e visita.</p>
${whatsapp(im, msg) ? `<p>Prefere conversar agora? <a href="${esc(whatsapp(im, msg))}" target="_blank" rel="noopener">Chame no WhatsApp</a>.</p>` : ''}</div>
<form class="p-form" data-interesse novalidate>
  <input type="hidden" name="codigo" value="${esc(im.codigo)}">
  <label class="p-armadilha" aria-hidden="true">Empresa<input name="empresa" tabindex="-1" autocomplete="off"></label>
  <label class="p-campo"><span>Nome</span><input name="nome" required autocomplete="name" maxlength="120"></label>
  <label class="p-campo"><span>WhatsApp ou telefone</span><input name="telefone" required inputmode="tel" autocomplete="tel" maxlength="20" placeholder="(19) 99999-9999"></label>
  <label class="p-campo"><span>E-mail <i>(opcional)</i></span><input name="email" type="email" autocomplete="email" maxlength="120"></label>
  <label class="p-campo p-largo"><span>Mensagem</span><textarea name="mensagem" rows="3" maxlength="1000">${esc(msg)}</textarea></label>
  <label class="p-check p-largo"><input type="checkbox" name="visita" value="1" data-visita> Quero agendar uma visita</label>
  <div class="p-largo p-visita" data-visita-campos hidden>
    <label class="p-campo"><span>Melhor dia</span><input type="date" name="dia"></label>
    <label class="p-campo"><span>Período</span><select name="periodo"><option value="">Tanto faz</option><option>Manhã</option><option>Tarde</option><option>Fim de semana</option></select></label>
  </div>
  <label class="p-check p-largo"><input type="checkbox" name="aceite" value="1" required> Concordo que a ${esc(CLIENTE)} use estes dados só para falar comigo sobre imóveis. Posso pedir para sair a qualquer momento.</label>
  <button class="p-botao p-largo" type="submit">Enviar para o corretor</button>
  <p class="p-form-msg p-largo" role="status" aria-live="polite" hidden></p>
</form></section>`;
}

function parecidos(x, lista) {
  const im = x.imovel;
  const g = grupoDo(im.tipo);
  return lista.filter((y) => y.imovel.codigo !== im.codigo)
    .map((y) => {
      let pts = 0;
      if (y.imovel.tipo === im.tipo) pts += 3; else if (g && grupoDo(y.imovel.tipo) === g) pts += 2;
      if (im.bairro && y.imovel.bairro === im.bairro) pts += 2;
      if (im.valor && y.imovel.valor) pts += Math.max(0, 2 - Math.abs(Math.log(y.imovel.valor / im.valor)) * 2);
      return { y, pts };
    })
    .sort((a, b) => b.pts - a.pts).slice(0, 3).map((a) => a.y);
}

function paginaImovel(req, x, lista) {
  const { imovel: im, pagina: p } = x;
  const base = urlBase(req);
  const url = `${base}/imoveis/${p.slug}`;
  const { sumario, ids } = montarSumario(p.blocos);
  const existe = new Set(im.fotos);
  const galeria = galeriaDe(im, p);
  const capa = existe.has(p.capa.foto) ? p.capa : { foto: galeria[0].foto, alt: galeria[0].legenda };
  const resto = galeria.filter((g) => g.foto !== capa.foto);
  const ordem = [capa.foto, ...resto.map((g) => g.foto)];
  const legendas = new Map(galeria.map((g) => [g.foto, g.legenda]));
  legendas.set(capa.foto, legendas.get(capa.foto) || capa.alt);
  const ambientes = [...new Set(galeria.map((g) => g.ambiente))];
  const grupo = grupoDo(im.tipo);
  const zap = whatsapp(im, `Olá! Tenho interesse no imóvel ${im.codigo}: ${p.titulo}.`);
  const area = im.area_util || im.area_total;

  const residencia = { Apartamento: 'Apartment', Cobertura: 'Apartment', Casa: 'House', 'Casa em condomínio': 'House', Sobrado: 'House', 'Chácara': 'House' }[im.tipo] || (residencial(im.tipo) ? 'Residence' : 'Place');
  const ld = [
    {
      '@context': 'https://schema.org', '@type': 'RealEstateListing', name: p.titulo, description: p.resumo, url,
      ...(p.publicadoEm ? { datePosted: p.publicadoEm } : {}),
      image: ordem.slice(0, 8).map((f) => `${base}${fotoUrl(f)}`),
      ...(im.valor && !reservado(im) ? { offers: { '@type': 'Offer', price: im.valor, priceCurrency: 'BRL', availability: 'https://schema.org/InStock', businessFunction: 'http://purl.org/goodrelations/v1#Sell', seller: { '@type': 'RealEstateAgent', name: EMPRESA, url: SITE_CLIENTE } } } : {}),
      about: {
        '@type': residencia, name: `${im.tipo} ${im.codigo}`,
        address: { '@type': 'PostalAddress', ...(im.bairro ? { streetAddress: im.bairro } : {}), addressLocality: im.cidade, addressRegion: im.uf, addressCountry: 'BR' },
        ...(area ? { floorSize: { '@type': 'QuantitativeValue', value: area, unitCode: 'MTK' } } : {}),
        ...(im.quartos ? { numberOfBedrooms: im.quartos, numberOfRooms: im.quartos } : {}),
      },
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Imóveis', item: `${base}/imoveis` },
        ...(grupo ? [{ '@type': 'ListItem', position: 2, name: grupo.nome, item: `${base}/imoveis?tipo=${grupo.slug}` }] : []),
        { '@type': 'ListItem', position: grupo ? 3 : 2, name: p.titulo, item: url },
      ],
    },
  ];
  if (p.perguntas) ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.perguntas.map((q) => ({ '@type': 'Question', name: q.pergunta, acceptedAnswer: { '@type': 'Answer', text: q.resposta } })) });

  const mosaico = ordem.slice(0, 5);
  const corpo = `
<nav class="p-trilha" aria-label="Você está em"><a href="/imoveis">Imóveis</a>${grupo ? ` <span aria-hidden="true">›</span> <a href="/imoveis?tipo=${grupo.slug}">${esc(grupo.nome)}</a>` : ''}${im.bairro ? ` <span aria-hidden="true">›</span> <a href="${x.guiaDoBairro ? `/bairros/${esc(x.guiaDoBairro.slug)}` : `/imoveis?bairro=${encodeURIComponent(im.bairro)}`}">${esc(im.bairro)}</a>` : ''}</nav>
<header class="p-im-cab">
  <h1>${esc(p.titulo)}</h1>
  <p class="p-sobre depois">${esc(im.tipo)} · ${esc(lugar(im))}${im.condominio ? ` · ${esc(im.condominio)}` : ''}</p>
  <p class="p-linha-fina">${esc(p.resumo)}</p>
</header>
<div class="p-mosaico p-mosaico-${Math.min(mosaico.length, 5)}" data-galeria='${esc(JSON.stringify(ordem.map((f) => ({ src: fotoUrl(f), legenda: legendas.get(f) || '' }))))}'>
${mosaico.map((f, i) => `<button type="button" class="p-mos-${i}" data-ver="${f}" aria-label="Ampliar: ${esc(legendas.get(f) || capa.alt)}"><img src="${fotoUrl(f)}" alt="${esc(i === 0 ? capa.alt : legendas.get(f) || '')}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="1280" height="853"></button>`).join('')}
<button type="button" class="p-mos-todas" data-ver="${capa.foto}">Ver as ${ordem.length} fotos</button>
</div>
<div class="p-im-corpo">
<div class="p-im-texto">
  <ul class="p-numeros" aria-label="Números do imóvel">
    ${area ? `<li><b>${esc(metros(area))}</b><span>${im.area_util ? 'área útil' : 'área total'}</span></li>` : ''}
    ${im.quartos ? `<li><b>${im.quartos}</b><span>${im.quartos === 1 ? 'quarto' : 'quartos'}</span></li>` : ''}
    ${im.suites ? `<li><b>${im.suites}</b><span>${im.suites === 1 ? 'suíte' : 'suítes'}</span></li>` : ''}
    ${im.vagas ? `<li><b>${im.vagas}</b><span>${im.vagas === 1 ? 'vaga' : 'vagas'}</span></li>` : ''}
    ${im.area_util && im.area_total && im.area_total !== im.area_util ? `<li><b>${esc(metros(im.area_total))}</b><span>área total</span></li>` : ''}
  </ul>
  ${sumario.filter((s) => s.nivel === 2).length >= 3 ? `<nav class="p-sumario" aria-label="Nesta página"><span>Nesta página:</span>${sumario.filter((s) => s.nivel === 2).map((s) => `<a href="#${esc(s.id)}">${esc(s.texto)}</a>`).join('')}<a href="#ficha">Ficha</a><a href="#fotos">Fotos</a></nav>` : ''}
  <div class="p-texto">
  ${p.blocos.map((b) => bloco(b, ids, { existe, im })).join('\n')}
  </div>
  <section class="p-sec" aria-labelledby="ficha"><h2 id="ficha">Ficha do imóvel</h2>${ficha(im)}${x.guiaDoBairro ? `<p class="p-guia">Como é morar no ${esc(x.guiaDoBairro.nome)}: <a href="/bairros/${esc(x.guiaDoBairro.slug)}">leia o guia do bairro</a>.</p>` : ''}</section>
  <section class="p-sec" aria-labelledby="fotos"><h2 id="fotos">Todas as fotos</h2>
    ${ambientes.length > 1 ? `<div class="p-amb" role="group" aria-label="Filtrar fotos por ambiente"><button type="button" aria-pressed="true" data-amb="">Todas (${galeria.length})</button>${ambientes.map((a) => `<button type="button" aria-pressed="false" data-amb="${esc(a)}">${esc(AMBIENTES[a] || a)} (${galeria.filter((g) => g.ambiente === a).length})</button>`).join('')}</div>` : ''}
    <div class="p-galeria">${[{ foto: capa.foto, legenda: legendas.get(capa.foto), ambiente: (galeria.find((g) => g.foto === capa.foto) || {}).ambiente || 'outro' }, ...resto].map((g) => `<figure data-amb="${esc(g.ambiente)}"><button type="button" data-ver="${g.foto}" aria-label="Ampliar: ${esc(g.legenda)}"><img src="${fotoUrl(g.foto)}" alt="${esc(g.legenda)}" loading="lazy" decoding="async" width="1280" height="853"></button><figcaption>${esc(g.legenda)}</figcaption></figure>`).join('')}</div>
  </section>
  ${p.perguntas ? `<section class="p-sec p-faq" aria-labelledby="faq"><h2 id="faq">Perguntas frequentes</h2>${p.perguntas.map((q) => `<details><summary>${esc(q.pergunta)}</summary><p>${esc(q.resposta)}</p></details>`).join('')}</section>` : ''}
</div>
<aside class="p-lado" aria-label="Valor e contato">
  <div class="p-lado-caixa">
    <p class="p-lado-rot">Valor de venda</p>
    <p class="p-lado-preco${reservado(im) ? ' p-lado-reservado' : ''}">${reservado(im) ? `<a href="/imoveis/signature/${esc(im.codigo.toLowerCase())}">${RESERVADO}</a>` : esc(valorTexto(im))}</p>
    ${im.valor_condominio || im.iptu ? `<p class="p-lado-taxas">${[im.valor_condominio ? `Condomínio ${esc(reais(im.valor_condominio))}/mês` : '', im.iptu ? `IPTU ${esc(reais(im.iptu))}/ano` : ''].filter(Boolean).join(' · ')}</p>` : ''}
    <a class="p-botao" href="#contato" data-contato="interesse">Tenho interesse</a>
    <a class="p-botao sec" href="#contato" data-contato="visita">Agendar visita</a>
    ${zap ? `<a class="p-botao zap" href="${esc(zap)}" target="_blank" rel="noopener">Falar no WhatsApp</a>` : ''}
    <div class="p-lado-acoes">
      <button class="p-link" type="button" data-fav="${esc(im.codigo)}" aria-pressed="false">Guardar nos favoritos</button>
      <button class="p-link" type="button" data-compartilhar="${esc(url)}" data-titulo="${esc(p.titulo)}">Compartilhar</button>
    </div>
    <p class="p-lado-corretor">${im.corretor ? `Corretor: <b>${esc(im.corretor.nome)}</b>` : `Atendimento: <b>Equipe ${esc(CLIENTE)}</b>`} · Cód. ${esc(im.codigo)}</p>
  </div>
</aside>
</div>
${formulario(im, p)}
${(() => { const ps = parecidos(x, lista); return ps.length ? `<section class="p-parecidos" aria-labelledby="parecidos"><h2 id="parecidos">Imóveis parecidos</h2><div class="p-grade">${ps.map((y) => cartao(y)).join('')}</div></section>` : ''; })()}
<div class="p-barra" aria-label="Contato rápido"><span class="p-barra-preco">${esc(reservado(im) ? `${CLIENTE} Signature` : valorTexto(im))}</span><a class="p-botao" href="#contato" data-contato="interesse">Tenho interesse</a>${zap ? `<a class="p-botao zap" href="${esc(zap)}" target="_blank" rel="noopener" aria-label="WhatsApp">WhatsApp</a>` : ''}</div>`;

  const titulo = `${(p.seo && p.seo.titulo) || p.titulo} · ${CLIENTE}`;
  const capaOg = og.metaFotoPortal(capa.foto);
  return casca(req, { titulo, descricao: p.resumo, caminho: `/imoveis/${p.slug}`, imagem: capaOg.caminho, imagemLargura: capaOg.largura, imagemAltura: capaOg.altura, imagemTipo: capaOg.tipo, ld, corpo, classe: 'p-pagina-imovel' });
}

function paginaNaoAchada(req) {
  return casca(req, {
    titulo: `Imóvel não encontrado · ${CLIENTE}`, descricao: 'Este imóvel não está mais à venda ou mudou de endereço.', caminho: req.path, semIndice: true,
    corpo: '<div class="p-vazio p-vazio-g"><h1>Este imóvel não está aqui</h1><p>Ele pode ter sido vendido, saído do ar ou mudado de endereço.</p><a class="p-botao" href="/imoveis">Ver os imóveis à venda</a></div>',
  });
}

module.exports = { reservado, paginaVitrine, paginaFavoritos, paginaImovel, paginaNaoAchada, urlBase, fotoUrl, GRUPOS, dataPorExtenso, cortar, casca, cartao, whatsapp };
