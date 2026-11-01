// Teste dos Condomínios: reconhecer pelo endereço/mapa, ligar Radar/Fisguei/carteira, números da ficha, edição e cena 3D.
// Sem internet: o mapa aberto (Overpass) é simulado com um recorte gravado (test/condominio-osm.json, se existir).
const os = require('os'), path = require('path'), fs = require('fs'), zlib = require('zlib');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-cd-'));
process.env.HOUSE_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = process.env.SECRET_KEY || 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
process.env.MERCADO_CACHE_S = '0';
delete process.env.DATABASE_URL;
const assert = require('assert');
const O = require('../src/condominios/overpass');
const FIX = path.join(__dirname, 'condominio-osm.json');
O.overpass = async (q) => (fs.existsSync(FIX) && !/amenity/.test(q) ? JSON.parse(fs.readFileSync(FIX, 'utf8')) : { elements: [
  { type: 'node', lat: -22.9010, lon: -47.0750, tags: { amenity: 'school', name: 'Escola Teste' } },
  { type: 'node', lat: -22.9030, lon: -47.0760, tags: { shop: 'supermarket', name: 'Mercado Teste' } },
  { type: 'way', center: { lat: -22.9000, lon: -47.0740 }, tags: { leisure: 'park', name: 'Praça Teste' } },
] });
const app = require('../server');
const { run, one } = require('../src/db');
const G = require('../src/condominios/geo');
const B = require('../src/condominios/base');

