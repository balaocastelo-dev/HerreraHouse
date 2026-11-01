#!/usr/bin/env node
/**
 * Bairros do cliente (a imobiliária) · a ÚNICA porta de entrada de uma página de bairro no site.
 *
 *   node scripts/bairros-publicar.mjs preparar [--quantos 1]        regras, fila, dados ao vivo e fotos dos imóveis do cliente no bairro
 *   node scripts/bairros-publicar.mjs fotos <bairro> "<busca>"      procura fotos no Wikimedia Commons (só licença livre) e baixa para ver
 *   node scripts/bairros-publicar.mjs listar                        a situação da página de cada bairro
 *   node scripts/bairros-publicar.mjs conferir pagina.json          confere formato, régua e a licença de cada foto, sem publicar
 *   node scripts/bairros-publicar.mjs publicar a.json [b.json …]    confere e publica (um envio só)
 *   node scripts/bairros-publicar.mjs retirar <bairro>              tira a página do ar
 *
 * Antes de publicar, a página passa pelas MESMAS conferências que o site aplica
 * antes de mostrar: o formato (src/bairros/validar.js) e a régua
 * (src/bairros/regua.js), mais a licença de cada foto do Commons, lida no
 * próprio Commons através do site (SITE/bairros/commons/info.json).
 *
 * Publicar = gravar paginas/<bairro>.json e indice.json no ramo
 * `claude/bairros-conteudo` e enviar. O sistema não é reinstalado; o main não é tocado.
 *
 * Mesmo esquema do portal (scripts/portal-publicar.mjs). Precisa só do Node 22+, do git e do curl.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { lerPagina } = require('../src/bairros/validar.js');
const { avaliarPagina } = require('../src/bairros/regua.js');
const { RAMO_DE_CONTEUDO: RAMO, DONO_REPO, SLUG } = require('../src/bairros/config.js');
// O nome da imobiliária (cliente) vem da configuração (.env: CLIENTE_NOME).
const CLIENTE = require('../src/config.js').CLIENTE_NOME;

const SITE = (process.env.PORTAL_URL || process.env.PUBLIC_URL || require('../src/config.js').BASE_URL).replace(/\/+$/, '');
const PASTA_FILA = path.join(os.tmpdir(), 'bairros');

// ---------------------------------------------------------------- utilidades
function sair(mensagem, codigo = 1) { console.error(`\n✗ ${mensagem}`); process.exit(codigo); }
function git(args, opcoes = {}) {
  return execFileSync('git', args, { cwd: opcoes.cwd ?? RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function remoto() {
  if (process.env.BAIRROS_REMOTO || process.env.PORTAL_REMOTO) return process.env.BAIRROS_REMOTO || process.env.PORTAL_REMOTO;
  const linhas = git(['remote', '-v']).split('\n');
  const [dono, repo] = DONO_REPO.split('/');
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const achado = linhas.find((l) => new RegExp(`[/:]${esc(dono)}/${esc(repo)}(?:\\.git)?\\s`).test(l));
  return achado ? achado.split(/\s+/)[0] : 'origin';
}
function curl(url, destino) {
  const args = ['-fsSL', '--retry', '2', '--max-time', '90', url];
  if (destino) args.push('-o', destino);
  try { return execFileSync('curl', args, { encoding: destino ? undefined : 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }); }
  catch (e) { throw new Error(`${url}: ${String(e.stderr || e.message).trim()}`); }
}
const json = (url) => JSON.parse(curl(url));
/** Folhas de contato (4 fotos por folha, com o rótulo de cada foto em amarelo), se houver Python com Pillow. */
const FOLHAS_PY = `
import sys, glob, os
from PIL import Image, ImageDraw, ImageFont
d, padrao, prefixo = sys.argv[1], sys.argv[2], sys.argv[3]
fs = sorted(glob.glob(os.path.join(d, padrao)), key=lambda f: int(''.join(c for c in os.path.basename(f) if c.isdigit()) or 0))
try: fonte = ImageFont.load_default(size=30)
except TypeError: fonte = ImageFont.load_default()
for k in range(0, len(fs), 4):
    W, H = 800, 560
    folha = Image.new('RGB', (W * 2, H * 2), 'white'); de = ImageDraw.Draw(folha)
    for i, f in enumerate(fs[k:k + 4]):
        im = Image.open(f).convert('RGB'); im.thumbnail((W - 8, H - 8)); x, y = (i % 2) * W, (i // 2) * H
        folha.paste(im, (x + 4, y + 4)); rot = os.path.splitext(os.path.basename(f))[0].replace('foto-', '')
        de.rectangle([x + 4, y + 4, x + 24 + 18 * len(rot), y + 44], fill='black'); de.text((x + 12, y + 8), rot, fill='yellow', font=fonte)
    folha.save(os.path.join(d, '%s%d.jpg' % (prefixo, k // 4 + 1)), quality=85)
print(len(fs))
`;
function folhas(dir, padrao, prefixo) {
  for (const py of ['python3', 'python']) {
    try { execFileSync(py, ['-c', FOLHAS_PY, dir, padrao, prefixo], { stdio: ['ignore', 'pipe', 'pipe'] }); return fs.readdirSync(dir).filter((n) => n.startsWith(prefixo)).length; } catch { /* tenta o próximo */ }
  }
  return 0;
}

