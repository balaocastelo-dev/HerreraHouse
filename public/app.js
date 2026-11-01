/* Herrera HOUSE IA — aplicativo (sem frameworks; todos os dados passam por esc() antes de virar HTML) */
// Marca: nome do sistema e do cliente (imobiliária) vêm do servidor em /marca.js; estes são só os padrões.
const MARCA = Object.assign({ sistema: 'Herrera HOUSE IA', cliente: 'Imobiliária', empresa: 'Imobiliária' }, window.MARCA || {});
'use strict';
if (MARCA.icone) { const l = document.createElement('link'); l.rel = 'icon'; l.type = 'image/svg+xml'; l.href = MARCA.icone; document.head.appendChild(l); }
if (MARCA.cliente) document.title = MARCA.sistema + ' · ' + MARCA.cliente;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const autorDaIA = (a) => !a || /^IA( |$)/.test(a);
const brl = (v) => (v || v === 0 ? 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—');
const dataBR = (s) => (s ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const tel = (t) => { const d = String(t || '').replace(/\D/g, '').replace(/^55/, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t || ''; };

const STATUS = { captacao: ['Em captação', 'warn'], aguardando_autorizacao: ['Aguardando autorização', 'bad'], publicado: ['Publicado', 'ok'], off_market: ['Off-market', 'info'], vendido: ['Vendido', 'gold'], alugado: ['Alugado', 'gold'], suspenso: ['Suspenso', 'bad'] };
const ETAPAS = [['novo', 'Novo'], ['qualificado', 'Qualificado'], ['visita', 'Visita'], ['proposta', 'Proposta'], ['escritura', 'Escritura'], ['perdido', 'Perdido']];
const TEMP = { quente: 'bad', morno: 'warn', frio: 'info' };
const stPill = (s) => `<span class="pill ${(STATUS[s] || ['', 'info'])[1]}">${esc((STATUS[s] || [s])[0])}</span>`;

let ME = null, TIPOS = [], CART_ETAPAS = [], ORIGENS = [], USUARIOS = [], poll = null;
const veTudo = () => ME && (ME.perfil === 'adm' || ME.perfil === 'gestor');

// ---------- utilidades ----------
async function api(method, url, body, isForm) {
  const r = await fetch(url, { method, headers: isForm ? {} : { 'Content-Type': 'application/json' }, body: isForm ? body : body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  let j = null; try { j = await r.json(); } catch {}
  if (r.status === 401 && !url.startsWith('/api/login')) { ME = null; telaLogin(); throw new Error('Sessão expirada. Entre novamente.'); }
  if (!r.ok) throw new Error((j && j.erro) || `Erro ${r.status}`);
  return j;
}
function toast(t, erro) { const e = $('#toast'); e.textContent = t; e.className = 'toast' + (erro ? ' erro' : ''); e.hidden = false; clearTimeout(e._t); e._t = setTimeout(() => (e.hidden = true), erro ? 6000 : 3200); }
function modal(html, o) {
  const m = $('#modal'); m.innerHTML = `<div class="modal">${html}</div>`; m.hidden = false;
  if (o && o.segura) m.dataset.segura = '1'; else delete m.dataset.segura;
  const f = m.querySelector('input,select,textarea'); if (f) f.focus();
}
function fechaModal() { const m = $('#modal'); delete m.dataset.segura; m.hidden = true; m.innerHTML = ''; }
$('#modal').addEventListener('click', (e) => {
  if (e.target.closest('[data-fecha]')) { fechaModal(); return; }
  if (e.target.id === 'modal' && !$('#modal').dataset.segura) fechaModal();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').dataset.segura) fechaModal(); });
const formJSON = (f) => { const o = {}; new FormData(f).forEach((v, k) => { o[k] = v; }); $$('input[type=checkbox]', f).forEach((c) => { o[c.name] = c.checked; }); return o; };
async function copiar(texto) { try { await navigator.clipboard.writeText(texto); toast('Copiado'); } catch { prompt('Copie o texto:', texto); } }
async function comBotao(btn, fn) { const t = btn && btn.innerHTML; if (btn) { btn.disabled = true; btn.innerHTML = 'Aguarde…'; } try { await fn(); } catch (e) { toast(e.message, true); } finally { if (btn && document.body.contains(btn)) { btn.disabled = false; btn.innerHTML = t; } } }
const opcoesUsuarios = (sel, vazio = 'Sem corretor') => `<option value="">${vazio}</option>` + USUARIOS.filter((u) => u.perfil !== undefined).map((u) => `<option value="${u.id}" ${+sel === u.id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('');

// ---------- ações (delegação de eventos: a política de segurança não permite onclick no HTML) ----------
// ---------- fotos com reserva: tenta cada endereço da lista; se nenhum abrir, mostra o quadro "Foto em breve" ----------
// fotoCadeia(['/api/arquivos/1', 'https://portal/foto.jpg', '/api/fachada?ref=fg9'], 'Casa no Cambuí')
const SEM_FOTO = (txt = 'Foto em breve') => `<div class="noimg"><span class="noimg-i" aria-hidden="true">⌂</span><span>${esc(txt)}</span></div>`;
function fotoCadeia(urls, alt = '', o = {}) {
  const l = [...new Set((urls || []).filter(Boolean))];
  if (!l.length) return SEM_FOTO(o.vazio);
  return `<img src="${esc(l[0])}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-cadeia="${esc(l.slice(1).join('|'))}"${o.vazio ? ` data-vazio="${esc(o.vazio)}"` : ''}${o.style ? ` style="${o.style}"` : ''}>`;
}
document.addEventListener('error', (e) => {
  const i = e.target;
  if (!(i instanceof HTMLImageElement) || !i.hasAttribute('data-cadeia')) return;
  const resto = (i.dataset.cadeia || '').split('|').filter(Boolean);
  if (resto.length) { i.dataset.cadeia = resto.slice(1).join('|'); i.src = resto[0]; return; }
  const d = document.createElement('div'); d.innerHTML = SEM_FOTO(i.dataset.vazio); const ph = d.firstChild;
  if (i.getAttribute('style')) ph.setAttribute('style', i.getAttribute('style'));
  i.replaceWith(ph);
}, true);

const ACT = {}, FORM = {};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && ACT[el.dataset.act]) { e.preventDefault(); ACT[el.dataset.act](el, e); }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (f && FORM[f.dataset.form]) { e.preventDefault(); const b = f.querySelector('button[type=submit],button:not([type])'); comBotao(b, () => FORM[f.dataset.form](f)); }
});
ACT.copiar = (el) => copiar(el.dataset.txt);
const navega = (h) => { if (location.hash === h) rota(); else location.hash = h; };
ACT.ir = (el) => navega(el.dataset.href);

// CSS completo e as fontes saem com media=print (não travam a primeira pintura). Quando o arquivo chega, passam a valer.
function liberaCss(id) {
  const l = document.getElementById(id);
  if (!l) return;
  const liga = () => { l.media = 'all'; };
  l.addEventListener('load', liga, { once: true });
  if (l.sheet) liga();
}

// Cada tela pede só os arquivos dela. O login fica em marca.js + app.js; radar, fisguei, escritório e 3D não baixam antes da entrada.
const MODULOS = {
  galeria: ['/galeria.js'],
  chaves: ['/chaves.js'],
  chat: ['/chat.js'],
  radar: ['/radar.js'],
  fisguei: ['/fisguei.js', '/fisguei-explorar.js'],
  condominios: ['/condominios.js'],
  mercado: ['/mercado.js'],
  bairros: ['/bairros.js'],
  painel: ['/painel.js'],
  captacao: ['/captacao.js'],
  escritorio: ['/escritorio.js'],
  jogo: ['/escritorio-jogo.js'],
  social: ['/social.js'],
  estacao: ['/estacao-pc.js'],
  lgpd: ['/lgpd.js'],
  movimento: ['/movimento.js'],
};
const _js = new Map();
function carregaJs(src) {
  if (!_js.has(src)) {
    _js.set(src, new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = () => ok();
      s.onerror = () => { _js.delete(src); falha(new Error('Não foi possível carregar ' + src)); };
      document.head.appendChild(s);
    }));
  }
  return _js.get(src);
}
async function carrega(...nomes) {
  const lista = [];
  for (const n of nomes) for (const src of MODULOS[n] || []) if (!lista.includes(src)) lista.push(src);
  for (const src of lista) await carregaJs(src);
}
function modulosDaRota(p) {
  const a = p[0];
  if (a === 'imoveis') return ['galeria', 'mercado'];
  if (a === 'chat') return ['chat'];
  if (a === 'avisos') return ['escritorio'];
  if (a === 'whats' && p[1] === 'ao-vivo') return ['escritorio', 'jogo', 'estacao'];
  if (a === 'whats') return ['escritorio', 'estacao'];
  if (a === 'radar' && p[1] === 'novo') return [];
  if (a === 'radar' && p[1] && p[1] !== 'aprovacoes') return ['radar', 'captacao', 'galeria', 'fisguei', 'mercado'];
  if (a === 'radar') return ['radar', 'captacao'];
  if (a === 'fisguei') return ['captacao', 'fisguei', 'galeria', 'mercado'];
  if (a === 'mercado' || a === 'captacao') return [];
  if (['apartamentos', 'casas', 'terrenos', 'comerciais'].includes(a)) return ['mercado', 'captacao'];
  if (a === 'robos') return ['captacao'];
  if (a === 'condominios') return ['condominios', 'mercado'];
  if (a === 'redes') return ['social'];
  if (a === 'bairros') return ['bairros'];
  if (a === 'configuracoes') return ['chaves'];
  if (a === 'privacidade') return ['lgpd'];
  if (!a || a === 'painel') return veTudo() ? ['painel', 'radar'] : [];
  return [];
}

// ---------- primeiro acesso e login ----------
async function inicio() {
  try { ME = await api('GET', '/api/me'); }
  catch {
    const s = await (await fetch('/api/setup')).json();
    if (s.precisa) telaSetup(); else telaLogin();
    carrega('movimento');
    return;
  }
  await entra();
}
async function entra() {
  await Promise.all([carregaBase(), carrega('movimento', ...(EMBUTIDO ? [] : ['chat', 'lgpd']))]);
  shell();
  rota();
  carrega(...(EMBUTIDO ? ['mercado'] : ['mercado', 'social'])).then(() => {
    if (typeof mapasCfg === 'function') mapasCfg();
    if (!EMBUTIDO) atualizaBadge();
  }).catch(() => {});
}
async function carregaBase() {
  if (!carregaBase.p) {
    carregaBase.p = (async () => {
      const [t, u] = await Promise.all([api('GET', '/api/imoveis/tipos'), api('GET', '/api/usuarios')]);
      TIPOS = t.tipos; CART_ETAPAS = t.etapas || []; ORIGENS = t.origens || []; USUARIOS = u.filter((x) => x.ativo !== 0);
    })().catch((e) => { carregaBase.p = null; throw e; });
  }
  return carregaBase.p;
}
// ---------- ordenar listas: cada botão alterna menor → maior e maior → menor ----------
// opcoes: [[chave, rótulo, (item) => valor, texto?]]. Sem o dado vai sempre para o fim.
const ordLer = (nome, padrao) => { try { const v = JSON.parse(localStorage.getItem('hh.ord.' + nome)); return v && v.k ? v : padrao; } catch { return padrao; } };
const ordGravar = (nome, v) => { try { localStorage.setItem('hh.ord.' + nome, JSON.stringify(v)); } catch {} };
const ordProximo = (atual, k) => (atual.k === k ? { k, d: -atual.d } : { k, d: 1 });
function ordLista(lista, opcoes, atual) {
  const o = opcoes.find((x) => x[0] === atual.k); if (!o) return lista;
  const [, , fn, txt] = o;
  return lista.map((a, i) => ({ a, i, v: fn(a) })).sort((x, y) => {
    const fx = x.v === null || x.v === undefined || x.v === '' || Number.isNaN(x.v), fy = y.v === null || y.v === undefined || y.v === '' || Number.isNaN(y.v);
    if (fx || fy) return fx === fy ? x.i - y.i : fx ? 1 : -1;
    const r = txt ? String(x.v).localeCompare(String(y.v), 'pt-BR', { sensitivity: 'base', numeric: true }) : x.v - y.v;
    return r ? r * atual.d : x.i - y.i;
  }).map((x) => x.a);
}
// a barra "Ordenar por" (data-act recebe data-k; quem trata decide como redesenhar)
function ordBarra(act, opcoes, atual) {
  return `<div class="ord-barra" role="group" aria-label="Ordenar"><span class="ord-r">Ordenar por</span>${opcoes.map(([k, t, , txt]) => {
    const on = atual.k === k;
    const sentido = on ? (atual.d > 0 ? (txt ? 'A → Z' : 'menor → maior') : (txt ? 'Z → A' : 'maior → menor')) : '';
    return `<button type="button" class="ord-b${on ? ' on' : ''}" data-act="${act}" data-k="${k}" aria-pressed="${on}" title="${on ? sentido + ' · clique para inverter' : 'ordenar por ' + esc(t.toLowerCase())}">${esc(t)}<span class="ord-s" aria-hidden="true">${on ? (atual.d > 0 ? '▲' : '▼') : '↕'}</span>${on ? `<span class="ord-t">${sentido}</span>` : ''}</button>`;
  }).join('')}</div>`;
}
const dataNum = (d) => { if (!d) return null; const t = new Date(String(d).length <= 10 ? d + 'T12:00' : String(d).replace(' ', 'T')).getTime(); return Number.isNaN(t) ? null : t; };

// fotos de um imóvel da carteira: a capa; sem foto, a fachada do prédio/condomínio pelo Google (quando ligada)
const imFotos = (i) => [i.capa && `/api/arquivos/${i.capa}`, i.condominio_id && typeof MAPAS !== 'undefined' && MAPAS && MAPAS.fachada ? `/api/fachada?ref=cd${i.condominio_id}` : null];
function telaSetup() {
  $('#root').innerHTML = `<main class="auth"><form class="card" data-form="setup">
    <h1 class="brand"><b>${esc(MARCA.sistema)}</b><span>Primeiro acesso</span></h1>
    <p class="muted" style="margin:0">Crie o usuário administrativo. Ele cadastra os corretores depois.</p>
    <label class="f">Seu nome<input name="nome" required autocomplete="name"></label>
    <label class="f">E-mail (login)<input name="email" type="email" required autocomplete="username"></label>
    <label class="f">Senha (8+ caracteres, letras e números)<input name="senha" type="password" required minlength="8" autocomplete="new-password"></label>
    <label class="f">Repita a senha<input name="senha2" type="password" required autocomplete="new-password"></label>
    <label class="chk"><input type="checkbox" name="exemplo"> Incluir dados de exemplo para testar (dá para apagar depois)</label>
    <button class="btn pri" type="submit">Criar e entrar</button></form></main>`;
}
FORM.setup = async (f) => {
  const d = formJSON(f);
  if (d.senha !== d.senha2) throw new Error('As senhas não conferem.');
  const r = await api('POST', '/api/setup', d);
  ME = await api('GET', '/api/me'); await entra(); navega('#/painel');
  if (r.exemplo) modal(`<h2>Dados de exemplo criados</h2><p>Dois corretores de teste foram criados. Anote as senhas: elas não aparecem de novo.</p>
    <div class="tbl"><table><tr><th>Corretor</th><th>Login</th><th>Senha</th></tr>${r.exemplo.corretores.map((c) => `<tr><td>${esc(c.nome)}</td><td class="mono">${esc(c.email)}</td><td class="mono">${esc(c.senha)}</td></tr>`).join('')}</table></div>
    <p class="muted small">Desative esses usuários em Configurações quando terminar os testes.</p><div class="row"><span class="sp"></span><button class="btn pri" data-fecha>Entendi</button></div>`);
};
function telaLogin() {
  clearInterval(poll);
  if (typeof chatPara === 'function') chatPara();
  $('#root').innerHTML = `<main class="auth"><form class="card" data-form="login">
    <h1 class="brand">${MARCA.logo ? `<img class="brand-logo" src="${esc(MARCA.logo)}" alt="${esc(MARCA.cliente)}">` : ''}<b>${esc(MARCA.sistema)}</b><span>${MARCA.logo ? esc(MARCA.empresa) : 'Sistema imobiliário'}</span></h1>
    <label class="f">E-mail<input name="email" type="email" required autocomplete="username"></label>
    <label class="f">Senha<input name="senha" type="password" required autocomplete="current-password"></label>
    <button class="btn pri" type="submit">Entrar</button>
    <p class="muted small" style="margin:0">Esqueceu a senha? Peça ao administrativo para redefinir.</p></form></main>`;
}
FORM.login = async (f) => { await api('POST', '/api/login', formJSON(f)); ME = await api('GET', '/api/me'); await entra(); };
ACT.sair = async () => { await api('POST', '/api/logout').catch(() => {}); ME = null; telaLogin(); };

// ---------- moldura ----------
const MENU = [
  ['Operação', [['#/painel', 'Painel'], ['#/chat', 'Mensagens'], ['#/imoveis', 'Carteira de imóveis'], ['#/imoveis/novo', 'Novo imóvel']]],
  ['Imóveis da base', [['#/condominios', 'Condomínios', 'cond'], ['#/apartamentos', 'Apartamentos'], ['#/casas', 'Casas'], ['#/terrenos', 'Terrenos'], ['#/comerciais', 'Salas e barracões']]],
  ['Vendas', [['#/leads', 'CRM e funil'], ['#/whats', 'Escritório virtual', 'whats'], ['#/visitas', 'Visitas']]],
  ['Conteúdo', [['#/redes', 'Redes e publicações', 'redes'], ['#/portal', 'Portal de imóveis'], ['#/bairros', 'Páginas de bairros'], ['#/blog', MARCA.blog || MARCA.cliente + ' Blog']]],
  ['Sistema', [['#/robos', 'Robôs e consultas', 'capt'], ['#/privacidade', 'Privacidade e LGPD', 'lgpd'], ['#/configuracoes', 'Configurações']]],
];
// Modo embutido (/app.html?embutido=1#/rota): só o conteúdo da tela, para abrir dentro do
// painel do Escritório ao vivo 3D (mural, TV da diretoria, placa do salão). Mesma sessão, mesmas telas.
const EMBUTIDO = /[?&]embutido=1/.test(location.search);
function shell() {
  const perfil = { adm: 'Administrativo', gestor: 'Gestor', corretor: 'Corretor' }[ME.perfil];
  $('#root').innerHTML = `<div class="app"><header class="topbar"><button type="button" class="hamb" data-act="menu" aria-label="Abrir o menu" aria-controls="menu-lateral" aria-expanded="false"><span></span><span></span><span></span></button>
    <a class="tb-marca" href="#/painel">${esc(MARCA.sistema)}</a><span class="tb-tit" id="tb-tit"></span><span class="tb-ct" id="tb-ct" hidden></span><a class="chat-sino" id="chat-sino" href="#/chat" aria-label="Mensagens"><span aria-hidden="true">♧</span><span class="chat-nao-lidas" id="chat-contador" hidden></span></a></header>
    <div class="side-veu" data-act="menu-fecha" aria-hidden="true"></div><aside class="side" id="menu-lateral">
    <div class="brand">${MARCA.logo ? `<img class="brand-logo" src="${esc(MARCA.logo)}" alt="${esc(MARCA.cliente)}">` : ''}<b>${esc(MARCA.sistema)}</b><span>${MARCA.logo ? esc(MARCA.empresa) : 'Sistema imobiliário'}</span></div>
    <div class="who"><div><b>${esc(ME.nome)}</b>${perfil}</div><button data-act="sair">Sair</button></div>
    <nav id="nav">${MENU.map(([g, it]) => `<div class="grp">${g}</div>` + it.map(([h, l, b]) => `<a href="${h}" data-nav="${h}">${l}${b ? `<span class="ct" id="badge-${b}" hidden></span>` : ''}</a>`).join('')).join('')}</nav>
    </aside><main class="main" id="main"></main></div>`;
  document.body.classList.toggle('embutido', EMBUTIDO);
  if (EMBUTIDO) return;                       // sem menu, sem sino do chat e sem o aceite: isso fica na janela de fora
  atualizaBadge();
  if (typeof chatInicia === 'function') chatInicia();
  if (typeof lgpdConfere === 'function') lgpdConfere(); // aceite dos Termos e da Política (public/lgpd.js)
}
// Menu lateral vira gaveta no celular e no tablet (botão ☰ na barra do topo)
function menuAbre(abre) {
  document.body.classList.toggle('menu-aberto', abre);
  const b = $('.hamb'); if (b) { b.setAttribute('aria-expanded', abre ? 'true' : 'false'); b.setAttribute('aria-label', abre ? 'Fechar o menu' : 'Abrir o menu'); }
}
ACT.menu = () => menuAbre(!document.body.classList.contains('menu-aberto'));
ACT['menu-fecha'] = () => menuAbre(false);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('menu-aberto')) menuAbre(false); });
window.addEventListener('hashchange', () => menuAbre(false));
// a barra do topo mostra a seção atual e soma os avisos do menu
function topoAtualiza() {
  const on = $('#nav a.on'), t = $('#tb-tit'); if (t) t.textContent = on ? on.firstChild.textContent.trim() : '';
  const n = $$('#nav .ct').filter((b) => !b.hidden).length, c = $('#tb-ct'); if (c) { c.hidden = !n; c.title = 'Há avisos no menu'; }
}
async function atualizaBadge() {
  // "Robôs e Fisgar": "!" se o radar ou o robô pararam; senão, o que espera alguém (aprovações + respostas do robô)
  Promise.all([veTudo() ? api('GET', '/api/radar/resumo').catch(() => null) : null, veTudo() ? api('GET', '/api/radar/alertas').catch(() => null) : null, api('GET', '/api/fisguei/resumo').catch(() => null)]).then(([r, al, f]) => {
    const b = $('#badge-capt'); if (!b) return;
    const alertaRadar = al && al.saude && !al.saude.ok, alertaRobo = f && ['erro', 'desconectado', 'qr'].includes(f.robo && f.robo.estado);
    const n = ((r && r.aprovacoesPendentes) || 0) + ((f && f.precisaCorretor) || 0);
    b.textContent = alertaRadar || alertaRobo ? '!' : n; b.hidden = !alertaRadar && !alertaRobo && !n;
    b.title = alertaRadar ? 'O radar precisa de atenção' : alertaRobo ? 'O robô TH-IA-GO precisa de atenção' : 'Aprovações e respostas esperando alguém'; topoAtualiza();
  });
  if (typeof rsBadge === 'function') rsBadge();
  api('GET', '/api/condominios/alertas').then((l) => { const b = $('#badge-cond'); if (!b) return; b.textContent = l.length; b.hidden = !l.length; b.title = 'Anúncios novos em prédios-alvo'; topoAtualiza(); }).catch(() => {});
  try { const w = await api('GET', '/api/whats'); const n = w.conversas.filter((c) => c.tem_sugestao || c.direcao === 'entrada').length; const b = $('#badge-whats'); if (b) { b.textContent = n; b.hidden = !n; b.title = 'Conversas esperando resposta ou aprovação'; topoAtualiza(); } } catch {}
}
function marcaNav(h) {
  $$('#nav a').forEach((a) => {
    const n = a.dataset.nav;
    const pai = { '#/imoveis': '#/imoveis/novo' };
    const hh = /^#\/whats\//.test(h) ? '#/whats' : h;
    const on = hh === n || (pai[n] ? hh.startsWith(n + '/') && hh !== pai[n] : !Object.values(pai).includes(n) && hh.startsWith(n + '/'));
    a.classList.toggle('on', on);
  });
  topoAtualiza();
}

