/* Herrera HOUSE IA — Condomínios: a base de prédios e condomínios de Campinas, a ficha com os números cruzados e o 3D (carregado depois do app.js e do fisguei.js) */
'use strict';
const CD_TIPO = { vertical: ['Prédio', 'info'], horizontal: ['Condomínio de casas', 'ok'], indefinido: ['A confirmar', 'gold'], comercial: ['Comercial', 'bad'] };
const cdTipo = (t) => `<span class="pill ${(CD_TIPO[t] || CD_TIPO.indefinido)[1]}">${esc((CD_TIPO[t] || CD_TIPO.indefinido)[0])}</span>`;
const cdEnd = (c) => [[c.logradouro, c.numero].filter(Boolean).join(', '), c.bairro].filter(Boolean).join(' · ') || 'Endereço a confirmar';
const cdM2 = (v) => (v ? 'R$ ' + Math.round(v).toLocaleString('pt-BR') + '/m²' : '—');
const cdFontes = (f) => String(f || '').split(',').filter(Boolean).map((x) => ({ cnpj: 'CNPJ (Receita)', osm: 'Mapa aberto', cadastro: 'Cadastro ' + MARCA.cliente }[x] || x)).join(' · ');
const cdKpi = (n, l, sub) => `<div class="card kpi"><div class="n">${n}</div><div class="l">${esc(l)}</div>${sub ? `<div class="small muted" style="margin-top:2px">${sub}</div>` : ''}</div>`;
const cdDaCasa = (a) => a.origem === MARCA.cliente;
const cd3d = (id, imovel) => `/condominio-3d.html?id=${id}${imovel ? '&imovel=' + imovel : ''}`;

