# Escritório virtual (agentes robôs)

Tela: **Vendas > Escritório virtual** (`#/whats`). A antiga tela de WhatsApp virou **Conversas do CRM** (`#/whats/conversas`).

## Os 9 agentes

| # | Agente | Setor | Fala com |
|---|--------|-------|----------|
| 1 | TH-IA-GO | Captador de oportunidades | proprietários abordados pelo robô do Fisguei |
| 2 | Ana | Apartamentos | clientes |
| 3 | Bruno | Galpões, barracões, salas, lojas | clientes |
| 4 | Teo | Terrenos e lotes | clientes |
| 5 | Clara | Casas até R$ 2 mi | clientes |
| 6 | Helena | Alto padrão (casas acima de R$ 2 mi, apartamentos acima de R$ 3 mi) | clientes |
| 7 | Vicente | Off-market (imóveis com status off-market) | clientes |
| 8 | Augusto | Gerente geral | só o dono do portal |
| 9 | Marta | Gerente dos corretores | corretores e gestores com celular cadastrado |

Os limites de valor mudam em "Regras do escritório".

## Alma (.soul)

- Padrão no código: `src/agentes/almas/NN-<agente>.soul` (cabeçalho `---` + texto em Markdown).
- Editável na mesa do agente > **Alma (.soul)** (salva no banco, vale no PC e no link). "Voltar ao padrão" volta para o arquivo.
- O sistema junta sozinho à alma, a cada mensagem: catálogo do setor (só imóveis da imobiliária), ficha do lead, o que ele pediu no portal,
  a conversa, a data/hora e o formato da resposta (JSON com `mensagem` e `acoes`). Essa parte não fica na alma.

## Ações que os agentes usam no sistema

- Clientes: `atualizar_perfil`, `agendar_visita` (só imóvel do setor; a Marta avisa o corretor), `enviar_link` (página do portal;
  no off-market, link privado que sempre passa por aprovação), `transferir` (para outro agente de cliente), `chamar_corretor` (afazer + aviso).
- TH-IA-GO: `registrar_captacao` (interesse, fotos, melhor horário na oportunidade do Radar), `chamar_corretor`. Fotos que o dono manda
  ficam em `agente_midias` e podem ir para a pasta Fotos do imóvel quando ele for captado.
- Augusto: `criar_afazer` para um corretor. Rotinas: resumo da manhã, relatório do dia, alertas na hora. "relatório" no WhatsApp responde na hora.
- Marta: `criar_afazer`, `marcar_feito`. Rotinas: agenda da manhã, lembrete antes da visita, lead novo, proprietário que confirmou, afazer vencendo.
  "feito 12" e "agenda" respondem sem IA. Não manda nada antes das 7h nem depois das 21h.

## WhatsApp

- Cada agente conecta um número pelo QR code (mesa > WhatsApp > Conectar). Sessão em `data\whatsapp-agente-<agente>` no PC.
- Um agente pode usar o número de outro (mesa > Ajustes). O TH-IA-GO usa sempre a linha do robô do Fisguei; ninguém mais usa essa linha.
- Quem escreve num número: dono → Augusto; corretor → Marta; cliente com agente na mesma linha → esse agente; senão, o dono da linha.
- PARAR bloqueia o cliente. Lead novo do portal/blog vai para o agente do setor, que manda a primeira mensagem (se "puxar conversa" estiver ligado).

## Modos

- **Sugere e espera aprovação** (padrão dos agentes de cliente e do TH-IA-GO): resposta em "Para aprovar" e na conversa do CRM.
- **Responde sozinho** (padrão dos gerentes).

## Onde roda

- **Cérebro**: com a chave da API do Gemini em Escritório virtual › Configuração geral (`#/whats/config`), roda na NUVEM (Vercel):
  o agendador do Supabase (pg_cron + pg_net) chama `POST /escritorio-ciclo` a cada minuto com o token `escritorio_ciclo_token`,
  e o PC chama o mesmo endereço ~17 s depois de cada mensagem recebida. A conversa de teste responde na hora. Sem chave, o cérebro
  roda no PC com a IA local (Ollama `OLLAMA_MODEL`). A chave fica cifrada no banco (config `escritorio_ia`), legível no PC e no link.
