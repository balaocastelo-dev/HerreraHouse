// Controle por IA: chave de API em qualquer rota /api, catálogo, estado, executar e consulta.
const os = require('os'), path = require('path'), fs = require('fs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-api-'));
process.env.HOUSE_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = process.env.SECRET_KEY || 'x'.repeat(48);
process.env.IA_MODO = 'desligado'; process.env.ESCRITORIO = '0'; process.env.FISGUEI_ROBO = '0'; process.env.RADAR_PORTAIS = '0';
// Exercita apenas o banco temporário e impede consultas ao cofre real da plataforma.
for (const k of ['DATABASE_URL', 'PLATAFORMA_DATABASE_URL', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY']) process.env[k] = '';
const app = require('../server');
const assert = require('assert');

(async () => {
  const srv = app.listen(0); const porta = srv.address().port;
  process.env.PORT = String(porta); require('../src/config').PORT = porta; // o executar chama o próprio sistema
  const base = `http://127.0.0.1:${porta}`;
  let cookie = '', chave = '';
  const req = async (m, url, body, comChave = false) => {
    const h = { 'Content-Type': 'application/json' };
    if (comChave) h.authorization = `Bearer ${chave}`; else h.cookie = cookie;
    const r = await fetch(base + url, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { s: r.status, j };
  };
  const ok = (r, msg) => { if (r.s >= 400) { console.error('FALHOU', msg, r.s, r.j); process.exit(1); } console.log('ok ·', msg); return r.j; };

  ok(await req('POST', '/api/setup', { nome: 'Thiago', email: 'adm@teste.local', senha: 'senha1234' }), 'administrador criado');

  const nova = ok(await req('POST', '/api/chaves', { nome: 'Claude', escopos: '*' }), 'chave de API criada');
  chave = nova.chave; assert(/^hh_[0-9a-f]{8}_/.test(chave), 'formato da chave');

  const eu = ok(await req('GET', '/api/me', null, true), 'entra pela chave em /api/me');
  assert.equal(eu.perfil, 'adm');
  assert.equal((await req('GET', '/api/me')).s, 200);                       // sessão continua valendo
  assert.equal((await fetch(base + '/api/me', { headers: { authorization: 'Bearer hh_00000000_naoexiste' } })).status, 401, 'chave falsa recusada');

  const man = ok(await req('GET', '/api/ia/manifesto', null, true), 'manifesto');
  assert(man.acoes > 150 && man.mapas.executar === '/api/ia/executar');
  const acoes = ok(await req('GET', '/api/ia/acoes', null, true), 'catálogo de ações');
  assert(acoes.length > 150 && acoes.every((a) => a.nome && a.metodo && a.caminho && a.escopo));
  const ferr = ok(await req('GET', '/api/ia/ferramentas.json', null, true), 'ferramentas para LLM');
  assert(ferr[0].name && ferr[0].input_schema.type === 'object');
  const oa = ok(await req('GET', '/api/ia/openapi.json', null, true), 'OpenAPI');
  assert.equal(oa.openapi, '3.1.0'); assert(Object.keys(oa.paths).length > 150);
  const est = ok(await req('GET', '/api/ia/estado', null, true), 'estado do sistema');
  assert('imoveis' in est.carteira && 'leads' in est.crm);

  // escrever pela chave: cria imóvel e lead
  const im = ok(await req('POST', '/api/imoveis', { tipo: 'Apartamento', bairro: 'Cambuí', valor: 1250000, quartos: 3 }, true), 'imóvel criado pela chave');
  assert(im.codigo);
  ok(await req('POST', '/api/leads', { nome: 'Cliente IA', telefone: '19999990000', origem: 'API' }, true), 'lead criado pela chave');

  // uma ferramenta só
  const ex = ok(await req('POST', '/api/ia/executar', { acao: 'imoveis.listar', query: { limite: 5 } }, true), 'executar imoveis.listar');
  assert.equal(ex.status, 200);
  const ex2 = ok(await req('POST', '/api/ia/executar', { acao: 'imoveis.ver', dados: { id: im.id } }, true), 'executar imoveis.ver');
  assert.equal(ex2.resultado.codigo, im.codigo);
  assert.equal((await req('POST', '/api/ia/executar', { acao: 'nao.existe' }, true)).s, 404, 'ação desconhecida');

  // banco: esquema e consulta só de leitura
  const esq = ok(await req('GET', '/api/ia/esquema?tabela=imoveis', null, true), 'esquema do banco');
  assert(JSON.stringify(esq).includes('codigo'));
  const cons = ok(await req('POST', '/api/ia/consulta', { sql: 'SELECT count(*) AS n FROM imoveis' }, true), 'consulta de leitura');
  assert.equal(cons.linhas[0].n, 1);
  assert.equal(cons.limite, 500);
  const dbMod = require('../src/db');
  assert.throws(() => dbMod.leitura('DELETE FROM imoveis'), /readonly/);
  assert.equal(dbMod.leitura('SELECT count(*) AS n FROM imoveis')[0].n, 1);
  const cap = ok(await req('POST', '/api/ia/consulta', {
    sql: 'WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 20) SELECT i FROM n LIMIT 20', limite: 3,
  }, true), 'LIMIT do cliente não passa do teto');
  assert.equal(cap.linhas.length, 3);
  assert.equal(cap.limite, 3);
  const junta = ok(await req('POST', '/api/ia/consulta', { sql: 'SELECT i.codigo FROM imoveis i JOIN leads l ON l.nome = \'Cliente IA\'' }, true), 'join de tabelas permitidas');
  assert.equal(junta.linhas[0].codigo, im.codigo);
  for (const sql of [
    'DELETE FROM imoveis',
    'SELECT 1; SELECT 2',
    'SELECT pg_sleep(1)',
    'SELECT pg_read_file(\'/etc/passwd\')',
    'SELECT lo_import(\'/tmp/x\')',
    'SELECT dblink(\'host=x\', \'SELECT 1\')',
    'SELECT set_config(\'a\', \'b\', false)',
    'SELECT pg_terminate_backend(1)',
    'SELECT/**/1',
    'SELECT 1 --\n',
    'SELECT * FROM pg_catalog.pg_tables',
    'SELECT * FROM sessoes',
    'SELECT senha_hash FROM usuarios',
    'COPY imoveis TO STDOUT',
  ]) assert.equal((await req('POST', '/api/ia/consulta', { sql }, true)).s, 400, 'bloqueada: ' + sql);

  // configuração
  ok(await req('PUT', '/api/ia/config', { chave: 'teste_api', valor: 'valor' }, true), 'configuração gravada');
  const cfgs = ok(await req('GET', '/api/ia/config?chave=teste_api', null, true), 'configuração lida');
  assert.equal(cfgs[0].valor, 'valor');

  // escopo e somente leitura
  const so = ok(await req('POST', '/api/chaves', { nome: 'Só painel', escopos: ['painel'], somente_leitura: true }), 'chave restrita');
  const r1 = await fetch(base + '/api/imoveis', { headers: { authorization: `Bearer ${so.chave}` } });
  assert.equal(r1.status, 403, 'escopo bloqueia /api/imoveis');
  const r2 = await fetch(base + '/api/ia/config', { method: 'PUT', headers: { authorization: `Bearer ${so.chave}`, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r2.status, 403, 'somente leitura bloqueia escrita');
  console.log('ok · escopos e somente leitura');

  // revogar
  const lista = ok(await req('GET', '/api/chaves', null, true), 'chaves listadas');
  assert(lista.length === 2 && !lista.some((c) => c.chave_hash || c.chave));
  const estrela = lista.find((c) => c.id === nova.id);
  assert.equal(estrela.limite_min, 300, 'padrão da API continua 300 quando o limite não vem');
  assert.equal(estrela.expira_em, null, 'padrão da API continua sem prazo');
  assert.equal(estrela.nome, 'Claude'); assert.equal(estrela.prefixo, nova.prefixo); assert.equal(estrela.ativo, 1);
  ok(await req('DELETE', `/api/chaves/${so.id}`, null, true), 'chave revogada');
  assert.equal((await fetch(base + '/api/ia/manifesto', { headers: { authorization: `Bearer ${so.chave}` } })).status, 401, 'chave revogada não entra');

  const log = ok(await req('GET', '/api/chaves/log?limite=5', null, true), 'registro de uso');
  assert(log.length > 0 && log[0].caminho);
  const logChave = ok(await req('GET', `/api/chaves/log?chave_id=${nova.id}&limite=50`, null, true), 'log de uma chave');
  assert(logChave.length > 0 && logChave.every((l) => l.chave_id === nova.id && l.caminho && l.metodo));

  // o que a tela manda: limite 60, validade 90, escopos explícitos, IPs e só leitura
  const tela = ok(await req('POST', '/api/chaves', {
    nome: 'Planilha', escopos: ['imoveis', 'crm'], somente_leitura: true, limite_min: 60, dias: 90, ips: ['203.0.113.10', '203.0.113.11'],
  }, true), 'chave como a tela cria');
  assert.ok(tela.chave && /não aparece de novo/.test(tela.aviso));
  const achou = ok(await req('GET', '/api/chaves', null, true), 'lista depois da tela').find((c) => c.id === tela.id);
  assert.equal(achou.nome, 'Planilha');
  assert.equal(achou.prefixo, tela.prefixo);
  assert.equal(achou.escopos, 'imoveis,crm');
  assert.equal(achou.somente_leitura, 1);
  assert.equal(achou.limite_min, 60);
  assert.equal(achou.ips, '203.0.113.10,203.0.113.11');
  assert.equal(achou.ultimo_uso, null);
  assert.equal(achou.ativo, 1);
  const falta = (new Date(achou.expira_em.replace(' ', 'T')) - Date.now()) / 864e5;
  assert.ok(falta > 89 && falta < 91, 'validade perto de 90 dias (' + falta + ')');

  const ig = ok(await req('GET', '/api/integracoes', null, true), 'integrações dizem se é gestor da plataforma');
  assert.equal(ig.gestor_plataforma, false);
  const negado = await req('POST', '/api/chaves', { nome: 'Painel', escopos: ['plataforma'] }, true);
  assert.equal(negado.s, 403, 'plataforma recusada para quem não é gestor da plataforma');
  assert.match(negado.j.erro, /gestor da plataforma/);
  const negadoTxt = await req('POST', '/api/chaves', { nome: 'Painel', escopos: 'imoveis, plataforma' }, true);
  assert.equal(negadoTxt.s, 403);

  // o mesmo administrador, quando o e-mail é de um gestor da plataforma, pode conceder o escopo
  const pg = require('pg'), PoolOriginal = pg.Pool;
  pg.Pool = class { constructor() {} on() {} async query(sql, p = []) {
    if (/lower\(email\)/.test(sql) && p[0] === 'adm@teste.local') return { rows: [{ id: 1 }] };
    return { rows: [] };
  } };
  process.env.PLATAFORMA_DATABASE_URL = 'postgres://teste:teste@127.0.0.1/teste';
  const plat = ok(await req('POST', '/api/chaves', { nome: 'Gestor', escopos: ['plataforma'], limite_min: 60, dias: 90 }, true), 'gestor da plataforma cria escopo plataforma');
  assert.deepEqual(plat.escopos, ['plataforma']);
  delete process.env.PLATAFORMA_DATABASE_URL;
  pg.Pool = PoolOriginal;
  assert.equal((await req('POST', '/api/chaves', { nome: 'Painel de novo', escopos: ['plataforma'] }, true)).s, 403, 'sem o banco da plataforma volta a recusar');

  // perfil: a tela é só do adm; a API segue aberta para o gestor e fechada para o corretor
  ok(await req('POST', '/api/usuarios', { nome: 'Gestor Teste', email: 'gestor@teste.local', perfil: 'gestor', senha: 'senha1234' }), 'gestor criado');
  ok(await req('POST', '/api/usuarios', { nome: 'Corretor Teste', email: 'corretor@teste.local', perfil: 'corretor', senha: 'senha1234' }), 'corretor criado');
  const entra = async (email) => {
    const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha: 'senha1234' }) });
    return r.headers.get('set-cookie').split(';')[0];
  };
  const como = async (ck, m, url, body) => {
    const r = await fetch(base + url, { method: m, headers: { 'Content-Type': 'application/json', cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { s: r.status, j };
  };
  const ckG = await entra('gestor@teste.local'), ckC = await entra('corretor@teste.local');
  assert.equal((await como(ckG, 'GET', '/api/chaves')).s, 200, 'gestor lista pela API');
  assert.equal((await como(ckG, 'GET', '/api/integracoes')).j.gestor_plataforma, false);
  for (const [m, url, body] of [['GET', '/api/chaves'], ['GET', '/api/chaves/log'], ['POST', '/api/chaves', { nome: 'Não' }], ['DELETE', '/api/chaves/1']]) {
    assert.equal((await como(ckC, m, url, body)).s, 403, 'corretor não mexe em chave (' + m + ' ' + url + ')');
  }
  assert.equal((await como(ckC, 'POST', '/api/ia/consulta', { sql: 'SELECT count(*) AS n FROM imoveis' })).s, 403, 'corretor não consulta SQL livre');
  assert.equal((await como(ckG, 'POST', '/api/ia/consulta', { sql: 'SELECT count(*) AS n FROM imoveis' })).s, 200, 'gestor consulta SQL de leitura');

  const html = await (await fetch(base + '/entrar')).text();
  const jsTela = await (await fetch(base + '/chaves.js')).text();
  const jsApp = await (await fetch(base + '/app.js')).text();
  assert.ok(jsApp.includes('/chaves.js'), 'a tela do sistema carrega chaves.js quando abre Configurações');
  assert.match(html, /src="\/app\.js" defer/);
  assert.doesNotMatch(html, /escritorio-jogo\.js/);
  assert.match(jsApp, /secaoChavesApi\(chaves, !!ig\.gestor_plataforma\)/);
  assert.match(jsApp, /adm \? api\('GET', '\/api\/chaves'\)/);
  const vm = require('vm');
  const ctx = { FORM: {}, ACT: {}, esc: (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) };
  vm.createContext(ctx); vm.runInContext(jsTela, ctx);
  const sec = ctx.secaoChavesApi([{ id: 3, nome: 'A & B', prefixo: 'abcd1234', escopos: '*', somente_leitura: 0, limite_min: 60, ips: null, expira_em: null, ultimo_uso: null, ativo: 1 }], false);
  assert.match(sec, /Chaves de API/); assert.match(sec, /hh_abcd1234_/); assert.match(sec, /value="60"/); assert.match(sec, /value="90"/);
  assert.match(sec, /Revogar/); assert.match(sec, /Chamadas/); assert.match(sec, /Somente leitura/);
  assert.match(sec, /A &amp; B/); assert.doesNotMatch(sec, /value="plataforma"/);
  for (const id of ['imoveis', 'crm', 'captacao', 'condominios', 'conteudo', 'escritorio', 'painel', 'config', 'sql']) assert.match(sec, new RegExp('value="' + id + '"'));
  assert.match(ctx.secaoChavesApi([], true), /value="plataforma"/);
  assert.match(ctx.secaoChavesApi([], false), /Nenhuma chave criada/);
  const vencida = ctx.secaoChavesApi([{ id: 4, nome: 'Velha', prefixo: 'ffff0000', escopos: 'painel', somente_leitura: 1, limite_min: 60, ips: '203.0.113.9', expira_em: '2000-01-01 00:00:00', ultimo_uso: '2000-01-01 00:00:00', ativo: 1 }], false);
  assert.match(vencida, /Vencida/); assert.match(vencida, /sim/); assert.match(vencida, /203\.0\.113\.9/);
  const revogada = ctx.secaoChavesApi([{ id: 5, nome: 'Fim', prefixo: '0000ffff', escopos: 'crm', somente_leitura: 0, limite_min: 60, ips: null, expira_em: null, ultimo_uso: null, ativo: 0 }], false);
  assert.match(revogada, /Revogada/); assert.doesNotMatch(revogada, /data-act="revogar-chave"/);
  console.log('ok · tela de chaves (só adm, sem a caixa plataforma para os demais)');

  await new Promise((resolve, reject) => srv.close((erro) => erro ? reject(erro) : resolve()));
  require('../src/db').db.close(); // Windows mantém o arquivo bloqueado enquanto o SQLite está aberto.
  const limpeza = fs.realpathSync(tmp);
  assert.equal(path.dirname(limpeza), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(limpeza).startsWith('hh-api-'));
  fs.rmSync(limpeza, { recursive: true, force: true });
  console.log('\nAPI de controle por IA: tudo certo.');
})().catch((e) => { console.error(e); process.exit(1); });
