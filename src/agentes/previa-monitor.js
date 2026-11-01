// Dados mínimos para a textura do monitor; nunca devolve cadastro, telefone ou nome do cliente.
const { one, all } = require('../db');
const efetiva = "direcao IN ('entrada','saida') AND (direcao='entrada' OR status='enviada') AND telefone NOT LIKE 'teste-%'";
const regexLiteral = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const regexNome = (s) => regexLiteral(s.normalize('NFD').replace(/\p{M}/gu, '')).replace(/\p{L}/gu, '$&\\p{M}*');
function ultimas(slug) {
  const conversa = one(`SELECT telefone FROM agente_mensagens WHERE agente=? AND ${efetiva} ORDER BY id DESC LIMIT 1`, slug);
  if (!conversa) return [];
  const nomes = all(`SELECT DISTINCT m.nome,l.nome lead,p.nome pessoa FROM agente_mensagens m
    LEFT JOIN leads l ON l.id=m.lead_id LEFT JOIN fisguei_pessoas p ON p.id=m.pessoa_id
    WHERE m.agente=? AND m.telefone=?`, slug, conversa.telefone).flatMap((m) => [m.nome, m.lead, m.pessoa]).filter(Boolean);
  const palavras = [...new Set(nomes.flatMap((n) => String(n).trim().split(/\s+/)).filter((n) => n.length > 1 && !/^(da|de|do|das|dos)$/i.test(n)))];
  const nomeRE = palavras.length ? new RegExp(`(?<![\\p{L}\\p{M}])(?:${palavras.map(regexNome).sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}\\p{M}])`, 'giu') : null;
  return all(`SELECT texto,direcao,criado_em FROM agente_mensagens WHERE agente=? AND telefone=? AND ${efetiva}
    ORDER BY id DESC LIMIT 3`, slug, conversa.telefone).reverse().map((m) => {
    let texto = String(m.texto || '').replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[contato]')
      .replace(/\+?\d[\d\s().-]{6,}\d/g, '[contato]');
    // Aceita nomes com ou sem acentos, preservando a acentuação do restante da mensagem.
    if (nomeRE) texto = texto.normalize('NFD').replace(nomeRE, 'Cliente').normalize('NFC');
    // Apresentações e assinaturas livres também podem conter nomes fora do cadastro.
    texto = texto.replace(/(?:meu nome [ée]|me chamo|pode me chamar de|atenciosamente[, :]*)[^.!?\n]*/gi, 'Cliente');
    return { texto: texto.replace(/\s+/g, ' ').trim().slice(0, 60), direcao: m.direcao, hora: String(m.criado_em || '').slice(11, 16) };
  });
}
module.exports = { ultimas };