- **Linhas de WhatsApp**: no PC, num processo separado do site (`src/agentes/servico.js`, aberto e reaberto pelo server.js), para que telas
  pesadas não travem o WhatsApp. Com o PC desligado, as respostas esperam na fila. (Decisão de 27/10: linhas continuam no PC por ora.)
`ESCRITORIO=0` no `.env` desliga. Tabelas: `agente_mensagens`, `agente_eventos`, `agente_afazeres`, `agente_midias` e a coluna `leads.agente`
(`sql/escritorio.sql`). Teste: `node test/escritorio.js`.

## Escritório ao vivo em 3D (`#/whats/ao-vivo`)

- `public/escritorio-3d.js` (three.js r170, `public/vendor/three`). Os 9 agentes são **humanos 3D de verdade** — personagens da
  Microsoft Rocketbox (MIT) convertidos para GLB em `public/plataforma/pessoas/<slug>.glb` (≈0,3–1,1 MB cada) e animados por
  esqueleto com dois conjuntos partilhados, `anim-m.glb` e `anim-f.glb` (sentado, digita, anda, bebe, papel, fala, acena, celular,
  pensa, respira, olhar, alonga). Quem é quem está em `public/plataforma/pessoas/LICENSE.md`. Se um GLB não carregar, entra o boneco
  estilizado antigo (`fazBoneco`).
- Estado → animação em `animaPessoa()`: andando = `anda`; parado fazendo algo = gesto do lugar (`GESTO_DO_LUGAR`: mural/impressora = papel,
  porta/recepção/reunião = fala, café = bebe, sofá = celular); sentado = `sentado`, digitando = `sentado` + mãos no teclado (procedural,
  `maosNoTeclado`), alongando = `pensa`, inativo = `respira` com a cabeça pendendo. As animações sentadas assumem uma cadeira alta:
  o corpo desce `PESSOA_Y` (−0,30 m) ao sentar; a cadeira fica `SENTA` (0,80 m) do centro da mesa.
- **Retratos** dos agentes (`public/plataforma/agentes/<slug>.jpg`, 768 px): fotos realistas geradas pelo Flux na RTX 4090 com o
  script `C:\Users\user\demo-herrera\avatares.py` (prompts combinando com o personagem 3D de cada um; `python avatares.py <slug>`
  refaz um; `VARIANTE=1` muda a semente). Os `.svg` antigos continuam na pasta como reserva.
- Para refazer os GLB: `rb/converte.py` (Blender como módulo `bpy` 5.2 + `rb/otimiza.mjs` com gltf-transform) a partir do repositório
  `microsoft/Microsoft-Rocketbox` (sparse checkout só dos personagens usados). O conversor re-amostra as animações do Rocketbox pelas
  matrizes locais absolutas (o descanso dos arquivos de animação não é a A-pose) e deixa só rotações + posição do Pelvis.

### Cenário fotográfico (29/10/2026)

- **Materiais e móveis:** piso e tampos de carvalho, nogueira, reboco, concreto, mármore, tecidos e tapetes com cor sRGB e
  normal maps tangentes RGB. Cantos arredondados nos tampos e estofados, cadeiras com braços e rodízios, canecas, teclados,
  luminárias e plantas recortadas. A laje termina 2 cm abaixo do piso para evitar sobreposição ao aproximar a câmera.
- **Texturas:** 21 JPGs em `public/plataforma/cenario/`, total de 1.731.693 bytes (1,73 MB). São nove cores em 1024² (qualidade 86),
  nove normais em 512² e três panoramas em 2048×768 (qualidade 84), gerados a partir dos PNGs do Flux.
  `python scripts/preparar-cenario.py C:/Users/user/demo-herrera/cenario` refaz os arquivos com Pillow/numpy: corrige a iluminação
  ampla, espelha para repetir sem cortes e calcula normais por Sobel sobre luminância desfocada. Provas repetidas 2×2 e métricas
  ficam em `data/cenario-qa/`. `server.js` aplica cache de **7 dias** a essa pasta, como aos humanos e ao three.js;
  `vercel.json` repete a regra para os arquivos estáticos servidos diretamente pela Vercel.
