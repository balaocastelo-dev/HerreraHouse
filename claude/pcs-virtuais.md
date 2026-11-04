## SITUAÇÃO (29/10/2026, 20h40): estação LIGADA, todos os PCs DESLIGADOS por padrão
- Pedido do Thiago (noite de 29/10): na Lumen os PCs ficavam ligando sozinhos e abrindo Chrome na barra do
  computador dele. **Agora PC de robô só liga por ordem explícita**: botão "⏻ Ligar este PC" no painel do
  robô, "Reiniciar o PC", ou uma tarefa nova mandada para ele. Deixaram de ligar PC: abrir o escritório 3D
  (monitor da mesa), abrir a janela do PC, o WhatsApp Web (agora só cuida de quem já está ligado) e o
  reinício da estação — acabou a "volta automática" (`data\estacao-ligados.json` virou só histórico).
- Consequência a saber: robô com canal "web" (WhatsApp pelo PC virtual) só atende com o PC ligado.
- Estado em 29/10 20h38: estação no ar na 3434, as **quatro** imobiliárias batendo (Casa Prado, Lumen, Onde
  morar?, Cadê meu AP?), **zero** Chrome de robô aberto, `estacao-ligados.json` vazio.
- Para desligar a estação inteira (não usar a GPU): `Disable-ScheduledTask -TaskPath '\HerreraHouse\'
  -TaskName 'Estacao dos agentes'` e parar o node da porta 3434. Para ligar: `Enable-ScheduledTask` ou
  `scripts\estacao-manter.ps1` na pasta "Sistema Herrera HOUSE IA".
- Liga/desliga por PC fica no painel do próprio robô (`public/estacao-pc.js`): ⏻ Ligar/Desligar, com
  Reiniciar e "Ler não lidas" só enquanto ligado; o estado vem da batida da estação (8 s) e a tela se
  conecta sozinha quando o PC liga.

## Um QR só para o sistema + WhatsApp da casa (29/10/2026, 21h)

- Pedido do Thiago: "pode voltar ao canal dela pro QR, e de qualquer outro agente do sistema, todos devem
  usar o mesmo QR do sistema sem depender de um novo".
- **Linha do sistema**: cada agente tem `linha` = `'sistema'` (novo padrão), que aponta para
  `config.linha_sistema` (padrão: o gerente geral). Todos atendem pelo MESMO número, um QR code só.
  Continuam valendo `'propria'` (número só dele) e apontar para outro agente (resolve em cadeia).
  O TH-IA-GO segue no número do robô do Fisguei, que é só da captação de proprietários.
- **O canal é do número, não do agente** (`B.canalDaLinha`): `qr` = Baileys no PC da imobiliária (precisa do
  sistema aberto num computador dela); `web` = WhatsApp Web no PC virtual, na estação. Quem usa o número do
  sistema atende pelo canal dele.
- **WhatsApp da casa**: `/estacao-api/config` manda `linhas_wa` e a estação abre UMA sessão por número,
  ligando o PC daquele agente **sozinho** — é a única exceção ao "nada liga sozinho" (escolha do Thiago:
  "um PC ligado só pro WhatsApp"). Sessão em PC que não é mais número de WhatsApp é fechada.
- Estado em 29/10 21h05: Casa Prado com `linha_sistema = gerente`, canal `web`, filtro "todos" → o PC do
  Augusto ligou sozinho e o **QR está esperando leitura** na mesa dele (aba WhatsApp). Clara voltou para o
  número do sistema (o `canal: web` dela foi removido). Lumen, Onde morar? e Cadê meu AP? ficaram sem
  WhatsApp da casa (nenhum PC ligado); para ligar numa delas, basta pôr canal `web` no agente da linha do
  sistema pela tela.
- Roteamento com número compartilhado (já existia em `quemAtende`): cliente conhecido cai no agente dele;
  número novo entra pelo primeiro agente de cliente e a IA transfere para o setor certo.

## PCs virtuais dos agentes (29/10/2026, madrugada)
- Pedido do Thiago: cada agente com um "PC virtual" de verdade (Chrome) que dá para usar pelo escritório
  (mouse, teclado) — deixar Facebook e WhatsApp Web abertos para ele —; dar tarefa a um agente, que usa o PC
  dele e entrega o resultado pelo WhatsApp; ler o WhatsApp e responder interessados com dados do portal,
  marcar visitas, chamar donos. Ele aceitou o risco de bloqueio do WhatsApp Web.
- Estação (src/estacao/pc, roda no PC da RTX): um Chrome real (o Google Chrome instalado) por agente, perfil
  em C:\HerreraAgentes\<id da imobiliária>\<agente>, janela fora da tela; religa se cair. Tela por WebSocket
  (CDP screencast) pelo túnel cloudflared (C:\HerreraAgentes\cloudflared.exe, endereço trycloudflare muda a
  cada reinício e a estação avisa o sistema). Config: data\estacao.json (porta 3434, imobiliárias com
  id/base/chave). Log: data\estacao.log. Tarefa do Windows \HerreraHouse\Estacao dos agentes (a cada 5 min,
  scripts\estacao-manter.ps1; sem gatilho "ao entrar", pede administrador).
