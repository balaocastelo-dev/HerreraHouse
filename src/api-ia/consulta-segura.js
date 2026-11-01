// Consulta livre do /api/ia/consulta: um SELECT (ou WITH … SELECT), só tabelas da imobiliária,
// sem comentário, sem segundo comando, sem função perigosa, com LIMIT teto.
// A execução em si (transação só de leitura e tempo limite) fica no banco.

const LIMITE_MAX = 500;
const TIMEOUT_MS = 4000;
const SQL_MAX = 12000;

// Tabelas do sistema desta imobiliária. Fora da lista: sessão, chave, configuração e arquivo binário.
const TABELAS = new Set([
  'usuarios', 'condominios', 'proprietarios', 'imoveis', 'arquivos',
  'links_internos', 'links_acessos', 'leads', 'interacoes', 'visitas', 'mensagens',
  'assinaturas', 'oportunidades', 'oportunidade_eventos', 'aprovacoes',
  'fisguei_anuncios', 'fisguei_pessoas', 'fisguei_contatos', 'fisguei_mensagens',
  'fisguei_pedidos', 'fisguei_bloqueios', 'fisguei_precos', 'titular_pedidos', 'auditoria',
  'condominio_cache', 'condominio_alertas', 'pois', 'bairros', 'bairro_commons', 'blog_materias',
  'agente_mensagens', 'agente_eventos', 'agente_afazeres', 'agente_midias', 'agente_tarefas',
  'social_posts', 'social_contas', 'social_cliques',
  'chat_conversas', 'chat_participantes', 'chat_mensagens', 'api_log',
]);

// usuarios.senha_hash não sai por esta rota. * junto de usuarios também não.
const COLUNAS_PROIBIDAS = new Set(['senha_hash', 'token_hash', 'chave_hash', 'db_url_cifrada']);
const AGREGADOS = new Set([
  'count', 'sum', 'avg', 'min', 'max', 'total', 'group_concat', 'string_agg',
  'every', 'bool_and', 'bool_or', 'json_agg', 'jsonb_agg', 'array_agg', 'xmlagg',
  'bit_and', 'bit_or', 'bit_xor', 'stddev', 'variance',
]);

// Palavra antes de "(" que abre subconsulta ou lista, não chamada de função.
const NAO_FUNCAO = new Set([
  'select', 'from', 'where', 'with', 'join', 'on', 'and', 'or', 'not', 'in', 'exists',
  'by', 'as', 'case', 'when', 'then', 'else', 'end', 'over', 'partition', 'order', 'group',
  'having', 'limit', 'offset', 'union', 'except', 'intersect', 'all', 'distinct', 'recursive',
  'lateral', 'inner', 'left', 'right', 'full', 'cross', 'outer', 'natural', 'using',
  'between', 'like', 'ilike', 'is', 'null', 'asc', 'desc', 'window', 'filter', 'within',
  'fetch', 'rows', 'only', 'returning', 'values',
]);

const COMANDOS = new Set([
  'insert', 'update', 'delete', 'drop', 'alter', 'create', 'grant', 'revoke', 'truncate',
  'copy', 'merge', 'vacuum', 'reindex', 'execute', 'prepare', 'deallocate', 'listen', 'notify',
  'call', 'set', 'reset', 'begin', 'commit', 'rollback', 'savepoint', 'lock', 'into',
  'attach', 'detach', 'pragma', 'analyze', 'cluster', 'discard', 'load', 'checkpoint',
  'refresh', 'import', 'export', 'do', 'comment', 'security', 'values', 'copy_to', 'copy_from',
]);

const FUNCOES = new Set([
  'pg_sleep', 'pg_sleep_for', 'pg_sleep_until',
  'pg_read_file', 'pg_read_binary_file', 'pg_read_server_files',
  'pg_ls_dir', 'pg_ls_logdir', 'pg_ls_waldir', 'pg_ls_tmpdir', 'pg_ls_archive_statusdir', 'pg_stat_file',
  'pg_write_file', 'pg_file_write', 'pg_file_rename', 'pg_file_unlink', 'pg_file_link', 'pg_logdir_ls',
  'set_config', 'current_setting',
  'pg_terminate_backend', 'pg_cancel_backend', 'pg_signal_backend',
  'pg_reload_conf', 'pg_rotate_logfile',
  'pg_advisory_lock', 'pg_advisory_lock_shared', 'pg_advisory_unlock', 'pg_advisory_unlock_all',
  'pg_try_advisory_lock', 'pg_try_advisory_lock_shared',
  'pg_notify', 'pg_logical_emit_message',
  'pg_create_restore_point', 'pg_promote', 'pg_wal_replay_pause', 'pg_wal_replay_resume',
  'nextval', 'setval', 'load_extension',
  'dblink', 'dblink_exec', 'dblink_connect', 'dblink_connect_u', 'dblink_disconnect',
  'dblink_open', 'dblink_close', 'dblink_fetch', 'dblink_send_query', 'dblink_get_result',
  'copy', 'copy_to', 'copy_from',
]);

