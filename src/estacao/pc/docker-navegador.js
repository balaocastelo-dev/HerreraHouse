const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

/** Mesma imagem pinada do MyBots (já neste PC). Tela Selkies na 3000, ponte CDP na 9223. */
const IMAGEM = process.env.HERRERA_PC_IMAGEM || 'lscr.io/linuxserver/chromium:1aca5d17-ls61';
/** Faixas próprias da Estação — fora do MyBots (7901-8100 / 9301+) e longe de 8787/8790/8791. */
const PORTA_BASE_TELA = 7601;
const PORTA_BASE_CDP = 9401;
const PORTA_MAX_INDICE = 180;
const INTOCAVEIS = new Set([8787, 8790, 8791]);

const PONTE_PY = `import socket, threading

ALVO = ("127.0.0.1", 9222)

def jogar(a, b):
    try:
        while True:
            d = a.recv(65536)
            if not d:
                break
            b.sendall(d)
    except Exception:
        pass
    finally:
        for s in (a, b):
            try:
                s.close()
            except Exception:
                pass

def atender(c):
    try:
        s = socket.create_connection(ALVO, 10)
    except Exception:
        c.close()
        return
    threading.Thread(target=jogar, args=(c, s), daemon=True).start()
    threading.Thread(target=jogar, args=(s, c), daemon=True).start()

srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("0.0.0.0", 9223))
srv.listen(64)
while True:
    c, _ = srv.accept()
    atender(c)
`;

const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), '[docker-pc]', ...a);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function limpo(s) {
  return String(s || '').replace(/[^a-zA-Z0-9_.-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';
}

function nomeContainer(imobId, slug) {
  return ('herrera-pc-' + limpo(imobId) + '-' + limpo(slug)).slice(0, 63);
}

function docker(args, msTeto = 60000) {
  return new Promise((resolve) => {
    execFile('docker', args, { timeout: msTeto, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (e, out, err) => {
      resolve({ ok: !e, code: e && e.code, saida: String(out || '') + String(err || '') });
    });
  });
}

async function temDocker() {
  const r = await docker(['info', '--format', '{{.ServerVersion}}'], 20000);
  return r.ok;
}

function arquivoPortas(pastaRaiz) {
  return path.join(pastaRaiz, 'docker-portas.json');
}

function portasDaChave(pastaRaiz, chave) {
  if (!chave || chave.length > 100) throw new Error('chave de porta inválida');
  fs.mkdirSync(pastaRaiz, { recursive: true });
  const arq = arquivoPortas(pastaRaiz);
  let mapa = {};
  try { mapa = JSON.parse(fs.readFileSync(arq, 'utf8').replace(/^\uFEFF/, '')); } catch { mapa = {}; }
  if (mapa[chave] === undefined) {
    const usados = new Set(Object.values(mapa).filter((n) => Number.isInteger(n)));
    let i = 0;
    while (i <= PORTA_MAX_INDICE) {
      const tela = PORTA_BASE_TELA + i;
      const cdp = PORTA_BASE_CDP + i;
      if (!usados.has(i) && !INTOCAVEIS.has(tela) && !INTOCAVEIS.has(cdp)) break;
      i++;
    }
    if (i > PORTA_MAX_INDICE) throw new Error('não há porta livre na faixa da Estação Docker');
    mapa[chave] = i;
    fs.writeFileSync(arq, JSON.stringify(mapa, null, 2));
  }
  const i = mapa[chave];
  const portaTela = PORTA_BASE_TELA + i;
  const portaCdp = PORTA_BASE_CDP + i;
  if (INTOCAVEIS.has(portaTela) || INTOCAVEIS.has(portaCdp)) {
    throw new Error('porta reservada de ' + chave + ' caiu numa porta intocável');
  }
  return { indice: i, portaTela, portaCdp };
}

/** Tira trava do Chrome Windows. Nunca apaga o perfil. */
function soltaTravaPerfil(dir) {
  for (const nome of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile', 'RunningChromeVersion']) {
    try { fs.unlinkSync(path.join(dir, nome)); } catch { /* ok */ }
  }
  try { fs.unlinkSync(path.join(dir, 'Default', 'LockFile')); } catch { /* ok */ }
}

async function garantirPonte(container, volume) {
  try { fs.writeFileSync(path.join(volume, 'ponte.py'), PONTE_PY); } catch { /* volume ainda montando */ }
  await docker(['exec', '-d', container, '/lsiopy/bin/python3', '/config/ponte.py'], 20000);
}

async function esperaCdp(portaCdp, tentativas = 40) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + portaCdp + '/json/version', { signal: AbortSignal.timeout(2000) });
      if (r.ok) {
        const j = await r.json();
        if (j && (j.webSocketDebuggerUrl || j.Browser)) return j;
      }
    } catch { /* ainda subindo */ }
    await espera(1000);
  }
  throw new Error('o Chromium no Docker não abriu o depurador em 127.0.0.1:' + portaCdp + ' a tempo');
}

