# Chat interno — etapa 1

Mensagens de texto entre pessoas e os nove robôs da mesma imobiliária. Cada instalação usa seu próprio
banco/schema; o administrador da plataforma conversa em cada imobiliária usando o usuário que possui nela.
O escopo original está em [tarefa-chat.md](tarefa-chat.md), e o cérebro e os PCs virtuais em
[escritorio.md](escritorio.md).

## Onde está

| Parte | Arquivo / acesso |
| --- | --- |
| API autenticada | `src/routes/chat.js`, montada em `/api` por `server.js` |
| Participantes, não lidas, tarefas e espelhamento | `src/chat.js` |
| SQLite | Tabelas e trigger criados automaticamente no boot por `src/db-sqlite.js` |
| Postgres | `sql/chat.sql`, aplicado separadamente em cada schema |
| Tela e notificações | `public/chat.js`, integração com `public/app.js`, estilos em `public/style.css` |
| Conversa | Operação › Mensagens, `#/chat` ou `#/chat/:id`; botão Conversar nos agentes |
| Teste de integração | `test/chat.js`, incluído em `npm test` |

A tela tem caixa de entrada, busca, criação de diretas/salas, histórico e envio com Enter; Shift+Enter
quebra linha. O shell compartilha um único long polling com a tela: atualiza sino, contador, título da
aba e notificações com som. Respostas dos robôs também podem aparecer como balões no escritório 3D.

## Tabelas e invariantes

IDs de mensagens são globais dentro do banco da imobiliária. As datas são textos, com o padrão local
do SQLite ou a função `<schema>.agora()` no Postgres.

| Tabela | Colunas | Regras |
| --- | --- | --- |
| `chat_conversas` | `id`, `tipo`, `titulo`, `criado_por`, `par`, `criado_em`, `ultima_em`, `ultima_texto`, `ultima_id` | `tipo` é `direta` ou `sala`; `criado_por` referencia `usuarios`. `par` é único nas diretas e nulo nas salas. |
| `chat_participantes` | `id`, `conversa_id`, `usuario_id`, `agente`, `lido_ate`, `silenciado` | Exatamente um entre `usuario_id` e `agente`. `usuario_id` referencia `usuarios`; `conversa_id` referencia `chat_conversas`, com exclusão em cascata. `lido_ate` começa em 0; `silenciado` aceita 0/1. |
| `chat_mensagens` | `id`, `conversa_id`, `de_usuario`, `de_agente`, `tipo`, `texto`, `arquivo_id`, `agente_mensagem_id`, `criado_em` | Um remetente humano ou robô; mensagem `sistema` também permite ambos nulos. `conversa_id` tem exclusão em cascata; `de_usuario` referencia `usuarios`, e `arquivo_id`, `arquivos`. `agente_mensagem_id` é único, para não espelhar uma saída duas vezes. |

- `par` ordena as identidades (`u<id>` para pessoa, `a<slug>` para robô) e as une com `:`. Assim,
  Ana → Bruno e Bruno → Ana devolvem a mesma direta, inclusive em requisições concorrentes.
- Participantes usam PK `id` e índices únicos parciais `ux_cp_usuario` e `ux_cp_agente` sobre
  `(conversa_id, usuario_id)` e `(conversa_id, agente)`. Isso permite a alternativa pessoa/robô sem
  colocar valores nulos numa chave primária composta.
- `ix_cp_usuario` atende a caixa do usuário; `ix_cm_conversa` indexa `(conversa_id, id)`;
  `ix_cm_criado` indexa `criado_em`.
- O trigger `chat_ultima` atualiza `ultima_id`, `ultima_em` e os primeiros 240 caracteres de
  `ultima_texto` após inserir mensagem, inclusive resposta espelhada. Só avança para um ID maior.
- Uma mensagem é não lida quando `id > lido_ate` e não foi enviada pelo próprio usuário. A caixa
  e o polling não marcam leitura; abrir/buscar mensagens da conversa avança o marcador até a última
  mensagem devolvida. Consultar páginas antigas nunca faz o marcador retroceder.