function lerDados() {
  try {
    const d = json(`${SITE}/bairros/dados.json?t=${Date.now()}`);
    if (!Array.isArray(d.bairros)) throw new Error('resposta sem a lista de bairros');
    return d.bairros;
  } catch (e) { return sair(`Não consegui ler a lista de bairros (${SITE}/bairros/dados.json): ${e.message}`); }
}
const bairroParaRegua = (b) => ({ slug: b.slug, nome: b.nome, apelidos: b.apelidos, fotosImoveis: b.imoveis.flatMap((im) => im.fotos.map((f) => f.foto)) });

let REMOTO = null;
function abrirRamo() {
  REMOTO = remoto();
  let existe = true;
  try { git(['fetch', '--quiet', REMOTO, `+refs/heads/${RAMO}:refs/remotes/${REMOTO}/${RAMO}`]); }
  catch (erro) {
    if (/couldn't find remote ref|not found/i.test(String(erro.stderr))) existe = false;
    else sair(`Não consegui buscar o ramo ${RAMO}: ${String(erro.stderr || erro.message).trim()}`);
  }
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'bairros-'));
  if (existe) git(['worktree', 'add', '--quiet', '--detach', pasta, `${REMOTO}/${RAMO}`]);
  else { git(['worktree', 'add', '--quiet', '--detach', pasta]); git(['checkout', '--quiet', '--orphan', `bairros-tmp-${Date.now()}`], { cwd: pasta }); git(['rm', '-rfq', '.'], { cwd: pasta }); }
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
  indice.paginas.sort((a, b) => a.slug.localeCompare(b.slug));
  indice.atualizadoEm = new Date().toISOString();
  fs.writeFileSync(path.join(pasta, 'indice.json'), `${JSON.stringify(indice, null, 2)}\n`);
}
function enviar(pasta, mensagem) {
  git(['add', '-A'], { cwd: pasta });
  const identidade = [];
  try { git(['config', 'user.email'], { cwd: pasta }); } catch { identidade.push('-c', `user.name=Bairros ${CLIENTE}`, '-c', 'user.email=conteudo@corretordofuturo.app'); }
  const rodape = process.env.BAIRROS_RODAPE_DO_COMMIT || process.env.PORTAL_RODAPE_DO_COMMIT;
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
const valor = (nome, padrao) => { const i = resto.indexOf(nome); return i >= 0 && resto[i + 1] ? resto[i + 1] : padrao; };
const ESTADOS = { 'sem-pagina': 'sem página', pedida: `reescrita pedida pela ${CLIENTE}`, antiga: 'página antiga (mais de um ano)', reprovada: 'reprovada no site', 'sem-arquivo': 'sem arquivo', 'no-ar': 'no ar' };
const NA_FILA = ['pedida', 'sem-pagina', 'reprovada', 'sem-arquivo', 'antiga'];

function conferir(arquivo, bairros) {
  if (!arquivo || !fs.existsSync(arquivo)) sair(`Arquivo não encontrado: ${arquivo ?? '(nenhum)'}`);
  let bruto;
  try { bruto = JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch (e) { sair(`${arquivo} não é um JSON válido: ${e.message}`); }
  const lido = lerPagina(bruto);
  if (!lido.ok) sair(`${arquivo} — formato reprovado:\n- ${lido.erros.join('\n- ')}`);
  const pg = lido.valor;
  const b = bairros.find((x) => x.slug === pg.slug);
  if (!b) sair(`O bairro "${pg.slug}" não está na lista do site (ou está oculto).`);
  const av = avaliarPagina(pg, bairroParaRegua(b), { modo: 'publicar' });
  // a licença de cada foto do Commons, conferida no próprio Commons
  for (const f of pg.fotos.filter((x) => x.commons)) {
    let i;
    try { i = json(`${SITE}/bairros/commons/info.json?t=${encodeURIComponent(f.commons)}`); } catch (e) { av.erros.push(`Não consegui conferir a foto ${f.id} (${f.commons}): ${e.message}`); continue; }
    if (!i.aceita) av.erros.push(`A foto ${f.id} (${f.commons}) não pode ser usada: ${i.motivo || 'licença não aceita'}. Troque por outra.`);
  }
  const m = av.medidas;
  console.log(`\n${b.nome} · ${pg.titulo}`);
  console.log(`/bairros/${pg.slug} · ${m.palavras} palavras · ${m.secoes} seções · ${m.fotos} fotos (${m.commons} do Commons, ${m.deImovel} de imóveis da ${CLIENTE}) · ${m.perguntas} perguntas · ${m.fontes} fontes · ${m.chamadas} chamada(s)`);
  if (av.avisos.length) console.log(`Avisos (não impedem; leve a sério):\n- ${av.avisos.join('\n- ')}`);
  if (av.erros.length) sair(`${arquivo} — reprovado:\n- ${[...new Set(av.erros)].join('\n- ')}`);
  return { pg, b };
}

if (comando === 'listar' || comando === 'preparar') {
  const bairros = lerDados();
  const conta = {};
  for (const b of bairros) conta[b.pagina.estado] = (conta[b.pagina.estado] || 0) + 1;
  const fila = bairros.filter((b) => NA_FILA.includes(b.pagina.estado)); // o site já manda na ordem da fila
  const resumo = `${bairros.length} bairros na lista · ${Object.entries(conta).map(([e, n]) => `${n} ${ESTADOS[e] || e}`).join(' · ')}`;

  if (comando === 'preparar') {
    const pasta = abrirRamo();
    try {
      const rot = path.join(pasta, 'ROTINA.md');
      console.log(`${'='.repeat(24)} ROTINA.md ${'='.repeat(24)}\n`);
      console.log(fs.existsSync(rot) ? fs.readFileSync(rot, 'utf8') : '(o ramo de conteúdo ainda não tem ROTINA.md)');
      const indice = lerIndice(pasta);
      fs.mkdirSync(PASTA_FILA, { recursive: true });
      const modelo = indice.paginas.map((p) => path.join(pasta, 'paginas', `${p.slug}.json`)).filter((f) => fs.existsSync(f)).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
      if (modelo) { fs.copyFileSync(modelo, path.join(PASTA_FILA, 'modelo-pagina.json')); console.log(`\nModelo de página já publicada (copie a ESTRUTURA, não o texto): ${path.join(PASTA_FILA, 'modelo-pagina.json')}`); }
      const quantos = Math.max(1, Math.min(5, parseInt(valor('--quantos', '1'), 10) || 1));
      const escolhidos = valor('--bairro', '').split(',').map((x) => x.trim()).filter(Boolean);
      const lote = escolhidos.length ? escolhidos.map((sl) => bairros.find((b) => b.slug === sl) || sair(`Bairro não encontrado na lista: ${sl}`)) : fila.slice(0, quantos);
      console.log(`\n${'='.repeat(24)} Fila ${'='.repeat(24)}\n\n${resumo}`);
      if (!lote.length) { console.log('\nFILA VAZIA: todos os bairros da lista já têm página em dia.'); process.exit(0); }
      console.log(`\nDesta vez: ${lote.length} bairro(s). Tudo fica em ${PASTA_FILA}/<bairro>/.\n`);
      for (const b of lote) {
        const dir = path.join(PASTA_FILA, b.slug);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        const atual = path.join(pasta, 'paginas', `${b.slug}.json`);
        if (fs.existsSync(atual)) fs.copyFileSync(atual, path.join(dir, 'pagina-anterior.json'));
        fs.writeFileSync(path.join(dir, 'dados.json'), `${JSON.stringify(b, null, 2)}\n`);
        let baixadas = 0;
        const todas = b.imoveis.flatMap((im) => im.fotos);
        for (const f of todas) {
          try { curl(f.url, path.join(dir, `foto-${f.foto}.jpg`)); baixadas += 1; } catch (e) { console.error(`  (não baixou a foto ${f.foto}: ${e.message})`); }
        }
        const nf = baixadas ? folhas(dir, 'foto-*.jpg', 'imoveis-') : 0;
        console.log(`- ${b.nome} (${b.slug}) · ${b.regiao || 'sem região'} · ${ESTADOS[b.pagina.estado]} · ${b.carteira.total} imóvel(is) da ${CLIENTE} com página · ${b.condominios.total} prédio(s)/condomínio(s) na base`);
        console.log(`    ${baixadas}/${todas.length} fotos de imóveis da ${CLIENTE} em ${dir}${nf ? ` (+ ${nf} folha(s): imoveis-1.jpg…)` : ''}${fs.existsSync(path.join(dir, 'pagina-anterior.json')) ? ' · tem pagina-anterior.json' : ''}`);
        if (b.notas) console.log(`    NOTAS DA ${CLIENTE.toUpperCase()} (siga): ${b.notas}`);
        if (b.pagina.erros) console.log(`    motivo: ${b.pagina.erros.join(' | ')}`);
        console.log(`    fotos de lugares do bairro: node scripts/bairros-publicar.mjs fotos ${b.slug} "<o que procurar>"`);
      }
      console.log(`\nDepois desta vez, ainda faltarão ${Math.max(0, fila.length - lote.length)} na fila.`);
    } finally { fecharRamo(pasta); }
  } else {
    console.log(`${resumo}\n`);
    for (const b of bairros) console.log(`- ${b.nome} (${b.slug}) · ${ESTADOS[b.pagina.estado] || b.pagina.estado}${b.pagina.endereco ? ` · ${b.pagina.endereco}` : ''}`);
  }
} else if (comando === 'fotos') {
  const [slug, ...termos] = resto.filter((a, i) => !a.startsWith('--') && !(i > 0 && resto[i - 1] === '--n'));
  const busca = termos.join(' ').trim();
  if (!slug || !SLUG.test(slug) || busca.length < 3) sair('Uso: fotos <bairro> "<o que procurar>"   (ex.: fotos taquaral "Lagoa do Taquaral")');
  const dir = path.join(PASTA_FILA, slug, 'commons');
  fs.mkdirSync(dir, { recursive: true });
  const lista = path.join(dir, 'lista.json');
  const ja = fs.existsSync(lista) ? JSON.parse(fs.readFileSync(lista, 'utf8')) : [];
  let r;
  try { r = json(`${SITE}/bairros/commons/busca.json?q=${encodeURIComponent(busca)}&n=${Math.min(30, parseInt(valor('--n', '16'), 10) || 16)}`); } catch (e) { sair(`A busca no Commons falhou: ${e.message}`); }
  const aceitas = r.resultados.filter((x) => x.aceita && !ja.some((y) => y.titulo === x.titulo));
  const recusadas = r.resultados.filter((x) => !x.aceita);
  console.log(`\nBusca "${busca}": ${r.resultados.length} resultado(s), ${aceitas.length} nova(s) com licença aceita.`);
  let k = ja.length;
  for (const x of aceitas) {
    k += 1;
    const local = path.join(dir, `c${k}.jpg`);
    try { curl(`${SITE}${x.ver}&l=500`, local); } catch (e) { console.error(`  (não baixou ${x.titulo}: ${e.message})`); continue; }
    ja.push({ rotulo: `c${k}`, arquivo: local, titulo: x.titulo, autor: x.autor, licenca: x.licenca, largura: x.largura, descricao: x.descricao, data: x.data });
    console.log(`- c${k} · ${x.titulo} · ${x.largura}×${x.altura} · ${x.licenca} · ${x.autor || 'autor não informado'}${x.descricao ? `\n    ${x.descricao.slice(0, 160)}` : ''}`);
  }
  if (recusadas.length) console.log(`\n(${recusadas.length} recusada(s): ${recusadas.slice(0, 6).map((x) => `${x.titulo.slice(5, 60)} — ${x.motivo}`).join('; ')})`);
  fs.writeFileSync(lista, `${JSON.stringify(ja, null, 2)}\n`);
  for (const f of fs.readdirSync(dir).filter((n) => n.startsWith('folha-'))) fs.rmSync(path.join(dir, f));
  const nf = ja.length ? folhas(dir, 'c*.jpg', 'folha-') : 0;
  console.log(`\nTodas as fotos achadas para ${slug}: ${lista} (${ja.length})${nf ? ` · folhas de contato: ${dir}/folha-1.jpg…` : ''}`);
  console.log('Use na página o "titulo" exato como "commons": "File:…". Olhe a foto antes: a legenda diz o que ELA mostra.');
} else if (comando === 'conferir') {
  const bairros = lerDados();
  const arquivos = resto.filter((a) => !a.startsWith('--'));
  if (!arquivos.length) sair('Diga o arquivo: conferir pagina.json');
  for (const a of arquivos) conferir(a, bairros);
  console.log('\n✓ Aprovado. (Nada foi publicado: use o comando publicar.)');
} else if (comando === 'publicar') {
  const bairros = lerDados();
  const arquivos = resto.filter((a) => !a.startsWith('--') && a.endsWith('.json'));
  if (!arquivos.length) sair('Diga o(s) arquivo(s): publicar pagina.json [outra.json …]');
  const lidos = arquivos.map((a) => conferir(a, bairros));
  const slugs = lidos.map((l) => l.pg.slug);
  if (new Set(slugs).size !== slugs.length) sair('O mesmo bairro aparece duas vezes neste envio.');
  const pasta = abrirRamo();
  try {
    const indice = lerIndice(pasta);
    const feitos = [];
    for (const { pg, b } of lidos) {
      const anterior = indice.paginas.find((p) => p.slug === pg.slug);
      if (anterior && b.pagina.estado === 'no-ar' && !opcoes.has('--refazer')) sair(`${b.nome} já tem página em dia (/bairros/${pg.slug}). Nada foi publicado.`);
      const agora = new Date().toISOString();
      const paraGravar = { ...pg, publicadoEm: (anterior && anterior.publicadoEm) || agora, ...(anterior ? { atualizadoEm: agora } : {}) };
      fs.mkdirSync(path.join(pasta, 'paginas'), { recursive: true });
      fs.writeFileSync(path.join(pasta, 'paginas', `${pg.slug}.json`), `${JSON.stringify(paraGravar, null, 2)}\n`);
      indice.paginas = indice.paginas.filter((p) => p.slug !== pg.slug);
      indice.paginas.push({ slug: pg.slug, titulo: pg.titulo, resumo: pg.resumo, publicadoEm: paraGravar.publicadoEm, ...(anterior ? { atualizadoEm: agora } : {}) });
      feitos.push(`${b.nome}${anterior ? ' (reescrita)' : ''}`);
      console.log(`\n✓ ${anterior ? 'Reescrita' : 'Publicada'}: ${SITE}/bairros/${pg.slug}`);
    }
    gravarIndice(pasta, indice);
    enviar(pasta, `Bairros: ${feitos.length === 1 ? `página de ${feitos[0]}` : `${feitos.length} páginas (${feitos.join(', ')})`}`);
    const faltam = bairros.filter((b) => NA_FILA.includes(b.pagina.estado) && !slugs.includes(b.slug)).length;
    console.log(`\nEm até 10 minutos as páginas aparecem no site. Ainda faltam ${faltam} bairro(s) na fila.`);
  } finally { fecharRamo(pasta); }
} else if (comando === 'retirar') {
  const slug = String(resto[0] || '');
  if (!SLUG.test(slug)) sair('Diga o bairro: retirar cambui');
  const pasta = abrirRamo();
  try {
    const indice = lerIndice(pasta);
    if (!indice.paginas.some((x) => x.slug === slug)) sair(`${slug} não tem página publicada.`);
    indice.paginas = indice.paginas.filter((x) => x.slug !== slug);
    fs.rmSync(path.join(pasta, 'paginas', `${slug}.json`), { force: true });
    gravarIndice(pasta, indice);
    enviar(pasta, `Bairros: retira a página de ${slug}`);
    console.log(`\n✓ Retirada. Em até 10 minutos /bairros/${slug} sai do ar.`);
  } finally { fecharRamo(pasta); }
} else {
  console.log(`Uso:
  node scripts/bairros-publicar.mjs preparar [--quantos 1 | --bairro a,b]  regras, fila, dados e fotos (em ${PASTA_FILA})
  node scripts/bairros-publicar.mjs fotos <bairro> "<busca>"        fotos de lugares do bairro no Commons (só licença livre)
  node scripts/bairros-publicar.mjs listar                          situação da página de cada bairro
  node scripts/bairros-publicar.mjs conferir pagina.json            confere formato, régua e licenças, sem publicar
  node scripts/bairros-publicar.mjs publicar a.json [b.json …]      confere e publica   [--refazer]
  node scripts/bairros-publicar.mjs retirar <bairro>                tira a página do ar`);
  process.exit(comando ? 2 : 0);
}