// ---------- lista + mapa ----------
// ordem da lista (no servidor, porque é paginada): o sentido padrão de cada uma vem do servidor
const CD_ORD_LISTA = [['venda', 'À venda agora'], ['preco', 'Preço médio'], ['unidades', 'Tamanho (unidades)'], ['andares', 'Andares'], ['giro', 'Anúncios em 90 dias'], ['recentes', 'Data de inclusão'], ['nome', 'Nome', null, true]];
const CD_ORD_PAD = { venda: -1, preco: 1, unidades: -1, andares: -1, giro: -1, recentes: -1, nome: 1 };
const cdOrdAtual = (f) => ({ k: f.ordem, d: f.dir ? (f.dir === 'asc' ? 1 : -1) : CD_ORD_PAD[f.ordem] || -1 });
ACT['cd-ord'] = (el) => {
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const at = cdOrdAtual({ ordem: qs.get('ordem') || 'venda', dir: qs.get('dir') || '' });
  const k = el.dataset.k, d = at.k === k ? -at.d : CD_ORD_PAD[k] || 1;
  qs.set('ordem', k); qs.set('dir', d > 0 ? 'asc' : 'desc'); qs.delete('pagina');
  navega('#/condominios?' + qs);
};
async function telaCondominios(qs) {
  const f = { q: qs.get('q') || '', tipo: qs.get('tipo') || '', bairro: qs.get('bairro') || '', venda: qs.get('venda') || '', alvo: qs.get('alvo') || '', ordem: qs.get('ordem') || 'venda', dir: qs.get('dir') || '', pagina: qs.get('pagina') || '1' };
  const link = (o) => '#/condominios?' + new URLSearchParams(Object.fromEntries(Object.entries({ ...f, pagina: '1', ...o }).filter(([, v]) => v)));
  const [l, bairros, alertas] = await Promise.all([api('GET', '/api/condominios?' + new URLSearchParams(f)), api('GET', '/api/condominios/bairros').catch(() => []), api('GET', '/api/condominios/alertas').catch(() => [])]);
  const r = l.resumo || {};
  const paginas = Math.max(1, Math.ceil(l.total / l.porPagina));
  $('#main').innerHTML = `<h1>Condomínios</h1><div class="eyebrow depois">Imóveis da base · Campinas</div>${typeof mkAbas === 'function' ? mkAbas('condominios') : ''}
  <p class="lead">Os prédios e condomínios residenciais de Campinas, juntando o CNPJ da Receita, o mapa aberto e os cadastros da ${esc(MARCA.cliente)}. Cada um cruza a carteira, o Radar e o Fisguei: quem está vendendo, por quanto e por qual imobiliária.</p>
  ${alertas.length ? `<div class="card cd-alertas"><div class="row"><h2 style="margin:0;flex:1">Anúncios novos em prédios-alvo</h2><button class="btn sm" data-act="cd-visto">Marcar como vistos</button></div>
    <div class="list" style="margin-top:8px">${alertas.slice(0, 8).map((a) => `<a class="item click" href="${a.href}" style="text-decoration:none;color:inherit"><span class="pill ${a.origem === 'radar' ? 'info' : 'ok'}">${a.origem === 'radar' ? 'Radar' : 'Fisguei'}</span><span style="flex:1">${esc(a.texto)}</span><span class="muted small">${dataBR(a.criado_em)}</span></a>`).join('')}</div></div>` : ''}
  <div class="grid g4 cd-kpis">${cdKpi((r.total || 0).toLocaleString('pt-BR'), 'condomínios na base')}${cdKpi((r.verticais || 0).toLocaleString('pt-BR'), 'prédios')}${cdKpi((r.horizontais || 0).toLocaleString('pt-BR'), 'condomínios de casas')}${cdKpi((r.alvos || 0).toLocaleString('pt-BR'), 'prédios-alvo', '<a href="' + link({ alvo: '1' }) + '">ver</a>')}</div>
  <form class="row cd-filtros" data-form="cd-busca">
    <input name="q" value="${esc(f.q)}" placeholder="Nome, rua ou CNPJ" style="flex:1;min-width:200px">
    <select name="tipo" aria-label="Tipo de condomínio"><option value="">Todos os tipos</option>${['vertical', 'horizontal', 'indefinido'].map((t) => `<option value="${t}" ${f.tipo === t ? 'selected' : ''}>${CD_TIPO[t][0]}</option>`).join('')}</select>
    <select name="bairro" aria-label="Bairro"><option value="">Todos os bairros</option>${bairros.map((b) => `<option ${f.bairro === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>
    <input type="hidden" name="ordem" value="${esc(f.ordem)}"><input type="hidden" name="dir" value="${esc(f.dir)}">
    <label class="chk"><input type="checkbox" name="venda" ${f.venda ? 'checked' : ''}> Com imóvel à venda</label>
    <label class="chk"><input type="checkbox" name="alvo" ${f.alvo ? 'checked' : ''}> Prédios-alvo</label>
    <button class="btn pri" type="submit">Buscar</button>
  </form>
  ${ordBarra('cd-ord', CD_ORD_LISTA, cdOrdAtual(f))}
  <div class="cd-split">
    <div class="cd-lista">${l.itens.length ? l.itens.map((c) => {
      const venda = c.radar + c.fisguei + c.carteira;
      return `<a class="cd-item cd-item-f" href="#/condominios/${c.id}" data-cd="${c.id}">
        <span class="cd-item-foto">${fotoCadeia([c.foto, c.lat != null && typeof MAPAS !== 'undefined' && MAPAS && MAPAS.fachada ? `/api/fachada?ref=cd${c.id}` : null], c.nome, { vazio: ' ' })}</span><div class="cd-item-txt">
        <div class="cd-item-top"><b>${esc(c.nome)}</b>${c.alvo ? '<span class="pill gold" title="Prédio-alvo">alvo</span>' : ''}</div>
        <div class="muted small">${esc(cdEnd(c))}</div>
        <div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap">${cdTipo(c.tipo)}${venda ? `<span class="pill ok">${venda} à venda</span>` : ''}${c.preco_medio ? `<span class="pill" title="Preço médio dos anúncios">${typeof mkMi === 'function' ? mkMi(c.preco_medio) : brl(c.preco_medio)} em média</span>` : ''}${c.carteira ? `<span class="pill gold">${c.carteira} na carteira</span>` : ''}${c.giro ? `<span class="pill warn">${c.giro} anúncio(s) em 90 dias</span>` : ''}${c.andares ? `<span class="pill info">${c.andares} andares</span>` : ''}${c.unidades ? `<span class="pill info">${c.unidades} unid.</span>` : ''}${!c.lat ? '<span class="pill warn">sem mapa</span>' : ''}</div></div></a>`;
    }).join('') : '<div class="empty">Nenhum condomínio neste filtro.</div>'}
      <div class="row" style="margin-top:10px"><span class="muted small">${l.total.toLocaleString('pt-BR')} condomínio(s) · página ${l.pagina} de ${paginas}</span><span class="sp"></span>
      ${l.pagina > 1 ? `<a class="btn sm" href="${link({ pagina: l.pagina - 1 })}">← Anterior</a>` : ''}${l.pagina < paginas ? `<a class="btn sm" href="${link({ pagina: l.pagina + 1 })}">Próxima →</a>` : ''}</div>
    </div>
    <div class="cd-mapa-w"><div id="cd-mapa" class="cd-mapa"></div>
      <p class="small muted" style="margin:6px 2px 0"><span class="cd-dot" style="background:#3b6ea8"></span> prédio <span class="cd-dot" style="background:#2e7d4f"></span> condomínio de casas <span class="cd-dot" style="background:#c98a1a"></span> com imóvel à venda <span class="cd-dot" style="background:#a8823c;outline:2px solid #fff"></span> alvo</p></div>
  </div>`;
  mapaCondominios(l.itens.map((c) => c.id));
}
FORM['cd-busca'] = async (fm) => { const d = formJSON(fm); navega('#/condominios?' + new URLSearchParams(Object.fromEntries(Object.entries({ ...d, venda: d.venda ? '1' : '', alvo: d.alvo ? '1' : '' }).filter(([, v]) => v)))); };

async function mapaCondominios(destaque) {
  const [pts] = await Promise.all([api('GET', '/api/condominios/mapa'), carregaLeaflet()]);
  const el = $('#cd-mapa'); if (!el) return;
  const m = L.map(el, { preferCanvas: true }).setView([-22.9056, -47.0608], 12);
  camadaMapa(m);
  const set = new Set(destaque); const b = [];
  for (const [id, lat, lon, tipo, venda, alvo, nome] of pts) {
    const cor = alvo ? '#a8823c' : venda ? '#c98a1a' : tipo === 'h' ? '#2e7d4f' : '#3b6ea8';
    const mk = L.circleMarker([lat, lon], { radius: set.has(id) ? 7 : venda ? 5.5 : 4, color: '#fff', weight: set.has(id) ? 2 : 1, fillColor: cor, fillOpacity: set.has(id) ? 1 : 0.75 }).addTo(m);
    mk.bindTooltip(`${nome}${venda ? ` · ${venda} à venda` : ''}`);
    mk.on('click', () => navega(`#/condominios/${id}`));
    if (set.has(id)) b.push([lat, lon]);
  }
  if (b.length && b.length < pts.length) m.fitBounds(b, { padding: [30, 30], maxZoom: 15 });
}