- `tipo` da mensagem aceita `texto`, `audio`, `arquivo` e `sistema` no banco. A API desta etapa envia
  somente texto; áudio e anexos ficam para a etapa 2. `silenciado` está reservado no banco, sem rota
  de alteração nesta etapa.

## API

Prefixo de todas as rotas abaixo: `/api`. O navegador usa o cookie de sessão `hh_sessao` recebido
em `/api/login`; as escritas seguem a proteção de mesma origem do sistema. Sem sessão, a resposta é
`401`. Apenas participantes podem consultar ou enviar mensagens, inclusive quando o solicitante é
adm/gestor: acesso a conversa alheia (ou inexistente) retorna `403`.

Os contatos humanos são usuários ativos da base, exceto o próprio solicitante. Robôs usam os slugs
do catálogo (`B.AGENTES`) e os nomes configurados em `B.ajustes(slug).nome`. Contatos, participantes
e remetentes não incluem telefone, e-mail ou dados de clientes.

| Método e rota | Entrada | Resposta `200` |
| --- | --- | --- |
| `GET /chat/caixa` | — | `{ ate, conversas, contatos, nao_lidas_total }`. Conversas com última atividade, não lidas e participantes, ordenadas pela atividade mais recente. `par` não é exposto. |
| `POST /chat/conversas` | `{ tipo, com: [usuario_id ou slug, ...], titulo }` | `{ id, tipo, titulo, participantes }`. Cria a conversa ou devolve a direta existente; inclui o criador automaticamente. |
| `GET /chat/conversas/:id` | Opcional: `desde=<id>` **ou** `antes=<id>` | `{ conversa, mensagens, mais, participantes, digitando, nao_lidas_total }`. Até 80 mensagens por página, em ordem crescente de ID; marca leitura. |
| `POST /chat/conversas/:id/mensagens` | `{ texto }` | `{ id, conversa_id, digitando }`. Grava o texto e encaminha aos robôs participantes. As respostas dos robôs chegam pelas rotas de leitura/polling. |
| `GET /chat/novidades` | `desde=<id global>`, padrão 0 | `{ ate, mensagens, nao_lidas_total }`. Até 80 mensagens novas das conversas do usuário; espera até 25 segundos se não houver nenhuma. |

Exemplos de corpos para criar conversas:

```json
{ "tipo": "direta", "com": [12] }
```

```json
{ "tipo": "direta", "com": ["apartamentos"] }
```

```json
{ "tipo": "sala", "titulo": "Reunião de vendas", "com": [12, 15, "apartamentos", "casas"] }
```

`com` aceita até 100 entradas, com IDs numéricos ou strings numéricas e slugs de robôs. Duplicatas e
o próprio criador são descontados ao validar o conjunto: uma direta precisa de exatamente outro
contato; uma sala precisa de pelo menos outro contato e título não vazio (limitado a 100 caracteres).
Usuário comum só pode selecionar pessoas ativas. Adm/gestor também pode selecionar usuários inativos
existentes na base, embora eles não apareçam na lista de contatos.

`texto` é aparado e deve ter de 1 a 4.000 caracteres. Se começar com `tarefa:`, o pedido depois do
prefixo precisa ter ao menos 8 caracteres. Tipo/contato/texto inválido, cursor inválido ou combinação
de `desde` e `antes` não nulos retorna `400`, com `{ erro }`.

Cada mensagem devolvida contém `id`, `conversa_id`, `de_usuario`, `de_agente`, `tipo`, `texto`,
`arquivo_id`, `criado_em` e `remetente`. Um contato/remetente humano tem `usuario_id`, `agente: null`,
`nome`, `foto: null` e `iniciais`; um robô tem `usuario_id: null`, `agente`, `nome` e
`foto: "/plataforma/agentes/<slug>.jpg"`. Participantes acrescentam `lido_ate` e `silenciado`.
`digitando` é uma lista de slugs com entradas ainda não processadas, não uma garantia de que a IA
esteja executando naquele instante.

