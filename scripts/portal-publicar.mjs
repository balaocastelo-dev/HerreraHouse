#!/usr/bin/env node
/**
 * Portal do cliente (a imobiliária) · a ÚNICA porta de entrada de uma página de imóvel no portal.
 *
 *   node scripts/portal-publicar.mjs preparar [--quantos 4]   regras, fila e as fotos dos próximos imóveis
 *   node scripts/portal-publicar.mjs listar                   a situação da página de cada imóvel
 *   node scripts/portal-publicar.mjs conferir pagina.json     confere formato e régua, sem publicar
 *   node scripts/portal-publicar.mjs publicar a.json [b.json …]   confere e publica (um envio só)
 *   node scripts/portal-publicar.mjs retirar <CÓDIGO>          tira a página do ar
 *
 * Antes de publicar, a página passa pelas MESMAS conferências que o site aplica
 * antes de mostrar: o formato (src/portal/validar.js) e a régua
 * (src/portal/regua.js), esta contra a ficha do imóvel AO VIVO, lida do portal
 * (PORTAL_URL/imoveis/dados.json). Se não passa aqui, não passaria lá.
 *
 * Publicar = gravar paginas/<CÓDIGO>.json e indice.json no ramo
 * `claude/portal-conteudo` e enviar. O sistema não é reinstalado; o main não é tocado.
 *
 * Mesmo esquema do blog (scripts/blog-publicar.mjs). Precisa só do Node 22+, do git e do curl.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { lerPagina } = require('../src/portal/validar.js');
const { avaliarPagina } = require('../src/portal/regua.js');
const { RAMO_DE_CONTEUDO: RAMO, DONO_REPO, CODIGO } = require('../src/portal/config.js');
const cfg = require('../src/config.js'); // nome da imobiliária (cliente): CLIENTE_NOME / EMPRESA no .env

const PORTAL = (process.env.PORTAL_URL || process.env.PUBLIC_URL || cfg.BASE_URL).replace(/\/+$/, '');
const PASTA_FILA = path.join(os.tmpdir(), 'portal');

// ---------------------------------------------------------------- utilidades
function sair(mensagem, codigo = 1) { console.error(`\n✗ ${mensagem}`); process.exit(codigo); }
function git(args, opcoes = {}) {
  return execFileSync('git', args, { cwd: opcoes.cwd ?? RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
/** O remoto que aponta para o repositório da plataforma (PLATAFORMA_REPO; na nuvem, "origin"). */
function remoto() {
  if (process.env.PORTAL_REMOTO) return process.env.PORTAL_REMOTO;
  const linhas = git(['remote', '-v']).split('\n');
  const [dono, alvo] = DONO_REPO.split('/');
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const achado = linhas.find((l) => new RegExp(`[/:]${esc(dono)}/${esc(alvo)}(?:\\.git)?\\s`).test(l));
  return achado ? achado.split(/\s+/)[0] : 'origin';
}
function curl(url, destino) {
  const args = ['-fsSL', '--retry', '2', '--max-time', '60', url];
  if (destino) args.push('-o', destino);
  try { return execFileSync('curl', args, { encoding: destino ? undefined : 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }); }
  catch (e) { throw new Error(`${url}: ${String(e.stderr || e.message).trim()}`); }
}
/** Folhas de contato (4 fotos por folha, com o número da foto em amarelo), se o Python com Pillow existir. */
const FOLHAS_PY = `
import sys, glob, re
from PIL import Image, ImageDraw, ImageFont
d = sys.argv[1]
fs = sorted(glob.glob(d + '/foto-*.jpg'), key=lambda f: int(re.findall(r'(\\d+)\\.jpg$', f)[0]))
try: fonte = ImageFont.load_default(size=30)
except TypeError: fonte = ImageFont.load_default()
for k in range(0, len(fs), 4):
    W, H = 800, 560
    folha = Image.new('RGB', (W * 2, H * 2), 'white'); de = ImageDraw.Draw(folha)
    for i, f in enumerate(fs[k:k + 4]):
        im = Image.open(f).convert('RGB'); im.thumbnail((W - 8, H - 8)); x, y = (i % 2) * W, (i // 2) * H
        folha.paste(im, (x + 4, y + 4)); de.rectangle([x + 4, y + 4, x + 150, y + 44], fill='black')
        de.text((x + 12, y + 8), re.findall(r'(\\d+)\\.jpg$', f)[0], fill='yellow', font=fonte)
    folha.save(d + '/folha-%d.jpg' % (k // 4 + 1), quality=85)
print(len(fs))
`;
function folhas(dir) {
  for (const py of ['python3', 'python']) {
    try { execFileSync(py, ['-c', FOLHAS_PY, dir], { stdio: ['ignore', 'pipe', 'pipe'] }); return fs.readdirSync(dir).filter((n) => n.startsWith('folha-')).length; } catch { /* tenta o próximo */ }
  }
  return 0;
}

