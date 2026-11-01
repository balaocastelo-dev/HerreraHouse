// Repositório GitHub do código e dos ramos de conteúdo da plataforma (Corretor do Futuro).
// PLATAFORMA_REPO troca o padrão. O plano de levar o código para esse repositório está em docs/PLANO-CENTRALIZACAO.md.
const REPO = process.env.PLATAFORMA_REPO || 'balaocastelo-dev/Corretordofuturo.app';
const RAW = `https://raw.githubusercontent.com/${REPO}`;
const GIT = `https://github.com/${REPO}.git`;
const CONTEUDO_VAZIO = `${RAW}/refs/heads/plataforma/conteudo-vazio`;

module.exports = { REPO, RAW, GIT, CONTEUDO_VAZIO };
