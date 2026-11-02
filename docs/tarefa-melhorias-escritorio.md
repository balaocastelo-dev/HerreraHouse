# Tarefa: melhorias do Escritório ao vivo 3D (lote 2)

Thiago aprovou (29/10/2026) todas as sugestões abaixo. Fazer **depois** de `docs/tarefa-escritorio-interativo.md`
(mural/TV/placa clicáveis), reaproveitando o painel embutido criado lá. Ler antes: `docs/escritorio.md`,
`public/escritorio-3d.js`, `public/escritorio-jogo.js`, `public/estacao-pc.js`, `src/routes/escritorio.js`.

## 1. Todos os lugares clicáveis, com propósito
Além de mural → radar, TV → painel, placa → CRM (tarefa anterior), ligar no mesmo painel embutido:
- **recepção** → `#/visitas`; **impressora** → documentos/autorizações (a tela que lista autorizações; se não
  houver rota própria, `#/imoveis` com o filtro de autorizações); **sofá** → leads aguardando resposta
  (`#/leads` com filtro de quem está esperando); **café** → mural de avisos da equipe: uma tela simples
  (`#/avisos`) com os eventos do dia dos agentes (`agente_eventos`) e os afazeres abertos da equipe
  (`agente_afazeres`), só leitura; **mesa de reunião** → por enquanto abre o chat (`#/chat`) com aviso
  "sala de reunião ao vivo em breve".
- Cada lugar com nome, ícone e dica "Clique para abrir" no hover (as etiquetas `.j3-lugar` já existem).

## 2. Monitores com conteúdo real
- A tela de cada mesa (textura por agente em `telaPinta`) mostra a **conversa que o agente está atendendo
  agora**: últimas 3 mensagens da conversa mais recente daquele agente, **sem telefone, sem nome de cliente**
  (usar "Cliente" / iniciais), com o visual de WhatsApp que já existe. Dados: ampliar `/api/escritorio/ao-vivo?full=1`
  com `ultimas` por agente (texto cortado em 60 caracteres, direção, hora) — nada que identifique o cliente,
  e só para adm/gestor (para os outros, continua o protetor de tela atual).
- A **TV da diretoria** alterna a cada 8 s entre os números do dia (atual) e um painel "entraram hoje" com as
  fotos dos últimos imóveis cadastrados (capa via `/api/arquivos/:id` como o resto do sistema).

## 3. Tour guiado (botão "Apresentar")
- Substituir o ▶ atual por um tour com 6 paradas: entrada → sala de captação (TH-IA-GO) → salão de vendas →
  diretoria → mural → TV. Em cada parada a câmera voa, o lugar acende e aparece uma legenda em caixa HTML
  (2–3 linhas) explicando o que acontece ali. Legendas em **PT · EN · 日本語** (usar o `T`/`t()` que já existe).
- Controles: ◀ ▶ para pular parada, ESC sai, e no fim volta à órbita do modo apresentação. Começa no clique,
  nunca sozinho.

## 4. Clima e hora reais de Campinas
- Novo endpoint `GET /api/publico/clima` no servidor (sem chave): Open-Meteo
  `https://api.open-meteo.com/v1/forecast?latitude=-22.905&longitude=-47.06&current=temperature_2m,weather_code,is_day`,
  cache de 15 minutos em memória, tolerante a falha (devolve `{}`). Fetch no servidor porque a CSP do navegador
  só permite `connect-src 'self'`.
- No 3D: código do tempo vira estado do céu (limpo, nublado, chuva) somado ao horário que já existe — nublado
  baixa o sol e esbranquiça o céu; chuva adiciona gotas escorrendo no vidro da fachada (shader simples ou
  textura animada em canvas) e escurece a cidade. Nada pesado: se `prefers-reduced-motion` ou celular, só muda
  a cor. Mostrar a temperatura junto do relógio no HUD.

## 5. Som ambiente opcional
- Botão 🔊 no HUD (desligado por padrão, lembrado em `localStorage jg3d-som`). Sons **gerados por WebAudio**
  (sem arquivos): teclado baixinho contínuo quando há agentes digitando, "ding" curto quando chega ação nova,
  telefone curto quando entra lead, e um acorde suave no confete de venda. Volume baixo, respeitando
  `prefers-reduced-motion` (nesse caso não liga).