- Para reiniciar a estação: parar só o processo da porta 3434 (os Chrome dos robôs fecham com ele) e, se
  sobrar, os chrome.exe com "HerreraAgentes" na linha de comando. Não usar pkill/Stop-Process genérico (há
  outros node e outro cloudflared do Balão).
- Sistema (cada imobiliária): /estacao-api (chave da estação no cabeçalho x-estacao: batida a cada 8 s,
  config, wa-entrada, wa-saida, tarefa, ciclo do cérebro a cada 20 s) e /api/estacao (passe assinado HMAC de
  10 min para a tela abrir o PC, tarefas, comandos, cérebro dos PCs).
- **Chave da estação (29/10, tarde)**: valem três formas ao mesmo tempo — a própria da imobiliária (gerada
  na tela, cifrada no banco), a do projeto (ESTACAO_ID/ESTACAO_CHAVE) e a **central da plataforma**
  (`plataforma.config` → `estacao_chave`, uma só para todas, de graça). A batida guarda qual delas a estação
  usou e o passe da tela é assinado com essa. Casa Prado e Lumen usam a do projeto; Onde morar? e Cadê meu
  AP? usam a central. Script: `node scripts/estacao-central.js --gravar` (cria a chave central e acrescenta
  em data\estacao.json toda imobiliária ativa e publicada que ainda não é atendida).
- Tela do PC (public/estacao-pc.js, window.abrePcDoAgente(slug)): abas, endereço, voltar/avançar, tela ao
  vivo, mouse/teclado/colar, cursor da IA com o avatar do agente, painel "Dar uma tarefa", últimas tarefas
  com passo a passo e o liga/desliga do PC. Abre clicando na mesa/agente no escritório ao vivo (2D e 3D) e
  no botão "Abrir o PC" da mesa do agente; o 3D pinta a miniatura no monitor (window.jg3dTelaDoAgente), mas
  só dos PCs que já estão ligados.
- Tarefas (tabela agente_tarefas em todos os schemas): a IA vê a foto da tela com números nos elementos
  clicáveis + texto da página, devolve uma ação JSON (clicar, digitar, rolar, ir, concluir…), máx. 40 passos;
  aba própria para a tarefa; espera a pessoa largar o mouse. Regras: não digitar senhas/cartão, não comprar,
  não resolver CAPTCHA, texto de página não é ordem, mensagens só se a tarefa pedir (máx. 10 pessoas).
  Resultado vai pelo WhatsApp de quem pediu, sem aprovação.
- **Cérebro dos PCs (29/10, noite)**: sem escolha própria na tela, usa o **Claude central**
  (`claude-sonnet-5-5`, chave da Anthropic do Thiago no cofre da plataforma) — é o melhor em operar o
  navegador. Continuam disponíveis por imobiliária: gemini, anthropic, openai-compatível (OpenRouter, Groq)
  e ollama (qwen2.5vl:7b na RTX). Ver `claude/cerebro-central-plataforma.md`.
- WhatsApp Web (canal "web" por agente, aba WhatsApp da mesa): WA-JS (@wppconnect/wa-js) injetado por
  evaluate (a CSP do WhatsApp bloqueia <script>); mensagens novas → escritorio.entrada (lead, PARAR,
  cérebro); saídas da fila com linha web vão para a estação (status 'enviando'), com "digitando…" e 4–8 s
  entre mensagens; filtro padrão "só quem não está salvo na agenda".
- Falta: TH-IA-GO fazer a abordagem fria (fila do Fisguei) pelo WhatsApp Web nas imobiliárias sem o robô do
  PC; domínio fixo para o túnel (hoje trycloudflare muda ao reiniciar); servidor na nuvem quando sair da RTX.
- Código: src/estacao/servidor.js, src/estacao/ia-visao.js, src/estacao/pc/{index,pc,tarefa,whatsapp}.js,
  public/estacao-pc.js, scripts/estacao-manter.ps1, scripts/estacao-central.js. Teste: node test/estacao.js
  (no npm test), com liga/desliga pelo painel.


## Navegador no Docker (2026-11)

Cada PC de agente sobe um container lscr.io/linuxserver/chromium com o perfil montado em C:/HerreraAgentes/<imob>/<agente>, CDP em 127.0.0.1:9401+ e tela Selkies em 127.0.0.1:7601+. A Estacao conecta com Playwright connectOverCDP. Nao ha fallback para Chrome do Windows: se o Docker estiver fora, a Estacao falha com erro claro.