- **Cidade e horário:** céu físico `Sky`, sol direcional e panorama cilíndrico atrás da fachada (`-z`), com transições entre dia,
  tarde e noite, estrelas e luz nas janelas. Os prédios próximos deixam o horizonte fotográfico visível; o chão externo fica
  abaixo da imagem para não cortá-la. Horários seguem Campinas (`America/Sao_Paulo`), independentemente do fuso do navegador
  (dia 6h30–16h30; tarde 16h30–19h e 5h30–6h30). O clima real modula essas cenas, conforme o lote 2 abaixo.
- **Efeitos:** `RenderPass → GTAOPass → UnrealBloomPass → OutputPass`, render target HDR com até 4 amostras MSAA, ACES e exposição
  aplicada por `E.exposicao`. Bloom: threshold 0,9, strength 0,3, radius 0,4. Ambiente HDR reduzido a 0,2 para preservar os materiais.
  Sombra solar em 4096 px no desktop e 2048 no celular, limitada à capacidade da GPU. O GTAO usa meia resolução e ignora vidros,
  caixas de clique e planos recortados. No celular (até 720 px) não é criado; abaixo de 25 fps nos primeiros 3 segundos de medição,
  é desativado automaticamente. Bloom e OutputPass continuam ativos.
- **Ciclo de vida:** redimensionamento atualiza composer/GTAO; sair da tela descarta passes, render targets, sombras, texturas e
  materiais. O 3D pode ser reaberto após o 2D. O balão inicial do 2D verifica se ainda pertence à cena aberta antes de aparecer.
  GLBs, animações, posições dos humanos, API, HUD e ganchos dos PCs virtuais continuam os mesmos.

### Andar pelo escritório e lugares clicáveis (29/10/2026)

- **Andar (tipo Roblox):** botão 🚶 no HUD (`public/escritorio-andar.js`, carregado por `import()` só quando alguém entra).
  Câmera em terceira pessoa atrás do visitante (`visitante.glb`), **W A S D** ou setas, **Shift** corre, arrastar o mouse
  olha em volta, joystick na tela no celular. Colisão por círculos e caixas montadas a partir de `MESAS`, `LUGAR` e `SALA`
  (mesas, cadeiras, sofá, balcão, paredes e vidro), com empurrão em 3 iterações — não se atravessa nem se sai da sala.
  Ao lado de um agente aparece a dica **E · Falar com <nome>** (abre o PC dele ou o chat); em cima de um lugar, **E · Abrir**.
  Sair pelo mesmo botão ou por ESC; a órbita volta como estava.
- **Lugares clicáveis:** caixas invisíveis (`MAT.hit`, `E.cliques`) no mural, TV da diretoria, placa do salão, recepção,
  impressora, sofá, café e mesa de reunião, com `userData = { tipo: 'lugar', lugar }`; `acerta()` as inclui,
  o cursor vira a mãozinha e a etiqueta HTML `.j3-lugar.clicavel` mostra "Clique para abrir".
  Clique simples (ou duplo, ou **E** no modo andar) abre o **painel do lugar** (`.j3p-fundo`, fechado por ✕, ESC
  ou clique fora) com a **tela real do sistema** num `<iframe src="/app.html?embutido=1#/rota">`:

  | Lugar | Tela |
  | --- | --- |
  | Mural de oportunidades | `#/radar` |
  | TV da diretoria | `#/painel` |
  | Placa do salão de vendas | `#/leads` (CRM) |
  | Recepção | `#/visitas` |
  | Impressora | `#/imoveis?autorizacoes=1` |
  | Sofá | `#/leads?aguardando=1` |
  | Café | `#/avisos` |
  | Mesa de reunião | `#/chat`, com aviso de sala ao vivo em breve |

  O botão ↗ no cabeçalho do painel abre a mesma tela inteira, fora do 3D.
- **Modo embutido** (`/app.html?embutido=1#/rota`, `EMBUTIDO` em `public/app.js`): a mesma sessão e as mesmas telas, sem
  menu lateral, sem barra do topo, sem sino do chat e sem o aceite da LGPD (isso fica na janela de fora). A CSP passou a
  permitir `frame-src 'self'` e `frame-ancestors 'self'` (`X-Frame-Options: SAMEORIGIN`): só a própria origem se embute.