// ---------- roteador ----------
window.addEventListener('hashchange', () => ME && rota());
let rotaSeq = 0;
async function rota() {
  clearInterval(poll);
  const seq = ++rotaSeq;
  const h = location.hash || '#/painel';
  const [path, qs] = h.split('?');
  const p = path.replace(/^#\//, '').split('/');
  marcaNav(path);
  const main = $('#main'); if (!main) return;
  main.innerHTML = '<p class="muted">Carregando…</p>';
  try {
    const mods = modulosDaRota(p);
    if (mods.length) await carrega(...mods);
    if (mods.includes('mercado') && typeof mapasCfg === 'function') await mapasCfg();
    if (seq !== rotaSeq) return;
    if (p[0] === 'imoveis' && p[1] === 'novo') await telaImovelForm();
    else if (p[0] === 'imoveis' && p[1] && p[2] === 'editar') await telaImovelForm(+p[1]);
    else if (p[0] === 'imoveis' && p[1]) await telaFicha(+p[1], p[2] || 'dados');
    else if (p[0] === 'imoveis') await telaImoveis(new URLSearchParams(qs || ''));
    else if (p[0] === 'leads' && p[1]) await telaLead(+p[1]);
    else if (p[0] === 'leads') await telaLeads(new URLSearchParams(qs || ''));
    else if (p[0] === 'avisos') await telaAvisos();
    else if (p[0] === 'chat') await telaChat(p[1] ? +p[1] : null);
    else if (p[0] === 'whats' && p[1] === 'agente' && p[2]) await telaMesa(p[2], p[3] || 'mesa');
    else if (p[0] === 'whats' && p[1] === 'conversas') await telaWhats(null);
    else if (p[0] === 'whats' && p[1] === 'config') await telaEscritorioConfig();
    else if (p[0] === 'whats' && p[1] === 'ao-vivo') await telaEscritorioJogo();
    else if (p[0] === 'whats' && p[1]) await telaWhats(+p[1]);
    else if (p[0] === 'whats') await telaEscritorio();
    else if (p[0] === 'visitas') await telaVisitas();
    else if (p[0] === 'radar' && p[1] === 'novo') { location.replace('#/radar'); return; }
    else if (p[0] === 'radar' && p[1] === 'aprovacoes') await telaAprovacoes();
    else if (p[0] === 'radar' && p[1] && p[2] === 'editar') await telaOpForm(+p[1]);
    else if (p[0] === 'radar' && p[1]) { await telaOp(+p[1]); if (typeof fgCartaoOp === 'function') fgCartaoOp(); }
    else if (p[0] === 'radar') await telaRadar(new URLSearchParams(qs || ''));
    else if (p[0] === 'fisguei' && p[1]) await telaFisgueiAnuncio(+p[1], p[2] || 'dados');
    else if (p[0] === 'fisguei') await telaFisguei(new URLSearchParams(qs || ''));
    else if (p[0] === 'mercado') { location.replace('#/casas' + (qs ? '?' + qs : '')); return; }
    else if (['apartamentos', 'casas', 'terrenos', 'comerciais'].includes(p[0])) await telaMercado(new URLSearchParams(qs || ''), p[0]);
    else if (p[0] === 'captacao') { location.replace('#/apartamentos'); return; } // a captação agora é feita direto nas vitrines da base
    else if (p[0] === 'robos') await telaRobos();
    else if (p[0] === 'condominios' && p[1]) await telaCondominio(+p[1]);
    else if (p[0] === 'condominios') await telaCondominios(new URLSearchParams(qs || ''));
    else if (p[0] === 'redes' && typeof telaRedes === 'function') await telaRedes(p[1] || '', new URLSearchParams(qs || ''));
    else if (p[0] === 'blog') await telaBlog();
    else if (p[0] === 'portal') await telaPortal();
    else if (p[0] === 'bairros') await telaBairros(new URLSearchParams(qs || ''));
    else if (p[0] === 'configuracoes') await telaConfig(new URLSearchParams(qs || ''));
    else if (p[0] === 'privacidade' && typeof telaPrivacidade === 'function') await telaPrivacidade();
    else await telaPainel();
  } catch (e) { if (seq === rotaSeq && document.body.contains(main)) main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  window.scrollTo(0, 0);
}

// ---------- portal ----------
async function telaPortal() {
  const l = await api('GET', '/api/portal');
  const NOME = { 'no-ar': ['ok', 'no ar'], desatualizada: ['info', 'no ar · será reescrita'], 'sem-pagina': ['warn', 'esperando a página'], reprovada: ['bad', 'fora do ar · será reescrita'], 'sem-arquivo': ['bad', 'fora do ar'], 'sem-foto': ['bad', 'fora do portal · falta foto própria (as internas não vão)'] };
  const n = (e) => l.filter((x) => x.estado === e).length;
  const ordem = ['reprovada', 'sem-arquivo', 'sem-pagina', 'desatualizada', 'no-ar'];
  l.sort((a, b) => ordem.indexOf(a.estado) - ordem.indexOf(b.estado) || String(a.codigo).localeCompare(b.codigo));
  $('#main').innerHTML = `<h1>Portal de imóveis</h1>
  <p class="lead">O portal público mostra os imóveis com status <b>publicado</b> e foto. Cada um ganha uma página única, escrita a partir das fotos e da ficha por uma tarefa automática; o imóvel só aparece depois que a página passa na conferência. Valor, áreas e quartos vêm sempre da ficha, ao vivo: se a ficha mudar e o texto passar a discordar, a página sai do ar e é reescrita. Quem clica em "Tenho interesse" ou "Agendar visita" entra no CRM com origem <b>Portal ${esc(MARCA.cliente)}</b>.</p>
  <div class="row" style="margin-bottom:16px;flex-wrap:wrap"><a class="btn pri" href="/imoveis" target="_blank" rel="noopener">Abrir o portal</a>
  <span class="pill ok">${n('no-ar') + n('desatualizada') + l.filter((x) => x.automatica).length} no ar</span><span class="pill warn">${n('sem-pagina')} esperando página</span>${n('reprovada') + n('sem-arquivo') + n('sem-foto') ? `<span class="pill bad">${n('reprovada') + n('sem-arquivo') + n('sem-foto')} fora do ar</span>` : ''}</div>
  ${l.length ? `<div class="card"><div class="list">${l.map((x) => { const [c, t] = x.automatica ? ['info', 'no ar · página automática (a escrita vem depois)'] : NOME[x.estado] || ['info', x.estado]; const no = x.estado === 'no-ar' || x.estado === 'desatualizada' || !!x.automatica; const slugLink = x.automatica ? x.slugAutomatica : x.slug; return `<div class="item" style="flex-wrap:wrap">
    <div style="flex:1;min-width:240px"><div class="t"><span class="mono">${esc(x.codigo)}</span> · ${no ? `<a href="/imoveis/${esc(slugLink)}" target="_blank" rel="noopener">${esc(x.titulo)}</a>` : esc(x.titulo || x.tipo)}</div>
    <div class="muted small">${esc(x.tipo)} · ${esc([x.bairro, x.cidade].filter(Boolean).join(', '))} · ${x.fotos} fotos${x.erros ? ` · <span title="${esc(x.erros.join(' | '))}">${esc(x.erros[0])}</span>` : ''}</div></div>
    <span class="pill ${c}">${t}</span>${no && !x.automatica ? `<button class="btn sm" data-act="portal-legenda" data-codigo="${esc(x.codigo)}">Copiar legenda</button>` : ''}</div>`; }).join('')}</div></div>`
    : '<div class="card"><div class="empty">Nenhum imóvel com status publicado e foto.</div></div>'}`;
}
ACT['portal-legenda'] = async (el) => {
  const r = await api('GET', `/api/portal/${encodeURIComponent(el.dataset.codigo)}/redes`);
  const texto = `${r.legenda}\n\n${r.hashtags}`;
  try { await navigator.clipboard.writeText(texto); el.textContent = 'Legenda copiada'; } catch { window.prompt('Copie a legenda:', texto); }
  setTimeout(() => { el.textContent = 'Copiar legenda'; }, 2000);
};

// ---------- blog ----------
async function telaBlog() {
  const d = await api('GET', '/api/blog');
  const situ = (a) => (a.noAr ? '<span class="pill ok">no ar</span>' : a.esperandoFoto ? '<span class="pill warn">esperando a foto</span>' : '<span class="pill info">agendado</span>');
  $('#main').innerHTML = `<h1>${esc(MARCA.blog || MARCA.cliente + ' Blog')}</h1>
  <p class="lead">Três textos por dia, escritos e conferidos sozinhos: artigo às 6h, notícia às 12h e dica às 18h. Cada um só aparece no blog com a foto de capa, feita de madrugada na placa de vídeo. Use "Copiar legenda" para postar no Instagram e no Facebook.</p>
  <div class="row" style="margin-bottom:16px"><a class="btn pri" href="/blog" target="_blank" rel="noopener">Abrir o blog</a><span class="muted small">${d.fotosNaFila ? `${d.fotosNaFila} foto(s) na fila da placa de vídeo` : 'Nenhuma foto na fila'}</span></div>
  ${d.artigos.length ? `<div class="card"><div class="list">${d.artigos.map((a) => `<div class="item" style="flex-wrap:wrap">
    <div style="flex:1;min-width:240px"><div class="t">${a.noAr ? `<a href="/blog/${esc(a.slug)}" target="_blank" rel="noopener">${esc(a.titulo)}</a>` : esc(a.titulo)}</div>
    <div class="muted small">${dataBR(a.publicadoEm)} · ${esc(a.categoria)}${a.formato === 'dica' ? ' (dica)' : ''}</div></div>
    ${situ(a)}<button class="btn sm" data-act="blog-legenda" data-slug="${esc(a.slug)}">Copiar legenda</button></div>`).join('')}</div></div>`
    : '<div class="card"><div class="empty">Ainda não há textos. O primeiro aparece assim que a foto de capa ficar pronta.</div></div>'}`;
}
ACT['blog-legenda'] = async (el) => {
  const r = await api('GET', `/api/blog/${encodeURIComponent(el.dataset.slug)}/redes`);
  const texto = `${r.legenda}\n\n${r.hashtags}`;
  try { await navigator.clipboard.writeText(texto); el.textContent = 'Legenda copiada'; } catch { window.prompt('Copie a legenda:', texto); }
  setTimeout(() => { el.textContent = 'Copiar legenda'; }, 2000);
};

// ---------- painel ----------
async function telaPainel() {
  if (veTudo() && typeof telaPainelAdm === 'function') return telaPainelAdm();
  const d = await api('GET', '/api/painel');
  api('GET', '/api/condominios/alertas').then((l) => { const el = $('#painel-cond'); if (el && l.length) el.innerHTML = `<div class="banner info"><b>${l.length}</b> anúncio(s) novo(s) em prédios-alvo: ${l.slice(0, 3).map((a) => `<a href="${a.href}">${esc(a.texto)}</a>`).join(' · ')}${l.length > 3 ? ' …' : ''} <a href="#/condominios?alvo=1">ver prédios-alvo</a></div>`; }).catch(() => {});
  if (veTudo()) api('GET', '/api/radar/resumo').then((r) => { const el = $('#painel-aprov'); if (el && r.aprovacoesPendentes) el.innerHTML = `<div class="banner warn"><b>${r.aprovacoesPendentes}</b> pedido(s) de matrícula/birô esperando sua aprovação. <a href="#/radar/aprovacoes">Revisar</a></div>`; }).catch(() => {});
  if (veTudo()) api('GET', '/api/radar/alertas').then((al) => { const el = $('#painel-radar'); if (el && typeof avisoSaude === 'function') el.innerHTML = avisoSaude(al, false); }).catch(() => {});
  $('#main').innerHTML = `<h1>Painel</h1><div class="eyebrow depois">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div><p class="lead">${veTudo() ? 'Visão de toda a imobiliária.' : 'Seus imóveis, leads e visitas.'}</p>
  <div id="painel-radar"></div><div id="painel-aprov"></div><div id="painel-cond"></div>
  ${d.sugestoes ? `<div class="banner warn">A IA preparou <b>${d.sugestoes}</b> resposta(s) esperando aprovação. <a href="#/whats">Abrir WhatsApp</a></div>` : ''}
  <div class="grid g4">
    <div class="card kpi"><div class="n">${d.kpis.imoveis}</div><div class="l">Imóveis na carteira</div></div>
    <div class="card kpi"><div class="n">${d.kpis.publicados}</div><div class="l">Publicados</div></div>
    <div class="card kpi"><div class="n">${d.kpis.leads}</div><div class="l">Leads no funil</div></div>
    <div class="card kpi"><div class="n">${d.kpis.quentes}</div><div class="l">Leads quentes</div></div>
  </div>
  ${d.novos.length ? `<h2 style="margin:22px 0 4px">Novos na carteira</h2><p class="muted small" style="margin:0 0 12px">Cadastrados nos últimos 7 dias e os compradores que combinam.</p>
    ${imCards(d.novos, { extra: (n) => `<div class="imcompr">${n.compradores.length ? n.compradores.map((c) => `<div class="small"><span class="pill ok">${c.score}%</span> ${esc(c.nome)}</div>`).join('') : '<span class="muted small">Sem compradores ainda</span>'}</div>`, href: (n) => n.compradores.length ? `#/imoveis/${n.id}/compradores` : `#/imoveis/${n.id}` })}` : ''}
  ${d.vitrine.length ? `<div class="row" style="margin:22px 0 12px;justify-content:space-between"><h2 style="margin:0">Imóveis à venda</h2><a class="btn sm" href="#/imoveis">Ver todos</a></div>${imCards(d.vitrine)}` : (!d.novos.length ? '<div class="card" style="margin-top:16px"><div class="empty">Nenhum imóvel publicado ainda. <a href="#/imoveis/novo">Cadastrar imóvel</a></div></div>' : '')}
  <div class="grid g2" style="margin-top:22px">
    <div class="card"><h2>Esperando resposta</h2>${d.aguardando.length ? `<div class="list">${d.aguardando.map((a) => `<div class="item click" data-act="ir" data-href="#/whats/${a.id}"><div style="flex:1;min-width:0"><div class="t">${esc(a.nome)}</div><div class="muted small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.texto)}</div></div><span class="muted small">${dataBR(a.criado_em)}</span></div>`).join('')}</div>` : '<div class="empty">Ninguém esperando. 👍</div>'}</div>
    <div class="card"><h2>Próximas visitas</h2>${d.visitas.length ? `<div class="list">${d.visitas.map((v) => `<div class="item click" data-act="ir" data-href="#/imoveis/${v.imovel_id}">${miniFoto(v)}<div><div class="mono small">${dataBR(v.data_hora)}</div><div class="t">${esc(v.codigo)} · ${esc(v.lead)}</div><div class="muted small">${esc(v.corretor || '')} · ${esc(v.status)}</div></div></div>`).join('')}</div>` : '<div class="empty">Nenhuma visita nos próximos 3 dias.</div>'}</div>
  </div>`;
}

// ---------- imóveis ----------
const lerPref = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const gravaPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento: só não lembra */ } };
let IM_LISTA = [];
const miniFoto = (x) => `<span class="minifoto">${fotoCadeia(imFotos(x), '', { vazio: ' ' })}</span>`;
const imSub = (i) => i.condominio_nome || i.condominio || [i.logradouro, i.numero].filter(Boolean).join(', ');
// etapa do imóvel na carteira (calculada no servidor a partir do dono, do robô, da assinatura e do status)
const ETAPA_COR = { sem_dono: 'bad', localizado: 'info', em_contato: 'warn', confirmado: 'ok', autorizado: 'gold', publicado: 'ok', vendido: 'gold' };
const etapaNome = (k) => (CART_ETAPAS.find((e) => e[0] === k) || [k, k])[1];
const semFotoPortal = (i) => (i.status === 'publicado' && i.n_fotos != null && !Number(i.n_fotos) ? ' <span class="pill bad" title="Marcado como publicado, mas sem foto própria: as fotos internas do anúncio de origem não vão para o portal">fora do portal · sem foto própria</span>' : '');
const etapaPill = (k) => (k ? `<span class="pill ${ETAPA_COR[k] || 'info'}">${esc(etapaNome(k))}</span>` : '');
const fichaBarra = (f) => (f ? `<span class="cart-ficha${f.pct === 100 ? ' ok' : ''}" title="${esc(f.falta.length ? 'Falta: ' + f.falta.join(', ') : 'Ficha completa')}"><i style="width:${f.pct}%"></i><b>Ficha ${f.pct}%</b></span>` : '');
const donoLinha = (i) => (i.dono ? `<div class="cart-dono small">Dono: <b>${esc(i.dono.nome)}</b>${i.dono.telefone ? ' · ' + esc(tel(i.dono.telefone)) : ' · <span class="muted">sem telefone</span>'}${i.dono.confirmado ? '' : ' <span class="muted">(a confirmar)</span>'}</div>` : (i.etapa ? '<div class="cart-dono small muted">Sem dados do proprietário</div>' : ''));
// ---------- localizar proprietário direto da carteira (sem voltar às vitrines da base) ----------
const BUSCA_DONO = { fila: ['warn', 'Na fila da consulta'], buscando: ['warn', 'Buscando o dono…'], sem_resultado: ['bad', 'A consulta não achou dono'], erro: ['bad', 'A busca falhou'] };
function cartAcoes(i) {
  if (CART_F.autorizacoes === '1') return `<a class="btn sm" href="#/imoveis/${i.id}/autorizacao">Ver autorizações</a>`;
  if (i.dono) return '';
  const b = i.busca_dono;
  if (b && b.status === 'escolher') return `<a class="btn sm" href="#/fisguei/${b.anuncio_id}" title="Prédio com várias pessoas no endereço: escolha quem consultar">Prédio: escolher quem consultar</a>`;
  if (b && ['fila', 'buscando'].includes(b.status)) return `<span class="pill ${BUSCA_DONO[b.status][0]}">${BUSCA_DONO[b.status][1]}</span>`;
  if (!i.logradouro || !i.numero) return `<a class="btn sm" href="#/imoveis/${i.id}/editar" title="A consulta acha o dono pela rua e número">Completar endereço para localizar o dono</a>`;
  const aviso = b && BUSCA_DONO[b.status] ? `<span class="pill ${BUSCA_DONO[b.status][0]}">${BUSCA_DONO[b.status][1]}</span>` : '';
  return `${aviso}<button type="button" class="btn sm pri" data-act="cart-loc" data-id="${i.id}" title="Busca o dono pela rua e número na consulta de proprietários (gasta créditos)">${b ? 'Tentar de novo' : 'Localizar proprietário'}</button>`;
}
async function cartLocaliza(ids) {
  if (!ids.length) return;
  if (ids.length > 1 && !confirm(`Localizar o proprietário de ${ids.length} imóveis da carteira? Cada endereço pode gastar alguns créditos da consulta de proprietários. Quem for achado entra direto na ficha do imóvel.`)) return;
  const r = ids.length === 1 ? await api('POST', `/api/imoveis/${ids[0]}/localizar-dono`) : await api('POST', '/api/imoveis/localizar-dono', { ids });
  const partes = [r.criados && `${r.criados} busca(s) na fila`, r.ja && `${r.ja} já estava(m) na fila`, r.sem_endereco && `${r.sem_endereco} sem rua e número`].filter(Boolean);
  toast((partes.join(' · ') || 'Nada para buscar') + (r.criados ? '. Quando o dono for achado, ele aparece na ficha.' : ''));
  if (r.criados && !(r.extensao && r.extensao.vivo && r.extensao.fisgar_aberto)) setTimeout(() => toast('A busca acontece quando o Fisgar estiver aberto no Chrome com a extensão.', true), 1200);
  rota();
}
ACT['cart-loc'] = (el) => comBotao(el, () => cartLocaliza([+el.dataset.id]));
ACT['cart-loc-todos'] = (el) => comBotao(el, () => cartLocaliza(el.dataset.ids.split(',').map(Number)));
const imTabela = (l) => `<div class="card tbl"><table><thead><tr><th>Código</th><th>Imóvel</th><th>Bairro</th><th class="num">Valor</th><th>Etapa</th><th>Dono</th><th>Ficha</th><th>Corretor</th></tr></thead><tbody>
  ${l.map((i) => `<tr class="click" data-act="ir" data-href="#/imoveis/${i.id}"><td class="mono"><span class="row" style="gap:8px;flex-wrap:nowrap">${miniFoto(i)}${esc(i.codigo)}</span></td><td><b>${esc(i.tipo)}</b><br><span class="muted">${esc(imSub(i))}${i.quartos ? ' · ' + i.quartos + 'q' : ''}${i.area_util ? ' · ' + Math.round(i.area_util) + ' m²' : ''}</span></td>
  <td>${esc(i.bairro)}</td><td class="num">${brl(i.valor)}</td><td>${etapaPill(i.etapa)}${semFotoPortal(i)}${i.exclusivo ? ' <span class="pill gold">exclusivo</span>' : ''}<br><span class="muted small">${STATUS[i.status] ? STATUS[i.status][0] : ''}</span></td>
  <td class="small">${i.dono ? `${esc(i.dono.nome)}${i.dono.telefone ? '<br><span class="muted">' + esc(tel(i.dono.telefone)) + '</span>' : ''}` : cartAcoes(i) || '<span class="muted">—</span>'}</td><td>${fichaBarra(i.ficha)}</td><td>${esc(i.corretor_nome)}</td></tr>`).join('')}</tbody></table></div>`;
