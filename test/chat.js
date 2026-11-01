// Chat interno: sessões separadas, SQLite temporário e Gemini simulado, sem serviços externos.
//   node test/chat.js
const os = require('os'), path = require('path'), fs = require('fs'), http = require('http');
const assert = require('assert/strict');
const { setTimeout: espera } = require('timers/promises');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-chat-'));
process.env.HOUSE_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = 'c'.repeat(48);
process.env.IA_MODO = 'desligado';
process.env.ESTACAO_ID = 'chat-teste';
process.env.ESTACAO_CHAVE = 'est_chat_chave_ficticia_1234567890';
// Valores vazios impedem que config.js importe banco/chaves reais do .env deste PC.
for (const k of ['DATABASE_URL', 'PLATAFORMA_DATABASE_URL', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY']) process.env[k] = '';

const respostas = [], chamadas = [];
const ia = http.createServer((req, res) => {
  let corpo = ''; req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'POST' || !req.url.startsWith('/v1beta/models/') || !respostas.length) {
      res.writeHead(500); return res.end(JSON.stringify({ erro: 'Chamada de IA inesperada no teste.' }));
    }
    chamadas.push({ chave: req.headers['x-goog-api-key'], corpo: JSON.parse(corpo) });
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(respostas.shift()) }] } }] }));
  });
});

let srv, banco;
const fecha = async (servidor) => {
  if (!servidor?.listening) return;
  await new Promise((resolve, reject) => {
    servidor.close((erro) => erro ? reject(erro) : resolve());
    servidor.closeAllConnections();
  });
};

