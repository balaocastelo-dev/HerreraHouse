// ESTAÇÃO DOS PCS VIRTUAIS — roda no computador da RTX (depois, num servidor). Um Chrome de verdade por agente,
// sempre ligado, para as imobiliárias listadas em data/estacao.json:
//   { "porta": 3434, "pasta": "C:/HerreraAgentes", "chrome": "C:/Program Files/Google/Chrome/Application/chrome.exe",
//     "cloudflared": "C:/HerreraAgentes/cloudflared.exe",
//     "imobiliarias": [ { "id": "casaprado-ab12cd", "base": "https://casaprado.corretordofuturo.app", "chave": "est_..." } ] }
// Nao abre Chrome na barra do Windows; se o Docker estiver fora, a Estacao falha com erro claro. A chave de cada imobiliária sai em Escritório virtual > Configuração geral > PCs virtuais > "Gerar chave da estação".
// Uso: node src/estacao/pc/index.js   (a tarefa do Windows "\HerreraHouse\Estacao dos agentes" liga sozinha e religa se cair)
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');
const { PcAgente } = require('./pc');
const { WhatsAppWeb } = require('./whatsapp');
const { executa } = require('./tarefa');

const VERSAO = '1.0.0';
const ROOT = path.join(__dirname, '..', '..', '..');
const CFG = process.env.ESTACAO_CONFIG || path.join(ROOT, 'data', 'estacao.json');
const LIGADOS = path.join(path.dirname(CFG), 'estacao-ligados.json');
const APAGADOS = path.join(path.dirname(CFG), 'estacao-apagados.json');
const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), '[estação]', ...a);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const conf = JSON.parse(fs.readFileSync(CFG, 'utf8').replace(/^\uFEFF/, ''));
const OPC = { pasta: conf.pasta || path.join(os.homedir(), 'HerreraAgentes'), chrome: conf.chrome || 'C:/Program Files/Google/Chrome/Application/chrome.exe', inicio: conf.inicio || 'https://www.google.com/', headless: !!conf.headless, semSandbox: !!conf.sem_sandbox };
const PORTA = conf.porta || 3434;
let urlPublica = conf.url_publica || null; // com túnel, vem do cloudflared

const lerSet = (arq) => { try { return new Set(JSON.parse(fs.readFileSync(arq, 'utf8'))); } catch { return new Set(); } };
const salvaSet = (arq, s) => { try { fs.writeFileSync(arq, JSON.stringify([...s], null, 1)); } catch {} };
const ligados = lerSet(LIGADOS);            // "nunca desliga": quem já foi ligado volta ligado
const apagados = lerSet(APAGADOS);          // desligados de propósito no painel do PC: só voltam quando alguém ligar
const salvaLigados = () => salvaSet(LIGADOS, ligados);
const salvaApagados = () => salvaSet(APAGADOS, apagados);