// Cards de imóvel com foto, usados em toda parte (lista, painel, lead).
// o.badge(i): selo sobre a foto · o.extra(i): conteúdo extra no corpo · o.acoes(i): botões abaixo do card · o.mini: cards menores
const imCards = (l, o = {}) => `<div class="imcards${o.mini ? ' mini' : ''}">${l.map((i) => {
  const specs = [i.quartos && `${i.quartos} quarto${i.quartos > 1 ? 's' : ''}`, i.suites && `${i.suites} suíte${i.suites > 1 ? 's' : ''}`, i.vagas && `${i.vagas} vaga${i.vagas > 1 ? 's' : ''}`, i.area_util && `${Math.round(i.area_util).toLocaleString('pt-BR')} m²`].filter(Boolean);
  const acoes = o.acoes ? o.acoes(i) : '';
  return `<div class="imcardw${acoes ? ' com-acoes' : ''}"><a class="imcard" href="${o.href ? o.href(i) : '#/imoveis/' + i.id}">
    <div class="imfoto">${fotoCadeia(imFotos(i), `${i.tipo} ${i.codigo}`)}${i.capa && i.n_fotos === 0 ? '<span class="im-int" title="Foto do anúncio de origem: só para a equipe">foto interna</span>' : ''}
      <span class="imst">${i.etapa ? etapaPill(i.etapa) : stPill(i.status)}${semFotoPortal(i)}${i.exclusivo ? ' <span class="pill gold">exclusivo</span>' : ''}</span>${o.badge ? `<span class="imbadge">${o.badge(i)}</span>` : ''}${i.n_fotos > 1 ? `<span class="imnf">📷 ${i.n_fotos}</span>` : ''}</div>
    <div class="imcorpo"><div class="row" style="justify-content:space-between;gap:8px"><span class="mono small muted">${esc(i.codigo)}</span><span class="small muted">${esc(i.corretor_nome || '')}</span></div>
      <div class="imtit">${esc(i.tipo)}${imSub(i) ? ' · ' + esc(imSub(i)) : ''}</div>
      <div class="muted small">${esc([i.bairro, i.cidade].filter(Boolean).join(' · '))}</div>
      ${specs.length ? `<div class="imspecs">${specs.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
      <div class="imvalor">${i.finalidade === 'locacao' ? `${brl(i.valor_locacao)}<span class="muted small"> /mês</span>` : brl(i.valor)}${i.finalidade === 'venda_locacao' && i.valor_locacao ? `<div class="muted small">ou aluguel ${brl(i.valor_locacao)}/mês</div>` : ''}</div>${i.finalidade && i.finalidade !== 'venda' && o.carteira ? `<span class="pill info" style="margin:4px 0">${FINALIDADE[i.finalidade]}</span>` : ''}${o.carteira ? donoLinha(i) + fichaBarra(i.ficha) : ''}${o.extra ? o.extra(i) : ''}</div></a>${acoes ? `<div class="imacoes">${acoes}</div>` : ''}</div>`;
}).join('')}</div>`;
// ---------- carteira: filtros ----------
let CART_F = {}, CART_PORTAL = null;
const FINALIDADE = { venda: 'Venda', locacao: 'Locação', venda_locacao: 'Venda e locação' };
const CART_CAMPOS = ['neg', 'etapa', 'dono', 'ficha', 'exclusivo', 'portal', 'origem', 'corretor', 'status', 'autorizacoes'];
function cartFiltra(l) {
  const f = CART_F;
  return l.filter((i) => {
    if (f.neg === 'venda' && i.finalidade === 'locacao') return false;
    if (f.neg === 'locacao' && !(i.finalidade === 'locacao' || i.finalidade === 'venda_locacao')) return false;
    if (f.etapa && i.etapa !== f.etapa) return false;
    if (f.status && i.status !== f.status) return false;
    if (f.autorizacoes === '1' && !i.autorizacao_status && i.status !== 'aguardando_autorizacao') return false;
    if (f.dono === 'com' && !i.dono) return false;
    if (f.dono === 'sem' && i.dono) return false;
    if (f.dono === 'tel' && !(i.dono && i.dono.telefone)) return false;
    if (f.dono === 'confirmado' && !(i.dono && i.dono.confirmado)) return false;
    if (f.ficha === 'completa' && i.ficha.pct < 100) return false;
    if (f.ficha === 'incompleta' && i.ficha.pct === 100) return false;
    if (f.ficha && f.ficha.startsWith('falta:') && !i.ficha.falta.includes(f.ficha.slice(6))) return false;
    if (f.exclusivo === 'sim' && !i.exclusivo) return false;
    if (f.exclusivo === 'nao' && i.exclusivo) return false;
    if (f.origem && i.origem !== f.origem) return false;
    if (f.corretor && String(i.corretor_id || '') !== f.corretor) return false;
    if (f.portal && CART_PORTAL) { const no = CART_PORTAL.has(i.codigo); if ((f.portal === 'sim') !== no) return false; }
    return true;
  });
}
const FALTAS = ['Fotos próprias', 'Proprietário', 'Telefone do dono', 'Endereço completo (rua, número, CEP)', 'Valor', 'Área', `Descrição da ${MARCA.cliente}`, 'Autorização assinada', 'Corretor responsável'];
function cartFiltrosHTML() {
  const f = CART_F, sel = (k, v) => (f[k] === v ? 'selected' : '');
  const opt = (k, l) => l.map(([v, t]) => `<option value="${esc(v)}" ${sel(k, v)}>${esc(t)}</option>`).join('');
  return `<select class="inp" data-cart="dono" aria-label="Dados do dono">${opt('dono', [['', 'Dados do dono: todos'], ['com', 'Com dados do dono'], ['sem', 'Sem dados do dono'], ['tel', 'Com telefone do dono'], ['confirmado', 'Dono confirmado']])}</select>
    <select class="inp" data-cart="ficha" aria-label="Ficha">${opt('ficha', [['', 'Ficha: todas'], ['completa', 'Ficha completa'], ['incompleta', 'Ficha incompleta'], ...FALTAS.map((x) => ['falta:' + x, 'Falta: ' + x.toLowerCase()])])}</select>
    <select class="inp" data-cart="exclusivo" aria-label="Exclusividade">${opt('exclusivo', [['', 'Exclusividade: todos'], ['sim', 'Com exclusividade'], ['nao', 'Sem exclusividade']])}</select>
    <select class="inp" data-cart="portal" aria-label="Portal">${opt('portal', [['', 'Portal: todos'], ['sim', 'Com página no portal'], ['nao', 'Sem página no portal']])}</select>
    <select class="inp" data-cart="origem" aria-label="Origem">${opt('origem', [['', 'Origem: todas'], ...ORIGENS])}</select>
    <select class="inp" data-cart="status" aria-label="Status">${opt('status', [['', 'Status: todos'], ...Object.entries(STATUS).map(([k, [l]]) => [k, l])])}</select>
    <select class="inp" data-cart="autorizacoes" aria-label="Autorizações">${opt('autorizacoes', [['', 'Autorizações: todos'], ['1', 'Com autorização ou aguardando']])}</select>
    ${veTudo() ? `<select class="inp" data-cart="corretor" aria-label="Corretor">${opt('corretor', [['', 'Corretor: todos'], ...USUARIOS.map((u) => [String(u.id), u.nome])])}</select>` : ''}
    ${CART_CAMPOS.some((k) => f[k]) ? '<button type="button" class="btn sm" data-act="cart-limpa">Limpar filtros</button>' : ''}`;
}
function imDesenha() {
  const modo = lerPref('hh.imoveis.modo', 'cards');
  document.querySelectorAll('[data-act="im-modo"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modo === modo)));
  // funil de etapas (conta sem o filtro de etapa)
  const semEtapa = (() => { const e = CART_F.etapa; CART_F.etapa = ''; const l = cartFiltra(IM_LISTA); CART_F.etapa = e; return l; })();
  const n = (k) => semEtapa.filter((i) => i.etapa === k).length;
  const funil = $('#cart-funil');
  const segNeg = $('#cart-neg');
  if (segNeg) segNeg.innerHTML = [['', 'Todos'], ['venda', 'Venda'], ['locacao', 'Locação']].map(([k, t]) => `<button type="button" data-act="cart-neg" data-k="${k}" aria-pressed="${(CART_F.neg || '') === k}">${t}</button>`).join('');
  if (funil) funil.innerHTML = CART_ETAPAS.map(([k, t]) => `<button type="button" class="cart-et${CART_F.etapa === k ? ' on' : ''}" data-act="cart-etapa" data-k="${k}" aria-pressed="${CART_F.etapa === k}"><b>${n(k).toLocaleString('pt-BR')}</b><span>${esc(t)}</span></button>`).join('');
  const fl = $('#cart-filtros'); if (fl) fl.innerHTML = cartFiltrosHTML();
  const l = cartFiltra(IM_LISTA);
  const ct = $('#cart-ct'); if (ct) ct.textContent = `${l.length.toLocaleString('pt-BR')} de ${IM_LISTA.length.toLocaleString('pt-BR')} imóve${IM_LISTA.length === 1 ? 'l' : 'is'}${CART_F.portal && !CART_PORTAL ? ' · lendo o portal…' : ''}`;
  const semDono = l.filter((i) => !i.dono && i.logradouro && i.numero && !(i.busca_dono && ['fila', 'buscando', 'escolher'].includes(i.busca_dono.status)));
  const lote = $('#cart-lote');
  if (lote) lote.innerHTML = semDono.length > 1 ? `<button type="button" class="btn sm" data-act="cart-loc-todos" data-ids="${semDono.slice(0, 200).map((i) => i.id).join(',')}" title="Busca o dono de cada um na consulta de proprietários (gasta créditos)">Localizar proprietário dos ${Math.min(semDono.length, 200)} sem dono</button>` : '';
  $('#tb-im').innerHTML = l.length ? (modo === 'lista' ? imTabela(l) : imCards(l, { carteira: true, acoes: cartAcoes }))
    : IM_LISTA.length ? '<div class="card"><div class="empty">Nenhum imóvel com esses filtros. <a href="#" data-act="cart-limpa">Limpar filtros</a></div></div>'
      : '<div class="card"><div class="empty">A carteira está vazia. Escolha imóveis nas vitrines da base (Apartamentos, Casas…) e clique em <b>Localizar proprietário</b>, ou <a href="#/imoveis/novo">cadastre um imóvel</a>.</div></div>';
}
const cartGuarda = () => gravaPref('hh.carteira.filtros', JSON.stringify(CART_F));
ACT['cart-neg'] = (el) => { CART_F.neg = el.dataset.k; cartGuarda(); imDesenha(); };
ACT['cart-etapa'] = (el) => { CART_F.etapa = CART_F.etapa === el.dataset.k ? '' : el.dataset.k; cartGuarda(); imDesenha(); };
ACT['cart-limpa'] = () => { CART_F = {}; cartGuarda(); imDesenha(); };
document.addEventListener('change', (e) => {
  const k = e.target && e.target.dataset && e.target.dataset.cart; if (!k) return;
  CART_F[k] = e.target.value; cartGuarda();
  if (k === 'portal' && e.target.value && !CART_PORTAL) cartPortal();
  imDesenha();
});
async function cartPortal() {
  try { const l = await api('GET', '/api/portal'); CART_PORTAL = new Set(l.filter((x) => ['no-ar', 'desatualizada'].includes(x.estado) || x.automatica).map((x) => x.codigo)); } catch { CART_PORTAL = new Set(); }
  if ($('#tb-im')) imDesenha();
}
ACT['ver-foto'] = (el) => {
  const fotos = [...el.closest('.fotos').querySelectorAll('img')].map((i) => i.getAttribute('src'));
  abrirGaleria(fotos, +el.dataset.n, el.closest('.card').dataset.legenda || '');
};
ACT['im-modo'] = (el) => { gravaPref('hh.imoveis.modo', el.dataset.modo); if ($('#tb-im')) imDesenha(); };

async function telaImoveis(qs) {
  try { CART_F = JSON.parse(lerPref('hh.carteira.filtros', '{}')) || {}; } catch { CART_F = {}; }
  const veio = qs && CART_CAMPOS.filter((k) => qs.get(k));
  if (veio && veio.length) { CART_F = Object.fromEntries(veio.map((k) => [k, qs.get(k)])); cartGuarda(); }
  $('#main').innerHTML = `<h1>Carteira de imóveis</h1>
  <p class="lead">Os imóveis em operação: os da ${esc(MARCA.cliente)} e os que vieram das vitrines da base quando o proprietário foi localizado pela consulta de proprietários. Cada um anda sozinho pelas etapas, do dono localizado até o publicado.</p>
  <div class="seg cart-neg" role="group" aria-label="Venda ou locação" id="cart-neg" style="margin-bottom:10px"></div>
  <div class="cart-funil" id="cart-funil" role="group" aria-label="Etapas"></div>
  <div class="row" style="margin:12px 0 8px"><input class="inp" id="busca-im" placeholder="Buscar por código, dono, telefone do dono, condomínio, rua ou bairro" type="search" style="flex:1;min-width:200px;max-width:none">
  <div class="seg" role="group" aria-label="Modo de exibição"><button type="button" data-act="im-modo" data-modo="cards" title="Ver em cards com fotos">▦ Cards</button><button type="button" data-act="im-modo" data-modo="lista" title="Ver em lista">☰ Lista</button></div>
  <a class="btn pri" href="#/imoveis/novo">+ Novo imóvel</a></div>
  <div class="row cart-filtros" id="cart-filtros"></div><div class="row" style="margin:6px 0 12px;justify-content:space-between"><p class="muted small" id="cart-ct" style="margin:0"></p><span id="cart-lote"></span></div><div id="tb-im"></div>`;
  const carrega = async () => {
    IM_LISTA = await api('GET', '/api/imoveis?' + new URLSearchParams({ q: $('#busca-im').value }));
    if ($('#tb-im')) imDesenha();
  };
  let t; $('#busca-im').addEventListener('input', () => { clearTimeout(t); t = setTimeout(carrega, 250); });
  if (CART_F.portal) cartPortal();
  await carrega();
}

async function telaImovelForm(id) {
  const im = id ? await api('GET', `/api/imoveis/${id}`) : { tipo: 'Apartamento', status: 'captacao', cidade: 'Campinas', uf: 'SP', corretor_id: ME.id };
  const p = im.proprietario || {};
  const v = (k) => esc(im[k] ?? '');
  $('#main').innerHTML = `<a class="btn sm" href="${id ? '#/imoveis/' + id : '#/imoveis'}">← Voltar</a>
  <h1>${id ? 'Editar imóvel' : 'Novo imóvel'}</h1><div class="eyebrow depois">${id ? esc(im.codigo) : 'Cadastro inteligente'}</div>
  <p class="lead">Digite o CEP (ou a rua) e o número e clique em <b>Pesquisar endereço</b>. Os campos em verde vieram da pesquisa: confira antes de salvar. O condomínio fica gravado e os próximos cadastros no mesmo endereço saem automáticos.</p>
  <form data-form="imovel" data-id="${id || ''}" class="grid" style="gap:16px">
  <div class="grid g2">
    <fieldset><legend>Endereço</legend>
      <div class="grid g3"><label class="f">CEP<input name="cep" value="${v('cep')}" inputmode="numeric" placeholder="13087-000"></label>
        <label class="f">Número<input name="numero" value="${v('numero')}"></label><label class="f">Unidade<input name="unidade" value="${v('unidade')}" placeholder="142 Torre B"></label></div>
      <label class="f">Rua<input name="logradouro" value="${v('logradouro')}"></label>
      <div class="grid g3"><label class="f">Bairro<input name="bairro" value="${v('bairro')}"></label><label class="f">Cidade<input name="cidade" value="${v('cidade')}"></label><label class="f">UF<input name="uf" value="${v('uf')}" maxlength="2"></label></div>
      <input type="hidden" name="lat" value="${v('lat')}"><input type="hidden" name="lon" value="${v('lon')}">
      <div class="row"><button type="button" class="btn pri" data-act="pesquisar-end">Pesquisar endereço</button><span class="muted small" id="end-msg"></span></div>
    </fieldset>
    <fieldset><legend>Condomínio</legend>
      <input type="hidden" name="condominio_id" value="${v('condominio_id')}">
      <label class="f">Nome do condomínio<input name="condominio_nome" value="${v('condominio_nome')}" list="cd-alternativas"></label><datalist id="cd-alternativas"></datalist>
      <div class="small" id="cd-reconhecido"></div>
      <div class="grid g2"><label class="f">Ano de construção<input name="ano_construcao" value="${v('ano_construcao')}"></label><label class="f">Administradora<input name="administradora" value="${v('administradora')}"></label></div>
      <label class="f">Lazer<input name="lazer" value="${v('lazer')}" placeholder="Piscina, academia, salão…"></label>
    </fieldset>
  </div>
  <div class="grid g2">
    <fieldset><legend>Características e valores</legend>
      <div class="grid g2"><label class="f">Tipo<select name="tipo" ${id ? 'disabled' : ''}>${TIPOS.map((t) => `<option ${t === im.tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label class="f">Status<select name="status">${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${k === im.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="grid g3"><label class="f">Quartos<input name="quartos" type="number" min="0" value="${v('quartos')}"></label><label class="f">Suítes<input name="suites" type="number" min="0" value="${v('suites')}"></label><label class="f">Vagas<input name="vagas" type="number" min="0" value="${v('vagas')}"></label></div>
      <div class="grid g2"><label class="f">Área útil (m²)<input name="area_util" value="${v('area_util')}" inputmode="decimal"></label><label class="f">Área total (m²)<input name="area_total" value="${v('area_total')}" inputmode="decimal"></label></div>
      <div class="grid g2"><label class="f">Negócio<select name="finalidade">${Object.entries(FINALIDADE).map(([k, l]) => `<option value="${k}" ${k === (im.finalidade || 'venda') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="f">Aluguel/mês<input name="valor_locacao" value="${im.valor_locacao ? Number(im.valor_locacao).toLocaleString('pt-BR') : ''}" inputmode="numeric" placeholder="8.500"></label></div>
      <div class="grid g3"><label class="f">Valor de venda<input name="valor" value="${im.valor ? Number(im.valor).toLocaleString('pt-BR') : ''}" inputmode="numeric" placeholder="2.250.000"></label>
        <label class="f">Condomínio/mês<input name="valor_condominio" value="${v('valor_condominio')}" inputmode="decimal"></label><label class="f">IPTU/ano<input name="iptu" value="${v('iptu')}" inputmode="decimal"></label></div>
      <label class="f">Descrição para o anúncio<textarea name="descricao">${v('descricao')}</textarea></label>
    </fieldset>
    <div class="grid" style="gap:16px;align-content:start">
    <fieldset><legend>Proprietário</legend>
      <label class="f">Nome completo<input name="p_nome" value="${esc(p.nome || '')}"></label>
      <div class="grid g2"><label class="f">CPF<input name="p_cpf" value="${esc(p.cpf || '')}" inputmode="numeric"></label><label class="f">Telefone<input name="p_telefone" value="${esc(p.telefone || '')}" inputmode="tel"></label></div>
      <label class="f">E-mail<input name="p_email" type="email" value="${esc(p.email || '')}"></label>
      <label class="f">De onde veio este contato (LGPD)<select name="p_origem_dado">${['Informado pelo proprietário', 'Anúncio do próprio proprietário', 'Indicação', 'Placa no imóvel', 'Outro'].map((o) => `<option ${o === p.origem_dado ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" name="p_nao_contatar" ${p.nao_contatar ? 'checked' : ''}> Não contatar por marketing</label>
    </fieldset>
    <fieldset><legend>Responsável e exclusividade</legend>
      ${veTudo() ? `<label class="f">Corretor responsável<select name="corretor_id">${opcoesUsuarios(im.corretor_id, 'Escolha')}</select></label>` : ''}
      <div class="grid g2"><label class="chk"><input type="checkbox" name="exclusivo" ${im.exclusivo ? 'checked' : ''}> Exclusividade ${esc(MARCA.cliente)}</label><label class="f">Exclusivo até<input type="date" name="exclusivo_ate" value="${v('exclusivo_ate')}"></label></div>
    </fieldset></div>
  </div>
  <div class="row"><button class="btn pri" type="submit">${id ? 'Salvar alterações' : 'Salvar imóvel'}</button><span class="muted small">${id ? '' : 'Ao salvar, o sistema cria a pasta no Google Drive (se conectado) e procura compradores que combinam.'}</span></div>
  </form>`;
}
ACT['pesquisar-end'] = (btn) => comBotao(btn, async () => {
  const f = btn.closest('form'); const g = (n) => f.elements[n].value;
  if (!g('cep') && !g('logradouro')) throw new Error('Digite o CEP ou o nome da rua.');
  const r = await api('GET', '/api/imoveis/endereco?' + new URLSearchParams({ cep: g('cep'), logradouro: g('logradouro'), numero: g('numero'), cidade: g('cidade'), uf: g('uf') }));
  $$('.fonte', f).forEach((x) => x.remove()); $$('.auto', f).forEach((x) => x.classList.remove('auto'));
  for (const [k, val] of Object.entries(r.campos)) {
    const el = f.elements[k]; if (!el) continue;
    el.value = k === 'cep' ? String(val).replace(/(\d{5})(\d{3})/, '$1-$2') : val;
    if (el.type !== 'hidden') { el.classList.add('auto'); el.closest('label').insertAdjacentHTML('beforeend', `<span class="fonte">✓ ${esc(r.fontes[k])}</span>`); }
  }
  $('#end-msg').innerHTML = r.avisos.map(esc).join('<br>') || (r.campos.condominio_nome ? 'Condomínio encontrado.' : 'Endereço encontrado.');
  const rec = $('#cd-reconhecido');
  if (rec) rec.innerHTML = r.condominio ? `<span class="pill ${r.condominio.confianca === 'alta' ? 'ok' : 'warn'}">✓ ${esc(r.condominio.nome)}</span> <span class="muted">${esc(r.condominio.como)}</span> · <a href="#/condominios/${r.condominio.id}" target="_blank">abrir ficha do condomínio</a>` : '';
  const dl = $('#cd-alternativas'); if (dl) dl.innerHTML = (r.alternativas || []).map((a) => `<option value="${esc(a.nome)}">`).join('');
});
FORM.imovel = async (f) => {
  const d = formJSON(f); const id = f.dataset.id;
  d.proprietario = { nome: d.p_nome, cpf: d.p_cpf, telefone: d.p_telefone, email: d.p_email, origem_dado: d.p_origem_dado, nao_contatar: d.p_nao_contatar };
  Object.keys(d).filter((k) => k.startsWith('p_')).forEach((k) => delete d[k]);
  if (id) { await api('PUT', `/api/imoveis/${id}`, d); toast('Imóvel salvo'); location.hash = `#/imoveis/${id}`; }
  else {
    const r = await api('POST', '/api/imoveis', d);
    if (r.aviso) toast(r.aviso, true); else toast(`Imóvel ${r.codigo} criado${r.compradores.length ? ` · ${r.compradores.length} comprador(es) combinam` : ''}`);
    location.hash = `#/imoveis/${r.id}${r.compradores.length ? '/compradores' : ''}`;
  }
};

async function telaFicha(id, aba) {
  const im = await api('GET', `/api/imoveis/${id}`);
  const ABAS = [['dados', 'Dados'], ['arquivos', 'Arquivos e Drive'], ['compradores', 'Compradores'], ['link', 'Link interno'], ['autorizacao', 'Autorização de venda']];
  $('#main').innerHTML = `<a class="btn sm" href="#/imoveis">← Imóveis</a>
  <div class="row" style="margin-top:12px;align-items:flex-end"><div style="flex:1;min-width:240px"><h1>${esc(im.tipo)}${im.condominio_nome ? ' · ' + esc(im.condominio_nome) : ''}</h1><div class="eyebrow depois mono">${esc(im.codigo)} ${etapaPill(im.etapa)}</div></div>
    <select class="inp" style="width:auto" data-status-imovel="${im.id}">${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${k === im.status ? 'selected' : ''}>${l}</option>`).join('')}</select>
    ${im.condominio_id ? `<a class="btn" href="#/condominios/${im.condominio_id}">Condomínio</a><a class="btn" href="/condominio-3d.html?id=${im.condominio_id}&imovel=${im.id}" target="_blank" rel="noopener">Ver no 3D</a>` : ''}
    <a class="btn" href="#/imoveis/${im.id}/editar">Editar</a></div>
  <p class="lead">${esc([im.logradouro, im.numero].filter(Boolean).join(', '))}${im.unidade ? ' · ' + esc(im.unidade) : ''} · ${esc(im.bairro || '')}, ${esc(im.cidade || '')} · <b>${brl(im.valor)}</b> · corretor ${esc(im.corretor_nome || '—')}</p>
  <div class="tabs">${ABAS.map(([k, l]) => `<a href="#/imoveis/${im.id}/${k}" class="${aba === k ? 'on' : ''}">${l}</a>`).join('')}</div><div id="aba"></div>`;
  $('[data-status-imovel]').addEventListener('change', async (e) => { try { await api('PATCH', `/api/imoveis/${im.id}/status`, { status: e.target.value }); toast('Status alterado'); } catch (er) { toast(er.message, true); } });
  await ({ dados: abaDados, arquivos: abaArquivos, compradores: abaCompradores, link: abaLink, autorizacao: abaAutorizacao }[aba] || abaDados)(im);
}
function abaDados(im) {
  const p = im.proprietario;
  $('#aba').innerHTML = `<div class="grid g21"><div class="grid" style="gap:16px">
    ${im.status === 'publicado' && !im.fotos.some((f) => !f.interna) ? `<div class="card" style="border-color:var(--bad,#b3412f)"><b>Este imóvel está como publicado, mas não aparece no portal.</b><p class="small" style="margin:6px 0 0">Ele só tem fotos <b>internas</b> (do anúncio de origem), que nunca vão para o portal. Envie pelo menos uma foto própria em <a href="#/imoveis/${im.id}/arquivos">Arquivos e Drive</a> e ele entra no portal na hora, com página automática.</p></div>` : ''}<div class="card" data-legenda="${esc(im.codigo + ' · ' + im.tipo + (im.condominio_nome ? ' · ' + im.condominio_nome : ''))}"><h3>Fotos</h3>${im.fotos.length ? `<div class="fotos">${im.fotos.map((f, n) => `<button type="button" class="foto${f.interna ? ' interna' : ''}" data-act="ver-foto" data-n="${n}" aria-label="Ampliar foto ${n + 1}${f.interna ? ' (interna)' : ''}"><img src="/api/arquivos/${f.id}" alt="${esc(f.nome)}" loading="lazy" referrerpolicy="no-referrer">${f.interna ? '<span class="foto-int" title="Foto do anúncio de origem: só para a equipe, não vai para o portal">interna</span>' : ''}</button>`).join('')}</div>${im.fotos.some((f) => f.interna) ? `<p class="small muted" style="margin:8px 0 0">Fotos <b>internas</b> vêm do anúncio de origem: ficam só no sistema e nunca vão para o portal. Para publicar, envie fotos próprias em <a href="#/imoveis/${im.id}/arquivos">Arquivos e Drive</a>.</p>` : ''}` : `<div class="noimg" style="max-width:280px">Sem fotos. Envie em <a href="#/imoveis/${im.id}/arquivos">Arquivos e Drive</a>.</div>`}</div>
    <div class="grid g4">${[['Quartos', im.quartos ?? '—'], ['Suítes', im.suites ?? '—'], ['Vagas', im.vagas ?? '—'], ['Área útil', im.area_util ? im.area_util + ' m²' : '—']].map(([a, b]) => `<div class="card kpi"><div class="n" style="font-size:26px">${esc(b)}</div><div class="l">${a}</div></div>`).join('')}</div>
    <div class="card"><h3>Descrição</h3><p style="margin:0;white-space:pre-wrap">${esc(im.descricao || 'Sem descrição.')}</p></div></div>
    <div class="grid" style="gap:16px;align-content:start">
    <div class="card"><h3>Valores</h3><dl class="dl"><dt>Negócio</dt><dd>${esc(FINALIDADE[im.finalidade || 'venda'])}</dd>${im.finalidade !== 'locacao' ? `<dt>Venda</dt><dd><b>${brl(im.valor)}</b></dd>` : ''}${im.finalidade && im.finalidade !== 'venda' ? `<dt>Aluguel</dt><dd><b>${brl(im.valor_locacao)}</b>/mês</dd>` : ''}<dt>Valor/m²</dt><dd>${im.valor && im.area_util ? brl(im.valor / im.area_util) : '—'}</dd><dt>Condomínio</dt><dd>${brl(im.valor_condominio)}</dd><dt>IPTU</dt><dd>${brl(im.iptu)}</dd></dl></div>
    <div class="card"><h3>Condomínio</h3><dl class="dl"><dt>Nome</dt><dd>${esc(im.condominio_nome || '—')}</dd><dt>Ano</dt><dd>${esc(im.ano_construcao || '—')}</dd><dt>Lazer</dt><dd>${esc(im.lazer || '—')}</dd><dt>Adm.</dt><dd>${esc(im.administradora || '—')}</dd></dl></div>
    <div class="card"><h3>Proprietário</h3>${p ? `<dl class="dl"><dt>Nome</dt><dd>${esc(p.nome)}</dd><dt>CPF</dt><dd>${esc(p.cpf || '—')}</dd><dt>Telefone</dt><dd>${esc(tel(p.telefone) || '—')}</dd><dt>E-mail</dt><dd>${esc(p.email || '—')}</dd><dt>Origem</dt><dd>${esc(p.origem_dado)}</dd></dl>${p.nao_contatar ? '<span class="pill bad" style="margin-top:8px">não contatar</span>' : ''}` : `<p class="muted" style="margin:0 0 8px">Não cadastrado. <a href="#/imoveis/${im.id}/editar">Adicionar à mão</a> ou localize pela consulta de proprietários:</p><div class="row" style="gap:8px">${cartAcoes({ ...im, dono: null })}</div>`}
      <div class="row" style="margin-top:10px">${im.exclusivo ? `<span class="pill gold">Exclusivo${im.exclusivo_ate ? ' até ' + new Date(im.exclusivo_ate + 'T12:00').toLocaleDateString('pt-BR') : ''}</span>` : '<span class="pill warn">Sem exclusividade</span>'}</div></div>
    ${im.ficha ? `<div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Ficha</h3>${fichaBarra(im.ficha)}</div>
      ${im.ficha.falta.length ? `<ul class="cart-falta">${im.ficha.falta.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted small" style="margin:8px 0 0">Tudo preenchido.</p>'}</div>` : ''}
    ${im.fisguei_ids && im.fisguei_ids.length ? '<div class="card" id="ficha-fisgar"><h3>Dados da consulta</h3><p class="muted small">Carregando…</p></div>' : ''}
  </div></div>`;
  if (im.fisguei_ids && im.fisguei_ids.length) fichaFisgar(im);
}
// pessoas e telefones que o Fisgar trouxe para este endereço, com a situação de cada uma no robô
const FG_PESSOA = { pendente: ['info', 'na fila do robô'], abordando: ['warn', 'robô chamou'], respondeu: ['warn', 'respondeu'], confirmou: ['ok', 'confirmou que é o dono'], negou: ['bad', 'não é o dono'], sem_interesse: ['bad', 'sem interesse'], parar: ['bad', 'pediu para parar'] };
const FG_ENVIO = { fila: 'na fila', enviado: 'mensagem enviada', respondeu: 'respondeu', pulado: 'não será chamado', fixo: 'fixo' };
async function fichaFisgar(im) {
  let d; try { d = await api('GET', `/api/imoveis/${im.id}/fisgar`); } catch { return; }
  const el = $('#ficha-fisgar'); if (!el) return;
  const a = d.anuncios[0];
  el.innerHTML = `<div class="row" style="justify-content:space-between"><h3 style="margin:0">Dados da consulta</h3>${a ? `<a class="btn sm" href="#/fisguei/${a.id}">Anúncio e conversa</a>` : ''}</div>
    <p class="muted small" style="margin:6px 0 10px">${a ? `${esc(a.ref)}${a.anunciante_nome ? ' · anunciado por ' + esc(a.anunciante_nome) : ''}${a.anunciante_tipo === 'particular' ? ' (particular)' : ''}` : ''}</p>
    ${d.pessoas.length ? `<div class="list">${d.pessoas.map((p) => { const [c, t] = FG_PESSOA[p.status] || ['info', p.status]; const tels = p.contatos.filter((x) => x.tipo === 'tel');
      return `<div class="item" style="flex-wrap:wrap;align-items:flex-start"><div style="flex:1;min-width:160px"><div class="t">${esc(p.nome)}</div>
        <div class="muted small">${esc([p.relacao, p.unidade, p.idade ? p.idade + ' anos' : ''].filter(Boolean).join(' · '))}</div>
        ${tels.length ? `<div class="small" style="margin-top:4px">${tels.map((x) => `${esc(tel(x.valor))} <span class="muted">(${esc(FG_ENVIO[x.envio] || x.envio)})</span>`).join('<br>')}</div>` : p.consultado ? '<div class="muted small">sem telefone</div>' : '<div class="muted small">não consultado (sem gastar crédito)</div>'}</div>
        <span class="pill ${c}">${esc(t)}</span></div>`; }).join('')}</div>` : '<p class="muted small">A consulta ainda não trouxe ninguém para este endereço.</p>'}`;
}
async function abaArquivos(im) {
  const d = await api('GET', `/api/imoveis/${im.id}/arquivos`);
  const porCat = Object.fromEntries(d.subpastas.map((s) => [s, []])); d.arquivos.forEach((a) => (porCat[a.categoria] || (porCat[a.categoria] = [])).push(a));
  const link = (a) => a.id ? `/api/arquivos/${a.id}` : `/api/drive/arquivo/${im.id}/${encodeURIComponent(a.drive_id)}`;
  $('#aba').innerHTML = `${d.drive.conectado ? `<div class="banner" style="background:var(--ok-bg)">Google Drive conectado (${esc(d.drive.conta || '')}). ${im.drive_link ? `<a href="${esc(im.drive_link)}" target="_blank" rel="noopener">Abrir pasta no Drive</a>` : veTudo() ? '<a href="#" data-act="criar-pasta" data-id="' + im.id + '">Criar pasta no Drive</a>' : ''}</div>`
    : `<div class="banner warn">Google Drive não conectado: os arquivos ficam guardados neste PC e sobem para o Drive quando o administrativo conectar.</div>`}
  ${d.aviso ? `<div class="banner warn">${esc(d.aviso)}</div>` : ''}
  <form class="card row" data-form="upload" data-id="${im.id}" style="margin-bottom:16px"><label class="f" style="flex:1;min-width:180px">Pasta<select name="categoria">${d.subpastas.map((s) => `<option>${esc(s)}</option>`).join('')}</select></label>
    <label class="f" style="flex:2;min-width:220px">Arquivos (até 25 MB cada)<input type="file" name="arquivos" multiple required></label><button class="btn pri" type="submit" style="align-self:flex-end">Enviar</button></form>
  <div class="grid g2">${Object.entries(porCat).map(([cat, arr]) => `<div class="card"><div class="row"><h3 style="margin:0">📁 ${esc(cat)}</h3><span class="sp"></span><span class="muted small">${arr.length}</span></div>
    ${arr.length ? `<div class="list" style="margin-top:10px">${arr.map((a) => `<div class="row small" style="flex-wrap:nowrap"><a href="${link(a)}" target="_blank" rel="noopener" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.nome)}</a>
      ${a.so_drive ? '<span class="pill info">só no Drive</span>' : a.drive_id ? '<span class="pill ok">no Drive</span>' : '<span class="pill warn">só no PC</span>'}</div>`).join('')}</div>` : '<p class="muted small" style="margin:8px 0 0">Vazia</p>'}</div>`).join('')}</div>`;
}
FORM.upload = async (f) => {
  const fd = new FormData(f);
  const r = await api('POST', `/api/imoveis/${f.dataset.id}/arquivos`, fd, true);
  toast(`${r.enviados} arquivo(s) enviado(s)`); if (r.aviso) setTimeout(() => toast(r.aviso, true), 1200);
  rota();
};
ACT['criar-pasta'] = (el) => comBotao(null, async () => { const r = await api('POST', `/api/imoveis/${el.dataset.id}/drive/pasta`); toast('Pasta criada no Drive'); window.open(r.link, '_blank', 'noopener'); rota(); });

async function abaCompradores(im) {
  const l = await api('GET', `/api/imoveis/${im.id}/compradores`);
  $('#aba').innerHTML = `<p class="lead">Leads ativos cujo perfil combina com este imóvel (verba, quartos, vagas, tipo e bairro).</p>
  ${l.length ? `<div class="card tbl"><table><thead><tr><th>Combina</th><th>Cliente</th><th>Procura</th><th>Etapa</th><th>Corretor</th><th><span class="vis-oculto">Ações</span></th></tr></thead><tbody>${l.map((c) => `<tr><td><span class="pill ok">${c.score}%</span></td><td><b>${esc(c.nome)}</b><br><span class="muted small">${esc(c.motivos.join(' · '))}</span></td><td>${esc(c.busca || '')}</td><td>${esc(c.etapa)}</td><td>${esc(c.corretor || '—')}</td>
    <td>${veTudo() || c.corretor_id === ME.id ? `<a class="btn sm" href="#/leads/${c.id}">Abrir</a>` : '<span class="muted small">outro corretor</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nenhum lead combina ainda. Cadastre o perfil de busca dos clientes no CRM.</div>'}`;
}
async function abaLink(im) {
  const [links, leads] = await Promise.all([api('GET', `/api/imoveis/${im.id}/links`), api('GET', '/api/leads')]);
  const ativo = (k) => new Date(k.expira_em.replace(' ', 'T')) > new Date();
  $('#aba').innerHTML = `<div class="grid g12"><form class="card grid" data-form="link" data-id="${im.id}" style="gap:12px;align-content:start"><h3>Novo link interno</h3>
    <p class="muted small" style="margin:0">Mostra o imóvel a um cliente escolhido sem publicar no portal. Não mostra dados do proprietário. Registra cada acesso.</p>
    <label class="f">Para o cliente (opcional)<select name="lead_id"><option value="">—</option>${leads.map((l) => `<option value="${l.id}">${esc(l.nome)}</option>`).join('')}</select></label>
    <label class="f">Validade<select name="dias"><option value="2">48 horas</option><option value="7" selected>7 dias</option><option value="30">30 dias</option></select></label>
    <label class="chk"><input type="checkbox" name="mostrar_endereco"> Mostrar rua e número</label><button class="btn pri" type="submit">Gerar link</button></form>
  <div class="card"><h3>Links gerados</h3>${links.length ? `<div class="list">${links.map((k) => `<div class="item" style="flex-direction:column;align-items:stretch">
    <div class="row"><b>${esc(k.lead || 'Sem cliente definido')}</b>${ativo(k) ? '<span class="pill ok">ativo</span>' : '<span class="pill bad">expirado</span>'}<span class="sp"></span><span class="muted small">${k.acessos} acesso(s)${k.ultimo_acesso ? ' · último ' + dataBR(k.ultimo_acesso) : ''}</span></div>
    ${ativo(k) ? `<div class="copybox"><input class="inp mono" readonly value="${esc(k.url)}"><button class="btn sm" data-act="copiar" data-txt="${esc(k.url)}">Copiar</button><button class="btn sm danger" data-act="revogar-link" data-id="${im.id}" data-lid="${k.id}">Revogar</button></div>` : ''}
    <span class="muted small">Expira ${dataBR(k.expira_em)}</span></div>`).join('')}</div>` : '<div class="empty">Nenhum link ainda.</div>'}</div></div>`;
}
FORM.link = async (f) => { const r = await api('POST', `/api/imoveis/${f.dataset.id}/links`, formJSON(f)); await copiar(r.url); rota(); };
ACT['revogar-link'] = (el) => comBotao(null, async () => { if (!confirm('Revogar este link? O cliente não conseguirá mais abrir.')) return; await api('DELETE', `/api/imoveis/${el.dataset.id}/links/${el.dataset.lid}`); rota(); });

async function abaAutorizacao(im) {
  const l = await api('GET', `/api/imoveis/${im.id}/autorizacoes`);
  const p = im.proprietario;
  $('#aba').innerHTML = `<div class="grid g12"><form class="card grid" data-form="autorizacao" data-id="${im.id}" style="gap:12px;align-content:start"><h3>Gerar autorização de venda</h3>
    ${p && p.cpf ? `<p class="muted small" style="margin:0">Proprietário: <b>${esc(p.nome)}</b> · CPF ${esc(p.cpf)}</p>` : `<div class="banner warn" style="margin:0">Cadastre nome e CPF do proprietário antes. <a href="#/imoveis/${im.id}/editar">Editar imóvel</a></div>`}
    <div class="grid g2"><label class="f">Prazo (dias)<input name="prazo_dias" type="number" value="180" min="30" max="720"></label><label class="f">Comissão (%)<input name="comissao_pct" value="6" inputmode="decimal"></label></div>
    <label class="f">Matrícula nº (opcional)<input name="matricula"></label>
    <label class="chk"><input type="checkbox" name="exclusivo" checked> Com exclusividade</label>
    <label class="f">Observações (opcional)<textarea name="observacoes"></textarea></label>
    <button class="btn pri" type="submit" ${p && p.cpf ? '' : 'disabled'}>Gerar e criar link de assinatura</button>
    <p class="muted small" style="margin:0">O texto é um modelo inicial: peça ao advogado da ${esc(MARCA.cliente)} para revisar antes de usar com clientes.</p></form>
  <div class="card"><h3>Autorizações</h3><div id="aut-novo"></div>${l.length ? `<div class="list">${l.map((a) => `<div class="item" style="flex-direction:column;align-items:stretch"><div class="row">
    <span class="pill ${a.status === 'assinado' ? 'ok' : a.status === 'pendente' ? 'warn' : 'bad'}">${esc(a.status)}</span><span class="small">${a.prazo_dias} dias · ${String(a.comissao_pct).replace('.', ',')}% · ${a.exclusivo ? 'exclusiva' : 'sem exclusividade'}</span><span class="sp"></span><span class="muted small">${dataBR(a.criado_em)}</span></div>
    ${a.status === 'assinado' ? `<div class="small">Assinada por <b>${esc(a.assinante_nome)}</b> em ${esc(a.assinado_em)}${a.pdf_arquivo_id ? ` · <a href="/api/arquivos/${a.pdf_arquivo_id}" target="_blank" rel="noopener">Abrir PDF</a>` : ''}</div>` : ''}
    ${a.status === 'pendente' ? `<div class="copybox"><input class="inp mono" readonly value="${esc(a.url)}"><button class="btn sm" data-act="copiar" data-txt="${esc(a.url)}">Copiar</button><button class="btn sm danger" data-act="cancelar-aut" data-id="${im.id}" data-aid="${a.id}">Cancelar</button></div>` : ''}</div>`).join('')}</div>` : '<div class="empty">Nenhuma autorização gerada.</div>'}</div></div>`;
}
FORM.autorizacao = async (f) => {
  const r = await api('POST', `/api/imoveis/${f.dataset.id}/autorizacao`, formJSON(f));
  await abaAutorizacao(await api('GET', `/api/imoveis/${f.dataset.id}`));
  const msg = `Olá! Segue a autorização de venda do seu imóvel para assinatura eletrônica. É só abrir, conferir, informar o CPF e assinar com o dedo: ${r.url}`;
  const wa = r.telefone ? `https://wa.me/${String(r.telefone).replace(/\D/g, '').replace(/^(?!55)/, '55')}?text=${encodeURIComponent(msg)}` : null;
  $('#aut-novo').innerHTML = `<div class="sug" style="margin-bottom:12px"><b>Link de assinatura criado</b><div class="copybox"><input class="inp mono" readonly value="${esc(r.url)}"><button class="btn sm" data-act="copiar" data-txt="${esc(r.url)}">Copiar</button></div>
    <div class="row">${wa ? `<a class="btn sm pri" href="${esc(wa)}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a>` : ''}<a class="btn sm" href="${esc(r.url)}" target="_blank" rel="noopener">Assinar aqui (presencial)</a></div>
    ${/localhost|127\.0\.0\.1/.test(r.url) ? '<span class="small muted">Este link só abre neste PC. Para o proprietário abrir de casa, configure o endereço público (PUBLIC_URL) — veja Configurações.</span>' : ''}</div>`;
};
ACT['cancelar-aut'] = (el) => comBotao(null, async () => { if (!confirm('Cancelar este link de assinatura?')) return; await api('POST', `/api/imoveis/${el.dataset.id}/autorizacoes/${el.dataset.aid}/cancelar`); rota(); });

// ---------- CRM ----------
async function telaLeads(qs = new URLSearchParams()) {
  const aguardando = qs.get('aguardando') === '1';
  $('#main').innerHTML = `<h1>${aguardando ? 'Leads aguardando resposta' : 'Funil de vendas'}</h1>${aguardando ? '<p class="muted">Última mensagem recebida do cliente, ainda sem resposta. <a href="#/leads">Ver todos</a></p>' : ''}<p class="lead"><span class="so-mouse">Arraste o cartão para mudar a etapa.</span><span class="so-toque">Use "Mover para" no cartão para mudar a etapa; deslize para o lado para ver as outras colunas.</span> ${veTudo() ? 'Você vê os leads de todos os corretores.' : 'Você vê só os seus leads.'}</p>
  <div class="row" style="margin-bottom:12px"><input class="inp" id="busca-ld" placeholder="Buscar por nome, telefone ou o que procura" style="flex:1;min-width:200px"><button class="btn pri" data-act="novo-lead">+ Novo lead</button></div><div class="kanban" id="kb"></div>`;
  const carrega = async () => {
    const leads = await api('GET', '/api/leads?' + new URLSearchParams({ q: $('#busca-ld').value, aguardando: aguardando ? '1' : '' }));
    $('#kb').innerHTML = ETAPAS.map(([k, l]) => { const c = leads.filter((x) => x.etapa === k); return `<div class="col" data-etapa="${k}"><h4>${l}<span class="mono">${c.length}</span></h4>
      ${c.map((x) => `<div class="lc" draggable="true" data-lead="${x.id}"><b>${esc(x.nome)}</b><div class="muted">${esc(x.busca || tel(x.telefone) || '')}</div>
        <div class="row" style="margin-top:6px;gap:6px"><span class="pill ${TEMP[x.temperatura]}">${esc(x.temperatura)}</span>${x.valor_max ? `<span class="small muted">até ${brl(x.valor_max)}</span>` : ''}</div>
        <div class="muted small" style="margin-top:4px">${esc(x.origem || '')}${veTudo() ? ' · ' + esc(x.corretor_nome || 'sem corretor') : ''}</div>
        <label class="lc-mover so-toque"><span>Mover para</span><select data-lead="${x.id}" aria-label="Mover ${esc(x.nome)} para outra etapa">${ETAPAS.map(([k2, l2]) => `<option value="${k2}" ${k2 === k ? 'selected' : ''}>${l2}</option>`).join('')}</select></label></div>`).join('')}</div>`; }).join('');
    $$('.lc-mover').forEach((m) => m.addEventListener('click', (e) => e.stopPropagation()));
    $$('.lc-mover select').forEach((sel) => sel.addEventListener('change', async () => { try { await api('PATCH', `/api/leads/${sel.dataset.lead}/etapa`, { etapa: sel.value }); toast('Etapa alterada'); carrega(); } catch (er) { toast(er.message, true); } }));
    $$('.lc').forEach((c) => {
      c.addEventListener('click', () => { location.hash = `#/leads/${c.dataset.lead}`; });
      c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.dataset.lead); c.classList.add('drag'); });
      c.addEventListener('dragend', () => c.classList.remove('drag'));
    });
    $$('.col').forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', () => col.classList.remove('over'));
      col.addEventListener('drop', async (e) => { e.preventDefault(); col.classList.remove('over'); try { await api('PATCH', `/api/leads/${e.dataTransfer.getData('text/plain')}/etapa`, { etapa: col.dataset.etapa }); carrega(); } catch (er) { toast(er.message, true); } });
    });
  };
  let t; $('#busca-ld').addEventListener('input', () => { clearTimeout(t); t = setTimeout(carrega, 250); });
  await carrega();
}
const camposLead = (l = {}) => `
  <div class="grid g2"><label class="f">Nome<input name="nome" required value="${esc(l.nome || '')}"></label><label class="f">Telefone (WhatsApp)<input name="telefone" value="${esc(tel(l.telefone))}" inputmode="tel"></label></div>
  <div class="grid g2"><label class="f">E-mail<input name="email" type="email" value="${esc(l.email || '')}"></label><label class="f">Origem<input name="origem" list="origens" value="${esc(l.origem || '')}"><datalist id="origens">${['Site ' + MARCA.cliente, 'WhatsApp', 'ZAP Imóveis', 'Imovelweb', 'Chaves na Mão', 'Google Ads', 'Instagram', 'Indicação', 'Placa'].map((o) => `<option>${esc(o)}</option>`).join('')}</datalist></label></div>
  <label class="f">O que procura (texto livre)<input name="busca" value="${esc(l.busca || '')}" placeholder="4 quartos perto do Dom Pedro"></label>
  <div class="grid g4"><label class="f">Tipo<select name="tipo_desejado"><option value="">Qualquer</option>${TIPOS.map((t) => `<option ${t === l.tipo_desejado ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    <label class="f">Quartos mín.<input name="quartos_min" type="number" min="0" value="${esc(l.quartos_min ?? '')}"></label><label class="f">Vagas mín.<input name="vagas_min" type="number" min="0" value="${esc(l.vagas_min ?? '')}"></label>
    <label class="f">Verba até<input name="valor_max" inputmode="numeric" value="${l.valor_max ? Number(l.valor_max).toLocaleString('pt-BR') : ''}"></label></div>
  <label class="f">Bairros/regiões (separe por vírgula)<input name="bairros" value="${esc(l.bairros || '')}"></label>
  <div class="grid g3"><label class="f">Etapa<select name="etapa">${ETAPAS.map(([k, n]) => `<option value="${k}" ${k === (l.etapa || 'novo') ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="f">Temperatura<select name="temperatura">${Object.keys(TEMP).map((k) => `<option ${k === (l.temperatura || 'morno') ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
    ${veTudo() ? `<label class="f">Corretor<select name="corretor_id">${opcoesUsuarios(l.corretor_id)}</select></label>` : '<span></span>'}</div>
  <label class="chk"><input type="checkbox" name="nao_contatar" ${l.nao_contatar ? 'checked' : ''}> Não contatar (pediu para não receber mensagens)</label>`;
ACT['novo-lead'] = () => modal(`<h2>Novo lead</h2><form data-form="novo-lead" class="grid" style="gap:12px">${camposLead(veTudo() ? {} : { corretor_id: ME.id })}<div class="row"><span class="sp"></span><button type="button" class="btn" data-fecha>Cancelar</button><button class="btn pri" type="submit">Salvar</button></div></form>`);
FORM['novo-lead'] = async (f) => { const r = await api('POST', '/api/leads', formJSON(f)); fechaModal(); location.hash = `#/leads/${r.id}`; };

async function telaLead(id) {
  const [l, imoveis] = await Promise.all([api('GET', `/api/leads/${id}`), api('GET', '/api/imoveis')]);
  $('#main').innerHTML = `<a class="btn sm" href="#/leads">← Funil</a>
  <div class="row" style="margin-top:12px"><div style="flex:1"><h1>${esc(l.nome)}</h1><div class="eyebrow depois">Lead · ${esc(l.origem || 'sem origem')}</div></div>
    ${l.telefone ? `<a class="btn pri" href="#/whats/${l.id}">Abrir conversa</a>` : ''}</div>
  <p class="lead">${esc(tel(l.telefone))}${l.email ? ' · ' + esc(l.email) : ''} · corretor ${esc(l.corretor_nome || '—')} ${l.nao_contatar ? '<span class="pill bad">não contatar</span>' : ''}</p>
  <div class="grid g2"><form class="card grid" data-form="lead" data-id="${l.id}" style="gap:12px;align-content:start"><h3>Dados e perfil de busca</h3>${camposLead(l)}<div><button class="btn pri" type="submit">Salvar</button></div></form>
  <div class="grid" style="gap:16px;align-content:start">
    <div class="card"><h3>Imóveis que combinam</h3>${l.imoveis.length ? `${imCards(l.imoveis, { mini: true, badge: (i) => `<span class="pill ok">${i.score}% combina</span>`, extra: (i) => `<div class="muted small" style="margin-top:4px">${esc(i.motivos.join(' · '))}</div>`, acoes: (i) => `<button class="btn sm" data-act="enviar-link" data-imovel="${i.id}" data-lead="${l.id}">Enviar link</button>` })}` : '<div class="empty">Preencha verba, quartos ou tipo para ver o match.</div>'}</div>
    <form class="card grid" data-form="visita" data-lead="${l.id}" style="gap:10px"><h3>Agendar visita</h3><div class="grid g2"><label class="f">Imóvel<select name="imovel_id" required>${(l.imoveis.length ? l.imoveis : imoveis).map((i) => `<option value="${i.id}">${esc(i.codigo)} · ${esc(i.condominio || i.condominio_nome || i.tipo)}</option>`).join('')}</select></label>
      <label class="f">Data e hora<input type="datetime-local" name="data_hora" required></label></div><div><button class="btn" type="submit">Agendar</button></div>
      ${l.visitas.length ? `<div class="list">${l.visitas.map((v) => `<div class="small"><span class="mono">${dataBR(v.data_hora)}</span> · ${esc(v.codigo)} · <span class="pill ${v.status === 'realizada' ? 'ok' : v.status === 'cancelada' ? 'bad' : 'info'}">${esc(v.status)}</span>${v.avaliacao ? ' · ' + esc(v.avaliacao) : ''}</div>`).join('')}</div>` : ''}</form>
    <div class="card"><h3>Histórico</h3><form data-form="nota" data-id="${l.id}" class="copybox" style="margin-bottom:10px"><input class="inp" name="texto" placeholder="Anotar ligação, conversa, objeção…" required><button class="btn" type="submit">Anotar</button></form>
      <div class="timeline">${l.interacoes.map((i) => `<div><span class="when">${dataBR(i.criado_em)} · ${esc(i.autor || 'Sistema')}</span><br>${esc(i.texto)}</div>`).join('') || '<span class="muted small">Sem registros.</span>'}</div></div>
  </div></div>`;
}
FORM.lead = async (f) => { await api('PUT', `/api/leads/${f.dataset.id}`, formJSON(f)); toast('Lead salvo'); rota(); };
FORM.nota = async (f) => { await api('POST', `/api/leads/${f.dataset.id}/nota`, formJSON(f)); rota(); };
FORM.visita = async (f) => { await api('POST', '/api/visitas', { ...formJSON(f), lead_id: f.dataset.lead }); toast('Visita agendada'); rota(); };
ACT['enviar-link'] = (el) => comBotao(el, async () => { const r = await api('POST', `/api/imoveis/${el.dataset.imovel}/links`, { lead_id: el.dataset.lead, dias: 7 }); await copiar(r.url); toast('Link de 7 dias copiado. Cole na conversa com o cliente.'); });

// ---------- WhatsApp ----------
async function telaWhats(leadId) {
  const d = await api('GET', '/api/whats');
  $('#main').innerHTML = `<a class="muted small" href="#/whats">← Escritório virtual</a><h1>Conversas do CRM</h1>
  <p class="lead">Todas as conversas com clientes, de todos os agentes e da API oficial. Respostas sugeridas pelos agentes do escritório aparecem aqui para aprovar.</p>
  ${d.modo === 'simulado' ? `<div class="banner warn"><b>Modo simulado:</b> a API oficial do WhatsApp ainda não foi configurada. Use “Simular mensagem recebida” para testar o fluxo; nada é enviado de verdade.</div>` : ''}
  <div class="grid g12"><div class="grid" style="gap:12px;align-content:start">
    ${d.modo === 'simulado' ? `<form class="card grid" data-form="simular" style="gap:8px"><h3>Simular mensagem recebida</h3><div class="grid g2"><input class="inp" name="telefone" placeholder="(19) 99999-0000" required><input class="inp" name="nome" placeholder="Nome do cliente"></div><input class="inp" name="texto" placeholder="Oi, vi o apartamento…" required><button class="btn" type="submit">Receber</button></form>` : ''}
    <div class="card list" id="conversas">${d.conversas.length ? d.conversas.map((c) => `<div class="item click ${c.id === leadId ? 'sel' : ''}" data-act="ir" data-href="#/whats/${c.id}"><div style="flex:1;min-width:0"><div class="t">${esc(c.nome)}</div>
      <div class="muted small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.direcao === 'saida' ? '✓ ' : ''}${esc(c.ultima)}</div>${veTudo() ? `<div class="muted small">${esc(c.corretor || 'sem corretor')}${c.agente ? ' · robô ' + esc(c.agente) : ''}</div>` : ''}</div>
      <div style="text-align:right">${c.tem_sugestao ? '<span class="pill gold">IA</span>' : c.direcao === 'entrada' ? '<span class="pill bad">aguarda</span>' : ''}<div class="muted small">${dataBR(c.criado_em)}</div></div></div>`).join('') : '<div class="empty">Nenhuma conversa ainda.</div>'}</div></div>
  <div class="card" id="conversa">${leadId ? '' : '<div class="empty">Escolha uma conversa.</div>'}</div></div>`;
  if (leadId) { await carregaConversa(leadId); poll = setInterval(() => carregaConversa(leadId, true), 6000); }
  atualizaBadge();
}
async function carregaConversa(leadId, silencioso) {
  const box = $('#conversa'); if (!box) return clearInterval(poll);
  const d = await api('GET', `/api/whats/${leadId}`);
  if (!document.body.contains(box)) return;
  const sug = d.mensagens.find((m) => m.direcao === 'sugestao');
  const msgs = d.mensagens.filter((m) => m.direcao !== 'sugestao');
  const assinatura = JSON.stringify(d.mensagens.map((m) => m.id + m.status));
  if (silencioso && box.dataset.sig === assinatura) return;
  const rascunho = $('#wmsg') ? $('#wmsg').value : '';
  box.dataset.sig = assinatura;
  box.innerHTML = `<div class="row"><b>${esc(d.lead.nome)}</b><span class="muted small">${esc(tel(d.lead.telefone))}</span><span class="sp"></span><a class="btn sm" href="#/leads/${d.lead.id}">Ficha do lead</a></div>
    <div class="chat" id="chat" style="margin-top:10px">${msgs.map((m) => `<div class="msg ${m.direcao}">${esc(m.texto)}<small>${esc(m.autor || '')} · ${dataBR(m.criado_em)}${m.direcao === 'saida' ? ' · ' + esc(m.status || '') : ''}</small></div>`).join('') || '<span class="muted small">Sem mensagens.</span>'}</div>
    ${d.lead.nao_contatar ? '<div class="banner warn" style="margin-top:10px">Este cliente pediu para não receber mensagens.</div>' : `
    ${sug ? `<div class="sug" style="margin-top:10px"><span class="small"><b>Sugestão ${esc(autorDaIA(sug.autor) ? 'da IA' : 'de ' + sug.autor)}</b> · confira antes de enviar</span><textarea class="inp" id="sugtxt" rows="3">${esc(sug.texto)}</textarea>
      <div class="row"><button class="btn pri sm" data-act="aprovar" data-id="${leadId}">Aprovar e enviar</button><button class="btn sm" data-act="sugerir" data-id="${leadId}">Gerar outra</button></div></div>`
      : `<div class="row" style="margin-top:8px"><button class="btn sm" data-act="sugerir" data-id="${leadId}">Pedir sugestão à IA</button></div>`}
    <form class="copybox" data-form="enviar" data-id="${leadId}" style="margin-top:10px"><input class="inp" id="wmsg" name="texto" placeholder="Escrever mensagem…" autocomplete="off" required><button class="btn pri" type="submit">Enviar</button></form>`}`;
  if ($('#wmsg')) $('#wmsg').value = rascunho;
  const c = $('#chat'); if (c) c.scrollTop = c.scrollHeight;
}
FORM.enviar = async (f) => { await api('POST', `/api/whats/${f.dataset.id}/enviar`, formJSON(f)); f.reset(); await carregaConversa(+f.dataset.id); };
FORM.simular = async (f) => { const r = await api('POST', '/api/whats/simular', formJSON(f)); toast('Mensagem recebida. A IA pode levar alguns segundos para sugerir.'); navega(`#/whats/${r.lead_id}`); };
ACT.aprovar = (el) => comBotao(el, async () => { await api('POST', `/api/whats/${el.dataset.id}/enviar`, { texto: $('#sugtxt').value, da_ia: true }); await carregaConversa(+el.dataset.id); atualizaBadge(); });
ACT.sugerir = (el) => comBotao(el, async () => { await api('POST', `/api/whats/${el.dataset.id}/sugerir`); await carregaConversa(+el.dataset.id); });

// ---------- visitas ----------
async function telaVisitas() {
  const l = await api('GET', '/api/visitas');
  const dias = {}; l.forEach((v) => (dias[v.data_hora.slice(0, 10)] = dias[v.data_hora.slice(0, 10)] || []).push(v));
  const hoje = new Date().toISOString().slice(0, 10);
  $('#main').innerHTML = `<h1>Visitas</h1><p class="lead">Confirme, registre como foi e cancele visitas. Agende pela ficha do lead. Funciona no celular pelo endereço da rede mostrado na janela do sistema.</p>
  ${Object.keys(dias).length ? Object.entries(dias).map(([d, vs]) => `<h3 style="margin-top:16px">${new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}${d === hoje ? ' · hoje' : ''}</h3>
    <div class="list">${vs.map((v) => `<div class="item" style="flex-wrap:wrap"><span class="mono" style="min-width:48px">${v.data_hora.slice(11, 16)}</span><a href="#/imoveis/${v.imovel_id}" aria-label="Abrir imóvel ${esc(v.codigo)}">${miniFoto(v)}</a><div style="flex:1;min-width:200px">
      <div class="t">${esc(v.codigo)} · ${esc(v.condominio || [v.logradouro, v.numero].filter(Boolean).join(', '))}</div><div class="muted small">${esc(v.lead)} · ${esc(tel(v.telefone))}${veTudo() ? ' · ' + esc(v.corretor || '') : ''}${v.avaliacao ? ' · “' + esc(v.avaliacao) + '”' : ''}</div></div>
      <span class="pill ${v.status === 'realizada' ? 'ok' : v.status === 'cancelada' ? 'bad' : v.status === 'confirmada' ? 'info' : 'warn'}">${esc(v.status)}</span>
      ${['agendada', 'confirmada'].includes(v.status) ? `<div class="row" style="gap:6px">${v.status === 'agendada' ? `<button class="btn sm" data-act="visita" data-id="${v.id}" data-st="confirmada">Confirmar</button>` : ''}<button class="btn sm pri" data-act="visita" data-id="${v.id}" data-st="realizada">Realizada</button><button class="btn sm danger" data-act="visita" data-id="${v.id}" data-st="cancelada">Cancelar</button></div>` : ''}</div>`).join('')}</div>`).join('')
    : '<div class="empty">Nenhuma visita nos últimos 30 dias nem agendada.</div>'}`;
}
ACT.visita = (el) => {
  if (el.dataset.st !== 'realizada') return comBotao(el, async () => { await api('PATCH', `/api/visitas/${el.dataset.id}`, { status: el.dataset.st }); rota(); });
  modal(`<h2>Como foi a visita?</h2><form data-form="visita-ok" data-id="${el.dataset.id}" class="grid" style="gap:12px"><label class="f">Avaliação<select name="avaliacao"><option>Gostou, quer fazer proposta</option><option>Gostou, vai pensar</option><option>Não gostou do imóvel</option><option>Achou caro</option><option>Outro</option></select></label>
    <label class="f">Comentário (opcional)<input name="comentario"></label><div class="row"><span class="sp"></span><button type="button" class="btn" data-fecha>Cancelar</button><button class="btn pri" type="submit">Registrar</button></div></form>`);
};
FORM['visita-ok'] = async (f) => { const d = formJSON(f); await api('PATCH', `/api/visitas/${f.dataset.id}`, { status: 'realizada', avaliacao: d.avaliacao + (d.comentario ? ' — ' + d.comentario : '') }); fechaModal(); toast('Visita registrada'); rota(); };

// ---------- configurações ----------
async function telaConfig(qs) {
  const adm = ME.perfil === 'adm';
  const [ig, us, au, chaves] = await Promise.all([
    api('GET', '/api/integracoes'), api('GET', '/api/usuarios'),
    adm ? api('GET', '/api/auditoria') : Promise.resolve([]),
    adm ? api('GET', '/api/chaves') : Promise.resolve([]),
  ]);
  const dv = ig.drive;
  const msgDrive = qs.get('drive');
  $('#main').innerHTML = `<h1>Configurações</h1>
  ${msgDrive ? `<div class="banner ${msgDrive === 'ok' ? '' : 'warn'}" style="${msgDrive === 'ok' ? 'background:var(--ok-bg)' : ''}">${msgDrive === 'ok' ? 'Google Drive conectado.' : esc(msgDrive)}</div>` : ''}
  <div class="grid g3">
    <div class="card"><div class="row"><h3 style="margin:0">Google Drive</h3><span class="sp"></span>${dv.conectado ? '<span class="pill ok">conectado</span>' : '<span class="pill warn">desconectado</span>'}</div>
      ${dv.conectado ? `<p class="small">Conta: <b>${esc(dv.conta || '—')}</b><br>Pasta raiz: ${esc(dv.raiz)}<br>Arquivos só no PC: <b>${dv.pendentes}</b></p>
        <div class="row">${dv.pendentes && veTudo() ? '<button class="btn sm pri" data-act="drive-pendentes">Enviar pendentes</button>' : ''}${adm ? '<button class="btn sm danger" data-act="drive-sair">Desconectar</button>' : ''}</div>`
      : dv.configurado ? `<p class="small">Clique para entrar com a conta Google da ${esc(MARCA.cliente)} e autorizar o sistema a criar as pastas dos imóveis.</p>${adm ? '<button class="btn pri sm" data-act="drive-conectar">Conectar Google Drive</button>' : '<p class="muted small">Peça ao administrativo.</p>'}`
      : `<p class="small">Falta configurar o acesso do Google no arquivo <span class="mono">.env</span> (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET). O passo a passo está no arquivo <b>COMO-CONFIGURAR.txt</b>.</p><p class="small">URI de redirecionamento para cadastrar no Google:<br><span class="mono">${esc(dv.redirect)}</span></p>`}</div>
    <div class="card"><div class="row"><h3 style="margin:0">WhatsApp</h3><span class="sp"></span>${ig.whatsapp.modo === 'oficial' ? '<span class="pill ok">API oficial</span>' : '<span class="pill warn">simulado</span>'}</div>
      <p class="small">${ig.whatsapp.modo === 'oficial' ? `Webhook: <span class="mono">${esc(ig.whatsapp.webhook)}</span><br>Assinatura da Meta: ${ig.whatsapp.segredo ? '<b>verificada</b>' : '<b style="color:var(--bad)">falta WA_APP_SECRET — webhooks recusados</b>'}` : 'Sem as credenciais da Cloud API no .env, o sistema funciona em modo de teste. O passo a passo está no COMO-CONFIGURAR.txt.'}</p></div>
    <div class="card"><div class="row"><h3 style="margin:0">IA local (Ollama)</h3><span class="sp"></span>${ig.ia.ok ? (ig.ia.instalado ? '<span class="pill ok">pronta</span>' : '<span class="pill warn">modelo faltando</span>') : '<span class="pill bad">desligada</span>'}</div>
      <p class="small">Modelo: <span class="mono">${esc(ig.ia.modelo)}</span><br>Modo: <b>${esc({ desligado: 'desligada', sugerir: 'sugere e o corretor aprova', automatico: 'responde sozinha' }[ig.ia.modo] || ig.ia.modo)}</b>
      ${ig.ia.ok && !ig.ia.instalado ? `<br>Rode no PowerShell: <span class="mono">ollama pull ${esc(ig.ia.modelo)}</span>` : ''}${!ig.ia.ok ? '<br>Abra o Ollama no PC para ativar as sugestões.' : ''}</p></div>
  </div>
  ${!ig.public_url ? '<div class="banner warn" style="margin-top:16px">Sem endereço público configurado: links de assinatura e de imóvel só abrem neste PC ou na rede do escritório. Veja “Endereço público” no COMO-CONFIGURAR.txt.</div>' : ''}
  <div class="grid g21" style="margin-top:16px">
    <div class="card"><div class="row"><h2 style="margin:0">Usuários</h2><span class="sp"></span>${adm ? '<button class="btn pri sm" data-act="novo-usuario">+ Novo usuário</button>' : ''}</div>
      <div class="tbl" style="margin-top:10px"><table><thead><tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Situação</th>${adm ? '<th><span class="vis-oculto">Ações</span></th>' : ''}</tr></thead><tbody>${us.map((u) => `<tr><td>${esc(u.nome)}</td><td class="mono">${esc(u.email || '')}</td><td>${esc(u.perfil)}</td><td>${u.ativo === 0 ? '<span class="pill bad">inativo</span>' : '<span class="pill ok">ativo</span>'}</td>
        ${adm ? `<td style="white-space:nowrap">${u.id !== ME.id ? `<button class="btn sm" data-act="reset-senha" data-id="${u.id}">Nova senha</button> <button class="btn sm ${u.ativo ? 'danger' : ''}" data-act="ativo" data-id="${u.id}" data-v="${u.ativo ? 0 : 1}">${u.ativo ? 'Desativar' : 'Ativar'}</button>` : '<span class="muted small">você</span>'}</td>` : ''}</tr>`).join('')}</tbody></table></div></div>
    <div class="grid" style="gap:16px;align-content:start"><form class="card grid" data-form="meu-telefone" style="gap:10px"><h2 style="margin:0">Meu WhatsApp</h2><p class="muted small" style="margin:0">Vai no QR code das cartas de captação quando a ${esc(MARCA.cliente)} não tiver um número central (WHATSAPP_CLIENTE no .env).</p><label class="f">Celular com DDD<input name="telefone" inputmode="tel" value="${esc(tel(ME.telefone || ''))}"></label><div><button class="btn" type="submit">Salvar</button></div></form>
    <form class="card grid" data-form="minha-senha" style="gap:10px;align-content:start"><h2 style="margin:0">Minha senha</h2><label class="f">Senha atual<input type="password" name="atual" required autocomplete="current-password"></label><label class="f">Nova senha<input type="password" name="nova" required minlength="8" autocomplete="new-password"></label><div><button class="btn" type="submit">Trocar senha</button></div></form></div>
  </div>
  ${adm && typeof secaoChavesApi === 'function' ? secaoChavesApi(chaves, !!ig.gestor_plataforma) : ''}
  ${adm ? `<div class="card" style="margin-top:16px"><h2>Registro de atividades</h2><div class="tbl" style="max-height:320px;overflow:auto"><table><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>${au.slice(0, 80).map((a) => `<tr><td class="mono">${dataBR(a.em)}</td><td>${esc(a.nome || 'Sistema / público')}</td><td>${esc(a.acao)}</td><td class="small">${esc(a.detalhe || '')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
}
ACT['drive-conectar'] = (el) => comBotao(el, async () => { const r = await api('GET', '/api/drive/conectar'); location.href = r.url; });
ACT['drive-sair'] = (el) => comBotao(el, async () => { if (!confirm('Desconectar o Google Drive? Os arquivos no Drive continuam lá.')) return; await api('POST', '/api/drive/desconectar'); rota(); });
ACT['drive-pendentes'] = (el) => comBotao(el, async () => { const r = await api('POST', '/api/drive/enviar-pendentes'); toast(`${r.enviados} enviado(s)${r.pendentes ? ', ' + r.pendentes + ' com erro' : ''}`, !!r.pendentes); rota(); });
ACT['novo-usuario'] = () => modal(`<h2>Novo usuário</h2><form data-form="novo-usuario" class="grid" style="gap:12px"><label class="f">Nome<input name="nome" required></label>
  <div class="grid g2"><label class="f">E-mail (login)<input name="email" type="email" required></label><label class="f">Telefone<input name="telefone" inputmode="tel"></label></div>
  <div class="grid g2"><label class="f">Perfil<select name="perfil"><option value="corretor">Corretor (vê só os seus)</option><option value="gestor">Gestor (vê tudo)</option><option value="adm">Administrativo (vê tudo e gerencia usuários)</option></select></label>
  <label class="f">Senha inicial<input name="senha" required minlength="8" value="${'Casa' + Math.random().toString().slice(2, 8)}"></label></div>
  <p class="muted small" style="margin:0">Passe a senha ao corretor e peça para trocar no primeiro acesso.</p><div class="row"><span class="sp"></span><button type="button" class="btn" data-fecha>Cancelar</button><button class="btn pri" type="submit">Criar</button></div></form>`);
FORM['novo-usuario'] = async (f) => { await api('POST', '/api/usuarios', formJSON(f)); fechaModal(); await carregaBase(); toast('Usuário criado'); rota(); };
ACT['reset-senha'] = (el) => modal(`<h2>Nova senha</h2><form data-form="reset-senha" data-id="${el.dataset.id}" class="grid" style="gap:12px"><label class="f">Nova senha<input name="senha" required minlength="8" value="${'Casa' + Math.random().toString().slice(2, 8)}"></label><p class="muted small" style="margin:0">A pessoa será desconectada e entra com a nova senha.</p><div class="row"><span class="sp"></span><button type="button" class="btn" data-fecha>Cancelar</button><button class="btn pri" type="submit">Salvar</button></div></form>`);
FORM['reset-senha'] = async (f) => { await api('PATCH', `/api/usuarios/${f.dataset.id}`, formJSON(f)); fechaModal(); toast('Senha alterada'); };
ACT.ativo = (el) => comBotao(el, async () => { await api('PATCH', `/api/usuarios/${el.dataset.id}`, { ativo: +el.dataset.v }); await carregaBase(); rota(); });
FORM['meu-telefone'] = async (f) => { await api('POST', '/api/me/telefone', formJSON(f)); ME = await api('GET', '/api/me'); toast('WhatsApp salvo'); };
FORM['minha-senha'] = async (f) => { await api('POST', '/api/me/senha', formJSON(f)); f.reset(); toast('Senha trocada'); };

// O login começa com marca.js e app.js. As outras telas pedem o arquivo delas na rota.
liberaCss('css-completo');
liberaCss('css-fontes');
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inicio); else inicio();

// Áreas que rolam (tabelas largas, linha do tempo, funil, feed) precisam ser alcançáveis pelo teclado.
(() => {
  const SEL = '.tbl,.timeline,#kb,#ev-feed,.rolar';
  let t = 0, nTab = 0;
  const marca = () => { t = 0; document.querySelectorAll(SEL).forEach((el) => { if (!el.hasAttribute('tabindex')) { el.tabIndex = 0; if (!el.getAttribute('role')) el.setAttribute('role', 'region'); if (!el.getAttribute('aria-label')) { const card = el.closest('.card,section'); const h = card && card.querySelector('h2,h3,h4'); el.setAttribute('aria-label', el.id === 'kb' ? 'Funil de vendas (role para o lado)' : el.id === 'ev-feed' ? 'Acontecendo agora' : (h ? h.textContent.trim().slice(0, 60) + ' (tabela)' : 'Tabela ' + (++nTab))); } } }); };
  new MutationObserver(() => { if (!t) t = setTimeout(marca, 120); }).observe(document.documentElement, { childList: true, subtree: true });
})();