### Histórico e long polling

1. Carregar `/chat/caixa` e guardar `ate` como cursor global inicial. Ele é obtido antes da consulta
   da caixa para não perder mensagens recebidas durante essa leitura.
2. Abrir a conversa sem cursor para receber as últimas 80 mensagens. Se `mais` for verdadeiro,
   buscar páginas anteriores com `antes=<id da primeira mensagem da página>`.
3. Manter uma requisição a `/chat/novidades?desde=<ate>`. A rota verifica novidades aproximadamente
   a cada segundo e entrega apenas mensagens de conversas em que o usuário participa, inclusive as
   enviadas por ele em outra aba.
4. Ao receber, atualizar o cursor com o `ate` devolvido e iniciar a próxima espera. Não calcular
   `ate + 1`: o filtro já é `id > desde`. Se vierem 80 mensagens, a próxima consulta entrega o restante.
5. Atualizar a conversa aberta com `GET /chat/conversas/:id?desde=<último id exibido>`; repetir
   enquanto houver `mais`. É essa consulta que marca leitura, não a notificação.

Ao terminar 25 segundos sem novidades, a resposta tem `mensagens: []`, o mesmo `ate` recebido e o
contador atual. Logout, expiração de sessão ou desativação durante a espera retorna `401`; o cliente
deve interromper o polling e pedir novo login. Fechar a conexão encerra a espera no servidor.
O limite da função na Vercel é 60 segundos. Não há Supabase Realtime nem chave `anon` no navegador.

## Fluxo dos robôs e tarefas

1. Enviar texto grava a mensagem humana e chama `B.registraEntrada` para **cada** robô participante,
   com `linha: "chat"`, nome do remetente, endereço interno `chat-<conversa_id>-<slug>` e
   `wa_id: "chat-m-<mensagem_id>-<slug>"`. Esse endereço não é um número de WhatsApp.
2. A rota carrega a configuração central da IA. Havendo IA na nuvem (`IA.naNuvem()`, atualmente
   Gemini ou Claude), chama `cicloCerebro` para cada endereço, com `rotinas: false` e
   `atribuir: false`. Os robôs da sala compartilham um orçamento de 40 segundos; trabalho pendente
   fica para outro ciclo. Sem chave na nuvem, a entrada aguarda o ciclo do PC com a IA local.
3. O cérebro vincula a entrada ao usuário ativo que realmente enviou a mensagem e participa da
   conversa. O chat interno não cria um cliente no CRM. A resposta passa por `B.enfileiraSaida`,
   que reconhece o endereço de chat e grava a saída como `enviada`, sem enviá-la pelo WhatsApp.
4. `C.espelha` copia saídas `enviada`/`aprovada` de `agente_mensagens` para `chat_mensagens`, desde
   que o endereço corresponda à conversa e o robô participe dela. Guarda `agente_mensagem_id`
   único e usa `ON CONFLICT DO NOTHING` para impedir duplicação entre abas ou instâncias.
   Rascunhos `aprovar`, entradas, conversas de clientes e robôs alheios à conversa ficam de fora.
5. O espelhamento roda na caixa, na leitura da conversa, após enviar, em cada consulta do long
   polling e ao final do ciclo do cérebro. A inserção dispara o mesmo trigger de última atividade
   e entra na contagem de não lidas como qualquer mensagem de outro participante.

Pedidos iniciados com `tarefa:` criam `agente_tarefas` para cada robô da conversa, com `criado_por`,
`para_nome` e `para_telefone` apontando para o remetente e o endereço interno do chat. O pedido é
limitado a 3.000 caracteres; a entrada é marcada processada e o robô confirma que o resultado virá
quando o PC terminar. Esse caminho não precisa consultar a IA para criar a tarefa.