// ---------- ficha: captação e "à venda agora" ----------
const CD_IMOB_TOPO = 5;
const cdImobItem = (x) => `<div class="item"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(x.nome)}">${esc(x.nome)}</span><span class="pill info">${x.n}</span></div>`;

// colunas ordenáveis: chave → valor para comparar
const CD_ORDEM = {
  origem: { t: 'Origem', v: (a) => (a.origem || '') + ' ' + (a.ref || ''), txt: true },
  unidade: { t: 'Unidade', v: (a) => { const n = parseInt(String(a.unidade || '').replace(/\D/g, ''), 10); return Number.isFinite(n) ? n : null; } },
  quartos: { t: 'Quartos', v: (a) => a.quartos || null },
  area: { t: 'Área', v: (a) => a.area || null },
  valor: { t: 'Valor', v: (a) => a.valor || null },
  m2: { t: 'R$/m²', v: (a) => (a.valor && a.area ? a.valor / a.area : null) },
  dias: { t: 'Anunciado há', v: (a) => (a.dias !== null && a.dias !== undefined ? a.dias : null) },
  anunciante: { t: 'Quem anuncia', v: (a) => a.anunciante || '', txt: true },
};
let cdOrdem = (() => { try { return JSON.parse(localStorage.getItem('hh.cdOrdem')) || { k: 'valor', d: 1 }; } catch { return { k: 'valor', d: 1 }; } })();

