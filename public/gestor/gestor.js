/* Painel do gestor · Herrera HOUSE IA (sem frameworks; tudo passa por esc() antes de virar HTML) */
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');
const mi = (v) => { v = Number(v) || 0; return v >= 1e9 ? 'R$ ' + (v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' bi' : v >= 1e6 ? 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi' : brl(v); };
const n = (v) => (Number(v) || 0).toLocaleString('pt-BR');
const quando = (s) => { if (!s) return '—'; const d = new Date(String(s).replace(' ', 'T')); const min = Math.round((Date.now() - d.getTime()) / 60000); if (min < 2) return 'agora'; if (min < 60) return `há ${min} min`; const h = Math.round(min / 60); if (h < 24) return `há ${h} h`; const dd = Math.round(h / 24); return dd < 30 ? `há ${dd} dia${dd > 1 ? 's' : ''}` : d.toLocaleDateString('pt-BR'); };
const SITU = { ativa: 'Ativa', suspensa: 'Suspensa', implantacao: 'Em implantação' };
const ACAO = { criou: 'cadastrou', editou: 'editou', suspendeu: 'suspendeu', reativou: 'reativou', viu_instalacao: 'viu os dados de instalação de', publicada: 'marcou como publicada', senha: 'trocou a senha do painel', banco_ciclo: 'rodou o banco de matérias:', materias_dia: 'mudou as matérias por dia de', lgpd_atendido: 'respondeu o pedido de titular', ia_central_chave: 'alterou a chave central do Gemini', ia_central_modelo: 'alterou o modelo central do Gemini' };

async function api(metodo, url, corpo) {
  const r = await fetch('/gestor-api' + url, { method: metodo, headers: { 'Content-Type': 'application/json', 'X-Gestor': '1' }, body: corpo ? JSON.stringify(corpo) : undefined, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/login') { telaEntrada(); throw new Error(j.erro || 'Entre de novo.'); }
  if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
  return j;
}
function aviso(t, ruim) { const a = document.createElement('div'); a.className = 'aviso' + (ruim ? ' ruim' : ''); a.setAttribute('role', 'status'); a.textContent = t; document.body.appendChild(a); setTimeout(() => a.remove(), 4200); }
const comBotao = async (b, fn) => { b.disabled = true; try { await fn(); } catch (e) { aviso(e.message, true); } finally { b.disabled = false; } };

// ---------- entrada ----------
function telaEntrada() {
  $('#raiz').innerHTML = `<main class="entrada"><form id="f-entrar" autocomplete="on">
    <h1 class="marca">Herrera HOUSE IA<span>Painel do gestor</span></h1>
    <p class="muted pequeno">As imobiliárias da plataforma, os números de cada uma e os valores do mês.</p>
    <label class="c">E-mail<input name="email" type="email" required autocomplete="username"></label>
    <label class="c">Senha<input name="senha" type="password" required autocomplete="current-password"></label>
    <button class="btn pri" type="submit">Entrar</button><p class="erro" id="e-entrar" role="alert" hidden></p></form></main>`;
  $('#f-entrar').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target, b = $('button', f);
    b.disabled = true; $('#e-entrar').hidden = true;
    try { await api('POST', '/login', { email: f.email.value, senha: f.senha.value }); iniciar(); }
    catch (err) { $('#e-entrar').textContent = err.message; $('#e-entrar').hidden = false; b.disabled = false; }
  });
}

// ---------- painel ----------
let DADOS = null, FILTRO = 'todas', EU = null;
function topoGestor(ativa = 'imobiliarias') {
  const abas = [['imobiliarias', '/gestor', 'Imobiliárias'], ['cerebro', '/gestor/cerebro', 'Cérebro'], ['dashboard', '/gestor/dashboard', 'Dashboard'], ['projecao', '/gestor/projecao', 'Projeção 10 anos']];
  return `<header class="topo"><div class="topo-in"><div class="marca">Herrera HOUSE IA<span>Painel do gestor</span></div><nav class="sim-nav" aria-label="Painel do gestor">${abas.map(([id, href, nome]) => `<a class="btn sm${ativa === id ? ' pri' : ''}" href="${href}"${ativa === id ? ' aria-current="page"' : ''}>${nome}</a>`).join('')}</nav><div class="sp"></div>
    <span class="muted pequeno">${esc(EU.nome)}</span><button class="btn sm" id="b-senha">Trocar senha</button><button class="btn sm" id="b-sair">Sair</button></div></header>`;
}
function ligaTopoGestor() {
  $('#b-sair').onclick = async () => { await api('POST', '/logout').catch(() => {}); telaEntrada(); };
  $('#b-senha').onclick = janelaSenha;
}
async function iniciar() {
  try { EU = await api('GET', '/eu'); } catch { return; }
  if (document.body.dataset.pagina === 'cerebro') return telaCerebro();
  $('#raiz').innerHTML = `${topoGestor()}
    <main><h1>Imobiliárias</h1><p class="muted">Cada imobiliária tem o sistema, o portal e o blog dela, com banco separado. A base de condomínios e o 3D são comuns.</p>
    <div id="kpis" class="kpis"></div>
    <div class="cab"><h2>Clientes</h2><div class="sp"></div>
      <div class="filtros" role="group" aria-label="Filtrar">${['todas', 'ativa', 'implantacao', 'suspensa'].map((k) => `<button type="button" data-f="${k}" aria-pressed="${FILTRO === k}">${k === 'todas' ? 'Todas' : SITU[k]}</button>`).join('')}</div>
      <button class="btn" id="b-rapida" title="O formulário de uma tela só, sem o assistente">Cadastro rápido</button>
      <button class="btn pri hz-chama" id="b-nova"><span class="hz-mini" aria-hidden="true"></span>+ Nova imobiliária com o Herrera</button></div>
    <div id="lista" class="imobs"><div class="vazio">Carregando os números…</div></div>
    <section class="banco" aria-labelledby="t-banco"><div class="cab"><h2 id="t-banco">Banco de matérias do blog</h2><div class="sp"></div>
      <button class="btn" id="b-banco">Buscar prontas e entregar agora</button></div>
      <p class="muted pequeno">Cada matéria vai para uma imobiliária só. A entrega roda sozinha às 20h30 e às 4h30, conforme o plano de cada uma (Essencial 1, Profissional 2, Rede e Fundador 3 por dia).</p>
      <div id="banco"><div class="vazio">Carregando o estoque…</div></div></section>
    <section class="banco" aria-labelledby="t-lgpd"><div class="cab"><h2 id="t-lgpd">Pedidos de titulares (LGPD)</h2><div class="sp"></div>
      <a class="btn" href="/privacidade" target="_blank" rel="noopener">Ver a página de privacidade</a></div>
      <p class="muted pequeno">Pedidos feitos em corretordofuturo.app/privacidade. Prazo de resposta: 15 dias. Pedidos feitos no portal de cada imobiliária ficam no sistema dela (Sistema › Privacidade e LGPD).</p>
      <div id="lgpd"><div class="vazio">Carregando…</div></div></section>
    <section class="atividade"><h2>Atividade recente</h2><ol id="ativ"></ol></section></main>`;
  ligaTopoGestor();
  $('#b-nova').onclick = () => (window.Herrera ? Herrera.abrir() : janelaNova());
  $('#b-rapida').onclick = janelaNova;
  $('#b-banco').onclick = async (ev) => {
    const b = ev.currentTarget; b.disabled = true; b.textContent = 'Rodando…';
    try {
      const r = await api('POST', '/banco/ciclo');
      const n = (r.hoje.entregues || []).length + ((r.amanha && r.amanha.entregues) || []).length;
      const falta = (r.hoje.faltaram || []).length + ((r.amanha && r.amanha.faltaram) || []).length;
      aviso(`${r.sincronizacao.novas} nova(s) no banco · ${n} entregue(s)${falta ? ` · ${falta} horário(s) sem matéria` : ''}${r.sincronizacao.erro ? ' · ramo: ' + r.sincronizacao.erro : ''}`, !!falta);
      carregar();
    } catch (e) { aviso(e.message, true); }
    b.disabled = false; b.textContent = 'Buscar prontas e entregar agora';
  };
  document.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { FILTRO = b.dataset.f; document.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', x === b)); desenhaLista(); });
  await carregar();
}
async function carregar() {
  try {
    const [d, ev, bc] = await Promise.all([api('GET', '/imobiliarias'), api('GET', '/eventos'), api('GET', '/banco').catch((e) => ({ erro: e.message }))]);
    DADOS = d; desenhaKpis(); desenhaLista(); desenhaBanco(bc);
    api('GET', '/lgpd').then(desenhaLgpd).catch((e) => { const a = $('#lgpd'); if (a) a.innerHTML = `<div class="vazio">${esc(e.message)}</div>`; });
    $('#ativ').innerHTML = ev.length ? ev.map((e) => `<li><span class="n">${esc(new Date(e.em.replace(' ', 'T')).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))}</span><span>${e.acao === 'banco_materias' ? 'Entrega do banco de matérias:' : `Você ${esc(ACAO[e.acao] || e.acao)}`} ${e.imobiliaria ? `<b>${esc(e.imobiliaria)}</b>` : ''}${(e.acao === 'editou' || e.acao.startsWith('banco') || e.acao === 'materias_dia') && e.detalhe ? ` <span class="muted">(${esc(e.detalhe)})</span>` : ''}</span></li>`).join('') : '<li class="muted">Nada ainda.</li>';
  } catch (e) { $('#lista').innerHTML = `<div class="vazio">${esc(e.message)}</div>`; }
}
// ---------- Cérebro da plataforma ----------
async function telaCerebro() {
  $('#raiz').innerHTML = `${topoGestor('cerebro')}<main id="cerebro">
    <h1>Cérebro da plataforma</h1><p class="muted">A chave central do Gemini atende as imobiliárias sem configuração individual. Acompanhe aqui o consumo de todos os modelos centrais.</p>
    <section class="cerebro-bloco" aria-labelledby="t-chave"><h2 id="t-chave">Chave central · Gemini</h2>
      <p id="ia-estado" role="status">Carregando a configuração…</p>
      <form id="f-cerebro" autocomplete="off"><fieldset class="cerebro-controles" disabled>
        <div class="campos"><label class="c">Nova chave<input name="chave" type="password" autocomplete="new-password" spellcheck="false" maxlength="200" aria-describedby="ia-ajuda" placeholder="Cole uma chave para cadastrar ou substituir"></label>
          <label class="c">Modelo<select name="modelo" required aria-describedby="ia-modelos-msg"><option value="gemini-flash-latest">gemini-flash-latest</option></select></label></div>
        <p id="ia-ajuda" class="muted pequeno">Deixe a chave vazia para guardar apenas o modelo. As imobiliárias recebem a alteração em até 5 minutos.</p>
        <div class="cerebro-acoes"><button type="submit" class="btn pri">Guardar</button><button type="button" class="btn" id="ia-testar">Testar</button><button type="button" class="btn" id="ia-modelos">Atualizar modelos</button><button type="button" class="btn perigo" id="ia-remover">Remover</button></div>
      </fieldset></form><p id="ia-modelos-msg" class="muted pequeno" role="status"></p><p id="ia-teste" role="status" aria-live="polite"></p>
    </section>
    <section class="banco" aria-labelledby="t-consumo"><div class="cab"><h2 id="t-consumo">Consumo por imobiliária</h2><div class="sp"></div>
      <div class="filtros" role="group" aria-label="Período do consumo">${[['hoje', 'Hoje'], ['mes', 'Este mês'], ['mes_passado', 'Mês passado']].map(([v, t]) => `<button type="button" data-periodo="${v}" aria-pressed="${v === 'mes'}">${t}</button>`).join('')}</div><button class="btn" id="ia-atualizar">Atualizar consumo</button></div>
      <p class="muted pequeno">Horário de São Paulo. Ordenado pela soma dos tokens de entrada e saída. Os testes deste painel aparecem separados.</p>
      <div id="ia-consumo" aria-live="polite"><div class="vazio">Carregando o consumo…</div></div>
    </section><section class="banco" aria-labelledby="t-grafico"><h2 id="t-grafico">Últimos 30 dias</h2><p class="muted pequeno">Tokens de entrada + saída, somando todas as imobiliárias e os testes da plataforma. Selecione uma barra para ver os números do dia.</p>
      <div id="ia-grafico"></div><p id="ia-dia" class="muted pequeno" role="status"></p></section></main>`;
  ligaTopoGestor();
  const raiz = $('#cerebro'), f = $('#f-cerebro'), controles = $('fieldset', f), estado = $('#ia-estado');
  const modelo = f.elements.modelo, chave = f.elements.chave, teste = $('#ia-teste'), modelosMsg = $('#ia-modelos-msg');
  let periodo = 'mes', temChave = false, carregamento = 0, ocupado = false, configuracaoCarregada = false;
  function habilitar() {
    controles.disabled = ocupado || !configuracaoCarregada;
    for (const id of ['#ia-testar', '#ia-remover', '#ia-modelos']) $(id, raiz).disabled = ocupado || !temChave;
    raiz.querySelectorAll('[data-periodo], #ia-atualizar').forEach((b) => { b.disabled = ocupado; });
  }
  function configuracao(c) {
    configuracaoCarregada = true;
    temChave = c.tem_chave;
    estado.textContent = `${temChave ? 'Chave cadastrada: …' + c.chave_final : 'Nenhuma chave central cadastrada.'} · Modelo em uso: ${c.modelo} · Última alteração da chave pelo painel: ${c.alterada_em ? new Date(String(c.alterada_em).replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(c.alterada_em) ? '' : '-03:00')).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'sem registro anterior'}`;
    modelo.replaceChildren(new Option(c.modelo, c.modelo));
    habilitar();
  }
  async function modelos() {
    if (!temChave) { modelosMsg.textContent = 'Guarde uma chave para listar e testar os modelos disponíveis.'; return; }
    modelosMsg.textContent = 'Consultando modelos da chave central…';
    const selecionado = modelo.value;
    try {
      const d = await api('GET', '/cerebro/modelos');
      if (!raiz.isConnected) return;
      modelo.replaceChildren(...d.modelos.map((m) => new Option(m.nome + ' · ' + m.id, m.id)));
      if (!d.modelos.some((m) => m.id === selecionado)) modelo.prepend(new Option(selecionado + ' (modelo em uso; fora da lista)', selecionado));
      modelo.value = selecionado;
      modelosMsg.textContent = d.modelos.length ? `${n(d.modelos.length)} modelos disponíveis. Guardar aplica a escolha; Testar usa o modelo selecionado e a chave já guardada.` : 'Nenhum modelo de texto retornado. O modelo em uso foi mantido.';
    } catch (e) { modelosMsg.textContent = e.message; }
  }
  async function carregarUso(inicial = false) {
    const vez = ++carregamento;
    // Após guardar ou remover, o estado anterior não serve mais: uma falha precisa permitir recarregar a configuração.
    if (inicial) configuracaoCarregada = false;
    const alvo = $('#ia-consumo', raiz); alvo.setAttribute('aria-busy', 'true');
    alvo.innerHTML = '<div class="vazio">Carregando o consumo…</div>';
    try {
      const d = await api('GET', '/cerebro?periodo=' + periodo);
      if (!raiz.isConnected || vez !== carregamento) return;
      if (inicial) configuracao(d.configuracao);
      const valores = (r) => ['chamadas', 'tokens_entrada', 'tokens_saida', 'erros'].map((k) => `<td class="dir n">${n(r[k])}</td>`).join('');
      alvo.innerHTML = `${d.total.chamadas ? '' : '<p class="muted">Nenhum consumo registrado neste período.</p>'}<div class="tabela-rolo"><table class="tab"><caption class="sr-only">Consumo ${periodo === 'hoje' ? 'de hoje' : periodo === 'mes' ? 'deste mês' : 'do mês passado'}</caption><thead><tr><th scope="col">Imobiliária</th><th scope="col" class="dir">Chamadas</th><th scope="col" class="dir">Tokens de entrada</th><th scope="col" class="dir">Tokens de saída</th><th scope="col" class="dir">Erros</th></tr></thead><tbody>${d.imobiliarias.map((r) => `<tr><th scope="row">${esc(r.nome)}</th>${valores(r)}</tr>`).join('') || '<tr><td colspan="5">Nenhuma imobiliária cadastrada.</td></tr>'}</tbody><tfoot><tr><th scope="row">Total</th>${valores(d.total)}</tr></tfoot></table></div>`;
      const max = Math.max(1, ...d.dias.map((r) => r.tokens_entrada + r.tokens_saida));
      $('#ia-grafico', raiz).innerHTML = `<div class="cerebro-grafico">${d.dias.map((r, i) => {
        const total = r.tokens_entrada + r.tokens_saida, data = r.dia.split('-').reverse().join('/');
        const descricao = `${data}: ${n(total)} tokens · ${n(r.chamadas)} chamadas · ${n(r.erros)} erros`;
        return `<button type="button" class="cerebro-dia" title="${esc(descricao)}" aria-label="${esc(descricao)}"><span class="cerebro-coluna"><span class="cerebro-barra" style="height:${total / max * 100}%"></span></span><span class="cerebro-data" aria-hidden="true">${i % 5 === 0 || i === d.dias.length - 1 ? esc(data.slice(0, 5)) : '&nbsp;'}</span></button>`;
      }).join('')}</div>`;
      $('#ia-dia', raiz).textContent = d.dias.some((r) => r.chamadas) ? 'Os dias sem consumo ficam com a barra vazia.' : 'Nenhum consumo registrado nos últimos 30 dias.';
      raiz.querySelectorAll('.cerebro-dia').forEach((b) => { b.onclick = b.onfocus = () => { $('#ia-dia', raiz).textContent = b.getAttribute('aria-label'); }; });
      if (inicial) await modelos();
    } catch (e) {
      if (!raiz.isConnected || vez !== carregamento) return;
      alvo.innerHTML = `<div class="vazio">${esc(e.message)}</div>`;
      if (inicial) estado.textContent = 'Não foi possível carregar a configuração. Use Atualizar consumo para tentar novamente.';
    } finally { if (vez === carregamento) alvo.removeAttribute('aria-busy'); }
  }
  async function acao(fn) {
    if (ocupado) return;
    ocupado = true; habilitar();
    try { await fn(); } catch (e) { aviso(e.message, true); }
    finally { ocupado = false; if (raiz.isConnected) habilitar(); }
  }
  f.onsubmit = (e) => {
    e.preventDefault();
    const nova = chave.value.trim(); chave.value = '';
    if (!temChave && !nova) { aviso('Cole a chave central primeiro.', true); return; }
    acao(async () => {
      await api('POST', '/cerebro/chave', { modelo: modelo.value, ...(nova ? { chave: nova } : {}) });
      teste.textContent = ''; aviso('Configuração central guardada.'); await carregarUso(true);
    });
  };
  $('#ia-remover', raiz).onclick = () => janela('<h2>Remover a chave central do Gemini?</h2><p>As imobiliárias deixarão de usar esta chave em até 5 minutos.</p><div class="rod"><button type="button" class="btn" data-fecha>Cancelar</button><button type="button" class="btn perigo" id="ia-confirmar">Remover chave</button></div>', (d) => {
    $('#ia-confirmar', d).onclick = () => acao(async () => {
      d.close(); await api('POST', '/cerebro/chave', { chave: null });
      chave.value = ''; teste.textContent = ''; aviso('Chave central removida.'); await carregarUso(true);
    });
  });
  $('#ia-testar', raiz).onclick = () => acao(async () => {
    teste.className = 'muted'; teste.textContent = 'Fazendo uma pergunta curta ao Gemini…';
    try {
      const r = await api('POST', '/cerebro/testar', { modelo: modelo.value });
      teste.className = r.ok ? 'cerebro-ok' : 'erro';
      teste.textContent = `${r.ok ? 'OK' : 'Erro'} · ${r.mensagem} (${(r.ms / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s)`;
    } catch (e) { teste.className = 'erro'; teste.textContent = e.message; }
    await carregarUso();
  });
  $('#ia-modelos', raiz).onclick = () => acao(modelos);
  $('#ia-atualizar', raiz).onclick = () => acao(() => carregarUso(!configuracaoCarregada));
  raiz.querySelectorAll('[data-periodo]').forEach((b) => { b.onclick = () => {
    periodo = b.dataset.periodo; raiz.querySelectorAll('[data-periodo]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    acao(() => carregarUso(!configuracaoCarregada));
  }; });
  await acao(() => carregarUso(true));
}

const TIPOS = { principal: 'artigos', noticia: 'notícias', dica: 'dicas' };
function desenhaLgpd(d) {
  const alvo = $('#lgpd'); if (!alvo) return;
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const dias = (p) => Math.round((new Date(p + 'T12:00') - new Date(hoje + 'T12:00')) / 864e5);
  const abertos = d.pedidos.filter((p) => p.situacao === 'aberto').length;
  alvo.innerHTML = `<p class="pequeno"><b>${abertos}</b> aberto(s) · <b>${d.pedidos.length - abertos}</b> respondido(s) · <b>${d.nao_contatar.toLocaleString('pt-BR')}</b> número(s) na lista "não contatar" de toda a plataforma</p>`
    + (d.pedidos.length ? `<ol class="atividade lgpd-lista">${d.pedidos.map((p) => `<li><span class="n">${esc(p.protocolo)}</span><span><b>${esc(d.tipos[p.tipo] || p.tipo)}</b> · ${esc(p.nome || '')}${p.telefone ? ' · ' + esc(p.telefone) : ''}${p.email ? ' · ' + esc(p.email) : ''}${p.imobiliaria ? ' · sobre ' + esc(p.imobiliaria) : ''}
      ${p.mensagem ? `<br><span class="muted">${esc(p.mensagem)}</span>` : ''}
      <br>${p.situacao === 'aberto' ? `<span class="${dias(p.prazo) <= 3 ? 'ruim' : 'muted'}">prazo ${esc(p.prazo.split('-').reverse().join('/'))}${dias(p.prazo) < 0 ? ' · ATRASADO' : ''}</span> <button class="btn sm" data-lgpd="${p.id}" data-prot="${esc(p.protocolo)}">Registrar resposta</button>` : `<span class="muted">respondido em ${esc(p.atendido_em || '')}: ${esc(p.resposta || '')}</span>`}</span></li>`).join('')}</ol>` : '<div class="vazio">Nenhum pedido até agora.</div>');
  alvo.querySelectorAll('[data-lgpd]').forEach((b) => b.onclick = () => janela(`<h2>Responder ${esc(b.dataset.prot)}</h2><form><label>O que foi feito e respondido ao titular<textarea name="resposta" rows="5" required></textarea></label><div class="acoes"><button type="button" class="btn" data-fecha>Cancelar</button><button class="btn pri" type="submit">Registrar</button></div></form>`, (j) => {
    $('form', j).onsubmit = async (e) => { e.preventDefault(); try { await api('POST', `/lgpd/${b.dataset.lgpd}/atender`, { resposta: e.target.resposta.value }); j.close(); aviso('Resposta registrada'); carregar(); } catch (er) { aviso(er.message, true); } };
  }));
}
function desenhaBanco(b) {
  const alvo = $('#banco'); if (!alvo) return;
  if (!b || b.erro) { alvo.innerHTML = `<div class="vazio">${esc((b && b.erro) || 'Sem dados do banco.')}</div>`; return; }
  const l = b.livres || {}, dias = b.dias_de_estoque;
  const nivel = dias === null ? '' : dias < 3 ? ' ruim' : dias < 7 ? ' atencao' : ' bom';
  const quando = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  alvo.innerHTML = `<div class="kpis banco-kpis">
      <div class="kpi${nivel}"><div class="v">${dias === null ? '—' : esc(String(dias).replace('.', ','))}</div><div class="l">dia(s) de estoque${dias !== null && dias < 3 ? ' · escrever mais' : ''}</div></div>
      <div class="kpi"><div class="v">${n(b.total_livres)}</div><div class="l">prontas no banco · ${Object.entries(TIPOS).map(([k, t]) => `${n(l[k] || 0)} ${t}`).join(' · ')}</div></div>
      <div class="kpi"><div class="v">${n(b.consumo_dia)}</div><div class="l">entregas por dia</div></div>
      <div class="kpi"><div class="v">${n(b.entregues)}</div><div class="l">entregues até hoje${b.vencidas ? ` · ${n(b.vencidas)} notícia(s) venceram` : ''}</div></div></div>
    <div class="banco-grade">
      <div class="tabela-rolo"><table class="tab"><thead><tr><th>Imobiliária</th><th>Por dia</th><th class="dir">Recebidas</th><th>Última</th></tr></thead><tbody>
      ${(b.por_imobiliaria || []).map((i) => {
        const im = ((DADOS && DADOS.imobiliarias) || []).find((x) => x.slug === i.slug);
        const fixo = im ? im.materias_dia : null;
        return `<tr><td>${esc(i.nome)}</td><td><select data-mat="${im ? im.id : ''}" aria-label="Matérias por dia de ${esc(i.nome)}" ${im ? '' : 'disabled'}>
          <option value="" ${fixo === null || fixo === undefined ? 'selected' : ''}>Pelo plano (${n(i.por_dia)})</option>${[0, 1, 2, 3].map((k) => `<option value="${k}" ${fixo === k ? 'selected' : ''}>${k}</option>`).join('')}</select></td>
          <td class="dir n">${n(i.recebidas)}</td><td class="n">${quando(i.ultima)}</td></tr>`;
      }).join('') || '<tr><td colspan="4" class="muted">Nenhuma imobiliária ativa.</td></tr>'}</tbody></table></div>
      <div><h3 class="sub">Últimas entregas</h3><ol class="ultimas">${(b.ultimas || []).map((u) => `<li><span class="n muted">${quando(u.publicar_em)}</span> <b>${esc(u.imobiliaria)}</b> · ${esc(TIPOS[u.tipo] ? TIPOS[u.tipo].replace(/s$/, '') : u.tipo)} · ${esc(u.titulo)}</li>`).join('') || '<li class="muted">Nenhuma ainda. As primeiras saem quando a fábrica entregar matérias prontas.</li>'}</ol></div>
    </div>`;
  alvo.querySelectorAll('[data-mat]').forEach((sel) => sel.onchange = async () => {
    try { await api('POST', `/imobiliarias/${sel.dataset.mat}/materias`, { materias_dia: sel.value === '' ? null : Number(sel.value) }); aviso('Salvo.'); carregar(); }
    catch (e) { aviso(e.message, true); }
  });
}
function desenhaKpis() {
  const r = DADOS.resumo;
  const k = (v, l, cls = '') => `<div class="kpi ${cls}"><div class="v">${v}</div><div class="l">${esc(l)}</div></div>`;
  $('#kpis').innerHTML = k(n(r.ativas), `imobiliária${r.ativas === 1 ? '' : 's'} ativa${r.ativas === 1 ? '' : 's'}${r.implantacao ? ` · ${r.implantacao} em implantação` : ''}${r.suspensas ? ` · ${r.suspensas} suspensa${r.suspensas > 1 ? 's' : ''}` : ''}`)
    + k(brl(r.mensalidades), 'mensalidades por mês (ativas)', 'destaque')
    + k(brl(r.comissao_mes), 'sua parte das vendas deste mês (estimada)')
    + k(mi(r.vgv), 'em imóveis nas carteiras')
    + k(n(r.imoveis), 'imóveis cadastrados')
    + k(n(r.leads_30d), 'clientes novos em 30 dias')
    + k(n(r.creditos_mes), 'consultas do Fisgar no mês');
}
function desenhaLista() {
  const l = DADOS.imobiliarias.filter((i) => FILTRO === 'todas' || i.situacao === FILTRO);
  if (!l.length) { $('#lista').innerHTML = '<div class="vazio">Nenhuma imobiliária neste filtro.</div>'; return; }
  $('#lista').innerHTML = l.map((i) => {
    const x = i.numeros || {};
    const met = (v, lb) => `<div class="met"><div class="v">${v}</div><div class="l">${esc(lb)}</div></div>`;
    return `<article class="imob ${i.situacao}${i.fundo ? ' com-fundo' : ''}" data-id="${i.id}"${i.fundo ? ` style="--foto:url('${esc(i.fundo.src)}');--foto-pos:${esc(i.fundo.posicao || '50% 50%')}" title="${esc(i.fundo.lugar)}"` : ''}>
      <div><div class="imob-nome">${esc(i.nome)}</div><div class="imob-sub">${esc(i.empresa || '')}${i.link ? ` · <a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.link.replace(/^https:\/\//, ''))}</a>` : ' · <span class="muted">sem link ainda</span>'}</div>
        <div class="selos"><span class="selo ${i.situacao}">${esc(SITU[i.situacao] || i.situacao)}</span><span class="selo plano">${esc(i.plano)}</span>${i.mensalidade ? `<span class="selo">${brl(i.mensalidade)}/mês</span>` : ''}<span class="selo">${n(i.comissao_pct)}% da comissão</span>${window.Herrera ? (() => { const f = Herrera.progresso(i.onboarding), t = Herrera.NUCLEO.length; return `<span class="selo ${f >= t ? 'conf-ok' : 'conf'}" title="Passos da configuração conferidos pelo Herrera">Configuração ${f}/${t}</span>`; })() : ''}</div></div>
      <div class="metricas">${i.numeros ? met(n(x.imoveis), `imóveis · ${n(x.publicados)} publicados`) + met(mi(x.vgv_carteira), 'na carteira') + met(n(x.vendidos) + (x.alugados ? ` + ${n(x.alugados)}` : ''), x.alugados ? 'vendidos + alugados' : 'vendidos')
        + met(brl(i.comissao_mes), 'sua parte no mês') + met(n(x.leads_30d), 'clientes em 30 dias') + met(n(x.visitas_30d), 'visitas em 30 dias') + met(n(x.usuarios), 'usuários')
        + met(n(x.creditos_mes) + (i.creditos_fisgar_mes ? ` / ${n(i.creditos_fisgar_mes)}` : ''), 'consultas Fisgar no mês') + met(n(x.social_mes || 0), `posts nas redes no mês · ${n(x.social_contas || 0)} conta(s)`) + met(quando(x.ultima_atividade), 'última atividade') + met((x.tamanho_mb || 0).toLocaleString('pt-BR') + ' MB', 'no banco')
        : `<span class="muted">${esc(i.erro || 'Banco ainda não criado.')}</span>`}</div>
      <div class="acoes">${i.link ? `<a class="btn sm" href="${esc(i.link)}" target="_blank" rel="noopener">Abrir sistema</a>` : ''}
        ${window.Herrera ? `<button class="btn sm hz-chama" data-a="herrera" title="Continuar a configuração com o Herrera"><span class="hz-mini" aria-hidden="true"></span>${Herrera.progresso(i.onboarding) >= Herrera.NUCLEO.length ? 'Herrera' : 'Continuar com o Herrera'}</button>` : ''}
        <button class="btn sm" data-a="editar">Editar</button>
        ${i.situacao === 'implantacao' || !i.publicada ? '<button class="btn sm" data-a="instalar">Instalação</button>' : ''}
        ${i.situacao === 'suspensa' ? '<button class="btn sm" data-a="reativar">Reativar</button>' : '<button class="btn sm perigo" data-a="suspender">Suspender</button>'}</div></article>`;
  }).join('');
  document.querySelectorAll('.imob [data-a]').forEach((b) => b.onclick = () => {
    const im = DADOS.imobiliarias.find((i) => i.id === +b.closest('.imob').dataset.id);
    ({ herrera: (x) => Herrera.abrir(x), editar: janelaEditar, instalar: janelaInstalacao, suspender: janelaSuspender, reativar: (x) => situacao(x, false, b) })[b.dataset.a](im, b);
  });
}

// ---------- janelas ----------
function janela(html, ao) {
  const d = document.createElement('dialog'); d.innerHTML = `<div class="jan">${html}</div>`; document.body.appendChild(d);
  d.addEventListener('close', () => d.remove()); d.querySelectorAll('[data-fecha]').forEach((b) => b.onclick = () => d.close());
  d.showModal(); if (ao) ao(d); return d;
}
const campo = (nome, rotulo, valor = '', extra = '') => `<label class="c${/inteiro/.test(extra) ? ' inteiro' : ''}">${esc(rotulo)}<input name="${nome}" value="${esc(valor ?? '')}" ${extra.replace('inteiro', '')}></label>`;
const PLANOS = ['essencial', 'profissional', 'premium', 'fundador'];
const camposComerciais = (i = {}) => `<label class="c">Plano<select name="plano">${PLANOS.map((p) => `<option ${p === (i.plano || 'essencial') ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
  ${campo('mensalidade', 'Mensalidade (R$)', i.mensalidade ?? '', 'inputmode="decimal"')}
  ${campo('comissao_pct', '% da comissão para a plataforma', i.comissao_pct ?? 20, 'inputmode="decimal"')}
  ${campo('comissao_venda_pct', 'Comissão da imobiliária sobre a venda (%)', i.comissao_venda_pct ?? 6, 'inputmode="decimal"')}
  ${campo('creditos_fisgar_mes', 'Consultas do Fisgar por mês (cota)', i.creditos_fisgar_mes ?? 0, 'inputmode="numeric"')}`;
const lerForm = (f) => Object.fromEntries(new FormData(f).entries());

function janelaNova() {
  janela(`<h2>Nova imobiliária</h2><p class="muted pequeno">Cria o banco próprio, o administrador e o cadastro. ${DADOS.resumo.vercel_automatico ? 'O sistema é publicado na Vercel sozinho.' : 'Depois é só publicar o projeto na Vercel com as variáveis que aparecem em "Instalação".'}</p>
    <form id="f-nova"><fieldset><legend>Imobiliária</legend><div class="campos">${campo('nome', 'Nome (marca)', '', 'required maxlength="60" inteiro')}${campo('empresa', 'Nome completo / razão social')}${campo('slug', 'Nome técnico (opcional)', '', 'pattern="[a-z][a-z0-9_]{2,30}" placeholder="gerado do nome"')}</div></fieldset>
    <fieldset><legend>Contato</legend><div class="campos">${campo('contato_nome', 'Responsável')}${campo('contato_telefone', 'Telefone')}${campo('contato_email', 'E-mail de contato', '', 'type="email" inteiro')}</div></fieldset>
    <fieldset><legend>Administrador do sistema</legend><div class="campos">${campo('admin_nome', 'Nome')}${campo('admin_email', 'E-mail de entrada', '', 'type="email" required')}${campo('admin_senha', 'Senha inicial (8+ caracteres)', '', 'type="password" required minlength="8" autocomplete="new-password" inteiro')}</div></fieldset>
    <fieldset><legend>Valores</legend><div class="campos">${camposComerciais()}</div></fieldset>
    <p class="erro" id="e-nova" hidden></p><div class="rod"><button type="button" class="btn" data-fecha>Cancelar</button><button class="btn pri" type="submit">Criar imobiliária</button></div></form>`, (d) => {
    $('#f-nova', d).addEventListener('submit', async (e) => {
      e.preventDefault(); const b = $('button[type=submit]', e.target); b.disabled = true; b.textContent = 'Criando o banco…';
      try {
        const r = await api('POST', '/imobiliarias', lerForm(e.target));
        d.close(); aviso(r.publicada ? 'Imobiliária criada e publicada na Vercel.' : r.aviso ? 'Criada. A publicação na Vercel falhou: ' + r.aviso : 'Imobiliária criada. Falta publicar (veja Instalação).', !!r.aviso);
        await carregar();
        if (!r.publicada) { const im = DADOS.imobiliarias.find((i) => i.id === r.id); if (im) janelaInstalacao(im); }
      } catch (err) { $('#e-nova', d).textContent = err.message; $('#e-nova', d).hidden = false; b.disabled = false; b.textContent = 'Criar imobiliária'; }
    });
  });
}
function janelaEditar(i) {
  janela(`<h2>${esc(i.nome)}</h2><p class="muted pequeno">Nome técnico: <span class="n">${esc(i.slug)}</span> · cliente desde ${esc(new Date(i.criado_em.replace(' ', 'T')).toLocaleDateString('pt-BR'))}</p>
    <form id="f-ed"><div class="campos">${campo('nome', 'Nome (marca)', i.nome, 'required')}${campo('empresa', 'Nome completo', i.empresa)}
    ${campo('link', 'Link do sistema', i.link, 'type="url" placeholder="https://"')}${campo('dominio', 'Domínio próprio', i.dominio)}
    ${campo('contato_nome', 'Responsável', i.contato_nome)}${campo('contato_telefone', 'Telefone', i.contato_telefone)}${campo('contato_email', 'E-mail de contato', i.contato_email, 'type="email" inteiro')}
    ${camposComerciais(i)}<label class="c inteiro">Notas<textarea name="notas">${esc(i.notas || '')}</textarea></label></div>
    <p class="erro" id="e-ed" hidden></p><div class="rod"><button type="button" class="btn" data-fecha>Cancelar</button><button class="btn pri" type="submit">Salvar</button></div></form>`, (d) => {
    $('#f-ed', d).addEventListener('submit', async (e) => {
      e.preventDefault(); const b = $('button[type=submit]', e.target); b.disabled = true;
      try { await api('PATCH', '/imobiliarias/' + i.id, lerForm(e.target)); d.close(); aviso('Salvo.'); carregar(); }
      catch (err) { $('#e-ed', d).textContent = err.message; $('#e-ed', d).hidden = false; b.disabled = false; }
    });
  });
}
async function janelaInstalacao(i) {
  let r; try { r = await api('GET', `/imobiliarias/${i.id}/instalacao`); } catch (e) { return aviso(e.message, true); }
  const vars = r.variaveis ? Object.entries(r.variaveis).map(([k, v]) => `${k}=${v}`).join('\n') : null;
  janela(`<h2>Instalação · ${esc(i.nome)}</h2>${vars ? `<p class="muted pequeno">Para publicar: na Vercel, crie um projeto ligado ao repositório <span class="n">${esc(r.repo)}</span> (ramo main), cole estas variáveis em Environment Variables, adicione o domínio <span class="n">${esc(r.dominio || '')}</span> em Domains e publique. Guarde isto em lugar seguro: tem a senha do banco.</p>
    <div class="vars" id="vars">${esc(vars)}</div><div class="rod" style="justify-content:flex-start"><button class="btn sm" id="b-copiar" type="button">Copiar variáveis</button></div>` : `<p class="muted">${esc(r.aviso)}</p>`}
    <form id="f-pub"><div class="campos">${campo('link', 'Link depois de publicada', i.link || (r.dominio ? 'https://' + r.dominio : ''), 'type="url" placeholder="https://nome.corretordofuturo.app"')}${campo('vercel_projeto', 'Nome do projeto na Vercel', i.vercel_projeto)}</div>
    <div class="rod"><button type="button" class="btn" data-fecha>Fechar</button><button class="btn pri" type="submit">Marcar como publicada</button></div></form>`, (d) => {
    const c = $('#b-copiar', d); if (c) c.onclick = () => navigator.clipboard.writeText(vars).then(() => aviso('Variáveis copiadas.'), () => aviso('Não consegui copiar: selecione o texto.', true));
    $('#f-pub', d).addEventListener('submit', async (e) => { e.preventDefault(); const b = $('button[type=submit]', e.target); await comBotao(b, async () => { await api('POST', `/imobiliarias/${i.id}/publicada`, lerForm(e.target)); d.close(); aviso('Marcada como publicada.'); carregar(); }); });
  });
}
function janelaSuspender(i, botao) {
  janela(`<h2>Suspender ${esc(i.nome)}?</h2><p class="muted">O sistema, o portal e o blog dela mostram "temporariamente fora do ar" em até 1 minuto. Nada é apagado: reativar volta tudo como estava.</p>
    <div class="rod"><button type="button" class="btn" data-fecha>Cancelar</button><button type="button" class="btn pri" id="b-sim" style="background:var(--erro);border-color:var(--erro)">Suspender</button></div>`, (d) => {
    $('#b-sim', d).onclick = () => comBotao($('#b-sim', d), async () => { await situacao(i, true, botao); d.close(); });
  });
}
async function situacao(i, suspensa, b) {
  await comBotao(b, async () => { await api('POST', `/imobiliarias/${i.id}/situacao`, { suspensa }); aviso(suspensa ? `${i.nome} suspensa.` : `${i.nome} reativada.`); await carregar(); });
}
function janelaSenha() {
  janela(`<h2>Trocar a senha do painel</h2><form id="f-s"><div class="campos">${campo('atual', 'Senha atual', '', 'type="password" required autocomplete="current-password" inteiro')}${campo('nova', 'Senha nova (10+ caracteres)', '', 'type="password" required minlength="10" autocomplete="new-password" inteiro')}</div>
    <p class="erro" id="e-s" hidden></p><div class="rod"><button type="button" class="btn" data-fecha>Cancelar</button><button class="btn pri" type="submit">Trocar</button></div></form>`, (d) => {
    $('#f-s', d).addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('POST', '/senha', lerForm(e.target)); d.close(); aviso('Senha trocada.'); }
      catch (err) { $('#e-s', d).textContent = err.message; $('#e-s', d).hidden = false; }
    });
  });
}

iniciar().catch(() => telaEntrada());
