// Herrera HOUSE IA · Fase 1 — servidor local.
const path = require('path');
const fs = require('fs');
const express = require('express');
const cfg = require('./src/config');

if (!cfg.SECRET_KEY || cfg.SECRET_KEY.length < 32) {
  console.error(`\n[ERRO] ${cfg.SISTEMA_NOME}: SECRET_KEY ausente no arquivo .env. Rode o INICIAR.ps1 para gerar a configuração.\n`);
  process.exit(1);
}

const { mesmaOrigem, exigeLogin } = require('./src/auth');
const publico = require('./src/routes/publico');

const app = express();
app.disable('x-powered-by');
// IP real do visitante: atrás da Vercel (link online) ou de túnel local (cloudflared).
app.set('trust proxy', process.env.VERCEL ? 1 : 'loopback');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // só a própria tela se embute (painel do lugar no escritório 3D); quem manda é o frame-ancestors da CSP
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob: https:; frame-src 'self' https://www.google.com https://maps.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self' blob: wss://*.trycloudflare.com wss://*.corretordofuturo.app ws://127.0.0.1:* ws://localhost:*; frame-ancestors 'self'; base-uri 'none'; form-action 'self'"); // frame-src/frame-ancestors 'self' = painel do lugar no escritório 3D (a própria tela do sistema embutida); blob: = texturas dos humanos 3D (GLTFLoader lê as imagens embutidas por blob:)
  next();
});