### Melhorias do escritório (lote 2)

1. **Lugares com propósito:** o painel `.j3p-*` original foi extraído para `public/escritorio-lugares.js`,
   compartilhado pelo 3D, modo andar e 2D, inclusive sem WebGL. Mantém iframe, ESC, fechar e tela inteira.
   Mural → Radar; TV → Painel; placa → CRM; recepção → Visitas; impressora → Carteira com filtro de
   autorizações (pendentes, assinadas ou aguardando); sofá → leads cuja última mensagem efetiva é de entrada;
   café → `#/avisos` (eventos de hoje e afazeres abertos, somente leitura, respeitando o acesso do corretor);
   reunião → Chat com aviso de sala ao vivo em breve. Ícone, nome e dica nos lugares, clique e teclado nos dois modos.
2. **Monitores e TV:** `ao-vivo?full=1` entrega `ultimas` apenas a adm/gestor: as três mensagens efetivas da conversa
   mais recente, em ordem, com direção, hora e texto de até 60 caracteres. Testes, notas e saídas ainda não enviadas
   ficam fora; nomes cadastrados (com ou sem acentos, inclusive em Unicode decomposto), telefones, e-mails e links
   são removidos no servidor, preservando palavras inteiras e a acentuação do restante da mensagem. Os demais perfis mantêm o
   protetor de tela. O gancho do PC virtual continua tendo prioridade. A TV alterna a cada 8 segundos entre os números
   e os três últimos imóveis cadastrados hoje, com capas autenticadas de `/api/arquivos/:id`, filtradas por acesso.
3. **Apresentar:** inicia exclusivamente pelo botão; seis paradas (entrada, captação, vendas, diretoria, mural e TV),
   com voo, luz e marca no chão, legendas PT/EN/日本語 e 9 segundos por parada. ◀/▶ ou setas pulam etapas;
   ESC encerra. Ao completar, volta à órbita de apresentação. Abrir lugar, PC ou modo andar encerra o tour;
   movimento reduzido aplica a câmera imediatamente. Não altera humanos, animações ou colisões.
