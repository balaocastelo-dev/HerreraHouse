// Condomínio lançado no cadastro da imobiliária (não veio do CNPJ nem do mapa).
const FONTE_CASA = 'cadastro';
// Leitura legada: valor gravado em condominios.fontes antes de padronizar em "cadastro".
// Ainda conta como cadastro da casa. Não gravar de novo. A migração SQL (só com OK do dono)
// troca o valor no banco; até lá os dois significam a mesma coisa.
const FONTE_LEGADA = 'ruah';
const fonteDaCasa = (f) => f === FONTE_CASA || f === FONTE_LEGADA;

function fontesVisiveis(f) {
  if (f == null || f === '') return f;
  const partes = String(f).split(',').map((x) => (x === FONTE_LEGADA ? FONTE_CASA : x)).filter(Boolean);
  return [...new Set(partes)].join(',');
}
function apresentar(c) {
  if (c && c.fontes != null) c.fontes = fontesVisiveis(c.fontes);
  return c;
}

module.exports = { FONTE_CASA, FONTE_LEGADA, fonteDaCasa, fontesVisiveis, apresentar };