async function estadoContainer(nome) {
  const r = await docker(['inspect', '-f', '{{.State.Running}}', nome], 20000);
  if (!r.ok) return 'ausente';
  return r.saida.replace(/^\uFEFF/, '').trim() === 'true' ? 'ligado' : 'desligado';
}

/**
 * Garante um container headful por agente, com perfil montado e CDP em localhost.
 * Se o Docker estiver fora do ar, falha com erro claro — NÃO abre Chrome no Windows.
 */
async function garantirNavegadorDocker({ imobId, slug, perfilDir, titulo }) {
  if (!(await temDocker())) {
    throw new Error('Docker não está no ar nesta máquina. A Estação agora só usa navegador dentro do Docker — não abre Chrome na sua barra. Abra o Docker Desktop e tente de novo.');
  }
  const raizPortas = path.dirname(path.dirname(perfilDir));
  const chave = imobId + '/' + slug;
  const { portaTela, portaCdp } = portasDaChave(raizPortas, chave);
  const container = nomeContainer(imobId, slug);
  fs.mkdirSync(perfilDir, { recursive: true });
  soltaTravaPerfil(perfilDir);

  const img = await docker(['image', 'inspect', IMAGEM, '--format', '{{.Id}}'], 20000);
  if (!img.ok) {
    throw new Error('a imagem ' + IMAGEM + ' não está neste computador. Rode: docker pull ' + IMAGEM);
  }

  let est = await estadoContainer(container);
  if (est === 'desligado') {
    log(chave, 'ligando container ' + container);
    const st = await docker(['start', container], 60000);
    if (!st.ok) throw new Error('não ligou o container ' + container + ': ' + st.saida.slice(0, 300));
    est = 'ligado';
  } else if (est === 'ausente') {
    log(chave, 'criando container ' + container + ' tela=' + portaTela + ' cdp=' + portaCdp);
    const tituloOk = String(titulo || (imobId + '/' + slug)).replace(/[\r\n]/g, ' ').slice(0, 80);
    const args = [
      'run', '-d', '--pull=never',
      '--name', container,
      '--restart', 'unless-stopped',
      '--memory', '2g',
      '--memory-swap', '2g',
      '--cpus', '1.5',
      '--shm-size', '1gb',
      '-p', '127.0.0.1:' + portaTela + ':3000',
      '-p', '127.0.0.1:' + portaCdp + ':9223',
      '-v', perfilDir + ':/config',
      '-e', 'TZ=America/Sao_Paulo',
      '-e', 'TITLE=' + tituloOk,
      '-e', 'HERRERA_ESTACAO=1',
      '-e', 'CHROME_CLI=--remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --remote-allow-origins=* --user-data-dir=/config --start-maximized --no-first-run --no-default-browser-check --disable-blink-features=AutomationControlled --disable-features=Translate',
      IMAGEM,
    ];
    const cr = await docker(args, 180000);
    if (!cr.ok) throw new Error('não criou o container ' + container + ': ' + cr.saida.slice(0, 400));
    est = 'ligado';
  }

  await espera(8000);
  await garantirPonte(container, perfilDir);
  await esperaCdp(portaCdp);

  return {
    container,
    portaTela,
    portaCdp,
    cdpUrl: 'http://127.0.0.1:' + portaCdp,
    telaUrl: 'http://127.0.0.1:' + portaTela + '/',
  };
}

async function pararNavegadorDocker({ imobId, slug }) {
  const container = nomeContainer(imobId, slug);
  const est = await estadoContainer(container);
  if (est === 'ligado') {
    log(imobId + '/' + slug, 'parando container ' + container);
    await docker(['stop', '-t', '8', container], 30000);
  }
}

module.exports = {
  IMAGEM,
  PORTA_BASE_TELA,
  PORTA_BASE_CDP,
  INTOCAVEIS,
  nomeContainer,
  temDocker,
  garantirNavegadorDocker,
  pararNavegadorDocker,
  garantirPonte,
  esperaCdp,
  soltaTravaPerfil,
  docker,
};