## 6. Visitante com nome
- Quando a ação é `login` (já vira "pessoa entrando pela porta"), o visitante recebe o **nome do usuário** numa
  etiqueta como a dos agentes e um personagem fixo por usuário (escolher pelo `id % n` entre os GLB disponíveis,
  usando `visitante.glb` e os personagens não usados). Ao sair do escritório, some como hoje.

## 7. Placa de ocupação
- No pilar central, abaixo da placa da imobiliária, um letreiro discreto: "N pessoas no escritório agora" com
  os primeiros nomes (até 3) de quem está logado nos últimos 5 minutos. Dado: ampliar `/api/escritorio/ao-vivo?full=1`
  com `online: [{nome}]` a partir da auditoria/sessões recentes (ou `usuarios.ultimo_acesso` se existir; se não
  existir, criar coluna atualizada no login). Só adm/gestor vê os nomes; os demais veem só o número.

## Regras
- Nada de biblioteca nova; tudo com `esc()`; CSP inalterada (o clima é buscado pelo servidor).
- Não mexer nos humanos 3D nem na API do escritório além do que está descrito.
- `npm test` antes de subir; render headless (`docs/wip/servidor-teste.cjs` + `shot3d.cjs`) nos três horários.
- Documentar cada item em `docs/escritorio.md` e escrever o resumo em "## Resultado" neste arquivo.

> Nota (29/10/2026): o painel embutido citado acima já existe — `painelLugar()`/`.j3p-*` em `public/escritorio-3d.js`
> com `<iframe src="/app.html?embutido=1#/rota">`. Reaproveitar, não criar outro.

## Resultado

Concluído em 30/10/2026, com os sete itens em commits separados na `main`, nesta ordem:

| Item | Entrega | Commit |
| --- | --- | --- |
| 1 | Painel `.j3p-*` original compartilhado entre 3D, andar e 2D; oito lugares, filtros de autorizações/espera e avisos somente leitura. | `86cd02e` |
| 2 | Três mensagens sem nomes cadastrados ou contatos nos monitores de adm/gestor; TV alterna números e imóveis do dia a cada 8 s. | `d3cbbae` |
| 3 | Apresentar com seis paradas, câmera, destaque, legendas PT/EN/日本語, navegação e ESC; termina na órbita. | `47a8de0` |
| 4 | Clima de Campinas no servidor, cache de 15 minutos, falha `{}`, relógio de São Paulo, temperatura e chuva leve; celular/movimento reduzido usam cores. | `da100fd` |
| 5 | WebAudio opcional, baixo, desligado por padrão, preferência salva; teclado, ação, lead e venda; bloqueado com movimento reduzido. | `764cc32` |
| 6 | Visitante com nome e modelo estável por usuário, fila de chegadas e descarte ao sair; agentes preservados. | `229ff61` |
| 7 | Letreiro com total de sessões recentes e até três primeiros nomes, estes apenas para adm/gestor. | `40e2b63` |

O painel foi extraído para `public/escritorio-lugares.js` para reaproveitar o mesmo iframe inclusive no 2D sem WebGL.
O modo andar conserva câmera, controles e colisões; recebeu apenas o alvo do sofá. Sem bibliotecas novas ou alteração
da CSP. O conjunto disponível de visitantes contém somente `visitante.glb`; os outros nove GLBs continuam reservados
aos agentes, sem alterações nos personagens ou nas animações.

Validação concluída:

- `npm test`: todas as suítes passaram, incluindo clima, escritório, estação e API de IA.
  A mesclagem pendente foi concluída preservando ambas as listas de testes. Os testes de estação/API foram isolados
  das chaves do ambiente, e o SQLite é fechado antes da limpeza no Windows.
- `node test/escritorio-2d.cjs`: oito cliques sem WebGL, filtros, hover, Enter/espaço, ESC dentro do iframe,
  retorno do foco, fechar por botão/fundo, tela cheia e abertura da rota inteira.
- `node test/escritorio-3d.cjs`: dia/tarde/noite, nove humanos, 21 texturas, tour e idiomas, clima, som,
  painel, modo andar, PC, reabertura e descarte; nenhum erro JavaScript/WebGL ou de recurso.
