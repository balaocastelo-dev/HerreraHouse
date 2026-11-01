// Teste do Escritório virtual: setores, alma (.soul), mensagem do cliente → IA (simulada) → ações → aprovação → envio,
// transferência entre agentes, gerente dos corretores ("feito N"), conversa de teste e relatório do dono.
const os = require('os'), path = require('path'), fs = require('fs'), http = require('http'), crypto = require('crypto'), assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-escritorio-'));
process.env.HOUSE_DB = path.join(tmp, 't.db'); process.env.SECRET_KEY = 'z'.repeat(48); process.env.IA_MODO = 'desligado';
// O teste usa só seus simuladores, mesmo em um PC com chaves e banco da plataforma no .env.
for (const k of ['DATABASE_URL', 'PLATAFORMA_DATABASE_URL', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY']) process.env[k] = '';
{
  const cifraIa = require('../src/agentes/cifra-ia');
  const material = 'postgres://teste';
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash('sha256').update(cifraIa.PREFIXO_ANTIGO + material).digest();
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update('AIzaANTIGA', 'utf8'), c.final()]);
  const pacote = [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
  assert.equal(cifraIa.decifra(material, pacote), 'AIzaANTIGA');
  assert.equal(cifraIa.decifra(material, cifraIa.cifra(material, 'AIzaNOVA')), 'AIzaNOVA');
}

// IA local de mentira: devolve a próxima resposta da fila
const respostas = [];
const ia = http.createServer((req, res) => {
  let corpo = ''; req.on('data', (c) => (corpo += c));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'qwen3:14b' }] }));
    if (req.url.startsWith('/v1beta/models?')) return res.end(JSON.stringify({ models: [{ name: 'models/gemini-flash-latest', displayName: 'Gemini Flash', supportedGenerationMethods: ['generateContent'] }] }));
    if (req.url.startsWith('/v1beta/models/')) {
      ia.gemini = { chave: req.headers['x-goog-api-key'], corpo: JSON.parse(corpo || '{}') };
      const r = respostas.shift() || { ok: true, frase: 'Escritório pronto', mensagem: 'Oi! Sou do Gemini.', acoes: [] };
      return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(r) }] } }] }));
    }
    const pedido = JSON.parse(corpo || '{}');
    ia.ultimo = pedido.messages && pedido.messages[0].content;
    res.end(JSON.stringify({ message: { content: JSON.stringify(respostas.shift() || { mensagem: 'Certo!', acoes: [] }) } }));
  });
});

