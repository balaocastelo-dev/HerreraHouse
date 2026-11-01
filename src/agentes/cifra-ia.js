// Cifra das chaves de IA do escritório (AES-256-GCM).
// Grava com o prefixo neutro. Leitura legada: pacotes já gravados com o prefixo anterior
// ainda abrem. Não usar esse prefixo para gravar de novo.
const crypto = require('crypto');

const PREFIXO = 'hh-escritorio-ia:';
const PREFIXO_ANTIGO = 'ruah-escritorio-ia:';

function chaveDe(prefixo, material) {
  return crypto.createHash('sha256').update(prefixo + String(material || '')).digest();
}

function cifra(material, texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chaveDe(PREFIXO, material), iv);
  const enc = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

function tentar(prefixo, material, pacote) {
  const [iv, tag, enc] = String(pacote).split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', chaveDe(prefixo, material), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

function decifra(material, pacote) {
  if (!pacote) return null;
  for (const prefixo of [PREFIXO, PREFIXO_ANTIGO]) {
    try { return tentar(prefixo, material, pacote); } catch { /* o outro prefixo */ }
  }
  return null;
}

module.exports = { PREFIXO, PREFIXO_ANTIGO, cifra, decifra };
