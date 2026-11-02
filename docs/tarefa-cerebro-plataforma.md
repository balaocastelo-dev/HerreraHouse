# Tarefa: tela "Cérebro da plataforma" no painel do gestor (corretordofuturo.app/gestor)

Decisão do Thiago (29/10/2026): a chave do Gemini é **uma só, da plataforma**. Todas as imobiliárias usam
de graça, sem configurar nada, e o dono da plataforma vê quanto cada uma consumiu. A parte de baixo já está
pronta e no ar (commit 2d360c5): `src/plataforma/central.js`, `src/agentes/ia.js`, `plataforma.ia_uso` e a
função `plataforma.definir_ia_central(chave, modelo)`. **Falta só a tela.**

Ler antes: `src/plataforma/gestor.js` (o painel inteiro: sessão, rotas, `q()`/`um()`, páginas em HTML),
`src/plataforma/central.js`, `src/agentes/ia.js`, `docs/escritorio.md`.

## O que fazer

Nova seção "Cérebro" no painel do gestor, no mesmo visual das outras páginas de lá:

1. **Chave central**: mostra se existe (`…últimos 4 dígitos`), o modelo em uso e quando foi trocada.
   Campo para colar uma chave nova e botão "Guardar" → chama `SELECT plataforma.definir_ia_central($1,$2)`
   (nunca escreva direto em `plataforma.config`; a função é quem tem permissão). Botão "Remover" passa NULL.
   A chave **nunca** volta para o navegador: só os 4 últimos dígitos. Botão "Testar" faz uma pergunta curta
   ao Gemini com a chave central (reaproveitar a lógica de `IA.testar`, mas usando a chave central) e mostra
   ok/erro + o tempo.
2. **Modelo**: lista os modelos da chave (o mesmo endpoint que `IA.testar` já usa) e deixa escolher.
3. **Consumo**: tabela a partir de `plataforma.ia_uso` com, por imobiliária: chamadas, tokens de entrada,
   tokens de saída e erros — nas visões **hoje**, **este mês** e **mês passado**, com uma linha de total.
   Ordenar pelo maior consumo. Mostrar também um gráfico simples (barras em HTML/CSS, sem biblioteca) dos
   últimos 30 dias somando todas.
4. **Custo estimado** (opcional, só se ficar simples): preço por milhão de tokens configurável em
   `plataforma.config` (`ia_preco_entrada` / `ia_preco_saida`, em reais), para a tabela mostrar o valor
   estimado por imobiliária. Se não houver preço configurado, a coluna some.
5. **Teto de uso** (opcional, se der): campo `ia_limite_mes` em `plataforma.config`; quando o total do mês
   passar do teto, a tela avisa em vermelho. (Não bloquear nada automaticamente por enquanto.)

## Regras
- Só o gestor logado no painel da plataforma acessa; nada disso aparece para as imobiliárias.
- Nenhuma biblioteca nova; HTML gerado como o resto de `gestor.js`; textos em português.
- Não mexer em `src/agentes/ia.js` nem em `src/plataforma/central.js` além do necessário para reaproveitar
  funções (a leitura da chave pelas imobiliárias já funciona e está no ar).
- `npm test` antes de subir. Commit e push em main; resumo na seção "Resultado" deste arquivo.

## Prompt pronto para o Codex
> Leia docs/tarefa-cerebro-plataforma.md e implemente a tela "Cérebro" no painel do gestor da plataforma.
> Use a função plataforma.definir_ia_central para gravar a chave e a tabela plataforma.ia_uso para o consumo.
> A chave nunca pode voltar para o navegador (só os 4 últimos dígitos). npm test antes de subir; commit e
> push em main, mensagens em português.

## Resultado

Implementado em 30/10/2026: **Cérebro** em `/gestor/cerebro`, com acesso pela navegação do painel,
do dashboard e da projeção. Mantém o visual, a sessão do gestor e a restrição aos hosts da plataforma.

- Chave central do Gemini: estado, somente os quatro últimos caracteres, modelo e data da última
  alteração feita pelo painel. Guardar e Remover usam exclusivamente `plataforma.definir_ia_central`;
  mudar apenas o modelo preserva a chave no servidor. A troca e o evento são gravados na mesma instrução.
  Alterações anteriores à tela aparecem como **sem registro anterior**, pois não há data documentada no cofre.
- Modelos consultados no Google com paginação e filtro para geração de texto. Testar faz uma pergunta curta
  com a chave central e o modelo selecionado, informa sucesso/erro e duração, sem devolver a resposta bruta.
  Os testes são contabilizados separadamente como **Plataforma (testes)** em `plataforma.ia_uso`.