4. **Clima de Campinas:** `/api/publico/clima` consulta Open-Meteo no servidor, sem chave, com timeout de 5 segundos,
   cache em memória de 15 minutos (inclusive falhas) e compartilhamento de requisições simultâneas. Falhas devolvem `{}`.
   O relógio usa `America/Sao_Paulo` independentemente do navegador; a temperatura aparece junto dele. Códigos da
   [Open-Meteo](https://open-meteo.com/en/docs) modulam sol, céu e cidade sem substituir o ciclo dia/tarde/noite.
   Chuva usa um canvas 256² compartilhado por dois vidros, limitado a 12 fps. Celular e movimento reduzido só mudam
   cores; recursos e intervalo são descartados ao sair. CSP e dependências permanecem as mesmas.
5. **Som opcional:** botão 🔇/🔊, inicialmente desligado, preferência `jg3d-som`. O contexto WebAudio só abre após
   gesto do usuário. Ruído filtrado produz teclas quando agentes digitam; osciladores geram ding de ação, telefone
   de lead e acorde junto ao confete de venda. Volume baixo, sem arquivos, sem sons no histórico inicial ou na aba
   oculta. Movimento reduzido impede ativação e silencia imediatamente. Sair fecha contexto, fontes e intervalo.
6. **Visitantes com nome:** a ação `login` entrega `{visitante: {id, nome}}` para adm/gestor, sem IP. A etiqueta
   segue a cabeça como a dos agentes (e também aparece no 2D). O modelo é escolhido por `id % n` no conjunto de
   GLBs disponíveis não reservados aos agentes. Hoje esse conjunto contém somente `visitante.glb`; os nove humanos
   dos agentes ficam intactos. Logins simultâneos aguardam em fila. Ao terminar ou fechar a cena, a etiqueta e os
   materiais próprios do visitante são removidos, sem afetar o visitante do modo andar.
7. **Ocupação:** letreiro discreto abaixo da marca no pilar central, com total e até três primeiros nomes.
   `ao-vivo?full=1` retorna `online_total` a todos e `online: [{nome}]` somente a adm/gestor. Conta usuários ativos
   com sessão válida e atividade na auditoria nos últimos cinco minutos. O escritório renova `escritorio.presenca`
   no máximo uma vez por minuto; logout e sessão expirada retiram a pessoa. Usa as tabelas existentes, sem migração.

### Verificação

Última validação: `main` em `c08bf00`, confirmada também no remoto, em 02/11/2026. Os sete itens foram conferidos
na ordem e já estavam implementados, inclusive os oito cliques do 2D no painel compartilhado. Não houve alteração
no código de produção. As 20 suítes de `npm test`, os testes 2D/3D e os renders de 12h, 17h30 e 21h passaram.
As três capturas foram conferidas visualmente; o relatório 3D registrou nove humanos por horário, sem erros
JavaScript/WebGL ou de recursos. Painel, modo andar e PC virtual passaram nas verificações.
O registro está em [Resultado da tarefa](tarefa-melhorias-escritorio.md#resultado).

```powershell
npm test
node test/escritorio-2d.cjs
node test/escritorio-3d.cjs
```

`npm test` requer `rg` no `PATH`. Nesta validação foi usado o executável já instalado com o VS Code, acrescentando
sua pasta somente ao `PATH` do processo, sem instalar dependências.

O teste 2D verifica os oito lugares sem WebGL, dicas, clique, Enter/espaço, ESC dentro do iframe, retorno de foco,
fechamento por botão/fundo e painel em tela cheia. Os filtros das rotas são preservados ao abrir a tela inteira.

O teste 3D inicia sozinho o servidor local com API simulada, usa `playwright-core` e Chrome instalado com SwiftShader,
aguarda os nove humanos e todas as texturas, captura dia/tarde/noite, detalhe e celular, e verifica câmera, HUD, monitor externo,
duplo clique, painel, modo andar, tour nos três idiomas, clima, som, descarte, reabertura 3D/2D, redimensionamento e redução automática do GTAO. `CHROME_PATH` permite outro executável
Chromium. Capturas e `render.json` ficam em `data/cenario-qa/` (fora do Git). FPS de SwiftShader é uma medida do renderizador por
software, não um benchmark de GPU do usuário.

Nos testes do tour, o prazo automático fica pausado durante os cliques e a troca de idiomas, pois o SwiftShader
pode levar mais de nove segundos nessas interações. O avanço por prazo é conferido separadamente nas seis paradas,
incluindo o retorno à órbita. Essa instrumentação fica só no teste; a duração do tour em produção continua igual.
Os testes 2D e 3D usam conteúdo simulado no iframe e verificam ESC com o foco dentro dele. O servidor de render
não fornece sessão nem `/marca.js`; as APIs das telas são verificadas pela suíte `npm test`.

Para explorar manualmente: `node docs/wip/servidor-teste.cjs` serve `http://127.0.0.1:8766/teste-3d.html`. O parâmetro `quiet=1`
pausa a atividade espontânea para comparar imagens. Só esse servidor expõe `window.__clima(hora, true)` para testar horários;
produção continua seguindo o relógio. O comando `node docs/wip/shot3d.cjs URL ARQUIVO.png 6000` faz uma captura avulsa.
Com o servidor local aberto, as três capturas obrigatórias usam a mesma câmera:

```powershell
node docs/wip/shot3d.cjs 'http://127.0.0.1:8766/teste-3d.html?quiet=1' data/cenario-qa/shot-dia.png 1000 '0,9,19,0,0.9,-0.5' 12
node docs/wip/shot3d.cjs 'http://127.0.0.1:8766/teste-3d.html?quiet=1' data/cenario-qa/shot-tarde.png 1000 '0,9,19,0,0.9,-0.5' 17.5
node docs/wip/shot3d.cjs 'http://127.0.0.1:8766/teste-3d.html?quiet=1' data/cenario-qa/shot-noite.png 1000 '0,9,19,0,0.9,-0.5' 21
```

Publicação: commits pequenos em `main` e `git push origin main`, que aciona os projetos ligados ao repositório na Vercel.
Conferir o deploy e `https://ondemorar.corretordofuturo.app/#/whats/ao-vivo` com sessão autenticada.