O cérebro também pode delegar com a ação `tarefa_pc` ou uma resposta iniciada por `tarefa:`. Ao
concluir, a estação registra o resultado por `POST /estacao-api/tarefa/:id`, usando a autenticação
própria da estação, e enfileira a mensagem de conclusão para o mesmo endereço. O espelhamento a
entrega na conversa. Criar a tarefa não liga nem executa um PC: a estação precisa estar configurada
e disponível, conforme [escritorio.md](escritorio.md).

Por exemplo, enviar a `POST /api/chat/conversas/:id/mensagens`:

```json
{ "texto": "tarefa: Prepare o resumo dos imóveis para a reunião" }
```

Numa sala com `apartamentos` e `casas`, isso cria duas tarefas com o remetente registrado como
criador, e cada robô confirma o recebimento. A estação retira as tarefas em
`POST /estacao-api/batida` e envia a conclusão a `POST /estacao-api/tarefa/:id`, com o cabeçalho
`x-estacao` e o corpo `{ "concluir": { "resultado": "Resumo pronto para a reunião." } }`.
O resultado aparece como mensagem do robô **na sala de origem**, conta como não lido e não vai
para a conversa direta com o mesmo robô nem para a fila de envio do WhatsApp. Quem não participa
da sala recebe `403` também ao tentar enviar `tarefa:`, sem criar tarefa.

## Aplicar `sql/chat.sql` em cada schema

No SQLite não há aplicação manual: iniciar o backend cria as estruturas. No Postgres, aplicar o
arquivo depois das migrações base e de `sql/escritorio.sql` **em cada schema**. Devem existir
`usuarios`, `arquivos`, `agente_mensagens`, a função `<schema>.agora()` e o papel `<schema>_app`.
Para tarefas, o escritório também deve ter `agente_tarefas`.

O arquivo original usa o schema `base` e o papel `base_app`. No SQL Editor do banco, ou numa cópia do arquivo para
execução com `psql`, preparar cada versão conforme esta tabela:

| Imobiliária / schema | Substituir `base` por | Substituir `base_app` por |
| --- | --- | --- |
| Molde (base comum) | `base` (original) | `base_app` (original) |
| ONDEMORAR | `ondemorar` | `ondemorar_app` |
| Cadê Meu AP | `cademeuap` | `cademeuap_app` |
| Casa Prado | `casaprado` | `casaprado_app` |
| Lumen | `lumen` | `lumen_app` |

1. Usar uma conexão administrativa capaz de criar tabelas, funções, triggers e políticas e conceder
   os privilégios necessários. O papel de execução da aplicação não é o executor da migração.
2. Abrir uma cópia completa de `sql/chat.sql`. Para outro schema, substituir **todas** as ocorrências
   de `base_app` pelo papel desejado e depois `base` pelo schema desejado. Não basta trocar o
   `search_path`: defaults, função, corpo do trigger, políticas e concessões também têm referências.
3. Executar o bloco inteiro, de `BEGIN` a `COMMIT`, uma vez por linha da tabela. Por exemplo, com
   a conexão administrativa já configurada no `psql`, a versão original do schema `base` pode ser aplicada
   a partir da raiz do repositório com:

   ```powershell
   psql -v ON_ERROR_STOP=1 -f sql/chat.sql
   ```

   Para as demais imobiliárias, executar a cópia adaptada. O arquivo é reexecutável: usa criação
   condicional das tabelas/índices e recria função, trigger e políticas. Se houver erro dentro da
   transação no SQL Editor, executar `ROLLBACK`, corrigir a dependência e executar o bloco completo.