- Consumo de todos os modelos por imobiliária: Hoje, Este mês e Mês passado, horário de São Paulo,
  chamadas, tokens de entrada/saída, erros e total; ordenação pela soma de tokens. Gráfico HTML/CSS de
  30 dias, incluindo dias zerados, com números acessíveis pelo teclado e em celular.
- Nenhuma biblioteca ou migração nova. `src/agentes/ia.js` e `src/plataforma/central.js` permanecem intactos.
  Custo estimado e teto mensal, opcionais, não foram incluídos.

Validação repetida nesta revisão: **`npm test` passou**, incluindo `test/cerebro.js` (acesso, validação, gravação pela função,
preservação da chave, totais e sigilo em erros do banco, Google e JSON inválido). **`node test/cerebro-tela.cjs`
passou** no Chrome: desktop/celular, filtros, troca de chave/modelo, teste, remoção, recuperação de falha e
sessão expirada. Capturas em `data/cerebro-qa/` (fora do Git). `git diff --check` sem erros.

**Revisão em 30/10/2026:** a tela já estava implementada no commit `f248812`. A conferência dos requisitos
identificou e corrigiu uma falha no tratamento de JSON inválido: rotas como `/gestor-api/CEREBRO/CHAVE`
eram aceitas pelo Express, mas escapavam da resposta segura e podiam devolver o início da chave no erro.
A proteção agora reconhece maiúsculas e minúsculas. O teste de regressão cobre também barra final,
JSON malformado, chave enviada sem JSON e corpo acima de 200 KB, sempre com mensagem genérica em português.

Os testes usam PostgreSQL e Gemini simulados, sem acessar chaves reais. A execução contra o banco e o
Gemini de produção não foi validada nesta revisão.

**Nova conferência em 30/10/2026:** os requisitos obrigatórios já estavam implementados e foram revalidados.
Corrigida a recuperação após falha inicial do banco: ao escolher Hoje, Este mês ou Mês passado, a tela agora
recarrega também a configuração que faltou e libera o formulário de chave/modelo. Antes, o consumo voltava,
mas o formulário permanecia desabilitado. Os controles aguardam a conclusão da consulta durante a troca de período.

O teste de regressão em `test/cerebro-tela.cjs` reproduziu a falha antes da correção e passou depois dela,
preservando a verificação de recuperação pelo botão Atualizar consumo. **`npm test` passou integralmente**,
assim como **`node test/cerebro-tela.cjs`** e **`git diff --check`**. Capturas de desktop e celular conferidas.
Mantidos o uso exclusivo de `plataforma.definir_ia_central` para gravar a chave, o retorno apenas do sufixo
e a leitura do consumo em `plataforma.ia_uso`. A consulta de conferência ao Supabase foi recusada pelo
conector por falta de permissão; esta validação usa banco e Gemini simulados, sem alterar dados de produção.

**Conferência e correção em 02/11/2026:** a tela `/gestor/cerebro` já estava implementada na `main`.
Revalidados chave central, seleção e teste de modelo, consumo por imobiliária nos três períodos, total
e gráfico dos últimos 30 dias. A API em `src/plataforma/gestor.js` continua gravando a chave exclusivamente
por `plataforma.definir_ia_central` e retornando somente os quatro últimos caracteres.

Corrigida a recuperação quando **Guardar** ou **Remover** conclui no servidor, mas a consulta seguinte falha.
A tela agora invalida a configuração anterior e bloqueia o formulário até recuperar o estado atual.
**Atualizar consumo** e os filtros de período recarregam também chave/modelo nesse caso.
O teste de regressão reproduziu o problema antes da correção e passou depois, cobrindo troca e remoção,
campo de chave vazio e controles bloqueados durante a falha.

Validação: **`npm test` passou nas 20 suítes**, **`node test/cerebro-tela.cjs` passou no Chrome** e
**`git diff --check` passou**. Capturas de desktop e celular conferidas em `data/cerebro-qa/` (fora do Git).
O `rg` já instalado com o VS Code foi acrescentado apenas ao `PATH` do processo para executar a suíte.
Nenhuma dependência, migração ou alteração em `src/agentes/ia.js` e `src/plataforma/central.js`.
Custo estimado e teto mensal continuam opcionais e não foram incluídos.

Os testes usam PostgreSQL e Gemini simulados. A consulta somente de existência das tabelas/função no
Supabase foi recusada pelo conector por falta de permissão; a integração de produção não foi validada.