const PARADA_FONTE = new Set([
  'where', 'group', 'order', 'having', 'limit', 'offset', 'union', 'except', 'intersect',
  'window', 'on', 'using', 'join', 'inner', 'left', 'right', 'full', 'cross', 'natural',
  'fetch', 'for',
]);
const PULA_FONTE = new Set(['lateral', 'only', 'outer', 'inner', 'cross', 'natural', 'left', 'right', 'full', 'as']);

function recusa(msg) {
  const e = new Error(msg);
  e.status = 400;
  throw e;
}

function funcaoProibida(nome) {
  const n = String(nome || '').toLowerCase();
  if (FUNCOES.has(n) || COMANDOS.has(n)) return true;
  if (n.startsWith('lo_') || n.startsWith('dblink') || n.startsWith('pg_read_') || n.startsWith('pg_ls_') || n.startsWith('pg_file_')) return true;
  if (n.startsWith('pg_terminate') || n.startsWith('pg_cancel') || n.startsWith('pg_signal')) return true;
  return false;
}

function tokenizar(sql) {
  const s = String(sql || '').replace(/^\uFEFF/, '').trim();
  if (!s) recusa('Informe o SQL.');
  if (s.length > SQL_MAX) recusa('Consulta longa demais.');
  if (s.includes('\0') || /[；﹔]/.test(s)) recusa('Um SELECT por vez. Não use outro comando no mesmo texto.');
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f') { i++; continue; }
    if (c === '-' && s[i + 1] === '-') recusa('Comentário não é permitido nesta consulta.');
    if (c === '/' && s[i + 1] === '*') recusa('Comentário não é permitido nesta consulta.');
    if (c === '#') recusa('Comentário não é permitido nesta consulta.');
    if (c === '$' || c === '\\' || c === '?' || c === '&' || c === ';') recusa('Um SELECT por vez. Esse caractere não entra nesta consulta.');
    if (c === "'") {
      const ini = i;
      i++;
      let fechou = false;
      while (i < s.length) {
        if (s[i] === "'" && s[i + 1] === "'") { i += 2; continue; }
        if (s[i] === "'") { i++; fechou = true; break; }
        i++;
      }
      if (!fechou) recusa('Texto aberto sem fechar.');
      tokens.push({ t: 'str', i: ini, j: i });
      continue;
    }
    if (c === '"' || c === '[' || c === '`') {
      if (c === '`') recusa('Identificador com crase não entra nesta consulta.');
      const fim = c === '"' ? '"' : ']';
      const ini = i;
      i++;
      let v = '';
      let fechou = false;
      while (i < s.length) {
        if (s[i] === fim && s[i + 1] === fim) { v += fim; i += 2; continue; }
        if (s[i] === fim) { i++; fechou = true; break; }
        v += s[i];
        i++;
      }
      if (!fechou) recusa('Identificador aberto sem fechar.');
      tokens.push({ t: 'id', v: v.toLowerCase(), i: ini, j: i });
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
      const ini = i;
      i++;
      while (i < s.length && /[0-9.]/.test(s[i])) i++;
      tokens.push({ t: 'num', v: s.slice(ini, i), i: ini, j: i });
      continue;
    }
    if (/[A-Za-z_\u00C0-\u024F]/.test(c)) {
      const ini = i;
      i++;
      while (i < s.length && /[A-Za-z0-9_\u00C0-\u024F]/.test(s[i])) i++;
      const bruto = s.slice(ini, i);
      // E'...', U&'...' e parecidos escondem caractere. Aqui não entram.
      if (/^[eubnx]$/i.test(bruto) && s[i] === "'") recusa('Texto com escape não entra nesta consulta.');
      tokens.push({ t: 'id', v: bruto.toLowerCase(), i: ini, j: i });
      continue;
    }
    if ('(),.*+-/%=<>|!'.includes(c)) {
      const tipo = (c === '(' || c === ')' || c === ',' || c === '.' || c === '*') ? c : 'op';
      tokens.push({ t: tipo, v: c, i, j: i + 1 });
      i++;
      continue;
    }
    recusa('Caractere não permitido nesta consulta.');
  }
  if (!tokens.length) recusa('Informe o SQL.');
  return { s, tokens };
}

