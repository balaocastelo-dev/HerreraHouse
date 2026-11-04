// Um PC virtual: o Chromium de um agente DENTRO de um container Docker (perfil proprio em disco).
// Quem olha pelo escritorio ve a tela ao vivo (CDP) e pode usar mouse e teclado.
// Nao abre mais Chrome na barra do Windows — se o Docker estiver fora, falha com erro claro.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { garantirNavegadorDocker, pararNavegadorDocker } = require('./docker-navegador');

const LARG = 1366, ALT = 820;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), '[pc]', ...a);

// teclas especiais que o navegador do escritório manda (KeyboardEvent.key → código do Windows)
const VK = { Enter: 13, Backspace: 8, Tab: 9, Escape: 27, Delete: 46, Home: 36, End: 35, PageUp: 33, PageDown: 34,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Shift: 16, Control: 17, Alt: 18, Meta: 91, F5: 116, ' ': 32 };

class PcAgente {
  constructor(imob, slug, opcoes) {
    this.imob = imob; this.slug = slug; this.o = opcoes;
    this.dir = path.join(opcoes.pasta, imob.id, slug);
    this.ctx = null; this.ativa = null; this.cdp = null; this.cdpPagina = null;
    this.vendo = new Set(); this.minis = new Set();
    this.cursor = { x: LARG / 2, y: ALT / 2 }; this.humanoEm = 0;
    this.tarefa = null; this.wa = null; this.ligando = null; this.parado = false; this.transmitindo = false;
    this.browser = null; this.docker = null;
  }
  get chave() { return `${this.imob.id}/${this.slug}`; }
  get ligado() { return !!(this.ctx && this.ativa && !this.ativa.isClosed()); }

  async liga() {
    if (this.ligado) return;
    if (this.ligando) return this.ligando;
    this.parado = false;
    this.ligando = (async () => {
      fs.mkdirSync(this.dir, { recursive: true });
      // Navegador so no Docker (imagem linuxserver/chromium). Sem fallback para Chrome do Windows.
      this.docker = await garantirNavegadorDocker({
        imobId: this.imob.id,
        slug: this.slug,
        perfilDir: this.dir,
        titulo: this.chave,
      });
      this.browser = await chromium.connectOverCDP(this.docker.cdpUrl);
      this.browser.on('disconnected', () => this.caiu());
      this.ctx = this.browser.contexts()[0] || await this.browser.newContext({
        viewport: { width: LARG, height: ALT }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', acceptDownloads: true,
      });
      this.ctx.on('close', () => this.caiu());
      this.ctx.on('page', (p) => this.novaPagina(p, !this.calado));
      let p = this.ctx.pages()[0];
      if (!p) p = await this.ctx.newPage();
      for (const q of this.ctx.pages()) this.novaPagina(q, false);
      try { await p.setViewportSize({ width: LARG, height: ALT }); } catch {}
      const u0 = p.url();
      if (!u0 || u0 === 'about:blank' || /^chrome:/i.test(u0)) {
        await p.goto(this.o.inicio || 'https://www.google.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      }
      await this.ativar(p);
      log(this.chave, 'ligado via Docker', this.docker.cdpUrl, 'tela', this.docker.telaUrl);
    })().finally(() => { this.ligando = null; });
    return this.ligando;
  }
  // aba aberta pelo próprio sistema (WhatsApp, tarefa): não rouba a tela de quem está olhando
  async novaAba() { this.calado = true; try { return await this.ctx.newPage(); } finally { this.calado = false; } }
  async desliga() {
    this.parado = true;
    try { if (this.browser) await this.browser.close(); } catch {}
    try { if (this.ctx) await this.ctx.close(); } catch {}
    this.browser = null; this.ctx = null; this.ativa = null; this.cdp = null; this.transmitindo = false;
    try { await pararNavegadorDocker({ imobId: this.imob.id, slug: this.slug }); } catch (e) { log(this.chave, 'parar docker:', e.message); }
    this.docker = null;
  }
  caiu() {
    this.ctx = null; this.ativa = null; this.cdp = null; this.transmitindo = false;
    if (this.parado) return;
    log(this.chave, 'o Chromium do Docker desconectou; religando em 4 s');
    setTimeout(() => this.liga().catch((e) => log(this.chave, 'não religou:', e.message)), 4000);
  }
  novaPagina(p, ativar) {
    p.on('close', () => { if (this.ativa === p) { const outra = this.ctx && this.ctx.pages().filter((q) => !q.isClosed()).pop(); if (outra) this.ativar(outra).catch(() => {}); } this.avisaAbas(); });
    p.on('framenavigated', (f) => { if (f === p.mainFrame()) this.avisaAbas(); });
    p.on('crash', () => { log(this.chave, 'aba travou; recarregando'); p.reload().catch(() => {}); });
    if (ativar) this.ativar(p).catch(() => {});
    this.avisaAbas();
  }
  paginas() { return this.ctx ? this.ctx.pages().filter((p) => !p.isClosed()) : []; }
  async abas() {
    const l = [];
    for (const [i, p] of this.paginas().entries()) l.push({ i, url: p.url(), titulo: await p.title().catch(() => ''), ativa: p === this.ativa });
    return l;
  }
  async avisaAbas() { if (!this.vendo.size) return; try { this.manda({ t: 'abas', abas: await this.abas() }); } catch {} }

  async ativar(p) {
    if (this.ativa === p && this.cdp) return;
    const antes = this.transmitindo;
    await this.paraTransmissao();
    this.ativa = p;
    try { await p.bringToFront(); } catch {}
    this.cdp = await this.ctx.newCDPSession(p);
    this.cdp.on('Page.screencastFrame', (f) => {
      this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
      const buf = Buffer.from(f.data, 'base64');
      for (const ws of this.vendo) if (ws.readyState === 1 && ws.bufferedAmount < 2e6) ws.send(buf);
    });
    if (antes || this.vendo.size) await this.transmite();
    this.avisaAbas();
  }
  async transmite() {
    if (!this.cdp || this.transmitindo) return;
    this.transmitindo = true;
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 62, maxWidth: LARG, maxHeight: ALT, everyNthFrame: 1 }).catch(() => { this.transmitindo = false; });
  }
  async paraTransmissao() { if (this.cdp && this.transmitindo) await this.cdp.send('Page.stopScreencast').catch(() => {}); this.transmitindo = false; }
  manda(o) { const s = JSON.stringify(o); for (const ws of this.vendo) if (ws.readyState === 1) ws.send(s); }

