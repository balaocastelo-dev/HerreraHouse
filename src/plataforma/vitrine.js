// Domínio da plataforma (corretordofuturo.app): é a página de vendas do produto Herrera HOUSE IA,
// nunca o sistema nem o portal de um cliente. Nada de uma imobiliária específica aparece aqui:
// as telas são de uma imobiliária de demonstração ("Casa Prado", dados e fotos fictícios; scripts/demo-vitrine.js).
const path = require('path');
const express = require('express');
const cfg = require('../config');
// Telas, vídeo, CSS e JS da página de vendas saem daqui mesmo (nada depois deste middleware interfere, nem conta suspensa).
const estaticos = express.static(path.join(__dirname, '..', '..', 'public', 'plataforma'), { maxAge: '7d', fallthrough: true });

const HOSTS = new Set(String(process.env.PLATAFORMA_HOSTS || 'corretordofuturo.app,www.corretordofuturo.app')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
// Contato da plataforma (não é o da imobiliária cliente).
const EMAIL = process.env.PLATAFORMA_EMAIL || 'tiagaskan@gmail.com';
const WHATSAPP = String(process.env.PLATAFORMA_WHATSAPP || '5519984515960').replace(/\D/g, '');

// Entrada do sistema para as imobiliárias clientes (login). Só o sistema: nenhum portal/blog de cliente aparece aqui.
const APP_HOSTS = new Set(String(process.env.PLATAFORMA_APP_HOSTS || 'app.corretordofuturo.app')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
const APP_URL = process.env.PLATAFORMA_APP_URL || 'https://app.corretordofuturo.app/';
// Páginas públicas que são do cliente (portal, blog, bairros, condomínios): ficam no domínio dele, nunca na entrada da plataforma.
const PUBLICAS_DO_CLIENTE = /^\/(imoveis|blog|bairros|condominios)(\/|$)|^\/(llms\.txt|sitemap\.xml|feed|rss)/;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const telBonito = (n) => { const m = n.match(/^55(\d{2})(\d{4,5})(\d{4})$/); return m ? `(${m[1]}) ${m[2]}-${m[3]}` : n; };
const T = '/plataforma/telas/';
const F = '/plataforma/fotos/';
// "signature" sempre em minúsculo, em caligrafia dourada (pedido do Thiago).
const CAL = '<span class="cal">signature</span>';

// Simulações do portal (não são capturas): montadas aqui com fotos ilustrativas geradas por IA (Flux, RTX 4090).
const MV_CARDS = [
  ['ap-sala', 'R$ 1.290.000', 'Apartamento · Cambuí', '118 m² · 3 quartos · 2 vagas'],
  ['casa-fachada', 'R$ 2.380.000', 'Casa em condomínio · Alphaville', '320 m² · 4 quartos · 4 vagas'],
  ['cob-terraco', 'R$ 3.450.000', 'Cobertura · Cambuí', '236 m² · 4 quartos · 3 vagas'],
  ['casa-piscina', 'R$ 2.950.000', 'Casa em condomínio · Sousas', '380 m² · 4 suítes · 4 vagas'],
  ['ap-varanda', 'R$ 780.000', 'Apartamento · Taquaral', '96 m² · 3 quartos · 2 vagas'],
  ['casa-terrea', 'R$ 1.890.000', 'Casa · Nova Campinas', '290 m² · 4 quartos · 3 vagas'],
];
function mockVitrine() {
  return `<div class="mock mv" role="img" aria-label="Simulação da Vitrine: busca com filtros e imóveis em cartões com foto, valor e ficha">
    <div class="mv-topo"><b>Casa Prado</b><span>Imóveis</span><span>Revista</span>${CAL}<span class="mv-fav">♡ Favoritos</span></div>
    <div class="mv-hero"><img src="${F}sig1-fachada.webp" alt="" loading="lazy"><div><b>Imóveis à venda em Campinas</b><span>15 imóveis com fotos, ficha completa e uma página para cada um</span></div></div>
    <div class="mv-busca"><span>Apartamento ▾</span><span>Cambuí ▾</span><span>3+ quartos ▾</span><span>Até R$ 1,5 mi ▾</span><em>Buscar</em></div>
    <div class="mv-grade">${MV_CARDS.map(([f, v, t, d]) => `<div class="mv-card"><img src="${F}${f}.webp" alt="" loading="lazy"><div><b>${v}</b><i>${t}</i><small>${d}</small></div></div>`).join('')}</div>
  </div>`;
}
function mockRevista() {
  return `<div class="mock mr" role="img" aria-label="Simulação da Revista: capa com o imóvel mais fotogênico, ensaio sobre morar bem e imóveis entre os textos">
    <div class="mr-capa"><img src="${F}sig1-sala.webp" alt="" loading="lazy">
      <div class="mr-mastro"><span>Revista</span><b>Casa Prado</b></div><span class="mr-ed">Edição de outubro · nº 10</span>
      <div class="mr-chamada"><small>Ensaio de abertura</small><b>A casa que respira</b><span>Luz, ar e tempo: o que se procura numa casa</span></div></div>
    <div class="mr-pag"><span class="mr-cap">02 · Altura</span><b class="mr-tit">Luz, altura e o horizonte como paisagem</b>
      <p>Morar no alto é trocar a rua pelo céu. A cidade vira desenho, o pôr do sol entra na sala e o silêncio sobe junto.</p>
      <img src="${F}cob-terraco.webp" alt="" loading="lazy"><span class="mr-leg">Cobertura no Cambuí · 4 quartos · terraço com vista</span>
      <p>Nos prédios mais novos, a varanda virou cômodo: cozinha, mesa e plantas, de frente para o horizonte.</p>
      <div class="mr-duo"><img src="${F}ap-varanda.webp" alt="" loading="lazy"><img src="${F}ap-cozinha.webp" alt="" loading="lazy"></div></div>
  </div>`;
}
function mockSignature(grande) {
  return `<div class="mock ms${grande ? ' ms-g' : ''}" role="img" aria-label="Simulação da linha signature: fundo escuro, caligrafia dourada e residências acima de dez milhões com valor só para membros">
    <img class="ms-fundo" src="${F}sig1-fachada.webp" alt="" loading="lazy">
    <div class="ms-topo"><b>Casa Prado</b>${CAL}<span class="ms-clube">Clube</span></div>
    <div class="ms-capa">${CAL}<b>Residências que não se anunciam</b><span>Uma seleção reservada acima de R$ 10 milhões</span><em>Solicitar acesso ao Clube</em></div>
    <div class="ms-lista">
      <div class="ms-item"><img src="${F}sig1-piscina.webp" alt="" loading="lazy"><div><i>Sousas</i><b>Casa contemporânea sobre o vale</b><small>1.450 m² · 6 suítes · borda infinita</small><span>◆ valor para membros</span></div></div>
      <div class="ms-item"><img src="${F}sig2-sala.webp" alt="" loading="lazy"><div><i>Alphaville</i><b>Casa à beira do lago</b><small>1.180 m² · 5 suítes · forno a lenha</small><span>◆ valor para membros</span></div></div>
      ${grande ? `<div class="ms-item"><img src="${F}sig3-terraco.webp" alt="" loading="lazy"><div><i>Cambuí</i><b>Cobertura com vista de 360°</b><small>680 m² · 4 suítes · piscina no terraço</small><span>◆ valor para membros</span></div></div>
      <div class="ms-item"><img src="${F}sig4-sede.webp" alt="" loading="lazy"><div><i>Joaquim Egídio</i><b>Fazenda histórica restaurada</b><small>48 hectares · sede colonial · lago</small><span>◆ valor para membros</span></div></div>` : ''}
    </div>
  </div>`;
}


// Imobiliárias de demonstração no ar na plataforma (portais reais, imóveis e fotos ilustrativas).
// Capturas em /plataforma/clientes/<slug>-{d,r,s}.webp (navegador) e <slug>-m.webp (celular), tiradas dos portais no ar.
// São imobiliárias fictícias (decisão do Thiago, 28/10/2026): nunca apresentar como clientes.
const CLIENTES = [
  { slug: 'ondemorar', nome: 'Onde morar?', cor: '#3D7BFF', cor2: '#FF6B4A', estilo: 'Alegre e colorida', frase: 'Para quem procura a primeira casa: cores vivas, alfinete no mapa e tudo explicado sem pressa.', lugar: 'Lagoa do Taquaral', fonte: 'Fredoka' },
  { slug: 'cademeuap', nome: 'Cadê meu AP?', cor: '#0E8C8C', cor2: '#FF6B4A', estilo: 'Apartamentos, direto ao ponto', frase: 'Especialista em apartamento na cidade: prédio com lupa, verde-azulado e coral, busca rápida.', lugar: 'Prédios do Centro e do Cambuí', fonte: 'Outfit' },
  { slug: 'casaprado', nome: 'Casa Prado', cor: '#2F5D46', cor2: '#A8843F', estilo: 'Clássica e acolhedora', frase: 'Casas, condomínios e campo: serifa elegante, verde e trigo, o jeito de uma imobiliária de família.', lugar: 'Bosque dos Jequitibás', fonte: 'Fraunces' },
  { slug: 'lumen', nome: 'Lumen', cor: '#A88440', cor2: '#141414', estilo: 'Alto padrão', frase: 'Preto, marfim e dourado, letra fina e espaçada: uma butique para residências de luxo.', lugar: 'Campinas à noite', fonte: 'Josefin Sans' },
];
const C = '/plataforma/clientes/';
const VERSOES_AV = [['d', 'Vitrine', '/imoveis'], ['r', 'Revista', '/imoveis/revista'], ['s', 'signature', '/imoveis/signature']];
const linkCliente = (c, cam = '/imoveis') => `https://${c.slug}.corretordofuturo.app${cam}`;

function aoVivo() {
  const abas = CLIENTES.map((c, i) => `<button type="button" class="av-aba${i ? '' : ' ativa'}" role="tab" id="av-aba-${c.slug}" aria-controls="av-${c.slug}" aria-selected="${!i}" tabindex="${i ? -1 : 0}" style="--c:${c.cor}"><span class="av-placa"><img src="${C}logo-${c.slug}.svg" alt="${esc(c.nome)}" width="186" height="50"></span><i class="av-barra" aria-hidden="true"></i></button>`).join('');
  const paineis = CLIENTES.map((c, i) => {
    const vers = VERSOES_AV.map(([k, n], j) => `<button type="button" class="av-ver${j ? '' : ' ativa'}" data-v="${k}" data-cam="${VERSOES_AV[j][2]}" aria-pressed="${!j}">${k === 's' ? CAL : esc(n)}</button>`).join('');
    const imgs = VERSOES_AV.map(([k, n], j) => `<img class="av-img${j ? '' : ' ativa'}" data-v="${k}" src="${C}${c.slug}-${k}-m.webp" srcset="${C}${c.slug}-${k}-m.webp 1440w, ${C}${c.slug}-${k}.webp 2880w" sizes="(max-width: 1240px) 100vw, 860px" width="2880" height="1800" alt="${esc(`Portal ${c.nome} no ar, versão ${n}`)}" loading="lazy" decoding="async">`).join('');
    return `<div class="av-painel${i ? '' : ' ativo'}" role="tabpanel" id="av-${c.slug}" aria-labelledby="av-aba-${c.slug}" style="--c:${c.cor};--c2:${c.cor2}">
      <div class="av-palco">
        <div class="janela av-janela"><div class="janela-barra" aria-hidden="true"><i></i><i></i><i></i><span class="av-url">${ICONE.cadeado} ${c.slug}.corretordofuturo.app<em>/imoveis</em></span></div><div class="av-imgs">${imgs}</div></div>
        <figure class="av-cel" aria-hidden="true"><img src="${C}${c.slug}-m.webp" width="780" height="1688" alt="" loading="lazy" decoding="async"></figure>
        <span class="av-aovivo"><i></i>no ar agora</span>
      </div>
      <div class="av-info">
        <h3>${esc(c.nome)}</h3>
        <p><b class="av-estilo">${esc(c.estilo)}.</b> ${esc(c.frase)}</p>
        <div class="av-vers" role="group" aria-label="Versão do portal">${vers}</div>
        <dl class="av-ficha"><div><dt>Endereço</dt><dd>${c.slug}<wbr>.corretordofuturo.app</dd></div><div><dt>Letra</dt><dd>${esc(c.fonte)}</dd></div><div><dt>Capa</dt><dd>${esc(c.lugar)}, em 4K</dd></div></dl>
        <div class="av-acoes"><a class="btn pri av-abrir" href="${linkCliente(c)}" target="_blank" rel="noopener">Abrir o portal ao vivo ${ICONE.seta}</a><a class="btn" href="${linkCliente(c, '/blog')}" target="_blank" rel="noopener">Blog</a><a class="btn" href="${linkCliente(c, '/bairros')}" target="_blank" rel="noopener">Bairros</a></div>
      </div>
    </div>`;
  }).join('\n    ');
  return `<section id="ao-vivo" class="escuro ao-vivo" aria-labelledby="t-av"><div class="cx">
  <h2 id="t-av">Quatro imobiliárias de demonstração no ar. <em>Entre e navegue.</em></h2>
  <p class="lead">Criamos quatro imobiliárias fictícias para você ver o sistema funcionando de verdade. Mesmo sistema, quatro marcas que não se parecem em nada: logo, cores, letra e foto de capa próprias, cada uma no seu endereço. Clique, abra o portal e mexa à vontade, do celular ou do computador.</p>
  <div class="av-abas" role="tablist" aria-label="Imobiliárias de demonstração">${abas}</div>
  <div class="av-paineis">
    ${paineis}
  </div>
  <p class="demo-aviso">Imobiliárias fictícias criadas para demonstração, com imóveis e fotos ilustrativas, rodando no mesmo sistema que a sua vai usar.</p>

  <div class="av-proxima revelar">
    <div><h3>Como fica o endereço da sua imobiliária?</h3>
      <p>Digite o nome e veja. Em poucos dias, o portal, o blog e os guias de bairro estão no ar com a sua marca.</p></div>
    <form class="av-nome" autocomplete="off">
      <label for="av-input" class="vis-oculto">Nome da sua imobiliária</label>
      <input id="av-input" name="nome" maxlength="40" placeholder="Nome da sua imobiliária" enterkeyhint="go">
      <p class="av-dominio" aria-live="polite"><span class="av-cad">${ICONE.cadeado}</span><b id="av-slug">suaimobiliaria</b><wbr>.corretordofuturo.app</p>
      <button class="btn ouro" type="submit">Quero esse endereço</button>
    </form>
  </div>
</div></section>`;
}

// Uma captura de tela numa moldura de navegador. `nome` = arquivo em /plataforma/telas (há a versão inteira e a "-m", com metade da largura).
// Telas refeitas ganham ?v= para o navegador não mostrar a versão antiga guardada.
const TELA_VERSAO = { escritorio: 2, agente: 2 };
function janela(nome, alt, { url = 'app.corretordofuturo.app', w = 2880, h = 1800, lazy = true } = {}) {
  const v = TELA_VERSAO[nome] ? `?v=${TELA_VERSAO[nome]}` : '';
  return `<div class="janela"><div class="janela-barra" aria-hidden="true"><i></i><i></i><i></i><span>${esc(url)}</span></div>`
    + `<img src="${T}${nome}-m.webp${v}" srcset="${T}${nome}-m.webp${v} 1440w, ${T}${nome}.webp${v} 2880w" sizes="(max-width: 1240px) 100vw, 1200px" width="${w}" height="${h}" alt="${esc(alt)}"${lazy ? ' loading="lazy"' : ''} decoding="async"></div>`;
}

// Cômodos da planta = partes do sistema. x, y, w, h na planta (viewBox 600 x 470).
const COMODOS = [
  { k: 'captacao', nome: 'Radar de captação', x: 20, y: 20, w: 200, h: 150, area: 'anúncios e donos', ir: '#radar',
    texto: 'Os anúncios da região chegam organizados por bairro, rua e prédio. A leitura da base aponta queda de preço, anúncio novo, imóvel encalhado e venda direta do dono, e o sistema localiza o proprietário com um clique.' },
  { k: 'carteira', nome: 'Carteira', x: 220, y: 20, w: 180, h: 150, area: 'seus imóveis', ir: '#operacao',
    texto: 'Cada imóvel anda pelas etapas, do dono localizado até vendido. A ficha mostra o que falta, guarda fotos e documentos e gera a autorização de venda com assinatura eletrônica.' },
  { k: 'painel', nome: 'Painel', x: 400, y: 20, w: 180, h: 110, area: 'o dia de hoje', ir: '#painel',
    texto: 'Os números do negócio e o que precisa de você hoje: cliente esperando resposta, visita sem confirmar, autorização parada, imóvel sem foto.' },
  { k: 'condominios', nome: 'Condomínios 3D', x: 400, y: 130, w: 180, h: 140, area: 'prédios e entorno', ir: '#condominios',
    texto: 'Os prédios e condomínios da cidade com andares, unidades, preço do metro e o que tem perto. Mostre ao cliente o andar do apartamento e a vista em 3D.' },
  { k: 'escritorio', nome: 'Escritório virtual', x: 20, y: 170, w: 230, h: 140, area: 'agentes de IA', ir: '#ia',
    texto: 'Nove agentes de inteligência artificial no WhatsApp, cada um num setor. Respondem, qualificam, marcam visitas e chamam o corretor. Por padrão, sugerem a resposta e esperam a sua aprovação.' },
  { k: 'crm', nome: 'CRM e visitas', x: 250, y: 170, w: 150, h: 140, area: 'clientes', ir: '#operacao',
    texto: 'Funil de vendas, histórico de cada cliente, cruzamento entre o que o comprador procura e os imóveis da carteira, e a agenda de visitas da equipe.' },
  { k: 'portal', nome: 'Portal e signature', x: 20, y: 310, w: 190, h: 110, area: 'sua vitrine', ir: '#portal',
    texto: 'Uma vitrine com a sua marca e no seu domínio, em três versões: Vitrine, Revista e signature, a linha reservada para imóveis acima de R$ 10 milhões.' },
  { k: 'blog', nome: 'Blog e bairros', x: 210, y: 310, w: 190, h: 110, area: 'Google e IAs', ir: '#conteudo',
    texto: 'Textos publicados sozinhos e um guia para cada bairro onde você atua, feitos para o seu nome aparecer quando alguém pesquisa a região, no Google ou numa IA.' },
];

function plantaSvg() {
  const sala = (c) => {
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    return `<g class="comodo" data-comodo="${c.k}" role="button" tabindex="0" aria-pressed="false">
  <rect x="${c.x + 4}" y="${c.y + 4}" width="${c.w - 8}" height="${c.h - 8}" rx="2"/>
  <text x="${cx}" y="${cy - 2}" text-anchor="middle">${esc(c.nome)}</text>
  <text class="area" x="${cx}" y="${cy + 16}" text-anchor="middle">${esc(c.area)}</text></g>`;
  };
  return `<svg class="planta" viewBox="0 0 600 470" role="group" aria-label="Planta do sistema: cada cômodo é uma parte do Herrera HOUSE IA">
  <g class="divisoria-g"><path class="divisoria" d="M220 20V170 M400 20V420 M400 130H580 M20 170H400 M250 170V310 M20 310H400 M210 310V420 M400 270H580"/></g>
  <path class="parede" d="M20 20H580V420H20Z"/>
  <line class="vao" x1="140" y1="170" x2="176" y2="170"/><path class="porta" d="M140 170A36 36 0 0 1 176 206"/>
  <line class="vao" x1="300" y1="170" x2="336" y2="170"/><path class="porta" d="M336 170A36 36 0 0 0 300 134"/>
  <line class="vao" x1="400" y1="200" x2="400" y2="236"/><path class="porta" d="M400 236A36 36 0 0 1 436 200"/>
  <line class="vao" x1="90" y1="310" x2="126" y2="310"/><path class="porta" d="M126 310A36 36 0 0 0 90 274"/>
  <line class="vao" x1="290" y1="310" x2="326" y2="310"/><path class="porta" d="M290 310A36 36 0 0 1 326 346"/>
  <line class="vao" x1="472" y1="420" x2="520" y2="420"/><path class="porta" d="M472 420A48 48 0 0 1 520 372"/>
  ${COMODOS.map(sala).join('\n  ')}
  <g class="comodo entrada" data-comodo="entrada" role="button" tabindex="0">
    <rect x="404" y="274" width="172" height="142" rx="2"/>
    <text x="490" y="338" text-anchor="middle">Entrada</text>
    <text class="area" x="490" y="356" text-anchor="middle">fale com a gente</text></g>
  <path class="cota" d="M20 446H580 M20 440V452 M580 440V452"/>
  <text class="cota-txt" x="300" y="463" text-anchor="middle">tudo num sistema só</text>
</svg>`;
}

// Números da plataforma (base comum de Campinas), não de um cliente.
const NUMEROS = [
  [4691, '', 'condomínios e prédios de Campinas, com andares e unidades'],
  [923, ' mil', 'construções da cidade no 3D'],
  [92, ' mil', 'anúncios de Campinas lidos e organizados, a primeira cidade da base'],
  [9, '', 'agentes de inteligência artificial no WhatsApp'],
  [53, '', 'guias de bairro escritos para o Google e as IAs'],
  [3, '', 'versões do seu portal: Vitrine, Revista e signature'],
];

// O escritório virtual: os nove agentes (nomes e limites editáveis em cada imobiliária).
const AGENTES = [
  ['captador', 'TH-IA-GO', 'Captação', 'Acha o dono do imóvel anunciado, conversa, pede as fotos originais e a autorização.', '#5fd4bf'],
  ['apartamentos', 'Ana', 'Apartamentos', 'Responde quem procura apartamento, entende o perfil e marca a visita.', '#7fb4ff'],
  ['casas', 'Clara', 'Casas', 'Atende casas e casas em condomínio até R$ 2 milhões, com fotos e link do imóvel.', '#ffb38a'],
  ['alto-padrao', 'Helena', 'Alto padrão', 'Cuida de casas acima de R$ 2 milhões e apartamentos acima de R$ 3 milhões, com o tom certo.', '#d8b26a'],
  ['offmarket', 'Vicente', 'Off-market', 'Oferece imóveis fora do mercado só por link privado, sempre com a sua aprovação.', '#c9a0ff'],
  ['comerciais', 'Bruno', 'Galpões e salas', 'Atende empresas: salas, lojas e barracões, com metragem e vagas na ponta da língua.', '#9be37a'],
  ['terrenos', 'Teo', 'Terrenos', 'Responde sobre lotes e terrenos, zoneamento e condomínios fechados.', '#e3d47a'],
  ['gerente', 'Augusto', 'Gerente do dono', 'Manda o resumo das 8h e o relatório das 19h, e avisa o dono do que importa.', '#ff8a8a'],
  ['gerente-corretores', 'Marta', 'Gerente dos corretores', 'Passa a agenda do dia, lembra a visita 60 minutos antes e cobra o que venceu.', '#8ae0ff'],
];

// Capturas de operação (aba por tela), da imobiliária de demonstração.
const OPERACAO = [
  { k: 'carteira', nome: 'Carteira', alt: 'Carteira de imóveis com as etapas, do dono localizado ao vendido, e a ficha de cada imóvel', legenda: 'Cada imóvel numa etapa, com o dono, o corretor e quanto da ficha está completa.' },
  { k: 'ficha', nome: 'Ficha do imóvel', alt: 'Ficha de um apartamento com as fotos, a etapa, o proprietário e o que falta completar', legenda: 'A ficha mostra a etapa do imóvel, as fotos, o proprietário e o que falta para publicar.' },
  { k: 'crm', nome: 'CRM', alt: 'Funil de vendas com clientes nas etapas novo, qualificado, visita, proposta e escritura', legenda: 'O funil de vendas: de onde veio cada cliente, o que procura e quanto pode pagar.' },
  { k: 'visitas', nome: 'Visitas', alt: 'Agenda de visitas com horários, imóveis, clientes e corretores', legenda: 'A agenda de visitas da equipe, com a avaliação de cada cliente.' },
  { k: 'agente', nome: 'Mesa do agente', alt: 'Mesa de um agente de IA com as conversas do dia e as respostas para aprovar', legenda: 'A mesa de cada agente: conversas, respostas esperando aprovação e o que ele já resolveu.' },
];

const PERGUNTAS = [
  ['Preciso trocar o meu site?', 'Não. O portal e o blog ficam no seu domínio, com a sua marca. Se ainda não tiver um domínio, a gente ajuda a registrar.'],
  ['Os dados da minha carteira são só meus?', 'Sim. Imóveis, clientes, proprietários e conversas de cada corretor ou imobiliária ficam separados e ninguém mais vê. A base de anúncios, prédios e bairros da região é a parte comum.'],
  ['A inteligência artificial manda mensagem sem eu ver?', 'Por padrão, não: o agente sugere a resposta e você aprova antes de enviar. Você escolhe quais agentes podem responder sozinhos.'],
  ['De onde vem o 3D dos prédios?', 'De bases públicas de mapas e do Censo do IBGE, com a altura de cada prédio e o número de andares. O sistema destaca o andar do apartamento e mostra o entorno, de dia e de noite.'],
  ['O que é a @SIG@?', 'Uma versão reservada do seu portal para imóveis acima de R$ 10 milhões: poucas fotos, texto discreto e valores só para quem entra no Clube @SIG@, que vira cliente quente no seu CRM.'],
  ['Funciona na minha cidade?', 'Sim. O sistema atende imobiliárias e corretores de todo o Brasil pela internet. A base de mercado (anúncios, prédios em 3D e guias de bairro) começou por Campinas (SP) e ganha novas cidades com o tempo, conforme chegam clientes em cada região. Fale com a gente para saber como está a sua cidade.'],
  ['O sistema é ligado a algum portal?', 'Não. O Herrera HOUSE IA é um software independente, sem vínculo com portais de anúncios nem com bases de dados de terceiros. Usa anúncios publicados abertamente, dados públicos oficiais e os serviços que a própria imobiliária contrata, na conta dela. Veja de onde vem cada dado na página Sobre nós.'],
  ['Preciso de um número de WhatsApp para cada agente?', 'Não para começar. Dá para iniciar com um número e separar os agentes depois, conforme o movimento crescer.'],
  ['Quanto custa?', 'Há planos para corretor autônomo e para imobiliária. Fale com a gente e montamos a proposta para o seu tamanho.'],
];

const ICONE = {
  seta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>',
  cadeado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  queda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 7 7 7 4-4 7 7"/><path d="M21 11v6h-6"/></svg>',
  novo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
  abaixo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16M7 16V9M12 16V5M17 16v-3"/></svg>',
  dono: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  tempo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9"/></svg>',
  varios: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="12" height="12" rx="2"/><path d="M9 3h10a2 2 0 0 1 2 2v10"/></svg>',

  olho: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  pena: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 4c-8 0-14 6-14 14v2h2c8 0 14-6 14-14V4Z"/><path d="M4 20 14 10"/></svg>',
  balao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 10h8M8 13h5"/></svg>',
  relogio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  lupa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/></svg>',
  chave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l2 2M15 8l2 2"/></svg>',
};

// Topo e rodapé comuns à página de vendas e às páginas Sobre nós, Termos e Privacidade (src/plataforma/legal.js).
function topo({ inicio = '' } = {}) {
  const nome = esc(cfg.SISTEMA_NOME);
  return `<header class="topo"><div class="cx">
  <a class="marca" href="/" aria-label="${nome}, início"><svg viewBox="0 0 26 26" aria-hidden="true"><path d="M3 12 13 4l10 8v11H3Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M10 23v-7h6v7" fill="none" stroke="currentColor" stroke-width="2"/></svg>${nome}</a>
  <nav aria-label="Seções"><a class="sec" href="${inicio}#ao-vivo">Ao vivo</a><a class="sec" href="${inicio}#ia">Inteligência artificial</a><a class="sec" href="${inicio}#radar">Radar</a><a class="sec" href="${inicio}#condominios">3D</a><a class="sec" href="${inicio}#portal">Portal e ${CAL}</a><a class="sec" href="/sobre">Sobre nós</a><a class="entrar" href="${APP_URL}">Entrar</a><a class="btn pri" href="${inicio}#contato">Fale com a gente</a></nav>
</div></header>`;
}
function rodape() {
  const nome = esc(cfg.SISTEMA_NOME), email = esc(EMAIL);
  return `<footer class="rodape"><div class="cx"><span>${nome} · software independente, sem vínculo com portais de anúncios · <a href="${APP_URL}">Entrar no sistema</a></span>
  <nav class="rodape-links" aria-label="Institucional"><a href="/sobre">Sobre nós</a><a href="/termos">Termos de uso</a><a href="/privacidade">Privacidade e LGPD</a><a href="/privacidade#pedido">Seus dados</a></nav>
  <span>Telas de demonstração com dados fictícios · © <span id="ano">${new Date().getFullYear()}</span> · <a href="mailto:${email}">${email}</a></span></div></footer>`;
}

function pagina() {
  const nome = esc(cfg.SISTEMA_NOME);
  const email = esc(EMAIL);
  const wa = esc(WHATSAPP);
  const ld = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: cfg.SISTEMA_NOME, applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
    description: 'Sistema imobiliário com inteligência artificial para corretores e imobiliárias: radar de captação, condomínios em 3D, carteira, CRM, nove agentes de IA no WhatsApp, portal com linha signature e blog próprios.',
    url: 'https://corretordofuturo.app/', inLanguage: 'pt-BR', image: 'https://corretordofuturo.app/plataforma/telas/3d-noite.webp' };
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: PERGUNTAS.map(([q, a]) => ({ '@type': 'Question', name: q.replace(/@SIG@/g, 'signature'), acceptedAnswer: { '@type': 'Answer', text: a.replace(/@SIG@/g, 'signature') } })) };
  const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${nome} · o sistema imobiliário com inteligência artificial</title>
<meta name="description" content="Radar de captação, condomínios em 3D, nove agentes de IA no WhatsApp, carteira, CRM, portal com a linha signature e blog com a sua marca. Para corretores e imobiliárias.">
<link rel="canonical" href="https://corretordofuturo.app/">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest">
<meta property="og:site_name" content="${nome}"><meta property="og:locale" content="pt_BR"><meta property="og:title" content="${nome} · o corretor do futuro já tem escritório"><meta property="og:description" content="O sistema imobiliário com inteligência artificial: 3D dos prédios, radar de captação, agentes no WhatsApp e portal com a sua marca."><meta property="og:url" content="https://corretordofuturo.app/"><meta property="og:type" content="website"><meta property="og:image" content="https://corretordofuturo.app/plataforma/telas/3d-noite.webp"><meta property="og:image:secure_url" content="https://corretordofuturo.app/plataforma/telas/3d-noite.webp"><meta property="og:image:type" content="image/webp"><meta property="og:image:width" content="2880"><meta property="og:image:height" content="1800"><meta property="og:image:alt" content="Prédio em 3D à noite, com o andar do apartamento destacado em dourado"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${nome} · o corretor do futuro já tem escritório"><meta name="twitter:description" content="O sistema imobiliário com inteligência artificial: 3D dos prédios, radar de captação, agentes no WhatsApp e portal com a sua marca."><meta name="twitter:image" content="https://corretordofuturo.app/plataforma/telas/3d-noite.webp"><meta name="twitter:image:alt" content="Prédio em 3D à noite, com o andar do apartamento destacado em dourado">
<meta name="theme-color" content="#070b0f">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Cormorant+Garamond:ital,wght@1,600&family=Pinyon+Script&family=IBM+Plex+Sans:wght@400;600&display=swap">
<link rel="stylesheet" href="/plataforma/site.css?v=8">
<link rel="preload" as="image" href="${T}3d-poster.webp?v=5">
<link rel="preload" as="image" href="${C}ondemorar-d-m.webp">
<script type="application/ld+json">${json(ld)}</script><script type="application/ld+json">${json(faq)}</script>
</head><body>
${topo()}

<main>
<div class="escuro abre"><div class="cx">
  <div class="abre-grade">
    <div>
      <h1>O corretor do futuro já tem <em>escritório</em>.</h1>
      <p class="sub">Nove agentes de IA atendendo no WhatsApp, um radar que lê os anúncios da cidade e acha o dono, os prédios em 3D com o andar do apartamento e um portal com a sua marca, da Vitrine à ${CAL}.</p>
      <div class="acoes"><a class="btn pri" href="#contato">Quero ver funcionando</a><a class="btn" href="#ao-vivo">Ver imobiliárias ao vivo</a></div>
      <a class="no-ar" href="#ao-vivo"><span class="no-ar-t"><i></i>Veja ao vivo</span>${CLIENTES.map((c) => `<span class="no-ar-ic"><img src="${C}icone-${c.slug}.svg" alt="${esc(c.nome)}" width="34" height="34"></span>`).join('')}<span class="no-ar-m">4 portais de demonstração ${ICONE.seta}</span></a>
      <div class="selo"><span>Para corretor e imobiliária</span><span>Sua marca, seu domínio</span><span>Computador, tablet e celular</span></div>
    </div>
    <div class="palco">
      <div class="palco-tela">
        <video muted loop playsinline preload="none" poster="${T}3d-poster.webp?v=5" data-webm="${T}3d.webm?v=5" data-mp4="${T}3d.mp4?v=5" aria-label="Prédio em 3D girando, com o andar do apartamento destacado em dourado"></video>
        <button type="button" class="palco-play" hidden>Ver o prédio em movimento</button>
        <div class="palco-legenda"><b>Condomínio em 3D</b><span>o andar do apartamento em dourado, o entorno de verdade</span></div>
      </div>
      <div class="palco-flutuas">
        <div class="flutua f1"><b><span class="ponto" style="background:#3ddc84"></span>Ana · Apartamentos</b><i>Respondeu a Larissa e marcou a visita de sábado, 10h.</i></div>
        <div class="flutua f2"><b>Leitura da base</b><i>Um 3 dormitórios no Cambuí baixou 9% e está abaixo do m² do bairro.</i></div>
        <div class="flutua f3"><b>Proprietário localizado</b><i>O robô de captação já mandou a primeira mensagem.</i></div>
      </div>
    </div>
  </div>
  <ul class="numeros" aria-label="O sistema em números">
    ${NUMEROS.map(([n, suf, txt]) => `<li><strong data-conta="${n}" data-suf="${esc(suf)}">${n.toLocaleString('pt-BR')}${esc(suf)}</strong><span>${esc(txt)}</span></li>`).join('')}
  </ul>
  <div class="brasil revelar">
    <p class="brasil-t"><b>Brasil inteiro.</b> Atendemos imobiliárias de todo o país. A base começou por Campinas e ganha novas cidades com o tempo, rumo a <strong>cerca de <span data-conta="3" data-suf=" milhões">3 milhões</span> de imóveis</strong> no Brasil.</p>
    <p class="brasil-nota">Estimativa: os três maiores portais do país somam cerca de 7 milhões de anúncios (Grupo OLX, outubro de 2026). Na base de Campinas, 58% dos anúncios eram o mesmo imóvel anunciado por mais de uma imobiliária, o que dá algo perto de 3 milhões de imóveis diferentes.</p>
  </div>
</div></div>

${aoVivo()}

<section id="ia" class="escuro ia" aria-labelledby="t-ia"><div class="cx">
  <h2 id="t-ia">Nove agentes que não tiram férias, nem folga no domingo.</h2>
  <p class="lead">Cada agente cuida de um setor do escritório e conversa pelo WhatsApp. Eles respondem na hora, entendem o que o cliente procura, mandam o imóvel certo, marcam a visita e chamam o corretor quando é a vez dele. Você decide quem responde sozinho e quem sugere a resposta para você aprovar.</p>
  <ul class="agentes revelar">
    ${AGENTES.map(([slug, n, setor, txt, cor]) => `<li class="agente"><span class="avatar com-foto" style="--c:${cor}" aria-hidden="true"><img src="/plataforma/agentes/${slug}.jpg" alt="" width="68" height="68" loading="lazy" decoding="async"></span><div><h3>${esc(n)}</h3><span class="setor">${esc(setor)}</span><p>${esc(txt)}</p></div></li>`).join('\n    ')}
  </ul>

  <div class="duas bloco-ia">
    <figure class="revelar">${janela('escritorio', 'Escritório virtual com os agentes nas salas de captação, vendas e diretoria, o movimento do dia e as respostas para aprovar', { url: 'app.corretordofuturo.app/#/whats' })}
      <figcaption>O escritório virtual: cada agente na sua sala, o que aconteceu hoje e o que espera a sua aprovação.</figcaption></figure>
    <div class="chat revelar" aria-label="Exemplo de conversa com um agente">
      <div class="chat-topo"><span class="avatar com-foto" style="--c:#7fb4ff" aria-hidden="true"><img src="/plataforma/agentes/apartamentos.jpg" alt="" width="38" height="38"></span><div><b>Ana · Apartamentos</b>WhatsApp da imobiliária</div></div>
      <p class="msg ent">Oi! Vi o apartamento de 3 quartos no Cambuí no site. Aceita financiamento?</p>
      <p class="msg sug">Oi, Larissa! Aceita sim. São 118 m², 3 quartos e 2 vagas. Quer que eu simule as parcelas ou prefere visitar no sábado?<small>Resposta sugerida pela Ana · esperando aprovação</small></p>
      <div class="chat-acoes"><span>Editar</span><span class="ok">Aprovar e enviar</span></div>
      <p class="msg ent">Quero visitar no sábado de manhã.</p>
      <p class="msg sai">Combinado: sábado às 10h. A Patrícia te encontra na portaria. 😊<small>Visita na agenda · Marta avisou a corretora</small></p>
    </div>
  </div>

  <ul class="ia-faz">
    <li><h3>${ICONE.lupa}Lê a cidade inteira</h3><p>Os anúncios da região passam por uma leitura que aponta queda de preço, imóvel novo, encalhado, abaixo do metro do bairro e venda direta do dono, e explica cada sinal.</p></li>
    <li><h3>${ICONE.olho}Vê as fotos e escreve</h3><p>A IA olha cada foto do imóvel, reconhece os ambientes e escreve a página do portal a partir das fotos e da ficha, com legenda em cada imagem.</p></li>
    <li><h3>${ICONE.pena}Publica sozinha</h3><p>O blog ganha textos novos todos os dias e cada bairro tem o seu guia, para a sua imobiliária aparecer no Google e nas respostas das IAs.</p></li>
    <li><h3>${ICONE.chave}Capta com você</h3><p>O robô de captação fala com o dono do imóvel anunciado, pede as fotos originais e a autorização, e entrega o imóvel na carteira.</p></li>
    <li><h3>${ICONE.relogio}Cuida da agenda</h3><p>A Marta passa a agenda do dia aos corretores, lembra a visita uma hora antes e cobra o que ficou para trás.</p></li>
    <li><h3>${ICONE.balao}Presta contas ao dono</h3><p>O Augusto manda o resumo da manhã e o relatório da noite: clientes novos, visitas, propostas e o que precisa de decisão.</p></li>
  </ul>
</div></section>

<section id="radar" class="claro" aria-labelledby="t-radar"><div class="cx">
  <h2 id="t-radar">Os imóveis da cidade, lidos e prontos para captar.</h2>
  <p class="lead">Dezenas de milhares de anúncios da região num mapa só, por bairro, rua e prédio. O sistema junta o mesmo imóvel anunciado por várias imobiliárias, compara com o preço do metro do bairro e mostra onde está a oportunidade.</p>
  <ul class="sinais" aria-label="Sinais que a leitura aponta">
    <li class="s-q">${ICONE.queda}<b>Baixou o preço</b></li><li class="s-n">${ICONE.novo}<b>Anúncio novo</b></li><li class="s-a">${ICONE.abaixo}<b>Abaixo do m² do bairro</b></li>
    <li class="s-p">${ICONE.dono}<b>Dono anuncia direto</b></li><li class="s-r">${ICONE.tempo}<b>Anunciado há muito tempo</b></li><li class="s-v">${ICONE.varios}<b>Várias imobiliárias</b></li>
  </ul>
  <figure class="revelar">${janela('radar-ia', 'Leitura da base com o mapa dos anúncios coloridos pela situação do proprietário, frases da IA e filtros por sinal', { url: 'app.corretordofuturo.app/#/radar' })}
    <figcaption>A leitura da base: cada ponto é um anúncio, a cor diz se o dono já foi achado e as frases levam direto aos filtros.</figcaption></figure>
  <ol class="fluxo">
    <li><h3>O anúncio aparece</h3><p>Entra na base com bairro, rua, prédio, preço e histórico.</p></li>
    <li><h3>A leitura aponta</h3><p>Baixou de preço, está abaixo do bairro, é do próprio dono.</p></li>
    <li><h3>Um clique localiza o dono</h3><p>Consulta com custo controlado e limite por dia.</p></li>
    <li><h3>O robô conversa</h3><p>O TH-IA-GO apresenta a imobiliária e pede as fotos originais.</p></li>
    <li><h3>Vira carteira</h3><p>O imóvel entra na carteira na etapa certa, pronto para a autorização.</p></li>
  </ol>
</div></section>

<section id="condominios" class="escuro c3d" aria-labelledby="t-3d"><div class="cx">
  <h2 id="t-3d">Mostre o andar, a vista e a vizinhança antes da visita.</h2>
  <p class="lead">Os prédios e condomínios da cidade com andares, torres e unidades. Abra o 3D, gire, veja o apartamento destacado no andar certo e troque o dia pela noite. A ficha do prédio traz o que está à venda, o preço do metro e o que tem perto.</p>
  <div class="c3d-grade">
    <figure class="revelar">${janela('3d-noite', 'Prédio em 3D à noite com as janelas acesas e o andar do apartamento destacado em dourado', { url: 'app.corretordofuturo.app/condominio-3d' })}
      <figcaption>À noite, com as janelas acesas: o andar do apartamento aparece em dourado.</figcaption></figure>
    <div class="c3d-lado">
      <figure class="revelar">${janela('3d-dia', 'O mesmo prédio em 3D durante o dia, com ruas, áreas verdes e a foto de satélite no chão', { url: 'app.corretordofuturo.app/condominio-3d' })}</figure>
      <figure class="revelar">${janela('cond-ficha', 'Ficha do condomínio com andares, unidades, preço do metro, imóveis à venda e o que tem perto', { url: 'app.corretordofuturo.app/#/condominios' })}</figure>
    </div>
  </div>
  <ul class="fatos">
    <li><strong>Andar por andar</strong><span>A unidade 182 acende no 18º andar, com a vista daquela altura.</span></li>
    <li><strong>Raio-X do prédio</strong><span>Andares, torres, unidades, taxa, IPTU e plantas mais comuns.</span></li>
    <li><strong>O que tem perto</strong><span>Escolas, parques, mercados e hospitais, com a distância a pé.</span></li>
    <li><strong>Prédio-alvo</strong><span>Marque prédios e seja avisado quando um apartamento entrar à venda.</span></li>
  </ul>
  <p class="demo-aviso">Telas de uma imobiliária de demonstração: nomes, imóveis e números fictícios.</p>
</div></section>

<section id="painel" class="claro" aria-labelledby="t-painel"><div class="cx">
  <h2 id="t-painel">O negócio inteiro numa tela, e o que precisa de você hoje.</h2>
  <p class="lead">Valor da carteira, vendas, clientes, visitas e captação, comparados com o período anterior. Em cima de tudo, a lista do que não pode esperar.</p>
  <div class="painel-cx revelar">
    ${janela('painel', 'Painel da imobiliária com a lista do que precisa de atenção, os números do negócio e os gráficos de clientes e visitas', { url: 'app.corretordofuturo.app/#/painel' })}
    <p class="marcador m1"><b>Precisa de atenção</b>Cliente esperando no WhatsApp, visita sem confirmar, autorização parada.</p>
    <p class="marcador m2"><b>Comparado ao mês anterior</b>Cada número mostra se subiu ou caiu.</p>
    <p class="marcador m3"><b>Funil e equipe</b>Do anúncio à venda, corretor por corretor.</p>
  </div>
</div></section>

<section id="operacao" class="claro" aria-labelledby="t-op"><div class="cx">
  <h2 id="t-op">Carteira, ficha, CRM e visitas, conversando entre si.</h2>
  <p class="lead">O anúncio captado vira imóvel na carteira, o imóvel vira página no portal, quem pergunta pelo portal vira cliente no CRM e é atendido pelos agentes no WhatsApp.</p>
  <div class="telas" data-abas>
    <div class="abas" role="tablist" aria-label="Telas do sistema">
      ${OPERACAO.map((t, i) => `<button type="button" role="tab" id="aba-${t.k}" aria-controls="tela-${t.k}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(t.nome)}</button>`).join('')}
    </div>
    ${OPERACAO.map((t, i) => `<div class="painelaba" role="tabpanel" id="tela-${t.k}" aria-labelledby="aba-${t.k}"${i === 0 ? '' : ' hidden'}><figure>${janela(t.k, t.alt)}
      <figcaption>${esc(t.legenda)}</figcaption></figure></div>`).join('\n    ')}
  </div>
  <div class="celulares" style="margin-top:64px">
    <figure class="celular"><img src="${T}celular.webp" width="1170" height="2532" alt="O painel do sistema aberto no celular" loading="lazy" decoding="async"><figcaption>O painel no celular</figcaption></figure>
    <figure class="celular alto"><img src="${T}celular-portal.webp" width="1170" height="2532" alt="O portal da imobiliária aberto no celular" loading="lazy" decoding="async"><figcaption>O portal do cliente</figcaption></figure>
    <figure class="celular"><img src="${T}celular-3d.webp?v=2" width="1170" height="2532" alt="O condomínio em 3D aberto no celular" loading="lazy" decoding="async"><figcaption>O 3D na palma da mão</figcaption></figure>
  </div>
</div></section>

<section id="portal" class="claro" aria-labelledby="t-portal"><div class="cx">
  <h2 id="t-portal">Uma vitrine, três jeitos de apresentar.</h2>
  <p class="lead">O portal fica no seu domínio, com a sua marca, e cada imóvel ganha uma página escrita a partir das fotos e da ficha. Quem se interessa vira cliente quente no seu CRM, com o imóvel e o horário da visita.</p>
  <ul class="versoes">
    <li class="versao revelar">${mockVitrine()}<div><h3>Vitrine</h3><p><b>Para quem busca.</b> Busca, filtros por tipo, bairro, quartos e valor, favoritos e uma página completa para cada imóvel.</p></div></li>
    <li class="versao revelar">${mockRevista()}<div><h3>Revista</h3><p><b>Para quem sonha.</b> Uma edição por mês, com ensaios sobre modos de morar e os imóveis entre os textos, como numa revista de casa.</p></div></li>
    <li class="versao sig revelar">${mockSignature(false)}<div><h3>${CAL}</h3><p><b>Para poucos.</b> Residências acima de R$ 10 milhões, com menos fotos e mais intenção. Valores só para membros do Clube ${CAL}.</p></div></li>
  </ul>
  <p class="demo-aviso">Simulações com imóveis fictícios e fotos ilustrativas geradas por inteligência artificial.</p>
  <figure class="pagina-imovel revelar">${janela('portal-imovel', 'Página de um apartamento no portal, com mosaico de fotos, o texto escrito pela IA, a ficha e o botão de agendar visita', { url: 'casaprado.com.br/imoveis/apartamento-cambui' })}
    <figcaption>A página de cada imóvel: mosaico de fotos, texto escrito a partir das fotos, ficha ao vivo e “Agendar visita”, que cai direto no CRM.</figcaption></figure>
</div></section>

<section class="escuro signature" aria-labelledby="t-sig"><div class="cx">
  <div class="sig-grade">
    <div>
      <p class="cal cal-grande">signature</p>
      <h2 id="t-sig">Residências que não se anunciam.</h2>
      <p class="lead">Imóvel acima de R$ 10 milhões entra sozinho na ${CAL} e some do portal comum. A apresentação muda de tom: escura, silenciosa, com as fotos escolhidas a dedo.</p>
      <ul class="sig-lista">
        <li>Valores reservados aos membros do Clube ${CAL}</li>
        <li>Cada pedido de acesso vira cliente quente no CRM, com origem “${CAL}”</li>
        <li>Visita privada com hora marcada, pedida pela própria página</li>
        <li>Páginas fora do Google, endereço nunca aparece</li>
      </ul>
      <a class="btn ouro" href="#contato">Quero a ${CAL} na minha imobiliária</a>
    </div>
    <figure class="revelar">${mockSignature(true)}
      <p class="sig-nota">Simulação com imóveis fictícios e fotos ilustrativas geradas por inteligência artificial.</p></figure>
  </div>
</div></section>

<section id="conteudo" class="claro" aria-labelledby="t-conteudo"><div class="cx">
  <h2 id="t-conteudo">Seu nome na resposta quando alguém pesquisa o bairro.</h2>
  <p class="lead">O blog da imobiliária publica sozinho, três vezes por dia, e cada bairro onde você atua ganha um guia completo, com fotos reais, fontes e perguntas frequentes. Tudo leva o leitor para os seus imóveis e para o formulário, nunca para fora do seu site.</p>
  <ul class="textos">
    <li class="texto revelar"><h3>Varanda gourmet: o que avaliar antes de comprar</h3><p>Ventilação, ponto de gás, carga elétrica e o que o condomínio permite fechar.</p><div class="busca"><span class="quando">Artigo · publicado às 6h</span><span>“vale a pena apartamento com varanda gourmet”</span></div></li>
    <li class="texto revelar"><h3>Morar no Cambuí: ruas, escolas, parques e o que custa</h3><p>Um guia completo, com o que tem perto, os prédios do bairro e os imóveis à venda.</p><div class="busca"><span class="quando">Guia de bairro</span><span>“como é morar no Cambuí”</span></div></li>
    <li class="texto revelar"><h3>Documentos para vender o imóvel sem susto</h3><p>Matrícula, certidões e o que o comprador vai pedir, em linguagem simples.</p><div class="busca"><span class="quando">Dica · publicada às 18h</span><span>“documentos para vender imóvel”</span></div></li>
  </ul>
</div></section>

<section id="comodos" class="claro" aria-labelledby="t-comodos"><div class="cx">
  <div class="comodos">
    <div>
      <h2 id="t-comodos">Cada cômodo é uma parte do sistema.</h2>
      <p class="lead" style="margin-bottom:24px">Toque num cômodo da planta para ver o que ele faz.</p>
      <div class="ficha" id="ficha" aria-live="polite"></div>
    </div>
    <div>${plantaSvg()}<p class="planta-dica">A planta do ${nome}.</p></div>
  </div>
  <ul class="vis-oculto legenda-comodos">
    ${COMODOS.map((c) => `<li data-comodo="${c.k}" data-ir="${c.ir}"><h3>${esc(c.nome)}</h3><p>${esc(c.texto)}</p></li>`).join('\n    ')}
  </ul>
</div></section>

<section id="para-quem" class="claro" aria-labelledby="t-quem"><div class="cx">
  <h2 id="t-quem">Do corretor que trabalha sozinho à imobiliária com equipe.</h2>
  <p class="lead">O mesmo sistema, ajustado ao tamanho de quem usa.</p>
  <div class="dois">
    <div class="perfil"><h3>Corretor parceiro</h3><p>Você sozinho, com a estrutura de uma imobiliária por trás.</p>
      <ul><li>Agentes que atendem no WhatsApp enquanto você está em visita</li><li>Portal, Revista e blog com o seu nome</li><li>Radar de captação na sua região, sem planilha</li><li>3D do prédio para impressionar o cliente na primeira conversa</li></ul></div>
    <div class="perfil forte"><h3>Imobiliária parceira</h3><p>A equipe toda no mesmo lugar, cada um vendo o que é seu.</p>
      <ul><li>Perfis de administrador, gestor e corretor</li><li>Carteira em etapas e painel do dono</li><li>Nove agentes por setor, com relatório diário</li><li>Linha ${CAL} para o alto padrão</li></ul></div>
  </div>
</div></section>

<section class="claro" aria-labelledby="t-comeca"><div class="cx">
  <h2 id="t-comeca">Como começa</h2>
  <p class="lead">Do primeiro contato ao sistema no ar com a sua marca.</p>
  <ol class="passos">
    <li><h3>Conversa</h3><p>Entendemos a sua região, a sua carteira e como a sua equipe trabalha.</p></li>
    <li><h3>Montagem</h3><p>Trazemos os seus imóveis, ligamos o seu domínio e os números de WhatsApp.</p></li>
    <li><h3>No ar</h3><p>Portal, blog e agentes funcionando com a sua marca, e você acompanhando pelo painel.</p></li>
  </ol>
  <div class="planos" style="margin-top:72px">
    <div><h2>Planos para corretor e para imobiliária</h2><p>O valor depende do tamanho da equipe e da região. Conte como você trabalha e montamos a proposta.</p></div>
    <a class="btn" href="#contato">Pedir uma proposta</a>
  </div>
</div></section>

<section id="perguntas" class="claro" aria-labelledby="t-perguntas"><div class="cx">
  <h2 id="t-perguntas">Perguntas</h2>
  <div class="perguntas">
    ${PERGUNTAS.map(([q, a]) => `<details><summary>${esc(q).replace(/@SIG@/g, CAL)}</summary><p>${esc(a).replace(/@SIG@/g, CAL)}</p></details>`).join('\n    ')}
  </div>
</div></section>

<section id="contato" class="escuro" aria-labelledby="t-contato"><div class="cx">
  <div class="contato">
    <div>
      <h2 id="t-contato">Vamos montar o seu escritório?</h2>
      <p class="lead" style="margin-bottom:0">Conte um pouco sobre você e respondemos pelo WhatsApp, com uma demonstração ao vivo.</p>
      <div class="direto">
        <a href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp ${esc(telBonito(WHATSAPP))}</a>
        <a href="mailto:${email}">${email}</a>
      </div>
    </div>
    <form class="fale" data-whatsapp="${wa}">
      <label>Seu nome<input name="nome" required autocomplete="name"></label>
      <label>Cidade<input name="cidade" required autocomplete="address-level2"></label>
      <label class="largo">Você é<select name="perfil" required><option value="">Escolha</option><option>Corretor parceiro</option><option>Imobiliária parceira</option><option>Outro</option></select></label>
      <label class="largo">Mensagem (opcional)<textarea name="mensagem" placeholder="Quantos corretores, quantos imóveis, o que mais incomoda hoje"></textarea></label>
      <p class="nota">Ao enviar, o WhatsApp abre com a sua mensagem pronta. Nada fica gravado nesta página.</p>
      <div class="largo"><button class="btn pri" type="submit">Enviar pelo WhatsApp</button></div>
    </form>
  </div>
</div></section>
</main>

<div class="fixa" aria-hidden="true" hidden><div class="fixa-cx"><span class="fixa-t"><b>Sua imobiliária no ar assim,</b> com a sua marca.</span><a class="btn pri" href="#contato" tabindex="-1">Quero a minha</a><a class="fixa-wa" href="https://wa.me/${wa}" target="_blank" rel="noopener" tabindex="-1" aria-label="WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.6-.3Z"/></svg></a></div></div>
${rodape()}
<script src="/plataforma/site.js?v=6" defer></script>
</body></html>`;
}

let cache = null;
function vitrine(req, res, next) {
  const host = String(req.hostname || '').toLowerCase();
  // Entrada única da plataforma: login de todas as imobiliárias (src/plataforma/entrada.js).
  if (APP_HOSTS.has(host)) return require('./entrada').entrada(req, res, next);
  if (!HOSTS.has(String(req.hostname || '').toLowerCase())) return next();
  if (req.path === '/robots.txt') return res.type('text/plain').send('User-agent: *\nAllow: /\nSitemap: https://corretordofuturo.app/sitemap.xml\n');
  if (req.path === '/sitemap.xml') return res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://corretordofuturo.app/</loc></url><url><loc>https://corretordofuturo.app/sobre</loc></url><url><loc>https://corretordofuturo.app/termos</loc></url><url><loc>https://corretordofuturo.app/privacidade</loc></url></urlset>');
  if (req.path.startsWith('/plataforma/')) { const orig = req.url; req.url = req.url.slice('/plataforma'.length) || '/'; return estaticos(req, res, () => { req.url = orig; next(); }); }
  if (req.path.startsWith('/gestor/')) return next(); // painel do gestor
  if (require('./legal').atende(req, res)) return; // Sobre nós, Termos, Privacidade e pedido do titular
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(404).json({ erro: 'Não encontrado.' });
  if (req.path !== '/') return res.redirect(302, '/');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('html').send(cache || (cache = pagina()));
}

module.exports = { vitrine, HOSTS, APP_HOSTS, pagina, topo, rodape };
