// Páginas institucionais da plataforma (corretordofuturo.app): Sobre nós, Termos de uso, Privacidade e LGPD,
// e o pedido do titular (POST /privacidade/pedido → plataforma.titular_pedidos, painel do gestor).
// Textos em src/lgpd/textos.js.
const express = require('express');
const cfg = require('../config');
const lgpd = require('../lgpd');
const T = require('../lgpd/textos');

const esc = T.esc;
const PAGINAS = {
  '/sobre': { titulo: 'Sobre nós', kicker: 'Quem somos', h1: 'Um software independente, com dados de origem conhecida.', lead: 'Quem faz o sistema, o que ele é e o que ele não é, de onde vem cada informação e quem responde por quê.', secoes: T.sobre, descricao: 'O Herrera HOUSE IA é um software independente para imobiliárias: sem vínculo com portais, com dados de anúncios públicos, bases oficiais e serviços contratados pela própria imobiliária.' },
  '/termos': { titulo: 'Termos de uso', kicker: 'Termos de uso', h1: 'As regras do jogo, em português claro.', lead: 'O que a plataforma faz, o que cada imobiliária se compromete a fazer e quem responde por cada parte.', secoes: T.termos, descricao: 'Termos de uso do Herrera HOUSE IA para imobiliárias e corretores.' },
  '/privacidade': { titulo: 'Privacidade e LGPD', kicker: 'Privacidade e LGPD', h1: 'Como tratamos dados pessoais.', lead: 'Quais dados, para quê, com qual base legal, com quem são compartilhados e como você exerce os seus direitos.', secoes: T.privacidade, descricao: 'Política de privacidade do Herrera HOUSE IA: dados tratados, bases legais da LGPD, compartilhamento, prazos e direitos do titular.', form: true },
};

function casca({ titulo, descricao, caminho, corpo }) {
  const { topo, rodape } = require('./vitrine');
  const nome = esc(cfg.SISTEMA_NOME);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)} · ${nome}</title>
<meta name="description" content="${esc(descricao)}">
<link rel="canonical" href="https://corretordofuturo.app${caminho}">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#070b0f">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Sans:wght@400;600&display=swap">
<link rel="stylesheet" href="/plataforma/site.css?v=5">
</head><body>
${topo({ inicio: '/' })}
<main>${corpo}</main>
${rodape()}
</body></html>`;
}

function abas(atual) {
  return `<nav class="legal-abas" aria-label="Páginas institucionais">${Object.entries(PAGINAS).map(([c, p]) => `<a href="${c}"${c === atual ? ' aria-current="page"' : ''}>${esc(p.titulo)}</a>`).join('')}</nav>`;
}

function pagina(caminho, { aviso = '' } = {}) {
  const p = PAGINAS[caminho];
  const secoes = p.secoes();
  const lista = p.form ? [...secoes, ['pedido', 'Fazer um pedido']] : secoes;
  return casca({ titulo: p.titulo, descricao: p.descricao, caminho, corpo: `
<div class="escuro legal-abre"><div class="cx">
  <h1>${esc(p.h1)}</h1>
  <p class="lead">${esc(p.lead)}</p>
  <p class="legal-versao" style="color:var(--luz-2)">Versão de ${T.VIGENCIA}. ${esc(T.AVISO_REVISAO)}</p>
  ${abas(caminho)}
</div></div>
<div class="claro"><div class="cx legal-grade">
  ${T.indice(lista)}
  <div class="legal-texto">${aviso}${T.corpo(secoes)}${p.form ? T.formulario('/privacidade/pedido') : ''}</div>
</div></div>` });
}

function confirmacao(r) {
  return casca({ titulo: 'Pedido recebido', descricao: 'Pedido do titular recebido.', caminho: '/privacidade', corpo: `
<div class="claro"><div class="cx" style="padding:72px 28px 96px;max-width:760px">
  <div class="legal-ok" role="status"><strong>Pedido recebido.</strong>
  Protocolo <b>${esc(r.protocolo)}</b>. Respondemos até ${esc(r.prazo ? r.prazo.split('-').reverse().join('/') : 'em 15 dias')}.
  ${['oposicao', 'eliminar'].includes(r.tipo) ? '<br>O telefone informado já entrou na lista "não contatar" de todas as imobiliárias do sistema.' : ''}</div>
  <p style="margin-top:24px"><a href="/privacidade">Voltar à Política de privacidade</a></p>
</div></div>` });
}

// Limite simples por IP (o formulário é público).
const hits = new Map();
function excesso(ip, max = 5) {
  const agora = Date.now();
  const h = (hits.get(ip) || []).filter((t) => agora - t < 60 * 60e3); h.push(agora); hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > max;
}

const lerForm = express.urlencoded({ extended: false, limit: '20kb' });

/** Atende as páginas institucionais no domínio da plataforma. Devolve true se respondeu. */
function atende(req, res) {
  const caminho = req.path.replace(/\/$/, '') || '/';
  if (caminho === '/privacidade/pedido' && req.method === 'POST') {
    lerForm(req, res, async () => {
      res.setHeader('Cache-Control', 'no-store');
      const b = req.body || {};
      if (b.empresa) return res.type('html').send(confirmacao({ protocolo: 'recebido', tipo: '' })); // armadilha para robô
      if (excesso(req.ip)) return res.status(429).type('html').send(pagina('/privacidade', { aviso: '<p class="legal-ok" role="alert">Muitos pedidos seguidos deste endereço. Tente de novo em uma hora ou escreva para o e-mail desta página.</p>' }));
      try {
        const r = await lgpd.registrarPlataforma(require('./gestor').consulta, { ...b, declaro: b.declaro === '1' });
        res.type('html').send(confirmacao(r));
      } catch (e) {
        const msg = e.status ? e.message : 'Não foi possível registrar agora. Escreva para o e-mail desta página.';
        if (!e.status) console.error('[lgpd] pedido na plataforma:', e.message);
        res.status(e.status || 500).type('html').send(pagina('/privacidade', { aviso: `<p class="legal-ok" role="alert" style="background:#fbe3dc">${esc(msg)}</p>` }));
      }
    });
    return true;
  }
  if (!PAGINAS[caminho] || (req.method !== 'GET' && req.method !== 'HEAD')) return false;
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('html').send(pagina(caminho));
  return true;
}

module.exports = { atende, PAGINAS };
