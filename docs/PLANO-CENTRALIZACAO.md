# Plano: repositório oficial em Corretordofuturo.app

Este arquivo descreve como levar o código que hoje está em `balaocastelo-dev/ruahimoveis` (o produto no ar) para `github.com/balaocastelo-dev/Corretordofuturo.app`, que passa a ser o repositório oficial do Corretor do Futuro / Herrera HOUSE IA.

Não executa a mudança. Não faz force-push, não troca o deploy da Vercel e não apaga o repositório antigo.

## Situação

- O que está no ar (vitrine, gestor, tenants) sai de `ruahimoveis`, ramo `main`.
- `Corretordofuturo.app` está atrasado. Na auditoria de 2026-11-01 o último commit era `dffe9a3` (2026-10-26) e o código ainda usava a marca antiga. Não é o deploy atual.
- O padrão de `PLATAFORMA_REPO` neste código passou a ser `balaocastelo-dev/Corretordofuturo.app`. Enquanto os ramos de conteúdo não existirem lá, publicar portal, blog ou bairros e criar imobiliária nova apontam para o lugar errado. Dá para segurar com a variável `PLATAFORMA_REPO` no ambiente, sem mudar o código de novo.

## O que não fazer

- `git push --force` ou qualquer reescrita da `main` dos dois repositórios.
- Apagar, arquivar ou tornar privado `ruahimoveis` neste passo.
- Trocar a conexão Git dos projetos Vercel que servem produção.
- Rodar `sql/migrar-schema-ruah-para-base.sql`, o rollback ou `sql/opcional-remover-cadastro-ruah.sql`.

## Passos

1. **Conferir a Vercel antes de abrir o PR no repositório novo.** O dono confirma que nenhum projeto de produção (apex, gestor, tenants) faz deploy automático da `main` de `Corretordofuturo.app`. Se algum fizer, desliga o deploy automático desse projeto antes do merge. Sem isso, o merge publica código.
2. **Segurar o padrão novo em produção até o passo 6.** Se este código for para a `main` de `ruahimoveis` (que a Vercel já acompanha) antes dos ramos de conteúdo existirem no repositório novo, o gestor cria projeto Vercel no repositório errado e as tarefas de portal, bairros e banco de matérias leem URL vazia ou velha. Até o passo 6, o ambiente de produção pode definir `PLATAFORMA_REPO=balaocastelo-dev/ruahimoveis`. Isso não volta a marca para a interface; só diz de qual GitHub ler e publicar.
3. **Abrir um PR normal em `Corretordofuturo.app`.** Branch novo a partir da `main` de lá (não force, não apaga a `main`). Trazer a `main` atual de `ruahimoveis` (já com este código). Se as histórias não tiverem ancestral comum, `git merge --allow-unrelated-histories` gera um merge commit e entra no PR. Conflito resolve a favor do produto atual, não do clone velho.
4. **O dono revisa e mergeia pelo botão**, merge commit, sem rebase que reescreva a `main` remota e sem force-push.
5. **Copiar os ramos de conteúdo**, cada um com push normal ou PR, nunca force:
   - `claude/portal-conteudo`
   - `claude/bairros-conteudo`
   - `plataforma/banco-materias`
   - `plataforma/conteudo-vazio`
   - qualquer outro ramo que `src/plataforma/repo.js` ou os scripts `scripts/*-publicar.mjs` leiam
   Se o ramo não existe no destino, o primeiro push cria. Se já existe com outra história, abre PR de merge.
6. **Conferir as URLs cruas** (`raw.githubusercontent.com/balaocastelo-dev/Corretordofuturo.app/refs/heads/<ramo>/...`) de uma página, um guia de bairro e a fila de matérias. Só então tirar o `PLATAFORMA_REPO` de produção, se ele tiver sido posto no passo 2, e deixar o padrão do código valer.
7. **A Vercel continua em `ruahimoveis`.** Mudar o Git de cada projeto (apex, gestor, cada tenant) é outro passo, com OK separado, de preferência num tenant de teste primeiro. O domínio não muda; muda a origem do código. Rollback é voltar a conexão para `ruahimoveis`.
8. **Não arquivar `ruahimoveis`** até o dono ver um deploy estável saindo do repositório novo e ainda ter de onde voltar.

## Riscos

- Histórias sem ancestral comum deixam o PR grande e difícil de ler. O diff contra a `main` velha mistura a marca antiga com o produto atual. A revisão tem de ser “o resultado é o código de `ruahimoveis`”, não uma mistura.
- Deploy automático esquecido no passo 1 publica o merge em produção.
- Trocar o padrão de repositório antes do passo 6 quebra publicação de conteúdo e criação de imobiliária.
- O clone velho, se alguém publicar a `main` dele como está hoje, volta a marca e o código de 2026-10-26.
- O nome `Corretordofuturo.app` tem um ponto. A busca do remoto git nos scripts de publicar escapa esse ponto (senão `.` casa qualquer caractere).
- O schema Postgres antigo pode ainda se chamar `ruah` no banco. O código reserva esse slug em `sql/plataforma.sql` e `sql/plataforma-base-comum.sql` para ninguém criar uma imobiliária com o mesmo nome. Tirar o slug do arquivo não migra o banco; só deixa de proteger a próxima vez que alguém aplicar o SQL.
- `package-lock.json` tem a sequência `RuAh` dentro de um hash `integrity` de dependência. Não é marca. Não mexer: quebra a instalação.

## Depende de OK do dono

- Confirmar que `Corretordofuturo.app` não dispara produção (passo 1).
- Abrir e mergear o PR nesse repositório (passos 3 e 4).
- Copiar os ramos de conteúdo (passo 5).
- Deixar este código na `main` que a Vercel de `ruahimoveis` já publica, sabendo do passo 2.
- Num momento seguinte, separado: apontar os projetos Vercel para o repositório novo.
- Num momento seguinte, separado: rodar a migração de schema. Há um defeito anotado abaixo; corrigir no mesmo OK, antes de rodar.
- Num momento seguinte, separado: arquivar ou apagar `ruahimoveis`.
- Quando não houver mais arquivo `data/ruah.db`, pacote cifrado com o prefixo antigo nem `condominios.fontes` com o valor antigo: apagar essas três leituras legadas (`src/db-arquivo.js`, `src/agentes/cifra-ia.js`, `src/condominios/fonte.js`).

## Defeito na migração de schema (não corrigido aqui)

Em `sql/migrar-schema-ruah-para-base.sql`, depois de trocar o texto `'ruah'` por `'base'`, a lista reservada vira `IN ('base','base','plataforma'...)`. A linha seguinte procura `IN ('base','plataforma'` para recolocar o slug antigo e não encontra esse texto. O comentário diz que o slug volta; o `replace` não casa. O rollback procura `IN ('ruah','ruah','plataforma'`, padrão que a ida não produz. Os arquivos não foram alterados: são a migração, e rodar ou reescrever isso fica para o OK do dono.
