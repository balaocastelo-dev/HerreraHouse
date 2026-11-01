// Caminho do SQLite no PC. O arquivo atual é house.db.
// Leitura legada: se house.db ainda não existe e o arquivo antigo existe, abre o antigo
// no lugar. Não copia e não apaga, para não perder o banco de quem ainda não migrou o arquivo.
const path = require('path');

const NOME_ATUAL = 'house.db';
const NOME_LEGADO = 'ruah.db';

function caminhoDoBanco(dataDir, { houseDb, existe } = {}) {
  if (houseDb) return houseDb;
  const novo = path.join(dataDir, NOME_ATUAL);
  const legado = path.join(dataDir, NOME_LEGADO);
  if (typeof existe === 'function' && !existe(novo) && existe(legado)) return legado;
  return novo;
}

module.exports = { caminhoDoBanco, NOME_ATUAL, NOME_LEGADO };