function cdOrdena(lista) {
  const col = CD_ORDEM[cdOrdem.k]; if (!col) return lista;
  return lista.map((a, i) => ({ a, i, v: col.v(a) })).sort((x, y) => {
    const vx = x.v, vy = y.v;
    const fx = vx === null || vx === '', fy = vy === null || vy === '';
    if (fx || fy) return fx === fy ? x.i - y.i : fx ? 1 : -1; // sem dado sempre no fim
    const r = col.txt ? String(vx).localeCompare(String(vy), 'pt-BR', { sensitivity: 'base', numeric: true }) : vx - vy;
    return (r || x.i - y.i) * (r ? cdOrdem.d : 1);
  }).map((x) => x.a);
}

function cdTabelaVenda(c, temGeo, loc) {
  const lista = loc ? c.aLocar || [] : c.aVenda;
  if (!lista.length) return loc ? '<div class="empty">Nenhum anúncio de aluguel neste condomínio agora.</div>' : '<div class="empty">Nada à venda neste condomínio no Radar, no Fisguei ou na carteira agora. Bom momento para marcar como prédio-alvo e ser avisado do próximo anúncio.</div>';
  const th = (k) => {
    const on = cdOrdem.k === k, seta = on ? (cdOrdem.d > 0 ? '▲' : '▼') : '↕';
    const dica = on ? (cdOrdem.d > 0 ? 'do menor para o maior · clique para inverter' : 'do maior para o menor · clique para inverter') : 'ordenar';
    return `<th class="cd-ord${on ? ' on' : ''}" data-ord="${k}" aria-sort="${on ? (cdOrdem.d > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" title="${dica}">${CD_ORDEM[k].t} <span class="cd-seta" aria-hidden="true">${seta}</span></button></th>`;
  };
  return `<table><thead><tr><th><span class="vis-oculto">Foto</span></th>${Object.keys(CD_ORDEM).map(th).join('')}${temGeo ? '<th><span class="vis-oculto">Ações</span></th>' : ''}</tr></thead><tbody>
    ${cdOrdena(lista).map((a) => `<tr class="click" data-act="ir" data-href="${a.href}"><td style="width:72px"><span class="mk-mini">${fotoCadeia([a.foto], a.ref, { vazio: ' ' })}</span></td><td><span class="pill ${cdDaCasa(a) ? 'gold' : a.origem === 'Radar' ? 'info' : 'ok'}">${esc(a.origem)}</span> <span class="mono small">${esc(a.ref)}</span>${a.tambem ? `<br><span class="muted small">também no ${esc(a.tambem.join(', '))}</span>` : ''}</td>
      <td>${esc(a.unidade || '—')}</td><td>${a.quartos || '—'}</td><td>${a.area ? Math.round(a.area) + ' m²' : '—'}</td><td><b>${brl(a.valor)}</b>${loc ? '<span class="muted small">/mês</span>' : ''}</td><td>${a.valor && a.area ? (loc ? 'R$ ' + (a.valor / a.area).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '/m²' : cdM2(a.valor / a.area)) : '—'}</td>
      <td>${a.dias !== null && a.dias !== undefined ? a.dias + ' dia(s)' : '—'}</td><td>${esc(a.anunciante || '—')}${a.portal ? `<br><span class="muted small">${esc(a.portal)}</span>` : ''}</td>${temGeo ? `<td>${cdDaCasa(a) ? `<button class="btn sm" data-act="cd-3d" data-href="${cd3d(c.id, a.href.split('/').pop())}" title="Ver o apartamento no 3D">3D</button>` : ''}</td>` : ''}</tr>`).join('')}
  </tbody></table>`;
}

function ligaOrdemVenda(c, temGeo, loc) {
  const box = $(loc ? '#cd-alocar' : '#cd-avenda'); if (!box) return;
  box.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-ord]'); if (!th) return;
    e.preventDefault(); e.stopPropagation();
    const k = th.dataset.ord;
    // texto começa em A→Z; número começa do menor; clicar de novo inverte
    cdOrdem = cdOrdem.k === k ? { k, d: -cdOrdem.d } : { k, d: 1 };
    try { localStorage.setItem('hh.cdOrdem', JSON.stringify(cdOrdem)); } catch {}
    box.innerHTML = cdTabelaVenda(c, temGeo, loc);
    const outro = $(loc ? '#cd-avenda' : '#cd-alocar'); if (outro) outro.innerHTML = cdTabelaVenda(c, temGeo, !loc);
  });
}