// ---------- imobiliárias ----------
class Imob {
  constructor(c) { this.id = c.id; this.base = c.base.replace(/\/$/, ''); this.chave = c.chave; this.cfg = { agentes: [] }; this.pcs = {}; this.tarefas = new Map(); this.falhas = 0; }
  async req(metodo, url, corpo) {
    const r = await fetch(this.base + url, { method: metodo, headers: { 'Content-Type': 'application/json', 'x-estacao': this.chave }, body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(65000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
    return j;
  }
  post(url, corpo) { return this.req('POST', url, corpo); }
  pc(slug) {
    if (!this.pcs[slug]) this.pcs[slug] = new PcAgente(this, slug, OPC);
    return this.pcs[slug];
  }
  agente(slug) { return this.cfg.agentes.find((a) => a.slug === slug); }
  // Pedido do Thiago (29/10/2026, noite): PC de robô NUNCA liga sozinho — nem ao abrir o escritório 3D,
  // nem ao abrir a janela do PC, nem pelo WhatsApp Web, nem quando a estação reinicia. Abria Chrome na
  // barra dele do nada. Só liga com forca = ordem explícita de alguém: botão "Ligar este PC", Reiniciar,
  // ou uma tarefa nova mandada para o robô.
  async ligaPc(slug, motivo, forca = false) {
    const pc = this.pc(slug);
    const k = `${this.id}/${slug}`;
    if (!pc.ligado && !forca) throw new Error('Este PC está desligado. Clique em "⏻ Ligar este PC" no painel dele.');
    if (apagados.has(k)) { apagados.delete(k); salvaApagados(); }
    if (!ligados.has(k)) { ligados.add(k); salvaLigados(); }
    if (!pc.ligado) { log(k, 'ligando', motivo ? `(${motivo})` : ''); pc.parado = false; await pc.liga(); }
    return pc;
  }
  async desligaPc(slug, motivo) {
    const k = `${this.id}/${slug}`;
    if (!apagados.has(k)) { apagados.add(k); salvaApagados(); }
    if (ligados.has(k)) { ligados.delete(k); salvaLigados(); }
    log(k, 'desligando', motivo ? `(${motivo})` : '');
    if (this.pcs[slug]) await this.pcs[slug].desliga();
  }
  // WhatsApp Web nos agentes que usam esse canal (e só neles)
  // WhatsApp da casa: o sistema diz quais NÚMEROS atendem pelo WhatsApp Web (normalmente um só, o número
  // do sistema). O PC que segura essa sessão é o único que pode ligar sozinho — foi a escolha do Thiago:
  // "um PC ligado só pro WhatsApp", os outros ficam desligados até ele ligar.
  async garanteWhatsApps() {
    const linhas = Array.isArray(this.cfg.linhas_wa) ? this.cfg.linhas_wa : [];
    for (const l of linhas) {
      const p = await this.ligaPc(l.slug, `WhatsApp da casa (${l.nome || l.slug})`, true).catch((e) => { log(l.slug, e.message); return null; });
      if (!p) continue;
      if (!p.wa) p.wa = new WhatsAppWeb(p, (m) => this.post('/estacao-api/wa-entrada', { linha: l.slug, ...m }));
      p.wa.filtro = l.wa_filtro;
      await p.wa.garante();
    }
    // quem não é mais número de WhatsApp não fica com sessão aberta
    for (const [slug, p] of Object.entries(this.pcs)) {
      if (p.wa && !linhas.some((l) => l.slug === slug)) { try { await p.wa.sair(); } catch {} p.wa = null; }
    }
  }
  async batida() {
    const agentes = {};
    for (const [slug, pc] of Object.entries(this.pcs)) {
      const aba = pc.ligado ? { url: pc.ativa.url(), titulo: await pc.ativa.title().catch(() => '') } : null;
      agentes[slug] = { ligado: pc.ligado, aba, tarefa: pc.tarefa ? pc.tarefa.id : null, vendo: pc.vendo.size };
      if (pc.wa) agentes[slug].wa = await pc.wa.confere();
    }
    const r = await this.post('/estacao-api/batida', { url: urlPublica, versao: VERSAO, maquina: os.hostname(), agentes });
    this.falhas = 0;
    if (r.agentes) this.cfg.agentes = r.agentes;
    if (r.ia_em !== this.iaEm) { this.iaEm = r.ia_em; await this.carregaConfig().catch(() => {}); }
    for (const t of r.tarefas || []) this.comecaTarefa(t);
    for (const id of r.canceladas || []) { const x = this.tarefas.get(id); if (x) x.cancelada = true; }
    for (const c of r.comandos || []) this.comando(c).catch((e) => log('comando', c.comando, e.message));
    for (const m of r.saidas || []) this.envia(m);
    this.cerebroPendente = (r.saidas || []).length > 0;
  }
  async carregaConfig() { const c = await this.req('GET', '/estacao-api/config'); this.cfg = c; return c; }
  comecaTarefa(t) {
    const ctl = { cancelada: false };
    this.tarefas.set(t.id, ctl);
    (async () => {
      try {
        const pc = await this.ligaPc(t.agente, `tarefa #${t.id}`, true);
        while (pc.tarefa) await espera(3000); // uma tarefa por vez em cada PC
        log(`${this.id}/${t.agente}`, `tarefa #${t.id}:`, t.pedido.slice(0, 80));
        await executa(pc, this, t, () => ctl.cancelada);
      }
      catch (e) { log('tarefa', t.id, 'erro:', e.message); await this.post(`/estacao-api/tarefa/${t.id}`, { erro: e.message }).catch(() => {}); }
      finally { this.tarefas.delete(t.id); }
    })();
  }
  async envia(m) {
    const pc = this.pcs[m.linha];
    try {
      if (!pc || !pc.wa) throw new Error('WhatsApp Web deste agente não está aberto');
      const id = await pc.wa.envia(m.telefone, m.texto);
      await this.post(`/estacao-api/wa-saida/${m.id}`, { ok: true, wa_id: id });
    } catch (e) { await this.post(`/estacao-api/wa-saida/${m.id}`, { ok: false, erro: e.message }).catch(() => {}); }
  }
  async comando(c) {
    const k = `${this.id}/${c.agente}`;
    if (c.comando === 'desligar') { await this.desligaPc(c.agente, 'painel do PC'); return; }
    const pc = await this.ligaPc(c.agente, c.comando, true);
    if (c.comando === 'reiniciar') { await pc.desliga(); pc.parado = false; await pc.liga(); }
    if (c.comando === 'abrir_whatsapp') { if (!pc.wa) pc.wa = new WhatsAppWeb(pc, (m) => this.post('/estacao-api/wa-entrada', { linha: c.agente, ...m })); await pc.wa.garante(); const p = pc.wa.pagina; if (p) await pc.ativar(p); }
    if (c.comando === 'ler_whatsapp' && pc.wa) log(k, 'não lidas passadas ao escritório:', await pc.wa.lerNaoLidas());
    if (c.comando === 'sair_whatsapp' && pc.wa) await pc.wa.sair();
  }
}
const IMOBS = (conf.imobiliarias || []).map((c) => new Imob(c));
const porId = Object.fromEntries(IMOBS.map((i) => [i.id, i]));

// ---------- passe assinado pela imobiliária (a tela pede ao sistema, que assina com a chave da estação) ----------
function confere(passe) {
  const p = String(passe || '').split('.');
  if (p.length !== 6) return null;
  const [id, agente, exp, uid, perm, sig] = p;
  const im = porId[id]; if (!im) return null;
  const esperado = crypto.createHmac('sha256', im.chave).update(`${id}.${agente}.${exp}.${uid}.${perm}`).digest('base64url');
  if (sig.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return null;
  if (+exp < Date.now() / 1000) return null;
  return { im, agente, controle: perm === 'c', uid };
}

// ---------- servidor (só WebSocket + saúde) ----------
const srv = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/' || req.url.startsWith('/saude')) {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ estacao: 'Herrera HOUSE IA', versao: VERSAO, imobiliarias: IMOBS.length, pcs: IMOBS.reduce((s, i) => s + Object.values(i.pcs).filter((p) => p.ligado).length, 0) }));
  }
  res.statusCode = 404; res.end();
});
const wss = new WebSocketServer({ server: srv, path: '/ws', maxPayload: 256 * 1024 });
wss.on('connection', async (ws, req) => {
  const u = new URL(req.url, 'http://x');
  const ok = confere(u.searchParams.get('p'));
  if (!ok || !ok.im.agente(ok.agente) && ok.im.cfg.agentes.length) { ws.close(4001, 'passe inválido'); return; }
  const modo = u.searchParams.get('modo') === 'mini' ? 'mini' : 'ver';
  try {
    const pc = ok.im.pc(ok.agente);
    if (!pc.ligado) throw new Error('Este PC está desligado. Clique em "⏻ Ligar este PC" no painel dele.');
    await pc.entra(ws, modo);
    ws.send(JSON.stringify({ t: 'ola', controle: ok.controle, largura: 1366, altura: 820, agente: ok.agente }));
    ws.on('message', (d, bin) => { if (bin) return; let m; try { m = JSON.parse(d); } catch { return; } pc.comando(m, ok.controle).catch(() => {}); });
  } catch (e) { try { ws.send(JSON.stringify({ t: 'erro', msg: e.message })); ws.close(); } catch {} }
});
// miniaturas para os monitores das mesas (a cada 4 s, só para quem está olhando o escritório)
setInterval(async () => {
  for (const im of IMOBS) for (const pc of Object.values(im.pcs)) {
    if (!pc.minis.size || !pc.ligado) continue;
    const f = await pc.miniatura(); if (!f) continue;
    for (const ws of pc.minis) if (ws.readyState === 1 && ws.bufferedAmount < 5e5) ws.send(f);
  }
}, 4000);

// ---------- túnel público (cloudflared): o escritório na internet alcança este computador ----------
function tunel() {
  if (conf.tunel === false) return;
  const exe = conf.cloudflared || path.join(OPC.pasta, 'cloudflared.exe');
  if (!fs.existsSync(exe)) { log('sem cloudflared em', exe, '— a tela só abre na rede local'); return; }
  const c = spawn(exe, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PORTA}`], { windowsHide: true });
  const le = (b) => { const m = String(b).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (m && m[0] !== urlPublica) { urlPublica = m[0]; log('túnel no ar:', urlPublica); batidas(); } };
  c.stdout.on('data', le); c.stderr.on('data', le);
  c.on('exit', (code) => { log('túnel caiu (', code, '); religando em 5 s'); urlPublica = conf.url_publica || null; setTimeout(tunel, 5000); });
}

// ---------- laço principal ----------
let batendo = false;
async function batidas() {
  if (batendo) return; batendo = true;
  try {
    for (const im of IMOBS) {
      try { await im.batida(); }
      catch (e) { im.falhas++; if (im.falhas === 1 || im.falhas % 20 === 0) log(im.id, 'batida falhou:', e.message); }
    }
  } finally { batendo = false; }
}
async function inicia() {
  log(`Estação dos PCs virtuais ${VERSAO} — ${IMOBS.length} imobiliária(s), pasta ${OPC.pasta}`);
  fs.mkdirSync(OPC.pasta, { recursive: true });
  srv.listen(PORTA, '127.0.0.1', () => log('ouvindo em http://127.0.0.1:' + PORTA));
  tunel();
  for (const im of IMOBS) {
    await im.carregaConfig().then(() => log(im.id, 'ok:', im.cfg.empresa)).catch((e) => log(im.id, 'config falhou:', e.message));
    // Nada de volta automática: a estação sobe com todos os PCs desligados e espera o Thiago ligar
    // os que quiser (data/estacao-ligados.json fica só como histórico de quem já foi ligado).
    const quantos = [...ligados].filter((k) => k.startsWith(im.id + '/')).length;
    if (quantos) log(im.id, `${quantos} PC(s) já usados antes — nenhum liga sozinho; ligue pelo painel de cada robô`);
  }
  setInterval(batidas, 8000); batidas();
  setInterval(() => IMOBS.forEach((im) => im.garanteWhatsApps().catch((e) => log(im.id, 'whatsapp:', e.message))), 30000);
  setTimeout(() => IMOBS.forEach((im) => im.garanteWhatsApps().catch(() => {})), 4000);
  // cérebro do escritório: puxa um ciclo a cada 20 s (responde quem escreveu no WhatsApp Web)
  setInterval(() => IMOBS.forEach((im) => im.post('/estacao-api/ciclo', {}).catch(() => {})), 20000);
  setInterval(() => IMOBS.forEach((im) => im.carregaConfig().catch(() => {})), 5 * 60e3);
}
process.on('unhandledRejection', (e) => log('erro solto:', e && e.message));
process.on('uncaughtException', (e) => log('erro solto:', e && e.message));
inicia();