// Ícone do produto em qualquer host. No domínio da plataforma a vitrine redireciona o resto para a home;
// sem esta rota, /favicon.ico virava o HTML da página. Imobiliária com tema próprio continua trocando o
// ícone da aba pelo dela (tema.js / app.js); o arquivo daqui é o pedido automático do navegador.
const ICONE_TIPO = {
  '/favicon.ico': 'image/x-icon',
  '/icon.svg': 'image/svg+xml',
  '/apple-touch-icon.png': 'image/png',
  '/apple-touch-icon-precomposed.png': 'image/png',
  '/site.webmanifest': 'application/manifest+json',
};
app.use((req, res, next) => {
  const tipo = ICONE_TIPO[req.path];
  if (!tipo || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
  const nome = req.path === '/apple-touch-icon-precomposed.png' ? 'apple-touch-icon.png' : req.path.slice(1);
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.type(tipo);
  res.sendFile(path.join(__dirname, 'public', nome), (err) => { if (err) next(err); });
});

// Painel do gestor da plataforma (corretordofuturo.app/gestor): as imobiliárias clientes.
app.use(require('./src/plataforma/gestor').gestor);
// Domínio da plataforma (corretordofuturo.app): vitrine do produto, nunca o sistema ou o portal de um cliente.
app.use(require('./src/plataforma/vitrine').vitrine);
// Imobiliária tirada do ar por completo (FORA_DO_AR=1): só o domínio da plataforma continua respondendo.
app.use(require('./src/plataforma/fora-do-ar'));
// Conta suspensa pelo gestor da plataforma: sistema, portal e blog desta imobiliária mostram o aviso.
app.use(require('./src/plataforma/suspensa'));
// Chegada pela entrada da plataforma (app.corretordofuturo.app): troca o passe de 2 minutos por uma sessão normal.
app.get('/entrar-pela-plataforma', require('./src/plataforma/entrada').trocaPasse);

// Webhook do WhatsApp precisa do corpo bruto: vem antes do parser JSON.
app.use('/webhook/whatsapp', publico.webhook);

// Escritório virtual: ciclo do cérebro na nuvem (agendador do Supabase a cada minuto + aviso do PC quando chega mensagem).
app.post('/escritorio-ciclo', require('./src/routes/escritorio').ciclo);
// Redes e publicações: artes (/social/arte), links rastreados (/r/…), página "link na bio" (/links),
// volta da conexão com Facebook/Google (/redes/retorno/…) e o ciclo do agendador (/social-ciclo).
app.use(require('./src/routes/social').publico);

// Extensão do Chrome "Fisguei → Herrera HOUSE IA": entra com a chave própria (fora de /api, sem sessão).
app.use('/fisguei-api', require('./src/routes/fisguei').receber);

// PCs virtuais dos agentes: a estação (RTX ou servidor) entra com a chave própria (fora de /api, sem sessão).
app.use('/estacao-api', require('./src/estacao/servidor').est);

app.use(express.json({ limit: '1mb' }));
// Controle por IA: qualquer rota /api aceita uma chave de API (Authorization: Bearer hh_...).
// Vem antes de tudo: a chave resolve o usuário, dispensa o cookie e o CSRF de navegador.
const apiIA = require('./src/api-ia');
app.use('/api', apiIA.porChave);
app.use('/gestor-api', apiIA.porChave);
app.use('/api', mesmaOrigem);
app.use('/api/publico/portal', require('./src/routes/portal').api);
app.use('/api/publico/blog', require('./src/routes/blog').api);
app.use('/api/publico/condominios', require('./src/condominios/publico').api);
app.use('/api/publico/bairros', require('./src/routes/bairros').api);
app.use('/api/publico', publico);
const ABERTAS = new Set(['/setup', '/login', '/logout', '/drive/callback']);
app.use('/api', (req, res, next) => (ABERTAS.has(req.path) ? next() : exigeLogin(req, res, next)));
app.use('/api', apiIA.rotas); // chaves de API e /api/ia (catálogo, estado, executar, consulta)
app.use('/api', require('./src/routes/arquivos'));
app.use('/api/imoveis', require('./src/routes/imoveis'));
app.use('/api', require('./src/routes/leads'));
app.use('/api', require('./src/routes/radar'));
app.use('/api', require('./src/routes/fisguei').api);
app.use('/api', require('./src/routes/dashboard'));
app.use('/api', require('./src/routes/base'));
app.use('/api', require('./src/routes/chat'));
app.use('/api', require('./src/routes/condominios'));
app.use('/api', require('./src/routes/mercado'));
app.use('/api', require('./src/routes/captacao'));
// Escritório virtual: os 9 agentes robôs (#/whats), cada um com alma (.soul) e WhatsApp próprio.
app.use('/api', require('./src/routes/escritorio'));
app.use('/api', require('./src/routes/lgpd')); // aceite dos termos, pedidos de titulares, não contatar
// Redes e publicações (#/redes): calendário, aprovação e contas do Instagram, Facebook e Google Meu Negócio.
app.use('/api', require('./src/routes/social').api);
app.use('/api', require('./src/estacao/servidor').api); // PCs virtuais dos agentes: passe, tarefas, cérebro
// Páginas de bairros: a lista, a situação de cada página e o que a imobiliária (cliente) quer em cada uma.
app.use('/api', require('./src/routes/bairros').tela);
// Blog: a situação (agendados, esperando foto) para a tela do sistema.
app.get('/api/blog', async (req, res) => res.json(await require('./src/blog/diario').situacao()));
app.get('/api/blog/:slug/redes', async (req, res) => {
  const r = await require('./src/blog/diario').redes(req.params.slug);
  if (!r) return res.status(404).json({ erro: 'Texto não encontrado.' });
  res.json(r);
});
// Portal: a situação da página de cada imóvel, para a tela do sistema.
app.get('/api/portal', async (req, res) => res.json(await require('./src/portal/fonte').situacao()));
app.get('/api/portal/:codigo/redes', async (req, res) => {
  const x = await require('./src/portal/fonte').porCodigo(String(req.params.codigo).toUpperCase());
  if (!x || !x.pagina.redes) return res.status(404).json({ erro: 'Página não encontrada.' });
  res.json({ legenda: `${x.pagina.redes.legenda}\n\n${require('./src/portal/paginas').urlBase(req)}/imoveis/${x.pagina.slug}`, hashtags: x.pagina.redes.hashtags.map((h) => `#${h}`).join(' ') });
});
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

const PUB = path.join(__dirname, 'public');
// Blog público (sem login): /blog, artigos, categorias, RSS, sitemap e robots.
app.use(require('./src/routes/blog'));
// Portal do visitante (sem login): /imoveis, a página única de cada imóvel, fotos e favoritos.
app.use(require('./src/routes/portal'));
// Guias de bairro (sem login): /bairros e /bairros/<bairro>, com fotos reais e números ao vivo.
app.use(require('./src/routes/bairros'));
// Página pública de cada condomínio (/condominios/<slug>) e o 3D para o visitante.
app.use(require('./src/condominios/publico'));
// Marca: nome do sistema e do cliente desta instalação, lidos pelas telas (window.MARCA) antes do app.js.
app.get('/marca.js', (req, res) => {
  const c = require('./src/config');
  res.type('application/javascript').setHeader('Cache-Control', 'no-cache');
  res.send(`window.MARCA=${JSON.stringify({ sistema: c.SISTEMA_NOME, cliente: c.CLIENTE_NOME, empresa: c.EMPRESA, blog: c.BLOG_NOME, tema: c.TEMA, logo: c.LOGO_URL, icone: c.ICONE_URL }).replace(/</g, '\\u003c')};`);
});
app.get('/fisguei', (req, res) => res.redirect('/#/fisguei'));
// 3D: o modo realista do Google precisa de WebAssembly (Draco), worker em blob e de falar com tile.googleapis.com.
app.get('/condominio-3d.html', (req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob: data: https://tile.googleapis.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.sendFile(path.join(PUB, 'condominio-3d.html'));
});
app.get('/assinar/:token', (req, res) => res.sendFile(path.join(PUB, 'assinar.html')));
// Link interno: o HTML já sai com Open Graph (o WhatsApp não roda o JavaScript) e a capa em /v/<token>/og.jpg.
app.get('/v/:token/og.jpg', (req, res, next) => { publico.fotoOg(req, res).catch(next); });
app.get('/v/:token', (req, res, next) => { try { publico.paginaLink(req, res); } catch (e) { next(e); } });
// A tela do sistema sai pelo Express (não como arquivo estático), para que o domínio da plataforma
// nunca a entregue: na Vercel, um public/index.html seria servido antes de qualquer regra do servidor.
// Página inicial = portal de imóveis (/imoveis), com o botão "Entrar". Quem já está logado (ou abriu um link
// do sistema, /#/...) vai para o sistema; /entrar abre sempre a tela de entrada. Na entrada da plataforma
// (app.corretordofuturo.app) e sem nenhum usuário ainda (primeiro acesso), a raiz continua sendo o sistema.
// no-store (e não no-cache): com 304 o Chrome reaproveita cabeçalhos velhos, inclusive a CSP, e mudanças de política não chegam ao navegador
const telaDoSistema = (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.sendFile(path.join(PUB, 'app.html')); };
app.get('/entrar', telaDoSistema);
app.get(['/', '/index.html'], (req, res) => {
  const { APP_HOSTS } = require('./src/plataforma/vitrine');
  let logado = false, semUsuarios = false;
  try { logado = !!require('./src/auth').usuarioDaSessao(req); } catch {}
  if (!logado) { try { semUsuarios = !require('./src/db').one('SELECT 1 AS x FROM usuarios LIMIT 1'); } catch {} }
  if (logado || semUsuarios || APP_HOSTS.has(String(req.hostname || '').toLowerCase())) return telaDoSistema(req, res);
  // o endereço depois do # não chega ao servidor: a página decide (com #/... vai para /entrar, senão para /imoveis)
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<title>Imóveis</title>
<meta name="robots" content="noindex">
<script src="/ir.js"></script>
<noscript><meta http-equiv="refresh" content="0;url=/imoveis"></noscript>
</head>
<body>
<p><a href="/imoveis">Ver os imóveis</a></p>
</body>
</html>`);
});
// Humanos, retratos, texturas do cenário e three.js mudam raramente: cache de 7 dias no navegador.
for (const p of ['plataforma/pessoas', 'plataforma/agentes', 'plataforma/cenario', 'vendor']) app.use('/' + p, express.static(path.join(PUB, p), { index: false, maxAge: '7d' }));
app.use(express.static(PUB, { index: false, maxAge: 0 }));

// Erros: mensagem clara para o usuário, detalhe só no console.
app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.too.large' ? 413 : err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(new Date().toLocaleString('pt-BR'), req.method, req.originalUrl, err);
  const msg = status === 413 ? 'Arquivo grande demais (limite 25 MB).' : status >= 500 && !err.status ? 'Erro interno. Veja a janela do servidor para detalhes.' : err.message;
  res.status(status).json({ erro: msg });
});

if (require.main === module) {
  const host = process.env.HOST || '0.0.0.0';
  app.listen(cfg.PORT, host, () => {
    const nets = require('os').networkInterfaces();
    const ips = Object.values(nets).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
    console.log('\n  ==============================================');
    console.log(`   ${cfg.SISTEMA_NOME.toUpperCase()}  ·  rodando`);
    console.log(`   Neste PC:        ${cfg.BASE_URL}`);
    ips.forEach((ip) => console.log(`   Na rede (celular): http://${ip}:${cfg.PORT}`));
    console.log('   Para parar: feche esta janela');
    console.log('  ==============================================\n');
    // Radar automático (alertas por e-mail e monitor dos portais) roda no PC;
    // com o banco online, o que ele encontra aparece também no link da Vercel.
    require('./src/services/alertas').iniciar();
    require('./src/services/portais').iniciar();
    // Robô TH-IA-GO CORRETOR (WhatsApp pelo QR code) roda só no PC.
    require('./src/fisguei/robo').iniciar();
    // Escritório virtual: as linhas de WhatsApp dos agentes rodam num processo à parte (o site pesado não trava o WhatsApp).
    // O cérebro roda na nuvem quando há chave do Gemini; sem chave, roda nesse processo com a IA local.
    if (cfg.ESCRITORIO !== '0') {
      // o processo das linhas fecha sozinho quando o site fecha (canal entre os dois se rompe), então nunca ficam duas cópias
      const abre = () => {
        const p = require('child_process').fork(path.join(__dirname, 'src/agentes/servico.js'), [], { execArgv: ['--disable-warning=ExperimentalWarning'] });
        p.on('exit', (c) => { console.error(new Date().toLocaleTimeString('pt-BR'), '[escritório] processo das linhas saiu (código', c + '); reabrindo em 10 s'); setTimeout(abre, 10e3); });
        abre.atual = p;
      };
      process.on('exit', () => { try { abre.atual && abre.atual.kill(); } catch {} });
      abre();
    }
    // Condomínios: liga anúncios novos do Radar/Fisguei aos prédios e avisa dos prédios-alvo (a cada 10 min).
    const vincula = () => { try { const r = require('./src/condominios/base').vincular(); if (r.radar || r.fisguei) console.log('[condomínios]', r); } catch (e) { console.error('[condomínios]', e.message); } };
    setTimeout(vincula, 60e3); setInterval(vincula, 10 * 60e3);
  });
}

module.exports = app;