(async () => {
  try {
    await new Promise((resolve) => ia.listen(0, '127.0.0.1', resolve));
    process.env.GEMINI_API_URL = `http://127.0.0.1:${ia.address().port}/v1beta`;
    const app = require('../server');
    banco = require('../src/db');
    const { one, all, run } = banco;
    const B = require('../src/agentes/base');
    srv = app.listen(0);
    const base = `http://127.0.0.1:${srv.address().port}`;
    // Cada cliente guarda o próprio cookie; o teste nunca troca a identidade de uma requisição em andamento.
    const cliente = (cabecalhos = {}) => {
      let cookie = '';
      return async (metodo, url, corpo, status = 200, prazo = 8000) => {
        const r = await fetch(base + url, { method: metodo, headers: { 'Content-Type': 'application/json', cookie, origin: base, ...cabecalhos },
          body: corpo === undefined ? undefined : JSON.stringify(corpo), signal: AbortSignal.timeout(prazo) });
        const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
        const j = await r.json();
        assert.equal(r.status, status, `${metodo} ${url}: ${JSON.stringify(j)}`);
        return j;
      };
    };
    const adm = cliente(), ana = cliente(), bruno = cliente(), anonimo = cliente();
    const estacao = cliente({ 'x-estacao': process.env.ESTACAO_CHAVE });
    const caixa = (req) => req('GET', '/api/chat/caixa');
    const cria = (req, com, tipo = 'direta', titulo) => req('POST', '/api/chat/conversas', { tipo, com, titulo });
    const envia = (req, id, texto) => req('POST', `/api/chat/conversas/${id}/mensagens`, { texto });
    const le = (req, id, consulta = '') => req('GET', `/api/chat/conversas/${id}${consulta}`);
    const ids = (mensagens) => mensagens.map((m) => m.id);
    const semTelefones = (valor) => assert.ok(!/telefone|5519987654321|5519999999999/.test(JSON.stringify(valor)), 'chat não expõe telefones');
    const pendente = (req, desde, status = 200) => {
      let terminou = false;
      const promessa = req('GET', `/api/chat/novidades?desde=${desde}`, undefined, status)
        .finally(() => { terminou = true; });
      promessa.catch(() => {}); // A asserção seguinte pode falhar antes de aguardarmos a resposta.
      return { promessa, esperando: async () => { await espera(150); assert.ok(!terminou, 'long polling mantém a requisição aberta'); } };
    };

    await adm('POST', '/api/setup', { nome: 'Gestora Teste', email: 'gestora@chat.test', senha: 'Teste1234', exemplo: false });
    const gestora = await adm('GET', '/api/me');
    const a = await adm('POST', '/api/usuarios', { nome: 'Ana Silva', email: 'ana@chat.test', telefone: '5519999999999', perfil: 'corretor', senha: 'Teste1234' });
    const b = await adm('POST', '/api/usuarios', { nome: 'Bruno Lima', email: 'bruno@chat.test', perfil: 'corretor', senha: 'Teste1234' });
    await ana('POST', '/api/login', { email: 'ana@chat.test', senha: 'Teste1234' });
    await bruno('POST', '/api/login', { email: 'bruno@chat.test', senha: 'Teste1234' });
    for (const [metodo, url, corpo] of [
      ['GET', '/api/chat/caixa'], ['GET', '/api/chat/novidades?desde=0'],
      ['POST', '/api/chat/conversas', { tipo: 'direta', com: [a.id] }],
      ['GET', '/api/chat/conversas/1'], ['POST', '/api/chat/conversas/1/mensagens', { texto: 'Sem sessão' }],
    ]) await anonimo(metodo, url, corpo, 401);
    B.salvaAjustes('apartamentos', { nome: 'Ana Robô' });
    const inicial = await caixa(ana);
    assert.deepEqual(inicial.conversas, []);
    assert.equal(inicial.nao_lidas_total, 0);
    assert.equal(inicial.ate, 0);
    assert.deepEqual(inicial.contatos.filter((c) => c.usuario_id).map((c) => c.usuario_id).sort(), [b.id, gestora.id].sort());
    assert.equal(inicial.contatos.filter((c) => c.agente).length, 9);
    for (const agente of B.AGENTES) {
      const c = inicial.contatos.find((c) => c.agente === agente.slug);
      assert.equal(c.nome, B.ajustes(agente.slug).nome);
      assert.equal(c.foto, `/plataforma/agentes/${agente.slug}.jpg`);
    }
    assert.equal(inicial.contatos.find((c) => c.usuario_id === b.id).iniciais, 'BL');
    semTelefones(inicial);
    console.log('ok · sessão obrigatória, contatos da imobiliária, nomes e fotos dos nove robôs');

    const direta = await cria(ana, [b.id]);
    const repetidas = await Promise.all([cria(bruno, [a.id]), cria(ana, [a.id, b.id, b.id])]);
    assert.ok(repetidas.every((c) => c.id === direta.id), 'direta única nas duas direções');
    assert.equal(direta.participantes.length, 2);
    assert.equal(one('SELECT count(*) n FROM chat_conversas').n, 1);
    const m1 = await envia(ana, direta.id, '  Olá, Bruno!  ');
    const c1 = await caixa(bruno);
    assert.equal(c1.nao_lidas_total, 1);
    assert.equal(c1.conversas[0].nao_lidas, 1);
    assert.equal(c1.conversas[0].ultima_texto, 'Olá, Bruno!');
    assert.equal(c1.conversas[0].ultima_id, m1.id);
    assert.ok(c1.conversas[0].ultima_em);
    assert.equal((await caixa(ana)).nao_lidas_total, 0, 'mensagem própria não conta como não lida');
    const novidade = await bruno('GET', '/api/chat/novidades?desde=0');
    assert.deepEqual(ids(novidade.mensagens), [m1.id]);
    assert.equal(novidade.ate, m1.id);
    assert.equal(novidade.nao_lidas_total, 1, 'polling não marca como lida');
    const lida = await le(bruno, direta.id);
    assert.equal(lida.mensagens[0].remetente.nome, 'Ana Silva');
    assert.equal(lida.mensagens[0].de_usuario, a.id);
    assert.equal(lida.participantes.find((p) => p.usuario_id === b.id).lido_ate, m1.id);
    assert.equal(lida.nao_lidas_total, 0);
    assert.equal((await caixa(bruno)).nao_lidas_total, 0);
    const m2 = await envia(bruno, direta.id, 'Olá, Ana!');
    assert.equal((await caixa(ana)).nao_lidas_total, 1);
    assert.deepEqual(ids((await le(ana, direta.id, `?desde=${m1.id}`)).mensagens), [m2.id]);
    assert.equal((await caixa(ana)).nao_lidas_total, 0);
    semTelefones([c1, novidade, lida]);
    console.log('ok · conversa direta única, mensagens, última atividade e não lidas por participante');

    for (const req of [adm]) {
      await req('GET', `/api/chat/conversas/${direta.id}`, undefined, 403);
      await req('POST', `/api/chat/conversas/${direta.id}/mensagens`, { texto: 'Intrusa' }, 403);
      assert.deepEqual((await caixa(req)).conversas, []);
    }
    assert.equal(one('SELECT count(*) n FROM chat_mensagens WHERE conversa_id=?', direta.id).n, 2);
    const privada = await cria(adm, [a.id]);
    await bruno('GET', `/api/chat/conversas/${privada.id}`, undefined, 403);
    await bruno('POST', `/api/chat/conversas/${privada.id}/mensagens`, { texto: 'Intruso' }, 403);
    const poll = pendente(bruno, (await caixa(bruno)).ate);
    await poll.esperando();
    await envia(adm, privada.id, 'Só para Ana');
    await espera(1100); // O servidor consultou o banco novamente, mas a mensagem é de outra conversa.
    await poll.esperando();
    const m3 = await envia(ana, direta.id, 'Chegou durante a espera');
    const chegou = await poll.promessa;
    assert.deepEqual(ids(chegou.mensagens), [m3.id]);
    assert.equal(chegou.ate, m3.id);
    assert.equal(chegou.nao_lidas_total, 1);
    console.log('ok · não participantes (inclusive adm) bloqueados; long polling espera e filtra conversas');

    const sala = await cria(adm, [a.id, b.id, a.id], 'sala', '  Reunião da equipe  ');
    assert.equal(sala.titulo, 'Reunião da equipe');
    assert.equal(sala.participantes.length, 3);
    const ms = await envia(ana, sala.id, 'Vamos começar a reunião.');
    assert.equal((await caixa(bruno)).nao_lidas_total, 2, 'soma não lidas de direta e sala');
    assert.equal((await caixa(adm)).conversas.find((c) => c.id === sala.id).nao_lidas, 1);
    assert.equal((await caixa(ana)).conversas.find((c) => c.id === sala.id).nao_lidas, 0);
    assert.deepEqual(ids((await le(bruno, sala.id)).mensagens), [ms.id]);
    assert.equal((await caixa(bruno)).nao_lidas_total, 1, 'ler sala preserva não lidas da direta');
    await le(bruno, direta.id);
    assert.equal((await caixa(bruno)).nao_lidas_total, 0);
    console.log('ok · sala com participantes únicos e leitura independente de cada conversa');

    // Histórico grande sem depender de relógio: cursores são IDs, mesmo com datas iguais.
    const historico = await cria(ana, [b.id], 'sala', 'Histórico');
    await adm('GET', `/api/chat/conversas/${historico.id}`, undefined, 403);
    await adm('POST', `/api/chat/conversas/${historico.id}/mensagens`, { texto: 'Fora da sala' }, 403);
    assert.ok(!(await caixa(adm)).conversas.some((c) => c.id === historico.id));
    assert.equal(one('SELECT count(*) n FROM chat_mensagens WHERE conversa_id=?', historico.id).n, 0);
    console.log('ok · sala criada por corretor também impede leitura e escrita de administrador não participante');
    const lote = [];
    for (let i = 1; i <= 85; i++) lote.push(Number(run('INSERT INTO chat_mensagens(conversa_id,de_usuario,texto) VALUES(?,?,?)', historico.id, a.id, `Mensagem ${i}`).lastInsertRowid));
    const pagina = await le(bruno, historico.id);
    assert.equal(pagina.mais, true);
    assert.deepEqual(ids(pagina.mensagens), lote.slice(-80));
    const antigas = await le(bruno, historico.id, `?antes=${pagina.mensagens[0].id}`);
    assert.equal(antigas.mais, false);
    assert.deepEqual(ids(antigas.mensagens), lote.slice(0, 5));
    assert.equal(antigas.participantes.find((p) => p.usuario_id === b.id).lido_ate, lote.at(-1), 'ler antigas não retrocede o marcador');
    const incremento = await le(bruno, historico.id, `?desde=${lote[0]}`);
    assert.equal(incremento.mais, true);
    assert.deepEqual(ids(incremento.mensagens), lote.slice(1, 81));
    assert.deepEqual(ids((await le(bruno, historico.id, `?desde=${incremento.mensagens.at(-1).id}`)).mensagens), lote.slice(81));
    const lotePoll = await bruno('GET', `/api/chat/novidades?desde=${lote[0] - 1}`);
    assert.deepEqual(ids(lotePoll.mensagens), lote.slice(0, 80));
    assert.equal(lotePoll.ate, lote[79]);
    assert.deepEqual(ids((await bruno('GET', `/api/chat/novidades?desde=${lotePoll.ate}`)).mensagens), lote.slice(80));
    console.log('ok · paginação de 80 mensagens, cursores sem perdas e leitura sem retrocesso');

    for (const corpo of [{ tipo: 'direta', com: [] }, { tipo: 'direta', com: [a.id] },
      { tipo: 'direta', com: [b.id, 'casas'] }, { tipo: 'sala', com: [b.id] }, { tipo: 'direta', com: ['robo-inexistente'] }]) {
      await ana('POST', '/api/chat/conversas', corpo, 400);
    }
    for (const texto of ['', '   ', 'x'.repeat(4001), 'tarefa: oi']) await ana('POST', `/api/chat/conversas/${direta.id}/mensagens`, { texto }, 400);
    await ana('GET', `/api/chat/conversas/${direta.id}?desde=1&antes=2`, undefined, 400);
    await ana('GET', '/api/chat/novidades?desde=-1', undefined, 400);
    await adm('PATCH', `/api/usuarios/${b.id}`, { ativo: 0 });
    assert.ok(!(await caixa(ana)).contatos.some((c) => c.usuario_id === b.id));
    await ana('POST', '/api/chat/conversas', { tipo: 'direta', com: [b.id] }, 400);
    await adm('PATCH', `/api/usuarios/${b.id}`, { ativo: 1 });
    await bruno('POST', '/api/login', { email: 'bruno@chat.test', senha: 'Teste1234' });
    console.log('ok · validações de conversa, texto, cursores e contato inativo');

    const robo = await cria(ana, ['apartamentos']);
    assert.equal((await cria(ana, ['apartamentos'])).id, robo.id, 'direta com robô também é única');
    const mr = await envia(ana, robo.id, 'Pode me ajudar com os apartamentos?');
    assert.deepEqual(mr.digitando, ['apartamentos']);
    const entrada = one('SELECT * FROM agente_mensagens WHERE wa_id=?', `chat-m-${mr.id}-apartamentos`);
    assert.equal(entrada.telefone, `chat-${robo.id}-apartamentos`);
    assert.equal(entrada.linha, 'chat');
    assert.equal(entrada.nome, 'Ana Silva');
    assert.equal(entrada.processada, 0, 'sem chave, a entrada aguarda o PC');
    assert.equal(chamadas.length, 0);
    const pollRobo = pendente(ana, (await caixa(ana)).ate);
    await pollRobo.esperando();
    const saida = B.enfileiraSaida({ agente: 'apartamentos', telefone: entrada.telefone, texto: 'Resposta preparada no PC.' });
    run('UPDATE agente_mensagens SET processada=1 WHERE id=?', entrada.id);
    const retorno = await pollRobo.promessa;
    assert.equal(retorno.mensagens.length, 1);
    assert.equal(retorno.mensagens[0].texto, 'Resposta preparada no PC.');
    assert.equal(retorno.mensagens[0].de_agente, 'apartamentos');
    assert.equal(retorno.mensagens[0].de_usuario, null);
    assert.equal(retorno.mensagens[0].remetente.nome, 'Ana Robô');
    assert.equal(retorno.mensagens[0].remetente.foto, '/plataforma/agentes/apartamentos.jpg');
    assert.equal(one('SELECT count(*) n FROM chat_mensagens WHERE agente_mensagem_id=?', saida.id).n, 1);
    assert.equal((await caixa(ana)).conversas.find((c) => c.id === robo.id).nao_lidas, 1);
    assert.equal((await caixa(ana)).conversas.find((c) => c.id === robo.id).ultima_texto, 'Resposta preparada no PC.');
    assert.deepEqual((await le(ana, robo.id)).digitando, []);
    assert.equal((await le(ana, robo.id)).mensagens.length, 2, 'releituras não duplicam a resposta');
    assert.ok(!(await caixa(bruno)).conversas.some((c) => c.id === robo.id));
    semTelefones(retorno);
    console.log('ok · robô sem nuvem aguarda o PC; resposta chega no polling, uma única vez');

    // Só saídas enviadas/aprovadas do robô participante podem ser espelhadas.
    const rascunho = B.enfileiraSaida({ agente: 'apartamentos', telefone: entrada.telefone, texto: 'Resposta aprovada depois.' });
    run("UPDATE agente_mensagens SET status='aprovar' WHERE id=?", rascunho.id);
    B.enfileiraSaida({ agente: 'casas', telefone: `chat-${robo.id}-casas`, texto: 'Robô que não participa' });
    B.enfileiraSaida({ agente: 'apartamentos', telefone: '5519987654321', texto: 'Conversa de cliente fora do chat', aprovar: false });
    assert.equal((await le(ana, robo.id)).mensagens.length, 2);
    run("UPDATE agente_mensagens SET status='aprovada' WHERE id=?", rascunho.id);
    const aprovada = await le(ana, robo.id);
    assert.equal(aprovada.mensagens.length, 3);
    assert.equal(aprovada.mensagens.at(-1).texto, 'Resposta aprovada depois.');
    assert.equal((await le(ana, robo.id)).mensagens.length, 3);
    semTelefones([aprovada, await caixa(ana)]);
    console.log('ok · espelhamento filtra aprovação, participação e conversas de clientes');

    await adm('PUT', '/api/escritorio/config/ia', { chave: 'AIzaTESTE_chat_chave_ficticia_123456', modelo: 'gemini-flash-latest' });
    respostas.push({ mensagem: 'Posso ajudar, Ana! Resposta da nuvem simulada.', acoes: [] });
    const nuvem = await envia(ana, robo.id, 'O que você pode fazer pela equipe?');
    assert.deepEqual(nuvem.digitando, []);
    const conversaRobo = await le(ana, robo.id, `?desde=${nuvem.id}`);
    assert.equal(conversaRobo.mensagens.length, 1);
    assert.equal(conversaRobo.mensagens[0].texto, 'Posso ajudar, Ana! Resposta da nuvem simulada.');
    assert.equal(conversaRobo.mensagens[0].de_agente, 'apartamentos');
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].chave, 'AIzaTESTE_chat_chave_ficticia_123456');
    assert.ok(JSON.stringify(chamadas[0].corpo).includes('O que você pode fazer pela equipe?'));
    const salaRobos = await cria(adm, [a.id, 'apartamentos', 'casas'], 'sala', 'Equipe e robôs');
    respostas.push({ mensagem: 'Apartamentos na reunião.', acoes: [] }, { mensagem: 'Casas na reunião.', acoes: [] });
    const reuniao = await envia(ana, salaRobos.id, 'Olá, equipe de robôs!');
    const respostasSala = await le(adm, salaRobos.id, `?desde=${reuniao.id}`);
    assert.deepEqual(respostasSala.mensagens.map((m) => m.de_agente).sort(), ['apartamentos', 'casas']);
    assert.deepEqual(respostasSala.mensagens.map((m) => m.texto), ['Apartamentos na reunião.', 'Casas na reunião.']);
    assert.equal(chamadas.length, 3);
    assert.equal(respostas.length, 0);
    assert.equal(all('SELECT * FROM leads').length, 0, 'chat interno não cria clientes no CRM');
    semTelefones([conversaRobo, respostasSala]);
    console.log('ok · cérebro responde pela nuvem simulada na direta e para cada robô da sala');

    // A estação é simulada pela API: nenhum PC ou serviço externo executa o pedido.
    await bruno('GET', `/api/chat/conversas/${salaRobos.id}`, undefined, 403);
    await bruno('POST', `/api/chat/conversas/${salaRobos.id}/mensagens`, { texto: 'tarefa: Pedido de quem não participa' }, 403);
    assert.equal(one('SELECT count(*) n FROM agente_tarefas').n, 0, 'envio negado não cria tarefa');
    const pedido = 'Prepare o resumo dos imóveis para a reunião';
    const mt = await envia(ana, salaRobos.id, `tarefa: ${pedido}`);
    const tarefas = all('SELECT * FROM agente_tarefas ORDER BY id');
    assert.deepEqual(tarefas.map((t) => t.agente).sort(), ['apartamentos', 'casas']);
    for (const t of tarefas) {
      assert.equal(t.pedido, pedido);
      assert.equal(t.criado_por, a.id);
      assert.equal(t.para_nome, 'Ana Silva');
      assert.equal(t.para_telefone, `chat-${salaRobos.id}-${t.agente}`);
      assert.equal(t.status, 'fila');
    }
    assert.deepEqual(mt.digitando, [], 'pedido direto de tarefa já foi processado');
    assert.equal(chamadas.length, 3, 'tarefa explícita não consulta a IA, mesmo com chave configurada');
    const confirmacoes = await le(ana, salaRobos.id, `?desde=${mt.id}`);
    assert.deepEqual(confirmacoes.mensagens.map((m) => m.de_agente).sort(), ['apartamentos', 'casas']);
    assert.ok(confirmacoes.mensagens.every((m) => /Recebi a tarefa/.test(m.texto)));
    const cursorTarefa = confirmacoes.mensagens.at(-1).id;
    const recebidas = await estacao('POST', '/estacao-api/batida', { agentes: {} });
    assert.deepEqual(ids(recebidas.tarefas), ids(tarefas));
    assert.deepEqual((await estacao('POST', '/estacao-api/batida', { agentes: {} })).tarefas, [], 'estação recebe cada tarefa uma vez');
    for (const t of tarefas) {
      await estacao('POST', `/estacao-api/tarefa/${t.id}`, { concluir: { resultado: `Resumo de ${t.agente} pronto para a reunião.` } });
      assert.equal(one('SELECT status FROM agente_tarefas WHERE id=?', t.id).status, 'feita');
    }
    const resultados = await ana('GET', `/api/chat/novidades?desde=${cursorTarefa}`);
    assert.equal(resultados.mensagens.length, 2);
    assert.deepEqual(resultados.mensagens.map((m) => m.de_agente).sort(), ['apartamentos', 'casas']);
    for (const m of resultados.mensagens) {
      assert.equal(m.conversa_id, salaRobos.id, 'resultado volta à sala que originou a tarefa');
      assert.equal(m.de_usuario, null);
      assert.match(m.texto, /Tarefa concluída/);
      assert.ok(m.texto.includes(`Resumo de ${m.de_agente} pronto para a reunião.`));
    }
    assert.equal((await caixa(ana)).conversas.find((c) => c.id === salaRobos.id).nao_lidas, 2);
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(ids((await le(ana, salaRobos.id, `?desde=${cursorTarefa}`)).mensagens), ids(resultados.mensagens), 'releitura não duplica resultados');
    }
    assert.equal((await caixa(ana)).conversas.find((c) => c.id === salaRobos.id).nao_lidas, 0);
    assert.ok(!(await caixa(bruno)).conversas.some((c) => c.id === salaRobos.id));
    assert.deepEqual((await le(ana, robo.id, `?desde=${cursorTarefa}`)).mensagens, [], 'resultado não vaza para a direta com o mesmo robô');
    assert.equal(one('SELECT count(*) n FROM leads').n, 0);
    assert.equal(one("SELECT count(*) n FROM agente_mensagens WHERE telefone LIKE 'chat-%' AND direcao='saida' AND status IN ('fila','enviando')").n, 0, 'respostas do chat não entram na fila de WhatsApp');
    semTelefones([confirmacoes, resultados]);
    console.log('ok · tarefa para cada robô, estação recebe uma vez e resultado volta à sala sem duplicar nem enviar WhatsApp');

    // A ação sugerida pela IA também precisa preservar a autoria de quem escreveu no chat.
    const pedidoRobo = 'Compare os apartamentos disponíveis para a próxima reunião';
    respostas.push({ mensagem: 'Vou preparar a comparação no meu PC.', acoes: [{ tipo: 'tarefa_pc', pedido: pedidoRobo }] });
    const sugerida = await envia(ana, robo.id, 'Você pode preparar uma comparação dos apartamentos?');
    const novasTarefas = all('SELECT * FROM agente_tarefas WHERE id>? ORDER BY id', tarefas.at(-1).id);
    assert.equal(novasTarefas.length, 1);
    const tarefaRobo = novasTarefas[0];
    assert.equal(tarefaRobo.agente, 'apartamentos');
    assert.equal(tarefaRobo.pedido, pedidoRobo);
    assert.equal(tarefaRobo.criado_por, a.id);
    assert.equal(tarefaRobo.para_nome, 'Ana Silva');
    assert.equal(tarefaRobo.para_telefone, `chat-${robo.id}-apartamentos`);
    assert.equal(tarefaRobo.status, 'fila');
    assert.equal(chamadas.length, 4);
    assert.equal(respostas.length, 0);
    const respostaTarefa = await le(ana, robo.id, `?desde=${sugerida.id}`);
    assert.equal(respostaTarefa.mensagens.length, 1);
    assert.equal(respostaTarefa.mensagens[0].de_agente, 'apartamentos');
    assert.equal(respostaTarefa.mensagens[0].texto, 'Vou preparar a comparação no meu PC.');
    await le(ana, robo.id);
    assert.equal(one('SELECT count(*) n FROM agente_tarefas WHERE id>?', tarefas.at(-1).id).n, 1, 'reler resposta não recria a tarefa sugerida');
    semTelefones(respostaTarefa);
    console.log('ok · ação tarefa_pc da resposta do robô preserva autor, agente e conversa de origem');

    const revogado = pendente(bruno, (await caixa(bruno)).ate, 401);
    await revogado.esperando();
    await bruno('POST', '/api/logout');
    assert.match((await revogado.promessa).erro, /Sessão expirada/);
    await bruno('POST', '/api/login', { email: 'bruno@chat.test', senha: 'Teste1234' });
    const desativado = pendente(bruno, (await caixa(bruno)).ate, 401);
    await desativado.esperando();
    await adm('PATCH', `/api/usuarios/${b.id}`, { ativo: 0 });
    assert.match((await desativado.promessa).erro, /Sessão expirada/);
    await bruno('GET', '/api/chat/caixa', undefined, 401);
    await adm('PATCH', `/api/usuarios/${b.id}`, { ativo: 1 });
    await bruno('POST', '/api/login', { email: 'bruno@chat.test', senha: 'Teste1234' });
    const antesEspera = await caixa(bruno), inicio = Date.now();
    const vazio = await bruno('GET', `/api/chat/novidades?desde=${antesEspera.ate}`, undefined, 200, 35000);
    assert.ok(Date.now() - inicio >= 24000, 'sem mensagens, espera o prazo de aproximadamente 25 segundos');
    assert.deepEqual(vazio.mensagens, []);
    assert.equal(vazio.ate, antesEspera.ate);
    assert.equal(vazio.nao_lidas_total, antesEspera.nao_lidas_total);
    console.log('ok · long polling respeita logout e desativação e devolve cursor/contador após 25 segundos sem novidades');
  } finally {
    await Promise.all([fecha(srv), fecha(ia)]);
    banco?.db.close(); // No Windows, fechar o SQLite antes de remover seu diretório.
    const limpeza = fs.realpathSync(tmp);
    assert.equal(path.dirname(limpeza), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(limpeza).startsWith('hh-chat-'));
    fs.rmSync(limpeza, { recursive: true, force: true });
  }
  console.log('\nChat: todos os testes passaram.');
})().catch((erro) => { console.error('FALHOU', erro); process.exitCode = 1; });