- `docs/wip/servidor-teste.cjs` + `shot3d.cjs`: capturas às 12h, 17h30 e 21h, conferidas visualmente.
  Evidências locais em `data/cenario-qa/`: `shot-dia.png`, `shot-tarde.png`, `shot-noite.png`, `lugares-2d.png`,
  `render.json` e `npm-test.log` (não versionadas).

Detalhes e comandos de reprodução em [escritorio.md](escritorio.md#melhorias-do-escritório-lote-2).

### Revalidação em 30/10/2026

Na nova conferência, os sete commits acima já estavam na `main` local e remota, cujo código estava em `f248812`.
Os itens foram revisados na ordem e não exigiram nova implementação. Foram repetidos com sucesso `npm test`,
`node test/escritorio-2d.cjs` e `node test/escritorio-3d.cjs`; o relatório 3D registrou nove humanos nos três horários,
sem erros JavaScript/WebGL ou falhas de recursos. O modo andar, o PC virtual e o painel compartilhado continuaram funcionando.

Também foram refeitas com `docs/wip/servidor-teste.cjs` + `shot3d.cjs` e conferidas visualmente as capturas de 12h,
17h30 e 21h em `data/cenario-qa/shot-{dia,tarde,noite}.png`. Os logs atualizados ficam na mesma pasta, fora do Git.
Esta revisão altera somente a documentação: registra a validação e corrige as descrições antigas do fuso horário e dos lugares.

### Conferência da main em `5f9265f` (30/10/2026)

Os sete itens foram conferidos novamente na ordem e já estavam implementados na `main` local e remota,
inclusive os oito cliques do 2D no painel compartilhado. Os arquivos de produção foram preservados.
Foi corrigida também a nota antiga em `tarefa-escritorio-interativo.md` que ainda dizia faltar essa integração.

O commit `c7cec91` corrige duas instabilidades do teste headless: o avanço automático do tour podia ocorrer
durante os cliques lentos do SwiftShader; e o iframe carregava a aplicação completa num servidor simulado sem
`/marca.js` ou sessão. O teste agora separa navegação manual e avanço automático das seis paradas e usa conteúdo
simulado no iframe, como o teste 2D, verificando também ESC com foco dentro dele. Nada mudou no tour em produção.

Validação final desta rodada:

- `npm test`: as 19 suítes passaram.
- `node test/escritorio-2d.cjs`: passou para os oito lugares sem WebGL.
- `node test/escritorio-3d.cjs`: passou, incluindo tour manual/automático, idiomas, clima, áudio, painel,
  PC virtual, modo andar, descarte, reabertura e celular; nove humanos nos três horários, sem erros ou recursos com falha.
- `docs/wip/servidor-teste.cjs` + `shot3d.cjs`: renders refeitos às 12h, 17h30 e 21h e conferidos visualmente.

Evidências locais atualizadas em `data/cenario-qa/`: `npm-test.log`, `test-2d.log`, `test-3d.log`, `render.json`,
`lugares-2d.png` e `shot-{dia,tarde,noite}.{png,log}` (fora do Git). Sem bibliotecas novas ou alteração da CSP.

### Validação da main em `0b19a9a` (30/10/2026)

Os sete itens foram revisados na ordem novamente: todos os commits de implementação já pertencem à `main`
local e remota. Os oito cliques do 2D já reutilizam o painel `.j3p-*` compartilhado. Não houve pendência de
implementação; o painel, o modo andar, os humanos, a API e as dependências foram preservados nesta rodada.

Passaram `npm test` (19 suítes), `node test/escritorio-2d.cjs` e `node test/escritorio-3d.cjs`.
O relatório confirmou nove humanos nos três horários, sem erros JavaScript/WebGL ou falhas de recursos.
As capturas de 12h, 17h30 e 21h foram refeitas com `servidor-teste.cjs` + `shot3d.cjs` e conferidas visualmente.
Os logs e imagens listados acima foram atualizados; esta rodada altera somente o registro da validação.

### Conferência e validação em 01/11/2026

Os sete itens foram conferidos na ordem na `main` em `e5c0f35`, também confirmada no remoto. Os sete commits
de implementação da tabela acima já pertenciam a essa versão, incluindo os oito cliques do 2D no mesmo painel
`.j3p-*`. Não restou pendência de implementação. Painel, modo andar, humanos, API, CSP e dependências foram preservados.

O commit `afa9c25` corrige uma falha reproduzida em `npm test`: o teste de consulta segura comparava caminhos
com `/`, mas o `rg` retorna `\` no Windows. A normalização mantém a mesma lista permitida e as mesmas verificações.
Foi usado o `rg` já instalado com o VS Code, somente no `PATH` do processo, sem nova instalação.

Validação concluída após a correção:

- `npm test`: as 20 suítes passaram, incluindo clima, escritório, estação e API de IA.
- `node test/escritorio-2d.cjs`: oito lugares sem WebGL, filtros, teclado e controles do painel aprovados.
- `node test/escritorio-3d.cjs`: aprovado; nove humanos nos três horários, nenhum erro JavaScript/WebGL ou recurso
  com falha. Tour, idiomas, clima, som, PC, modo andar, descarte, reabertura e celular continuam funcionando.
- `docs/wip/servidor-teste.cjs` + `docs/wip/shot3d.cjs`: capturas de 12h, 17h30 e 21h refeitas e conferidas visualmente.

Logs, `render.json`, `lugares-2d.png` e `shot-{dia,tarde,noite}.{png,log}` atualizados em `data/cenario-qa/`, fora do Git.
O registro de verificação e a orientação para executar os testes no Windows também foram atualizados em `docs/escritorio.md`.

### Revisão funcional a partir de `66babef` (01/11/2026)

Os sete itens já estavam implementados na `main` local e remota e foram conferidos na ordem. O teste sem WebGL
confirmou os oito cliques do 2D no painel compartilhado, inclusive filtros, teclado, ESC dentro do iframe e retorno
de foco. Painel, modo andar, humanos, CSP e dependências continuam preservados.

A revisão encontrou uma lacuna do item 2: o cadastro `Érica Souza` não ocultava `Erica` escrito sem acento na mensagem.
O commit `1183272` corrige a comparação dos nomes, incluindo Unicode decomposto, sem substituir trechos de outras
palavras nem retirar os acentos do restante do texto. A regressão reproduz a falha anterior e verifica a resposta
real de `ao-vivo?full=1`, mantendo as restrições de perfil e o limite de 60 caracteres.

Validação após a correção: `npm test` passou nas 20 suítes; `node test/escritorio-2d.cjs` e
`node test/escritorio-3d.cjs` passaram. O relatório confirmou nove humanos nos três horários e nenhum erro
JavaScript/WebGL ou recurso com falha. Também foram refeitas com `docs/wip/servidor-teste.cjs` + `docs/wip/shot3d.cjs`
as capturas de 12h, 17h30 e 21h, conferidas visualmente. Logs, `render.json`, `lugares-2d.png` e
`shot-{dia,tarde,noite}.{png,log}` estão atualizados em `data/cenario-qa/`, fora do Git.

### Conferência e validação da main em `c08bf00` (02/11/2026)

Os sete itens foram conferidos na ordem na `main` em `c08bf00`, confirmada também no remoto. Os commits de
implementação da tabela acima já pertencem a essa versão. Os oito cliques do 2D já reutilizam o painel
`.j3p-*` de `public/escritorio-lugares.js`; não restou pendência de implementação.

Passaram `npm test` (20 suítes), `node test/escritorio-2d.cjs` e `node test/escritorio-3d.cjs`. O relatório
registrou nove humanos nos três horários, sem erros JavaScript/WebGL ou falhas de recursos. Painel, filtros,
tour, idiomas, clima, som, PC virtual, modo andar, descarte, reabertura e celular passaram nas verificações.

As capturas de 12h, 17h30 e 21h foram refeitas com `docs/wip/servidor-teste.cjs` + `docs/wip/shot3d.cjs` e
conferidas visualmente. Logs, `render.json`, `lugares-2d.png` e `shot-{dia,tarde,noite}.{png,log}` foram
atualizados em `data/cenario-qa/`, fora do Git. Esta rodada altera somente o registro da validação neste
arquivo e em `docs/escritorio.md`; código, humanos, API, CSP e dependências foram preservados.
