const r = require('express').Router();
const { one, all, run } = require('../db');
const { falha } = require('../util');
const A = require('../auth');
const B = require('../agentes/base');
const IA = require('../agentes/ia');
const C = require('../chat');
const numero = (v, padrao = 0) => {
  if (v === undefined) return padrao;
  if (!/^\d+$/.test(String(v)) || !Number.isSafeInteger(+v)) falha(400, 'Identificador inválido.');
  return +v;
};
function acesso(req) {
  const id = numero(req.params.id);
  return one(`SELECT c.* FROM chat_conversas c JOIN chat_participantes p ON p.conversa_id=c.id
    WHERE c.id=? AND p.usuario_id=?`, id, req.usuario.id) || falha(403, 'Você não participa desta conversa.');
}
// Defesa também quando este router for montado isoladamente.
r.use('/chat', (req, res, next) => req.usuario ? next() : A.exigeLogin(req, res, next));
r.get('/chat/caixa', (req, res) => {
  C.espelha(req.usuario.id);
  // Cursor obtido antes da caixa: mensagens que chegarem durante a leitura não se perdem no polling.
  const ate = one('SELECT coalesce(max(id),0) id FROM chat_mensagens').id;
  const conversas = all(`SELECT c.*,p.silenciado,(SELECT count(*) FROM chat_mensagens m
    WHERE m.conversa_id=c.id AND m.id>p.lido_ate AND (m.de_usuario IS NULL OR m.de_usuario!=?)) nao_lidas
    FROM chat_conversas c JOIN chat_participantes p ON p.conversa_id=c.id WHERE p.usuario_id=?
    ORDER BY coalesce(c.ultima_em,c.criado_em) DESC,c.id DESC`, req.usuario.id, req.usuario.id)
    .map(({ par, ...c }) => ({ ...c, participantes: C.participantes(c.id) }));
  const contatos = all('SELECT id,nome FROM usuarios WHERE ativo=1 AND id!=? ORDER BY nome', req.usuario.id)
    .map((u) => C.contato(u.id, null, u.nome)).concat(B.AGENTES.map((a) => C.contato(null, a.slug)));
  res.json({ ate, conversas, contatos, nao_lidas_total: C.total(req.usuario.id) });
});
r.post('/chat/conversas', (req, res) => {
  const b = req.body || {}, uid = req.usuario.id;
  if (!['direta', 'sala'].includes(b.tipo) || !Array.isArray(b.com) || !b.com.length || b.com.length > 100) falha(400, 'Escolha o tipo e os participantes.');
  const com = new Map();
  for (const v of b.com) {
    if ((typeof v === 'number' || typeof v === 'string') && /^\d+$/.test(String(v))) {
      const id = numero(v);
      if (!one(`SELECT 1 FROM usuarios WHERE id=? ${A.veTudo(req.usuario) ? '' : 'AND ativo=1'}`, id)) falha(400, 'Usuário indisponível nesta imobiliária.');
      if (id !== uid) com.set('u' + id, { usuario_id: id, agente: null });
    } else if (typeof v === 'string' && Object.hasOwn(B.POR_SLUG, v)) com.set('a' + v, { usuario_id: null, agente: v });
    else falha(400, 'Contato inválido.');
  }
  if (!com.size || (b.tipo === 'direta' && com.size !== 1)) falha(400, 'Uma conversa direta precisa de outro contato.');
  const titulo = typeof b.titulo === 'string' ? b.titulo.trim().slice(0, 100) : '';
  if (b.tipo === 'sala' && !titulo) falha(400, 'Dê um título à sala.');
  const par = b.tipo === 'direta' ? ['u' + uid, ...com.keys()].sort().join(':') : null;
  const novo = run(`INSERT INTO chat_conversas(tipo,titulo,criado_por,par) VALUES(?,?,?,?) ON CONFLICT(par) DO NOTHING`, b.tipo, titulo || null, uid, par);
  const id = par ? one('SELECT id FROM chat_conversas WHERE par=?', par).id : Number(novo.lastInsertRowid);
  // Uma única instrução insere o conjunto inteiro, inclusive numa disputa pela mesma direta.
  const pessoas = [{ usuario_id: uid, agente: null }, ...com.values()];
  run(`INSERT INTO chat_participantes(conversa_id,usuario_id,agente) VALUES ${pessoas.map(() => '(?,?,?)').join(',')} ON CONFLICT DO NOTHING`,
    ...pessoas.flatMap((p) => [id, p.usuario_id, p.agente]));
  res.json({ id, tipo: b.tipo, titulo: titulo || null, participantes: C.participantes(id) });
});
r.get('/chat/conversas/:id', (req, res) => {
  const c = acesso(req), desde = numero(req.query.desde), antes = numero(req.query.antes);
  if (desde && antes) falha(400, 'Use desde ou antes, separadamente.');
  C.espelha(req.usuario.id);
  const lista = C.mensagens(`${C.SELECT_MSG} WHERE m.conversa_id=? ${antes ? 'AND m.id<?' : desde ? 'AND m.id>?' : ''}
    ORDER BY m.id ${desde ? 'ASC' : 'DESC'} LIMIT 81`, c.id, ...(antes ? [antes] : desde ? [desde] : []));
  const mais = lista.length > 80; lista.splice(80);
  if (!desde) lista.reverse();
  const ate = lista.length ? lista[lista.length - 1].id : 0;
  run('UPDATE chat_participantes SET lido_ate=? WHERE conversa_id=? AND usuario_id=? AND lido_ate<?', ate, c.id, req.usuario.id, ate);
  // O espelhamento desta leitura pode ter atualizado a última atividade da conversa.
  const { par, ...conversa } = one('SELECT * FROM chat_conversas WHERE id=?', c.id);
  res.json({ conversa, mensagens: lista, mais, participantes: C.participantes(c.id), digitando: C.digitando(c.id), nao_lidas_total: C.total(req.usuario.id) });
});
r.post('/chat/conversas/:id/mensagens', async (req, res) => {
  const c = acesso(req), texto = typeof req.body?.texto === 'string' ? req.body.texto.trim() : '';
  if (!texto || texto.length > 4000) falha(400, 'Escreva de 1 a 4.000 caracteres.');
  const pedido = /^tarefa\s*:/i.test(texto) ? texto.replace(/^tarefa\s*:/i, '').trim() : null;
  if (pedido !== null && pedido.length < 8) falha(400, 'Descreva a tarefa com pelo menos 8 caracteres.');
  const id = Number(run('INSERT INTO chat_mensagens(conversa_id,de_usuario,texto) VALUES(?,?,?)', c.id, req.usuario.id, texto).lastInsertRowid);
  const agentes = C.participantes(c.id).filter((p) => p.agente);
  for (const { agente } of agentes) {
    const telefone = C.telefone(c.id, agente);
    const entrada = B.registraEntrada({ agente, linha: 'chat', telefone, nome: req.usuario.nome, texto, wa_id: `chat-m-${id}-${agente}` });
    if (pedido !== null) {
      C.criaTarefa(agente, telefone, pedido, req.usuario);
      run('UPDATE agente_mensagens SET processada=1 WHERE id=?', entrada);
      B.enfileiraSaida({ agente, telefone, texto: 'Recebi a tarefa. O resultado aparecerá aqui quando o meu PC terminar.' });
    }
  }
  // Orçamento compartilhado entre os robôs da sala: a função na Vercel tem 60 s.
  const fim = Date.now() + 40e3;
  if (pedido === null) await IA.carregarCentral();
  if (pedido === null && IA.naNuvem()) for (const { agente } of agentes) {
    const prazo = fim - Date.now(); if (prazo < 1000) break;
    await require('../agentes/escritorio').cicloCerebro({ telefone: C.telefone(c.id, agente), prazo, rotinas: false, atribuir: false });
  }
  C.espelha(req.usuario.id);
  res.json({ id, conversa_id: c.id, digitando: C.digitando(c.id) });
});
r.get('/chat/novidades', async (req, res) => {
  const desde = numero(req.query.desde), uid = req.usuario.id, fim = Date.now() + 25000;
  let fechou = false, acorda;
  const fechar = () => { fechou = true; if (acorda) acorda(); };
  res.on('close', fechar);
  try {
    while (!fechou) {
      // Revogação de sessão/desativação também vale durante a espera.
      if (!A.usuarioDaSessao(req)) return res.status(401).json({ erro: 'Sessão expirada.' });
      C.espelha(uid);
      const lista = C.mensagens(`${C.SELECT_MSG} JOIN chat_participantes p ON p.conversa_id=m.conversa_id
        WHERE p.usuario_id=? AND m.id>? ORDER BY m.id LIMIT 80`, uid, desde);
      if (lista.length || Date.now() >= fim) return res.json({ ate: lista.length ? lista[lista.length - 1].id : desde,
        mensagens: lista, nao_lidas_total: C.total(uid) });
      await new Promise((resolve) => {
        const timer = setTimeout(done, Math.min(1000, Math.max(1, fim - Date.now())));
        function done() { clearTimeout(timer); acorda = null; resolve(); }
        acorda = done;
      });
    }
  } finally { res.off('close', fechar); }
});
module.exports = r;