  // miniatura para o monitor da mesa no escritório (pequena, a cada poucos segundos)
  async miniatura() {
    if (!this.cdp) return null;
    const r = await this.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 55, clip: { x: 0, y: 0, width: LARG, height: ALT, scale: 0.3 } }).catch(() => null);
    return r ? Buffer.from(r.data, 'base64') : null;
  }
  async foto(qualidade = 60) {
    const r = await this.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: qualidade }).catch(() => null);
    return r ? r.data : null;
  }

  // ---------- quem está vendo ----------
  async entra(ws, modo) {
    await this.liga();
    if (modo === 'mini') { this.minis.add(ws); ws.on('close', () => this.minis.delete(ws)); return; }
    this.vendo.add(ws);
    ws.on('close', () => { this.vendo.delete(ws); if (!this.vendo.size) this.paraTransmissao(); });
    this.manda({ t: 'abas', abas: await this.abas() });
    ws.send(JSON.stringify({ t: 'cursor', x: this.cursor.x, y: this.cursor.y }));
    if (this.tarefa) ws.send(JSON.stringify({ t: 'tarefa', id: this.tarefa.id, pedido: this.tarefa.pedido, passo: this.tarefa.ultimo || '' }));
    await this.transmite();
    // manda um quadro na hora (a transmissão só manda quando a tela muda)
    const f = await this.foto(62); if (f && ws.readyState === 1) ws.send(Buffer.from(f, 'base64'));
  }

  // ---------- mouse e teclado de quem está no escritório ----------
  async comando(m, podeControlar) {
    if (!this.ligado) return;
    const p = this.ativa; const cdp = this.cdp;
    if (m.t !== 'abas?' && !podeControlar) return;
    this.humanoEm = Date.now();
    const x = Math.max(0, Math.min(LARG, +m.x || 0)), y = Math.max(0, Math.min(ALT, +m.y || 0));
    const mods = (m.alt ? 1 : 0) | (m.ctrl ? 2 : 0) | (m.meta ? 4 : 0) | (m.shift ? 8 : 0);
    switch (m.t) {
      case 'mouse': {
        const botao = ['left', 'middle', 'right'][m.botao || 0] || 'left';
        const tipo = { move: 'mouseMoved', down: 'mousePressed', up: 'mouseReleased' }[m.tipo];
        if (tipo) { this.cursor = { x, y }; await cdp.send('Input.dispatchMouseEvent', { type: tipo, x, y, button: tipo === 'mouseMoved' ? (m.botoes ? 'left' : 'none') : botao, buttons: m.botoes || 0, clickCount: m.cliques || 1, modifiers: mods }).catch(() => {}); }
        if (m.tipo === 'roda') await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: +m.dx || 0, deltaY: +m.dy || 0, modifiers: mods }).catch(() => {});
        break;
      }
      case 'tecla': {
        const k = String(m.key || '');
        if (m.tipo === 'down' && k.length === 1 && !m.ctrl && !m.meta && !m.alt) { await cdp.send('Input.insertText', { text: k }).catch(() => {}); break; }
        const code = VK[k] || (k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0);
        await cdp.send('Input.dispatchKeyEvent', { type: m.tipo === 'down' ? 'rawKeyDown' : 'keyUp', key: k, code: m.code || '', windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: mods,
          ...(m.tipo === 'down' && k === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) }).catch(() => {});
        if (m.tipo === 'down' && k === 'Enter') await cdp.send('Input.dispatchKeyEvent', { type: 'char', key: 'Enter', text: '\r', unmodifiedText: '\r' }).catch(() => {});
        break;
      }
      case 'texto': await cdp.send('Input.insertText', { text: String(m.s || '').slice(0, 5000) }).catch(() => {}); break;
      case 'ir': {
        let u = String(m.url || '').trim(); if (!u) break;
        if (!/^[a-z]+:\/\//i.test(u)) u = /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(u) ? 'http://' + u : /\s/.test(u) || !/^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$)/.test(u) ? 'https://www.google.com/search?q=' + encodeURIComponent(u) : 'https://' + u;
        await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        break;
      }
      case 'voltar': await p.goBack({ timeout: 15000 }).catch(() => {}); break;
      case 'avancar': await p.goForward({ timeout: 15000 }).catch(() => {}); break;
      case 'recarregar': await p.reload({ timeout: 30000 }).catch(() => {}); break;
      case 'aba': {
        const ps = this.paginas();
        if (m.acao === 'nova') { const n = await this.ctx.newPage(); await n.goto(m.url || 'https://www.google.com/', { waitUntil: 'domcontentloaded' }).catch(() => {}); await this.ativar(n); }
        else if (m.acao === 'ativar' && ps[m.i]) await this.ativar(ps[m.i]);
        else if (m.acao === 'fechar' && ps[m.i] && ps.length > 1) await ps[m.i].close().catch(() => {});
        break;
      }
      case 'abas?': this.avisaAbas(); break;
    }
  }

  // ---------- mãos da IA: cursor visível andando até o ponto antes de clicar ----------
  async moveCursor(x, y) {
    const de = { ...this.cursor }; const n = 14;
    for (let i = 1; i <= n; i++) {
      const k = i / n; const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const cx = de.x + (x - de.x) * e, cy = de.y + (y - de.y) * e;
      this.cursor = { x: cx, y: cy };
      this.manda({ t: 'cursor', x: cx, y: cy, ia: true });
      await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, button: 'none' }).catch(() => {});
      await espera(22);
    }
  }
  async clica(x, y) {
    await this.moveCursor(x, y);
    this.manda({ t: 'cursor', x, y, ia: true, clique: true });
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }).catch(() => {});
    await espera(60);
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }).catch(() => {});
  }
  async digita(texto) {
    for (const ch of String(texto)) {
      if (ch === '\n') await this.tecla('Enter');
      else await this.cdp.send('Input.insertText', { text: ch }).catch(() => {});
      await espera(18 + Math.random() * 40);
    }
  }
  async tecla(k, mods = 0) {
    const code = VK[k] || (k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0);
    await this.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: mods, ...(k === 'Enter' ? { text: '\r' } : {}), ...(k === 'a' && mods === 2 ? { commands: ['selectAll'] } : {}) }).catch(() => {});
    if (k === 'Enter') await this.cdp.send('Input.dispatchKeyEvent', { type: 'char', key: 'Enter', text: '\r' }).catch(() => {});
    await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: mods }).catch(() => {});
  }
}

module.exports = { PcAgente, LARG, ALT };
