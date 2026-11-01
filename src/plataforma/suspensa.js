// Conta suspensa pelo painel do gestor (config plataforma_suspensa = '1' no banco desta imobiliária).
// Lido a cada minuto, no máximo. Arquivos de tela (CSS, JS, imagens) continuam saindo para o aviso aparecer bonito.
// O domínio da plataforma (vitrine e /gestor) não é uma imobiliária: se o projeto do apex
// compartilha o banco de um tenant suspenso, /gestor/alguma-coisa não pode cair neste aviso.
const cfg = require('../config');
const { HOSTS: PLATAFORMA } = require('./vitrine');
const GESTOR = new Set(String(process.env.GESTOR_HOSTS || 'corretordofuturo.app,www.corretordofuturo.app,localhost,127.0.0.1')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
let cache = { em: 0, valor: false };
function suspensa() {
  if (Date.now() - cache.em < 60000) return cache.valor;
  let v = false;
  try { v = require('../db').getConfig('plataforma_suspensa') === '1'; } catch { v = cache.valor; }
  cache = { em: Date.now(), valor: v };
  return v;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
module.exports = function contaSuspensa(req, res, next) {
  const host = String(req.hostname || '').toLowerCase();
  if (PLATAFORMA.has(host) || GESTOR.has(host)) return next();
  if (/\.(css|js|png|jpe?g|webp|svg|ico|woff2?|map|mp4|webm)$/i.test(req.path) || req.path === '/robots.txt' || req.path.startsWith('/gestor/herrera/')) return next();
  if (!suspensa()) return next();
  if (req.path.startsWith('/api/') || req.path.startsWith('/fisguei-api/') || req.path === '/escritorio-ciclo') return res.status(423).json({ erro: 'Conta suspensa. Fale com a Herrera HOUSE IA.' });
  res.status(503).setHeader('Retry-After', '3600');
  res.type('html').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<title>${esc(cfg.CLIENTE_NOME)} · temporariamente fora do ar</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.6 system-ui,sans-serif;background:#f6f4ef;color:#23272b}
main{max-width:460px;padding:32px;text-align:center}h1{font-size:24px;margin:0 0 8px}p{color:#6e6c67;margin:0}</style></head>
<body><main><h1>${esc(cfg.CLIENTE_NOME)} está temporariamente fora do ar</h1><p>Volte mais tarde. Se você é da equipe, fale com o suporte da Herrera HOUSE IA.</p></main></body></html>`);
};
module.exports.limpa = () => { cache = { em: 0, valor: false }; };