function lerDados() {
  try {
    const d = JSON.parse(curl(`${PORTAL}/imoveis/dados.json?t=${Date.now()}`));
    if (!Array.isArray(d.imoveis)) throw new Error('resposta sem a lista de imóveis');
    return d.imoveis;
  } catch (e) { return sair(`Não consegui ler a ficha dos imóveis no portal (${PORTAL}/imoveis/dados.json): ${e.message}`); }
}
const fichaParaRegua = (im) => ({ codigo: im.codigo, tipo: im.tipo, quartos: im.quartos, suites: im.suites, vagas: im.vagas, area_util: im.area_util, area_total: im.area_total, fotos: im.fotos.map((f) => f.foto) });

let REMOTO = null;
function abrirRamo() {
  REMOTO = remoto();
  let existe = true;
  try { git(['fetch', '--quiet', REMOTO, `+refs/heads/${RAMO}:refs/remotes/${REMOTO}/${RAMO}`]); }
  catch (erro) {
    if (/couldn't find remote ref|not found/i.test(String(erro.stderr))) existe = false;
    else sair(`Não consegui buscar o ramo ${RAMO}: ${String(erro.stderr || erro.message).trim()}`);
  }
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-'));
  if (existe) git(['worktree', 'add', '--quiet', '--detach', pasta, `${REMOTO}/${RAMO}`]);
  else { git(['worktree', 'add', '--quiet', '--detach', pasta]); git(['checkout', '--quiet', '--orphan', `portal-tmp-${Date.now()}`], { cwd: pasta }); git(['rm', '-rfq', '.'], { cwd: pasta }); }
  return pasta;
}
function fecharRamo(pasta) { try { git(['worktree', 'remove', '--force', pasta]); } catch { fs.rmSync(pasta, { recursive: true, force: true }); } }
function lerIndice(pasta) {
  const arq = path.join(pasta, 'indice.json');
  if (!fs.existsSync(arq)) return { versao: 1, paginas: [] };
  const i = JSON.parse(fs.readFileSync(arq, 'utf8'));
  return { versao: 1, paginas: Array.isArray(i.paginas) ? i.paginas : [] };
}
function gravarIndice(pasta, indice) {
  indice.paginas.sort((a, b) => Date.parse(b.publicadoEm) - Date.parse(a.publicadoEm));
  indice.atualizadoEm = new Date().toISOString();
  fs.writeFileSync(path.join(pasta, 'indice.json'), `${JSON.stringify(indice, null, 2)}\n`);
}
function enviar(pasta, mensagem) {
  git(['add', '-A'], { cwd: pasta });
  const identidade = [];
  try { git(['config', 'user.email'], { cwd: pasta }); } catch { identidade.push('-c', `user.name=Portal ${cfg.CLIENTE_NOME}`, '-c', 'user.email=conteudo@corretordofuturo.app'); }
  const rodape = process.env.PORTAL_RODAPE_DO_COMMIT || process.env.BLOG_RODAPE_DO_COMMIT;
  git([...identidade, 'commit', '--quiet', '-m', `${mensagem}${rodape ? `\n\n${rodape}` : ''}`], { cwd: pasta });
  for (let tentativa = 1; ; tentativa += 1) {
    try { git(['push', '--quiet', REMOTO, `HEAD:refs/heads/${RAMO}`], { cwd: pasta }); return; }
    catch (erro) {
      if (tentativa >= 3) sair(`O envio ao GitHub falhou. Nada foi publicado.\n${String(erro.stderr || erro.message).trim()}`);
      try {
        git(['fetch', '--quiet', REMOTO, `+refs/heads/${RAMO}:refs/remotes/${REMOTO}/${RAMO}`], { cwd: pasta });
        git(['rebase', '--quiet', `${REMOTO}/${RAMO}`], { cwd: pasta });
      } catch (e2) { sair(`O envio ao GitHub falhou e não deu para juntar com o que chegou antes. Nada foi publicado.\n${String(e2.stderr || e2.message).trim()}`); }
    }
  }
}

// ------------------------------------------------------------------ comandos
const [comando, ...resto] = process.argv.slice(2);
const opcoes = new Set(resto.filter((a) => a.startsWith('--')));
const refazer = opcoes.has('--refazer');
const valor = (nome, padrao) => { const i = resto.indexOf(nome); return i >= 0 && resto[i + 1] ? resto[i + 1] : padrao; };
const ESTADOS = { 'sem-pagina': 'sem página', desatualizada: 'desatualizada (a ficha ou as fotos mudaram)', reprovada: 'reprovada no site', 'sem-arquivo': 'sem arquivo', 'no-ar': 'no ar' };

function conferir(arquivo, imoveis) {
  if (!arquivo || !fs.existsSync(arquivo)) sair(`Arquivo não encontrado: ${arquivo ?? '(nenhum)'}`);
  let bruto;
  try { bruto = JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch (e) { sair(`${arquivo} não é um JSON válido: ${e.message}`); }
  const lido = lerPagina(bruto);
  if (!lido.ok) sair(`${arquivo} — formato reprovado:\n- ${lido.erros.join('\n- ')}`);
  const pg = lido.valor;
  const im = imoveis.find((x) => x.codigo === pg.codigo);
  if (!im) sair(`${pg.codigo} não está à venda no portal (status "publicado" e com fotos).`);
  const av = avaliarPagina(pg, fichaParaRegua(im), { modo: 'publicar' });
  const m = av.medidas;
  console.log(`\n${pg.codigo} · ${pg.titulo}`);
  console.log(`/imoveis/${pg.slug} · ${m.palavras} palavras · ${m.secoes} seções · ${m.galeria}/${m.fotosDoImovel} fotos na galeria · ${m.fotosNoTexto} no texto · ${m.perguntas} perguntas · ${m.chamadas} chamada(s)`);
  if (av.avisos.length) console.log(`Avisos (não impedem; leve a sério):\n- ${av.avisos.join('\n- ')}`);
  if (!av.aprovado) sair(`${arquivo} — reprovado na régua:\n- ${av.erros.join('\n- ')}`);
  return { pg, im };
}

if (comando === 'listar' || comando === 'preparar') {
  const imoveis = lerDados();
  const conta = {};
  for (const im of imoveis) conta[im.pagina.estado] = (conta[im.pagina.estado] || 0) + 1;
  const ordem = ['sem-pagina', 'desatualizada', 'reprovada', 'sem-arquivo'];
  const fila = ordem.flatMap((e) => imoveis.filter((im) => im.pagina.estado === e));

  if (comando === 'preparar') {
    const pasta = abrirRamo();
    let indice;
    try {
      const rot = path.join(pasta, 'ROTINA.md');
      console.log(`${'='.repeat(24)} ROTINA.md ${'='.repeat(24)}\n`);
      console.log(fs.existsSync(rot) ? fs.readFileSync(rot, 'utf8') : '(o ramo de conteúdo ainda não tem ROTINA.md)');
      indice = lerIndice(pasta);
      const modelo = indice.paginas.map((p) => path.join(pasta, 'paginas', `${p.codigo}.json`)).filter((f) => fs.existsSync(f)).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
      fs.mkdirSync(PASTA_FILA, { recursive: true });
      if (modelo) { fs.copyFileSync(modelo, path.join(PASTA_FILA, 'modelo-pagina.json')); console.log(`\nModelo de página já publicada (copie a ESTRUTURA, não o texto): ${path.join(PASTA_FILA, 'modelo-pagina.json')}`); }
      const quantos = Math.max(1, Math.min(10, parseInt(valor('--quantos', '4'), 10) || 4));
      const lote = fila.slice(0, quantos);
      console.log(`\n${'='.repeat(24)} Fila ${'='.repeat(24)}\n`);
      console.log(`${imoveis.length} imóveis à venda · ${Object.entries(conta).map(([e, n]) => `${n} ${ESTADOS[e] || e}`).join(' · ')}`);
      if (!lote.length) { console.log('\nFILA VAZIA: todos os imóveis à venda já têm página em dia.'); process.exit(0); }
      console.log(`\nDesta vez: ${lote.length} imóvel(is). As fotos ficam em ${PASTA_FILA}/<CÓDIGO>/ (abra TODAS antes de escrever).\n`);
      for (const im of lote) {
        const dir = path.join(PASTA_FILA, im.codigo);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        const atual = path.join(pasta, 'paginas', `${im.codigo}.json`);
        if (fs.existsSync(atual)) fs.copyFileSync(atual, path.join(dir, 'pagina-anterior.json'));
        fs.writeFileSync(path.join(dir, 'dados.json'), `${JSON.stringify(im, null, 2)}\n`);
        let baixadas = 0;
        for (const f of im.fotos) {
          try { curl(f.url, path.join(dir, `foto-${f.foto}.jpg`)); baixadas += 1; } catch (e) { console.error(`  (não baixou a foto ${f.foto}: ${e.message})`); }
        }
        const nf = baixadas ? folhas(dir) : 0;
        console.log(`- ${im.codigo} · ${im.tipo} · ${[im.bairro, im.cidade].filter(Boolean).join(', ')} · ${ESTADOS[im.pagina.estado]} · ${baixadas}/${im.fotos.length} fotos em ${dir}${nf ? ` (+ ${nf} folha(s) de contato: folha-1.jpg…)` : ''}${fs.existsSync(path.join(dir, 'pagina-anterior.json')) ? ' (tem pagina-anterior.json)' : ''}`);
        if (im.pagina.erros) console.log(`    motivo: ${im.pagina.erros.join(' | ')}`);
      }
      console.log(`\nDepois da fila desta vez, ainda faltarão ${Math.max(0, fila.length - lote.length)}.`);
    } finally { fecharRamo(pasta); }
  } else {
    console.log(`${imoveis.length} imóveis à venda · ${Object.entries(conta).map(([e, n]) => `${n} ${ESTADOS[e] || e}`).join(' · ')}\n`);
    for (const im of imoveis) console.log(`- ${im.codigo} · ${im.tipo} · ${im.bairro || '—'} · ${ESTADOS[im.pagina.estado] || im.pagina.estado}${im.pagina.slug ? ` · /imoveis/${im.pagina.slug}` : ''}`);
  }
} else if (comando === 'conferir') {
  const imoveis = lerDados();
  const arquivos = resto.filter((a) => !a.startsWith('--'));
  if (!arquivos.length) sair('Diga o arquivo: conferir pagina.json');
  for (const a of arquivos) conferir(a, imoveis);
  console.log('\n✓ Aprovado. (Nada foi publicado: use o comando publicar.)');
} else if (comando === 'publicar') {
  const imoveis = lerDados();
  const arquivos = resto.filter((a) => !a.startsWith('--') && a.endsWith('.json'));
  if (!arquivos.length) sair('Diga o(s) arquivo(s): publicar pagina.json [outra.json …]');
  const lidos = arquivos.map((a) => conferir(a, imoveis));
  const codigos = lidos.map((l) => l.pg.codigo);
  if (new Set(codigos).size !== codigos.length) sair('O mesmo imóvel aparece duas vezes neste envio.');
  const pasta = abrirRamo();
  try {
    const indice = lerIndice(pasta);
    const feitos = [];
    for (const { pg, im } of lidos) {
      const anterior = indice.paginas.find((p) => p.codigo === pg.codigo);
      if (anterior && anterior.versao === im.versao && !refazer) sair(`${pg.codigo} já tem página em dia (/imoveis/${anterior.slug}). Nada foi publicado.`);
      const outro = indice.paginas.find((p) => p.slug === pg.slug && p.codigo !== pg.codigo);
      if (outro) sair(`O endereço /imoveis/${pg.slug} já é do ${outro.codigo}. Nada foi publicado.`);
      const agora = new Date().toISOString();
      const paraGravar = { ...pg, versao: im.versao, publicadoEm: (anterior && anterior.publicadoEm) || agora, ...(anterior ? { atualizadoEm: agora } : {}) };
      fs.mkdirSync(path.join(pasta, 'paginas'), { recursive: true });
      fs.writeFileSync(path.join(pasta, 'paginas', `${pg.codigo}.json`), `${JSON.stringify(paraGravar, null, 2)}\n`);
      indice.paginas = indice.paginas.filter((p) => p.codigo !== pg.codigo);
      indice.paginas.push({ codigo: pg.codigo, slug: pg.slug, titulo: pg.titulo, resumo: pg.resumo, capa: pg.capa, versao: im.versao, publicadoEm: paraGravar.publicadoEm, ...(anterior ? { atualizadoEm: agora } : {}) });
      feitos.push(`${pg.codigo}${anterior ? ' (reescrita)' : ''}`);
      console.log(`\n✓ ${anterior ? 'Reescrita' : 'Publicada'}: ${PORTAL}/imoveis/${pg.slug}`);
    }
    gravarIndice(pasta, indice);
    enviar(pasta, `Portal: ${feitos.length === 1 ? `página de ${feitos[0]}` : `${feitos.length} páginas (${feitos.join(', ')})`}`);
    const faltam = imoveis.filter((im) => im.pagina.estado !== 'no-ar' && !codigos.includes(im.codigo)).length;
    console.log(`\nEm até 10 minutos as páginas aparecem no portal. Ainda faltam ${faltam} imóvel(is) com página por fazer ou refazer.`);
  } finally { fecharRamo(pasta); }
} else if (comando === 'retirar') {
  const cod = String(resto[0] || '').toUpperCase();
  if (!CODIGO.test(cod)) sair('Diga o código do imóvel: retirar AP0029');
  const pasta = abrirRamo();
  try {
    const indice = lerIndice(pasta);
    const p = indice.paginas.find((x) => x.codigo === cod);
    if (!p) sair(`${cod} não tem página publicada.`);
    indice.paginas = indice.paginas.filter((x) => x.codigo !== cod);
    fs.rmSync(path.join(pasta, 'paginas', `${cod}.json`), { force: true });
    gravarIndice(pasta, indice);
    enviar(pasta, `Portal: retira a página de ${cod}`);
    console.log(`\n✓ Retirada. Em até 10 minutos /imoveis/${p.slug} sai do ar (e o imóvel some da vitrine até ter página de novo).`);
  } finally { fecharRamo(pasta); }
} else {
  console.log(`Uso:
  node scripts/portal-publicar.mjs preparar [--quantos 4]       regras, fila e fotos dos próximos imóveis (em ${PASTA_FILA})
  node scripts/portal-publicar.mjs listar                       situação da página de cada imóvel à venda
  node scripts/portal-publicar.mjs conferir pagina.json         confere formato e régua, sem publicar
  node scripts/portal-publicar.mjs publicar a.json [b.json …]   confere e publica   [--refazer]
  node scripts/portal-publicar.mjs retirar <CÓDIGO>             tira a página do ar`);
  process.exit(comando ? 2 : 0);
}