(async () => {
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  let cookie = '';
  const req = async (m, url, body) => {
    const r = await fetch(base + url, { method: m, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { s: r.status, j };
  };
  const ok = (r, msg) => { if (r.s >= 400) { console.error('FALHOU', msg, r.s, r.j); process.exit(1); } console.log('ok ·', msg); return r.j; };
  ok(await req('POST', '/api/setup', { nome: 'Thiago Adm', email: 'adm@exemplo.test', senha: 'Teste1234' }), 'setup');

  // utilidades
  assert.deepEqual(G.andarDaUnidade('142 Torre B'), { andar: 14, final: 2, torre: 'B' });
  assert.equal(G.andarDaUnidade('1203').andar, 12);
  assert.equal(G.andarDaUnidade('101', 'nn').andar, 1);
  assert.equal(G.andarDaUnidade('101').andar, 10);
  assert.equal(G.andarDaUnidade('Térreo').andar, 0);
  assert.ok(G.semelhanca('Cond. Edifício Solar das Acácias', 'Edifício Solar das Acacias') > 0.9);
  assert.ok(G.dentro(-22.5, -47.5, [[-22, -48], [-23, -48], [-23, -47], [-22, -47]]));
  console.log('ok · andar pela unidade, nomes e polígono');

  // base: um prédio (CNPJ + Censo), um condomínio de casas com contorno e um comercial
  const ins = (c) => Number(run(`INSERT INTO condominios(nome,tipo,cnpj,cep,logradouro,numero,bairro,cidade,uf,lat,lon,geo_fonte,fontes,andares,torres,unidades,unidades_fonte,contorno,numeracao,slug,nome_busca)
    VALUES(?,?,?,?,?,?,?,'Campinas','SP',?,?,?,?,?,?,?,?,?,?,?,?)`, c.nome, c.tipo, c.cnpj || null, c.cep || null, c.logradouro || null, c.numero || null, c.bairro || null, c.lat || null, c.lon || null,
  c.lat ? 'censo' : null, c.fontes, c.andares || null, c.torres || null, c.unidades || null, c.unidades ? 'IBGE · Censo 2022' : null, c.contorno || null, c.numeracao || null, G.slug(c.nome), G.chave(c.nome)).lastInsertRowid);
  const ed = ins({ nome: 'Edifício Central View', tipo: 'vertical', cnpj: '11222333000181', cep: '13013000', logradouro: 'Avenida Governador Pedro de Toledo', numero: '1000', bairro: 'Bonfim', lat: -22.9017172, lon: -47.0755935, fontes: 'cnpj,censo', andares: 17, unidades: 68, numeracao: 'n' });
  const casas = ins({ nome: 'Residencial Bosque Teste', tipo: 'horizontal', cep: '13100000', logradouro: 'Rua das Árvores', numero: '50', bairro: 'Sousas', lat: -22.88, lon: -46.97, fontes: 'cnpj', contorno: JSON.stringify([[-22.875, -46.975], [-22.885, -46.975], [-22.885, -46.965], [-22.875, -46.965]]) });
  ins({ nome: 'Condomínio Empresarial Teste', tipo: 'comercial', cep: '13013001', numero: '5', fontes: 'cnpj' });
  B.limpaCache();

  // reconhecer
  let x = B.reconhecer({ cep: '13013-000', numero: '1000' }); assert.equal(x.condominio.id, ed); assert.equal(x.confianca, 'alta');
  x = B.reconhecer({ logradouro: 'Av. Governador Pedro de Toledo', numero: '1000' }); assert.equal(x.condominio && x.condominio.id, ed);
  x = B.reconhecer({ lat: -22.879, lon: -46.970 }); assert.equal(x.condominio.id, casas); assert.match(x.como, /dentro/);
  x = B.reconhecer({ lat: -22.90175, lon: -47.07562 }); assert.equal(x.condominio.id, ed); assert.match(x.como, /m no mapa/);
  x = B.reconhecer({ condominio_nome: 'Cond. Central View' }); assert.equal(x.condominio && x.condominio.id, ed);
  console.log('ok · reconhece por CEP+número, rua, ponto no contorno, distância e nome');

  // cadastro: pesquisa de endereço devolve o condomínio da base (ViaCEP/OSM podem estar fora: o reconhecimento é local)
  const end = ok(await req('GET', '/api/imoveis/endereco?cep=13013000&numero=1000&logradouro=Avenida%20Governador%20Pedro%20de%20Toledo'), 'pesquisa de endereço');
  assert.equal(end.campos.condominio_id, ed); assert.equal(end.campos.condominio_nome, 'Edifício Central View');
  const im = ok(await req('POST', '/api/imoveis', { tipo: 'Apartamento', cep: '13013000', logradouro: 'Avenida Governador Pedro de Toledo', numero: '1000', unidade: '142', condominio_id: ed, condominio_nome: 'Edifício Central View',
    quartos: 3, area_util: 120, valor: '900.000', status: 'publicado', valor_condominio: '1.100' }), 'imóvel ligado ao condomínio da base');
  assert.equal(one('SELECT condominio_id FROM imoveis WHERE id=?', im.id).condominio_id, ed);
  assert.equal(one('SELECT nome FROM condominios WHERE id=?', ed).nome, 'Edifício Central View', 'nome oficial não muda');

  // Radar e Fisguei no mesmo prédio
  run("INSERT INTO oportunidades(portal,titulo,tipo,logradouro,numero,condominio_nome,quartos,area,valor,anunciante_tipo,anunciante_nome,publicado_em,status) VALUES('ZAP','Apto 3q com piscina e academia','Apartamento','Av. Governador Pedro de Toledo','1000','Central View',3,118,950000,'imobiliaria','Imobiliária Concorrente',date('now','-10 day'),'nova')");
  run("INSERT INTO fisguei_anuncios(fisgar_id,portal,titulo,tipo,cep,logradouro,numero,lat,lon,valor,area_util,valor_condominio,quartos,anunciante_tipo,status) VALUES('fx1','OLX','Apartamento com portaria 24h','Apartamento','13013000','Avenida Governador Pedro de Toledo','1000',-22.90172,-47.07559,950000,118,1200,3,'particular','novo')");
  run("INSERT INTO fisguei_anuncios(fisgar_id,portal,titulo,tipo,cep,logradouro,numero,valor,area_util,quartos,anunciante_tipo,status) VALUES('fx2','VivaReal','Cobertura','Apartamento','13013000','Avenida Governador Pedro de Toledo','1000',1500000,200,4,'imobiliaria','novo')");
  const v = ok(await req('POST', '/api/condominios/vincular', {}), 'vincular Radar/Fisguei');
  assert.equal(v.radar, 1); assert.equal(v.fisguei, 2);

  // lista, mapa e ficha
  const l = ok(await req('GET', '/api/condominios?venda=1'), 'lista com à venda');
  assert.equal(l.itens.length, 1); assert.equal(l.itens[0].id, ed); assert.equal(l.resumo.total, 2, 'comercial fica de fora');
  const busca = ok(await req('GET', '/api/condominios?q=central'), 'busca por nome'); assert.equal(busca.itens[0].id, ed);
  const mapa = ok(await req('GET', '/api/condominios/mapa'), 'pontos do mapa'); assert.equal(mapa.length, 2);
  const f = ok(await req('GET', `/api/condominios/${ed}`), 'ficha');
  assert.equal(f.resumo.a_venda, 3, 'imóvel da carteira + 2 anúncios (Radar e Fisguei do mesmo apto viram um)');
  assert.ok(f.aVenda.some((a) => a.tambem && a.tambem.length), 'junta duplicado Radar/Fisguei');
  assert.ok(f.resumo.m2_mediano > 7000 && f.resumo.m2_mediano < 8200, 'm² mediano ' + f.resumo.m2_mediano);
  assert.deepEqual(f.resumo.imobiliarias.map((i) => i.nome).sort(), ['Imobiliária Concorrente', 'Imobiliária sem nome']);
  assert.ok(f.resumo.lazer.includes('Piscina') && f.resumo.lazer.includes('Academia') && f.resumo.lazer.includes('Portaria 24 h'), 'lazer lido dos anúncios');
  assert.ok(f.resumo.taxa_condominio >= 1100);
  assert.equal(f.unidades, 68); assert.equal(f.contorno, undefined);

  // edição, prédio-alvo, posição
  ok(await req('PUT', `/api/condominios/${ed}`, { alvo: true, construtora: 'Construtora X', andares: 18 }), 'marca alvo e edita');
  assert.equal(one('SELECT alvo, andares FROM condominios WHERE id=?', ed).andares, 18);
  assert.equal((await req('PUT', `/api/condominios/${ed}`, { lat: -10, lon: -40 })).s, 400); console.log('ok · posição fora de Campinas recusada');
  assert.equal((await req('GET', '/api/condominios?alvo=1')).j.itens.length, 1);
  run("INSERT INTO fisguei_anuncios(fisgar_id,portal,titulo,tipo,cep,logradouro,numero,valor,anunciante_tipo,status) VALUES('fx3','OLX','Novo','Apartamento','13013000','Avenida Governador Pedro de Toledo','1000',990000,'particular','novo')");
  assert.equal(ok(await req('POST', '/api/condominios/vincular', {}), 'vincula anúncio novo').fisguei, 1);
  const al = ok(await req('GET', '/api/condominios/alertas'), 'alerta de prédio-alvo'); assert.equal(al.length, 1); assert.match(al[0].texto, /990\.000 em Edifício Central View/);
  ok(await req('POST', '/api/condominios/alertas/visto'), 'alertas vistos'); assert.equal((await req('GET', '/api/condominios/alertas')).j.length, 0);
  assert.ok(ok(await req('GET', '/api/condominios?ordem=giro'), 'ranking por giro').itens[0].giro >= 3);

  // o que tem perto
  const p = ok(await req('GET', `/api/condominios/${ed}/perto`), 'o que tem perto');
  assert.ok(p.categorias.find((c) => c.id === 'escolas').itens[0].nome === 'Escola Teste');

  // 3D (prédios da base de blocos, se houver no teste; senão do recorte do mapa)
  const blocos = path.join(__dirname, 'condominio-predios3d.jsonl');
  const arqMapa = path.join(__dirname, 'condominio-mapa3d.jsonl');
  if (fs.existsSync(arqMapa)) for (const linha of fs.readFileSync(arqMapa, 'utf8').split('\n').filter(Boolean)) { const t = JSON.parse(linha); run('INSERT INTO mapa3d(tile,dados) VALUES(?,?)', t.t, Buffer.from(t.d, 'base64')); }
  if (fs.existsSync(blocos)) for (const linha of fs.readFileSync(blocos, 'utf8').split('\n').filter(Boolean)) { const t = JSON.parse(linha); run('INSERT INTO predios3d(tile,dados) VALUES(?,?)', t.t, Buffer.from(t.d, 'base64')); }
  const c3 = ok(await req('GET', `/api/condominios/${ed}/3d?imovel=${im.id}`), 'cena 3D');
  assert.ok(c3.cena.predios.length > 10, 'prédios no entorno: ' + c3.cena.predios.length);
  assert.ok(c3.cena.predios.some((b) => b.alvo), 'prédio do condomínio marcado');
  assert.equal(c3.cena.alvo.andares, 18);
  assert.ok(c3.cena.vias.length > 20 && c3.cena.fonte === 'base', 'ruas da base própria, sem mapa ao vivo');
  assert.equal(c3.imovel.andar, 14);
  console.log(`   3D: ${c3.cena.predios.length} prédios, ${c3.cena.vias.length} ruas, fonte ${c3.cena.fonte}, alvo ${c3.cena.alvo.quantos} prédio(s)`);
  const c3b = ok(await req('GET', `/api/condominios/${ed}/3d`), 'cena 3D do cache'); assert.equal(c3b.cena.gerado, c3.cena.gerado);

  // página pública
  const pub = await fetch(`${base}/condominios/edificio-central-view`); const corpo = await pub.text();
  assert.equal(pub.status, 200); assert.match(corpo, /Edifício Central View/); assert.match(corpo, /noindex/);
  assert.ok(!/Governador Pedro de Toledo/.test(corpo), 'sem rua e número na página pública');
  assert.ok(!/Concorrente|Fisguei|Radar/.test(corpo), 'sem dados de concorrentes');
  console.log('ok · página pública do condomínio');
  const p3 = await (await fetch(`${base}/api/publico/condominios/edificio-central-view/3d`)).json();
  assert.ok(p3.cena.predios.length > 10); assert.equal(p3.unidades.length, 0); console.log('ok · 3D público');
  const r3 = await fetch(`${base}/condominios/edificio-central-view/3d`, { redirect: 'manual' }); assert.equal(r3.status, 302);
  const lead = await (await fetch(`${base}/api/publico/portal/interesse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ condominio: 'edificio-central-view', nome: 'Maria Visitante', telefone: '19 99876-5432', aceite: true }) })).json();
  assert.ok(lead.ok); assert.match(one("SELECT busca FROM leads WHERE nome='Maria Visitante'").busca, /Central View/); console.log('ok · "quero morar aqui" vira lead');
  assert.equal((await fetch(`${base}/condominios/condominio-empresarial-teste`)).status, 404); console.log('ok · comercial não tem página');
  const lista = await fetch(`${base}/condominios`); const listaHtml = await lista.text();
  assert.equal(lista.status, 200);
  assert.match(listaHtml, /Edifício Central View/);
  assert.match(listaHtml, /Residencial Bosque Teste/);
  assert.match(listaHtml, /href="\/condominios\/edificio-central-view"/);
  assert.match(listaHtml, /noindex/);
  assert.doesNotMatch(listaHtml, /Governador Pedro de Toledo|condominio-empresarial/);
  assert.equal((await fetch(`${base}/condominios/`, { redirect: 'manual' })).status, 301);
  console.log('ok · índice público /condominios');
  const raiz = await fetch(`${base}/`);
  assert.match(await raiz.text(), /name="viewport" content="width=device-width, initial-scale=1"/);
  const entrar = await (await fetch(`${base}/entrar`)).text();
  assert.match(entrar, /src="\/marca\.js" defer/);
  assert.match(entrar, /src="\/app\.js" defer/);
  assert.match(entrar, /href="\/entrar\.css"/);
  assert.match(entrar, /href="\/style\.css" media="print"/);
  assert.doesNotMatch(entrar, /radar\.js|fisguei|escritorio/);
  const scripts = [...entrar.matchAll(/<script\b[^>]*\bsrc="[^"]+"[^>]*>/g)];
  assert.ok(scripts.length >= 2 && scripts.every((t) => /\bdefer\b/.test(t[0])), 'scripts do login com defer');
  console.log('ok · raiz com viewport e /entrar sem os módulos pesados');

  srv.close();
  console.log('\nCondomínios: tudo certo.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