function ehFuncao(tokens, i) {
  const prev = tokens[i - 1];
  return !!(prev && prev.t === 'id' && !NAO_FUNCAO.has(prev.v));
}

function coletarCtes(tokens) {
  const ctes = new Set();
  let func = 0;
  let grupo = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.t === '(') { if (ehFuncao(tokens, i)) func++; else grupo++; continue; }
    if (t.t === ')') { if (func) func--; else if (grupo) grupo--; continue; }
    if (func || t.v !== 'with') continue;
    let j = i + 1;
    if (tokens[j] && tokens[j].v === 'recursive') j++;
    while (tokens[j] && tokens[j].t === 'id') {
      ctes.add(tokens[j].v);
      j++;
      if (tokens[j] && tokens[j].t === '(' && tokens[j + 1] && tokens[j + 1].t === 'id' && tokens[j + 2] && (tokens[j + 2].t === ')' || tokens[j + 2].t === ',')) {
        let d = 0;
        do {
          if (tokens[j].t === '(') d++;
          else if (tokens[j].t === ')') d--;
          j++;
        } while (d > 0 && j < tokens.length);
      }
      if (!tokens[j] || tokens[j].v !== 'as') break;
      j++;
      if (!tokens[j] || tokens[j].t !== '(') break;
      // O corpo fica para o laço principal (tabelas de dentro também passam pela lista).
      let d = 1;
      j++;
      while (d > 0 && j < tokens.length) {
        if (tokens[j].t === '(') d++;
        else if (tokens[j].t === ')') d--;
        j++;
      }
      if (tokens[j] && tokens[j].t === ',') { j++; continue; }
      break;
    }
  }
  return ctes;
}

function tabelasUsadas(tokens, ctes) {
  const usadas = new Set();
  const ctx = [{ espera: false, from: false }];
  let func = 0;
  const fechaEspera = () => { const c = ctx[ctx.length - 1]; c.espera = false; };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.t === '(') {
      if (ehFuncao(tokens, i)) func++;
      else {
        const espera = ctx[ctx.length - 1].espera;
        ctx.push({ espera: false, from: false });
        if (espera) ctx[ctx.length - 2].espera = false;
      }
      continue;
    }
    if (t.t === ')') {
      if (func) func--;
      else if (ctx.length > 1) ctx.pop();
      continue;
    }
    if (func) continue;
    const c = ctx[ctx.length - 1];
    if (t.t === 'id' && (t.v === 'from' || t.v === 'join')) {
      c.from = true;
      c.espera = true;
      continue;
    }
    if (t.t === 'id' && PARADA_FONTE.has(t.v) && t.v !== 'join' && t.v !== 'on' && t.v !== 'using') {
      // ON/USING não encerram a lista: a vírgula seguinte ainda pode ser outra tabela.
      if (!['on', 'using', 'left', 'right', 'full', 'inner', 'cross', 'natural'].includes(t.v)) {
        c.from = false;
        c.espera = false;
      }
      continue;
    }
    if (t.t === ',' && c.from && !c.espera) { c.espera = true; continue; }
    if (!c.espera) continue;
    if (t.t === 'id' && PULA_FONTE.has(t.v)) continue;
    if (t.t !== 'id') recusa('Tabela não permitida nesta consulta.');
    if (tokens[i + 1] && tokens[i + 1].t === '.') recusa('Informe a tabela sem schema.');
    if (tokens[i + 1] && tokens[i + 1].t === '(') recusa('Função no lugar de tabela não entra nesta consulta.');
    if (!ctes.has(t.v) && !TABELAS.has(t.v)) recusa(`Tabela não permitida: ${t.v}.`);
    if (TABELAS.has(t.v)) usadas.add(t.v);
    c.espera = false;
    let j = i + 1;
    if (tokens[j] && tokens[j].v === 'as') j++;
    if (tokens[j] && tokens[j].t === 'id' && !PARADA_FONTE.has(tokens[j].v) && !PULA_FONTE.has(tokens[j].v) && tokens[j].v !== 'where') {
      i = j;
    }
    fechaEspera();
  }
  return usadas;
}

