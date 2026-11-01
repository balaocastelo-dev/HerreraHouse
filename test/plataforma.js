// Plataforma: painel do gestor (página, API sem banco, travas) e conta suspensa numa imobiliária.
//   node test/plataforma.js
const os = require('os'), path = require('path'), fs = require('fs');
const assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-plataforma-'));
process.env.HOUSE_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = process.env.SECRET_KEY || 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
delete process.env.DATABASE_URL; delete process.env.PLATAFORMA_DATABASE_URL;
const { setConfig } = require('../src/db');
const G = require('../src/plataforma/gestor');

(async () => {
  // utilidades
  assert.equal(G.slugDe('ONDEMORAR.COM'), 'ondemorar'); assert.equal(G.slugDe('Imóveis São João'), 'imoveissaojoao');
  assert.equal(G.decifra(G.cifra('postgres://x:y@z/db')), 'postgres://x:y@z/db');
  const h = G.hashSenha('senha-boa-123'); assert.ok(G.confere('senha-boa-123', h)); assert.ok(!G.confere('outra', h));
  console.log('ok · nome técnico, cifra e senha');

  const app = require('../server');
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  let r = await fetch(base + '/gestor'); assert.equal(r.status, 200); assert.ok(/Painel do gestor/.test(await r.text())); console.log('ok · página do painel');
  r = await fetch(base + '/gestor-api/eu'); assert.equal(r.status, 401); r = await fetch(base + '/gestor-api/eu', { headers: { cookie: 'gestor_sessao=abc' } }); assert.equal(r.status, 503); console.log('ok · sem sessão 401; sem banco da plataforma 503');
  r = await fetch(base + '/gestor-api/imobiliarias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(r.status, 403); console.log('ok · pedido sem o cabeçalho do painel é recusado');
  r = await fetch(base.replace('127.0.0.1', 'localhost') + '/gestor'); assert.equal(r.status, 200);

  // página inicial: sem usuários ainda (primeiro acesso) é o sistema; depois, o portal com o botão Entrar
  r = await fetch(base + '/'); assert.ok(/app\.js|MARCA|marca\.js/.test(await r.text()), 'primeiro acesso abre o sistema');
  require('../src/db').run("INSERT INTO usuarios(nome,email,perfil,senha_hash) VALUES('A','a@a.com','adm','x')");
  r = await fetch(base + '/'); let t = await r.text(); assert.ok(/ir\.js/.test(t) && !/marca\.js/.test(t), 'visitante vai para o portal');
  r = await fetch(base + '/entrar'); assert.ok(/marca\.js/.test(await r.text()), '/entrar abre o sistema');
  r = await fetch(base + '/imoveis'); t = await r.text(); assert.ok(/href="\/entrar"/.test(t), 'portal tem o botão Entrar');
  console.log('ok · página inicial = portal com "Entrar"; /entrar abre o sistema');

  // conta suspensa. 127.0.0.1 e localhost são host do gestor; a imobiliária é outro nome.
  const http = require('http');
  const porta = srv.address().port;
  const pedir = (caminho, host) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: porta, path: caminho, method: 'GET', headers: { Host: host } }, (res) => {
      const bufs = [];
      res.on('data', (b) => bufs.push(b));
      res.on('end', () => { const body = Buffer.concat(bufs); resolve({ status: res.statusCode, headers: res.headers, body, text: body.toString('utf8') }); });
    });
    req.on('error', reject);
    req.end();
  });
  const tenant = 'lumen.corretordofuturo.app';
  let s = await pedir('/imoveis', tenant); assert.notEqual(s.status, 503);
  setConfig('plataforma_suspensa', '1'); require('../src/plataforma/suspensa').limpa();
  s = await pedir('/imoveis', tenant); assert.equal(s.status, 503); assert.ok(/fora do ar/.test(s.text));
  s = await pedir('/api/imoveis', tenant); assert.equal(s.status, 423);
  s = await pedir('/style.css', tenant); assert.equal(s.status, 200);
  s = await pedir('/favicon.ico', tenant); assert.equal(s.status, 200); assert.equal(s.body.readUInt16LE(2), 1);
  for (const host of ['corretordofuturo.app', 'www.corretordofuturo.app', '127.0.0.1', 'localhost']) {
    for (const caminho of ['/gestor/foo', '/gestor/api']) {
      s = await pedir(caminho, host);
      assert.notEqual(s.status, 503, `${host} ${caminho}`);
      assert.equal(s.status, 404, `${host} ${caminho}`);
      assert.ok(!/fora do ar/.test(s.text), `${host} ${caminho}`);
    }
  }
  s = await pedir('/gestor', 'corretordofuturo.app'); assert.equal(s.status, 200); assert.ok(/Painel do gestor/.test(s.text));
  s = await pedir('/', 'corretordofuturo.app'); assert.equal(s.status, 200); assert.ok(!/fora do ar/.test(s.text));
  setConfig('plataforma_suspensa', '0'); require('../src/plataforma/suspensa').limpa();
  s = await pedir('/imoveis', tenant); assert.notEqual(s.status, 503);
  console.log('ok · conta suspensa no tenant; plataforma e gestor não mostram o aviso');

  // vitrine: ícone de verdade (não o HTML da home) e cartão do Twitter com imagem
  s = await pedir('/favicon.ico', 'corretordofuturo.app');
  assert.equal(s.status, 200, 'favicon');
  assert.ok(!/html/i.test(String(s.headers['content-type'] || '')), s.headers['content-type']);
  assert.ok(!s.text.startsWith('<!'));
  assert.equal(s.body.readUInt16LE(0), 0); assert.equal(s.body.readUInt16LE(2), 1);
  s = await pedir('/icon.svg', 'corretordofuturo.app'); assert.equal(s.status, 200); assert.ok(/svg/.test(s.headers['content-type'])); assert.ok(s.text.includes('<svg'));
  s = await pedir('/apple-touch-icon.png', 'corretordofuturo.app'); assert.equal(s.status, 200); assert.ok(/png/.test(s.headers['content-type'])); assert.equal(s.body.readUInt32BE(0), 0x89504e47);
  s = await pedir('/', 'corretordofuturo.app');
  assert.ok(s.text.includes('name="twitter:image" content="https://corretordofuturo.app/plataforma/telas/3d-noite.webp"'));
  assert.ok(s.text.includes('property="og:image:alt"'));
  assert.ok(s.text.includes('property="og:image:width" content="2880"'));
  assert.ok(s.text.includes('property="og:image:height" content="1800"'));
  assert.ok(s.text.includes('rel="icon" href="/favicon.ico"'));
  assert.ok(s.text.includes('preload="none"'));
  assert.ok(s.text.includes('3d-poster.webp?v=5'));
  assert.ok(s.text.includes('data-mp4="/plataforma/telas/3d.mp4?v=5"'));
  assert.ok(!/src="[^"]*3d\.mp4/.test(s.text), 'o mp4 não sai no HTML');
  const mp4 = fs.statSync(path.join(__dirname, '..', 'public/plataforma/telas/3d.mp4')).size;
  const webm = fs.statSync(path.join(__dirname, '..', 'public/plataforma/telas/3d.webm')).size;
  assert.ok(mp4 < 1400 * 1024, `mp4 ainda pesado: ${mp4}`);
  assert.ok(webm < 1100 * 1024, `webm ainda pesado: ${webm}`);
  assert.ok(mp4 < 2830472 * 0.6 && webm < 2814911 * 0.5, `vídeo não ficou bem mais leve: mp4 ${mp4} webm ${webm}`);
  console.log(`ok · favicon, twitter:image e vídeo (mp4 ${mp4} bytes, webm ${webm} bytes)`);
  srv.close();
  console.log('\nPlataforma: tudo certo.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