// ---------- ficha ----------
async function telaCondominio(id) {
  const c = await api('GET', '/api/condominios/' + id);
  const s = c.resumo;
  const temGeo = c.lat && c.lon;
  const unid = c.unidades ? `${c.unidades}${c.unidades_fonte ? ` <span class="muted small">(${esc(c.unidades_fonte)})</span>` : ''}` : '<span class="muted">a confirmar</span>';
  const ano = c.ano_construcao || (c.abertura ? `${c.abertura.slice(0, 4)} <span class="muted small">(abertura do CNPJ)</span>` : null);
  $('#main').innerHTML = `<a class="btn sm" href="#/condominios">← Condomínios</a>
  <div class="cd-hero">
    <div style="flex:1;min-width:260px">
      <h1 style="margin:2px 0">${esc(c.nome)}</h1><div class="eyebrow depois">${esc(cdFontes(c.fontes))}${c.cnpj ? ' · CNPJ ' + esc(c.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')) : ''}</div>
      <div class="muted">${esc(cdEnd(c))}${c.cep ? ' · CEP ' + esc(c.cep.replace(/(\d{5})(\d{3})/, '$1-$2')) : ''}</div>
      <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">${cdTipo(c.tipo)}${c.alvo ? '<span class="pill gold">prédio-alvo</span>' : ''}${c.situacao && c.situacao !== 'ativa' ? `<span class="pill warn">CNPJ ${esc(c.situacao)}</span>` : ''}${s.lazer.slice(0, 6).map((x) => `<span class="pill info">${esc(x)}</span>`).join('')}</div>
    </div>
    <div class="cd-acoes">
      ${temGeo ? `<a class="btn pri cd-btn3d" href="${cd3d(c.id)}" target="_blank" rel="noopener"><span aria-hidden="true">◈</span> Ver em 3D</a>` : '<span class="pill warn">sem posição no mapa: ajuste para ver o 3D</span>'}
      <button class="btn" data-act="cd-alvo" data-id="${c.id}" data-v="${c.alvo ? 0 : 1}">${c.alvo ? 'Tirar dos prédios-alvo' : '★ Marcar como prédio-alvo'}</button>
      <button class="btn" data-act="cd-editar" data-id="${c.id}">Editar dados</button>
      ${c.slug && temGeo ? `<a class="btn" href="/condominios/${esc(c.slug)}" target="_blank" rel="noopener" title="Página do condomínio para o cliente (portal)">Página do cliente</a>` : ''}
    </div>
  </div>
  <div class="grid g4 cd-kpis">
    ${cdKpi(s.a_venda, 'à venda agora', s.particulares ? `${s.particulares} de particular` : '')}
    ${cdKpi(s.preco_mediano ? brl(s.preco_mediano) : '—', 'preço mediano', s.preco_min && s.preco_max && s.preco_min !== s.preco_max ? `de ${brl(s.preco_min)} a ${brl(s.preco_max)}` : '')}
    ${cdKpi(cdM2(s.m2_mediano || s.m2_historico), 'valor do m²', s.m2_mediano ? 'dos anúncios atuais' : s.m2_historico ? 'histórico de anúncios' : 'sem anúncios com área')}
    ${cdKpi(s.dias_anunciado !== null && s.dias_anunciado !== undefined ? s.dias_anunciado + ' dias' : '—', 'tempo médio anunciado', s.imobiliarias.length ? `${s.imobiliarias.length} imobiliária(s) no prédio` : '')}
  </div>
  <div class="grid g2" style="margin-top:16px;align-items:start">
    <div class="card"><h2>Raio-X do condomínio</h2><dl class="dl">
      <dt>Tipo</dt><dd>${esc((CD_TIPO[c.tipo] || CD_TIPO.indefinido)[0])}</dd>
      <dt>Andares</dt><dd>${c.andares || '<span class="muted">a confirmar</span>'}</dd>
      <dt>Torres / blocos</dt><dd>${c.torres || '<span class="muted">a confirmar</span>'}</dd>
      <dt>Unidades</dt><dd>${unid}</dd>
      <dt>Ano</dt><dd>${ano || '<span class="muted">a confirmar</span>'}</dd>
      <dt>Construtora</dt><dd>${esc(c.construtora || '—')}</dd>
      <dt>Administradora</dt><dd>${esc(c.administradora || '—')}</dd>
      <dt>Taxa de condomínio</dt><dd>${s.taxa_condominio ? brl(s.taxa_condominio) + '/mês <span class="muted small">(mediana dos anúncios)</span>' : '—'}</dd>
      <dt>IPTU</dt><dd>${s.iptu ? brl(s.iptu) + ' <span class="muted small">(mediana)</span>' : '—'}</dd>
      <dt>Área típica</dt><dd>${s.area_tipica ? Math.round(s.area_tipica) + ' m²' : '—'}</dd>
      <dt>Plantas</dt><dd>${s.quartos.length ? s.quartos.map((x) => `${x.q} quarto${x.q > 1 ? 's' : ''} (${x.n})`).join(' · ') : '—'}</dd>
      ${c.razao_social ? `<dt>Razão social</dt><dd>${esc(c.razao_social)}</dd>` : ''}
    </dl>${s.lazer.length ? `<h3 style="margin-top:14px">Lazer e estrutura</h3><div class="row" style="gap:6px;flex-wrap:wrap">${s.lazer.map((x) => `<span class="pill info">${esc(x)}</span>`).join('')}</div><p class="small muted" style="margin:6px 0 0">Lido das descrições dos anúncios do prédio.</p>` : ''}</div>
    <div class="card cd-capta"><h2>Captação no prédio</h2>
      <div class="grid g3" style="gap:10px">${cdKpi(s.proprietarios_conhecidos, 'possíveis donos conhecidos')}${cdKpi(s.donos_confirmados, 'donos confirmados')}${cdKpi(s.vendidos, 'vendidos pela ' + MARCA.cliente)}</div>
      ${s.imobiliarias.length ? `<h3 style="margin-top:14px">Imobiliárias anunciando aqui <span class="muted small">(${s.imobiliarias.length})</span></h3><div class="list cd-imob">${s.imobiliarias.slice(0, CD_IMOB_TOPO).map(cdImobItem).join('')}</div>${s.imobiliarias.length > CD_IMOB_TOPO ? `<details class="cd-imob-mais"><summary>Ver todas as ${s.imobiliarias.length}</summary><div class="list cd-imob cd-imob-rola">${s.imobiliarias.slice(CD_IMOB_TOPO).map(cdImobItem).join('')}</div></details>` : ''}` : '<p class="muted small" style="margin-top:12px">Nenhuma imobiliária concorrente anunciando neste prédio agora.</p>'}
      <div class="row" style="gap:6px;margin-top:14px;flex-wrap:wrap">
        ${c.fisguei.length ? `<a class="btn sm" href="#/fisguei?q=${encodeURIComponent(c.logradouro || c.nome)}">Ver no Fisguei (${c.fisguei.length})</a>` : ''}
        ${c.radar.length ? `<a class="btn sm" href="#/radar">Ver no Radar (${c.radar.length})</a>` : ''}
        <button class="btn sm" data-act="cd-vizinhos" data-id="${c.id}">Mensagem para os vizinhos</button>
      </div></div>
  </div>
  <div class="card tbl" style="margin-top:16px"><div class="row" style="padding:10px 10px 0;gap:8px;flex-wrap:wrap"><h2 style="margin:0;flex:1">À venda agora${c.aVenda.length ? ` <span class="muted small">(${c.aVenda.length})</span>` : ''}</h2>${c.aVenda.length > 1 ? '<span class="muted small">Clique no título da coluna para ordenar</span>' : ''}</div><div id="cd-avenda">${cdTabelaVenda(c, temGeo)}</div></div>
  ${(c.aLocar || []).length ? `<div class="card tbl" style="margin-top:16px"><div class="row" style="padding:10px 10px 0;gap:8px;flex-wrap:wrap"><h2 style="margin:0;flex:1">Para alugar agora <span class="muted small">(${c.aLocar.length})</span></h2>${s.aluguel_mediano ? `<span class="muted small">aluguel mediano ${brl(s.aluguel_mediano)}/mês</span>` : ''}</div><div id="cd-alocar">${cdTabelaVenda(c, temGeo, true)}</div></div>` : ''}
  ${c.carteira.length ? `<div class="row" style="margin:22px 0 12px"><h2 style="margin:0">Na carteira da ${esc(MARCA.cliente)}</h2></div>${imCards(c.carteira.map((i) => ({ ...i, condominio_nome: c.nome, bairro: c.bairro, capa: i.foto })))}` : ''}
  <div class="card" style="margin-top:16px"><div class="row"><h2 style="margin:0;flex:1">O que tem perto</h2><span class="muted small">a pé, a partir da portaria</span></div><div id="cd-perto"><p class="muted">${temGeo ? 'Carregando…' : 'Ajuste a posição no mapa para ver o entorno.'}</p></div></div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="row"><h2 style="margin:0;flex:1">Mapa</h2>${c.geo_fonte ? `<span class="muted small">posição: ${esc({ osm: 'mapa aberto', numero: 'endereço exato', rua: 'aproximada pela rua', cep: 'aproximada pelo CEP', ajustado: 'ajustada pela ' + MARCA.cliente, cadastro: 'cadastro do imóvel' }[c.geo_fonte] || c.geo_fonte)}</span>` : ''}</div>
      <div id="cd-mini" class="cd-mini"></div><p class="small muted" style="margin:6px 0 0">Arraste o marcador para corrigir a posição do condomínio.</p></div>
    <div class="card"><h2>Street View</h2>${temGeo ? `<div class="fg-frame" data-fachada="cd${c.id}"><iframe title="Street View" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?layer=c&cbll=${encodeURIComponent(c.lat + ',' + c.lon)}&cbp=11,0,0,0,0&hl=pt-BR&output=svembed"></iframe></div>
      <p class="small muted">Se a imagem não aparecer, o Google não tem Street View exatamente neste ponto. <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encodeURIComponent(c.lat + ',' + c.lon)}" target="_blank" rel="noopener">Abrir no Google</a></p>` : '<p class="muted">Sem posição no mapa.</p>'}</div>
  </div>`;
  miniMapa(c);
  ligaOrdemVenda(c, temGeo); ligaOrdemVenda(c, temGeo, true);
  if (temGeo) carregaPerto(c.id);
  // com a chave do Google: foto da fachada no lugar do Street View interativo (guardada; paga uma vez)
  if (temGeo && typeof mapasCfg === 'function') mapasCfg().then((cfg) => {
    const box = document.querySelector('[data-fachada]'); if (!cfg.fachada || !box) return;
    const ifr = box.innerHTML; const img = new Image(); img.alt = 'Fachada (Google Street View)'; img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
    img.onerror = () => { box.innerHTML = ifr; }; img.src = `/api/fachada?ref=${box.dataset.fachada}`; box.innerHTML = ''; box.appendChild(img);
  });
}

async function carregaPerto(id) {
  const el = $('#cd-perto');
  try {
    const p = await api('GET', `/api/condominios/${id}/perto`);
    if (!el || !document.body.contains(el)) return;
    const cats = p.categorias.filter((x) => x.itens.length);
    el.innerHTML = cats.length ? `<div class="cd-perto">${cats.map((cat) => `<div class="cd-cat"><div class="cd-cat-h"><span aria-hidden="true">${cat.icone}</span> <b>${esc(cat.nome)}</b><span class="muted small">${cat.total} no raio</span></div>
      ${cat.itens.map((x) => `<div class="cd-poi"><span>${esc(x.nome)}</span><span class="muted small mono">${x.m < 1000 ? x.m + ' m' : (x.m / 1000).toFixed(1).replace('.', ',') + ' km'} · ${x.min} min</span></div>`).join('')}</div>`).join('')}</div>
      <p class="small muted" style="margin:8px 0 0">Raio de ${(p.raio / 1000).toFixed(1).replace('.', ',')} km. Fonte: ${esc(p.fonte)}.</p>` : '<p class="muted">O mapa aberto não tem pontos de interesse com nome neste raio.</p>';
  } catch (e) { if (el) el.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}

async function miniMapa(c) {
  await carregaLeaflet();
  const el = $('#cd-mini'); if (!el) return;
  const centro = c.lat ? [c.lat, c.lon] : [-22.9056, -47.0608];
  const m = L.map(el).setView(centro, c.lat ? 17 : 12);
  camadaMapa(m);
  const mk = L.marker(centro, { draggable: true }).addTo(m);
  mk.on('dragend', async () => {
    const p = mk.getLatLng();
    if (!confirm('Salvar esta nova posição para o condomínio? O 3D e o entorno são refeitos.')) { mk.setLatLng(centro); return; }
    try { await api('PUT', `/api/condominios/${c.id}`, { lat: p.lat, lon: p.lng }); toast('Posição salva'); rota(); } catch (e) { toast(e.message, true); mk.setLatLng(centro); }
  });
}

ACT['cd-visto'] = (b) => comBotao(b, async () => { await api('POST', '/api/condominios/alertas/visto'); atualizaBadge(); rota(); });
ACT['cd-3d'] = (el, e) => { e.stopPropagation(); window.open(el.dataset.href, '_blank', 'noopener'); };
ACT['cd-alvo'] = (b) => comBotao(b, async () => { await api('PUT', `/api/condominios/${b.dataset.id}`, { alvo: b.dataset.v === '1' }); toast(b.dataset.v === '1' ? 'Prédio-alvo: você será avisado de anúncios novos aqui' : 'Removido dos prédios-alvo'); rota(); });
ACT['cd-editar'] = async (b) => {
  const c = await api('GET', '/api/condominios/' + b.dataset.id);
  const v = (k) => esc(c[k] ?? '');
  modal(`<h2>Editar condomínio</h2><form data-form="cd-editar" data-id="${c.id}" class="grid" style="gap:10px">
    <label class="f">Nome<input name="nome" value="${v('nome')}" required></label>
    <div class="grid g2"><label class="f">Tipo<select name="tipo">${['vertical', 'horizontal', 'indefinido', 'comercial'].map((t) => `<option value="${t}" ${c.tipo === t ? 'selected' : ''}>${CD_TIPO[t][0]}</option>`).join('')}</select></label>
      <label class="f">Ano de construção<input name="ano_construcao" value="${v('ano_construcao')}"></label></div>
    <div class="grid g3"><label class="f">Andares<input name="andares" type="number" min="1" value="${v('andares')}"></label><label class="f">Torres<input name="torres" type="number" min="1" value="${v('torres')}"></label><label class="f">Unidades<input name="unidades" type="number" min="1" value="${v('unidades')}"></label></div>
    <div class="grid g2"><label class="f">Construtora<input name="construtora" value="${v('construtora')}"></label><label class="f">Administradora<input name="administradora" value="${v('administradora')}"></label></div>
    <label class="f">Lazer<input name="lazer" value="${v('lazer')}" placeholder="Piscina, academia, salão…"></label>
    <div class="row"><button class="btn pri" type="submit">Salvar</button><button class="btn" type="button" data-fecha>Cancelar</button></div></form>`);
};
FORM['cd-editar'] = async (f) => { await api('PUT', `/api/condominios/${f.dataset.id}`, formJSON(f)); fechaModal(); toast('Condomínio salvo'); rota(); };
ACT['cd-vizinhos'] = async (b) => {
  const c = await api('GET', '/api/condominios/' + b.dataset.id);
  const s = c.resumo; const m2 = s.m2_mediano || s.m2_historico;
  const txt = `Olá! Aqui é da ${MARCA.empresa}.\n\nAcompanhamos de perto o ${c.nome}${c.bairro ? ', no ' + c.bairro : ''}.${s.a_venda ? ` Hoje há ${s.a_venda} unidade(s) à venda no prédio` : ''}${m2 ? `${s.a_venda ? ', com' : ' O'} m² em torno de ${cdM2(m2)}` : ''}.\n\nSe você pensa em vender ou só quer saber quanto vale o seu apartamento hoje, fazemos uma avaliação sem compromisso.\n\nPara não receber mais mensagens, responda PARAR.`;
  modal(`<h2>Mensagem para os vizinhos</h2><p class="muted small">Para usar com proprietários que já autorizaram contato (carta, portaria ou WhatsApp com quem respondeu). Os números vêm da ficha.</p>
    <textarea style="width:100%;min-height:220px" readonly>${esc(txt)}</textarea>
    <div class="row" style="margin-top:10px"><button class="btn pri" data-act="copiar" data-txt="${esc(txt)}">Copiar</button><button class="btn" data-fecha>Fechar</button></div>`);
};

// ---------- cadastro de imóvel: o condomínio reconhecido vem com id; mexer no nome desfaz o vínculo ----------
document.addEventListener('input', (e) => {
  if (e.target.name === 'condominio_nome') { const h = e.target.form && e.target.form.elements.condominio_id; if (h) h.value = ''; }
});