(async () => {
  await new Promise((r) => ia.listen(0, r));
  process.env.OLLAMA_URL = `http://127.0.0.1:${ia.address().port}`;
  process.env.GEMINI_API_URL = `http://127.0.0.1:${ia.address().port}/v1beta`;
  const app = require('../server');
  const { one, all, run, setConfig } = require('../src/db');
  const B = require('../src/agentes/base');
  const E = require('../src/agentes/escritorio');
  const linhas = require('../src/agentes/linhas');
  const enviadas = [];
  linhas.conectada = () => true;
  linhas.enviar = async (linha, telefone, texto) => { enviadas.push({ linha, telefone, texto }); return 'wa' + enviadas.length; };
  const envelhece = () => run(`UPDATE agente_mensagens SET criado_em=datetime('now','localtime','-1 minute') WHERE processada=0`);

  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  let cookie = '';
  const req = async (m, url, body) => {
    const r = await fetch(base + url, { method: m, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let j; try { j = await r.json(); } catch { j = null; }
    if (r.status >= 400) { console.error('FALHOU', m, url, r.status, j); process.exit(1); }
    return j;
  };
  const ok = (cond, msg) => { assert.ok(cond, msg); console.log('ok ·', msg); };

  const fetchOriginal = global.fetch;
  global.fetch = (url, opcoes) => String(url).startsWith('https://api.open-meteo.com/')
    ? Promise.resolve({ ok: true, json: async () => ({ current: { temperature_2m: 24, weather_code: 3, is_day: 1 } }) }) : fetchOriginal(url, opcoes);
  const tempoPublico = await req('GET', '/api/publico/clima');
  ok(tempoPublico.temperature_2m === 24 && tempoPublico.weather_code === 3, 'clima: rota pública funciona sem sessão e consulta no servidor');
  global.fetch = fetchOriginal;

  await req('POST', '/api/setup', { nome: 'Gestor', email: 'g@r.com', senha: 'Teste1234', exemplo: true });

  // 1) escritório com 9 agentes e almas padrão
  const esc = await req('GET', '/api/escritorio');
  ok(esc.agentes.length === 9, '9 agentes na planta');
  ok(esc.agentes.every((a) => B.alma(a.slug).length > 500), 'todas as almas padrão (.soul) carregadas');

  // 1b) escritório ao vivo (modo jogo): ponto de partida, eventos novos e ações da equipe viram balão
  const v0 = await req('GET', '/api/escritorio/ao-vivo?full=1');
  ok(v0.agentes.length === 9 && v0.totais && typeof v0.ev === 'number' && typeof v0.au === 'number', 'ao vivo: 9 agentes, números e ponto de partida');
  B.evento('casas', 'visita', 'Visita marcada na casa de teste');
  const db0 = require('../src/db');
  db0.audit(null, 'portal_interesse', 'AP0001 · lead 1 · visita');
  db0.audit(null, 'login', '127.0.0.1');
  const usuarioLogin = one("SELECT id,nome FROM usuarios WHERE perfil='adm' ORDER BY id LIMIT 1");
  db0.audit(usuarioLogin.id, 'login', '127.0.0.1');
  const v1 = await req('GET', `/api/escritorio/ao-vivo?ev=${v0.ev}&au=${v0.au}`);
  ok(v1.eventos.some((e) => e.agente === 'casas' && e.tipo === 'visita'), 'ao vivo: evento novo do agente chega');
  ok(v1.sistema.some((x) => x.emoji === '📅' && /AP0001/.test(x.texto)), 'ao vivo: pedido de visita do portal vira balão');
  ok(!JSON.stringify(v1.sistema).includes('127.0.0.1'), 'ao vivo: nada de IP no balão');
  const chegada = v1.sistema.find((s) => s.agente === 'porta');
  ok(chegada.visitante.id === usuarioLogin.id && chegada.visitante.nome === usuarioLogin.nome, 'login: visitante recebe id estável e nome do usuário');
  const v2 = await req('GET', `/api/escritorio/ao-vivo?ev=${v1.ev}&au=${v1.au}`);
  ok(!v2.eventos.length && !v2.sistema.length, 'ao vivo: não repete o que já mostrou');

  // Lugares: a espera considera só mensagens efetivas; sugestões ainda não são respostas.
  const esperaId = Number(run("INSERT INTO leads(nome) VALUES(?)", 'Cliente na espera').lastInsertRowid);
  run("INSERT INTO mensagens(lead_id,telefone,direcao,texto) VALUES(?,'teste-espera',?,?)", esperaId, 'entrada', 'Podemos visitar?');
  run("INSERT INTO mensagens(lead_id,telefone,direcao,texto) VALUES(?,'teste-espera',?,?)", esperaId, 'sugestao', 'Resposta ainda não enviada');
  ok((await req('GET', '/api/leads?aguardando=1')).some((l) => l.id === esperaId), 'sofá: sugestão não tira cliente da espera');
  run("INSERT INTO mensagens(lead_id,telefone,direcao,texto) VALUES(?,'teste-espera',?,?)", esperaId, 'saida', 'Sim, vamos agendar');
  ok(!(await req('GET', '/api/leads?aguardando=1')).some((l) => l.id === esperaId), 'sofá: resposta enviada tira cliente da espera');
  const avisoId = (await req('POST', '/api/escritorio/afazeres', { texto: 'Revisar agenda da equipe' })).id;
  const avisos = await req('GET', '/api/escritorio/avisos');
  ok(avisos.eventos.some((e) => e.tipo === 'visita') && avisos.afazeres.some((f) => f.id === avisoId), 'café: eventos de hoje e afazeres abertos');
  await req('POST', `/api/escritorio/afazeres/${avisoId}/feito`);
  ok(!(await req('GET', '/api/escritorio/avisos')).afazeres.some((f) => f.id === avisoId), 'café: afazer concluído sai dos avisos');

  // Monitores: só a conversa mais recente, três mensagens efetivas e nenhum identificador no JSON.
  const msgMonitor = (tel, nome, dir, texto, status = 'enviada') => run('INSERT INTO agente_mensagens(agente,telefone,nome,direcao,texto,status) VALUES(?,?,?,?,?,?)', 'apartamentos', tel, nome, dir, texto, status);
  msgMonitor('5519000000001', 'Antigo', 'entrada', 'Conversa anterior');
  msgMonitor('5519987654321', 'Érica Souza', 'entrada', 'Quero conhecer o apartamento');
  msgMonitor('5519987654321', 'Érica Souza', 'saida', 'Olá Érica, podemos agendar');
  msgMonitor('5519987654321', 'Érica Souza', 'entrada', 'Érica Souza, (19) 98765-4321, erica@example.com');
  msgMonitor('5519987654321', 'Érica Souza', 'saida', 'Perfeito, amanhã às 10h. ' + 'Detalhe '.repeat(15));
  msgMonitor('teste-9-apartamentos', 'Teste', 'entrada', 'Não mostrar teste');
  msgMonitor('5519000000001', 'Antigo', 'saida', 'Não mostrar rascunho', 'aprovar');
  const monitor = (await req('GET', '/api/escritorio/ao-vivo?full=1')).agentes.find((a) => a.slug === 'apartamentos').ultimas;
  ok(monitor.length === 3 && monitor[0].direcao === 'saida' && monitor.every((m) => m.texto.length <= 60 && /^\d\d:\d\d$/.test(m.hora)), 'monitores: conversa recente, ordem, direção, hora e limite de 60 caracteres');
  ok(!/Érica|Souza|98765|example|telefone|rascunho|anterior|Teste/.test(JSON.stringify(monitor)) && monitor[1].texto.includes('Cliente'), 'monitores: nomes, telefone e e-mail removidos antes de enviar');
  const cookieAdm = cookie, auth = require('../src/auth');
  const corretorTeste = one("SELECT id FROM usuarios WHERE perfil='corretor' ORDER BY id LIMIT 1");
  cookie = 'hh_sessao=' + auth.criarSessao(corretorTeste.id);
  const comum = await req('GET', '/api/escritorio/ao-vivo?full=1');
  ok(comum.agentes.every((a) => !Object.hasOwn(a, 'ultimas')), 'monitores: corretor não recebe prévias');
  ok(comum.entraram.every((i) => one('SELECT corretor_id FROM imoveis WHERE id=?', i.id).corretor_id === corretorTeste.id), 'TV: corretor só recebe imóveis que pode abrir');
  ok(Number.isInteger(comum.online_total) && !Object.hasOwn(comum, 'online'), 'ocupação: corretor recebe só quantidade, sem nomes');
  cookie = cookieAdm;
  run("DELETE FROM agente_mensagens WHERE telefone IN ('5519000000001','5519987654321','teste-9-apartamentos')");
  const presencas = one("SELECT count(*) n FROM auditoria WHERE usuario_id=? AND acao='escritorio.presenca'", usuarioLogin.id).n;
  const ocupacao0 = await req('GET', '/api/escritorio/ao-vivo?full=1');
  ok(ocupacao0.online.some((u) => u.nome === 'Gestor') && ocupacao0.online.every((u) => Object.keys(u).join() === 'nome'), 'ocupação: gestor recebe somente primeiros nomes');
  ok(one("SELECT count(*) n FROM auditoria WHERE usuario_id=? AND acao='escritorio.presenca'", usuarioLogin.id).n === presencas, 'ocupação: polling não duplica presença no mesmo minuto');
  const pessoaOnline = Number(run("INSERT INTO usuarios(nome,email,perfil,senha_hash) VALUES('Presença Teste','presenca@example.test','corretor','teste')").lastInsertRowid);
  const sessaoOnline = auth.criarSessao(pessoaOnline);
  db0.audit(pessoaOnline, 'login', '');
  ok((await req('GET', '/api/escritorio/ao-vivo?full=1')).online_total === ocupacao0.online_total + 1, 'ocupação: sessão válida com atividade recente entra na contagem');
  run("UPDATE auditoria SET em=datetime('now','localtime','-6 minute') WHERE usuario_id=?", pessoaOnline);
  ok((await req('GET', '/api/escritorio/ao-vivo?full=1')).online_total === ocupacao0.online_total, 'ocupação: após cinco minutos sem atividade sai');
  db0.audit(pessoaOnline, 'login', ''); auth.encerrarSessao(sessaoOnline);
  ok((await req('GET', '/api/escritorio/ao-vivo?full=1')).online_total === ocupacao0.online_total, 'ocupação: logout retira imediatamente mesmo com atividade recente');

  // 2) setores
  ok(B.setorDoImovel({ tipo: 'Apartamento', valor: 900000, status: 'publicado' }) === 'apartamentos', 'apartamento → Ana');
  ok(B.setorDoImovel({ tipo: 'Apartamento', valor: 3500000, status: 'publicado' }) === 'alto-padrao', 'apartamento de luxo → Helena');
  ok(B.setorDoImovel({ tipo: 'Casa em condomínio', valor: 1800000, status: 'publicado' }) === 'casas', 'casa até 2 mi → Clara');
  ok(B.setorDoImovel({ tipo: 'Sobrado', valor: 2600000, status: 'publicado' }) === 'alto-padrao', 'casa acima de 2 mi → Helena');
  ok(B.setorDoImovel({ tipo: 'Terreno em condomínio', valor: 500000, status: 'publicado' }) === 'terrenos', 'terreno → Teo');
  ok(B.setorDoImovel({ tipo: 'Galpão', valor: 5e6, status: 'publicado' }) === 'comerciais', 'galpão → Bruno');
  ok(B.setorDoImovel({ tipo: 'Casa em condomínio', valor: 3.9e6, status: 'off_market' }) === 'offmarket', 'off-market → Vicente');

  // 3) alma editada na tela, baixar e voltar ao padrão
  await req('PUT', '/api/escritorio/apartamentos/alma', { alma: '---\nagente: apartamentos\n---\n# Quem eu sou\nSou a Ana, teste de alma editada com mais de quarenta caracteres.' });
  ok((await req('GET', '/api/escritorio/apartamentos')).alma.includes('teste de alma editada'), 'alma editada salva');
  await req('POST', '/api/escritorio/apartamentos/alma/restaurar');
  ok((await req('GET', '/api/escritorio/apartamentos')).alma === B.almaPadrao('apartamentos'), 'alma voltou ao padrão');

  // 4) cliente escreve no WhatsApp da Ana → IA responde com ações → fica para aprovar
  respostas.push({ mensagem: 'Oi, Paula! Tenho o AP0001, 4 quartos nas Mansões Santo Antônio. Quer visitar amanhã às 15h?',
    acoes: [{ tipo: 'atualizar_perfil', tipo_imovel: 'Apartamento', quartos_min: 4, valor_max: 2400000, bairros: 'Mansões Santo Antônio', temperatura: 'quente', resumo: 'Apto 4 quartos até 2,4 mi' },
      { tipo: 'agendar_visita', codigo: 'AP0001', quando: '2099-01-10 15:00' }, { tipo: 'agendar_visita', codigo: 'CC0001', quando: '2099-01-10 16:00' }] });
  await E.entrada({ linha: 'apartamentos', telefone: '19981112222', nome: 'Paula', texto: 'Oi, procuro apartamento de 4 quartos' });
  let lead = one(`SELECT * FROM leads WHERE telefone='5519981112222'`);
  ok(lead && lead.agente === 'apartamentos', 'lead criado e ligado à Ana');
  ok(one(`SELECT 1 FROM mensagens WHERE lead_id=? AND direcao='entrada'`, lead.id), 'mensagem aparece nas Conversas do CRM');
  envelhece(); await E.processaEntradas();
  ok(ia.ultimo.includes('AP0001') && !ia.ultimo.includes('CC0001'), 'IA viu o catálogo do setor (sem o off-market)');
  ok(ia.ultimo.includes('Sou a Ana'), 'IA recebeu a alma');
  lead = one('SELECT * FROM leads WHERE id=?', lead.id);
  ok(lead.quartos_min === 4 && lead.valor_max === 2400000 && lead.temperatura === 'quente', 'perfil do lead atualizado pela ação');
  ok(one(`SELECT 1 FROM visitas WHERE lead_id=? AND data_hora='2099-01-10 15:00'`, lead.id), 'visita marcada no imóvel do setor');
  ok(!one(`SELECT 1 FROM visitas v JOIN imoveis i ON i.id=v.imovel_id WHERE v.lead_id=? AND i.codigo='CC0001'`, lead.id), 'visita em imóvel de outro setor recusada');
  const sug = one(`SELECT * FROM agente_mensagens WHERE lead_id=? AND direcao='saida' AND agente='apartamentos'`, lead.id);
  ok(sug && sug.status === 'aprovar', 'resposta ficou para aprovação (modo sugerir)');
  ok(one(`SELECT 1 FROM mensagens WHERE lead_id=? AND direcao='sugestao'`, lead.id), 'sugestão aparece na conversa do CRM');
  ok(one(`SELECT 1 FROM agente_mensagens WHERE agente='gerente-corretores' AND direcao='saida' AND texto LIKE '%Visita marcada pelo robô%'`), 'Marta avisa o corretor da visita');

  // 5) aprovação e envio pelo número do sistema (um QR para todos os agentes)
  await req('POST', `/api/escritorio/saidas/${sug.id}/aprovar`, { texto: sug.texto + ' 😊' });
  await E.enviaSaidas();
  ok(enviadas.some((m) => m.linha === B.linhaSistema() && m.texto.endsWith('😊')), 'aprovada e enviada pelo número do sistema');
  ok(one(`SELECT 1 FROM mensagens WHERE lead_id=? AND direcao='saida'`, lead.id) && !one(`SELECT 1 FROM mensagens WHERE lead_id=? AND direcao='sugestao'`, lead.id), 'envio registrado no CRM');

  // 6) transferência: cliente quer terreno → Teo assume
  respostas.push({ mensagem: 'Para terrenos, quem cuida é o Teo. Ele já vai falar com você!', acoes: [{ tipo: 'transferir', para: 'terrenos', motivo: 'quer terreno em Sousas' }] });
  respostas.push({ mensagem: 'Oi Paula, aqui é o Teo, de terrenos da Imobiliária. Qual o tamanho que você procura?', acoes: [] });
  await E.entrada({ linha: 'apartamentos', telefone: '19981112222', nome: 'Paula', texto: 'Na verdade quero um terreno em Sousas' });
  envelhece(); await E.processaEntradas(); await E.processaEntradas();
  ok(one('SELECT agente FROM leads WHERE id=?', lead.id).agente === 'terrenos', 'lead passou para o Teo');
  ok(one(`SELECT 1 FROM agente_mensagens WHERE agente='terrenos' AND telefone='5519981112222' AND direcao='saida' AND texto LIKE '%Teo%'`), 'Teo se apresentou');

  // 7) PARAR
  await E.entrada({ linha: 'apartamentos', telefone: '19981112222', nome: 'Paula', texto: 'PARAR' });
  ok(one('SELECT nao_contatar FROM leads WHERE id=?', lead.id).nao_contatar === 1, 'PARAR bloqueia o cliente');

  // 8) gerente dos corretores: corretor responde "feito N"
  const marina = one(`SELECT id FROM usuarios WHERE nome LIKE 'Marina%'`);
  const af = (await req('POST', '/api/escritorio/afazeres', { texto: 'Ligar para a Paula', corretor_id: marina.id })).id;
  await E.entrada({ linha: 'gerente-corretores', telefone: '19999990000', nome: 'Marina', texto: `feito ${af}` });
  envelhece(); await E.processaEntradas();
  ok(one('SELECT feito FROM agente_afazeres WHERE id=?', af).feito === 1, '"feito N" fecha o afazer');

  // 9) dono fala com o Augusto; relatório
  await req('PUT', '/api/escritorio/geral', { dono_nome: 'Thiago', dono_telefone: '(19) 98888-7777' });
  await E.entrada({ linha: 'gerente', telefone: '19988887777', nome: 'Thiago', texto: 'relatório' });
  envelhece(); await E.processaEntradas();
  ok(one(`SELECT 1 FROM agente_mensagens WHERE agente='gerente' AND direcao='saida' AND telefone='5519988887777' AND texto LIKE '%Relatório do dia%'`), 'dono pede e recebe o relatório');
  ok((await req('GET', '/api/escritorio/relatorio')).texto.includes('Comercial'), 'prévia do relatório');

  // 10) conversa de teste na tela (nada sai, ações só simuladas)
  respostas.push({ mensagem: 'Olá! Procura casa em qual região?', acoes: [{ tipo: 'agendar_visita', codigo: 'AP0001', quando: '2099-02-01 10:00' }] });
  await req('POST', '/api/escritorio/casas/teste', { texto: 'Oi, quero uma casa' });
  await E.processaEntradas();
  const t = await req('GET', '/api/escritorio/casas/teste');
  ok(t.mensagens.some((m) => m.direcao === 'saida' && m.status === 'teste'), 'conversa de teste respondida');
  ok(t.acoes.length >= 1 && !one(`SELECT 1 FROM visitas WHERE data_hora='2099-02-01 10:00'`), 'ação do teste só simulada');

  // 11) linhas e ajustes
  ok(B.linhaDe('casas') === B.linhaSistema() && B.linhaDe('terrenos') === B.linhaSistema() && B.linhasEmUso().size === 1,
    'todos os agentes no mesmo número do sistema: uma sessão só');
  await req('PUT', '/api/escritorio/alto-padrao', { linha: 'propria' });
  await req('PUT', '/api/escritorio/offmarket', { linha: 'alto-padrao', modo: 'automatico' });
  ok(B.linhaDe('offmarket') === 'alto-padrao' && B.ajustes('offmarket').modo === 'automatico', 'agente usando a linha de outro');
  ok(B.linhasEmUso().size === 2, 'quem escolheu número próprio ganha a segunda sessão');
  await req('PUT', '/api/escritorio/alto-padrao', { linha: 'sistema' });
  ok(B.linhaDe('offmarket') === B.linhaSistema(), 'apontar para quem usa o número do sistema cai no número do sistema');
  await req('PUT', '/api/escritorio/offmarket', { linha: 'sistema' });
  const mesa = await req('GET', '/api/escritorio/gerente-corretores');
  ok(mesa.equipe.length >= 2, 'mesa da Marta mostra a equipe');
  await req('GET', '/api/escritorio/captador');

  // 12) chave do Gemini: cérebro na nuvem, teste responde na hora, ciclo protegido por token
  await req('PUT', '/api/escritorio/config/ia', { chave: 'AIzaTESTE_chave_de_mentira_123456', modelo: 'gemini-flash-latest' });
  const cf = await req('GET', '/api/escritorio/config');
  ok(cf.ia.provedor === 'gemini' && cf.ia.chave_final === '3456' && !JSON.stringify(cf).includes('AIzaTESTE'), 'chave salva cifrada e mostrada só no final');
  ok(!one(`SELECT 1 FROM config WHERE chave='escritorio_ia' AND valor LIKE '%AIzaTESTE%'`), 'chave não fica em texto puro no banco');
  const tst = await req('POST', '/api/escritorio/config/ia/testar', {});
  ok(tst.teste_ok && tst.modelos.length === 1, 'teste da chave lista os modelos');
  respostas.push({ mensagem: 'Oi! Aqui é a Ana, pelo Gemini.', acoes: [] });
  await req('DELETE', '/api/escritorio/apartamentos/teste');
  await req('POST', '/api/escritorio/apartamentos/teste', { texto: 'Olá' });
  const t2 = await req('GET', '/api/escritorio/apartamentos/teste');
  ok(t2.mensagens.some((m) => m.direcao === 'saida' && /Gemini/.test(m.texto)) && ia.gemini.chave === 'AIzaTESTE_chave_de_mentira_123456', 'conversa de teste respondida na hora pelo Gemini (sem PC)');
  ok(ia.gemini.corpo.systemInstruction.parts[0].text.includes('Sou a Ana'), 'Gemini recebe a alma');
  const semToken = await fetch(base + '/escritorio-ciclo', { method: 'POST' });
  ok(semToken.status === 401, 'ciclo da nuvem recusa sem token');
  respostas.push({ mensagem: 'Bom dia! Como posso ajudar?', acoes: [] });
  await E.entrada({ linha: 'casas', telefone: '19977776666', nome: 'Rui', texto: 'Bom dia' });
  envelhece();
  const tok = one(`SELECT valor FROM config WHERE chave='escritorio_ciclo_token'`).valor;
  const cic = await (await fetch(base + '/escritorio-ciclo', { method: 'POST', headers: { 'x-hh-ciclo': tok } })).json();
  ok(cic.ok && one(`SELECT 1 FROM agente_mensagens WHERE telefone='5519977776666' AND direcao='saida'`), 'ciclo da nuvem responde o cliente');

  srv.close(); ia.close();
  console.log('\nEscritório virtual: tudo certo.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