function estrelasDemais(tokens, usadas) {
  if (!usadas.has('usuarios')) return;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].t !== '*') continue;
    const abre = tokens[i - 1];
    const nome = abre && abre.t === '(' ? tokens[i - 2] : null;
    const agregado = !!(nome && nome.t === 'id' && AGREGADOS.has(nome.v));
    if (!agregado) recusa('Não use * quando a consulta inclui usuarios. Liste as colunas, sem senha_hash.');
  }
}

function aplicarLimite(src, tokens, limite) {
  const trocas = [];
  let temExterno = false;
  let func = 0;
  let grupo = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.t === '(') { if (ehFuncao(tokens, i)) func++; else grupo++; continue; }
    if (t.t === ')') { if (func) func--; else if (grupo) grupo--; continue; }
    if (func || t.v !== 'limit') continue;
    const prox = tokens[i + 1];
    if (prox && prox.v === '-') recusa('LIMIT negativo não é permitido.');
    if (prox && prox.v === 'all') recusa('LIMIT ALL não é permitido.');
    let num = prox;
    let grupoNum = grupo;
    if (prox && prox.t === '(' && tokens[i + 2] && tokens[i + 2].t === 'num' && tokens[i + 3] && tokens[i + 3].t === ')') {
      num = tokens[i + 2];
    }
    if (!num || num.t !== 'num' || !/^\d+$/.test(num.v)) recusa('LIMIT precisa ser um número inteiro.');
    const n = Math.min(limite, parseInt(num.v, 10));
    trocas.push({ i: num.i, j: num.j, texto: String(n) });
    if (grupoNum === 0) temExterno = true;
  }
  let sql = src;
  trocas.sort((a, b) => b.i - a.i);
  for (const tr of trocas) sql = sql.slice(0, tr.i) + tr.texto + sql.slice(tr.j);
  if (!temExterno) sql = `${sql.replace(/\s+$/, '')} LIMIT ${limite}`;
  return sql;
}

function limiteDe(v) {
  if (v === undefined || v === null || v === '') return LIMITE_MAX;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 1) return LIMITE_MAX;
  return Math.min(LIMITE_MAX, n);
}

function prepararConsulta(sql, opcoes = {}) {
  const { s, tokens } = tokenizar(sql);
  let k = 0;
  while (tokens[k] && tokens[k].t === '(') k++;
  if (!tokens[k] || !['select', 'with'].includes(tokens[k].v)) recusa('Só consulta de leitura (SELECT ou WITH).');
  if (!tokens.some((t) => t.v === 'select')) recusa('Só consulta de leitura (SELECT ou WITH).');

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.t === 'id' && COMANDOS.has(t.v)) recusa('Comando não permitido nesta rota.');
    if (t.t === 'id' && COLUNAS_PROIBIDAS.has(t.v)) recusa('Essa coluna não sai por esta consulta.');
    if (t.t === 'id' && tokens[i + 1] && tokens[i + 1].t === '(') {
      if (tokens[i - 1] && tokens[i - 1].t === '.') recusa('Função com schema não entra nesta consulta.');
      if (funcaoProibida(t.v)) recusa(`Função não permitida: ${t.v}.`);
    }
    if (t.t === 'id' && tokens[i - 1] && tokens[i - 1].t === '.' && tokens[i - 2] && tokens[i - 2].t === 'id' && tokens[i - 3] && tokens[i - 3].t === '.') {
      recusa('Informe a tabela sem schema.');
    }
  }

  const ctes = coletarCtes(tokens);
  const usadas = tabelasUsadas(tokens, ctes);
  estrelasDemais(tokens, usadas);
  const limite = limiteDe(opcoes.limite);
  return { sql: aplicarLimite(s, tokens, limite), limite, timeoutMs: TIMEOUT_MS };
}

module.exports = { prepararConsulta, LIMITE_MAX, TIMEOUT_MS, TABELAS };