4. Conferir no schema escolhido as três tabelas, os índices e o trigger `chat_ultima`. A consulta
   abaixo deve retornar três linhas, todas com `relrowsecurity`, `pode_ler` e `pode_inserir` iguais
   a `true`; trocar tanto `base` quanto `base_app` ao verificar outra imobiliária:

   ```sql
   SELECT n.nspname AS schema, c.relname AS tabela, c.relrowsecurity,
          has_table_privilege('base_app', c.oid, 'SELECT') AS pode_ler,
          has_table_privilege('base_app', c.oid, 'INSERT') AS pode_inserir
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'base'
     AND c.relname IN ('chat_conversas', 'chat_participantes', 'chat_mensagens');
   ```

   Conferir também as políticas e o trigger, substituindo `base` pelo mesmo schema:

   ```sql
   SELECT tablename, policyname, roles, cmd, qual, with_check
   FROM pg_policies
   WHERE schemaname = 'base' AND policyname = 'chat_backend'
   ORDER BY tablename;

   SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS definicao
   FROM pg_trigger t
   JOIN pg_class c ON c.oid = t.tgrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'base' AND c.relname = 'chat_mensagens'
     AND t.tgname = 'chat_ultima' AND NOT t.tgisinternal;
   ```

   A primeira consulta deve mostrar uma política por tabela, com o papel `<schema>_app`, comando
   `ALL` e condições `true`. A segunda deve mostrar um trigger habilitado (`tgenabled = 'O'`),
   `AFTER INSERT`, chamando a função `chat_atualiza_ultima` do schema escolhido.

5. Conferir que o deploy de cada imobiliária conecta ao banco/schema e papel correspondentes.
   Entrar no sistema, abrir Mensagens, enviar texto a um colega/robô e conferir caixa e não lidas.

O SQL habilita RLS, revoga acesso às tabelas de `PUBLIC`, `anon` e `authenticated`, concede CRUD ao
papel específico do backend, cria a política `chat_backend` para esse papel e concede uso/leitura
das sequências. A API aplica a autorização por participante usando `req.usuario`. Os usuários do
sistema não são usuários do Supabase Auth; não adicionar uma chave pública ao front para ler chat.

## Verificação

```powershell
node test/chat.js
npm test
```

O teste inicia o servidor com SQLite temporário, cria um administrador e dois corretores, mantém
sessões independentes e simula o Gemini em HTTP local. Cobre diretas únicas, salas, não lidas,
paginação, validações, contatos inativos, leitura/escrita negadas a não participantes (inclusive
adm), long polling com chegada posterior, isolamento de conversas, logout e desativação do usuário
durante a espera e resposta vazia após 25 segundos. Verifica respostas do PC e da nuvem, vários robôs na sala,
espelhamento idempotente e exclusão de rascunhos/conversas de clientes. Também cobre a sala criada
por corretor sem acesso para administrador alheio, o bloqueio de tarefas de não participantes e
o fluxo `tarefa:` com dois robôs: criação sem chamada à IA, retirada única pela estação simulada,
conclusão pela API e retorno à sala com não lidas, sem duplicação ou envio ao WhatsApp. A ação
`tarefa_pc` na resposta do robô também é verificada: preserva autoria, agente e conversa de origem,
sem recriar a tarefa ao reler a resposta. Nenhum PC real executa os pedidos do teste. Fecha
servidores e SQLite antes de remover os dados temporários, inclusive em caso de falha.

O teste automatizado usa SQLite; não aplica nem valida a migração num Postgres real. A aplicação
por schema e a conferência acima são passos separados da publicação do código.

## Etapas seguintes — pendentes no escopo do chat

2. Voz gravada com MediaRecorder, armazenamento em `arquivos`/`agente_midias`, player e anexos
   de fotos/PDFs.
3. Chamadas de voz/vídeo individuais e salas de até seis pessoas por WebRTC ponto a ponto,
   sinalização pelo chat, STUN/TURN e Web Push com VAPID para abas fechadas. O limite de seis é
   para chamadas futuras; não é uma restrição atual das salas de texto.
4. Completar a integração multiusuário do escritório: presença por long polling a 2 Hz, avatares
   dos demais usuários, proximidade dos robôs para abrir conversa, mesa de reunião ligada à sala
   ao vivo e voz por proximidade. O modo andar local e os lugares clicáveis já existentes estão
   descritos em [escritorio.md](escritorio.md); não equivalem a essa presença compartilhada.
