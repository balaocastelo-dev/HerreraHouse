# Catálogo da API — Herrera HOUSE IA

Tudo que o sistema faz pela tela, faz também pela API. Este documento é o mapa completo: como entrar,
o que cada rota faz, o que ela recebe, o que devolve e o que muda no mundo quando você a chama.

- **Endereço (`$BASE`)**: o endereço da imobiliária — `https://<imobiliária>.corretordofuturo.app`
  (no PC: `http://localhost:3333`). O painel da plataforma fica em `https://corretordofuturo.app`.
- **Formato**: JSON em tudo, menos as páginas públicas (HTML), as fotos e os PDFs.
- **Erro**: sempre `{"erro":"explicação em português"}` com o status HTTP certo.
- **Fuso e datas**: texto `AAAA-MM-DD` ou `AAAA-MM-DD HH:MM:SS`, horário de São Paulo.
- Atualizado em 31/10/2026. Gerado a partir do código: `src/routes/*`, `src/api-ia/*`, `src/plataforma/*`, `src/estacao/*`.

---

## 1. Como uma IA entra no sistema

Há três portas. A primeira é a nova e é a que interessa a robôs e IAs.

### 1.1 Chave de API (robôs, IAs, integrações)

Mande o cabeçalho em **qualquer** rota `/api/...`:

```bash
curl -H "Authorization: Bearer hh_1a2b3c4d_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
     "$BASE/api/ia/manifesto"
```

`x-api-key: hh_...` também funciona, para clientes que não mandam `Authorization`.

A chave **sempre pertence a um usuário do sistema**: ela não cria permissão nova, só empresta (ou diminui)
a que o usuário já tinha. Um corretor com chave continua vendo só os imóveis e leads dele.

**Como criar a primeira chave**

| Jeito | Comando |
|---|---|
| Pela tela (só administrativo) | Sistema › Configurações › Chaves de API (`#/configuracoes`) — a chave aparece uma única vez, com botão Copiar |
| Pelo PC | `node scripts/api-chave.js "Claude" "*"` — mostra a chave uma única vez |
| Pela API (já logado ou com outra chave) | `POST /api/chaves` |
| Listar / revogar pelo PC | `node scripts/api-chave.js --listar` · `--revogar <id>` |

```bash
curl -s -X POST "$BASE/api/chaves" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' \
  -d '{"nome":"Robô do Instagram","escopos":["conteudo"],"limite_min":120,"dias":90}'
# { "id": 3, "chave": "hh_9f8e7d6c_...", "prefixo": "9f8e7d6c", "escopos": ["conteudo"],
#   "aviso": "Guarde a chave agora: ela não aparece de novo." }
```

O banco guarda só o **hash** da chave (SHA-256). Perdeu, cria outra.

**Campos da chave**

| campo | tipo | padrão | o que faz |
|---|---|---|---|
| `nome` | texto | — | só para você reconhecer depois |
| `usuario_id` | número | quem criou | de quem a chave empresta as permissões |
| `escopos` | lista ou `"*"` | `*` | partes do sistema que a chave alcança (tabela abaixo) |
| `somente_leitura` | sim/não | não | bloqueia POST, PUT, PATCH e DELETE |
| `limite_min` | número | 300 | chamadas por minuto (10 a 3.000) |
| `ips` | lista | — | só aceita desses endereços de IP |
| `dias` | número | sem prazo | vencimento da chave |

**Escopos**

| escopo | alcança |
|---|---|
| `imoveis` | carteira, arquivos, autorizações, links off-market, Drive |
| `crm` | leads, visitas, WhatsApp do CRM, chat interno |
| `captacao` | radar, Fisguei, vitrines da base, mercado, fachadas |
| `condominios` | base de condomínios, prédios, 3D |
| `conteudo` | portal, blog, guias de bairro, redes e publicações |
| `escritorio` | agentes robôs, PCs virtuais, estação |
| `painel` | painéis, números, auditoria, rotas `/api/ia/*` |
| `config` | usuários, integrações, LGPD, chaves de API, configurações |
| `plataforma` | reservado ao gestor da plataforma. Na tela, a caixa só aparece para ele; pela API, quem não é gestor da plataforma recebe 403 ao pedir esse escopo. O painel (`/gestor-api/*`) tem login próprio (tabela `plataforma.gestores`, cookie `gestor_sessao`) e **ainda não abre por chave de API** |
| `sql` | `/api/ia/esquema` e `/api/ia/consulta` |

**Erros próprios da chave**

| status | quando |
|---|---|
| 401 | chave inválida, revogada, vencida, ou usuário desativado |
| 403 | escopo faltando · IP não autorizado · chave somente de leitura tentando escrever |
| 429 | passou do limite por minuto |

Toda chamada com chave fica registrada em `api_log` (método, caminho, status, tempo, IP) e o uso da chave é
contado em `api_chaves`. Veja em `GET /api/chaves/log`.

### 1.2 Sessão do navegador (as telas)

`POST /api/login` grava o cookie `hh_sessao` (12 horas). É o que as telas usam. Escrita exige mesma origem (CSRF).

### 1.3 Entradas próprias de robô (não usam chave de API)

| porta | quem entra | como |
|---|---|---|
| `/fisguei-api/*` | extensão do Chrome "Fisguei → Herrera HOUSE IA" | chave da extensão no corpo/cabeçalho |
| `/estacao-api/*` | estação dos PCs virtuais | cabeçalho `x-estacao` |
| `/escritorio-ciclo`, `/social-ciclo`, `/banco-ciclo` | agendador do Supabase (pg_cron) | token próprio de cada ciclo |
| `/webhook/whatsapp` | WhatsApp Cloud API | assinatura da Meta |

---

## 2. As quatro formas de uma IA controlar o sistema

### 2.1 Chamar as rotas direto
É o normal. 209 ações disponíveis, todas descritas neste catálogo.

### 2.2 Uma ferramenta só: `POST /api/ia/executar`
Para IAs que preferem uma única função. Você manda o **nome da ação** e os dados; o sistema roteia.

```bash
curl -s -X POST "$BASE/api/ia/executar" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' \
  -d '{"acao":"imoveis.listar","query":{"status":"publicado","limite":5}}'
# { "acao":"imoveis.listar", "metodo":"GET", "caminho":"/api/imoveis", "status":200, "resultado":[ ... ] }

curl -s -X POST "$BASE/api/ia/executar" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' \
  -d '{"acao":"leads.criar","dados":{"nome":"Ana","telefone":"19999990000","origem":"IA"}}'
```

Parâmetros de caminho (`:id`, `:slug`) vão dentro de `dados`. Ações de entrada própria (extensão, estação,
ciclos) não passam por aqui.

### 2.3 Ferramentas prontas para LLM
`GET /api/ia/ferramentas.json` devolve as ações no formato de *tools* do Claude
(`?formato=openai` devolve no formato da OpenAI). Dá para colar direto num agente:

```bash
curl -s "$BASE/api/ia/ferramentas.json?escopo=imoveis" -H "Authorization: Bearer $CHAVE"
# [ { "name":"imoveis_listar", "description":"Lista a carteira ... (GET /api/imoveis)",
#     "input_schema": { "type":"object", "properties": { ... } } } ]
```

`GET /api/ia/openapi.json` devolve o OpenAPI 3.1 completo — serve para GPTs Actions, n8n, Make, Postman.

### 2.4 Servidor MCP (Claude Desktop, Claude Code, qualquer cliente MCP)
`scripts/mcp-herrera.mjs` publica as 209 ações como ferramentas MCP. Sem instalar nada (Node puro):

```json
{ "mcpServers": {
    "herrera": { "command": "node", "args": ["C:/Users/user/Desktop/Herrera HOUSE IA/scripts/mcp-herrera.mjs"],
      "env": { "HERRERA_URL": "https://minhaimobiliaria.corretordofuturo.app",
               "HERRERA_CHAVE": "hh_...", "HERRERA_ESCOPOS": "imoveis,crm,captacao" } } } }
```

`HERRERA_ESCOPOS` é opcional e limita quais ferramentas aparecem.

---

## 3. Rotas de controle por IA (`/api/ia/*`)

| rota | para que serve |
|---|---|
| `GET /api/ia/manifesto` | quem é a instalação, o que a chave pode, onde estão os outros mapas |
| `GET /api/ia/acoes` | catálogo das ações em JSON (`?escopo=`, `?q=`) |
| `GET /api/ia/ferramentas.json` | as ações como *tools* de LLM (`?formato=openai`) |
| `GET /api/ia/openapi.json` | OpenAPI 3.1 do sistema inteiro |
| `GET /api/ia/estado` | retrato agora: carteira, CRM, captação, robôs, pendências |
| `GET /api/ia/eventos?desde=<id>` | o que mudou desde um ponto (para o robô acompanhar sem ficar varrendo) |
| `POST /api/ia/executar` | executa qualquer ação pelo nome |
| `GET /api/ia/esquema` | tabelas e colunas do banco desta imobiliária (escopo `sql`) |
| `POST /api/ia/consulta` | `SELECT` de leitura, uma por vez, tabelas da imobiliária, limite e tempo máximo (escopo `sql`, só adm e gestor) |
| `GET /api/ia/config` · `PUT /api/ia/config` | lê e grava configurações do banco (gravar: só adm; segredos saem mascarados) |
| `GET /api/chaves` · `POST /api/chaves` · `DELETE /api/chaves/:id` · `GET /api/chaves/log` | as chaves de API |

**Exemplo de ronda de um robô** (é assim que um agente trabalha sozinho):

```bash
# 1. o que precisa de atenção agora
curl -s "$BASE/api/ia/estado" -H "Authorization: Bearer $CHAVE"
# 2. o que mudou desde a última passada
curl -s "$BASE/api/ia/eventos?desde=4821" -H "Authorization: Bearer $CHAVE"
# 3. agir
curl -s -X POST "$BASE/api/ia/executar" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' \
  -d '{"acao":"imoveis.localizarDonoLote","dados":{"etapa":"sem_dono"}}'
```

**Consulta ao banco** (leitura; um SELECT por vez, sem comentário, sem função perigosa, sem tabela de fora da imobiliária; `LIMIT` máximo 500):

```bash
curl -s -X POST "$BASE/api/ia/consulta" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' \
  -d '{"sql":"SELECT bairro, count(*) n FROM imoveis GROUP BY bairro ORDER BY n DESC","limite":20}'
```

---

## 4. Regras que valem para o catálogo inteiro

- **Perfis**: `adm` e `gestor` veem tudo; `corretor` vê só os imóveis e leads dele (403 no resto).
- **Auditoria**: criação, alteração de status, autorizações, chaves e configurações ficam gravadas em `auditoria`
  (veja `GET /api/auditoria`) com o usuário dono da chave.
- **LGPD**: um telefone na lista "não contatar" bloqueia o envio em todas as imobiliárias da plataforma.
- **Base comum**: anúncios (`fisguei_anuncios`), condomínios, prédios 3D, bairros e fachadas são compartilhados entre
  as imobiliárias; proprietários, telefones, conversas, carteira e leads são só de quem obteve.
- **Gasta dinheiro**: `fisguei.localizar`, `fisguei.consultarPessoa` e `imoveis.localizarDono*` usam créditos do Fisgar
  (1 por pessoa consultada). `mercado.fachada` usa a cota do Google Street View. Estão marcados em **Efeitos**.
- **Manda mensagem de verdade**: `whats.enviar`, `fisguei.mensagemPessoa`, `escritorio.aprovar`,
  `redes.publicarAgora` e `escritorio.mandarRelatorio` saem para o mundo na hora.
- **Imóvel de terceiro**: fotos de anúncio entram só na pasta "Fotos internas" e nunca vão para o portal,
  off-market, Drive ou redes.

---

# 5. Catálogo completo das rotas
## Base: acesso, usuários, painel e integrações (`src/routes/base.js`)

Montado em `/api`. Em `server.js`, só `/api/setup`, `/api/login`, `/api/logout` e `/api/drive/callback` ficam fora do `exigeLogin`; todo o resto de `/api` exige sessão (cookie `hh_sessao`, 12 horas) e todo método que não seja `GET`/`HEAD`/`OPTIONS` passa por `mesmaOrigem` (se vier o cabeçalho `Origin` com host diferente do `Host`, responde 403).

**Duas formas de entrar em `/api`.** Antes de tudo, `src/api-ia` tenta a chave de API: `Authorization: Bearer hh_<prefixo>_<segredo>` (ou o cabeçalho `X-Api-Key`). Com uma chave válida, o usuário dono dela é resolvido na hora, o cookie fica dispensado e o `mesmaOrigem` é liberado — então, nas chamadas por chave, o erro **403 "Origem não permitida."** não acontece. O perfil que vale é o do usuário dono da chave, de modo que as regras de `adm`/`gestor`/`corretor` descritas em cada endpoint continuam as mesmas. A chave traz limites próprios, e cada um deles tem o seu erro:

| situação | status | mensagem |
| --- | --- | --- |
| chave desconhecida, revogada ou vencida | 401 | "Chave de API inválida, revogada ou vencida." |
| IP fora da lista da chave | 403 | "Esta chave só vale nos endereços de IP autorizados." |
| passou das chamadas por minuto (padrão 300, entre 10 e 3.000) | 429 | "Limite de N chamadas por minuto para esta chave." |
| chave só de leitura em método que não é `GET`/`HEAD` | 403 | "Chave somente de leitura." |
| caminho fora dos escopos da chave | 403 | "Esta chave não tem o escopo \"X\"." |

Os escopos são `imoveis`, `crm`, `captacao`, `condominios`, `conteudo`, `escritorio`, `painel`, `config`, `plataforma` e `sql`; `*` libera todos. O escopo de cada módulo deste documento está anotado no começo da seção. Toda chamada por chave é registrada no log de uso da chave (método, caminho, status, tempo e IP) quando a resposta termina.

Escopo deste módulo: `/api/painel`, `/api/auditoria` e `/api/me*` pedem `painel`; `/api/usuarios`, `/api/integracoes` e `/api/setup` pedem `config`. `/api/login` e `/api/logout` não casam com nenhuma regra do mapa e por isso caem no escopo padrão, `painel`.

### `GET /api/setup`
- **Quem pode:** público, sem login
- **O que faz:** diz se o sistema ainda não tem nenhum usuário (primeiro acesso) e devolve o nome da empresa configurada.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "precisa": true, "empresa": "a imobiliária" }
```
- **Erros:** 500 se o banco estiver indisponível.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/setup"
```

### `POST /api/setup`
- **Quem pode:** público, sem login — mas só funciona enquanto a tabela `usuarios` estiver vazia
- **O que faz:** cria o primeiro usuário administrador, abre a sessão dele e, se pedido, carrega os dados de exemplo.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `nome` | texto | sim | nome do administrador (cortado em 100 caracteres) |
| `email` | texto | sim | precisa casar com `\S+@\S+\.\S+` |
| `senha` | texto | sim | 8 caracteres ou mais, com ao menos uma letra e um dígito |
| `exemplo` | booleano | não | padrão ausente/falso. Se verdadeiro, roda `seedExemplo()` |

- **Resposta:**
```json
{ "ok": true, "exemplo": { "corretores": [ { "nome": "Marina (Exemplo)", "email": "marina@exemplo.local", "senha": "Temp483921a7c2" } ] } }
```
Sem `exemplo`, o campo vem `null`.
- **Erros:** 400 nome/e-mail inválidos; 400 senha fraca; 409 se o administrador já existe ("O administrador já foi criado. Entre com seu login.").
- **Efeitos:** insere em `usuarios` com perfil `adm` (senha em scrypt); grava `auditoria` com ação `setup`; cria sessão em `sessoes` e manda o cookie `hh_sessao` (HttpOnly, SameSite=Lax, 12 h). Com `exemplo`, `src/seed.js` insere 2 corretores (senha temporária aleatória, devolvida na resposta), 2 condomínios, 3 imóveis, 1 proprietário, 4 leads, 1 mensagem de WhatsApp, 1 visita e interações — tudo marcado "(Exemplo)".
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/setup" -H 'Content-Type: application/json' \
  -d '{"nome":"Thiago","email":"thiago@exemplo.com","senha":"senha12345","exemplo":true}'
```

### `POST /api/login`
- **Quem pode:** público, sem login
- **O que faz:** confere e-mail e senha de um usuário ativo e abre a sessão.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `email` | texto | sim | e-mail cadastrado; o usuário precisa estar com `ativo=1` |
| `senha` | texto | sim | senha do usuário |

- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 429 após 5 falhas da mesma dupla IP+e-mail (bloqueio de 15 minutos, mensagem "Muitas tentativas. Aguarde 15 minutos e tente de novo."); 401 "E-mail ou senha incorretos."
- **Efeitos:** em caso de erro, incrementa `tentativas_login`. Em caso de acerto, limpa `tentativas_login`, apaga de `sessoes` tudo que já expirou, insere a nova sessão, manda o cookie e grava `auditoria` com ação `login` e o IP no detalhe.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/login" -H 'Content-Type: application/json' \
  -d '{"email":"thiago@exemplo.com","senha":"senha12345"}' -c cookies.txt
```

### `POST /api/logout`
- **Quem pode:** público, sem login (age sobre o cookie que vier)
- **O que faz:** encerra a sessão do cookie e limpa o cookie no navegador.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** nenhum previsto; sem cookie também responde `{"ok":true}`.
- **Efeitos:** apaga a linha correspondente em `sessoes` e manda `Set-Cookie` com `Max-Age=0`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/logout" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/me`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** devolve os dados do usuário da sessão atual.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "id": 1, "nome": "Thiago", "email": "thiago@exemplo.com", "perfil": "adm", "telefone": "19999990000" }
```
- **Erros:** 401 se a sessão expirou ou o usuário foi desativado.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/me" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/me/senha`
- **Quem pode:** adm, gestor, corretor (só a própria senha)
- **O que faz:** troca a senha do usuário logado depois de conferir a senha atual.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `atual` | texto | sim | senha em uso |
| `nova` | texto | sim | 8 caracteres ou mais, com letras e números |

- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 400 "Senha atual incorreta."; 400 se a nova senha não atende à regra; 401 sem sessão.
- **Efeitos:** atualiza `usuarios.senha_hash`. As sessões abertas **não** são encerradas aqui.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/me/senha" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"atual":"senha12345","nova":"outra98765"}'
```

### `POST /api/me/telefone`
- **Quem pode:** adm, gestor, corretor (só o próprio telefone)
- **O que faz:** grava o celular do usuário logado.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `telefone` | texto | não | padrão vazio. Só os dígitos são guardados; se sobrar algo, precisa ter de 10 a 13 dígitos. Vazio apaga o telefone (grava `NULL`) |

- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 400 "Informe o celular com DDD." quando ficam de 1 a 9 ou mais de 13 dígitos; 401 sem sessão.
- **Efeitos:** atualiza `usuarios.telefone`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/me/telefone" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"telefone":"(19) 99999-0000"}'
```

### `GET /api/usuarios`
- **Quem pode:** adm, gestor, corretor — com visão diferente: adm e gestor (`veTudo`) recebem todos os usuários e todos os campos; corretor recebe só os ativos e só `id`, `nome`, `perfil`
- **O que faz:** lista os usuários da imobiliária, ordenados por ativo e depois por nome.
- **Entrada:** nenhuma
- **Resposta** (adm/gestor):
```json
[ { "id": 1, "nome": "Thiago", "email": "thiago@exemplo.com", "telefone": "19999990000", "perfil": "adm", "ativo": 1, "criado_em": "2026-10-30 09:12:00" } ]
```
Para corretor: `[ { "id": 1, "nome": "Thiago", "perfil": "adm" } ]`.
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/usuarios" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/usuarios`
- **Quem pode:** adm
- **O que faz:** cria um usuário novo com perfil e senha definidos.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `nome` | texto | sim | cortado em 100 caracteres |
| `email` | texto | sim | precisa casar com `\S+@\S+\.\S+` e ainda não existir |
| `perfil` | texto | sim | um de `adm`, `gestor`, `corretor` |
| `senha` | texto | sim | 8 caracteres ou mais, com letras e números |
| `telefone` | texto | não | padrão ausente (`NULL`); cortado em 30 caracteres |

- **Resposta:**
```json
{ "id": 4 }
```
- **Erros:** 400 nome/e-mail inválidos; 400 perfil inválido; 400 senha fraca; 403 se o perfil não for `adm`; 409 "Já existe um usuário com este e-mail."
- **Efeitos:** insere em `usuarios` (senha em scrypt) e grava `auditoria` com ação `usuario_criado` e o e-mail no detalhe.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/usuarios" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' \
  -d '{"nome":"Julia","email":"julia@exemplo.com","perfil":"corretor","senha":"senha12345"}'
```

### `PATCH /api/usuarios/:id`
- **Quem pode:** adm
- **O que faz:** altera nome, telefone, perfil, senha ou situação (ativo/inativo) de um usuário.
- **Entrada:** todos os campos são opcionais; os que vierem ausentes ficam como estão (`coalesce` no SQL).

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `nome` | texto | não | cortado em 100 caracteres |
| `telefone` | texto | não | cortado em 30 caracteres |
| `perfil` | texto | não | um de `adm`, `gestor`, `corretor` |
| `ativo` | número/booleano | não | qualquer valor verdadeiro grava 1, falso grava 0 |
| `senha` | texto | não | 8 caracteres ou mais, com letras e números |

- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 404 "Usuário não encontrado."; 400 "Você não pode desativar ou rebaixar o próprio acesso." quando o adm manda `ativo: 0` ou um perfil diferente de `adm` para si mesmo; 400 perfil inválido; 400 senha fraca; 403 se o perfil não for `adm`.
- **Efeitos:** atualiza `usuarios`; com `senha`, grava o novo hash; se vier `ativo: 0` **ou** `senha`, apaga todas as linhas de `sessoes` daquele usuário (derruba os acessos abertos dele). Sempre grava `auditoria` com ação `usuario_alterado` e o e-mail do usuário alterado.
- **Exemplo:**
```bash
curl -s -X PATCH "$BASE/api/usuarios/4" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"perfil":"gestor","ativo":1}'
```

### `GET /api/painel`
- **Quem pode:** adm, gestor, corretor — adm e gestor veem a imobiliária inteira; corretor vê só os imóveis, leads, visitas e mensagens ligados ao próprio `corretor_id`
- **O que faz:** monta a tela inicial: quatro indicadores, visitas de hoje até dois dias à frente, clientes esperando resposta, imóveis novos da última semana (com compradores sugeridos) e a vitrine.
- **Entrada:** nenhuma
- **Resposta:**
```json
{
  "kpis": { "imoveis": 12, "publicados": 5, "leads": 23, "quentes": 4 },
  "visitas": [ { "id": 7, "data_hora": "2026-10-31 10:00:00", "status": "confirmada", "lead": "Fernanda", "codigo": "AP0001", "corretor": "Marina", "capa": 31 } ],
  "aguardando": [ { "id": 12, "nome": "Carlos", "texto": "Ainda está disponível?", "criado_em": "2026-10-30 08:40:00" } ],
  "sugestoes": 2,
  "novos": [ { "id": 18, "codigo": "AP0007", "tipo": "Apartamento", "status": "captacao", "bairro": "Cambuí", "valor": 1350000, "capa": 44, "n_fotos": 6, "compradores": [ { "id": 12, "nome": "Carlos", "score": 85, "motivos": ["cabe na verba","4 quartos"] } ] } ],
  "vitrine": [ { "id": 3, "codigo": "CC0001", "status": "off_market", "valor": 3900000, "capa": 12, "n_fotos": 9 } ]
}
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/painel" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/integracoes`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** mostra a situação do Google Drive, do WhatsApp e da IA local.
- **Entrada:** nenhuma
- **Resposta:**
```json
{
  "drive": { "configurado": true, "conectado": false, "conta": null, "raiz": "Imóveis da imobiliária", "pendentes": 3, "redirect": "http://localhost:3333/api/drive/callback" },
  "whatsapp": { "modo": "simulado", "webhook": "http://localhost:3333/webhook/whatsapp", "segredo": false, "verify": false },
  "ia": { "ok": true, "modelo": "qwen3:14b", "instalado": true, "modelos": ["qwen3:14b"], "modo": "sugerir" },
  "public_url": null
}
```
Sem Ollama no ar, `ia` vem `{ "ok": false, "modo": "sugerir", "modelo": "qwen3:14b" }`.
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura no banco. Faz uma chamada HTTP de saída para o Ollama (`GET $OLLAMA_URL/api/tags`, tempo máximo 2,5 s) para saber se a IA local está disponível.
- **Exemplo:**
```bash
curl -s "$BASE/api/integracoes" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/auditoria`
- **Quem pode:** adm
- **O que faz:** devolve os 200 registros mais recentes da auditoria, com o nome de quem fez cada ação.
- **Entrada:** nenhuma
- **Resposta:**
```json
[ { "id": 318, "usuario_id": 1, "acao": "imovel_status", "detalhe": "AP0001 → publicado", "em": "2026-10-30 09:41:00", "nome": "Thiago" } ]
```
- **Erros:** 403 se o perfil não for `adm`; 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/auditoria" -H "Authorization: Bearer $CHAVE"
```

## Imóveis (`src/routes/imoveis.js`)

Montado em `/api/imoveis`. O router repete `A.exigeLogin` na entrada. Quase todas as rotas com `:id` passam por `imovelPermitido`: o imóvel precisa existir (senão 404) e, para quem é `corretor`, precisa ter `corretor_id` igual ao do usuário (senão 403 "Este imóvel é de outro corretor.").

Escopo de chave de API: `imoveis` (todo o `/api/imoveis`).

Valores aceitos (definidos no arquivo): `tipo` entre `Apartamento`, `Cobertura`, `Casa`, `Casa em condomínio`, `Sobrado`, `Sala comercial`, `Loja`, `Ponto comercial`, `Prédio`, `Hotel`, `Galpão`, `Terreno`, `Chácara`; `status` entre `captacao`, `aguardando_autorizacao`, `publicado`, `off_market`, `vendido`, `alugado`, `suspenso`; `finalidade` entre `venda`, `locacao`, `venda_locacao`.

### `GET /api/imoveis/tipos`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** devolve as listas fixas usadas nos formulários (tipos, status, finalidades, etapas da carteira e origens).
- **Entrada:** nenhuma
- **Resposta:**
```json
{
  "tipos": ["Apartamento","Cobertura","Casa","Casa em condomínio","Sobrado","Sala comercial","Loja","Ponto comercial","Prédio","Hotel","Galpão","Terreno","Chácara"],
  "status": ["captacao","aguardando_autorizacao","publicado","off_market","vendido","alugado","suspenso"],
  "finalidades": ["venda","locacao","venda_locacao"],
  "etapas": [["sem_dono","Sem dono"],["localizado","Dono localizado"],["em_contato","Em contato"],["confirmado","Dono confirmou"],["autorizado","Autorização assinada"],["publicado","Publicado"],["vendido","Vendido / alugado"]],
  "origens": [["fisgar","Fisgar"],["radar","Portais (Radar)"],["cadastro","Site / cadastro da equipe"]]
}
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura (nem toca no banco).
- **Exemplo:**
```bash
curl -s "$BASE/api/imoveis/tipos" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/imoveis/endereco`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** o "cadastro inteligente": a partir de CEP ou rua+número, busca o endereço nos Correios (ViaCEP), as coordenadas no OpenStreetMap e tenta reconhecer o condomínio na base de condomínios.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `cep` | texto | não | se vier com 8 dígitos, consulta o ViaCEP direto por CEP |
| `logradouro` | texto | não | sem `cep`, busca o CEP pela rua (precisa de 3 caracteres ou mais) |
| `numero` | texto | não | necessário para buscar coordenadas e reconhecer o condomínio |
| `cidade` | texto | não | padrão `CIDADE_PADRAO` do `.env` (`Campinas`) |
| `uf` | texto | não | padrão `UF_PADRAO` do `.env` (`SP`) |

- **Resposta:**
```json
{
  "campos": { "cep": "13025000", "logradouro": "Rua Coronel Quirino", "bairro": "Cambuí", "cidade": "Campinas", "uf": "SP", "lat": -22.896, "lon": -47.045, "condominio_id": 31, "condominio_nome": "Mirante Cambuí" },
  "fontes": { "cep": "Correios", "logradouro": "Correios", "lat": "OpenStreetMap", "condominio_nome": "Base de condomínios · cep+numero" },
  "avisos": ["A rua tem mais de um CEP. Confira o CEP pelo número."],
  "condominio": { "id": 31, "nome": "Mirante Cambuí", "tipo": "vertical", "como": "cep+numero", "confianca": "alta", "unidades": 48, "andares": 12 },
  "alternativas": []
}
```
- **Erros:** 401 sem sessão. As falhas das consultas externas não derrubam a resposta: viram texto em `avisos` ("Não consegui consultar os Correios agora (ViaCEP)…", "Mapa indisponível agora…", "CEP não encontrado.").
- **Efeitos:** só leitura no banco. Faz chamadas HTTP de saída para `viacep.com.br` (7 s) e `nominatim.openstreetmap.org` (8 s).
- **Exemplo:**
```bash
curl -s "$BASE/api/imoveis/endereco?cep=13025000&numero=1100" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/imoveis`
- **Quem pode:** adm, gestor, corretor (corretor só vê os imóveis em que é o `corretor_id`)
- **O que faz:** lista a carteira, com capa, contagem de fotos e os dados calculados da carteira (etapa, origem, dono, o que falta na ficha). Limite fixo de 3.000 linhas, ordenado por `atualizado_em` decrescente. A `descricao` é removida da resposta.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `status` | texto | não | filtra por um status exato (sem validação da lista) |
| `neg` | texto | não | `locacao` filtra `finalidade IN ('locacao','venda_locacao')`; `venda` filtra `IN ('venda','venda_locacao')`; qualquer outro valor é ignorado |
| `q` | texto | não | busca livre, cortada em 80 caracteres: código, nome do condomínio, bairro, logradouro, unidade, nome do proprietário da ficha e nome das pessoas que o Fisgar trouxe. Se o texto parecer telefone (só dígitos, espaços, `()+-.` e 5 dígitos ou mais), também compara telefone do proprietário e contatos do Fisgar |

- **Resposta:**
```json
[ {
  "id": 1, "codigo": "AP0001", "tipo": "Apartamento", "status": "publicado", "finalidade": "venda",
  "bairro": "Mansões Santo Antônio", "cidade": "Campinas", "uf": "SP", "valor": 2250000,
  "quartos": 4, "suites": 2, "vagas": 3, "area_util": 181, "exclusivo": 1,
  "condominio_nome": "Rossi Antilhas", "corretor_nome": "Marina", "capa": 12, "n_fotos": 8,
  "etapa": "publicado", "origem": "cadastro",
  "dono": { "nome": "Proprietário Exemplo Um", "telefone": "19988887777", "origem": "Exemplo", "confirmado": true, "nao_contatar": false },
  "fisguei_ids": [], "busca_dono": null,
  "ficha": { "pct": 89, "falta": ["Autorização assinada"] }
} ]
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/imoveis?status=publicado" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/imoveis/:id/fisgar`
- **Quem pode:** adm, gestor, corretor (dono do imóvel)
- **O que faz:** mostra o que o Fisgar achou sobre o dono deste imóvel: os anúncios ligados a ele, as pessoas com seus contatos e os últimos cinco pedidos de consulta.
- **Entrada:** nenhuma
- **Resposta:**
```json
{
  "anuncios": [ { "id": 88, "status": "respondeu", "anunciante_nome": "Maria S.", "anunciante_tipo": "particular", "portal": "OLX", "ref": "FG-00088" } ],
  "pedidos": [ { "anuncio_id": 88, "status": "concluido", "creditos": 4, "erro": null, "em": "2026-10-29 15:02:00" } ],
  "pessoas": [ { "id": 140, "anuncio_id": 88, "nome": "Maria Silva", "relacao": "proprietaria", "unidade": "72", "idade": 54, "consultado": 1, "status": "confirmou",
    "contatos": [ { "tipo": "telefone", "valor": "19988887777", "envio": "respondeu" } ] } ]
}
```
Sem anúncio ligado ao imóvel, todas as listas vêm vazias.
- **Erros:** 404 imóvel não encontrado; 403 imóvel de outro corretor; 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/imoveis/1/fisgar" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/imoveis/localizar-dono`
- **Quem pode:** adm, gestor, corretor (cada imóvel da lista é conferido com `imovelPermitido`; os sem permissão são apenas ignorados, sem erro)
- **O que faz:** põe na fila do Fisgar a busca do proprietário de vários imóveis de uma vez, a partir do endereço de cada um.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `ids` | lista de números | sim | ids de imóveis; valores não numéricos são descartados e a lista é cortada nos **200 primeiros** |

- **Resposta:**
```json
{ "criados": 3, "ja": 1, "sem_endereco": 2, "por_busca": 4, "creditos": { "plano": 300, "saldo": 212, "fonte": "estimado", "gasto_mes": 88, "gasto_hoje": 12, "limite_dia": 70, "restante_hoje": 58 }, "extensao": { "em": null, "fisgar_aberto": false, "vivo": false } }
```
`criados` são as buscas novas, `ja` as que já estavam na fila, `sem_endereco` os imóveis sem rua ou número.
- **Erros:** 400 "Escolha ao menos um imóvel." quando `ids` não é lista ou fica vazia depois da limpeza; 401 sem sessão; 403 se o `Origin` não for o próprio host.
- **Efeitos:** para cada imóvel sem anúncio do Fisgar ligado, **cria** uma linha em `fisguei_anuncios` com `fisgar_id` no formato `im:<cliente>:<id>` (só endereço, sem valor e sem fotos, para não aparecer nas vitrines) e aponta `imovel_id` para o imóvel; depois insere um pedido em `fisguei_pedidos` (tipo `endereco`). Grava `auditoria` com ação `fisguei.buscar`. A consulta em si é paga: quando a extensão do Fisgar processa o pedido, gasta crédito (1 pelo endereço mais até `max_consultas`, padrão 3, por pessoa).
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/imoveis/localizar-dono" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"ids":[1,2,3]}'
```

### `POST /api/imoveis/:id/localizar-dono`
- **Quem pode:** adm, gestor, corretor (dono do imóvel)
- **O que faz:** o mesmo da rota acima, para um imóvel só.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "id": 412, "anuncio_id": 88, "criados": 1, "por_busca": 4, "creditos": { "plano": 300, "saldo": 212, "fonte": "estimado", "gasto_mes": 88, "gasto_hoje": 12, "limite_dia": 70, "restante_hoje": 58 }, "extensao": { "em": null, "fisgar_aberto": false, "vivo": false } }
```
Se já havia pedido na fila, vem também `"ja": true` e `criados` é 0.
- **Erros:** 400 "Preencha a rua e o número do imóvel: a consulta de proprietários acha o dono pelo endereço." quando falta logradouro ou número; 404 imóvel não encontrado; 403 imóvel de outro corretor; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** os mesmos da rota em lote (pode criar linha em `fisguei_anuncios`, insere em `fisguei_pedidos`, grava `auditoria` com ação `fisguei.buscar` e o código do imóvel, e a consulta gasta crédito do Fisgar quando for executada).
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/imoveis/1/localizar-dono" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/imoveis/:id`
- **Quem pode:** adm, gestor, corretor (dono do imóvel)
- **O que faz:** a ficha completa do imóvel: dados do cadastro, condomínio, proprietário, fotos (próprias e internas) e, para adm/gestor, o link da pasta no Drive.
- **Entrada:** nenhuma
- **Resposta:**
```json
{
  "id": 1, "codigo": "AP0001", "tipo": "Apartamento", "status": "publicado", "finalidade": "venda",
  "cep": "13087000", "logradouro": "Rua Exemplo das Antilhas", "numero": "200", "unidade": "72",
  "bairro": "Mansões Santo Antônio", "cidade": "Campinas", "uf": "SP", "lat": -22.87, "lon": -47.08,
  "quartos": 4, "suites": 2, "vagas": 3, "area_util": 181, "area_total": 210,
  "valor": 2250000, "valor_locacao": null, "valor_condominio": 1800, "iptu": 450,
  "descricao": "Imóvel de exemplo para testar o sistema.", "exclusivo": 1, "exclusivo_ate": "2027-03-01",
  "corretor_id": 2, "proprietario_id": 1, "condominio_id": 1,
  "condominio_nome": "Rossi Antilhas", "ano_construcao": "2011", "lazer": "Piscina, academia", "administradora": null, "corretor_nome": "Marina",
  "etapa": "publicado", "origem": "cadastro",
  "ficha": { "pct": 89, "falta": ["Autorização assinada"] },
  "fisguei_ids": [], "busca_dono": null,
  "proprietario": { "id": 1, "nome": "Proprietário Exemplo Um", "cpf": "529.982.247-25", "telefone": "19988887777", "email": null, "origem_dado": "Exemplo", "nao_contatar": 0 },
  "fotos": [ { "id": 12, "nome": "sala.jpg" }, { "id": 40, "nome": "fachada", "interna": true } ],
  "drive_link": "https://drive.google.com/drive/folders/1AbC..."
}
```
`drive_subpastas` nunca sai na resposta. `drive_link` é `null` para corretor e para imóvel sem pasta no Drive.
- **Erros:** 404 imóvel não encontrado; 403 imóvel de outro corretor; 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/imoveis/1" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/imoveis`
- **Quem pode:** adm, gestor, corretor — corretor sempre fica como o `corretor_id` do imóvel; adm e gestor podem escolher outro em `corretor_id`
- **O que faz:** cadastra um imóvel, gera o código interno, grava/reaproveita o condomínio e o proprietário e, com o Drive conectado, cria a pasta do imóvel.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `tipo` | texto | sim | um dos 13 tipos da lista |
| `status` | texto | não | padrão `captacao`; precisa estar na lista de status |
| `finalidade` | texto | não | padrão `venda`; valor fora de `venda`/`locacao`/`venda_locacao` cai para `venda` |
| `cep` | texto | não | só os dígitos são guardados |
| `logradouro` | texto | não | cortado em 150 caracteres |
| `numero` | texto | não | cortado em 20 |
| `unidade` | texto | não | cortado em 40 |
| `bairro` | texto | não | cortado em 80 |
| `cidade` | texto | não | padrão `CIDADE_PADRAO` (`Campinas`) |
| `uf` | texto | não | padrão `UF_PADRAO` (`SP`), cortado em 2 |
| `lat`, `lon` | número | não | aceitam vírgula decimal |
| `quartos`, `suites`, `vagas` | inteiro | não | padrão `NULL` |
| `area_util`, `area_total` | número | não | padrão `NULL` |
| `valor` | número | não | valor de venda |
| `valor_locacao` | número | não | obrigatório **só** quando `finalidade` é `locacao` e `status` é `publicado` |
| `valor_condominio`, `iptu` | número | não | padrão `NULL` |
| `descricao` | texto | não | cortada em 5.000 caracteres |
| `exclusivo` | booleano | não | padrão 0 |
| `exclusivo_ate` | texto | não | cortado em 10 caracteres (`AAAA-MM-DD`) |
| `corretor_id` | inteiro | não | só adm/gestor; padrão o id do usuário logado |
| `condominio_id` | inteiro | não | condomínio já existente na base; completa os campos que faltarem |
| `condominio_nome` | texto | não | cortado em 120. Sem `condominio_id`, procura por CEP+número (ou por nome) e cria o condomínio se não existir |
| `ano_construcao` | texto | não | cortado em 10 |
| `lazer` | texto | não | cortado em 300 |
| `administradora` | texto | não | cortada em 120 |
| `proprietario` | objeto | não | `{ nome, cpf, telefone, email, origem_dado, nao_contatar }`. Só é gravado se tiver `nome`. `origem_dado` padrão `Informado pelo proprietário` |

- **Resposta:**
```json
{ "id": 18, "codigo": "AP0007", "aviso": null, "compradores": [ { "id": 12, "nome": "Carlos", "busca": "4 quartos perto do Dom Pedro", "etapa": "novo", "corretor_id": 2, "corretor": "Marina", "score": 85, "motivos": ["cabe na verba","4 quartos"] } ] }
```
`aviso` traz texto quando a pasta no Drive falhou ("Imóvel salvo, mas a pasta no Drive não foi criada: …").
- **Erros:** 400 "Escolha o tipo do imóvel."; 400 tipo inválido; 400 status inválido; 400 "Informe o valor do aluguel." (locação publicada sem valor); 400 "CPF do proprietário inválido."; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** insere em `imoveis` com o código gerado (prefixo por tipo + 4 dígitos sequenciais, ex.: `AP0007`); pode inserir ou atualizar `condominios` (e limpar o cache de condomínios); pode inserir ou atualizar `proprietarios`; grava `auditoria` com ação `imovel_criado` e o código. Com o Drive conectado, cria no Google Drive a pasta do imóvel e as 7 subpastas (`Fotos`, `Documentos do proprietário`, `Matrícula e certidões`, `Autorização de venda`, `Contratos`, `Propostas`, `Vídeo e anúncios`) e grava `drive_pasta_id`/`drive_subpastas`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/imoveis" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' \
  -d '{"tipo":"Apartamento","status":"captacao","cep":"13025000","logradouro":"Rua Exemplo","numero":"1100","bairro":"Cambuí","quartos":3,"valor":1350000,"proprietario":{"nome":"Maria Silva","telefone":"19988887777"}}'
```

### `PUT /api/imoveis/:id`
- **Quem pode:** adm, gestor, corretor (dono do imóvel). Corretor não consegue trocar o `corretor_id`: o valor atual é mantido
- **O que faz:** regrava a ficha do imóvel. `tipo` e `finalidade` ausentes ficam com o valor atual; `valor_locacao` ausente também é preservado. Os demais campos ausentes voltam ao padrão (`NULL`, `captacao`, `Campinas`, etc.), porque o cadastro inteiro é reescrito.
- **Entrada:** os mesmos campos de `POST /api/imoveis` (nenhum é obrigatório aqui). `condominio_id`/`condominio_nome` ausentes mantêm o condomínio atual; `proprietario` ausente mantém o proprietário atual, e se vier com `nome` **atualiza** o proprietário já ligado ao imóvel.
- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 404 imóvel não encontrado; 403 imóvel de outro corretor; 400 tipo/status inválido; 400 "Informe o valor do aluguel."; 400 CPF inválido; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** atualiza `imoveis` e `atualizado_em`; pode inserir/atualizar `condominios` e `proprietarios`; grava `auditoria` com ação `imovel_alterado` e o código.
- **Exemplo:**
```bash
curl -s -X PUT "$BASE/api/imoveis/1" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"valor":2190000,"descricao":"Apartamento reformado no alto do Cambuí."}'
```

### `PATCH /api/imoveis/:id/status`
- **Quem pode:** adm, gestor, corretor (dono do imóvel)
- **O que faz:** muda só o status do imóvel.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `status` | texto | sim | um de `captacao`, `aguardando_autorizacao`, `publicado`, `off_market`, `vendido`, `alugado`, `suspenso` |

- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 400 "Status inválido."; 404 imóvel não encontrado; 403 imóvel de outro corretor; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** atualiza `imoveis.status` e `atualizado_em`; grava `auditoria` com ação `imovel_status` e detalhe `"<codigo> → <status>"`. Esse registro de auditoria é o que o painel do administrador conta como venda quando o detalhe termina em `vendido`.
- **Exemplo:**
```bash
curl -s -X PATCH "$BASE/api/imoveis/1/status" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"status":"publicado"}'
```

### `GET /api/imoveis/:id/compradores`
- **Quem pode:** adm, gestor, corretor (dono do imóvel)
- **O que faz:** devolve até 10 leads que combinam com o imóvel, com a nota do match e os motivos. Considera leads fora das etapas `escritura` e `perdido` e só devolve nota 50 ou mais.
- **Entrada:** nenhuma
- **Resposta:**
```json
[ { "id": 12, "nome": "Carlos", "busca": "4 quartos perto do Dom Pedro", "etapa": "novo", "corretor_id": 2, "corretor": "Marina", "score": 85, "motivos": ["cabe na verba","4 quartos","3 vagas"] } ]
```
- **Erros:** 404 imóvel não encontrado; 403 imóvel de outro corretor; 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/imoveis/1/compradores" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/imoveis/:id/arquivos`
- **Quem pode:** adm, gestor, corretor (dono do imóvel)
- **O que faz:** lista os arquivos do imóvel guardados no sistema e, com o Drive conectado, também os que alguém colocou direto nas pastas do Drive.
- **Entrada:** nenhuma
- **Resposta:**
```json
{
  "subpastas": ["Fotos","Documentos do proprietário","Matrícula e certidões","Autorização de venda","Contratos","Propostas","Vídeo e anúncios"],
  "arquivos": [
    { "id": 12, "categoria": "Fotos", "nome": "sala.jpg", "mime": "image/jpeg", "tamanho": 418233, "drive_id": "1xYz", "drive_link": "https://drive.google.com/file/d/1xYz/view", "criado_em": "2026-10-20 11:03:00" },
    { "categoria": "Contratos", "nome": "minuta.pdf", "mime": "application/pdf", "tamanho": 90122, "drive_id": "1Qrs", "drive_link": "https://drive.google.com/file/d/1Qrs/view", "so_drive": true }
  ],
  "drive": { "configurado": true, "conectado": true, "conta": "loja@gmail.com", "raiz": "Imóveis da imobiliária", "pendentes": 0, "redirect": "http://localhost:3333/api/drive/callback" },
  "aviso": null
}
```
- **Erros:** 404 imóvel não encontrado; 403 imóvel de outro corretor; 401 sem sessão. Falha ao ler o Drive não derruba a resposta: a mensagem vai em `aviso`.
- **Efeitos:** só leitura. Com o Drive conectado, faz chamadas de saída à API do Google Drive para listar cada subpasta.
- **Exemplo:**
```bash
curl -s "$BASE/api/imoveis/1/arquivos" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/imoveis/:id/arquivos`
- **Quem pode:** adm, gestor, corretor (dono do imóvel)
- **O que faz:** recebe arquivos por `multipart/form-data` e guarda na categoria escolhida.
- **Entrada:** `multipart/form-data`

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `categoria` | texto | sim | uma das 7 subpastas: `Fotos`, `Documentos do proprietário`, `Matrícula e certidões`, `Autorização de venda`, `Contratos`, `Propostas`, `Vídeo e anúncios` |
| `arquivos` | arquivo (vários) | sim | até **30** arquivos por envio, **25 MB** cada |

- **Resposta:**
```json
{ "ok": true, "enviados": 3, "aviso": "Arquivos guardados no PC. Conecte o Google Drive para enviá-los à pasta do imóvel." }
```
`aviso` é `null` quando tudo subiu para o Drive.
- **Erros:** 400 "Escolha a pasta de destino." (categoria fora da lista); 400 "Nenhum arquivo enviado."; 404 imóvel não encontrado; 403 imóvel de outro corretor; 413 "Arquivo grande demais (limite 25 MB)."; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** insere uma linha em `arquivos` por arquivo. Com Postgres, o conteúdo vai para `arquivos_dados`; com SQLite, é gravado em `data/arquivos/<codigo>/<categoria>/` no disco. Com o Drive conectado, cria a pasta do imóvel se faltar, **envia cada arquivo ao Google Drive** e grava `drive_id`/`drive_link`. Grava `auditoria` com ação `arquivos_enviados` e detalhe `"<codigo> · <categoria> · <n>"`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/imoveis/1/arquivos" -H "Authorization: Bearer $CHAVE" \
  -F 'categoria=Fotos' -F 'arquivos=@sala.jpg' -F 'arquivos=@cozinha.jpg'
```

### `POST /api/imoveis/:id/drive/pasta`
- **Quem pode:** adm, gestor
- **O que faz:** cria (ou reaproveita) a pasta do imóvel no Google Drive e devolve o link.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "ok": true, "link": "https://drive.google.com/drive/folders/1AbC..." }
```
- **Erros:** 400 "Conecte o Google Drive em Configurações primeiro."; 404 imóvel não encontrado; 403 se o perfil for `corretor`; 403 imóvel de outro corretor; 401 sem sessão; 403 origem não permitida. Erro vindo do Google sai como 500 com a mensagem da API.
- **Efeitos:** **cria pastas no Google Drive** (a pasta raiz, se ainda não houver, a pasta do imóvel com o nome `"<codigo> – <condomínio ou endereço>"` e as 7 subpastas) e grava `imoveis.drive_pasta_id` e `imoveis.drive_subpastas`. Não grava auditoria.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/imoveis/1/drive/pasta" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/imoveis/:id/links`
- **Quem pode:** adm, gestor, corretor (dono do imóvel)
- **O que faz:** lista os links internos (off-market) do imóvel, com a contagem de acessos e o último acesso.
- **Entrada:** nenhuma
- **Resposta:**
```json
[ { "id": 5, "token": "aB3xY7...", "imovel_id": 1, "lead_id": 12, "mostrar_endereco": 0, "expira_em": "2026-11-06 09:00:00", "criado_por": 1, "lead": "Carlos", "acessos": 3, "ultimo_acesso": "2026-10-30 08:12:00", "url": "http://localhost:3333/v/aB3xY7..." } ]
```
- **Erros:** 404 imóvel não encontrado; 403 imóvel de outro corretor; 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/imoveis/1/links" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/imoveis/:id/links`
- **Quem pode:** adm, gestor, corretor (dono do imóvel)
- **O que faz:** cria um link interno com validade, para mostrar o imóvel a um cliente sem publicá-lo.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `dias` | inteiro | não | padrão 7; limitado entre 1 e 60 |
| `lead_id` | inteiro | não | padrão `NULL`; amarra o link a um lead |
| `mostrar_endereco` | booleano | não | padrão 0 (endereço escondido) |

- **Resposta:**
```json
{ "url": "http://localhost:3333/v/aB3xY7...", "expira_dias": 7 }
```
O endereço base é `PUBLIC_URL` quando existir, senão `BASE_URL`.
- **Erros:** 404 imóvel não encontrado; 403 imóvel de outro corretor; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** insere em `links_internos` com token aleatório de 12 bytes. Com `lead_id`, insere também uma linha em `interacoes` (tipo `link`) no histórico do lead. Não grava auditoria.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/imoveis/1/links" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"dias":15,"lead_id":12,"mostrar_endereco":true}'
```

### `DELETE /api/imoveis/:id/links/:lid`
- **Quem pode:** adm, gestor, corretor (dono do imóvel)
- **O que faz:** derruba um link interno, colocando a validade um minuto no passado.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "ok": true }
```
Responde `ok` mesmo quando o link não existe ou é de outro imóvel (nada é alterado).
- **Erros:** 404 imóvel não encontrado; 403 imóvel de outro corretor; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** atualiza `links_internos.expira_em`. A linha não é apagada, e os acessos registrados continuam. Não grava auditoria.
- **Exemplo:**
```bash
curl -s -X DELETE "$BASE/api/imoveis/1/links/5" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/imoveis/:id/autorizacoes`
- **Quem pode:** adm, gestor, corretor (dono do imóvel)
- **O que faz:** lista as autorizações de venda do imóvel. O token só aparece embutido na `url`, e só enquanto a autorização está `pendente`.
- **Entrada:** nenhuma
- **Resposta:**
```json
[ { "id": 9, "status": "pendente", "prazo_dias": 180, "comissao_pct": 6, "exclusivo": 1, "assinante_nome": null, "assinado_em": null, "pdf_arquivo_id": null, "criado_em": "2026-10-28 14:00:00", "url": "http://localhost:3333/assinar/Kd9...", "token": null } ]
```
Para autorização já assinada ou cancelada, `url` vem `null`.
- **Erros:** 404 imóvel não encontrado; 403 imóvel de outro corretor; 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/imoveis/1/autorizacoes" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/imoveis/:id/autorizacao`
- **Quem pode:** adm, gestor, corretor (dono do imóvel)
- **O que faz:** monta o texto da autorização de venda (com ou sem exclusividade) a partir dos dados do imóvel e do proprietário, cria o pedido de assinatura e devolve o link para o dono assinar.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `prazo_dias` | inteiro | não | padrão 180; limitado entre 30 e 720 |
| `comissao_pct` | número | não | padrão 6 |
| `exclusivo` | booleano | não | padrão 0 (sem exclusividade) |
| `matricula` | texto | não | cortada em 40 caracteres; entra na cláusula do imóvel |
| `observacoes` | texto | não | cortadas em 800 caracteres; viram a cláusula 8 |

- **Resposta:**
```json
{ "url": "http://localhost:3333/assinar/Kd9...", "conteudo": "AUTORIZAÇÃO DE VENDA COM EXCLUSIVIDADE\n\nPROPRIETÁRIO(A): …", "telefone": "19988887777" }
```
- **Erros:** 400 "Cadastre o proprietário com nome e CPF antes de gerar a autorização."; 400 "Informe o valor de venda do imóvel."; 404 imóvel não encontrado; 403 imóvel de outro corretor; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** marca como `cancelado` todas as autorizações ainda `pendente` do imóvel; insere em `assinaturas` o conteúdo, o `sha256` do conteúdo e um token aleatório de 24 bytes; se o imóvel estava em `captacao`, muda o status para `aguardando_autorizacao`; grava `auditoria` com ação `autorizacao_gerada` e o código. **Não** envia mensagem: devolve o telefone do dono para a equipe mandar o link.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/imoveis/1/autorizacao" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"prazo_dias":180,"comissao_pct":6,"exclusivo":true,"matricula":"123456"}'
```

### `POST /api/imoveis/:id/autorizacoes/:aid/cancelar`
- **Quem pode:** adm, gestor, corretor (dono do imóvel)
- **O que faz:** cancela uma autorização que ainda está pendente de assinatura.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "ok": true }
```
Responde `ok` mesmo quando a autorização não existe, é de outro imóvel ou já não está pendente.
- **Erros:** 404 imóvel não encontrado; 403 imóvel de outro corretor; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** muda `assinaturas.status` para `cancelado`. O status do imóvel não volta atrás. Não grava auditoria.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/imoveis/1/autorizacoes/9/cancelar" -H "Authorization: Bearer $CHAVE"
```

## Arquivos e Google Drive (`src/routes/arquivos.js`)

Montado em `/api`. Escopo de chave de API: `imoveis` (`/api/arquivos*` e `/api/drive*`). Arquivo aberto respeita o tipo: imagem e PDF abrem no navegador (`inline`), todo o resto sai como download (`attachment`), sempre com `X-Content-Type-Options: nosniff`.

### `GET /api/drive/callback`
- **Quem pode:** público, sem login na rota — mas só conclui a conexão se a sessão do navegador for de um usuário com perfil `adm`
- **O que faz:** recebe o retorno do Google depois do consentimento OAuth, confere o `state` guardado e troca o código pelo token de acesso ao Drive.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `state` | texto | sim | precisa bater com o `drive_state` guardado e ainda estar dentro dos 10 minutos |
| `code` | texto | sim (no caminho de sucesso) | código de autorização do Google |
| `error` | texto | não | quando o usuário cancela no Google |

- **Resposta:** não devolve JSON. Responde **302** para `/#/configuracoes?drive=<mensagem>`, com `drive=ok` em caso de sucesso ou uma das mensagens: "Entre como administrador para conectar o Drive.", "Pedido de conexão expirado. Tente de novo.", "Conexão cancelada no Google.", ou o texto do erro do Google.
- **Erros:** não usa códigos de erro HTTP; tudo vira a mensagem do redirecionamento.
- **Efeitos:** apaga a config `drive_state` em qualquer caso. No sucesso, guarda o *refresh token* **cifrado** (AES-256-GCM com a `SECRET_KEY`) na config `drive_refresh`, zera `drive_raiz_id`, guarda o e-mail da conta em `drive_email` e grava `auditoria` com ação `drive_conectado`.
- **Exemplo:**
```bash
curl -s -i "$BASE/api/drive/callback?state=abc&code=4/0A..." -H "Authorization: Bearer $CHAVE"
```

### `GET /api/arquivos/:id`
- **Quem pode:** adm, gestor, corretor (dono do imóvel do arquivo)
- **O que faz:** entrega o conteúdo de um arquivo do sistema. Se for "foto interna" (só endereço externo), responde com redirecionamento para a foto do anúncio de origem.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `baixar` | qualquer | não | padrão ausente (abre no navegador quando é imagem ou PDF). Qualquer valor verdadeiro força download |

- **Resposta:** o próprio arquivo (bytes), com `Content-Type` do `mime` guardado e `Cache-Control: private, max-age=300`. Para foto interna: **302** para a URL externa, com `Cache-Control: private, max-age=3600` e `Referrer-Policy: no-referrer`.
- **Erros:** 404 "Arquivo não encontrado." (id inexistente, ou URL externa que não passa na validação); 404 "Arquivo não encontrado no armazenamento." quando a linha existe mas o conteúdo não; 404/403 do `imovelPermitido`; 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/arquivos/12?baixar=1" -H "Authorization: Bearer $CHAVE" -o sala.jpg
```

### `GET /api/drive/arquivo/:imovelId/:fileId`
- **Quem pode:** adm, gestor, corretor (dono do imóvel)
- **O que faz:** entrega um arquivo que está só no Google Drive, conferindo antes que ele esteja dentro de uma das subpastas daquele imóvel.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `baixar` | qualquer | não | padrão ausente; valor verdadeiro força download |

- **Resposta:** os bytes do arquivo com o `Content-Type` devolvido pelo Google. Para documento nativo do Google (`application/vnd.google-apps.*`), responde **302** para o `webViewLink`.
- **Erros:** 400 "Google Drive não conectado." (também quando o imóvel não tem subpastas gravadas); 403 "Este arquivo não pertence à pasta do imóvel."; 404/403 do `imovelPermitido`; 401 sem sessão. Falha no Google sai como 500 com a mensagem da API.
- **Efeitos:** só leitura no banco. Lista as subpastas e baixa o arquivo pela API do Google Drive.
- **Exemplo:**
```bash
curl -s "$BASE/api/drive/arquivo/1/1QrsTuv" -H "Authorization: Bearer $CHAVE" -o minuta.pdf
```

### `GET /api/drive/conectar`
- **Quem pode:** adm
- **O que faz:** devolve a URL de consentimento do Google para conectar o Drive.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=http%3A%2F%2Flocalhost%3A3333%2Fapi%2Fdrive%2Fcallback&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive&access_type=offline&prompt=consent&include_granted_scopes=true&state=..." }
```
- **Erros:** 400 "Preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no arquivo .env e reinicie o sistema."; 403 se o perfil não for `adm`; 401 sem sessão.
- **Efeitos:** grava na config `drive_state` um token aleatório de 18 bytes com validade de 10 minutos (é o que o callback confere). Não grava auditoria.
- **Exemplo:**
```bash
curl -s "$BASE/api/drive/conectar" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/drive/desconectar`
- **Quem pode:** adm
- **O que faz:** solta a conexão com o Google Drive guardada no sistema.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 403 se o perfil não for `adm`; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** apaga as configs `drive_refresh`, `drive_email` e `drive_raiz_id` e limpa o token em memória; grava `auditoria` com ação `drive_desconectado`. Os arquivos já enviados ao Drive **continuam lá** (os `drive_id`/`drive_link` em `arquivos` não são apagados).
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/drive/desconectar" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/drive/enviar-pendentes`
- **Quem pode:** adm, gestor
- **O que faz:** sobe para o Drive todos os arquivos que estão guardados no sistema e ainda não foram enviados.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "enviados": 12, "pendentes": 1, "erros": ["Arquivo contrato.pdf sem conteúdo guardado."] }
```
`erros` traz no máximo 3 mensagens.
- **Erros:** 400 "Conecte o Google Drive primeiro."; 403 se o perfil for `corretor`; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** para cada arquivo com `drive_id` vazio e sem `url_externa`, cria a pasta do imóvel se faltar e **envia o arquivo ao Google Drive**, gravando `drive_id` e `drive_link`. Pode criar pastas e subpastas no Drive. Não grava auditoria. Pode demorar: percorre todos os pendentes em sequência.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/drive/enviar-pendentes" -H "Authorization: Bearer $CHAVE"
```

## Leads, visitas e WhatsApp (`src/routes/leads.js`)

Montado em `/api`. Escopo de chave de API: `crm` (`/api/leads*`, `/api/visitas*`, `/api/whats*`). As rotas com `:id`/`:leadId` de lead passam por `leadPermitido`: o lead precisa existir (senão 404) e, para `corretor`, precisa ter `corretor_id` igual ao do usuário (senão 403 "Este lead é de outro corretor.").

Valores aceitos no arquivo: `etapa` entre `novo`, `qualificado`, `visita`, `proposta`, `escritura`, `perdido`; `temperatura` entre `quente`, `morno`, `frio`; status de visita entre `agendada`, `confirmada`, `realizada`, `cancelada`.

### `GET /api/leads`
- **Quem pode:** adm, gestor, corretor (corretor só vê os próprios leads)
- **O que faz:** lista os leads com o corretor e a última mensagem trocada, ordenados pelo último contato. Limite fixo de 1.000.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `q` | texto | não | busca por nome, telefone ou texto da busca do cliente (`LIKE`) |

- **Resposta:**
```json
[ { "id": 12, "nome": "Carlos", "telefone": "5519900000002", "email": null, "origem": "Site da imobiliária", "etapa": "novo", "temperatura": "quente", "busca": "4 quartos perto do Dom Pedro", "tipo_desejado": "Apartamento", "quartos_min": 4, "vagas_min": 2, "valor_max": 2500000, "bairros": "Dom Pedro", "nao_contatar": 0, "corretor_id": 2, "criado_em": "2026-10-20 10:00:00", "ultimo_contato": "2026-10-30 08:40:00", "corretor_nome": "Marina", "ultima_msg": "Ainda está disponível?" } ]
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/leads?q=Carlos" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/leads`
- **Quem pode:** adm, gestor, corretor — corretor sempre fica como o `corretor_id` do lead; adm e gestor podem escolher ou deixar sem corretor
- **O que faz:** cadastra um lead (comprador) com o que ele procura.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `nome` | texto | sim | cortado em 120 caracteres |
| `telefone` | texto | não | normalizado para só dígitos com DDI 55 na frente quando tem 10 ou 11 dígitos. Precisa ser único |
| `email` | texto | não | cortado em 120 |
| `origem` | texto | não | cortada em 60 |
| `etapa` | texto | não | padrão `novo` |
| `temperatura` | texto | não | padrão `morno` |
| `busca` | texto | não | cortada em 500 |
| `tipo_desejado` | texto | não | cortado em 60 |
| `quartos_min`, `vagas_min` | inteiro | não | padrão `NULL` |
| `valor_max` | número | não | padrão `NULL` |
| `bairros` | texto | não | cortado em 300; vários separados por `,` ou `;` |
| `nao_contatar` | booleano | não | padrão 0 |
| `corretor_id` | inteiro | não | só adm/gestor; padrão `NULL` para eles, o próprio id para corretor |

- **Resposta:**
```json
{ "id": 25 }
```
- **Erros:** 400 "Informe o nome do cliente."; 400 "Etapa inválida."; 400 "Temperatura inválida."; 409 "Já existe um lead com este telefone."; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** insere em `leads` com `ultimo_contato` = agora e insere em `interacoes` uma linha tipo `sistema` ("Lead cadastrado por …"). Não grava auditoria.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/leads" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' \
  -d '{"nome":"Carlos","telefone":"19900000002","valor_max":2500000,"quartos_min":4,"bairros":"Dom Pedro"}'
```

### `GET /api/leads/:id`
- **Quem pode:** adm, gestor, corretor (dono do lead)
- **O que faz:** a ficha do lead com as 100 últimas interações, as visitas e até 8 imóveis sugeridos pelo match.
- **Entrada:** nenhuma
- **Resposta:**
```json
{
  "id": 12, "nome": "Carlos", "telefone": "5519900000002", "etapa": "novo", "temperatura": "quente",
  "busca": "4 quartos perto do Dom Pedro", "valor_max": 2500000, "corretor_id": 2, "corretor_nome": "Marina",
  "interacoes": [ { "id": 88, "lead_id": 12, "tipo": "nota", "texto": "Prefere andar alto.", "autor_id": 1, "criado_em": "2026-10-29 16:00:00", "autor": "Thiago" } ],
  "visitas": [ { "id": 7, "lead_id": 12, "imovel_id": 1, "corretor_id": 2, "data_hora": "2026-10-31 10:00:00", "status": "confirmada", "avaliacao": null, "codigo": "AP0001", "capa": 12 } ],
  "imoveis": [ { "id": 1, "codigo": "AP0001", "tipo": "Apartamento", "condominio": "Rossi Antilhas", "bairro": "Mansões Santo Antônio", "valor": 2250000, "quartos": 4, "capa": 12, "n_fotos": 8, "score": 92, "motivos": ["cabe na verba","4 quartos"] } ]
}
```
- **Erros:** 404 lead não encontrado; 403 lead de outro corretor; 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/leads/12" -H "Authorization: Bearer $CHAVE"
```

### `PUT /api/leads/:id`
- **Quem pode:** adm, gestor, corretor (dono do lead). Corretor não troca o `corretor_id`: o valor atual é mantido
- **O que faz:** regrava a ficha do lead. Diferente dos imóveis, o corpo é mesclado em cima do lead atual, então os campos ausentes mantêm o valor que já estava.
- **Entrada:** os mesmos campos de `POST /api/leads`, todos opcionais. `nome` precisa continuar preenchido.
- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 400 "Informe o nome do cliente."; 400 etapa/temperatura inválida; 404 lead não encontrado; 403 lead de outro corretor; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** atualiza `leads`. Se a etapa mudou, insere em `interacoes` uma linha tipo `etapa` ("Etapa: novo → qualificado"). Se o corretor mudou, insere uma linha tipo `sistema` ("Lead transferido de corretor."). Não grava auditoria. Não confere telefone duplicado nesta rota.
- **Exemplo:**
```bash
curl -s -X PUT "$BASE/api/leads/12" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"etapa":"qualificado","temperatura":"quente"}'
```

### `PATCH /api/leads/:id/etapa`
- **Quem pode:** adm, gestor, corretor (dono do lead)
- **O que faz:** muda só a etapa do lead no funil.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `etapa` | texto | sim | um de `novo`, `qualificado`, `visita`, `proposta`, `escritura`, `perdido` |

- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 400 "Etapa inválida."; 404 lead não encontrado; 403 lead de outro corretor; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** se a etapa for diferente da atual, atualiza `leads.etapa` e insere em `interacoes` uma linha tipo `etapa`. Se for a mesma, nada é gravado. Não grava auditoria.
- **Exemplo:**
```bash
curl -s -X PATCH "$BASE/api/leads/12/etapa" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"etapa":"proposta"}'
```

### `POST /api/leads/:id/nota`
- **Quem pode:** adm, gestor, corretor (dono do lead)
- **O que faz:** grava uma anotação no histórico do lead.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `texto` | texto | sim | cortado em 2.000 caracteres; vazio é recusado |

- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 400 "Escreva a anotação."; 404 lead não encontrado; 403 lead de outro corretor; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** insere em `interacoes` uma linha tipo `nota` com o autor.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/leads/12/nota" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"texto":"Prefere andar alto e vaga coberta."}'
```

### `GET /api/visitas`
- **Quem pode:** adm, gestor, corretor (corretor só vê as visitas em que é o corretor)
- **O que faz:** lista as visitas dos últimos 30 dias em diante, com lead, imóvel, condomínio, corretor e capa do imóvel.
- **Entrada:** nenhuma
- **Resposta:**
```json
[ { "id": 7, "lead_id": 12, "imovel_id": 1, "corretor_id": 2, "data_hora": "2026-10-31 10:00:00", "status": "confirmada", "avaliacao": null, "criado_em": "2026-10-29 09:00:00", "lead": "Carlos", "telefone": "5519900000002", "codigo": "AP0001", "logradouro": "Rua Exemplo das Antilhas", "numero": "200", "condominio": "Rossi Antilhas", "corretor": "Marina", "capa": 12 } ]
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/visitas" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/visitas`
- **Quem pode:** adm, gestor, corretor (precisa ter acesso ao lead). Corretor é sempre gravado como o corretor da visita; adm e gestor podem escolher
- **O que faz:** agenda uma visita de um lead a um imóvel e já move o lead para a etapa `visita` quando ele estava em `novo` ou `qualificado`.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `lead_id` | inteiro | sim | lead que vai visitar (passa por `leadPermitido`) |
| `imovel_id` | inteiro | sim | imóvel a visitar. **Não** passa por `imovelPermitido`: só precisa existir |
| `data_hora` | texto | sim | exatamente no formato `AAAA-MM-DDTHH:MM`; é guardado com espaço no lugar do `T` |
| `corretor_id` | inteiro | não | só adm/gestor; padrão: o corretor do lead, ou o próprio usuário se o lead não tiver |

- **Resposta:**
```json
{ "id": 9 }
```
- **Erros:** 400 "Informe data e hora da visita." (formato fora do padrão); 404 "Imóvel não encontrado."; 404 lead não encontrado; 403 lead de outro corretor; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** insere em `visitas` (status padrão do banco), insere em `interacoes` uma linha tipo `visita` e, quando a etapa do lead era `novo` ou `qualificado`, atualiza `leads.etapa` para `visita`. Não grava auditoria e não manda nenhum aviso ao cliente.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/visitas" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"lead_id":12,"imovel_id":1,"data_hora":"2026-11-05T10:00"}'
```

### `PATCH /api/visitas/:id`
- **Quem pode:** adm, gestor, corretor — corretor só na visita em que é o corretor (403 "Visita de outro corretor.")
- **O que faz:** confirma, conclui ou cancela uma visita e grava a avaliação.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `status` | texto | não | `agendada`, `confirmada`, `realizada` ou `cancelada`. Ausente mantém o atual |
| `avaliacao` | texto | não | cortada em 500 caracteres. Ausente mantém a atual |

- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 404 "Visita não encontrada."; 403 "Visita de outro corretor."; 400 "Status inválido."; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** atualiza `visitas` (campos ausentes com `coalesce`). Quando vem `status`, insere em `interacoes` uma linha tipo `visita` no histórico do lead ("Visita realizada: gostou da vista."). Não grava auditoria.
- **Exemplo:**
```bash
curl -s -X PATCH "$BASE/api/visitas/7" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"status":"realizada","avaliacao":"Gostou da vista, achou o valor alto."}'
```

### `GET /api/whats`
- **Quem pode:** adm, gestor, corretor (corretor só vê as conversas dos próprios leads)
- **O que faz:** a lista de conversas de WhatsApp (até 200), com a última mensagem de cada uma e se há sugestão da IA esperando aprovação. Informa também o modo do WhatsApp e o modo da IA.
- **Entrada:** nenhuma
- **Resposta:**
```json
{
  "modo": "simulado", "ia": "sugerir",
  "conversas": [ { "id": 12, "nome": "Carlos", "telefone": "5519900000002", "temperatura": "quente", "nao_contatar": 0, "agente": null, "corretor": "Marina", "ultima": "Ainda está disponível?", "direcao": "entrada", "criado_em": "2026-10-30 08:40:00", "tem_sugestao": 1 } ]
}
```
`modo` é `oficial` quando `WA_TOKEN` e `WA_PHONE_ID` estão no `.env`, senão `simulado`.
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/whats" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/whats/:leadId`
- **Quem pode:** adm, gestor, corretor (dono do lead)
- **O que faz:** devolve a ficha do lead e todas as mensagens da conversa, em ordem.
- **Entrada:** nenhuma
- **Resposta:**
```json
{
  "lead": { "id": 12, "nome": "Carlos", "telefone": "5519900000002", "etapa": "novo", "nao_contatar": 0, "agente": null },
  "mensagens": [
    { "id": 301, "lead_id": 12, "telefone": "5519900000002", "direcao": "entrada", "texto": "Ainda está disponível?", "status": "recebida", "wa_id": "wamid.X", "autor": "Carlos", "criado_em": "2026-10-30 08:40:00" },
    { "id": 302, "lead_id": 12, "direcao": "sugestao", "texto": "Oi, Carlos! Sim, o AP0001 está disponível…", "status": "aguardando aprovação", "autor": "IA Herrera HOUSE IA" }
  ]
}
```
- **Erros:** 404 lead não encontrado; 403 lead de outro corretor; 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/whats/12" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/whats/:leadId/enviar`
- **Quem pode:** adm, gestor, corretor (dono do lead)
- **O que faz:** manda uma mensagem de WhatsApp para o lead. Se o lead está sendo atendido por um agente do escritório virtual com a linha conectada, a mensagem entra na fila da linha daquele agente; senão sai pela API oficial (ou fica como `simulado`).
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `texto` | texto | sim | cortado em 4.000 caracteres; vazio é recusado |
| `da_ia` | booleano | não | padrão ausente. Só muda o autor registrado, para marcar que o texto veio de uma sugestão aprovada |

- **Resposta:**
```json
{ "ok": true, "status": "enviado" }
```
`status` pode ser `enviado` (API oficial), `simulado` (sem credenciais) ou `"na fila do <nome do agente>"` quando sai pela linha do agente.
- **Erros:** 400 "Escreva a mensagem."; 400 "Este cliente pediu para não receber mensagens." (lead com `nao_contatar`); 400 "Lead sem telefone."; 404 lead não encontrado; 403 lead de outro corretor; 401 sem sessão; 403 origem não permitida. No modo oficial, erro da Meta vira 500, com mensagem própria quando a janela de 24 h fechou ("Passaram mais de 24h desde a última mensagem do cliente…").
- **Efeitos:** **manda mensagem de WhatsApp de verdade** quando o modo é `oficial`. Pelo caminho do agente: marca como `substituida` as saídas do agente que estavam esperando aprovação, insere em `agente_mensagens` com status `fila` e apaga as sugestões (`mensagens` com `direcao='sugestao'`) daquele lead. Pelo caminho normal: apaga as sugestões, insere em `mensagens` a linha de saída com o status do envio e o `wa_id`, e atualiza `leads.ultimo_contato`. Não grava auditoria.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/whats/12/enviar" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"texto":"Oi, Carlos! Sim, o AP0001 está disponível."}'
```

### `POST /api/whats/:leadId/sugerir`
- **Quem pode:** adm, gestor, corretor (dono do lead)
- **O que faz:** pede à IA local (Ollama) uma sugestão de resposta para a conversa, usando só os imóveis publicados como catálogo.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "ok": true }
```
O texto não vem na resposta: ele é gravado como mensagem com `direcao: "sugestao"` e aparece em `GET /api/whats/:leadId`.
- **Erros:** 503 "IA local indisponível. Abra o Ollama no PC e tente de novo." (Ollama fora do ar ou sem texto gerado); 404 lead não encontrado; 403 lead de outro corretor; 401 sem sessão; 403 origem não permitida. Se o Ollama responder com erro HTTP, sai 500 com a mensagem do serviço.
- **Efeitos:** chama o Ollama (`$OLLAMA_URL/api/chat`, tempo máximo 90 s). Apaga as sugestões antigas daquele lead e insere uma nova em `mensagens` com `direcao='sugestao'` e status "aguardando aprovação". **Atenção:** se `IA_MODO` estiver em `automatico`, a função de geração **envia a mensagem direto ao cliente** pelo WhatsApp em vez de guardar como sugestão.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/whats/12/sugerir" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/whats/simular`
- **Quem pode:** adm, gestor, corretor — só funciona quando o WhatsApp está em modo `simulado` (sem `WA_TOKEN`/`WA_PHONE_ID`)
- **O que faz:** finge que chegou uma mensagem de WhatsApp, para testar o atendimento sem a API da Meta.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `telefone` | texto | sim | 10 dígitos ou mais depois de tirar o que não é número |
| `texto` | texto | sim | cortado em 2.000 caracteres |
| `nome` | texto | não | cortado em 80. Padrão: o lead novo recebe o nome `WhatsApp <4 últimos dígitos>` |

- **Resposta:**
```json
{ "lead_id": 12 }
```
- **Erros:** 400 "Simulação só funciona sem a API oficial configurada."; 400 "Informe telefone com DDD e a mensagem."; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** é o mesmo caminho de uma mensagem recebida de verdade. Acha o lead pelo telefone ou **cria um lead novo** (origem `WhatsApp`, etapa `novo`, temperatura `morno`, distribuído por rodízio ao corretor ativo com menos leads em aberto) com uma interação de sistema; insere a mensagem de entrada em `mensagens`; atualiza `leads.ultimo_contato`. Se o texto contiver `OP-<número>`, liga a resposta à oportunidade do Radar: insere em `oportunidade_eventos`, atualiza a oportunidade (telefone do titular, status para `em_contato`) e muda origem e corretor do lead. Se o texto for exatamente `parar`/`pare`/`sair`/`stop`/`descadastrar`, marca `leads.nao_contatar=1`, grava interação e **descarta** as oportunidades daquele telefone (motivo `nao_contatar`). Fora desses casos, se `IA_MODO` não for `desligado`, dispara a geração de sugestão pela IA — e em `IA_MODO=automatico` isso **envia a resposta ao cliente** (no modo simulado o envio não sai de fato).
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/whats/simular" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"telefone":"19900000002","nome":"Carlos","texto":"Vi o AP0001, aceita financiamento?"}'
```

## Painel do administrador (`src/routes/dashboard.js`)

Montado em `/api`. Escopo de chave de API: `painel`.

### `GET /api/painel/adm`
- **Quem pode:** adm, gestor
- **O que faz:** devolve, numa resposta só, o retrato da imobiliária no período escolhido: carteira (VGV, ticket, R$/m², por status, tipo, bairro e faixa de valor), leads e funil, visitas, atendimento no WhatsApp, radar de captação, autorizações e links, desempenho por corretor, uma lista de pendências que pedem ação e a comparação com o período anterior. Os gráficos de evolução vêm em 12 semanas (segunda a domingo). Todas as datas são calculadas no fuso `America/Sao_Paulo`.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `dias` | inteiro | não | padrão **30**. Só aceita 7, 30, 90 ou 365; qualquer outro valor cai para 30 |

- **Resposta:**
```json
{
  "dias": 30, "periodo": { "ini": "2026-09-30", "fim": "2026-10-30" }, "gerado": "2026-10-30 09:41:12",
  "carteira": { "ativos": 42, "aVenda": 18, "vgv": 38500000, "vgvAtivo": 61200000, "ticket": 2138888, "m2": 10420, "exclusivos": 9, "pctExclusivo": 21.4, "novos": 6, "novosAnt": 4, "vendidos": 2, "vendidosAnt": 1, "vgvVendido": 4100000, "vgvVendidoAnt": 1950000,
    "porStatus": [ { "status": "captacao", "n": 14, "vgv": 18200000 } ],
    "porTipo": [ { "tipo": "Apartamento", "n": 11 } ],
    "porBairro": [ { "bairro": "Cambuí", "n": 5, "vgv": 9800000 } ],
    "porFaixa": [ { "faixa": "até 500 mil", "n": 1 } ] },
  "leads": { "ativos": 23, "novos": 11, "novosAnt": 8, "quentes": 4, "semCorretor": 2, "portal": 3,
    "funil": [ { "etapa": "novo", "n": 9 } ], "conversao": 6.2, "perdidos": 14,
    "temperatura": [ { "t": "quente", "n": 4 } ], "origens": [ { "origem": "ZAP Imóveis", "n": 5 } ],
    "semanas": [ { "ini": "2026-08-10", "fim": "2026-08-16", "n": 2 } ] },
  "visitas": { "realizadas": 7, "realizadasAnt": 5, "canceladas": 2, "comparecimento": 77.8, "proximas7": 3, "naoConfirmadasAmanha": 1,
    "semanas": [ { "ini": "2026-08-10", "fim": "2026-08-16", "n": 1 } ],
    "proximas": [ { "data_hora": "2026-10-31 10:00:00", "codigo": "AP0001", "lead": "Carlos", "corretor": "Marina", "status": "confirmada", "imovel_id": 1 } ] },
  "atendimento": { "recebidas": 88, "enviadas": 71, "conversas": 19, "esperando": 4, "esperando24": 1, "sugestoes": 2, "tempoMediano": 18, "respondidas": 46 },
  "radar": { "andamento": 31, "particulares": 12, "novas": 20, "novasAnt": 17, "novasParticular": 7, "quedasPreco": 3, "cartas": 5, "captadas": 1, "captadasTotal": 6, "gasto": 42.5, "custoCaptacao": 31, "aprovacoes": 2, "aprovacoesValor": 60,
    "livres": 4, "funil": [ { "status": "nova", "n": 12 } ], "porPortal": [ { "portal": "OLX", "n": 8 } ],
    "semanas": [ { "ini": "2026-08-10", "fim": "2026-08-16", "n": 3 } ] },
  "docs": { "pendentes": 3, "pendentes7": 1, "assinadas": 2, "assinadasAnt": 1, "acessos": 24, "acessosAnt": 18, "linksAtivos": 6 },
  "equipe": [ { "id": 2, "nome": "Marina", "perfil": "corretor", "imoveis": 9, "vgv": 14200000, "exclusivos": 4, "leads": 11, "quentes": 3, "novosLeads": 5, "propostas": 1, "visitas": 4, "vendas": 1, "respostas": 38, "esperando": 2, "captacoes": 1 } ],
  "pendencias": [ { "nivel": "bad", "n": 1, "texto": "cliente(s) esperando resposta no WhatsApp há mais de 24 h", "href": "#/whats" } ],
  "variacoes": { "novosImoveis": 50, "vendidos": 100, "vgvVendido": 110, "novosLeads": 38, "visitas": 40, "assinadas": 100, "acessos": 33 },
  "atividade": [ { "acao": "imovel_status", "detalhe": "AP0001 → publicado", "em": "2026-10-30 09:41:00", "nome": "Thiago" } ]
}
```
`nivel` das pendências é `bad`, `warn` ou `info`. Em `variacoes`, o valor é a variação percentual; vem `null` quando não havia base de comparação e 0 quando os dois períodos estavam zerados. `comparecimento`, `pctExclusivo`, `conversao` e `m2` vêm `null` quando não há dados suficientes.
- **Erros:** 403 se o perfil for `corretor`; 401 sem sessão.
- **Efeitos:** só leitura. São cerca de 18 consultas grandes (a de mensagens é limitada a 30.000 linhas) e as contas são feitas em memória, para o mesmo código servir ao SQLite do PC e ao Postgres online.
- **Exemplo:**
```bash
curl -s "$BASE/api/painel/adm?dias=90" -H "Authorization: Bearer $CHAVE"
```

## Chat interno (`src/routes/chat.js`)

Montado em `/api`. Escopo de chave de API: `crm` (`/api/chat*`). O router repete o `exigeLogin` em `/chat` para o caso de ser montado isoladamente — e esse `exigeLogin` já aceita quem entrou pela chave de API, porque ele devolve logo no começo quando `req.usuario` está preenchido. Toda rota com `:id` de conversa passa por `acesso()`: o usuário precisa constar em `chat_participantes` daquela conversa (senão 403 "Você não participa desta conversa.").

Os participantes podem ser pessoas (`usuario_id`) ou os agentes robôs do escritório virtual (`agente`, pelo *slug*: `captador`, `apartamentos`, `comerciais`, `terrenos`, `casas`, `alto-padrao`, `offmarket` e os demais do catálogo). Identificadores em rota ou query precisam ser só dígitos e inteiros seguros, senão 400 "Identificador inválido.".

Quase toda rota de chat chama `C.espelha(usuario_id)`, que copia para `chat_mensagens` as respostas que os agentes já produziram em `agente_mensagens` — ou seja, mesmo os `GET` do chat **gravam** no banco.

### `GET /api/chat/caixa`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** a caixa de entrada do chat: as conversas do usuário com a contagem de não lidas, a lista de contatos disponíveis (usuários ativos e os agentes robôs) e o cursor para o *polling*.
- **Entrada:** nenhuma
- **Resposta:**
```json
{
  "ate": 918,
  "conversas": [ { "id": 3, "tipo": "direta", "titulo": null, "criado_por": 1, "criado_em": "2026-10-28 10:00:00", "ultima_em": "2026-10-30 09:30:00", "silenciado": 0, "nao_lidas": 2,
    "participantes": [ { "usuario_id": 1, "agente": null, "nome": "Thiago", "foto": null, "iniciais": "TH", "lido_ate": 916, "silenciado": 0 },
                       { "usuario_id": null, "agente": "apartamentos", "nome": "Ana", "foto": "/plataforma/agentes/apartamentos.jpg", "lido_ate": 0, "silenciado": 0 } ] } ],
  "contatos": [ { "usuario_id": 2, "agente": null, "nome": "Marina", "foto": null, "iniciais": "MA" },
                { "usuario_id": null, "agente": "captador", "nome": "TH-IA-GO", "foto": "/plataforma/agentes/captador.jpg" } ],
  "nao_lidas_total": 2
}
```
O campo interno `par` da conversa nunca sai na resposta.
- **Erros:** 401 sem sessão.
- **Efeitos:** roda o espelhamento, que pode **inserir** linhas em `chat_mensagens` a partir de `agente_mensagens` (até 200 por chamada). O `ate` é lido **antes** da caixa, de propósito, para nenhuma mensagem se perder no *polling*.
- **Exemplo:**
```bash
curl -s "$BASE/api/chat/caixa" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/chat/conversas`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** abre uma conversa direta (duas pessoas ou uma pessoa e um robô) ou uma sala com título. Conversa direta é única: se já existir, devolve a que existe em vez de criar outra.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `tipo` | texto | sim | `direta` ou `sala` |
| `com` | lista | sim | de 1 a 100 itens; cada item é um id numérico de usuário ou o *slug* de um agente. O próprio usuário é descartado da lista e duplicatas são unificadas. Em `direta`, tem de sobrar exatamente 1 contato |
| `titulo` | texto | não | cortado em 100 caracteres. Obrigatório para `sala`; em `direta` é guardado como `NULL` quando vazio |

- **Resposta:**
```json
{ "id": 3, "tipo": "direta", "titulo": null,
  "participantes": [ { "usuario_id": 1, "agente": null, "nome": "Thiago", "foto": null, "iniciais": "TH", "lido_ate": 0, "silenciado": 0 },
                     { "usuario_id": null, "agente": "apartamentos", "nome": "Ana", "foto": "/plataforma/agentes/apartamentos.jpg", "lido_ate": 0, "silenciado": 0 } ] }
```
- **Erros:** 400 "Escolha o tipo e os participantes."; 400 "Usuário indisponível nesta imobiliária." (id que não existe; para corretor, também usuário inativo — adm e gestor podem incluir inativo); 400 "Contato inválido." (nem id numérico nem *slug* de agente); 400 "Uma conversa direta precisa de outro contato."; 400 "Dê um título à sala."; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** insere em `chat_conversas` (com a chave `par` ordenada, que garante uma só conversa direta por par, mesmo em chamadas simultâneas) e insere todos os participantes em `chat_participantes` numa única instrução.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/chat/conversas" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"tipo":"sala","titulo":"Captação Cambuí","com":[2,"captador"]}'
```

### `GET /api/chat/conversas/:id`
- **Quem pode:** adm, gestor, corretor — só quem participa da conversa
- **O que faz:** abre a conversa, devolve até 80 mensagens e marca como lidas as que foram entregues. Serve tanto para paginar para trás (`antes`) quanto para buscar o que chegou depois (`desde`).
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `desde` | inteiro | não | padrão 0. Devolve as mensagens com id maior, em ordem crescente |
| `antes` | inteiro | não | padrão 0. Devolve as mensagens com id menor (página anterior) |

Não se pode usar os dois ao mesmo tempo. Sem nenhum dos dois, traz as 80 mais recentes.
- **Resposta:**
```json
{
  "conversa": { "id": 3, "tipo": "sala", "titulo": "Captação Cambuí", "criado_por": 1, "criado_em": "2026-10-28 10:00:00", "ultima_em": "2026-10-30 09:30:00" },
  "mensagens": [ { "id": 917, "conversa_id": 3, "de_usuario": 1, "de_agente": null, "tipo": "texto", "texto": "Alguém falou com o dono do 1100?", "arquivo_id": null, "criado_em": "2026-10-30 09:28:00",
      "remetente": { "usuario_id": 1, "agente": null, "nome": "Thiago", "foto": null, "iniciais": "TH" } },
    { "id": 918, "conversa_id": 3, "de_usuario": null, "de_agente": "captador", "texto": "Falei ontem; pediu para ligar hoje à tarde.",
      "remetente": { "usuario_id": null, "agente": "captador", "nome": "TH-IA-GO", "foto": "/plataforma/agentes/captador.jpg" } } ],
  "mais": false,
  "participantes": [ { "usuario_id": 1, "agente": null, "nome": "Thiago", "foto": null, "iniciais": "TH", "lido_ate": 918, "silenciado": 0 } ],
  "digitando": ["captador"],
  "nao_lidas_total": 0
}
```
`mais` é `true` quando havia mais de 80 mensagens na faixa pedida. `digitando` traz os *slugs* dos agentes com mensagem de entrada ainda não processada nesta conversa.
- **Erros:** 400 "Identificador inválido."; 400 "Use desde ou antes, separadamente."; 403 "Você não participa desta conversa."; 401 sem sessão.
- **Efeitos:** roda o espelhamento (pode inserir em `chat_mensagens`) e **atualiza** `chat_participantes.lido_ate` do usuário até o último id devolvido.
- **Exemplo:**
```bash
curl -s "$BASE/api/chat/conversas/3?desde=916" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/chat/conversas/:id/mensagens`
- **Quem pode:** adm, gestor, corretor — só quem participa da conversa
- **O que faz:** manda uma mensagem na conversa. Se ela começar com `tarefa:`, o resto do texto é registrado como tarefa para cada agente da conversa executar no PC dele. Sem o prefixo, os agentes da conversa são acionados para responder, e a resposta deles aparece no chat depois.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `texto` | texto | sim | de 1 a 4.000 caracteres depois de tirar os espaços das pontas. Começando com `tarefa:` (sem diferenciar maiúsculas), o que vem depois é a tarefa e precisa ter 8 caracteres ou mais |

- **Resposta:**
```json
{ "id": 919, "conversa_id": 3, "digitando": ["captador"] }
```
- **Erros:** 400 "Identificador inválido."; 400 "Escreva de 1 a 4.000 caracteres."; 400 "Descreva a tarefa com pelo menos 8 caracteres."; 403 "Você não participa desta conversa."; 401 sem sessão; 403 origem não permitida.
- **Efeitos:** insere em `chat_mensagens`. Para cada agente participante, insere a entrada em `agente_mensagens` (telefone fictício `chat-<conversa>-<slug>`). Com `tarefa:`, insere em `agente_tarefas` (pedido cortado em 3.000 caracteres), insere um evento do agente em `agente_eventos`, marca a entrada como processada e enfileira a saída de confirmação ("Recebi a tarefa. O resultado aparecerá aqui quando o meu PC terminar."). Sem `tarefa:`, carrega a chave central da IA e, quando a IA está na nuvem, roda o ciclo do cérebro de cada agente com orçamento compartilhado de **40 segundos** — o que pode gerar respostas, notas e outras gravações do escritório virtual, inclusive mensagens para clientes quando o agente estiver em modo automático. No fim, roda o espelhamento.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/chat/conversas/3/mensagens" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"texto":"tarefa: levantar os apartamentos de 3 quartos no Cambuí abaixo de 1,2 mi"}'
```

### `GET /api/chat/novidades`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** espera por mensagens novas em qualquer conversa do usuário (*long polling*). Fica até 25 segundos verificando a cada segundo; responde na hora se já houver novidade.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `desde` | inteiro | não | padrão 0. Último id de mensagem já conhecido pela tela |

- **Resposta:** até 80 mensagens, no mesmo formato de `GET /api/chat/conversas/:id`.
```json
{ "ate": 920, "mensagens": [ { "id": 920, "conversa_id": 3, "de_agente": "captador", "texto": "Terminei o levantamento: 6 apartamentos.", "remetente": { "usuario_id": null, "agente": "captador", "nome": "TH-IA-GO", "foto": "/plataforma/agentes/captador.jpg" } } ], "nao_lidas_total": 1 }
```
Esgotado o tempo sem novidade, responde com `mensagens: []` e `ate` igual ao `desde` recebido.
- **Erros:** 400 "Identificador inválido."; 401 "Sessão expirada." — a sessão é reconferida em cada volta do laço, então a revogação do acesso ou a desativação do usuário valem até durante a espera.
- **Efeitos:** roda o espelhamento em cada volta do laço (pode inserir em `chat_mensagens`). Não marca nada como lido. Se o cliente fecha a conexão, o laço é interrompido.
- **Exemplo:**
```bash
curl -s "$BASE/api/chat/novidades?desde=918" -H "Authorization: Bearer $CHAVE"
```
## Radar de captação (`src/routes/radar.js`)

Montado em `/api` (`server.js`: `app.use('/api', require('./src/routes/radar'))`).

Entrada em todas as rotas `/api` deste documento, nesta ordem (`server.js`):

1. **Chave de API** (`api-ia.porChave`): `Authorization: Bearer hh_<prefixo>_<segredo>` ou o cabeçalho `x-api-key`. A chave resolve o usuário (ela pertence a um usuário, com o perfil dele), dispensa o cookie e dispensa a checagem de CSRF. Erros próprios: 401 `Chave de API inválida, revogada ou vencida.`; 403 `Esta chave só vale nos endereços de IP autorizados.`; 429 `Limite de N chamadas por minuto para esta chave.`; 403 `Chave somente de leitura.` em qualquer método que não seja GET/HEAD; 403 `Esta chave não tem o escopo "captacao". …` — **todas as rotas de radar, fisguei, captação, mercado, fachada e mapas usam o escopo `captacao`**. Cada chamada por chave é registrada em `api_log`.
2. **`mesmaOrigem`**: bloqueia escrita vinda de outro site (403 `Origem não permitida.` / `Origem inválida.`). Pulado para GET/HEAD/OPTIONS e para quem entrou por chave de API.
3. **`exigeLogin`**: quem não entrou por chave precisa do cookie de sessão `hh_sessao` válido, senão 401 `Sessão expirada. Entre novamente.`

Quando a rota não chama `A.exigePerfil`, qualquer perfil (`adm`, `gestor`, `corretor`) entra — mas `permitida()` barra o corretor em oportunidade de outro corretor (403 `Esta oportunidade é de outro corretor.`); `A.veTudo(u)` é verdadeiro para `adm` e `gestor`. Nos exemplos, `$CHAVE` é uma chave de API com o escopo `captacao`.

### `GET /api/radar/alertas`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Devolve a situação do radar automático: o monitor de e-mail (`services/alertas.status()`) somado ao monitor direto dos portais (`services/portais.status()`). Se o monitor de portais está ligado, acrescenta os problemas dele (erro da última rodada, monitor parado) à lista `saude.problemas` e recalcula `saude.ok`.
- **Entrada:** nenhuma
- **Resposta:**
```json
{
  "configurado": true,
  "email": "radar@exemplo.com.br",
  "pasta": "INBOX",
  "intervalo_min": 15,
  "rodando": false,
  "ultima": { "em": "2026-10-30T09:00:00.000Z", "novas": 3, "erro": null },
  "saude": { "ok": true, "problemas": [], "porPortal": {}, "ultimoAlerta": "2026-10-30T08:12:00.000Z", "horasSemAlerta": 1, "maxHoras": 24 },
  "hoje": 3,
  "portais": { "ligado": true, "intervalo_min": 60, "rodando": false, "ultima": { "em": "2026-10-30T09:10:00.000Z", "novas": 2, "erro": null }, "fila": 120, "parado": false, "fontes": ["Chaves na Mão"], "bairros": ["Cambuí"], "bloqueados": ["ZAP Imóveis", "Viva Real", "OLX", "Imovelweb"] }
}
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura (lê a tabela `config` e conta eventos do dia).
- **Exemplo:**
```bash
curl -s "$BASE/api/radar/alertas" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/radar/portais/ler`
- **Quem pode:** adm, gestor
- **O que faz:** Dispara na hora uma rodada do monitor direto dos portais (Chaves na Mão): lê `robots.txt`, o `sitemap-index.xml`, filtra os anúncios de Campinas nos bairros configurados e abre até 25 fichas novas por rodada, cadastrando o que achou como oportunidade.
- **Entrada:** nenhuma
- **Resposta:** (o campo `encontrados` é removido antes de responder)
```json
{ "em": "2026-10-30T12:00:00.000Z", "ok": true, "fonte": "Chaves na Mão", "lidos": 48210, "campinas": 912, "alvo": 37, "novas": 4, "precos": 1, "repetidos": 32, "fila": 118, "erro": null }
```
- **Erros:** 401 sem sessão; 403 perfil `corretor` (`Seu perfil não tem acesso a esta função.`); 500 em erro inesperado (erro da rodada volta dentro do campo `erro`, com status 200).
- **Efeitos:** faz requisições HTTP ao `chavesnamao.com.br` (robots.txt, sitemaps e páginas de anúncio, com pausa de 4 s entre páginas); grava novas linhas em `oportunidades` e `oportunidade_eventos` via `alertas.registra`; atualiza `valor`/`valor_anterior` quando o preço caiu; grava as chaves `portais_robots`, `portais_ids`, `portais_fila`, `portais_mapas` e `portais_status` em `config`; registra auditoria `radar_ler_portais` (e `radar_portais` quando houve novidade). Uma rodada já em andamento é reaproveitada (não dispara duas).
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/radar/portais/ler" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/radar/alertas/ler`
- **Quem pode:** adm, gestor
- **O que faz:** Dispara na hora a leitura da caixa de e-mail do radar (alertas dos portais) e cadastra as oportunidades encontradas.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `dias` | inteiro | não | Relê os últimos N dias. Limitado a 30 (`Math.min(30, …)`); 0, ausente ou não numérico vira `null` (leitura normal, só o que não foi lido). |

- **Resposta:** (o campo `encontrados` é removido antes de responder)
```json
{ "em": "2026-10-30T12:05:00.000Z", "ok": true, "emails": 6, "novas": 2, "precos": 0, "repetidos": 9, "erro": null }
```
- **Erros:** 401 sem sessão; 403 perfil `corretor`; 400 `Configure o e-mail do radar no .env (RADAR_EMAIL e RADAR_EMAIL_SENHA).` quando `alertas.configurado()` é falso.
- **Efeitos:** conecta no IMAP da conta configurada; grava oportunidades e eventos novos; atualiza as chaves `alertas_status`, `alertas_por_portal` em `config`; registra auditoria `radar_ler_alertas`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/radar/alertas/ler" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"dias":7}'
```

### `GET /api/radar`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Lista as oportunidades (até 500), já com referência `OP-nnnn`, pontuação de prioridade e aviso de bloqueio de contato, ordenadas da maior para a menor pontuação. Corretor vê só as suas e as sem corretor.
- **Entrada:** nenhuma
- **Query:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `status` | texto | não | Filtra por um status exato. Sem ele, o padrão exclui `captada` e `descartada`. |
| `q` | texto | não | Busca `LIKE` em título, bairro, nome do condomínio e logradouro. |

- **Resposta:**
```json
[
  {
    "id": 12,
    "titulo": "Apartamento 3 quartos Cambuí",
    "status": "nova",
    "bairro": "Cambuí",
    "valor": 1850000,
    "corretor_nome": "Júlia",
    "ultimo_evento": "2026-10-29 18:40:11",
    "ref": "OP-0012",
    "prioridade": { "pontos": 65, "nivel": "alta", "motivos": ["particular", "anúncio novo", "tem telefone"] },
    "bloqueio": null
  }
]
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/radar?status=nova&q=cambui" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/radar/resumo`
- **Quem pode:** adm, gestor, corretor (sem recorte por corretor: conta a base inteira)
- **O que faz:** Números do funil do radar: quantas oportunidades em cada status, quanto já se gastou em etapas pagas, custo por captação, aprovações pendentes e em que etapa cada captação foi fechada.
- **Entrada:** nenhuma
- **Resposta:**
```json
{
  "porStatus": { "nova": 41, "em_contato": 12, "carta_enviada": 5, "captada": 3, "descartada": 8 },
  "gasto": 184.5,
  "captadas": 3,
  "custoPorCaptacao": 61.5,
  "aprovacoesPendentes": 1,
  "captadasPorEtapa": [{ "etapa": "carta", "n": 2 }, { "etapa": "matricula", "n": 1 }]
}
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/radar/resumo" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/radar/aprovacoes`
- **Quem pode:** adm, gestor
- **O que faz:** Lista os pedidos de consulta paga (matrícula e birô) com status `pendente`, com os dados da oportunidade e quem pediu.
- **Entrada:** nenhuma
- **Resposta:**
```json
[
  {
    "id": 7,
    "oportunidade_id": 12,
    "tipo": "matricula",
    "custo_estimado": 85,
    "justificativa": "Dono não atende o telefone do anúncio.",
    "status": "pendente",
    "solicitante": "Júlia",
    "titulo": "Apartamento 3 quartos Cambuí",
    "bairro": "Cambuí",
    "valor": 1850000,
    "ref": "OP-0012"
  }
]
```
- **Erros:** 401 sem sessão; 403 perfil `corretor`.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/radar/aprovacoes" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/radar/cartas.pdf`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Gera um único PDF A4 com uma carta ao proprietário por página, para imprimir em lote. Pula as oportunidades sem logradouro, de imobiliária ou na lista não contatar.
- **Entrada:** nenhuma
- **Query:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `ids` | texto | sim | Ids de oportunidade separados por vírgula. Valores não numéricos são descartados; no máximo 200. |

- **Resposta:** corpo binário `application/pdf` (não é JSON), com `Content-Disposition: inline; filename="cartas-<cliente>-AAAA-MM-DD.pdf"`.
- **Erros:** 401 sem sessão; 400 `Escolha ao menos uma oportunidade.` quando `ids` fica vazio; 404 `Oportunidade não encontrada.`; 403 `Esta oportunidade é de outro corretor.`; 400 `Nenhuma das oportunidades escolhidas pode receber carta (sem endereço, de imobiliária ou na lista não contatar).`
- **Efeitos:** monta o PDF em memória com `pdfkit` e gera um QR code (`qrcode`) por carta, apontando para `https://wa.me/<WHATSAPP_CLIENTE ou telefone do corretor>` com texto já preenchido com a referência `OP-nnnn`. Não grava nada no banco e não marca a carta como enviada (isso é `POST /api/radar/:id/carta-enviada` ou `POST /api/radar/cartas-enviadas`).
- **Exemplo:**
```bash
curl -s "$BASE/api/radar/cartas.pdf?ids=12,13,14" -H "Authorization: Bearer $CHAVE" -o cartas.pdf
```

### `POST /api/radar`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Cadastra uma oportunidade à mão no radar, conferindo antes se não é duplicada de uma já existente.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `portal` | texto (60) | não | Portal de origem do anúncio. |
| `link` | texto (500) | não | Endereço do anúncio. |
| `titulo` | texto (200) | não | Título do anúncio. |
| `tipo` | texto (40) | não | Tipo do imóvel conforme o anúncio. |
| `bairro` | texto (80) | não | Bairro. |
| `logradouro` | texto (150) | não | Rua/avenida. |
| `numero` | texto (20) | não | Número. |
| `unidade` | texto (40) | não | Apartamento/unidade. |
| `condominio_nome` | texto (120) | não | Nome do condomínio. |
| `cidade` | texto (80) | não | Padrão: `cfg.CIDADE_PADRAO` (`Campinas`). |
| `quartos` | inteiro | não | |
| `vagas` | inteiro | não | |
| `area` | número | não | Aceita vírgula decimal (`num()`). |
| `valor` | número | não | |
| `valor_anterior` | número | não | Preço anterior (entra na pontuação de prioridade). |
| `anunciante_tipo` | texto | não | Só `particular`, `imobiliaria` ou `desconhecido`. Padrão: `particular`. |
| `anunciante_nome` | texto (120) | não | |
| `telefone_anuncio` | texto | não | Normalizado para `55DDDNNNNNNNN` (`wa.normTel`). |
| `publicado_em` | texto (10) | não | Data do anúncio, `AAAA-MM-DD`. |
| `observacoes` | texto (2000) | não | |
| `corretor_id` | inteiro | não | Só respeitado para adm/gestor; corretor fica sempre como responsável de si mesmo. |
| `forcar` | booleano | não | `true` cadastra mesmo com suspeita de duplicidade. |

- **Resposta:**
```json
{ "id": 57 }
```
- **Erros:** 401 sem sessão; 400 `Tipo de anunciante inválido.`; 400 `Informe ao menos o link, o título do anúncio ou o endereço.`; 409 `Parece a mesma oportunidade já cadastrada (OP-0012).` com o campo `duplicada` (id) quando há duplicata e `forcar` não veio.
- **Efeitos:** insere em `oportunidades`; grava um evento `sistema` (`Cadastrada por …`) em `oportunidade_eventos`; se `anunciante_tipo` é `imobiliaria`, grava um segundo evento avisando para não abordar o dono.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/radar" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' \
  -d '{"titulo":"Apto Cambuí","logradouro":"Rua Antônio Cesarino","numero":"686","bairro":"Cambuí","valor":1850000,"anunciante_tipo":"particular"}'
```

### `GET /api/radar/:id`
- **Quem pode:** adm, gestor, corretor (dono da oportunidade ou sem corretor)
- **O que faz:** Ficha completa da oportunidade: dados, prioridade, bloqueio de contato, histórico de eventos, aprovações, gasto, link de WhatsApp pronto para o telefone do anúncio e os custos padrão das etapas pagas.
- **Entrada:** nenhuma
- **Resposta:**
```json
{
  "id": 12,
  "ref": "OP-0012",
  "status": "em_contato",
  "prioridade": { "pontos": 65, "nivel": "alta", "motivos": ["particular"] },
  "bloqueio": null,
  "motivos_descarte": { "nao_contatar": "Pediu para não ser contatado", "imobiliaria": "Anunciado por imobiliária / exclusivo", "vendido": "Já vendido ou retirado", "sem_interesse": "Dono sem interesse", "duplicado": "Duplicado", "outro": "Outro" },
  "corretor_nome": "Júlia",
  "eventos": [{ "id": 31, "etapa": "anuncio", "texto": "Não atendeu / sem resposta", "custo": 0, "autor": "Júlia", "em": "2026-10-29 18:40:11" }],
  "aprovacoes": [],
  "gasto": 0,
  "whatsapp_anuncio": "https://wa.me/5519999990000?text=Ol%C3%A1!%20Vi%20o%20seu%20an%C3%BAncio...",
  "carta_sem_telefone": false,
  "custos_padrao": { "matricula": 0, "biro": 0 }
}
```
- **Erros:** 401 sem sessão; 404 `Oportunidade não encontrada.`; 403 `Esta oportunidade é de outro corretor.`
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/radar/12" -H "Authorization: Bearer $CHAVE"
```

### `PUT /api/radar/:id`
- **Quem pode:** adm, gestor, corretor (dono da oportunidade ou sem corretor)
- **O que faz:** Edita os dados cadastrais da oportunidade. O corpo é mesclado sobre o registro atual, então campos ausentes ficam como estavam.
- **Entrada:** os mesmos campos de `POST /api/radar` (todos opcionais), mais:

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `corretor_id` | inteiro ou `null` | não | Só adm/gestor podem trocar o responsável, e só se o campo vier no corpo. |
| `forcar` | booleano | não | `true` salva mesmo ficando igual a outra oportunidade. |

- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 401; 404; 403 (outro corretor); 400 `Tipo de anunciante inválido.`; 409 `Ficou igual à OP-0013.` com o campo `duplicada`.
- **Efeitos:** `UPDATE` em `oportunidades` e `atualizado_em` para agora. Não grava evento.
- **Exemplo:**
```bash
curl -s -X PUT "$BASE/api/radar/12" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"valor":1790000,"valor_anterior":1850000}'
```

### `POST /api/radar/:id/assumir`
- **Quem pode:** adm, gestor, corretor (dono da oportunidade ou sem corretor)
- **O que faz:** Põe quem chamou como corretor responsável pela oportunidade.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 401; 404; 403 (outro corretor); 409 `Já tem corretor responsável.` quando já existe corretor e quem chamou não é adm/gestor.
- **Efeitos:** grava `corretor_id` em `oportunidades`; grava evento `sistema` (`<nome> assumiu a oportunidade.`).
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/radar/12/assumir" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/radar/:id/evento`
- **Quem pode:** adm, gestor, corretor (dono da oportunidade ou sem corretor)
- **O que faz:** Registra uma tentativa gratuita de chegar ao dono (contato do anúncio, carta, placa/portaria) ou uma anotação livre, e move a oportunidade para `em_contato` quando ela ainda era `nova`.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `etapa` | texto | sim | Só `anuncio`, `carta`, `local` ou `nota`. |
| `resultado` | texto | não | Um de `atendeu_interessado`, `atendeu_sem_interesse`, `nao_atendeu`, `nao_e_dono`, `outro`. Vira a primeira parte do texto do evento. |
| `texto` | texto (800) | não | Descrição livre, juntada ao resultado com ` — `. Obrigatório quando `resultado` não veio (o evento não pode ficar sem texto). |

- **Resposta:**
```json
{ "ok": true, "converter": true }
```
(`converter` é `true` só quando `resultado` é `atendeu_interessado`, para a tela sugerir a captação)
- **Erros:** 401; 404; 403 (outro corretor); 400 `Etapa inválida.`; 400 com a mensagem do bloqueio de contato nas etapas `anuncio` e `local` (ex.: `Este telefone está na lista não contatar (pediu PARAR no WhatsApp).`); 400 `Anúncio de imobiliária: não abordamos o dono.` na etapa `anuncio`; 400 `Descreva o que aconteceu.` quando o texto final fica vazio.
- **Efeitos:** insere em `oportunidade_eventos` (custo 0); assume a oportunidade quando ela estava sem corretor; `resultado=nao_e_dono` marca `anunciante_tipo='imobiliaria'`; status vai para `em_contato` se era `nova` e a etapa não é `nota`; `atualizado_em` vira agora.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/radar/12/evento" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"etapa":"anuncio","resultado":"nao_atendeu","texto":"Liguei às 10h"}'
```

### `GET /api/radar/:id/carta.pdf`
- **Quem pode:** adm, gestor, corretor (dono da oportunidade ou sem corretor)
- **O que faz:** Gera o PDF A4 de uma carta ao proprietário desta oportunidade, com QR code do WhatsApp.
- **Entrada:** nenhuma
- **Resposta:** corpo binário `application/pdf`, com `Content-Disposition: inline; filename="carta-OP-0012.pdf"`.
- **Erros:** 401; 404; 403 (outro corretor); 400 `Informe o endereço (rua e número) para gerar a carta.`; 400 com a mensagem do bloqueio de contato; 400 `Anúncio de imobiliária: não enviamos carta.`
- **Efeitos:** monta o PDF em memória e gera um QR code; nada é gravado no banco e a carta não é marcada como enviada.
- **Exemplo:**
```bash
curl -s "$BASE/api/radar/12/carta.pdf" -H "Authorization: Bearer $CHAVE" -o carta.pdf
```

### `POST /api/radar/:id/carta-enviada`
- **Quem pode:** adm, gestor, corretor (dono da oportunidade ou sem corretor)
- **O que faz:** Marca que a carta desta oportunidade foi postada/entregue, com data de hoje, e registra o custo do envio.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `como` | texto (60) | não | Forma de envio, entra entre parênteses no texto do evento. |
| `custo` | número | não | Custo do envio; padrão 0. |

- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 401; 404; 403 (outro corretor); 400 com a mensagem do bloqueio de contato.
- **Efeitos:** grava `carta_enviada_em` com a data de hoje e assume a oportunidade se ela estava sem corretor; insere evento `carta` com o custo informado (entra na conta de gasto do radar); status vai para `carta_enviada` se era `nova` ou `em_contato`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/radar/12/carta-enviada" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"como":"Correios","custo":9.5}'
```

### `POST /api/radar/cartas-enviadas`
- **Quem pode:** adm, gestor, corretor (cada id passa por `permitida`)
- **O que faz:** Marca várias cartas como enviadas de uma vez, pulando silenciosamente as oportunidades sem logradouro, de imobiliária ou na lista não contatar.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `ids` | lista de inteiros | sim na prática | Ids de oportunidade. Valores não numéricos são descartados; no máximo 200. Lista vazia devolve `marcadas: 0`. |

- **Resposta:**
```json
{ "ok": true, "marcadas": 3 }
```
- **Erros:** 401; 404 `Oportunidade não encontrada.` se algum id não existe; 403 `Esta oportunidade é de outro corretor.`
- **Efeitos:** para cada id aceito: grava `carta_enviada_em` (hoje), assume a oportunidade se estava sem corretor, insere evento `carta` (`Carta enviada (lote).`, custo 0) e move o status para `carta_enviada` quando era `nova` ou `em_contato`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/radar/cartas-enviadas" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"ids":[12,13,14]}'
```

### `POST /api/radar/:id/aprovacao`
- **Quem pode:** adm, gestor, corretor (dono da oportunidade ou sem corretor)
- **O que faz:** Pede ao gestor autorização para uma etapa paga (consulta de matrícula ou consulta em birô de dados). Só depois de aprovado o resultado pode ser lançado.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `tipo` | texto | sim | Só `matricula` ou `biro`. |
| `custo_estimado` | número | não | Padrão: `cfg.CUSTO_MATRICULA` ou `cfg.CUSTO_BIRO` conforme o tipo (ambos 0 por padrão no `.env`). Valor 0/nulo é gravado como `NULL`. |
| `justificativa` | texto (500) | não | |

- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 401; 404; 403 (outro corretor); 400 `Tipo inválido.`; 400 com um dos motivos de `podePedir`: `Anúncio de imobiliária: não gastamos com esta oportunidade.`, a mensagem do bloqueio de contato, `Antes de gastar, tente os caminhos grátis: contato do anúncio, carta ou placa/portaria.`, `O birô só é usado depois da matrícula, para achar o telefone do titular confirmado.` (tipo `biro` sem `titular_nome`) ou `Já existe um pedido aguardando aprovação.`
- **Efeitos:** insere em `aprovacoes` com status `pendente`; insere evento da etapa (`matricula` ou `biro`); status da oportunidade vira `aguardando_aprovacao`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/radar/12/aprovacao" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"tipo":"matricula","custo_estimado":85,"justificativa":"Dono não atende"}'
```

### `POST /api/radar/aprovacoes/:aid/decidir`
- **Quem pode:** adm, gestor
- **O que faz:** Aprova ou nega um pedido de consulta paga pendente.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `aprovar` | booleano | não | Qualquer valor verdadeiro aprova; ausente/falso nega (`!!req.body.aprovar`). |
| `motivo` | texto (300) | não | Entra no registro da aprovação e no texto do evento. |

- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 401; 403 perfil `corretor`; 404 `Pedido não encontrado ou já decidido.`
- **Efeitos:** grava `status` (`aprovada`/`negada`), `decidido_por`, `decidido_em` e `motivo` em `aprovacoes`; insere evento na oportunidade; quando não resta pedido pendente, o status da oportunidade volta para `carta_enviada` (se já havia carta) ou `em_contato`; registra auditoria `radar_aprovado`/`radar_negado`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/radar/aprovacoes/7/decidir" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"aprovar":true,"motivo":"Vale a pena"}'
```

### `POST /api/radar/:id/matricula`
- **Quem pode:** adm, gestor, corretor (dono da oportunidade ou sem corretor), e só com aprovação do tipo `matricula` já concedida
- **O que faz:** Lança o resultado da consulta de matrícula: o nome do titular que consta no Registro de Imóveis.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `titular_nome` | texto (120) | sim | |
| `matricula_numero` | texto (40) | não | |
| `cartorio` | texto (120) | não | |
| `custo` | número | não | Custo real da consulta; padrão 0. |

- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 401; 404; 403 (outro corretor); 403 `A consulta de matrícula precisa ser aprovada pelo gestor antes.`; 400 `Informe o nome do titular que consta na matrícula.`
- **Efeitos:** grava `titular_nome`, `matricula_numero`, `cartorio` e `titular_origem='Matrícula do imóvel (Registro de Imóveis)'` em `oportunidades`; insere evento `matricula` com o custo (entra no gasto do radar); atualiza `atualizado_em`. O status não muda.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/radar/12/matricula" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"titular_nome":"Maria Silva","matricula_numero":"123456","cartorio":"2º RI Campinas","custo":85}'
```

### `POST /api/radar/:id/biro`
- **Quem pode:** adm, gestor, corretor (dono da oportunidade ou sem corretor), e só com aprovação do tipo `biro` já concedida
- **O que faz:** Lança o telefone do titular encontrado no birô de dados, já normalizado, e avisa se esse número está em lista não contatar.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `titular_telefone` | texto | sim | Normalizado para `55DDDNNNNNNNN`. |
| `fonte` | texto (60) | não | Padrão: `Birô de dados`. |
| `custo` | número | não | Padrão 0. |

- **Resposta:**
```json
{ "ok": true, "aviso": null }
```
(`aviso` traz a mensagem de bloqueio quando o telefone recém-lançado cai na lista não contatar)
- **Erros:** 401; 404; 403 (outro corretor); 403 `A consulta no birô precisa ser aprovada pelo gestor antes.`; 400 `Informe o telefone encontrado.`
- **Efeitos:** grava `titular_telefone` e `titular_origem` (`<fonte> (com aval jurídico), a partir do titular da matrícula`); insere evento `biro` com o custo; atualiza `atualizado_em`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/radar/12/biro" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"titular_telefone":"(19) 99999-0000","fonte":"Birô X","custo":12}'
```

### `POST /api/radar/:id/descartar`
- **Quem pode:** adm, gestor, corretor (dono da oportunidade ou sem corretor)
- **O que faz:** Encerra a oportunidade com um motivo. Quando o motivo é `nao_contatar`, também marca os telefones conhecidos na lista não contatar do CRM.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `motivo` | texto | sim | Um de `nao_contatar`, `imobiliaria`, `vendido`, `sem_interesse`, `duplicado`, `outro`. |
| `texto` | texto (300) | não | Complemento, juntado ao motivo no evento. |

- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 401; 404; 403 (outro corretor); 400 `Escolha o motivo.`
- **Efeitos:** status vira `descartada`, grava `motivo_descarte` e `atualizado_em`; insere evento `sistema`; com motivo `nao_contatar`, roda `UPDATE leads SET nao_contatar=1` para `telefone_anuncio` e `titular_telefone` — e o endereço passa a bloquear contato em outras oportunidades no mesmo logradouro/número/unidade (via `listaNaoContatar`).
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/radar/12/descartar" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"motivo":"vendido","texto":"Anúncio retirado"}'
```

### `POST /api/radar/:id/reabrir`
- **Quem pode:** adm, gestor, corretor (dono da oportunidade ou sem corretor) — mas só adm/gestor reabrem quem foi descartado como `nao_contatar`
- **O que faz:** Volta uma oportunidade descartada para `em_contato`, limpando o motivo do descarte.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 401; 404; 403 (outro corretor); 400 `Só oportunidades descartadas podem ser reabertas.`; 403 `Só o gestor reabre quem pediu para não ser contatado.`
- **Efeitos:** status vira `em_contato` e `motivo_descarte` vira `NULL`; insere evento `sistema` (`Reaberta por …`). As marcações de não contatar em `leads` não são desfeitas.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/radar/12/reabrir" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/radar/:id/converter`
- **Quem pode:** adm, gestor, corretor (dono da oportunidade ou sem corretor)
- **O que faz:** Captação fechada: transforma a oportunidade em imóvel da carteira, criando o condomínio (se preciso) e o proprietário, e devolve o código gerado.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `tipo` | texto | não | Tipo do imóvel; padrão: o `tipo` já gravado na oportunidade. Precisa estar na lista `ajudantes.TIPOS` (Apartamento, Cobertura, Casa, Casa em condomínio, Sobrado, Sala comercial, Loja, Ponto comercial, Prédio, Hotel, Galpão, Terreno, Chácara). |

- **Resposta:**
```json
{ "imovel_id": 310, "codigo": "AP0029" }
```
- **Erros:** 401; 404; 403 (outro corretor); 409 `Esta oportunidade já virou imóvel.`; 400 `Escolha o tipo do imóvel antes de captar.`
- **Efeitos:** cria ou reaproveita o condomínio (`ajudantes.salvarCondominio`); insere um registro em `proprietarios` (nome = `titular_nome`, ou o nome do anunciante particular, ou `Proprietário (confirmar nome)`; telefone = `titular_telefone` ou o do anúncio quando particular; `origem_dado` descreve a procedência); gera o próximo código do tipo e insere em `imoveis` com status `captacao`; marca a oportunidade como `captada` com `imovel_id`; chama `services/fotos-internas.garante` (cadastra as fotos do anúncio e a fachada como arquivos de categoria interna, só para a equipe); insere evento `sistema` (`Captada: virou o imóvel AP0029.`); registra auditoria `radar_captado`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/radar/12/converter" -H "Authorization: Bearer $CHAVE"
```

## Fisguei — tela do sistema, com login (`src/routes/fisguei.js`, export `api`)

Montado em `/api` (`app.use('/api', require('./src/routes/fisguei').api)`), atrás da mesma entrada descrita no início deste documento (chave de API com escopo `captacao`, `mesmaOrigem` e `exigeLogin`). Dois cuidados do roteador valem para todas as rotas deste bloco: `:id` e `:pid` só casam com dígitos (um valor não numérico segue para a próxima rota, acabando em 404 `Rota não encontrada.`), e qualquer método diferente de `GET` em caminho `/fisguei…` invalida o cache da leitura inteligente (`I.invalida()`).

### `GET /api/fisguei/resumo`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Números da tela Fisguei e do selo do menu: contagem de anúncios por status, quantos têm proprietário consultado, fila e abordagens do robô, bloqueios, últimas configurações, horário de atendimento e estado do robô de WhatsApp.
- **Entrada:** nenhuma
- **Resposta:**
```json
{
  "porStatus": { "novo": 51230, "abordando": 412, "respondeu": 7, "confirmado": 3 },
  "anuncios": 51652,
  "comDono": 980, "pessoas": 1540, "fila": 120, "enviadas": 2100, "hoje": 34, "responderam": 61,
  "precisaCorretor": 10,
  "bloqueios": 18,
  "ultimoRecebimento": "2026-10-30T11:58:02.113Z",
  "chave": true,
  "ajustes": { "pausado": false, "limite_dia": 80, "intervalo_s": 90, "hora_inicio": 9, "hora_fim": 19, "sabado": true, "modelo": "Olá, {nome}! …", "modelo_locacao": "Olá, {nome}! …", "limite_max": 200, "intervalo_min_s": 60 },
  "horario": true,
  "robo": { "estado": "conectado", "numero": "5519999990000", "qr": null, "vivo": true, "em": "2026-10-30T11:59:40.000Z" }
}
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura. `chave: true` indica apenas que já existe hash da chave da extensão em `config` — a chave em si não é devolvida.
- **Exemplo:**
```bash
curl -s "$BASE/api/fisguei/resumo" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/fisguei/explorar`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Cartões do "Fisguei inteligente": lê a base de anúncios de venda, calcula os sinais de cada um (queda de preço, anúncio novo, anúncio antigo, abaixo/acima do m² do bairro, particular, anunciado várias vezes, subiu o preço), a nota de 0 a 100, o próximo passo sugerido, as contagens de cada filtro e a "Leitura da IA" (só na página 1).
- **Entrada:** nenhuma
- **Query:** cada valor é cortado em 400 caracteres.

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `q` | texto | não | Busca em logradouro, número, bairro, complemento, anunciante, tipo, referência, CEP e portal. |
| `dono` | texto | não | `confirmado`, `consultado`, `lista`, `nenhum`, ou `com`/`sem`. |
| `sinais` | texto | não | Ids separados por vírgula (`queda`, `queda_forte`, `novo`, `antigo`, `abaixo`, `acima`, `particular`, `repetido`, `subiu`); exige todos ao mesmo tempo. |
| `cat` | texto | não | `apartamentos`, `casas`, `terrenos` ou `comerciais`. |
| `bairro` | texto | não | Chaves de bairro normalizadas, separadas por vírgula. |
| `anunciante` | texto | não | `particular`, `imobiliaria` ou `desconhecido` (comparação exata). |
| `vmin` / `vmax` | número | não | Faixa de valor. |
| `quartos` | inteiro | não | Mínimo de quartos. |
| `amin` | número | não | Área mínima. |
| `foto` | `"1"` | não | Só anúncios com foto. |
| `numero` | `"1"` | não | Só anúncios com rua e número. |
| `etapa` | texto | não | Status exato do anúncio, ou `precisa` (`respondeu` + `confirmado`). Sem ele, os `descartado` ficam de fora. |
| `ordem` | texto | não | `nota` (padrão), `recentes`, `queda`, `m2`, `menor`, `maior`, `antigos`. |
| `pagina` | inteiro | não | Padrão 1; 36 itens por página. |

- **Resposta:**
```json
{
  "total": 412, "pagina": 1, "paginas": 12, "ordem": "nota",
  "itens": [{
    "id": 1842, "ref": "FG-01842", "tipo": "Apartamento", "subtipo": "Apartamento", "categoria": "apartamentos",
    "logradouro": "Rua Antônio Cesarino", "numero": "686", "bairro": "Cambuí", "valor": 1850000,
    "m2": 14960, "m2_ref": 17200, "m2_dif": -13, "m2_ref_cidade": false,
    "anunciante_tipo": "particular", "status": "novo", "fotos": ["https://…"], "fotos_n": 8,
    "nota": 74, "sinais": [{ "id": "particular", "texto": "Anúncio de particular, sem imobiliária no meio: o caminho mais curto até a exclusividade." }],
    "dono": "nenhum", "pessoas": 0, "consultadas": 0, "na_fila": 0, "pedido": null,
    "passo": "Buscar o proprietário no Fisgar (1 crédito)", "desde": "2026-10-29", "idade": 1,
    "historico": [{ "valor": 1850000, "em": "2026-10-29" }], "repetido": null
  }],
  "contagem": { "sinais": { "queda": 18, "novo": 40 }, "donos": { "": 412, "com": 90, "sem": 322, "confirmado": 3, "consultado": 87 }, "cats": { "": 412, "apartamentos": 210 }, "bairros": [{ "k": "cambui", "nome": "Cambuí", "n": 51 }] },
  "resumo": { "mediana_valor": 1250000, "mediana_m2": 9800, "particulares": 61 },
  "leitura": { "frases": [{ "nivel": "bad", "filtro": { "sinais": "queda", "ordem": "queda" }, "id": 1842, "texto": "18 imóveis baixaram de preço. …" }], "base": 51400, "com_historico": 9120 },
  "gerado_em": "2026-10-30T12:00:01.900Z"
}
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura, com cache em memória de 45 s (invalidado por qualquer escrita em `/fisguei…`).
- **Exemplo:**
```bash
curl -s "$BASE/api/fisguei/explorar?sinais=particular,novo&dono=sem&ordem=nota" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/fisguei/explorar/mapa`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Os mesmos anúncios do explorar, mas só os que têm posição, em formato leve para o mapa (até 3000 pontos, ordenados por nota).
- **Entrada:** nenhuma
- **Query:** os mesmos campos de `GET /api/fisguei/explorar`, **sem** `ordem` e `pagina`.
- **Resposta:**
```json
[{ "id": 1842, "lat": -22.8961, "lon": -47.0498, "valor": 1850000, "nota": 74, "dono": "nenhum", "tipo": "Apartamento", "bairro": "Cambuí", "logradouro": "Rua Antônio Cesarino", "numero": "686", "foto": "https://…", "sinais": ["particular", "novo"], "particular": true }]
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/fisguei/explorar/mapa?cat=apartamentos" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/fisguei/creditos`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Saldo de créditos do plano Fisgar: a última leitura conhecida descontando o que foi gasto depois dela (ou a estimativa `plano − gasto do mês`), mais limites do dia e quanto dá para gastar por dia até o fim do mês.
- **Entrada:** nenhuma
- **Resposta:**
```json
{
  "plano": 2200, "saldo": 1840, "fonte": "fisgar",
  "leitura": { "em": "2026-10-30 09:12:33", "saldo": 1900, "gasto": 60, "chave": "painel.fisgar.com.br · plus" },
  "gasto_mes": 360, "gasto_hoje": 22, "limite_dia": 70, "restante_hoje": 48,
  "dias_restantes": 2, "por_dia_disponivel": 920, "pct_usado": 16
}
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/fisguei/creditos" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/fisguei/creditos`
- **Quem pode:** adm, gestor
- **O que faz:** Corrige à mão o saldo de créditos e/ou o tamanho do plano do Fisgar.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `plano` | inteiro | não | Créditos do plano. Só aceito se for finito, > 0 e < 1.000.000. Ignorado quando vem vazio ou ausente. |
| `saldo` | inteiro | não | Saldo informado. Aceito entre 0 e 1.000.000. Ignorado quando vem vazio ou ausente. |

- **Resposta:** o mesmo objeto de `GET /api/fisguei/creditos`.
- **Erros:** 401; 403 `Só o administrativo ou o gestor corrigem o saldo de créditos.`; 400 `Saldo inválido.` quando `saldo` veio mas é inválido.
- **Efeitos:** grava as chaves `fisguei_saldo` (com `fonte: 'manual'` e `chave: 'informado por <nome>'`) e/ou `fisguei_plano_creditos` em `config`; registra auditoria `fisguei.creditos` com o corpo enviado; invalida o cache da leitura inteligente.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/fisguei/creditos" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"saldo":1840,"plano":2200}'
```

### `GET /api/fisguei/mapa`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Pontos dos anúncios com posição para o mapa simples da lista (até 3000, dos mais novos para os mais antigos), com os filtros da lista clássica.
- **Entrada:** nenhuma
- **Query:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `filtro` | texto | não | `precisa`, `com_dono`, `sem_dono`, `particular` ou um status (`novo`, `abordando`, `respondeu`, `confirmado`, `sem_interesse`, `sem_dono`, `captado`, `descartado`). |
| `q` | texto | não | Busca em logradouro, bairro, nome do anunciante e CEP. |
| `vmin` / `vmax` | número | não | Faixa de valor. |

- **Resposta:**
```json
[{ "id": 1842, "lat": -22.8961, "lon": -47.0498, "valor": 1850000, "status": "novo", "tipo": "Apartamento", "logradouro": "Rua Antônio Cesarino", "numero": "686", "bairro": "Cambuí", "anunciante_tipo": "particular" }]
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/fisguei/mapa?filtro=particular" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/fisguei`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Lista paginada dos anúncios da base (48 por página), com a contagem de pessoas, consultas, fila e envios de cada um, o último pedido no Fisgar, a foto de capa e os números de cada aba de filtro. Quem respondeu ou confirmou vem primeiro.
- **Entrada:** nenhuma
- **Query:** os mesmos `filtro`, `q`, `vmin`, `vmax` de `GET /api/fisguei/mapa`, mais:

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `pagina` | inteiro | não | Padrão 1. |

- **Resposta:**
```json
{
  "total": 51652, "pagina": 1, "paginas": 1077,
  "itens": [{
    "id": 1842, "fisgar_id": "99887", "tipo": "Apartamento", "negocio": "Venda",
    "logradouro": "Rua Antônio Cesarino", "numero": "686", "bairro": "Cambuí", "cep": "13015211",
    "valor": 1850000, "aluguel": null, "quartos": 3, "vagas": 2, "area_util": 124,
    "anunciante_nome": "Maria", "anunciante_tipo": "particular", "status": "abordando", "pausado": 0,
    "oportunidade_id": null, "pessoas": 3, "consultadas": 1, "na_fila": 1, "enviadas": 0,
    "pedido": "concluido", "confirmados": 0, "foto": "https://…", "ref": "FG-01842"
  }],
  "contagem": { "todos": 51652, "precisa": 10, "com_dono": 980, "abordando": 412, "confirmado": 3, "sem_dono": 120, "particular": 6100, "sem_interesse": 44, "captado": 9 }
}
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/fisguei?filtro=precisa&pagina=1" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/fisguei/:id`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Ficha completa de um anúncio da base: dados, fotos, categoria/subtipo, as pessoas que o Fisgar trouxe (com contatos e conversas do WhatsApp), a oportunidade e o imóvel ligados, os últimos 10 pedidos no Fisgar e a prévia do texto que o robô mandaria.
- **Entrada:** nenhuma
- **Resposta:**
```json
{
  "anuncio": { "id": 1842, "ref": "FG-01842", "fisgar_id": "99887", "status": "abordando", "fotos": ["https://…"], "categoria": "apartamentos", "subtipo": "Apartamento" },
  "pessoas": [{
    "id": 55, "nome": "Maria Silva", "relacao": "Possível proprietário (IPTU)", "unidade": "82", "consultado": 1, "status": "abordando",
    "contatos": [{ "id": 90, "tipo": "tel", "valor": "5519999990000", "envio": "enviado", "enviado_em": "2026-10-30 10:02:00", "erro": null }],
    "mensagens": [{ "direcao": "saida", "texto": "Olá, Maria! …", "status": "enviada", "autor": "TH-IA-GO CORRETOR", "criado_em": "2026-10-30 10:02:00" }]
  }],
  "oportunidade": null,
  "imovel": null,
  "pedidos": [{ "id": 300, "tipo": "endereco", "pessoa_id": null, "status": "concluido", "creditos": 2, "pessoas": 3, "consultadas": 1, "erro": null, "criado_em": "2026-10-30 09:50:00", "concluido_em": "2026-10-30 09:52:10" }],
  "previa": "Olá, Maria! Tudo bem? Aqui é o TH-IA-GO, assistente virtual da …"
}
```
- **Erros:** 401; 404 `Anúncio não encontrado no Fisguei.`
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/fisguei/1842" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/fisguei/:id/pausar`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Pausa ou retoma o anúncio: pausado, o robô de WhatsApp não escolhe mais os números dele na fila.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `pausado` | booleano | não | Valor verdadeiro pausa (grava 1); ausente ou falso retoma (grava 0). |

- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 401; 404 `Anúncio não encontrado no Fisguei.`
- **Efeitos:** grava `pausado` e `atualizado_em` em `fisguei_anuncios`; registra auditoria `fisguei.pausar`; invalida o cache da leitura inteligente.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/fisguei/1842/pausar" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"pausado":true}'
```

### `POST /api/fisguei/:id/descartar`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Descarta o anúncio e tira do ar as abordagens pendentes daquele endereço.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 401; 404 `Anúncio não encontrado no Fisguei.`
- **Efeitos:** status vira `descartado` e `atualizado_em` vira agora; todos os contatos `fila` das pessoas desse anúncio passam a `pulado` com o erro `Endereço descartado pelo corretor` (nenhuma mensagem é enviada); registra auditoria `fisguei.descartar`; invalida o cache.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/fisguei/1842/descartar" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/fisguei/:id/captar`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Leva o anúncio para o Radar como oportunidade, mesmo sem confirmação do dono pelo robô, usando a melhor pessoa conhecida (quem confirmou, senão quem respondeu, senão a primeira) e o telefone dela.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "oportunidade_id": 58 }
```
- **Erros:** 401; 404 `Anúncio não encontrado no Fisguei.`
- **Efeitos:** cria a oportunidade (`F.criaOportunidade`) com portal `Fisgar`, status `em_contato`, `titular_nome` da pessoa escolhida (ou `A confirmar`), `titular_telefone` e `titular_origem='Confirmou pelo WhatsApp (robô TH-IA-GO)'`, mais um evento `anuncio`; grava `oportunidade_id` no anúncio; se quem chamou é `corretor`, fica como responsável da oportunidade (adm/gestor deixam `corretor_id` nulo); o anúncio vira `captado`; as abordagens na fila daquele endereço passam a `pulado` (`Já está no Radar com o corretor`); registra auditoria `fisguei.captar`; invalida o cache. Se o anúncio já tinha oportunidade, ela é reaproveitada (nada novo é criado).
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/fisguei/1842/captar" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/fisguei/pessoas/:pid/status`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Marca à mão o que aconteceu com uma pessoa do endereço (confirmou que é dono, negou, sem interesse, ou pediu para parar) e deixa o sistema tirar as consequências.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `status` | texto | sim | Só `confirmou`, `negou`, `sem_interesse` ou `parar`. |

- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 401; 404 `Pessoa não encontrada.`; 404 `Anúncio não encontrado no Fisguei.`; 400 `Situação inválida.`
- **Efeitos:** grava o status em `fisguei_pessoas` e, conforme o valor:
  - `parar`: bloqueia cada telefone da pessoa em `fisguei_bloqueios` (motivo `marcado pelo corretor`) e põe os contatos em fila como `pulado`; por não conter a palavra "parar" no motivo, **não** propaga para a lista comum da plataforma (LGPD);
  - `negou` ou `parar`: contatos em `fila` viram `pulado` (`Marcado pelo corretor`) e o anúncio pode virar `sem_dono` se não sobrou ninguém (`fechaSeAcabou`);
  - `confirmou`: anúncio vira `confirmado`, as outras abordagens do endereço são puladas (`O dono já confirmou`), uma oportunidade é criada no Radar (ou a existente é reaproveitada) e o imóvel entra na carteira com essa pessoa como proprietária (`F.donoNaCarteira` → `P.importa` ou `P.sincronizaDono`, incluindo o cadastro das fotos internas);
  - `sem_interesse`: anúncio vira `sem_interesse` e as abordagens pendentes são puladas;
  - para os status diferentes de `confirmou`, se o anúncio já tem imóvel na carteira, o proprietário da ficha é ressincronizado (`P.sincronizaDono`).

  Registra auditoria `fisguei.pessoa` e invalida o cache. Nenhuma mensagem de WhatsApp é enviada por esta rota.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/fisguei/pessoas/55/status" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"status":"confirmou"}'
```

### `POST /api/fisguei/pessoas/:pid/mensagem`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** O corretor escreve uma mensagem de WhatsApp que sai pela mesma linha do robô, para o número que já está em conversa com essa pessoa.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `texto` | texto (2000) | sim | A mensagem. |

- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 401; 404 `Pessoa não encontrada.`; 400 `Escreva a mensagem.`; 400 `O robô ainda não falou com essa pessoa. Responda só depois da primeira mensagem.` quando não há contato com envio `respondeu`/`enviado`; 400 `Esse número está na lista não contatar.`
- **Efeitos:** insere a mensagem em `fisguei_mensagens` como saída `pendente`, com o nome de quem escreveu como autor. O robô TH-IA-GO (quando conectado e rodando no PC) envia essa mensagem pelo WhatsApp na próxima volta, em até cerca de 1 minuto — ou seja, há envio real de mensagem, mas não acontece nesta requisição. Invalida o cache.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/fisguei/pessoas/55/mensagem" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"texto":"Oi Maria, sou a Júlia da imobiliária. Podemos conversar amanhã?"}'
```

### `POST /api/fisguei/buscar`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Põe na fila do Fisgar a busca do proprietário a partir de oportunidades do Radar. Cada oportunidade sem anúncio correspondente ganha um anúncio-espelho (`fisgar_id = 'op:<id>'`).
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `oportunidade_ids` | lista de inteiros | sim | Ids de oportunidade. Valores não numéricos são descartados; no máximo 1000. |

- **Resposta:**
```json
{ "criados": 2, "ja": 1, "sem_endereco": 0, "anuncios": [1842, 1843, 1844], "anuncio_id": null }
```
(`anuncio_id` vem preenchido só quando a lista resultou em exatamente um anúncio)
- **Erros:** 401; 400 `Escolha ao menos uma oportunidade.` quando a lista fica vazia.
- **Efeitos:** pode inserir anúncios-espelho em `fisguei_anuncios` (ligados à oportunidade); insere pedidos `endereco` em `fisguei_pedidos` com status `fila` (um por endereço, sem repetir pedido já aberto); registra auditoria `fisguei.buscar`; invalida o cache. **Nenhum crédito é gasto agora**: o gasto acontece quando a extensão do Chrome executar a busca no painel do Fisgar (1 crédito pelo endereço + até `max_consultas` créditos nas consultas por pessoa).
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/fisguei/buscar" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"oportunidade_ids":[12,13,14]}'
```

### `POST /api/fisguei/buscar-anuncios`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** "Buscar dono" de vários cartões do Fisguei de uma vez: enfileira a busca de proprietário por endereço para cada anúncio escolhido.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `ids` | lista de inteiros | sim | Ids de anúncio do Fisguei. Valores não numéricos são descartados; no máximo 200. |

- **Resposta:**
```json
{ "criados": 5, "ja": 1, "sem_endereco": 2, "creditos": { "plano": 2200, "saldo": 1840, "fonte": "fisgar", "limite_dia": 70, "restante_hoje": 48 } }
```
- **Erros:** 401; 400 `Escolha ao menos um imóvel.` quando a lista fica vazia. Anúncios sem rua e número não dão erro: entram em `sem_endereco`.
- **Efeitos:** insere pedidos `endereco` em `fisguei_pedidos` (status `fila`); registra auditoria `fisguei.buscar`; invalida o cache. O crédito do Fisgar é consumido depois, quando a extensão executar a busca.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/fisguei/buscar-anuncios" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"ids":[1842,1843]}'
```

### `POST /api/fisguei/localizar`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** "Localizar proprietário" a partir das vitrines da base, aceitando ids mistos: positivo é anúncio do Fisguei, negativo é oportunidade do Radar (`-id`). Quem já está na carteira é contado e não entra na fila.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `ids` | lista de inteiros | sim | Ids de cartão (positivos = anúncio, negativos = oportunidade). O valor 0 e os não numéricos são descartados; no máximo 200. |

- **Resposta:**
```json
{ "criados": 4, "ja": 1, "sem_endereco": 1, "na_carteira": 2, "por_busca": 4, "creditos": { "plano": 2200, "saldo": 1840 }, "extensao": { "em": "2026-10-30T11:59:00.000Z", "fisgar_aberto": true, "vivo": true } }
```
(`por_busca` = `1 + max_consultas`: quantos créditos cada endereço pode custar)
- **Erros:** 401; 400 `Escolha ao menos um imóvel.` quando a lista fica vazia.
- **Efeitos:** para os ids positivos, insere pedidos `endereco`; para os negativos, cria o anúncio-espelho da oportunidade quando necessário e enfileira a busca; registra auditoria `fisguei.buscar`; invalida o cache. Quando o Fisgar devolver o proprietário, o imóvel entra na carteira sozinho (ver `POST /fisguei-api/pedidos/:id/resultado`). O crédito é gasto na execução pela extensão, não aqui.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/fisguei/localizar" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"ids":[1842,-12]}'
```

### `POST /api/fisguei/:id/buscar`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Enfileira a busca do proprietário de um único anúncio pelo endereço.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "id": 301 }
```
(ou `{ "id": 300, "ja": true }` quando já havia um pedido aberto para esse endereço)
- **Erros:** 401; 404 `Anúncio não encontrado no Fisguei.`; 400 `Este anúncio não tem rua e número: o Fisgar só acha o dono com o endereço completo.`
- **Efeitos:** insere um pedido `endereco` em `fisguei_pedidos` (status `fila`); registra auditoria `fisguei.buscar`; invalida o cache. Crédito gasto só na execução pela extensão.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/fisguei/1842/buscar" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/fisguei/pessoas/:pid/consultar`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Enfileira a consulta paga dos dados (telefones, e-mails) de uma pessoa específica já listada no endereço. Esses pedidos têm prioridade na fila da extensão.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "id": 302 }
```
(ou `{ "id": 302, "ja": true }` quando já havia pedido aberto para essa pessoa)
- **Erros:** 401; 404 `Pessoa não encontrada.`; 400 com a mensagem do erro devolvido por `P.pedePessoa` (ex.: `pessoa não encontrada`).
- **Efeitos:** insere um pedido `pessoa` em `fisguei_pedidos` (status `fila`); registra auditoria `fisguei.consultar`; invalida o cache. O crédito é cobrado pelo Fisgar quando a extensão rodar a consulta.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/fisguei/pessoas/55/consultar" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/fisguei/pedidos`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Situação da fila de buscas no Fisgar: quantos esperando, buscando e aguardando escolha de pessoa, créditos do dia e do mês, limites, se a extensão está viva com o Fisgar aberto, e os últimos 8 pedidos já encerrados.
- **Entrada:** nenhuma
- **Resposta:**
```json
{
  "fila": 7, "buscando": 1, "escolher": 3,
  "creditos_hoje": 22, "creditos_mes": 360,
  "limites": { "creditos_dia": 70, "max_consultas": 3, "creditos_max": 300, "consultas_max": 10 },
  "extensao": { "em": "2026-10-30T11:59:00.000Z", "fisgar_aberto": true, "vivo": true },
  "ultimos": [{ "id": 300, "status": "concluido", "tipo": "endereco", "creditos": 2, "pessoas": 3, "consultadas": 1, "erro": null, "concluido_em": "2026-10-30 09:52:10", "anuncio_id": 1842, "logradouro": "Rua Antônio Cesarino", "numero": "686", "bairro": "Cambuí" }]
}
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/fisguei/pedidos" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/fisguei/pedidos/limites`
- **Quem pode:** adm, gestor
- **O que faz:** Ajusta o teto de créditos por dia e quantas pessoas o Fisgar pode consultar automaticamente em cada endereço.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `creditos_dia` | inteiro | não | Limitado entre 1 e 300. Padrão vigente: 70. Vazio/ausente não altera. |
| `max_consultas` | inteiro | não | Limitado entre 0 e 10. Padrão vigente: 3. Vazio/ausente não altera. |

- **Resposta:**
```json
{ "creditos_dia": 50, "max_consultas": 2, "creditos_max": 300, "consultas_max": 10 }
```
- **Erros:** 401; 403 `Só o administrativo ou o gestor mudam o limite de créditos.`
- **Efeitos:** grava `fisguei_creditos_dia` e/ou `fisguei_max_consultas` em `config`; registra auditoria `fisguei.limites`; invalida o cache. Esses limites são respeitados em `GET /fisguei-api/pedidos/proximo` (a extensão para de receber pedido quando o teto do dia é atingido).
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/fisguei/pedidos/limites" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"creditos_dia":50,"max_consultas":2}'
```

### `GET /api/fisguei/radar`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Para cada oportunidade informada, diz se já existe anúncio-espelho no Fisguei e em que pé está a busca do dono (pessoas listadas, consultadas e o status do último pedido).
- **Entrada:** nenhuma
- **Query:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `ids` | texto | não | Ids de oportunidade separados por vírgula; no máximo 1000. Sem ele, a resposta é `{}`. |

- **Resposta:**
```json
{ "12": { "id": 1842, "oportunidade_id": 12, "status": "abordando", "pessoas": 3, "consultadas": 1, "pedido": "concluido", "ref": "FG-01842" } }
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/fisguei/radar?ids=12,13" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/fisguei/:id/importar`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Leva o anúncio da base para a carteira como imóvel em captação, com o proprietário que o Fisgar trouxe (ou quem confirmou pelo WhatsApp). As fotos do anúncio entram como fotos **internas**, por serem de terceiros.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "id": 310, "codigo": "AP0029" }
```
(ou `{ "id": 310, "ja": true, "codigo": "AP0029" }` quando o anúncio já tinha imóvel)
- **Erros:** 401; 404 `Anúncio não encontrado no Fisguei.` (tanto da rota quanto de `P.importa`).
- **Efeitos:** insere em `imoveis` com status `captacao`, código novo do tipo deduzido (`tipoImovel`), endereço, medidas, valores, `finalidade` (`venda`, `locacao` ou `venda_locacao` conforme valor e aluguel) e uma descrição explicando a origem; grava `imovel_id` no anúncio e, se houver, na oportunidade; cria ou atualiza o registro em `proprietarios` com o melhor dono conhecido (`sincronizaDono` — proprietário digitado pela equipe não é sobrescrito); chama `fotos-internas.garante` (cadastra as fotos do anúncio e a fachada como arquivos de categoria interna); registra auditoria `imovel_criado` só quando o imóvel é novo; invalida o cache.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/fisguei/1842/importar" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/fisguei/robo`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Estado do robô de WhatsApp TH-IA-GO (incluindo o QR code quando ele está esperando leitura), os ajustes de abordagem, quantas mensagens já saíram hoje e se agora está dentro do horário permitido.
- **Entrada:** nenhuma
- **Resposta:**
```json
{
  "robo": { "estado": "qr", "qr": "data:image/png;base64,…", "numero": null, "erro": null, "em": "2026-10-30T11:59:40.000Z", "vivo": true },
  "ajustes": { "pausado": false, "limite_dia": 80, "intervalo_s": 90, "hora_inicio": 9, "hora_fim": 19, "sabado": true, "modelo": "Olá, {nome}! …", "modelo_locacao": "Olá, {nome}! …", "limite_max": 200, "intervalo_min_s": 60 },
  "hoje": 34,
  "horario": true
}
```
(o robô só é considerado `vivo` se publicou estado nos últimos 3 minutos; fora disso `estado` vira `desligado` e `qr` vira `null`)
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/fisguei/robo" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/fisguei/robo`
- **Quem pode:** adm, gestor
- **O que faz:** Salva os ajustes do robô: pausa, limite diário, intervalo entre mensagens, janela de horário, sábado e o texto da primeira mensagem.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `pausado` | booleano | não | Verdadeiro pausa o robô. Ausente não altera. |
| `limite_dia` | inteiro | não | Mensagens novas por dia. Limitado entre 1 e 200. Padrão vigente: 80. |
| `intervalo_s` | inteiro | não | Segundos entre duas abordagens novas. Mínimo 60. Padrão vigente: 90. |
| `hora_inicio` | inteiro | não | Limitado entre 7 e 20. Padrão vigente: 9. |
| `hora_fim` | inteiro | não | Limitado entre 8 e 21. Padrão vigente: 19. |
| `sabado` | booleano | não | Falso impede envio no sábado. Padrão: envia. |
| `modelo` | texto (1200) | não | Texto da primeira mensagem, com `{nome}`, `{endereco}`, `{bairro}`, `{valor}`, `{tipo}`, `{privacidade}`. Precisa conter a palavra "parar". String vazia volta ao modelo padrão. |

- **Resposta:**
```json
{ "ajustes": { "pausado": false, "limite_dia": 60, "intervalo_s": 120, "hora_inicio": 9, "hora_fim": 18, "sabado": false, "modelo": "Olá, {nome}! …", "modelo_locacao": "Olá, {nome}! …", "limite_max": 200, "intervalo_min_s": 60 } }
```
- **Erros:** 401; 403 `Só o administrativo ou o gestor mudam o robô.`; 400 `A mensagem precisa dizer como parar de receber (ex.: "responda PARAR").`
- **Efeitos:** grava as chaves `fisguei_pausado`, `fisguei_limite_dia`, `fisguei_intervalo_s`, `fisguei_hora_inicio`, `fisguei_hora_fim`, `fisguei_sabado` e `fisguei_modelo` em `config`; registra auditoria `fisguei.robo`; invalida o cache. Passa a valer no ritmo de envio do robô. (O campo `modelo_locacao` existe em `ajustes()` mas esta rota não o grava.)
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/fisguei/robo" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"limite_dia":60,"intervalo_s":120,"hora_fim":18,"sabado":false}'
```

### `POST /api/fisguei/robo/comando`
- **Quem pode:** adm, gestor
- **O que faz:** Manda um comando para o robô de WhatsApp: desconectar o aparelho ou reiniciar a conexão.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `comando` | texto | sim | Só `desconectar` ou `reiniciar`. |

- **Resposta:**
```json
{ "ok": true }
```
- **Erros:** 401; 403 `Só o administrativo ou o gestor mudam o robô.`; 400 `Comando inválido.`
- **Efeitos:** grava a chave `fisguei_robo_cmd` em `config`; o robô (rodando no PC da imobiliária) lê e executa na próxima volta — `desconectar` encerra a sessão do WhatsApp e exige novo QR code. Registra auditoria `fisguei.robo`; invalida o cache.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/fisguei/robo/comando" -H "Authorization: Bearer $CHAVE" \
  -H 'Content-Type: application/json' -d '{"comando":"reiniciar"}'
```

### `POST /api/fisguei/chave`
- **Quem pode:** adm, gestor
- **O que faz:** Gera uma nova chave para a extensão do Chrome se identificar em `/fisguei-api`. A chave aparece em texto puro **apenas nesta resposta**; no banco fica só o hash.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "chave": "fsg_Rk9vQmFyQmF6UXV1eA0tZXhlbXBsbw" }
```
- **Erros:** 401; 403 `Só o administrativo ou o gestor geram a chave.`
- **Efeitos:** grava `fisguei_chave_hash` em `config` (SHA-256 da chave nova), **invalidando a chave anterior** — a extensão para de funcionar até receber a nova. Registra auditoria `fisguei.chave`; invalida o cache.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/fisguei/chave" -H "Authorization: Bearer $CHAVE"
```

## Fisguei — recebimento da extensão do Chrome (`src/routes/fisguei.js`, export `receber`)

Montado em `/fisguei-api` (`app.use('/fisguei-api', require('./src/routes/fisguei').receber)`), **antes** do `express.json` global e **fora** de `/api`: não passa por `mesmaOrigem` nem por `exigeLogin`, e não há sessão nem cookie. A extensão se identifica com o cabeçalho `X-Fisguei-Chave`, cuja hash é comparada com `config.fisguei_chave_hash` em tempo constante (`crypto.timingSafeEqual`). O roteador responde CORS aberto (`Access-Control-Allow-Origin: *`, cabeçalhos `Content-Type, X-Fisguei-Chave`, métodos `GET, POST, OPTIONS`) porque a extensão chama de `chrome-extension://…`; um `OPTIONS` é respondido com 204 antes da checagem da chave. O corpo JSON aqui aceita até 4 MB (o resto do sistema, 1 MB).

Erro comum a todas as rotas deste bloco: **401** `Chave da extensão inválida. Gere uma nova na tela Fisguei do sistema.` quando a chave falta, não casa ou nenhuma chave foi gerada ainda.

### `GET /fisguei-api/ping`
- **Quem pode:** aberto, com chave da extensão
- **O que faz:** Confere se a chave vale e devolve o nome do robô, para a extensão mostrar que está conectada ao sistema certo.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "ok": true, "robo": "TH-IA-GO CORRETOR" }
```
- **Erros:** 401 chave inválida.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/fisguei-api/ping" -H "X-Fisguei-Chave: $CHAVE"
```

### `GET /fisguei-api/pedidos/proximo`
- **Quem pode:** aberto, com chave da extensão
- **O que faz:** A extensão pergunta se há busca a fazer no painel do Fisgar. Devolve o próximo pedido da fila já com o endereço resolvido em CEP + número e o que consultar; pedidos de pessoa têm prioridade sobre os de endereço.
- **Entrada:** nenhuma
- **Query:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `fisgar` | `"1"` | não | `1` significa que há uma aba do Fisgar aberta. Qualquer outro valor (ou ausência) devolve `{ pedido: null, motivo: 'Fisgar fechado' }` sem consultar a fila. |

- **Resposta:**
```json
{
  "pedido": {
    "id": 303,
    "tipo": "endereco",
    "ref": "FG-01842",
    "key": { "number": "686", "zipcode": "13015211", "extra": "", "city": "Campinas", "district": "Cambuí", "state": "SP", "name": null, "street": "Rua Antônio Cesarino" },
    "consultar": { "modo": "auto", "limite": 3, "unidade": "82" },
    "creditos_restantes": 48
  }
}
```
Sem nada a fazer: `{ "pedido": null }`; com o teto do dia atingido: `{ "pedido": null, "motivo": "limite de 70 créditos por dia atingido" }`. Para `tipo: "pessoa"`, `consultar` vira `{ "modo": "nomes", "nomes": [{ "nome": "Maria Silva", "unidade": "82" }] }`.
- **Erros:** 401 chave inválida.
- **Efeitos:** **escreve, apesar de ser GET.** Grava a chave `fisguei_ext_visto` em `config` (momento e se o Fisgar está aberto). Quando o Fisgar está aberto: devolve para a fila os pedidos presos em `buscando` há mais de 10 minutos; marca o pedido escolhido como `buscando` com `iniciado_em`; chama o ViaCEP (`https://viacep.com.br/ws/SP/<cidade>/<rua>/json/`) quando o anúncio não tem CEP e grava o CEP e o bairro encontrados no anúncio; se não achar o CEP, conclui o pedido como `erro` (`Não achei o CEP dessa rua e número. Confira o endereço no Radar.`) e tenta o próximo (até 10 tentativas por chamada).
- **Exemplo:**
```bash
curl -s "$BASE/fisguei-api/pedidos/proximo?fisgar=1" -H "X-Fisguei-Chave: $CHAVE"
```

### `POST /fisguei-api/pedidos/:id/resultado`
- **Quem pode:** aberto, com chave da extensão
- **O que faz:** A extensão devolve o que o Fisgar respondeu para um pedido: as pessoas do endereço e/ou as consultas individuais. O sistema grava as pessoas, os telefones e e-mails, conta os créditos gastos, define o desfecho do pedido e, quando há alguém consultado, leva o imóvel para a carteira sozinho.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `pessoas` | objeto | não | `{ pedido, json, cobrado }` da chamada `owners/GetPeople`. Conta 1 crédito a menos que `cobrado` seja exatamente `false`. |
| `pessoas.json` | objeto | não | A resposta crua do Fisgar (`{ data: { people: [...] } }`). |
| `pessoas.pedido` | objeto ou texto | não | O corpo enviado ao Fisgar (ajuda a identificar o endereço). |
| `pessoas.cobrado` | booleano | não | `false` indica que o Fisgar não cobrou. |
| `consultas` | lista de objetos | não | Cada item `{ pedido, json, cobrado }` de `owners/GetPersonInfo`. No máximo 10 (`CONSULTAS_MAX`); itens sem `json` são ignorados; só conta crédito quando `cobrado` é verdadeiro. |
| `erro` | texto | não | Mensagem de falha. Sem `pessoas`, encerra o pedido. |
| `erro_volta` | booleano | não | Com `erro`, verdadeiro devolve o pedido para a `fila` em vez de marcar `erro`. |
| `sem_credito` | booleano | não | O Fisgar recusou por falta de crédito. |
| `aviso` | texto | não | Observação gravada no campo `erro` do pedido. |

- **Resposta:**
```json
{ "ok": true, "status": "concluido", "creditos": 2, "pessoas": 3, "consultadas": 1, "imovel": { "id": 310, "codigo": "AP0029" } }
```
- **Erros:** 401 chave inválida; **400** `{ "erro": "Pedido inválido." }` quando `:id` não é número; **409** `{ "erro": "pedido não encontrado" }` ou `{ "erro": "pedido já encerrado" }` (o pedido precisa estar em `buscando`).
- **Efeitos:** grava a chave `fisguei_ultimo_recebimento` em `config`; processa os JSONs pelo `normaliza.processa`, criando/atualizando `fisguei_pessoas`, `fisguei_contatos` (telefones celulares entram com envio `fila`, prontos para o robô abordar; fixos ficam como `fixo`; números em lista não contatar entram como `pulado`) e trocando o status do anúncio de `novo` para `abordando` quando aparece contato — o CPF/CNPJ devolvido pelo Fisgar **nunca** é gravado, só uma impressão HMAC; conclui o pedido com `status`, créditos somados, contagens e `concluido_em` (`concluido`, `sem_resultado` quando o endereço não trouxe ninguém, `escolher` quando trouxe pessoas mas nenhuma foi consultada, `erro`/`fila` nos casos de falha); em `sem_resultado` acrescenta uma observação ao anúncio (`O Fisgar não achou dono pelo IPTU neste endereço.`); e, com pedido `concluido` e alguém consultado, chama `entraNaCarteira` → `importa`: cria o imóvel em `imoveis` (status `captacao`, código novo), liga `imovel_id` no anúncio e na oportunidade, cria/atualiza o `proprietarios`, cadastra as fotos internas e registra auditoria `imovel_criado`. Os créditos contados aqui são o gasto real do plano Fisgar.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/fisguei-api/pedidos/303/resultado" -H "X-Fisguei-Chave: $CHAVE" \
  -H 'Content-Type: application/json' \
  -d '{"pessoas":{"pedido":{"announce_id":99887,"search":{"key":{"street":"Rua Antônio Cesarino","number":"686","zipcode":"13015211"}}},"json":{"data":{"people":[{"name":"MARIA SILVA","phones":[{"phone":"19999990000","type":"MOBILE"}]}]}},"cobrado":true},"consultas":[]}'
```

### `POST /fisguei-api/creditos`
- **Quem pode:** aberto, com chave da extensão
- **O que faz:** Registra o saldo de créditos que a extensão leu numa resposta do próprio painel do Fisgar.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `saldo` | inteiro | sim | Saldo lido. Aceito entre 0 e 1.000.000. |
| `plano` | inteiro | não | Créditos do plano. Só gravado se for > 0 e < 1.000.000. |
| `url` | texto | não | Endereço de onde o saldo foi lido; junta com `chave` em uma legenda de até 80 caracteres. |
| `chave` | texto | não | Identificação complementar da origem da leitura. |

- **Resposta:**
```json
{ "ok": true, "saldo": 1840 }
```
- **Erros:** 401 chave inválida; **400** `{ "erro": "Saldo inválido." }` quando o saldo não é um inteiro na faixa aceita.
- **Efeitos:** grava a chave `fisguei_saldo` em `config` (com `fonte: 'fisgar'` e o momento) e, se vier, `fisguei_plano_creditos`. Passa a valer como base do cálculo em `GET /api/fisguei/creditos`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/fisguei-api/creditos" -H "X-Fisguei-Chave: $CHAVE" \
  -H 'Content-Type: application/json' -d '{"saldo":1840,"plano":2200,"url":"painel.fisgar.com.br"}'
```

### `POST /fisguei-api/receber`
- **Quem pode:** aberto, com chave da extensão
- **O que faz:** Recebe o que a extensão capturou navegando no Fisgar — listas da Base de Anúncios, fichas de anúncio e abas de proprietários — e grava na base do Fisguei. Aceita um item só ou um lote.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `itens` | lista de objetos | não | Lote de capturas; no máximo 50 por chamada. Sem ela, o próprio corpo é tratado como um item único. |
| `itens[].url` | texto | sim | Endereço da chamada capturada; é o que decide como o JSON é interpretado (`/properties/getAll`, `/getAllInfoById/:id`, `/owners/GetPeople`, `/owners/GetPersonInfo`). Item sem `url` é ignorado. |
| `itens[].json` | objeto | sim | A resposta crua do Fisgar. Item com `json` indefinido é ignorado. |
| `itens[].pedido` | objeto ou texto | não | O corpo enviado ao Fisgar, usado para saber de qual anúncio/endereço a pessoa é. |

- **Resposta:**
```json
{ "anuncios": 48, "pessoas": 0, "telefones": 0, "ignorados": 2 }
```
- **Erros:** 401 chave inválida. Itens inválidos ou que o `normaliza` não reconhece não geram erro: entram em `ignorados` (a falha de um item é registrada no console e não derruba o lote).
- **Efeitos:** insere/atualiza `fisguei_anuncios` (só o que vem preenchido é sobrescrito), grava histórico em `fisguei_precos` quando o preço mudou mais de 0,4% e ajusta `anunciado_desde`; insere/atualiza `fisguei_pessoas` e `fisguei_contatos` (celulares entram com envio `fila`, prontos para o robô; números bloqueados entram como `pulado`) e troca o status do anúncio de `novo` para `abordando`; o CPF/CNPJ nunca é gravado, só a impressão HMAC; grava `fisguei_ultimo_recebimento` em `config`; quando houve anúncio novo, chama `mercado.esqueceBase()` para as vitrines relerem a base em até 30 s.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/fisguei-api/receber" -H "X-Fisguei-Chave: $CHAVE" \
  -H 'Content-Type: application/json' \
  -d '{"itens":[{"url":"https://router.fisgar.com.br/api123/v1/api/properties/getAll","json":{"data":[{"announce_id":99887,"street":"Rua Antônio Cesarino","number":"686","district":"Cambuí","zipcode":"13015211","buy_price":1850000}]}}]}'
```

## Painel de captação (`src/routes/captacao.js`)

Montado em `/api` (`app.use('/api', require('./src/routes/captacao'))`), atrás da mesma entrada descrita no início deste documento (chave de API com escopo `captacao`, `mesmaOrigem` e `exigeLogin`).

### `GET /api/captacao/painel`
- **Quem pode:** adm, gestor, corretor (o corretor vê só as oportunidades dele ou sem corretor; a base do Fisguei é contada inteira para todos, e `aprovacoes` aparece como 0 para corretor)
- **O que faz:** Monta o painel único de Radar + Fisguei: indicadores do topo, o funil do anúncio na base até o imóvel captado, a lista do que espera alguém, a evolução dia a dia dos últimos 30 dias, os bairros mais ativos, as quatro vitrines, os portais de origem, as contagens por status dos dois lados e os anúncios e oportunidades mais novos com foto.
- **Entrada:** nenhuma
- **Resposta:** (recortado)
```json
{
  "kpis": { "base": 51652, "hoje": 180, "opsHoje": 2, "partFg": 6100, "particulares": 6140, "imobiliarias": 45200, "comDono": 980, "abordagens": 2100, "fila": 120, "respostas": 61, "taxaResposta": 2.9, "confirmados": 3, "ativas": 58, "captadas": 3, "gasto": 184.5, "custoPorCaptacao": 61.5, "creditosMes": 360, "aprovacoes": 1 },
  "funil": [{ "rotulo": "Anúncios na base (Fisguei)", "n": 51652, "href": "#/fisguei" }, { "rotulo": "Captadas", "n": 3, "href": "#/radar?status=captada" }],
  "atencao": [{ "n": 7, "txt": "resposta(s) de proprietário esperando o corretor", "href": "#/fisguei?filtro=precisa", "nivel": "bad" }],
  "serie": { "dias": ["2026-10-01", "2026-10-30"], "fisguei": [120, 180], "radar": [1, 2], "abordagens": [40, 34], "respostas": [2, 1] },
  "bairros": [{ "nome": "Cambuí", "fisguei": 51, "radar": 4, "n": 55 }],
  "vitrines": [{ "chave": "apartamentos", "rotulo": "Apartamentos", "n": 21400, "href": "#/apartamentos" }],
  "portais": [{ "rotulo": "Chaves na Mão", "n": 30120 }],
  "radarStatus": [{ "rotulo": "Novas", "n": 41, "href": "#/radar?status=nova" }],
  "fisgueiStatus": [{ "rotulo": "Sem proprietário", "n": 51230 }],
  "novosFg": [{ "id": 1842, "ref": "FG-01842", "tipo": "Apartamento", "subtipo": "Apartamento", "bairro": "Cambuí", "valor": 1850000, "foto": "https://…" }],
  "novasOp": [{ "id": 12, "ref": "OP-0012", "titulo": "Apartamento 3 quartos Cambuí", "status": "nova", "foto": "/api/arquivos/904" }]
}
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura. A janela é fixa em 30 dias e as datas são calculadas no fuso `America/Sao_Paulo`.
- **Exemplo:**
```bash
curl -s "$BASE/api/captacao/painel" -H "Authorization: Bearer $CHAVE"
```

## Mercado e vitrines (`src/routes/mercado.js`)

Montado em `/api` (`app.use('/api', require('./src/routes/mercado'))`), atrás da mesma entrada descrita no início deste documento (chave de API com escopo `captacao`, `mesmaOrigem` e `exigeLogin`). As vitrines leem uma cópia em memória de todos os anúncios de Campinas (Fisguei + oportunidades do Radar sem anúncio), renovada a cada `MERCADO_CACHE_S` segundos (padrão 600; `0` desliga o cache) e relida em até 30 s quando chega anúncio novo pela extensão. A base tem duas versões: venda (o `valor` é o preço) e locação (o `valor` é o aluguel mensal), escolhidas pela query `neg`. Nos cartões, id positivo é anúncio do Fisguei (`origem: "fg"`, `ref` `FG-nnnnn`) e id negativo é oportunidade do Radar (`origem: "op"`, `ref` `OP-nnnn`).

Query comum às rotas de vitrine (`/mercado/resumo`, `/mercado/ruas`, `/mercado/imoveis`, `/mercado/mapa`, e também usada em `/mercado/busca`):

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `cat` | texto | não | Vitrine: `apartamentos`, `casas`, `terrenos` ou `comerciais`. Valor fora da lista é ignorado (sem recorte de vitrine). |
| `sub` | texto | não | Subtipo exato dentro da vitrine (ex.: `Cobertura`, `Galpão / barracão`, `Terreno em condomínio`). |
| `neg` | texto | não | `locacao` usa a base de aluguel. Qualquer outro valor (ou ausência) é venda. |
| `min` | número | não | Valor mínimo. Sem ele, o padrão é 0 na locação; na venda, 0 para `apartamentos` e 1.000.000 para `casas`, `terrenos`, `comerciais` e para a visão sem vitrine. |
| `max` | número | não | Valor máximo; 0 ou ausente = sem teto. |
| `tipo` | texto | não | Trecho do tipo do anúncio (corta em 30 caracteres, sem acento). |
| `quartos` | inteiro | não | Mínimo de quartos; ignorado em `terrenos` e `comerciais`. |
| `particular` | `"1"` | não | Só anúncios de particular. |

### `GET /api/mercado/resumo`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Cabeçalho das vitrines: quantos imóveis em cada uma das quatro categorias, os subtipos da categoria escolhida, medianas de valor, de R$/m² e de área, quantos vêm do Radar, quantos anúncios repetidos foram juntados, e a lista de bairros com foto de capa.
- **Entrada:** nenhuma
- **Query:** a query comum das vitrines (acima).
- **Resposta:**
```json
{
  "cat": "apartamentos",
  "categorias": { "apartamentos": { "nome": "Apartamentos", "n": 21400 }, "casas": { "nome": "Casas", "n": 8100 }, "terrenos": { "nome": "Terrenos", "n": 900 }, "comerciais": { "nome": "Salas comerciais e barracões", "n": 1400 } },
  "subtipos": [{ "nome": "Apartamento", "n": 20800 }, { "nome": "Cobertura", "n": 600 }],
  "total": 21400, "doRadar": 18, "anuncios": 24100, "repetidos": 2700, "base": 51600,
  "mediana": 740000, "m2": 7900, "area": 86, "particulares": 2400,
  "bairros": [{ "chave": "cambui", "nome": "Cambuí", "n": 1240, "mediana": 1250000, "m2": 11800, "min": 320000, "max": 9800000, "particulares": 160, "area": 98, "lat": -22.8961, "lon": -47.0498, "foto": "https://…" }]
}
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura. A resposta é guardada em memória por query, junto da base das vitrines (até 300 respostas).
- **Exemplo:**
```bash
curl -s "$BASE/api/mercado/resumo?cat=apartamentos&min=0" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/mercado/ruas`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** As ruas de um bairro, agrupando as variações de grafia, com quantidade, medianas, faixa de preço, posição média e foto de capa, da rua com mais imóveis para a com menos.
- **Entrada:** nenhuma
- **Query:** a query comum das vitrines, mais:

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `bairro` | texto | não | Nome do bairro (normalizado antes de comparar). Sem ele, nenhuma linha casa e a resposta é `[]`. |

- **Resposta:**
```json
[{ "chave": "antonio cesarino", "nome": "Rua Antônio Cesarino", "n": 42, "mediana": 1190000, "m2": 11200, "min": 420000, "max": 4300000, "particulares": 5, "area": 104, "lat": -22.8961, "lon": -47.0498, "foto": "https://…" }]
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura, com a mesma memória de respostas.
- **Exemplo:**
```bash
curl -s "$BASE/api/mercado/ruas?cat=apartamentos&bairro=Cambu%C3%AD" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/mercado/imoveis`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Os cartões de imóvel de um bairro/rua, já juntando num só cartão o mesmo imóvel anunciado em vários lugares (os demais vão em `outros`), ordenados pelo número da casa, com a situação de cada um (na carteira, busca na fila, esperando escolha, sem endereço ou livre). Até 3000 linhas selecionadas e 600 cartões devolvidos.
- **Entrada:** nenhuma
- **Query:** a query comum das vitrines, mais:

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `bairro` | texto | não | Bairro (normalizado). Sem ele, não filtra por bairro. |
| `rua` | texto | não | Rua (normalizada, sem o tipo de via). Sem ela, não filtra por rua. |

- **Resposta:**
```json
[{
  "id": 1842, "origem": "fg", "ref": "FG-01842", "href": "#/fisguei/1842",
  "tipo": "Apartamento", "subtipo": "Apartamento", "logradouro": "Rua Antônio Cesarino", "numero": "686", "complemento": "82",
  "bairro": "Cambuí", "valor": 1850000, "aluguel": null, "quartos": 3, "suites": 1, "vagas": 2, "area_util": 124,
  "lat": -22.8961, "lon": -47.0498, "anunciante_tipo": "particular", "anunciante_nome": "Maria", "status": "novo",
  "foto": "https://…", "anuncios": 2, "valor_min": 1790000, "valor_max": 1850000, "anunciantes": 2,
  "outros": [{ "id": 2050, "ref": "FG-02050", "href": "#/fisguei/2050", "valor": 1790000, "anunciante": "Imobiliária X", "portal": "ZAP Imóveis", "publicado_em": "2026-10-20" }],
  "situ": { "estado": "livre" }
}]
```
(`situ.estado` pode ser `carteira` — com `imovel_id` e `codigo` —, `buscando`, `fila`, `escolher`, `concluido`, `sem_resultado`, `erro` — com `anuncio_id` —, `livre` ou `sem_endereco`)
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura (esta rota não usa a memória de respostas: lê as linhas completas no banco a cada chamada).
- **Exemplo:**
```bash
curl -s "$BASE/api/mercado/imoveis?cat=apartamentos&bairro=Cambu%C3%AD&rua=Ant%C3%B4nio%20Cesarino" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/mercado/busca`
- **Quem pode:** adm, gestor, corretor (o corretor só vê, na parte `carteira`, os imóveis em que ele é o corretor; `veTudo` libera todos)
- **O que faz:** Busca em toda a base de uma vez — por referência (`FG-01842`, `OP-0012`), código da carteira (`AP0029`), nome ou telefone do dono (o que o Fisgar trouxe e o proprietário da ficha), nome de condomínio, rua, bairro e nome do anunciante — e devolve os cartões no mesmo formato das vitrines, cada um com o motivo pelo qual apareceu, mais os imóveis da carteira que casaram.
- **Entrada:** nenhuma
- **Query:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `q` | texto | sim na prática | O que procurar; espaços são colapsados e o texto é cortado em 80 caracteres. Com menos de 2 caracteres, devolve `{ q, imoveis: [], carteira: [], total: 0 }`. |
| `neg` | texto | não | `locacao` procura na base de aluguel; qualquer outro valor é venda. |

- **Resposta:**
```json
{
  "q": "maria silva",
  "total": 3,
  "imoveis": [{ "id": 1842, "origem": "fg", "ref": "FG-01842", "href": "#/fisguei/1842", "logradouro": "Rua Antônio Cesarino", "numero": "686", "bairro": "Cambuí", "valor": 1850000, "subtipo": "Apartamento", "vitrine": "apartamentos", "foto": "https://…", "motivo": "dono: Maria Silva", "situ": { "estado": "carteira", "imovel_id": 310, "codigo": "AP0029" } }],
  "carteira": [{ "id": 310, "codigo": "AP0029", "tipo": "Apartamento", "status": "captacao", "logradouro": "Rua Antônio Cesarino", "numero": "686", "unidade": "82", "bairro": "Cambuí", "valor": 1850000, "condominio_nome": null, "corretor_nome": "Júlia" }]
}
```
(`motivo` sai da melhor pista encontrada: `código`, `telefone de <nome>`, `dono: <nome>`, `endereço`, `na carteira · AP0029`, `condomínio <nome>`, `bairro` ou `anunciante`. A `descricao` do imóvel da carteira é removida da resposta.)
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura. No máximo 40 imóveis da carteira e 60 cartões.
- **Exemplo:**
```bash
curl -s "$BASE/api/mercado/busca?q=maria%20silva" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/mercado/mapa`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Os imóveis da vitrine com posição, em formato de array compacto para o mapa: `[id, lat, lon, valor, particular, rótulo]`. Na venda o valor vai em milhares de reais; na locação, em centenas (uma casa decimal).
- **Entrada:** nenhuma
- **Query:** a query comum das vitrines.
- **Resposta:**
```json
[[1842, -22.8961, -47.0498, 1850, 1, "Apartamento · Rua Antônio Cesarino, 686"]]
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura. Responde com `Cache-Control: private, max-age=120` e usa a memória de respostas por query.
- **Exemplo:**
```bash
curl -s "$BASE/api/mercado/mapa?cat=apartamentos" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/mercado/3d/:id`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Monta a cena 3D da rua ao redor de um anúncio do Fisguei, centrada nele — a mesma cena usada nos condomínios. Casa, sobrado, chácara e terreno viram ponto horizontal; o resto vira torre.
- **Entrada:** nenhuma
- **Resposta:**
```json
{
  "condominio": { "id": null, "nome": "Apartamento na Rua Antônio Cesarino, 686", "tipo": "vertical", "andares": null, "torres": null, "unidades": null, "logradouro": "Rua Antônio Cesarino", "numero": "686", "bairro": "Cambuí", "geo_fonte": "anuncio" },
  "cena": { "predios": [{ "p": [0, 0, 20, 0, 20, 12, 0, 12], "h": 36.6, "andares": 12, "alvo": 1 }], "alvo": { "andares": 12, "estimado": true, "sintetico": false, "quantos": 1, "alturaAndar": 2.8, "ponto": [0, 0], "contorno": null } },
  "imovel": { "id": 1842, "codigo": "FG-01842", "tipo": "Apartamento", "unidade": null, "andar": null, "valor": 1850000 },
  "unidades": []
}
```
- **Erros:** 401; 404 `Imóvel não encontrado.`; 409 `Este imóvel ainda não tem posição no mapa.` (quando nem o anúncio nem o condomínio ligado têm `lat`).
- **Efeitos:** quando o anúncio tem condomínio ligado, a cena usa o cache daquele condomínio (até 60 dias) e pode gravá-la; sem condomínio, a cena é gerada na hora **sem cache**. Gerar a cena pode consultar a base local de prédios e, quando ela não cobre o ponto, a API pública do Overpass (OpenStreetMap) pela rede.
- **Exemplo:**
```bash
curl -s "$BASE/api/mercado/3d/1842" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/mercado/iguais/:id`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Os outros anúncios que são o mesmo imóvel deste (mesma rua e número, mesma família de tipo, área parecida em até 2% e quartos compatíveis — ou preço igual quando não há metragem), do mais recente para o mais antigo.
- **Entrada:** nenhuma
- **Resposta:**
```json
[{ "id": 2050, "valor": 1790000, "anunciante": "Imobiliária X", "anunciante_tipo": "imobiliaria", "portal": "ZAP Imóveis", "publicado_em": "2026-10-20" }]
```
Devolve `[]` quando o anúncio não existe, não tem logradouro ou não tem número utilizável.
- **Erros:** 401 sem sessão (não há 404: anúncio inexistente devolve lista vazia).
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/mercado/iguais/1842" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/mercado/perto/:id`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** O que há perto do imóvel (até 1200 m), agrupado por categoria, com distância em metros e tempo estimado a pé, usando a tabela local de pontos de interesse.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "categorias": [{ "id": "transporte", "nome": "Transporte", "icone": "🚌", "total": 6, "itens": [{ "nome": "Terminal Central", "m": 420, "min": 6, "lat": -22.897, "lon": -47.05 }] }] }
```
Devolve `{ "categorias": [] }` quando o anúncio não existe, não tem `lat`, ou a tabela `pois` está vazia.
- **Erros:** 401 sem sessão (não há 404).
- **Efeitos:** só leitura (lê a tabela local `pois`; nenhuma chamada externa).
- **Exemplo:**
```bash
curl -s "$BASE/api/mercado/perto/1842" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/fachada`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Devolve a foto da fachada de um anúncio do Fisguei ou de um condomínio, tirada do Google Street View Static olhando do panorama de rua mais próximo na direção do imóvel. Cada endereço é pago uma vez e fica guardado.
- **Entrada:** nenhuma
- **Query:**

| campo | tipo | obrigatório | descrição |
|---|---|---|---|
| `ref` | texto | sim | `fg<id>` para anúncio do Fisguei, `cd<id>` para condomínio (ex.: `fg1842`, `cd57`). Outro formato não acha posição e cai no 404. |

- **Resposta:** corpo binário `image/jpeg`, com `Cache-Control: private, max-age=604800`. Em caso de falta de dados, JSON: `{ "erro": "Sem posição." }` ou `{ "erro": "Sem foto de fachada." }`.
- **Erros:** 401 sem sessão; 404 `Sem posição.` quando o registro não existe ou não tem `lat`; 404 `Sem foto de fachada.` quando não há foto guardada e o Street View não tem panorama ali (ou a chave do Google não está configurada); 500 quando o Google responde erro (ex.: `Google Street View: REQUEST_DENIED — …`, `Street View respondeu 403`).
- **Efeitos:** na primeira vez para aquele `ref`, chama a API de metadados do Street View (grátis, raios de 50 m e 120 m, só panoramas do próprio Google) e depois a Street View Static (**chamada paga**, 640x420 scale 2), e grava o resultado na tabela `fachadas` — inclusive uma linha com `img` nula quando não há panorama, para não tentar de novo. Nas vezes seguintes serve do banco, sem custo. Precisa de `GOOGLE_MAPS_KEY` ou da chave `google_maps_chave` em `config`; a requisição se apresenta com `Referer` de `PUBLIC_URL`.
- **Exemplo:**
```bash
curl -s "$BASE/api/fachada?ref=fg1842" -H "Authorization: Bearer $CHAVE" -o fachada.jpg
```

### `GET /api/mapas/config`
- **Quem pode:** adm, gestor, corretor
- **O que faz:** Diz se os recursos do Google estão disponíveis — isto é, se existe chave do Google Maps configurada —, para a tela esconder ou mostrar fachada e 3D do Google.
- **Entrada:** nenhuma
- **Resposta:**
```json
{ "fachada": true, "google3d": true }
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura (lê a variável `GOOGLE_MAPS_KEY` ou a chave `google_maps_chave` em `config`, com memória de 5 minutos).
- **Exemplo:**
```bash
curl -s "$BASE/api/mapas/config" -H "Authorization: Bearer $CHAVE"
```
## Portal do visitante (`src/routes/portal.js`)

O router principal é montado na raiz do site (`app.use(require('./src/routes/portal'))` no `server.js`); o `api` exportado é montado em `/api/publico/portal`. Todas as páginas saem com `Content-Security-Policy` própria, `Referrer-Policy: strict-origin-when-cross-origin` e `Cache-Control: public, max-age=60, s-maxage=120, stale-while-revalidate=600` quando o status é 200 (`no-store` nos outros). As páginas do Clube Signature e as respostas de pedido LGPD usam o modo privado: `Cache-Control: private, no-store`, `Vary: Cookie` e `Referrer-Policy: same-origin`.

### `GET /imoveis`
- **Quem pode:** público, sem login
- **O que faz:** vitrine dos imóveis no ar (status `publicado`, com foto própria e página aprovada pela régua), com busca, filtros, ordenação e paginação. Quando a querystring traz `bairro` e existe guia daquele bairro no ar, a página mostra o link para `/bairros/<slug>`.
- **Entrada:** nenhuma.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `q` | texto | não | busca livre (até 80 caracteres) em título, resumo, tipo, bairro, cidade, condomínio e código |
| `tipo` | texto | não | grupo: `apartamento`, `casa`, `terreno`, `rural` ou `comercial` |
| `bairro` | texto | não | nome do bairro, comparado sem acento |
| `quartos` | inteiro | não | mínimo de quartos |
| `ate` | número | não | valor máximo (só dígitos são lidos) |
| `de` | número | não | valor mínimo (só dígitos são lidos) |
| `ordem` | texto | não | `menor-valor`, `maior-valor` ou `maior-area`; vazio = mais recentes |
| `pagina` | inteiro | não | padrão `1` |

- **Resposta:** HTML.
- **Erros:** nenhum status de erro próprio; sem imóveis a página mostra o aviso de vazio com status 200.
- **Efeitos:** só leitura. Pode reler o ramo de conteúdo no GitHub (cache de 10 min em memória e em `data/portal-cache`) e recalcular o estado do portal (cache de 2 min).
- **Exemplo:**
```bash
curl -s "$BASE/imoveis?tipo=apartamento&bairro=Cambu%C3%AD&quartos=3&ordem=menor-valor"
```

### `GET /imoveis/revista`
- **Quem pode:** público, sem login
- **O que faz:** monta a edição "revista" do portal: capítulos com os imóveis mais fotogênicos (fora os da seleção Signature) e as três matérias mais recentes do blog.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** HTML. A CSP desta rota libera `img-src https://raw.githubusercontent.com` (as capas do blog moram no GitHub).
- **Erros:** nenhum; se a lista de artigos falhar, a página sai sem a seção do blog.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/imoveis/revista"
```

### `GET /imoveis/signature`
- **Quem pode:** público, sem login (os valores só aparecem com o cookie do Clube)
- **O que faz:** apresenta a seleção Signature — os imóveis à venda com valor a partir de R$ 10.000.000. Se o aparelho tem o cookie `hh_signature` válido, mostra os valores; senão, mostra o formulário do Clube.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** HTML, com `Cache-Control: private, no-store` e `Vary: Cookie`.
- **Erros:** nenhum.
- **Efeitos:** só leitura (lê e confere o HMAC do cookie do Clube; não grava nada).
- **Exemplo:**
```bash
curl -s "$BASE/imoveis/signature"
```

### `GET /imoveis/signature/:codigo`
- **Quem pode:** público, sem login
- **O que faz:** a página de uma residência da seleção Signature. O código é passado para maiúsculas.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** HTML privado (`private, no-store`, `Vary: Cookie`).
- **Erros:** se o código não casa com o formato `^[A-Z]{1,4}-?[A-Z]{0,4}\d{2,6}$`, a rota chama `next()` (cai nas rotas seguintes); se o imóvel não está na seleção, HTML de "não achada" com **404**.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/imoveis/signature/ca0004"
```

### `GET /imoveis/favoritos`
- **Quem pode:** público, sem login
- **O que faz:** entrega a página dos favoritos. Os favoritos ficam no aparelho do visitante; o servidor só manda a lista completa de imóveis no ar para o JavaScript da página escolher o que mostrar.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** HTML (`noindex` na própria página, e `Disallow` no `robots.txt`).
- **Erros:** nenhum.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/imoveis/favoritos"
```

### `GET /imoveis/dados.json`
- **Quem pode:** público, sem login (fora do Google: está em `Disallow` no `robots.txt`)
- **O que faz:** a ficha e as fotos de cada imóvel à venda, mais a situação da página de cada um. É o que a rotina que escreve as páginas do portal lê.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JSON, com `Cache-Control: public, max-age=30, s-maxage=60`.
```json
{
  "geradoEm": "2026-10-30T12:00:00.000Z",
  "imoveis": [
    {
      "codigo": "AP0029", "versao": "...", "tipo": "Apartamento",
      "bairro": "Cambuí", "cidade": "Campinas", "uf": "SP",
      "condominio": "Edifício X", "lazer_do_condominio": null,
      "quartos": 3, "suites": 1, "vagas": 2, "area_util": 120, "area_total": null,
      "descricao_do_anuncio": "...",
      "fotos": [{ "foto": 1234, "url": "https://exemplo/imoveis/foto/1234" }],
      "pagina": { "estado": "no-ar", "slug": "apartamento-cambui-ap0029" }
    }
  ]
}
```
  `pagina.estado` pode ser `sem-pagina`, `sem-foto`, `sem-arquivo`, `reprovada`, `desatualizada` ou `no-ar`; `slug` e `erros` só aparecem quando existem.
- **Erros:** nenhum status de erro próprio.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/imoveis/dados.json"
```

### `GET /imoveis/foto/:id/capa`
- **Quem pode:** público, sem login
- **O que faz:** a capa em alta e sem carimbo usada no topo das páginas Signature e do imóvel. Quando a foto está guardada como endereço externo terminado em `h.jpg`, tenta primeiro a versão `c.jpg` (alta, sem carimbo); se ela ainda não existe, entrega a foto normal com cache curto, para a capa nova aparecer assim que publicada.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** os bytes da imagem, com o `Content-Type` da origem. Com a versão limpa: `Cache-Control: public, max-age=604800, s-maxage=2592000, immutable`. Sem ela: `public, max-age=300, s-maxage=300`.
- **Erros:** **404** se o `id` não é de 1 a 9 dígitos ou se a foto não é de um imóvel publicado; **302** para `/imoveis/foto/<id>?v=2` quando a foto não é externa; **502** quando a origem externa não responde uma imagem.
- **Efeitos:** só leitura; guarda a imagem externa num cache em memória (no máximo 120 endereços, o mais antigo sai).
- **Exemplo:**
```bash
curl -s -o capa.jpg "$BASE/imoveis/foto/174/capa"
```

### `GET /imoveis/foto/:id/og.jpg`
- **Quem pode:** público, sem login
- **O que faz:** a versão JPEG reduzida da foto, para a prévia das redes sociais (Open Graph).
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** imagem JPEG (`Cache-Control: public, max-age=86400, s-maxage=604800`). Quando a foto é externa, entrega o arquivo da origem.
- **Erros:** **404** se o `id` não é de 1 a 9 dígitos, se a foto não é de imóvel publicado, ou se o arquivo não pode ser convertido nem entregue como está.
- **Efeitos:** só leitura; o JPEG convertido fica num cache em memória.
- **Exemplo:**
```bash
curl -s -o og.jpg "$BASE/imoveis/foto/1234/og.jpg"
```

### `GET /imoveis/foto/:id`
- **Quem pode:** público, sem login
- **O que faz:** entrega a foto de um imóvel à venda. Só fotos da categoria `Fotos` de imóvel com status `publicado` saem por aqui.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** os bytes da imagem, com o `Content-Type` do arquivo e `Cache-Control: public, max-age=604800, s-maxage=2592000, immutable`.
- **Erros:** **404** se o `id` não é de 1 a 9 dígitos, se a foto não é pública ou se o conteúdo não pode ser lido; **502** quando a foto é externa e a origem falha.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s -o foto.jpg "$BASE/imoveis/foto/1234"
```

### `GET /imoveis/:slug`
- **Quem pode:** público, sem login
- **O que faz:** a página única do imóvel. Se o endereço é um código (`AP0029`) e não tem `--`, redireciona para o endereço bonito. Junta o guia do bairro quando ele está no ar.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** HTML.
- **Erros:** **301** para `/imoveis/<slug>` quando o endereço é o código de um imóvel no ar; `next()` quando o endereço não casa `^[a-z0-9]+(?:-[a-z0-9]+)*$`; HTML de "não achada" com **404** quando não existe página com aquele endereço.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/imoveis/apartamento-3-quartos-cambui-ap0029"
```

### `GET /imoveis/`
- **Quem pode:** público, sem login
- **O que faz:** tira a barra do fim.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** **301** para `/imoveis` (sem corpo).
- **Erros:** nenhum.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s -i "$BASE/imoveis/"
```

### `GET /privacidade`
- **Quem pode:** público, sem login
- **O que faz:** a página de privacidade e dados da imobiliária (a controladora), com o índice das seções e o formulário de pedido do titular (LGPD). Textos de `src/lgpd/textos.js`.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** HTML.
- **Erros:** nenhum.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/privacidade"
```

### `GET /termos`
- **Quem pode:** público, sem login
- **O que faz:** a página de termos de uso do site, com o mesmo índice e as mesmas abas de `/privacidade` (sem o formulário).
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** HTML.
- **Erros:** nenhum.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/termos"
```

### `POST /privacidade/pedido`
- **Quem pode:** público, sem login
- **O que faz:** registra um pedido do titular (LGPD) feito na página de privacidade. Corpo em `application/x-www-form-urlencoded`, limite de 20 kB.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `tipo` | texto | sim | um de `oposicao`, `confirmar`, `acessar`, `corrigir`, `eliminar`, `compartilhamento`, `portabilidade` (e os demais de `TIPOS` em `src/lgpd/index.js`) |
| `nome` | texto | sim | até 120 caracteres |
| `telefone` | texto | depende | só dígitos, 10 a 13; obrigatório quando `tipo` é `oposicao` ou `eliminar` |
| `email` | texto | depende | até 160 caracteres; é preciso informar e-mail **ou** telefone |
| `mensagem` | texto | não | detalhes, até 2000 caracteres |
| `declaro` | `"1"` | sim | confirma que o pedido é sobre os próprios dados |
| `empresa` | texto | não | armadilha para robô: se vier preenchido, responde "Pedido recebido." e não grava nada |

- **Query:** nenhuma.
- **Resposta:** HTML. Deu certo: página de confirmação com o protocolo e o prazo (15 dias), em modo privado. Para `oposicao` e `eliminar`, a página avisa que o telefone já entrou na lista "não contatar".
- **Erros:** **429** com a própria página de privacidade e o aviso em vermelho quando passa de 5 envios em 10 minutos pelo mesmo IP; **400** (mesmo formato) nas validações do `src/lgpd/valida`; **500** quando não consegue gravar.
- **Efeitos:** grava em `titular_pedidos`; `oposicao` e `eliminar` também gravam em `fisguei_bloqueios`, marcam `leads.nao_contatar=1`, pulam contatos na fila (`fisguei_contatos`) e, com banco Postgres, chamam `lgpd.opor(...)` na lista comum da plataforma; registra `lgpd_pedido` na auditoria.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/privacidade/pedido" -H 'Content-Type: application/x-www-form-urlencoded' --data 'tipo=oposicao&nome=Ana%20Souza&telefone=19999999999&declaro=1'
```

### `POST /interesse`
Montado em `/api/publico/portal/interesse`.
- **Quem pode:** público, sem login
- **O que faz:** o "Tenho interesse" / "Agendar visita" das páginas do portal: vira lead quente no CRM com a origem `Portal <cliente>`. Se o corpo traz `condominio` e **não** traz `codigo`, o pedido é tratado como "Quero morar aqui" na página de um condomínio.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `codigo` | texto | sim (fora do caso do condomínio) | código do imóvel; passa a maiúsculas e tem de casar `^[A-Z]{1,4}-?[A-Z]{0,4}\d{2,6}$` |
| `condominio` | texto | não | endereço (slug) do condomínio; usado só quando `codigo` não vem |
| `nome` | texto | sim | ao menos 2 caracteres, cortado em 120 |
| `telefone` | texto | sim | normalizado para `55` + DDD + número (10 ou 11 dígitos) |
| `email` | texto | não | se vier, tem de ser um e-mail; cortado em 120 |
| `aceite` | qualquer valor verdadeiro | sim | concordância com o uso dos dados para o contato |
| `mensagem` | texto | não | até 1000 caracteres |
| `visita` | qualquer valor verdadeiro | não | padrão falso; `true` abre o lead na etapa `visita` |
| `dia` | texto | não | `AAAA-MM-DD`; só é aceito nesse formato e aparece como DD/MM/AAAA |
| `periodo` | texto | não | `Manhã`, `Tarde` ou `Fim de semana`; outro valor é ignorado |
| `empresa` | texto | não | armadilha para robô: se vier preenchido, responde `{"ok":true}` e nada acontece |

- **Query:** nenhuma.
- **Resposta:** JSON.
```json
{ "ok": true }
```
- **Erros:** **429** `{"erro":"Muitos envios seguidos. Aguarde alguns minutos ou fale pelo WhatsApp."}` acima de 6 envios em 10 minutos pelo mesmo IP; **400** para código inválido, nome curto, telefone fora do padrão, e-mail errado ou aceite não marcado; **404** `{"erro":"Este imóvel não está mais à venda."}` (ou "Condomínio não encontrado." no caminho do condomínio).
- **Efeitos:** cria o lead em `leads` (temperatura `quente`, etapa `novo` ou `visita`, corretor do imóvel) ou, se já existe lead com aquele telefone, atualiza `ultimo_contato`, põe a temperatura em `quente` e preenche o e-mail que estava vazio; grava a interação em `interacoes` (tipo `portal`) com o texto do pedido e, quando o visitante chegou por um link das redes (cookie `redes_origem`), a rede e o número da publicação; a origem do lead fica `Portal <cliente> · redes (<rede>)` nesse caso; registra `portal_interesse` na auditoria. No caminho do condomínio a temperatura é `morno`, a origem é `Portal <cliente> · condomínio` e a auditoria é `portal_interesse_condominio`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/publico/portal/interesse" -H 'Content-Type: application/json' -d '{"nome":"Ana","telefone":"19999999999","codigo":"AP0029","aceite":1,"visita":true,"dia":"2026-11-10","periodo":"Manhã"}'
```

### `POST /signature`
Montado em `/api/publico/portal/signature`.
- **Quem pode:** público, sem login
- **O que faz:** o pedido de acesso ao Clube Signature. Vira lead quente com a origem `<cliente> Signature` e libera os valores no aparelho pelo cookie assinado.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `nome` | texto | sim | ao menos 2 caracteres, cortado em 120 |
| `telefone` | texto | sim | normalizado para `55` + DDD + número (10 ou 11 dígitos) |
| `email` | texto | não | se vier, tem de ser um e-mail; cortado em 120 |
| `aceite` | qualquer valor verdadeiro | sim | concordância com o uso dos dados |
| `codigo` | texto | não | código da residência pela qual o visitante pediu o acesso |
| `mensagem` | texto | não | até 1000 caracteres (lida na validação, não entra no texto da interação) |
| `empresa` | texto | não | armadilha para robô: responde `{"ok":true}` sem gravar |

- **Query:** nenhuma.
- **Resposta:** JSON `{ "ok": true }`, com o cabeçalho `Set-Cookie: hh_signature=<lead>.<validade>.<assinatura>; Path=/; Max-Age=15552000; HttpOnly; SameSite=Lax` (mais `Secure` quando roda na Vercel) — 180 dias.
- **Erros:** **429** acima de 6 envios em 10 minutos pelo mesmo IP; **400** nas validações de nome, telefone, e-mail e aceite.
- **Efeitos:** cria ou atualiza o lead em `leads` (origem `<cliente> Signature`, etapa `novo`, temperatura `quente`, busca "imóveis acima de R$ 10 milhões"); grava a interação em `interacoes` (tipo `portal`); registra `signature_clube` na auditoria; deixa no aparelho o cookie `hh_signature` (HMAC com a `SECRET_KEY`, guardando só o número do lead e a validade).
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/publico/portal/signature" -H 'Content-Type: application/json' -d '{"nome":"Ana Souza","telefone":"19999999999","aceite":1,"codigo":"CA0004"}'
```

## Blog público (`src/routes/blog.js`)

O router é montado na raiz; o `api` em `/api/publico/blog`. As páginas HTML saem com `Cache-Control: public, max-age=300` e uma CSP que libera `img-src https://raw.githubusercontent.com` (as capas moram no GitHub).

### `GET /robots.txt`
- **Quem pode:** público, sem login
- **O que faz:** entrega o `robots.txt` do site: libera `/blog`, `/blog-assets/`, `/imoveis`, `/bairros`, `/portal-assets/` e `/llms.txt`, bloqueia `/imoveis/favoritos`, `/imoveis/dados.json`, `/bairros/dados.json`, `/bairros/commons/` e todo o resto, e aponta o `Sitemap`.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** texto simples (`text/plain`).
- **Erros:** nenhum.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/robots.txt"
```

### `GET /llms.txt`
- **Quem pode:** público, sem login
- **O que faz:** o mapa do que a imobiliária publica, em texto simples, para as IAs: imóveis no ar, guias de bairro e artigos do blog.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** texto simples, com `Cache-Control: public, max-age=600, s-maxage=3600`.
- **Erros:** nenhum; cada lista que falhar entra vazia.
- **Efeitos:** só leitura (pode reler os ramos de conteúdo do portal, dos bairros e do blog no GitHub, com os caches de 10 min).
- **Exemplo:**
```bash
curl -s "$BASE/llms.txt"
```

### `GET /sitemap.xml`
- **Quem pode:** público, sem login
- **O que faz:** o sitemap com os artigos do blog, os imóveis no ar e os guias de bairro.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** XML (`application/xml`).
- **Erros:** nenhum; as listas de imóveis e bairros entram vazias se falharem.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/sitemap.xml"
```

### `GET /blog/rss.xml`
- **Quem pode:** público, sem login
- **O que faz:** o feed RSS dos artigos no ar.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** XML (`application/rss+xml`).
- **Erros:** nenhum.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/blog/rss.xml"
```

### `GET /blog`
- **Quem pode:** público, sem login
- **O que faz:** a página inicial do blog, com os artigos no ar (aprovados pela régua e já publicados).
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** HTML.
- **Erros:** nenhum.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/blog"
```

### `GET /blog/categoria/:cat`
- **Quem pode:** público, sem login
- **O que faz:** a mesma página inicial, filtrada por uma categoria.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** HTML.
- **Erros:** `next()` quando a categoria não é uma das conhecidas (`alto-padrao`, `construcao`, `interiores`, `bem-estar`, `campinas`, `noticias`).
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/blog/categoria/campinas"
```

### `GET /blog/:slug`
- **Quem pode:** público, sem login
- **O que faz:** o artigo, com o "Leia também" (mesma categoria vale 2 pontos, cada etiqueta em comum 1 ponto; os 3 melhores).
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** HTML.
- **Erros:** `next()` quando o endereço não casa `^[a-z0-9]+(?:-[a-z0-9]+)*$`; HTML de "não achada" com **404** quando o artigo não está no ar.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/blog/meu-artigo"
```

### `GET /blog/` e `GET /blog/categoria`
- **Quem pode:** público, sem login
- **O que faz:** manda os dois endereços soltos para a página inicial do blog.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** **301** para `/blog` (sem corpo).
- **Erros:** nenhum.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s -i "$BASE/blog/categoria"
```

### `POST /contato`
Montado em `/api/publico/blog/contato`.
- **Quem pode:** público, sem login
- **O que faz:** o formulário do próprio blog: vira lead no CRM com a origem `Blog <cliente>`.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `motivo` | texto | não | `comprar`, `vender` ou `duvida`; padrão `duvida` (qualquer outro valor cai em `duvida`) |
| `nome` | texto | sim | ao menos 2 caracteres, cortado em 120 |
| `telefone` | texto | sim | normalizado para `55` + DDD + número (10 ou 11 dígitos) |
| `email` | texto | não | se vier, tem de ser um e-mail; cortado em 120 |
| `aceite` | qualquer valor verdadeiro | sim | concordância com o uso dos dados |
| `mensagem` | texto | não | até 1000 caracteres |
| `pagina` | texto | não | endereço do artigo de onde saiu o contato; vira `/blog/<slug>` se casa o formato de endereço, senão `/blog` |
| `empresa` | texto | não | armadilha para robô: responde `{"ok":true}` sem gravar |

- **Query:** nenhuma.
- **Resposta:** JSON `{ "ok": true }`.
- **Erros:** **429** acima de 6 envios em 10 minutos pelo mesmo IP; **400** nas validações de nome, telefone, e-mail e aceite.
- **Efeitos:** cria ou atualiza o lead em `leads` (origem `Blog <cliente>`, etapa `novo`, temperatura `morno` para `duvida` e `quente` nos outros motivos); grava a interação em `interacoes` com tipo `blog`; registra `blog_contato` na auditoria.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/publico/blog/contato" -H 'Content-Type: application/json' -d '{"motivo":"vender","nome":"Ana","telefone":"19999999999","aceite":1,"pagina":"meu-artigo"}'
```

## Guias de bairro (`src/routes/bairros.js`)

Três routers: o público (montado na raiz), o `api` (em `/api/publico/bairros`) e o `tela` (em `/api`, atrás do login). Em `/api` a entrada pode ser o cookie de sessão `hh_sessao` do navegador ou uma chave de API em `Authorization: Bearer hh_...` (ou `X-API-Key`); a chave resolve o usuário e dispensa o cookie e a conferência de origem. As rotas de bairros exigem o escopo `conteudo` da chave. As páginas públicas saem com `Cache-Control: public, max-age=120, s-maxage=600, stale-while-revalidate=3600` quando o status é 200.

### `GET /bairros`
- **Quem pode:** público, sem login
- **O que faz:** a lista dos bairros com guia no ar, por região, com a capa pequena de cada cartão e a contagem de imóveis do portal naquele bairro.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** HTML.
- **Erros:** nenhum.
- **Efeitos:** só leitura do ponto de vista do visitante, mas a busca da capa pode gravar: `commons.info()` consulta o Wikimedia Commons e grava/renova a ficha da foto (licença, autor, tamanho) na tabela `bairro_commons`.
- **Exemplo:**
```bash
curl -s "$BASE/bairros"
```

### `GET /bairros/`
- **Quem pode:** público, sem login
- **O que faz:** tira a barra do fim.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** **301** para `/bairros` (sem corpo).
- **Erros:** nenhum.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s -i "$BASE/bairros/"
```

### `GET /bairros/dados.json`
- **Quem pode:** público, sem login (fora do Google: `Disallow` no `robots.txt`)
- **O que faz:** a fila e tudo que quem escreve os guias precisa: situação da página, centro do bairro, carteira do cliente, condomínios, o que tem perto, fotos de imóveis e as notas da imobiliária. Ordena pela urgência (`pedida` primeiro, `oculto` por último), depois por prioridade, número de imóveis, condomínios e nome. Bairros ocultos ficam de fora. Os campos `notas`, `carteira` e `imoveis` são o contrato lido por `scripts/bairros-publicar.mjs` e pela tarefa agendada.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JSON, com `Cache-Control: public, max-age=30, s-maxage=60`.
```json
{
  "geradoEm": "2026-10-30T12:00:00.000Z",
  "bairros": [
    {
      "slug": "cambui", "nome": "Cambuí", "regiao": "Centro",
      "apelidos": [], "prioridade": 0, "notas": null,
      "pagina": { "estado": "no-ar", "titulo": "...", "endereco": "/bairros/cambui", "publicadoEm": "2026-10-20" },
      "centro": { "lat": -22.89, "lon": -47.05 },
      "carteira": { "total": 4, "tipos": ["Apartamento (3)", "Casa (1)"], "menor": 800000, "maior": 2500000 },
      "condominios": { "total": 120, "verticais": 110, "horizontais": 2, "unidades": 4200, "maisAlto": 24, "nomes": [] },
      "perto": {}, "imoveis": []
    }
  ]
}
```
- **Erros:** nenhum status de erro próprio.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/bairros/dados.json"
```

### `GET /bairros/commons/busca.json`
- **Quem pode:** público, sem login (`Disallow` no `robots.txt`)
- **O que faz:** ponte de busca de imagens no Wikimedia Commons, para quem escreve os guias. Marca em cada resultado se a licença é aceita e, nesse caso, o endereço de pré-visualização.
- **Entrada:** nenhuma.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `q` | texto | sim de fato | termo de busca; só letras, números, espaço, `'`, `.` e `-`; cortado em 80 caracteres. Menos de 3 caracteres devolve lista vazia |
| `n` | inteiro | não | quantos resultados; padrão `24`, limitado a 40 na chamada ao Commons |

- **Resposta:** JSON, com `Cache-Control: public, max-age=300, s-maxage=3600`.
```json
{ "resultados": [ { "titulo": "File:Exemplo.jpg", "largura": 4000, "altura": 3000, "autor": "...", "licenca": "CC BY-SA 4.0", "descricao": "...", "data": "...", "aceita": true, "ver": "/bairros/commons/ver?t=File%3AExemplo.jpg" } ] }
```
  `motivo` só aparece quando a licença não é aceita; `ver` só quando é.
- **Erros:** **429** `{"erro":"Muitas buscas seguidas. Aguarde alguns minutos."}` acima de 400 chamadas em 10 minutos pelo mesmo IP; **502** quando o Commons não responde.
- **Efeitos:** só leitura local; chama a API do Commons.
- **Exemplo:**
```bash
curl -s "$BASE/bairros/commons/busca.json?q=Cambui%20Campinas&n=12"
```

### `GET /bairros/commons/info.json`
- **Quem pode:** público, sem login (`Disallow` no `robots.txt`)
- **O que faz:** a licença, o autor e o tamanho de um arquivo do Commons, com o crédito já montado quando a licença é aceita.
- **Entrada:** nenhuma.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `t` | texto | sim | título do arquivo no formato `File:Nome.jpg` |
| `renovar` | `"1"` | não | padrão desligado; com `1`, refaz a consulta mesmo que a ficha no banco esteja recente |

- **Resposta:** JSON.
```json
{ "titulo": "File:Exemplo.jpg", "aceita": true, "autor": "...", "licenca": "CC BY-SA 4.0", "largura": 4000, "altura": 3000, "descricao": "...", "credito": "Foto: ... · CC BY-SA 4.0 · Wikimedia Commons" }
```
- **Erros:** **429** `{"erro":"Muitas consultas seguidas."}` acima de 1000 chamadas em 10 minutos pelo mesmo IP; **404** `{"erro":"Arquivo inválido (use \"File:Nome.jpg\")."}`; **502** quando o Commons não responde e não há ficha no banco.
- **Efeitos:** grava ou renova a ficha do arquivo na tabela `bairro_commons` (endereço, miniatura, tamanho, autor, licença, descrição, aceite, motivo e data da conferência).
- **Exemplo:**
```bash
curl -s "$BASE/bairros/commons/info.json?t=File%3AExemplo.jpg"
```

### `GET /bairros/commons/ver`
- **Quem pode:** público, sem login (`Disallow` no `robots.txt`)
- **O que faz:** pré-visualização de um arquivo do Commons. Só entrega imagem de arquivo já conferido e com licença aceita.
- **Entrada:** nenhuma.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `t` | texto | sim | título do arquivo (`File:Nome.jpg`) |
| `l` | inteiro | não | largura desejada; padrão `500`, no máximo `1280` |

- **Resposta:** os bytes da imagem, com `Cache-Control: public, max-age=86400, s-maxage=604800` e `X-Robots-Tag: noindex`.
- **Erros:** **429** (sem corpo) acima de 3000 chamadas em 10 minutos pelo mesmo IP; **404** quando o arquivo não existe ou a licença não é aceita; **502** quando o Commons falha.
- **Efeitos:** pode gravar/renovar a ficha em `bairro_commons` (passa por `commons.info`).
- **Exemplo:**
```bash
curl -s -o previa.jpg "$BASE/bairros/commons/ver?t=File%3AExemplo.jpg&l=500"
```

### `GET /bairros/:slug/foto/:n`
- **Quem pode:** público, sem login
- **O que faz:** entrega a foto do Commons de número `n` usada na página daquele bairro (só fotos que estão na página publicada e que vêm do Commons).
- **Entrada:** nenhuma.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `l` | texto | não | `500` pede a versão pequena; qualquer outro valor (ou nenhum) entrega 1280 px |

- **Resposta:** os bytes da imagem, com `Cache-Control: public, max-age=604800, s-maxage=2592000`.
- **Erros:** **404** quando o endereço do bairro não casa o formato, quando `n` não é de 1 a 3 dígitos, quando a página não tem a foto `f<n>` do Commons, ou quando a imagem não vem; **502** quando o Commons falha.
- **Efeitos:** pode gravar/renovar a ficha em `bairro_commons`.
- **Exemplo:**
```bash
curl -s -o foto.jpg "$BASE/bairros/cambui/foto/1?l=500"
```

### `GET /bairros/:slug`
- **Quem pode:** público, sem login
- **O que faz:** o guia do bairro, com os números ao vivo (carteira, condomínios, o que tem perto), os imóveis do portal naquele bairro e os cartões de outros bairros da mesma região (até 6; sem nenhum, os 6 primeiros da lista).
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** HTML.
- **Erros:** `next()` quando o endereço não casa `^[a-z0-9]+(?:-[a-z0-9]+)*$`; **301** para o endereço certo quando o que veio é apelido ou grafia antiga de um bairro com guia no ar; HTML de "não achada" com **404** quando não existe guia.
- **Efeitos:** só leitura local; as capas podem gravar/renovar fichas em `bairro_commons`.
- **Exemplo:**
```bash
curl -s "$BASE/bairros/cambui"
```

### `POST /contato`
Montado em `/api/publico/bairros/contato`.
- **Quem pode:** público, sem login
- **O que faz:** o formulário da página do bairro: vira lead no CRM com a origem `Portal <cliente> · bairro`.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `bairro` | texto | sim | endereço (slug) do bairro; não pode ser bairro oculto |
| `motivo` | texto | não | `comprar`, `vender` ou `duvida`; padrão `duvida` |
| `nome` | texto | sim | ao menos 2 caracteres, cortado em 120 |
| `telefone` | texto | sim | normalizado para `55` + DDD + número (10 ou 11 dígitos) |
| `email` | texto | não | se vier, tem de ser um e-mail; cortado em 120 |
| `aceite` | qualquer valor verdadeiro | sim | concordância com o uso dos dados |
| `mensagem` | texto | não | até 1000 caracteres |
| `empresa` | texto | não | armadilha para robô: responde `{"ok":true}` sem gravar |

- **Query:** nenhuma.
- **Resposta:** JSON `{ "ok": true }`.
- **Erros:** **429** acima de 6 envios em 10 minutos pelo mesmo IP; **404** `{"erro":"Bairro não encontrado."}`; **400** nas validações de nome, telefone, e-mail e aceite.
- **Efeitos:** cria ou atualiza o lead em `leads` (origem `Portal <cliente> · bairro`, etapa `novo`, temperatura `morno` para `duvida` e `quente` nos outros motivos, campo `bairros` com o nome do bairro); grava a interação em `interacoes` (tipo `portal`); registra `bairro_contato` na auditoria.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/publico/bairros/contato" -H 'Content-Type: application/json' -d '{"bairro":"cambui","motivo":"comprar","nome":"Ana","telefone":"19999999999","aceite":1}'
```

### `GET /bairros` (tela do sistema)
Montado em `/api/bairros`.
- **Quem pode:** com login (cookie de sessão `hh_sessao`) ou com chave de API (`Authorization: Bearer $CHAVE` ou `X-API-Key`); qualquer perfil
- **O que faz:** a tela Conteúdo › Páginas de bairros: a lista completa (inclusive os ocultos) com a situação de cada página, quantos imóveis e condomínios cada bairro tem, e as sugestões de bairros que ainda não estão na lista.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JSON.
```json
{
  "bairros": [ { "slug": "cambui", "nome": "Cambuí", "estado": "no-ar", "titulo": "...", "publicadoEm": "2026-10-20", "atualizadoEm": null, "erros": null, "palavras": 1200, "imoveis": 4, "imoveisNoPortal": 3, "condominios": 120 } ],
  "sugestoes": [ { "nome": "Taquaral", "condominios": 30, "imoveis": 2 } ],
  "podeEditar": true
}
```
  `podeEditar` é verdadeiro só para os perfis `adm` e `gestor`.
- **Erros:** **401** `{"erro":"Sessão expirada. Entre novamente."}` sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/bairros" -H "Authorization: Bearer $CHAVE"
```

### `POST /bairros` (tela do sistema)
Montado em `/api/bairros`.
- **Quem pode:** com login ou com chave de API, perfil `adm` ou `gestor`
- **O que faz:** põe um bairro novo na lista (origem `manual`).
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `nome` | texto | sim | ao menos 2 caracteres, cortado em 80; o endereço (slug) sai dele |
| `regiao` | texto | não | até 60 caracteres; sem valor fica nulo |
| `notas` | texto | não | até 2000 caracteres; sem valor fica nulo |

- **Query:** nenhuma.
- **Resposta:** JSON `{ "ok": true, "slug": "taquaral" }`.
- **Erros:** **401** sem sessão; **403** `{"erro":"Seu perfil não tem acesso a esta função."}`; **400** `Diga o nome do bairro.`; **409** quando o bairro já está na lista ou quando o nome já é apelido de outro bairro.
- **Efeitos:** insere em `bairros`; registra `bairro_novo` na auditoria; recalcula o estado dos guias sem reler o GitHub.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/bairros" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"nome":"Taquaral","regiao":"Norte"}'
```

### `PUT /bairros/:slug` (tela do sistema)
Montado em `/api/bairros/:slug`.
- **Quem pode:** com login ou com chave de API, perfil `adm` ou `gestor`
- **O que faz:** salva os dados do bairro. Cada campo é opcional: o que não vem no corpo fica como está.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `nome` | texto | não | ao menos 2 caracteres, cortado em 80 |
| `regiao` | texto | não | até 60 caracteres; vazio vira nulo |
| `apelidos` | lista ou texto | não | lista de nomes, ou texto separado por linha nova ou `;`; cada um até 80 caracteres, no máximo 30 |
| `prioridade` | inteiro | não | limitado entre -9 e 9; valor não numérico vira 0 |
| `oculto` | booleano | não | `1`/verdadeiro esconde o bairro |
| `notas` | texto | não | até 2000 caracteres; vazio vira nulo |
| `lat` | número | não | `null` ou `""` apaga; tem de ficar entre -23,2 e -22,6 |
| `lon` | número | não | `null` ou `""` apaga; tem de ficar entre -47,4 e -46,8 |

- **Query:** nenhuma.
- **Resposta:** JSON `{ "ok": true }`.
- **Erros:** **401** sem sessão; **403** por perfil; **404** `Bairro não encontrado.`; **400** `Diga o nome do bairro.` ou `O centro do bairro tem de ficar em Campinas.`.
- **Efeitos:** atualiza a linha em `bairros` (e `atualizado_em`); registra `bairro_editado` na auditoria; recalcula o estado dos guias.
- **Exemplo:**
```bash
curl -s -X PUT "$BASE/api/bairros/cambui" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"regiao":"Centro","prioridade":5,"lat":-22.89,"lon":-47.05}'
```

### `POST /bairros/:slug/apelido` (tela do sistema)
Montado em `/api/bairros/:slug/apelido`.
- **Quem pode:** com login ou com chave de API, perfil `adm` ou `gestor`
- **O que faz:** acrescenta um nome alternativo (apelido ou grafia antiga) ao bairro. Se o nome já é o próprio nome ou um apelido existente, nada muda.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `texto` | texto | sim | o nome que também é deste bairro; até 80 caracteres |

- **Query:** nenhuma.
- **Resposta:** JSON `{ "ok": true }`.
- **Erros:** **401** sem sessão; **403** por perfil; **404** `Bairro não encontrado.`; **400** `Diga o nome que é deste bairro.`; **409** quando o nome já é de outro bairro.
- **Efeitos:** atualiza `bairros.apelidos` (pelo mesmo caminho do `PUT`); registra `bairro_apelido` na auditoria; recalcula o estado dos guias.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/bairros/cambui/apelido" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"texto":"Cambuhy"}'
```

### `POST /bairros/:slug/reescrever` (tela do sistema)
Montado em `/api/bairros/:slug/reescrever`.
- **Quem pode:** com login ou com chave de API, perfil `adm` ou `gestor`
- **O que faz:** pede a reescrita do guia: marca a data do pedido, e o bairro passa a vir primeiro na fila do `dados.json`.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JSON `{ "ok": true }`.
- **Erros:** **401** sem sessão; **403** por perfil; **404** `Bairro não encontrado.`.
- **Efeitos:** grava `bairros.pedido_em` com a data e a hora locais; registra `bairro_reescrever` na auditoria; recalcula o estado dos guias.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/bairros/cambui/reescrever" -H "Authorization: Bearer $CHAVE"
```

### `GET /bairros/:slug/redes` (tela do sistema)
Montado em `/api/bairros/:slug/redes`.
- **Quem pode:** com login ou com chave de API; qualquer perfil
- **O que faz:** devolve a legenda e as hashtags da página do bairro para publicar nas redes, já com o endereço completo do guia no fim da legenda.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JSON.
```json
{ "legenda": "...\n\nhttps://exemplo/bairros/cambui", "hashtags": "#cambui #campinas" }
```
- **Erros:** **401** sem sessão; **404** `{"erro":"Página sem legenda para as redes."}`.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/bairros/cambui/redes" -H "Authorization: Bearer $CHAVE"
```

### `POST /bairros/atualizar` (tela do sistema)
Montado em `/api/bairros/atualizar`.
- **Quem pode:** com login ou com chave de API, perfil `adm` ou `gestor`
- **O que faz:** força a releitura do conteúdo: limpa os caches dos guias de bairro e do portal.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JSON `{ "ok": true }`.
- **Erros:** **401** sem sessão; **403** por perfil.
- **Efeitos:** zera os caches em memória dos bairros e do portal (o próximo acesso relê o ramo de conteúdo no GitHub); não mexe no banco.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/bairros/atualizar" -H "Authorization: Bearer $CHAVE"
```

## Condomínios no sistema (`src/routes/condominios.js`)

Montado em `/api` (`app.use('/api', require('./src/routes/condominios'))`), portanto atrás do `exigeLogin` e do `mesmaOrigem` (as escritas de outro site levam **403**). Em vez do cookie `hh_sessao`, a entrada pode ser uma chave de API em `Authorization: Bearer hh_...` (ou `X-API-Key`), que dispensa o cookie e a conferência de origem; essas rotas exigem o escopo `condominios` da chave. Todas as rotas devolvem JSON e todas respondem **401** `{"erro":"Sessão expirada. Entre novamente."}` sem sessão.

### `GET /condominios`
- **Quem pode:** com login ou com chave de API; qualquer perfil
- **O que faz:** lista os condomínios (nunca os de tipo `comercial`) com a contagem de anúncios do Radar, do Fisguei e da carteira, o preço médio, o resumo geral e uma foto de capa por prédio (da carteira ou do anúncio mais recente do Fisguei com foto).
- **Entrada:** nenhuma.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `q` | texto | não | busca em nome, logradouro e CNPJ; até 80 caracteres |
| `bairro` | texto | não | até 60 caracteres, busca parcial |
| `tipo` | texto | não | `vertical`, `horizontal` ou `indefinido`; outro valor é ignorado |
| `alvo` | `"1"` | não | só os prédios-alvo |
| `venda` | `"1"` | não | só os que têm algo à venda |
| `ordem` | texto | não | `venda` (padrão), `preco`, `unidades`, `andares`, `giro`, `nome` ou `recentes` |
| `dir` | texto | não | `asc` ou `desc`; sem valor usa o sentido padrão da ordem |
| `pagina` | inteiro | não | padrão `1`; 60 por página |

- **Resposta:** JSON.
```json
{
  "total": 1200, "pagina": 1, "porPagina": 60,
  "itens": [ { "id": 12, "nome": "Edifício X", "tipo": "vertical", "bairro": "Cambuí", "slug": "edificio-x", "radar": 2, "fisguei": 5, "carteira": 1, "preco_medio": 950000, "foto": "/api/arquivos/88" } ],
  "resumo": { "total": 1200, "verticais": 900, "horizontais": 80, "no_mapa": 1100, "alvos": 14 }
}
```
- **Erros:** **401** sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/condominios?bairro=Cambu%C3%AD&venda=1&ordem=preco&dir=asc" -H "Authorization: Bearer $CHAVE"
```

### `GET /condominios/mapa`
- **Quem pode:** com login ou com chave de API; qualquer perfil
- **O que faz:** os pontos de todos os condomínios com posição no mapa, em forma compacta: `[id, lat, lon, tipo, à venda, alvo, nome]` (tipo `h`, `v` ou `i`).
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JSON (lista de listas), com `Cache-Control: private, max-age=120`.
```json
[[12, -22.89123, -47.05412, "v", 7, 0, "Edifício X"]]
```
- **Erros:** **401** sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/condominios/mapa" -H "Authorization: Bearer $CHAVE"
```

### `GET /condominios/reconhecer`
- **Quem pode:** com login ou com chave de API; qualquer perfil
- **O que faz:** descobre a qual condomínio um endereço, um ponto no mapa ou um nome pertence. Tenta, nessa ordem: CEP + número, rua + número, ponto dentro do contorno, ponto a até 40 m e nome do condomínio.
- **Entrada:** nenhuma.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `cep` | texto | não | só os dígitos são usados; vale com `numero` |
| `numero` | texto | não | número do imóvel |
| `logradouro` | texto | não | nome da rua; vale com `numero` |
| `lat` | número | não | vale junto com `lon` |
| `lon` | número | não | vale junto com `lat` |
| `condominio_nome` | texto | não | nome do condomínio, comparado por semelhança |
| `bairro` | texto | não | ajuda a escolher entre nomes parecidos |

- **Resposta:** JSON.
```json
{ "condominio": { "id": 12, "nome": "Edifício X" }, "como": "CEP e número", "confianca": "alta", "alternativas": [] }
```
  Sem achar: `{ "condominio": null, "como": null, "confianca": null, "alternativas": [] }`. `confianca` é `alta`, `media` ou `baixa`.
- **Erros:** **401** sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/condominios/reconhecer?cep=13025-000&numero=789" -H "Authorization: Bearer $CHAVE"
```

### `GET /condominios/alertas`
- **Quem pode:** com login ou com chave de API; qualquer perfil
- **O que faz:** os avisos de anúncio novo em prédio-alvo (até 50, do mais recente para o mais antigo), já com o link interno (`#/radar/<id>` ou `#/fisguei/<id>`).
- **Entrada:** nenhuma.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `todos` | `"1"` | não | padrão só os não vistos; com `1`, inclui os já vistos |

- **Resposta:** JSON (lista).
```json
[{ "id": 9, "condominio_id": 12, "condominio": "Edifício X", "origem": "fisguei", "ref_id": 441, "texto": "Apartamento novo em Edifício X", "visto": 0, "href": "#/fisguei/441" }]
```
- **Erros:** **401** sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/condominios/alertas?todos=1" -H "Authorization: Bearer $CHAVE"
```

### `POST /condominios/alertas/visto`
- **Quem pode:** com login ou com chave de API; qualquer perfil
- **O que faz:** marca todos os avisos como vistos.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JSON `{ "ok": true }`.
- **Erros:** **401** sem sessão; **403** `{"erro":"Origem não permitida."}` quando o `Origin` não é o próprio site.
- **Efeitos:** `UPDATE condominio_alertas SET visto=1 WHERE visto=0`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/condominios/alertas/visto" -H "Authorization: Bearer $CHAVE"
```

### `GET /condominios/bairros`
- **Quem pode:** com login ou com chave de API; qualquer perfil
- **O que faz:** os nomes dos bairros que têm ao menos 3 condomínios não comerciais na base, em ordem alfabética (para o filtro da tela).
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JSON (lista de textos).
```json
["Barão Geraldo", "Cambuí", "Taquaral"]
```
- **Erros:** **401** sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/condominios/bairros" -H "Authorization: Bearer $CHAVE"
```

### `GET /condominios/:id`
- **Quem pode:** com login ou com chave de API; qualquer perfil
- **O que faz:** a ficha completa do condomínio com os números cruzados: carteira do cliente, anúncios do Radar e do Fisguei, o que está à venda e para alugar (duplicatas juntadas por valor e área parecidos), preços medianos, m² mediano e histórico, taxa de condomínio, IPTU, dias anunciado, imobiliárias atuantes, particulares, quartos, lazer, proprietários conhecidos e vendidos pelo cliente. O contorno não vai no corpo: sai só como `tem_contorno`.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JSON.
```json
{
  "id": 12, "nome": "Edifício X", "tipo": "vertical", "bairro": "Cambuí", "tem_contorno": true,
  "aVenda": [], "aLocar": [],
  "resumo": { "a_venda": 7, "a_locar": 2, "preco_mediano": 950000, "m2_mediano": 9500, "taxa_condominio": 1200, "iptu": 300, "dias_anunciado": 45, "imobiliarias": [], "particulares": 1, "quartos": [], "lazer": [], "vendidos": 2 },
  "carteira": [], "radar": [], "fisguei": []
}
```
- **Erros:** **401** sem sessão; **404** `{"erro":"Condomínio não encontrado."}`.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/condominios/12" -H "Authorization: Bearer $CHAVE"
```

### `GET /condominios/:id/perto`
- **Quem pode:** com login ou com chave de API; qualquer perfil
- **O que faz:** o que tem perto da portaria, por categoria, com distância em metros e minutos a pé.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JSON.
```json
{ "raio": 1200, "categorias": [ { "id": "mercado", "nome": "...", "icone": "...", "total": 9, "itens": [ { "nome": "...", "m": 180, "min": 3 } ] } ], "fonte": "Overture Maps e OpenStreetMap (pode faltar algum lugar)" }
```
  Sem posição no mapa, devolve `{ "categorias": [] }`.
- **Erros:** **401** sem sessão; **404** `{"erro":"Condomínio não encontrado."}`.
- **Efeitos:** grava o resultado na tabela `condominio_cache` (tipo `perto`, válido 30 dias) na primeira vez ou quando o cache venceu; pode consultar o Overpass (OpenStreetMap) quando a base local de pontos de interesse está vazia.
- **Exemplo:**
```bash
curl -s "$BASE/api/condominios/12/perto" -H "Authorization: Bearer $CHAVE"
```

### `GET /condominios/:id/3d`
- **Quem pode:** com login ou com chave de API; qualquer perfil (o `renovar` só vale para `adm` e `gestor`)
- **O que faz:** a cena 3D do condomínio e do entorno, com as unidades da carteira que têm número de unidade e não estão suspensas, cada uma com o andar calculado a partir da numeração do prédio.
- **Entrada:** nenhuma.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `renovar` | `"1"` | não | padrão desligado; refaz a cena ignorando o cache, e só funciona para os perfis `adm` e `gestor` |
| `imovel` | inteiro | não | id de um imóvel do condomínio; quando casa, volta em `imovel` com o andar, o final e a torre |

- **Resposta:** JSON.
```json
{ "condominio": { "id": 12, "nome": "Edifício X", "tipo": "vertical", "andares": 24, "torres": 2, "unidades": 96, "logradouro": "...", "numero": "789", "bairro": "Cambuí", "geo_fonte": "ajustado" }, "cena": {}, "imovel": null, "unidades": [] }
```
- **Erros:** **401** sem sessão; **404** `{"erro":"Condomínio não encontrado."}`; **409** `Este condomínio ainda não tem posição no mapa. Ajuste a posição na ficha para ver o 3D.`.
- **Efeitos:** grava a cena na tabela `condominio_cache` (tipo `3d`, válido 60 dias) na primeira vez, quando vence, ou sempre que `renovar=1` vier de um perfil `adm`/`gestor`.
- **Exemplo:**
```bash
curl -s "$BASE/api/condominios/12/3d?imovel=345" -H "Authorization: Bearer $CHAVE"
```

### `PUT /condominios/:id`
- **Quem pode:** com login ou com chave de API; qualquer perfil
- **O que faz:** salva a ficha do prédio pela tela: dados, posição no mapa e a marca de prédio-alvo. Só os campos que vêm no corpo são alterados.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `nome` | texto | não | até 120 caracteres; também regrava `nome_busca` |
| `tipo` | texto | não | `vertical`, `horizontal`, `comercial` ou `indefinido` |
| `andares` | inteiro | não | 0 a 5000 |
| `torres` | inteiro | não | 0 a 5000 |
| `unidades` | inteiro | não | 0 a 5000; sem `unidades_fonte` no corpo, a fonte passa a `Informado pela <cliente>` |
| `unidades_fonte` | texto | não | até 120 caracteres |
| `construtora` | texto | não | até 120 caracteres |
| `ano_construcao` | texto | não | até 10 caracteres |
| `lazer` | texto | não | até 300 caracteres |
| `administradora` | texto | não | até 120 caracteres |
| `bairro` | texto | não | até 80 caracteres |
| `logradouro` | texto | não | até 150 caracteres |
| `numero` | texto | não | até 20 caracteres |
| `cep` | texto | não | até 9 caracteres; guardado só com os dígitos |
| `alvo` | booleano | não | marca ou desmarca o prédio-alvo |
| `lat` e `lon` | número | não | só valem juntos; têm de ficar em Campinas (lat entre -23,2 e -22,6; lon entre -47,4 e -46,8). Gravam `geo_fonte='ajustado'` |
| `osm_ref` | texto | não | até 40 caracteres |

- **Query:** nenhuma.
- **Resposta:** JSON `{ "ok": true }`.
- **Erros:** **401** sem sessão; **403** quando o `Origin` não é o próprio site; **404** `Condomínio não encontrado.`; **400** `Tipo inválido.`, `Valor inválido em <campo>.`, `A posição precisa estar em Campinas.` ou `Nada para salvar.`.
- **Efeitos:** atualiza a linha em `condominios` e `atualizado_em`; se a posição mudou, apaga todo o `condominio_cache` daquele prédio (3D e "perto") e limpa o cache em memória da lista; registra `condominio_alterado` na auditoria.
- **Exemplo:**
```bash
curl -s -X PUT "$BASE/api/condominios/12" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"andares":24,"alvo":true,"lat":-22.89,"lon":-47.05}'
```

### `POST /condominios/vincular`
- **Quem pode:** com login ou com chave de API, perfil `adm` ou `gestor`
- **O que faz:** liga a carteira, o Radar e o Fisguei aos condomínios da base. Por padrão só olha o que ainda não foi conferido; com `tudo`, refaz tudo. Anúncio novo em prédio-alvo vira aviso.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `tudo` | booleano | não | padrão falso: só o que falta conferir. Verdadeiro refaz a conferência de todos |

- **Query:** nenhuma.
- **Resposta:** JSON com a contagem do que foi ligado.
```json
{ "imoveis": 3, "radar": 12, "fisguei": 40, "conferidos": 520 }
```
- **Erros:** **401** sem sessão; **403** por perfil ou por origem não permitida.
- **Efeitos:** grava `imoveis.condominio_id`, marca `cond_checado` em `oportunidades` e `fisguei_anuncios`, e insere avisos em `condominio_alertas` para os prédios-alvo.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/condominios/vincular" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"tudo":false}'
```

## Páginas públicas de condomínio (`src/condominios/publico.js`)

O router é montado na raiz; o `api` em `/api/publico/condominios`. As páginas mostram só o que é público e do cliente (nome, bairro, tamanho do prédio pelo Censo, lazer, o que tem perto, o 3D e os imóveis do cliente à venda ali) — nada do Radar, do Fisguei, de proprietários ou de concorrentes, e nunca rua e número. Ficam fora do Google (`noindex`) até `CONDOMINIOS_PUBLICOS=1` **e** haver ao menos um imóvel do cliente no ar naquele condomínio. Só condomínios com posição no mapa e de tipo diferente de `comercial` existem por aqui.

### `GET /condominios/:slug`
- **Quem pode:** público, sem login
- **O que faz:** a página pública do condomínio, com os fatos do prédio, o lazer deduzido dos textos, o que tem perto, o botão do 3D, os imóveis do cliente à venda ali e o formulário "Quero morar aqui" (que envia para `/api/publico/portal/interesse` com o campo `condominio`).
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** HTML, com `Cache-Control: public, max-age=120, s-maxage=600, stale-while-revalidate=3600`.
- **Erros:** chama `next()` quando o endereço não casa `^[a-z0-9][a-z0-9-]{1,90}$`, quando o condomínio não existe, é comercial ou não tem posição no mapa — aí o pedido segue para as rotas e os arquivos estáticos seguintes.
- **Efeitos:** só leitura do banco próprio, mas o "o que tem perto" grava o resultado em `condominio_cache` (tipo `perto`, 30 dias) quando não há cache válido.
- **Exemplo:**
```bash
curl -s "$BASE/condominios/edificio-x"
```

### `GET /condominios/:slug/3d`
- **Quem pode:** público, sem login
- **O que faz:** manda o visitante para o visualizador 3D com o endereço do condomínio já na querystring.
- **Entrada:** nenhuma.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `imovel` | texto | não | código do imóvel no formato `^[A-Z]{2}\d{3,6}$` (sem distinguir maiúsculas); passado em maiúsculas adiante. Outro valor é ignorado |

- **Resposta:** **302** para `/condominio-3d.html?slug=<slug>[&imovel=<CODIGO>]` (sem corpo).
- **Erros:** `next()` quando o condomínio não vale (mesmas regras de `/condominios/:slug`).
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s -i "$BASE/condominios/edificio-x/3d?imovel=ap0029"
```

### `GET /elevacao`
Montado em `/api/publico/condominios/elevacao`.
- **Quem pode:** público, sem login
- **O que faz:** a altitude do terreno num ponto, para encaixar o 3D realista do Google no chão certo. Devolve também a altura sobre o elipsoide (a altitude menos 5,5 m, o desvio do geoide em Campinas).
- **Entrada:** nenhuma.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `lat` | número | sim | tem de ficar entre -24 e -22 |
| `lon` | número | sim | tem de ficar entre -48 e -46 |

- **Resposta:** JSON, com `Cache-Control: public, max-age=86400`.
```json
{ "altitude": 685.0, "elipsoide": 679.5 }
```
  Quando a consulta falha, os dois campos vêm `null`.
- **Erros:** **400** `{"erro":"Fora de Campinas."}`.
- **Efeitos:** só leitura; consulta a API de elevação do Open-Meteo (Copernicus DEM) e guarda o valor num cache em memória por ponto arredondado em 4 casas (limpa tudo acima de 5000 pontos).
- **Exemplo:**
```bash
curl -s "$BASE/api/publico/condominios/elevacao?lat=-22.89&lon=-47.05"
```

### `GET /mapas`
Montado em `/api/publico/condominios/mapas`.
- **Quem pode:** público, sem login
- **O que faz:** entrega a chave do Google Maps usada pelo 3D realista (da variável `GOOGLE_MAPS_KEY` ou da configuração gravada pelo assistente do gestor). A chave é restrita aos sites da imobiliária no console do Google.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JSON, com `Cache-Control: no-store`.
```json
{ "chave": null }
```
- **Erros:** nenhum.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/publico/condominios/mapas"
```

### `GET /:slug/3d`
Montado em `/api/publico/condominios/:slug/3d`.
- **Quem pode:** público, sem login
- **O que faz:** os dados da cena 3D para o visitante: só o prédio, o entorno e, quando pedido, o andar de um imóvel do cliente publicado ali. A lista de unidades sempre volta vazia e o número da unidade nunca sai.
- **Entrada:** nenhuma.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `imovel` | texto | não | código do imóvel (passa a maiúsculas); só vale para imóvel com status `publicado` naquele condomínio |

- **Resposta:** JSON, com `Cache-Control: public, max-age=300, s-maxage=3600`.
```json
{ "condominio": { "nome": "Edifício X", "tipo": "vertical", "andares": 24, "torres": 2, "unidades": 96, "bairro": "Cambuí" }, "cena": {}, "imovel": { "codigo": "AP0029", "tipo": "Apartamento", "andar": 10, "final": 3, "torre": "A", "unidade": null }, "unidades": [] }
```
- **Erros:** **404** `{"erro":"Condomínio não encontrado."}`; **409** (pelo tratador geral de erros) `Este condomínio ainda não tem posição no mapa...` — na prática não acontece, porque `porSlug` já exige a posição.
- **Efeitos:** grava a cena em `condominio_cache` (tipo `3d`, 60 dias) quando não há cache válido.
- **Exemplo:**
```bash
curl -s "$BASE/api/publico/condominios/edificio-x/3d?imovel=AP0029"
```

### `GET /:slug/perto`
Montado em `/api/publico/condominios/:slug/perto`.
- **Quem pode:** público, sem login
- **O que faz:** o que tem perto do condomínio, por categoria, com metros e minutos a pé.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JSON, com `Cache-Control: public, max-age=3600, s-maxage=86400`. Mesmo formato de `/api/condominios/:id/perto`; sem dados, `{ "categorias": [] }`.
- **Erros:** **404** `{"erro":"Condomínio não encontrado."}`.
- **Efeitos:** grava o resultado em `condominio_cache` (tipo `perto`, 30 dias) quando não há cache válido; pode consultar o Overpass.
- **Exemplo:**
```bash
curl -s "$BASE/api/publico/condominios/edificio-x/perto"
```

## Rotas abertas sem login (`src/routes/publico.js`)

O router é montado em `/api/publico`; o `webhook` exportado é montado em `/webhook/whatsapp`, **antes** do parser JSON, porque a assinatura da Meta é conferida sobre o corpo bruto. As funções `paginaLink` e `fotoOg` deste arquivo são usadas pelas rotas `/v/:token` declaradas no `server.js`.

### `GET /assinatura/:token`
Montado em `/api/publico/assinatura/:token`.
- **Quem pode:** público, sem login (quem tem o link)
- **O que faz:** entrega o documento a assinar (autorização de venda) para a página `/assinar/<token>`.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JSON.
```json
{ "status": "pendente", "conteudo": "...", "codigo": "AP0029", "nome": "Maria Silva", "empresa": "a imobiliária", "assinado_em": null }
```
  Quando o status é `cancelado`, `conteudo` vem `null`.
- **Erros:** **429** `{"erro":"Muitas tentativas. Aguarde um minuto."}` acima de 30 chamadas por minuto pelo mesmo IP e rota; **404** `{"erro":"Link de assinatura inválido."}`.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/publico/assinatura/abc123def456"
```

### `POST /assinatura/:token`
Montado em `/api/publico/assinatura/:token`.
- **Quem pode:** público, sem login (quem tem o link)
- **O que faz:** registra a assinatura do proprietário, gera o PDF assinado, guarda o arquivo e põe o imóvel em exclusividade.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `nome` | texto | sim | nome completo (ao menos duas palavras), cortado em 120 |
| `cpf` | texto | sim | CPF válido; se o proprietário cadastrado tem CPF, tem de ser o mesmo |
| `aceite` | qualquer valor verdadeiro | sim | confirma que leu e concorda com o documento |
| `assinatura_png` | texto | sim | `data:image/png;base64,...`, entre 500 e 400000 caracteres |

- **Query:** nenhuma.
- **Resposta:** JSON.
```json
{ "ok": true, "assinado_em": "30/10/2026, 10:12:05 (horário de Brasília)" }
```
- **Erros:** **429** acima de 8 chamadas por minuto pelo mesmo IP e rota; **404** link inválido; **409** `Este documento já foi assinado.` ou `Este link foi cancelado. Peça um novo ao corretor.`; **400** nas validações de aceite, nome, CPF e desenho da assinatura; **500** `O documento foi alterado depois de gerado. Peça um novo link.` quando o hash do conteúdo não confere.
- **Efeitos:** grava em `assinaturas` o status `assinado`, o nome, o CPF, o PNG da assinatura, o IP, o `user-agent` e a data (a atualização é condicional ao status `pendente`, então duas assinaturas ao mesmo tempo não passam); gera o PDF da autorização e o salva pelo serviço de arquivos/Drive na categoria "Autorização de venda", guardando o id em `assinaturas.pdf_arquivo_id`; atualiza `imoveis` com `exclusivo`, `exclusivo_ate` (prazo em dias contado de hoje) e, se o status era `captacao` ou `aguardando_autorizacao`, passa para `off_market`; registra `autorizacao_assinada` na auditoria.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/publico/assinatura/abc123def456" -H 'Content-Type: application/json' -d '{"nome":"Maria Silva","cpf":"12345678909","aceite":1,"assinatura_png":"data:image/png;base64,iVBORw0KG..."}'
```

### `GET /imovel/:token`
Montado em `/api/publico/imovel/:token`.
- **Quem pode:** público, sem login (quem tem o link off-market)
- **O que faz:** a ficha completa do imóvel para a apresentação do link interno (`/v/<token>`), incluindo o corretor e a lista de até 40 fotos. A rua e o número só saem quando o corretor marcou `mostrar_endereco` no link.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JSON.
```json
{
  "empresa": "a imobiliária", "codigo": "AP0029", "tipo": "Apartamento",
  "condominio": "Edifício X", "lazer": null, "bairro": "Cambuí", "cidade": "Campinas",
  "endereco": null, "quartos": 3, "suites": 1, "vagas": 2, "area_util": 120, "area_total": null,
  "valor": 1200000, "valor_condominio": 1200, "iptu": 300, "descricao": "...",
  "corretor": "Júlia", "corretor_tel": "19999999999", "fotos": [88, 89], "expira_em": "2026-11-15 18:00:00"
}
```
- **Erros:** **429** acima de 60 chamadas por minuto pelo mesmo IP e rota; **404** `{"erro":"Este link expirou ou não existe. Peça um novo ao corretor."}` ou `{"erro":"Este imóvel não está mais disponível."}` (status `vendido`, `alugado` ou `suspenso`).
- **Efeitos:** grava o acesso em `links_acessos` (id do link, IP e `user-agent` cortado em 300 caracteres) — **menos** quando o `user-agent` é de robô de prévia (WhatsApp, Facebook, Telegram…), que não conta como visita.
- **Exemplo:**
```bash
curl -s "$BASE/api/publico/imovel/abc123def456"
```

### `GET /imovel/:token/foto/:fid`
Montado em `/api/publico/imovel/:token/foto/:fid`.
- **Quem pode:** público, sem login (quem tem o link)
- **O que faz:** entrega uma foto do imóvel daquele link. Só fotos da categoria `Fotos` do imóvel do link saem por aqui.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** os bytes da imagem, com o `Content-Type` do arquivo e `Cache-Control: private, max-age=3600`.
- **Erros:** **429** acima de 300 chamadas por minuto pelo mesmo IP e rota; **404** link expirado/inexistente ou `{"erro":"Foto não encontrada."}`.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s -o foto.jpg "$BASE/api/publico/imovel/abc123def456/foto/88"
```

### `GET /webhook/whatsapp`
- **Quem pode:** público, sem login (a Meta)
- **O que faz:** a verificação do webhook do WhatsApp: devolve o desafio quando o token confere.
- **Entrada:** nenhuma.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `hub.mode` | texto | sim | tem de ser `subscribe` |
| `hub.verify_token` | texto | sim | tem de bater com `WA_VERIFY_TOKEN` da configuração |
| `hub.challenge` | texto | sim | é devolvido no corpo |

- **Resposta:** texto simples com o valor de `hub.challenge`.
- **Erros:** **403** (sem corpo) quando falta a configuração `WA_VERIFY_TOKEN`, quando o modo não é `subscribe` ou quando o token não confere.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=seu-token&hub.challenge=12345"
```

### `POST /webhook/whatsapp`
- **Quem pode:** público, sem login (a Meta), com assinatura conferida
- **O que faz:** recebe os eventos do WhatsApp. O corpo é lido bruto (qualquer `Content-Type`, até 2 MB) para conferir o `X-Hub-Signature-256`. Responde **200** de imediato e processa depois.
- **Entrada:** o corpo bruto do evento da Meta (JSON). O cabeçalho `X-Hub-Signature-256` é obrigatório e tem de ser válido.
- **Query:** nenhuma.
- **Resposta:** **200** sem corpo.
- **Erros:** **401** (sem corpo) quando a assinatura não é válida. Corpo que não é JSON é ignorado em silêncio depois do 200.
- **Efeitos:** entrega o evento ao processamento do WhatsApp (`wa.processaWebhook`), que trata as mensagens recebidas.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/webhook/whatsapp" -H 'X-Hub-Signature-256: sha256=...' --data-binary '{"object":"whatsapp_business_account","entry":[]}'
```

## Blog e portal declarados no `server.js`

As quatro rotas `/api/...` desta seção ficam atrás do `exigeLogin` e do `mesmaOrigem`. A entrada pode ser o cookie de sessão `hh_sessao` ou uma chave de API em `Authorization: Bearer hh_...` (ou `X-API-Key`), que resolve o usuário e dispensa o cookie e a conferência de origem; elas exigem o escopo `conteudo` da chave. Com chave inválida, revogada ou vencida a resposta é **401**; fora dos IPs autorizados, **403**; acima do limite por minuto da chave, **429**; com chave somente de leitura num método diferente de GET/HEAD, **403**; sem o escopo, **403**.

### `GET /api/blog`
- **Quem pode:** com login (cookie de sessão `hh_sessao`) ou com chave de API (`Authorization: Bearer $CHAVE` ou `X-API-Key`); qualquer perfil
- **O que faz:** a situação do blog para a tela do sistema: todos os artigos (inclusive os agendados e os que esperam foto), com as marcas `noAr` e `esperandoFoto`, mais quantas capas estão na fila.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JSON.
```json
{ "artigos": [ { "slug": "meu-artigo", "titulo": "...", "categoria": "campinas", "publicadoEm": "2026-10-20", "noAr": true, "esperandoFoto": false } ], "fotosNaFila": 2 }
```
- **Erros:** **401** `{"erro":"Sessão expirada. Entre novamente."}` sem sessão.
- **Efeitos:** só leitura (pode reler o ramo de conteúdo do blog no GitHub, com cache).
- **Exemplo:**
```bash
curl -s "$BASE/api/blog" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/blog/:slug/redes`
- **Quem pode:** com login ou com chave de API; qualquer perfil
- **O que faz:** a legenda e as hashtags de um artigo para as redes (vale para artigo no ar, agendado ou esperando foto).
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JSON.
```json
{ "legenda": "...", "hashtags": "#campinas #imoveis" }
```
- **Erros:** **401** sem sessão; **404** `{"erro":"Texto não encontrado."}` quando o endereço não casa o formato, o artigo não existe ou o arquivo não traz a legenda das redes.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/blog/meu-artigo/redes" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/portal`
- **Quem pode:** com login ou com chave de API; qualquer perfil
- **O que faz:** a situação da página de cada imóvel à venda, para a tela do sistema.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JSON (lista).
```json
[{ "codigo": "AP0029", "tipo": "Apartamento", "bairro": "Cambuí", "cidade": "Campinas", "fotos": 18, "versao": "...", "estado": "no-ar", "slug": "apartamento-cambui-ap0029", "titulo": "...", "publicadoEm": "2026-10-20", "atualizadoEm": null }]
```
  `estado` pode ser `sem-pagina`, `sem-foto`, `sem-arquivo`, `reprovada`, `desatualizada` ou `no-ar`; `erros`, `automatica` e `slugAutomatica` aparecem quando existem.
- **Erros:** **401** sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/portal" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/portal/:codigo/redes`
- **Quem pode:** com login ou com chave de API; qualquer perfil
- **O que faz:** a legenda e as hashtags da página de um imóvel para as redes, com o endereço completo da página no fim da legenda. O código é passado a maiúsculas.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JSON.
```json
{ "legenda": "...\n\nhttps://exemplo/imoveis/apartamento-cambui-ap0029", "hashtags": "#cambui #apartamento" }
```
- **Erros:** **401** sem sessão; **404** `{"erro":"Página não encontrada."}` quando o imóvel não está no ar ou a página não traz as legendas das redes.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/portal/AP0029/redes" -H "Authorization: Bearer $CHAVE"
```

### `GET /marca.js`
- **Quem pode:** público, sem login
- **O que faz:** entrega o `window.MARCA` que as telas leem antes do `app.js`: o nome do sistema e da imobiliária desta instalação, mais a identidade visual.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** JavaScript (`application/javascript`), com `Cache-Control: no-cache`. Os `<` do JSON são escapados como `<`.
```javascript
window.MARCA={"sistema":"Herrera HOUSE IA","cliente":"Onde morar","empresa":"Onde morar","blog":"Imobiliária Blog","tema":"","logo":"","icone":""};
```
- **Erros:** nenhum.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/marca.js"
```

### `GET /v/:token`
- **Quem pode:** público, sem login (quem tem o link off-market)
- **O que faz:** a página da apresentação do link interno. O HTML já sai com as etiquetas Open Graph (título, descrição e capa), porque o WhatsApp não roda o JavaScript da página; os dados em si são buscados pela página em `/api/publico/imovel/<token>`.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** HTML, com `Cache-Control: private, no-store` e `X-Robots-Tag: noindex, nofollow`. Com token inválido ou link expirado, a página sai com o título e a descrição genéricos (`Imóvel · <cliente>`), sem vazar nada do imóvel.
- **Erros:** nenhum status de erro próprio: a página é sempre **200**.
- **Efeitos:** só leitura, e **não** grava acesso (o registro acontece em `/api/publico/imovel/:token`). A rua e o número entram na descrição só quando o corretor marcou `mostrar_endereco` no link.
- **Exemplo:**
```bash
curl -s "$BASE/v/abc123def456"
```

### `GET /v/:token/og.jpg`
- **Quem pode:** público, sem login (quem tem o link)
- **O que faz:** a capa JPEG da prévia do link interno (a primeira foto do imóvel, reduzida).
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** imagem JPEG, com `Cache-Control: private, max-age=86400`.
- **Erros:** **429** com texto `Muitas tentativas. Aguarde um minuto.` acima de 90 chamadas por minuto pelo mesmo IP; **404** quando o token é inválido, o link expirou, o imóvel não está mais disponível ou não há foto.
- **Efeitos:** só leitura; o JPEG convertido fica num cache em memória. Não grava acesso.
- **Exemplo:**
```bash
curl -s -o og.jpg "$BASE/v/abc123def456/og.jpg"
```

### `GET /assinar/:token`
- **Quem pode:** público, sem login (quem tem o link)
- **O que faz:** entrega a página de assinatura (`public/assinar.html`). O token não é conferido aqui: a própria página o lê do endereço e chama `/api/publico/assinatura/<token>`.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** HTML (o arquivo estático).
- **Erros:** nenhum status próprio; o link inválido só aparece depois, na chamada da API.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/assinar/abc123def456"
```

### `GET /condominio-3d.html`
- **Quem pode:** público, sem login
- **O que faz:** entrega o visualizador 3D (`public/condominio-3d.html`) com uma CSP própria, mais larga que a geral: o modo realista do Google precisa de WebAssembly (`script-src 'wasm-unsafe-eval'`), de worker em `blob:` (`worker-src 'self' blob:`) e de falar com `https://tile.googleapis.com` (`connect-src`). `frame-ancestors 'none'`: a página não se deixa embutir.
- **Entrada:** nenhuma.
- **Query:** nenhuma no servidor. A própria página lê `slug` (condomínio público), `id` e `imovel` (ficha do sistema) e `fg` (anúncio do Fisguei) do endereço e escolhe de onde buscar os dados.
- **Resposta:** HTML (o arquivo estático).
- **Erros:** nenhum status próprio.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/condominio-3d.html?slug=edificio-x"
```
## Escritório virtual (`src/routes/escritorio.js`)

Montado com `app.use('/api', require('./src/routes/escritorio'))`, **depois** de `express.json({ limit: '1mb' })`, da entrada por chave de API, de `mesmaOrigem` (bloqueia escrita com `Origin` de outro host → 403) e de `exigeLogin` (sem chave e sem cookie de sessão `hh_sessao` válido → 401 `{"erro":"Sessão expirada. Entre novamente."}`). As rotas marcadas "adm, gestor" passam ainda por `A.exigePerfil('adm','gestor')` → 403 `{"erro":"Seu perfil não tem acesso a esta função."}`.

Escopo deste módulo: `/api/escritorio…` pede **`escritorio`**. Valem as duas formas de entrar em `/api` e os erros próprios da chave descritos no módulo "Base". `POST /escritorio-ciclo` fica fora de `/api`: não passa pela chave de API, só pelo token do ciclo.
`:slug` tem de ser um dos 9 agentes (`captador`, `apartamentos`, `comerciais`, `terrenos`, `casas`, `alto-padrao`, `offmarket`, `gerente`, `gerente-corretores`); qualquer outro → 404 `{"erro":"Agente não encontrado."}`.
A rota `ciclo` é exportada à parte e o `server.js` a monta como `POST /escritorio-ciclo`, **antes** do parser JSON (o corpo não é lido) e sem sessão.

### `GET /api/escritorio`
- **Quem pode:** qualquer usuário logado (corretor vê só o que é dele; `geral` completo e `feed`/auditoria só para adm/gestor).
- **O que faz:** devolve a tela do escritório: os 9 agentes resumidos, o estado do PC e do cérebro, o mural de eventos, a fila de aprovação e os totais do dia.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:**
```json
{"agentes":[{"slug":"casas","n":5,"nome":"Clara","cargo":"Corretora de casas até R$ 2 mi","tipo":"cliente","ajustes":{"ativo":true,"modo":"sugerir","linha":"sistema","canal":"qr","wa_filtro":"nao_salvos","alma_editada":false},"linha":"gerente","linha_nome":"Augusto","linha_estado":{"estado":"conectado","numero":"5519999990000","vivo":true,"erro":null},"hoje":{"conversas":3,"recebidas":7,"enviadas":5},"aprovar":1,"leads":4,"ultimo":{"tipo":"aprovado","texto":"…","criado_em":"2026-10-30 09:12:00"}}],
 "geral":{"ligado":true,"dono_nome":"Thiago","dono_telefone":"5519999990000","hora_relatorio":"19:00"},
 "pc":{"vivo":true,"ia":true,"modelo":"claude-sonnet-5-5","em":"2026-10-30T12:00:00.000Z","pausado":false,"nuvem":true,"cerebro":{"vivo":true,"em":"2026-10-30T12:00:30.000Z","onde":"nuvem","erro":null,"ms":812}},
 "pode_editar":true,"feed":[],"aprovar":[],
 "totais":{"conectados":1,"aprovar":1,"conversas":3,"enviadas":5,"acoes":12,"afazeres":2}}
```
- **Erros:** 401 sem sessão.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/escritorio" -H "Authorization: Bearer $CHAVE"
```

### `PUT /api/escritorio/geral`
- **Quem pode:** adm, gestor
- **O que faz:** grava os ajustes gerais do escritório (liga/desliga tudo, celular do dono, limites de valor que definem o setor de cada imóvel e os horários das rotinas) na configuração `escritorio`.
- **Entrada:** campos ausentes mantêm o valor atual.

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `ligado` | booleano | não | liga/desliga o cérebro inteiro (padrão atual; padrão de fábrica `true`) |
| `dono_nome` | texto (80) | não | nome do dono (padrão `""`) |
| `dono_telefone` | texto | não | celular do dono; normalizado para `55DDDNNNNNNNN` (padrão `""`) |
| `limite_casas` | número | não | acima disso a casa vira alto padrão; mínimo 200000 (padrão 2000000) |
| `limite_alto_apto` | número | não | a partir disso o apartamento vira alto padrão; mínimo 200000 (padrão 3000000) |
| `hora_manha` | `HH:MM` | não | padrão `08:00`; `""` desliga |
| `hora_relatorio` | `HH:MM` | não | padrão `19:00`; `""` desliga |
| `hora_agenda` | `HH:MM` | não | padrão `08:00`; `""` desliga |
| `lembrete_visita_min` | inteiro 0–240 | não | minutos antes da visita (padrão 60) |
| `puxar_conversa` | booleano | não | padrão `true` |
| `alertas_dono` | booleano | não | padrão `true` |

- **Resposta:** o objeto `geral` inteiro já salvo, ex. `{"ligado":true,"dono_nome":"Thiago","dono_telefone":"5519999990000","limite_casas":2000000,"limite_alto_apto":3000000,"hora_manha":"08:00","hora_relatorio":"19:00","hora_agenda":"08:00","lembrete_visita_min":60,"puxar_conversa":true,"alertas_dono":true}`
- **Erros:** 400 `Confira o celular do dono, com DDD.` quando `dono_telefone` não casa com `55` + 10 ou 11 dígitos; 401; 403 (perfil ou origem).
- **Efeitos:** grava `config.escritorio`; registra na auditoria `escritorio.geral` (com o telefone mascarado, só os 4 últimos). Com `ligado:false` o `cicloCerebro` passa a devolver `{"pausado":true}` e nenhum agente responde.
- **Exemplo:**
```bash
curl -s -X PUT "$BASE/api/escritorio/geral" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"dono_telefone":"19999990000","hora_relatorio":"19:30"}'
```

### `GET /api/escritorio/relatorio`
- **Quem pode:** adm, gestor
- **O que faz:** monta o relatório do dia (texto pronto para WhatsApp) e os números do dia em texto, sem mandar nada.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** `{"texto":"📊 *Relatório do dia · Imobiliária* (30/10)\n\n*Comercial*\n• Leads novos: 3…","numeros":"Leads novos hoje: 3 (portal: 2; redes: 1).\nVisitas hoje: 1…"}`
- **Erros:** 401; 403.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/escritorio/relatorio" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/escritorio/relatorio`
- **Quem pode:** adm, gestor
- **O que faz:** manda o relatório do dia pelo WhatsApp do Augusto (gerente) para o celular do dono, na hora.
- **Entrada:** nenhuma.
- **Resposta:** `{"ok":true}`
- **Erros:** 400 `Cadastre o celular do dono na mesa do Augusto (gerente) primeiro.` se `geral.dono_telefone` está vazio; 401; 403.
- **Efeitos:** insere uma mensagem de saída em `agente_mensagens` com `status='fila'` (`aprovar:false`, não espera aprovação) — ou seja, **a mensagem sai de verdade no WhatsApp** na próxima rodada das linhas (QR no PC) ou na próxima batida da estação (WhatsApp Web); grava um `agente_eventos` tipo `relatorio`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/escritorio/relatorio" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/escritorio/config`
- **Quem pode:** adm, gestor
- **O que faz:** mostra a configuração geral do cérebro (qual IA atende, de onde vem a chave, estado do PC) sem nunca devolver a chave inteira — só os 4 últimos dígitos.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:**
```json
{"ia":{"provedor":"claude","modelo":"claude-sonnet-5-5","tem_chave":true,"chave_final":"9f2a","claude":{"tem_chave":true,"modelo":"claude-sonnet-5-5","chave_final":"9f2a","origem":"central"},"gemini":{"tem_chave":false,"modelo":"gemini-flash-latest","chave_final":null,"origem":null},"origem":null,"propria":false,"chave_quebrada":false,"testado_em":null,"teste_ok":null,"teste_msg":null,"ollama_modelo":"qwen2.5:7b"},
 "geral":{"ligado":true},"pc":{"vivo":true,"nuvem":true},"ciclo":true}
```
- **Erros:** 401; 403.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/escritorio/config" -H "Authorization: Bearer $CHAVE"
```

### `PUT /api/escritorio/config/ia`
- **Quem pode:** adm, gestor
- **O que faz:** grava (ou apaga) a chave própria do Gemini desta imobiliária e o modelo preferido.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `chave` | texto 20–200 (`[A-Za-z0-9_-.]`) | não | chave do Gemini; `""`/ausente não mexe, a não ser que `apagar` seja verdadeiro |
| `apagar` | booleano | não | com `chave` vazia/ausente, apaga a chave guardada |
| `modelo` | texto (80) | não | nome do modelo, sem o prefixo `models/` (padrão `gemini-flash-latest`) |

- **Resposta:** o mesmo objeto `ia` do `GET /api/escritorio/config`.
- **Erros:** 400 `Essa não parece uma chave da API do Gemini (começa com "AIza…" ou similar).`; 401; 403.
- **Efeitos:** grava `config.escritorio_ia` com a **chave cifrada** (AES-256-GCM, segredo derivado de `'hh-escritorio-ia:' + DATABASE_URL` (valores cifrados com o prefixo anterior ainda abrem)), zera o resultado do último teste e, se ainda não existir, **cria o token do ciclo** (`config.escritorio_ciclo_token`, 24 bytes aleatórios) usado por `POST /escritorio-ciclo`; registra na auditoria `escritorio.ia`.
- **Exemplo:**
```bash
curl -s -X PUT "$BASE/api/escritorio/config/ia" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"chave":"AIza...","modelo":"gemini-flash-latest"}'
```

### `POST /api/escritorio/config/ia/testar`
- **Quem pode:** adm, gestor
- **O que faz:** pergunta uma frase curta à IA da nuvem para ver se a chave responde e lista os modelos disponíveis.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `modelo` | texto | não | modelo a testar (padrão: o modelo em vigor nos ajustes) |

- **Resposta:** `{"provedor":"gemini","modelo":"gemini-flash-latest","tem_chave":true,"chave_final":"9f2a","teste_ok":true,"teste_msg":"O escritório da imobiliária está pronto. (1.4 s)","testado_em":"2026-10-30T12:03:00.000Z","modelos":[{"id":"gemini-flash-latest","nome":"Gemini Flash"}]}`
- **Erros:** 400 `Cole a chave da API do Gemini primeiro.` quando não há chave de Gemini nem de Claude; 401; 403.
- **Efeitos:** **chamada externa** ao Google (`generativelanguage.googleapis.com`) ou à Anthropic (`api.anthropic.com`) quando só o Claude está configurado; grava `teste_ok`, `teste_msg` e `testado_em` em `config.escritorio_ia`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/escritorio/config/ia/testar" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"modelo":"gemini-flash-latest"}'
```

### `POST /api/escritorio/saidas/:id/aprovar`
- **Quem pode:** qualquer usuário logado; quem não é adm/gestor só aprova mensagem de lead do próprio corretor.
- **O que faz:** aprova (podendo reescrever) uma resposta do robô que estava esperando na fila, liberando o envio pelo WhatsApp.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `texto` | texto (4000) | não | texto final; sem ele vale o texto que o robô escreveu |

- **Resposta:** `{"ok":true}`
- **Erros:** 404 `Mensagem não encontrada.`; 409 `Esta mensagem já foi tratada.` (status diferente de `aprovar`); 403 `Mensagem de cliente de outro corretor.`; 401.
- **Efeitos:** muda `agente_mensagens.status` de `aprovar` para `fila` (**passa a sair de verdade no WhatsApp**), grava o texto e o autor (`<Nome do agente> (aprovado por <usuário>)`), apaga a sugestão espelhada em `mensagens` do lead e grava um `agente_eventos` tipo `aprovado`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/escritorio/saidas/42/aprovar" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"texto":"Oi! Posso te mostrar amanhã às 10h?"}'
```

### `POST /api/escritorio/saidas/:id/descartar`
- **Quem pode:** qualquer usuário logado (sem conferência de corretor).
- **O que faz:** joga fora a resposta do robô que estava esperando aprovação.
- **Entrada:** nenhuma.
- **Resposta:** `{"ok":true}`
- **Erros:** 404 `Mensagem não encontrada.` (também quando o status já não é `aprovar`); 401.
- **Efeitos:** `agente_mensagens.status='descartada'` com `motivo='descartada por <usuário>'`; apaga a sugestão espelhada em `mensagens`. Nada sai no WhatsApp.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/escritorio/saidas/42/descartar" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/escritorio/afazeres`
- **Quem pode:** qualquer usuário logado; corretor vê só os seus.
- **O que faz:** lista os afazeres abertos (e os concluídos nos últimos 3 dias), com o nome do corretor e do lead.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** `[{"id":7,"corretor_id":3,"texto":"Ligar para o dono do AP0029","quando":"2026-10-30 15:00","feito":0,"feito_em":null,"origem":"tela:Thiago","corretor":"Júlia","lead":null}]` (no máximo 200)
- **Erros:** 401.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/escritorio/afazeres" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/escritorio/afazeres`
- **Quem pode:** qualquer usuário logado; corretor só cria para si mesmo (o `corretor_id` enviado é ignorado).
- **O que faz:** cria um afazer e, quando é para outra pessoa, avisa o corretor pelo WhatsApp da Marta.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `texto` | texto (300) | sim | o afazer |
| `corretor_id` | inteiro | não | só adm/gestor; padrão: o próprio usuário |
| `quando` | `AAAA-MM-DD HH:MM` (aceita `T`) | não | prazo; padrão `null` |

- **Resposta:** `{"id":8}`
- **Erros:** 400 `Escreva o afazer.`; 400 `Data inválida.`; 401.
- **Efeitos:** insere em `agente_afazeres` (`origem='tela:<usuário>'`). Se o afazer é de **outro** corretor e ele tem telefone, enfileira uma mensagem de WhatsApp pela linha da Marta (`gerente-corretores`, `aprovar:false` → **sai de verdade**) pedindo que responda `feito <id>` quando terminar, com chave de idempotência `aviso:afazer:<id>`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/escritorio/afazeres" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"texto":"Confirmar visita do AP0029","corretor_id":3,"quando":"2026-10-31 09:00"}'
```

### `POST /api/escritorio/afazeres/:id/feito`
- **Quem pode:** qualquer usuário logado; corretor só mexe nos seus.
- **O que faz:** marca o afazer como feito (ou desmarca).
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `feito` | booleano | não | `false` desmarca; qualquer outro valor (ou ausente) marca como feito |

- **Resposta:** `{"ok":true}`
- **Erros:** 404 `Afazer não encontrado.`; 403 `Afazer de outro corretor.`; 401.
- **Efeitos:** atualiza `agente_afazeres.feito` e `feito_em` (`datetime('now','localtime')` ao marcar, `NULL` ao desmarcar).
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/escritorio/afazeres/8/feito" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"feito":true}'
```

### `GET /api/escritorio/midias/:id`
- **Quem pode:** qualquer usuário logado.
- **O que faz:** entrega os bytes de uma foto que o dono mandou pelo WhatsApp ao TH-IA-GO.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** o arquivo (não é JSON): `Content-Type` igual ao `mime` da foto quando começa com `image/`, senão `application/octet-stream`; `Cache-Control: private, max-age=86400`.
- **Erros:** 404 `Foto não encontrada.`; 401.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/escritorio/midias/15" -H "Authorization: Bearer $CHAVE" -o foto.jpg
```

### `POST /api/escritorio/midias/:id/imovel`
- **Quem pode:** adm, gestor
- **O que faz:** copia a foto original do dono para a pasta "Fotos" do imóvel já captado.
- **Entrada:** nenhuma.
- **Resposta:** `{"id":321,"imovel_id":48}`; se já tinha sido copiada, `{"id":321,"ja":true}`.
- **Erros:** 404 `Foto não encontrada.`; 409 `Esta oportunidade ainda não virou imóvel. Use "Captar imóvel" no Radar primeiro.`; 401; 403.
- **Efeitos:** cria um registro em `arquivos` (categoria `Fotos`) com o conteúdo da foto, **envia ao Google Drive** quando o Drive está conectado, e guarda o `imovel_arquivo_id` em `agente_midias`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/escritorio/midias/15/imovel" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/escritorio/ao-vivo`
- **Quem pode:** qualquer usuário logado; a parte `sistema` (balões da auditoria) só aparece para adm/gestor.
- **O que faz:** rota leve, feita para ser chamada a cada poucos segundos pelo escritório 3D: devolve os eventos novos dos agentes e o que a equipe/os clientes fizeram no sistema desde os ids informados.
- **Entrada:** nenhuma.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `ev` | inteiro | não | último id de `agente_eventos` já visto (padrão 0) |
| `au` | inteiro | não | último id de `auditoria` já visto (padrão 0) |
| `full` | qualquer valor | não | com ele, inclui `agentes` e `totais` do dia |

Sem `ev` nem `au` é "abertura": devolve os 6 últimos eventos e só marca o ponto de partida da auditoria (nenhum balão de sistema).
- **Resposta:**
```json
{"ev":120,"au":455,"eventos":[{"id":120,"agente":"casas","tipo":"aprovado","texto":"…","criado_em":"2026-10-30 09:12:00"}],
 "sistema":[{"id":455,"agente":"gerente","emoji":"🎉","texto":"CA0012 VENDIDO! · Júlia","criado_em":"2026-10-30 09:11:00"}],
 "agora":"2026-10-30T12:12:00.000Z"}
```
- **Erros:** 401.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/escritorio/ao-vivo?ev=120&au=455&full=1" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/escritorio/:slug`
- **Quem pode:** qualquer usuário logado; corretor vê só as conversas/leads dele e **não** recebe o QR code (`linha_estado.qr = null`) nem o `geral`.
- **O que faz:** a mesa de um agente: ajustes, alma, estado da linha, últimas 40 conversas, fila de aprovação, eventos e, conforme o agente, carteira, leads, fotos recebidas, números do robô ou a equipe.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta (campos principais):**
```json
{"slug":"casas","nome":"Clara","ajustes":{"ativo":true,"modo":"sugerir","linha":"sistema","canal":"qr","wa_filtro":"nao_salvos","alma_editada":false},
 "alma":"Você é Clara…","alma_padrao":"…","alma_arquivo":"src/agentes/almas/05-casas.soul",
 "linha":"gerente","linha_estado":{"estado":"conectado","numero":"5519999990000","vivo":true,"qr":null},
 "linhas_possiveis":[{"slug":"apartamentos","nome":"Ana"}],"usam_esta_linha":[],
 "conversas":[{"telefone":"5519999990000","nome":"João","texto":"…","direcao":"entrada","status":"recebida","quando":"2026-10-30 09:10:00","n":4,"lead_id":12}],
 "aprovar_lista":[],"eventos":[],"pode_editar":true,"pc":{"vivo":true},"geral":null,
 "carteira":[{"id":48,"codigo":"CA0012","tipo":"Casa","bairro":"Cambuí","valor":1850000,"capa":77}],
 "leads_lista":[{"id":12,"nome":"João","etapa":"qualificado","temperatura":"quente","corretor":"Júlia"}]}
```
Para `captador` vêm também `midias` (até 60) e `robo` (`hoje`, `fila`, `confirmados`, `conversando`); para `gerente-corretores` vem `equipe` (com telefone só no final, `abertos` e `visitas_hoje`); `geral` só é preenchido no agente `gerente` e para adm/gestor. Para quem não é adm/gestor os telefones das conversas vêm mascarados (`5519•••90000`).
- **Erros:** 404 `Agente não encontrado.`; 401.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/escritorio/casas" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/escritorio/:slug/conversa`
- **Quem pode:** adm, gestor (corretor recebe 403).
- **O que faz:** devolve as últimas 80 mensagens trocadas entre o agente e um telefone, em ordem cronológica.
- **Entrada:** nenhuma.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `tel` | texto | sim de fato | telefone exatamente como está em `agente_mensagens` (padrão `""`, que não acha nada) |

- **Resposta:** `[{"id":90,"direcao":"entrada","texto":"Oi","status":"recebida","autor":"João","motivo":null,"criado_em":"2026-10-30 09:10:00","enviado_em":null}]`
- **Erros:** 403 `Só gestores abrem a conversa por aqui. Use a ficha do lead.`; 404 `Agente não encontrado.`; 401.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/escritorio/casas/conversa?tel=5519999990000" -H "Authorization: Bearer $CHAVE"
```

### `PUT /api/escritorio/:slug`
- **Quem pode:** adm, gestor
- **O que faz:** muda os ajustes de um agente: ligado/desligado, modo de resposta, qual linha de WhatsApp ele usa, nome, canal e filtro do WhatsApp Web.
- **Entrada:** campos ausentes ficam como estão.

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `ativo` | booleano | não | padrão `true` |
| `modo` | `sugerir` \| `automatico` | não | qualquer outro valor cai em `sugerir`; padrão: `automatico` nos agentes internos, `sugerir` nos de cliente |
| `linha` | `sistema` \| `propria` \| slug de outro agente | não | padrão `sistema` (o número único do sistema) |
| `nome` | texto (40) | não | apelido do agente; vazio volta ao nome do catálogo |
| `canal` | `qr` \| `web` | não | `web` = WhatsApp Web no PC virtual; padrão `qr` |
| `wa_filtro` | `nao_salvos` \| `todos` | não | no WhatsApp Web, com quem o agente conversa; padrão `nao_salvos` |

- **Resposta:** `{"ok":true}`
- **Erros:** 404 `Agente não encontrado.`; 400 `Linha inválida.`; 400 `O TH-IA-GO usa sempre a linha do robô do Fisguei.`; 400 `A linha do TH-IA-GO é só da captação (abordagem de proprietários). Escolha outra.`; 401; 403.
- **Efeitos:** grava `config['agente:<slug>']`; registra na auditoria `escritorio.agente`. Mudar `canal` muda por onde as mensagens daquele **número** saem (fila do PC por QR ou batida da estação).
- **Exemplo:**
```bash
curl -s -X PUT "$BASE/api/escritorio/casas" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"modo":"automatico","linha":"sistema"}'
```

### `PUT /api/escritorio/:slug/alma`
- **Quem pode:** adm, gestor
- **O que faz:** reescreve a alma (`.soul`) do agente — o texto que vira a instrução de sistema da IA.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `alma` | texto | sim | pelo menos 40 caracteres depois de aparado; limite 20000 |

- **Resposta:** `{"ok":true}`
- **Erros:** 400 `A alma ficou curta demais. Escreva quem o agente é e como ele trabalha (ou use "Voltar ao padrão").`; 400 `A alma ficou grande demais (limite 20 mil caracteres).`; 404; 401; 403.
- **Efeitos:** grava `alma`, `alma_em` e `alma_por` em `config['agente:<slug>']`; `agente_eventos` tipo `alma`; auditoria `escritorio.alma`. Passa a valer na próxima resposta do agente.
- **Exemplo:**
```bash
curl -s -X PUT "$BASE/api/escritorio/casas/alma" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"alma":"Você é Clara, corretora de casas da imobiliária. Fala curto, sempre oferece visita."}'
```

### `POST /api/escritorio/:slug/alma/restaurar`
- **Quem pode:** adm, gestor
- **O que faz:** volta a alma do agente para o texto padrão do catálogo.
- **Entrada:** nenhuma.
- **Resposta:** `{"ok":true}`
- **Erros:** 404; 401; 403.
- **Efeitos:** apaga a alma editada em `config['agente:<slug>']`; grava `agente_eventos` tipo `alma`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/escritorio/casas/alma/restaurar" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/escritorio/:slug/alma.soul`
- **Quem pode:** qualquer usuário logado.
- **O que faz:** baixa a alma em vigor como arquivo `.soul`.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** texto puro (`text/plain; charset=utf-8`) com `Content-Disposition: attachment; filename="05-casas.soul"`.
- **Erros:** 404 `Agente não encontrado.`; 401.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/escritorio/casas/alma.soul" -H "Authorization: Bearer $CHAVE" -o 05-casas.soul
```

### `POST /api/escritorio/:slug/comando`
- **Quem pode:** adm, gestor
- **O que faz:** manda um comando para a linha de WhatsApp do agente (conectar, desconectar ou reiniciar).
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `comando` | `conectar` \| `desconectar` \| `reiniciar` | sim | qualquer outro valor é recusado |

- **Resposta:** `{"ok":true}`
- **Erros:** 404 `Agente não encontrado.`; 400 `Este agente usa a linha de <Nome>. Conecte por lá ou mude para "linha própria".` quando o agente não é o dono da própria linha; 400 `Comando inválido.`; 401; 403.
- **Efeitos:** grava `config['agente_cmd:<slug>']` (ou `config.fisguei_robo_cmd` no `captador`, onde `conectar` é traduzido para `reiniciar`); o processo das linhas no PC lê e **abre/fecha a sessão do WhatsApp** (pode gerar QR code novo). Auditoria `escritorio.linha`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/escritorio/casas/comando" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"comando":"conectar"}'
```

### `GET /api/escritorio/:slug/teste`
- **Quem pode:** qualquer usuário logado (a conversa de teste é individual: `teste-<id do usuário>-<slug>`).
- **O que faz:** devolve a conversa de teste daquele usuário com o agente, as ações que o robô tentou no teste nas últimas 24 h e se ainda falta responder.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** `{"mensagens":[{"id":1,"direcao":"entrada","texto":"oi","status":"recebida","criado_em":"2026-10-30 09:00:00"}],"acoes":[],"pendente":false,"pc":{"vivo":true,"nuvem":true}}`
- **Erros:** 404 `Agente não encontrado.`; 401.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/escritorio/casas/teste" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/escritorio/:slug/teste`
- **Quem pode:** qualquer usuário logado.
- **O que faz:** manda uma mensagem na conversa de teste. **Nada sai pelo WhatsApp**: o telefone é fictício (`teste-…`) e a resposta fica só na tela.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `texto` | texto (1000) | sim | a mensagem de teste |

- **Resposta:** `{"ok":true,"pc":{"vivo":true,"nuvem":true}}`
- **Erros:** 400 `Escreva a mensagem.`; 404; 401.
- **Efeitos:** insere a entrada em `agente_mensagens` com telefone `teste-<usuário>-<slug>`; com IA na nuvem, roda o `cicloCerebro` na hora (prazo de 40 s, sem rotinas e sem atribuir leads) — ou seja, **chama a IA externa** e grava a resposta com `status='teste'`. Sem IA na nuvem, a resposta fica para o PC.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/escritorio/casas/teste" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"texto":"Tem casa no Cambuí até 1,5 mi?"}'
```

### `DELETE /api/escritorio/:slug/teste`
- **Quem pode:** qualquer usuário logado.
- **O que faz:** limpa a conversa de teste do próprio usuário com aquele agente.
- **Entrada:** nenhuma.
- **Resposta:** `{"ok":true}`
- **Erros:** 404 `Agente não encontrado.`; 401; 403 (origem).
- **Efeitos:** apaga de `agente_mensagens` tudo com telefone `teste-<usuário>-<slug>`.
- **Exemplo:**
```bash
curl -s -X DELETE "$BASE/api/escritorio/casas/teste" -H "Authorization: Bearer $CHAVE"
```

### `POST /escritorio-ciclo`
- **Quem pode:** quem apresenta o cabeçalho `x-hh-ciclo` igual ao token guardado em `config.escritorio_ciclo_token` (comparação em tempo constante). Sem sessão e **sem** o parser JSON: o corpo nunca é lido. É a rota chamada pelo agendador do Supabase (pg_cron + pg_net, a cada minuto) e pelo próprio PC logo depois de chegar mensagem.
- **O que faz:** roda um ciclo do cérebro na nuvem: atribui leads, responde as conversas pendentes e roda as rotinas dos gerentes, com prazo de 45 s.
- **Entrada:** nenhuma (só o cabeçalho `x-hh-ciclo`).
- **Query:** nenhuma.
- **Resposta:** `{"ok":true,"ms":1830,"erro":null}`; sem chave de IA na nuvem, `{"ok":true,"sem_chave":true}`; com o escritório desligado, `{"pausado":true}`; se outro ciclo está rodando, `{"ocupado":true}`.
- **Erros:** 401 `{"erro":"não autorizado"}` quando o token não existe, tem tamanho diferente ou não confere.
- **Efeitos:** o ciclo inteiro do escritório — **chama a IA externa** (Claude ou Gemini), grava respostas em `agente_mensagens` (status `aprovar` no modo sugerir, `fila` no automático, e aí **as mensagens saem no WhatsApp**), cria/atualiza leads, visitas, afazeres, links internos e eventos, manda relatórios e avisos ao dono e aos corretores, e grava `config.escritorio_cerebro` com o estado.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/escritorio-ciclo" -H "x-hh-ciclo: $CHAVE"
```

## Redes e publicações (`src/routes/social.js`)

O arquivo exporta dois roteadores. `api` é montado em `/api` (atrás de `express.json`, da entrada por chave de API, de `mesmaOrigem` e de `exigeLogin`; as rotas marcadas "adm, gestor" passam por `exigePerfil`). Escopo deste módulo: `/api/social…` pede **`conteudo`**; valem as duas formas de entrar em `/api` e os erros próprios da chave descritos no módulo "Base". `publico` é montado **na raiz**, antes do parser JSON e sem sessão nenhuma: `/social/arte/…`, `/r/:cod`, `/links`, `/redes/retorno/:rede` e `POST /social-ciclo`.
Estados possíveis de um post: `agendado`, `aguardando`, `publicando`, `publicado`, `parcial`, `erro`, `pronto_manual`, `cancelado`. Redes possíveis: `instagram`, `facebook`, `google`.

### `GET /api/social`
- **Quem pode:** qualquer usuário logado.
- **O que faz:** o calendário do mês, com os posts, os cancelados, a cadência do plano, os ajustes, as contas conectadas e os números do mês. Ao abrir, se o calendário nunca foi planejado (ou faz mais de 1 h), **planeja na hora**.
- **Entrada:** nenhuma.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `mes` | `AAAA-MM` | não | padrão: o mês de hoje |

- **Resposta:**
```json
{"mes":"2026-10","hoje":"2026-10-30","agora":"2026-10-30 12:00",
 "posts":[{"id":31,"tipo":"imovel","ref":"CA0012","titulo":"Casa no Cambuí","agendado_para":"2026-10-30 12:00","status":"agendado","origem":"auto","redes":["instagram","facebook","google"],"resultado":{},"slides":4,"motivo":null,"editado":false,"thumb":"/social/arte/31/0.jpg?f=feed&v=1&s=ab12…","publicado_em":null}],
 "cancelados":[],"cadencia":{"plano":"profissional","nome":"Profissional"},"ajustes":{"modo":"automatico","pausado":false,"redes":{"instagram":true,"facebook":true,"google":true},"tipos":{"imovel":true,"blog":true,"revista":true,"bairro":true}},
 "contas":[{"id":2,"rede":"instagram","conta_id":"178…","nome":"Onde morar","usuario":"@imobiliaria","ativo":1}],
 "disponivel":{"meta":true,"google":false,"demonstracao":false},
 "numeros":{"publicados_mes":9,"agendados_7d":7,"aguardando":0,"pronto_manual":1,"erros":0,"cliques_mes":34,"leads_mes":2},
 "planejado_em":"2026-10-30 11:40","ciclo_em":"2026-10-30 11:50"}
```
- **Erros:** 401.
- **Efeitos:** garante o token do ciclo (`config.social_ciclo_token`, 24 bytes aleatórios, criado se faltar) e pode **criar posts novos** em `social_posts` ao planejar (só no futuro; erro no planejamento é apenas registrado no console).
- **Exemplo:**
```bash
curl -s "$BASE/api/social?mes=2026-11" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/social/resumo`
- **Quem pode:** qualquer usuário logado.
- **O que faz:** os três números do aviso do menu (badge).
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** `{"erros":0,"pronto_manual":1,"aguardando":2}`
- **Erros:** 401.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/social/resumo" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/social/posts/:id`
- **Quem pode:** qualquer usuário logado.
- **O que faz:** abre uma publicação: legenda e hashtags (ao vivo, do conteúdo, a não ser que tenha sido editada), as artes, as prévias por rede e os cliques.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:**
```json
{"id":31,"tipo":"imovel","ref":"CA0012","status":"agendado","legenda":"Casa no Cambuí…","hashtags":"#cambui #casa",
 "link":"/imoveis/casa-cambui-ca0012","chave":"imovel:2026-10-30:1",
 "artes":[{"url":"/social/arte/31/0.jpg?f=feed&v=1&s=ab12…","tipo":"capa","legenda":""}],
 "google":"/social/arte/31/0.jpg?f=google&v=1&s=ab12…",
 "previas":{"instagram":"…link na bio…","facebook":"…https://…/r/31f…","google":"…"},
 "existe":true,"cliques":[{"rede":"instagram","n":12}]}
```
- **Erros:** 404 `Publicação não encontrada.`; 401.
- **Efeitos:** só leitura (lê o conteúdo ao vivo do portal/blog/bairros).
- **Exemplo:**
```bash
curl -s "$BASE/api/social/posts/31" -H "Authorization: Bearer $CHAVE"
```

### `PUT /api/social/posts/:id`
- **Quem pode:** qualquer usuário logado.
- **O que faz:** edita a legenda, as hashtags, o horário ou as redes de um post que ainda não saiu.
- **Entrada:** só os campos enviados são mexidos; sem nenhum campo conhecido devolve o resumo sem gravar.

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `legenda` | texto (2000) | não | marca o post como `editado` (passa a ignorar a legenda ao vivo) |
| `hashtags` | texto | não | separadas por espaço; no máximo 20, cada uma de 2 a 40 letras/números/`_`; `#` é posto se faltar; marca `editado` |
| `agendado_para` | `AAAA-MM-DD HH:MM` (aceita `T`) | não | tem de ser no futuro; se o post estava em `erro` ou `pronto_manual`, volta a `agendado` |
| `redes` | lista | não | filtrada para `instagram`, `facebook`, `google` |
| `desfazer_edicao` | qualquer valor verdadeiro | não | volta a usar a legenda/hashtags ao vivo (`editado=0`) |

- **Resposta:** o resumo do post já atualizado (mesmo formato dos itens de `posts` em `GET /api/social`).
- **Erros:** 404 `Publicação não encontrada.`; 400 `Esta publicação já saiu.` (status `publicado` ou `publicando`); 400 `Data e hora inválidas.`; 400 `Escolha um horário no futuro (ou use "Publicar agora").`; 401.
- **Efeitos:** atualiza `social_posts`; auditoria `social_editou`.
- **Exemplo:**
```bash
curl -s -X PUT "$BASE/api/social/posts/31" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"legenda":"Casa pronta para morar no Cambuí","agendado_para":"2026-11-02 12:00","redes":["instagram","facebook"]}'
```

### `POST /api/social/posts/:id/aprovar`
- **Quem pode:** adm, gestor
- **O que faz:** aprova um post que estava esperando aprovação, deixando-o agendado.
- **Entrada:** nenhuma.
- **Resposta:** o resumo do post atualizado.
- **Erros:** 404 `Publicação não encontrada.`; 401; 403.
- **Efeitos:** `social_posts.status='agendado'` com `aprovado_por` e `aprovado_em`, **apenas** quando o status era `aguardando` (em qualquer outro caso nada muda e a resposta volta igual).
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/social/posts/31/aprovar" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/social/aprovar`
- **Quem pode:** adm, gestor
- **O que faz:** aprova de uma vez todos os posts do mês que estão esperando e ainda não passaram da hora.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `mes` | `AAAA-MM` | não | padrão: o mês de hoje |

- **Resposta:** `{"aprovados":6}`
- **Erros:** 401; 403.
- **Efeitos:** atualiza em lote `social_posts` (`aguardando` → `agendado`); auditoria `social_aprovou_mes`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/social/aprovar" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"mes":"2026-11"}'
```

### `POST /api/social/posts/:id/cancelar`
- **Quem pode:** qualquer usuário logado.
- **O que faz:** tira o post do calendário.
- **Entrada:** nenhuma.
- **Resposta:** o resumo do post atualizado.
- **Erros:** 404; 400 `Esta publicação já saiu. Apague direto na rede, se quiser.`; 401.
- **Efeitos:** `status='cancelado'` com `motivo='Tirado do calendário por <usuário>.'`; auditoria `social_cancelou`. Não apaga nada nas redes.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/social/posts/31/cancelar" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/social/posts/:id/restaurar`
- **Quem pode:** qualquer usuário logado.
- **O que faz:** volta com um post cancelado para o calendário.
- **Entrada:** nenhuma.
- **Resposta:** o resumo do post atualizado (se não estava cancelado, devolve como está, sem mexer).
- **Erros:** 404; 400 `O horário já passou: mude a data antes de voltar com o post.`; 401.
- **Efeitos:** `status` volta para `aguardando` (quando o modo dos ajustes é `aprovar`) ou `agendado`, e o `motivo` é apagado.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/social/posts/31/restaurar" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/social/posts/:id/trocar`
- **Quem pode:** qualquer usuário logado.
- **O que faz:** troca o conteúdo de um post do rodízio automático pelo próximo da fila, no mesmo horário.
- **Entrada:** nenhuma.
- **Resposta:** o resultado do planejamento com o id do substituto: `{"criados":1,"novo":57}` (`novo` é `null` se nada entrou no lugar).
- **Erros:** 404; 400 `Só dá para trocar o que ainda não saiu.` (status fora de `agendado`/`aguardando`/`pronto_manual`/`erro`); 400 `Só os posts do rodízio automático podem ser trocados. Este você pode editar ou tirar do calendário.` (quando `origem` não é `auto` ou o tipo é `revista`); 400 `O horário já passou.`; 401.
- **Efeitos:** cancela o post atual (muda a `chave` para `<chave>#x<id>` e `status='cancelado'`) e roda o planejador evitando o mesmo `ref`, criando um post novo em `social_posts`; auditoria `social_trocou`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/social/posts/31/trocar" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/social/posts/:id/publicar`
- **Quem pode:** adm, gestor
- **O que faz:** publica agora, fora do horário agendado.
- **Entrada:** nenhuma.
- **Resposta:** o resumo do post depois da tentativa, ex. `{"id":31,"status":"publicado","resultado":{"instagram":{"ok":true,"id":"178…","url":"https://instagram.com/p/…","em":"2026-10-30 12:05","conta":"Onde morar"}},"publicado_em":"2026-10-30 12:05"}`
- **Erros:** 404; 400 `Já foi publicado.`; 400 `Volte com o post para o calendário antes.` (cancelado); 400 `As publicações estão pausadas (Ajustes).`; 401; 403.
- **Efeitos:** **publica de verdade** nas redes conectadas e ativas: carrossel/foto no Instagram (Graph API: `media` + `media_publish`), foto ou feed na Página do Facebook, e `localPosts` no Google Meu Negócio (com botão "Saiba mais" apontando para o link rastreado `/r/<id>g`). Grava `resultado`, `status` (`publicado`, `parcial` ou `erro`), `publicado_em` e, se não estava editado, a legenda/hashtags ao vivo; limpa ou grava `social_contas.ultimo_erro`; auditoria `social_publicou_agora` e `social_publicacao`. Sem conta conectada (ou em portal de demonstração) não publica: o post fica `pronto_manual`. Se o conteúdo saiu do ar, o post é liberado/cancelado.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/social/posts/31/publicar" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/social/posts/:id/postado`
- **Quem pode:** qualquer usuário logado.
- **O que faz:** marca como publicado um post que a pessoa postou à mão nas redes.
- **Entrada:** nenhuma.
- **Resposta:** o resumo do post, com `status":"publicado"`.
- **Erros:** 404 `Publicação não encontrada.`; 401.
- **Efeitos:** grava `status='publicado'`, `publicado_em` e, dentro de `resultado`, `manual: {ok:true, em, por: <usuário>}`; limpa o `motivo`; auditoria `social_postado_a_mao`. Nada é enviado às redes.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/social/posts/31/postado" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/social/planejar`
- **Quem pode:** adm, gestor
- **O que faz:** roda o planejador na hora, preenchendo os próximos 35 dias conforme a cadência do plano.
- **Entrada:** nenhuma.
- **Resposta:** `{"criados":4,"pulados":["imovel:2026-11-05:1"],"plano":"profissional"}` (o formato é o que o planejador devolve).
- **Erros:** 401; 403.
- **Efeitos:** **cria posts** em `social_posts` (só horários futuros e ainda vazios; o que já existe não é duplicado nem alterado); auditoria `social_planejou`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/social/planejar" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/social/imoveis`
- **Quem pode:** qualquer usuário logado.
- **O que faz:** lista os imóveis que estão no ar no portal, com quantas vezes cada um já saiu, quando saiu pela última vez e quando sai de novo.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** `[{"codigo":"CA0012","titulo":"Casa no Cambuí","tipo":"Casa","bairro":"Cambuí","valor":1850000,"signature":false,"fotos":18,"capa":"/imoveis/foto/77?v=2","posts":3,"ultimo":"2026-10-20 12:00","proximo":"2026-11-02 12:00"}]` (nos imóveis Signature o `valor` vem `null`)
- **Erros:** 401.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/social/imoveis" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/social/imoveis`
- **Quem pode:** qualquer usuário logado.
- **O que faz:** agenda posts para imóveis escolhidos à mão, um a cada tantos dias.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `codigos` | lista de textos | sim | códigos dos imóveis; só os 60 primeiros são usados |
| `inicio` | `AAAA-MM-DD` | não | dia do primeiro post (padrão: hoje; se o horário já passou, vai para o dia seguinte) |
| `hora` | `HH:MM` | não | padrão `12:00` |
| `intervalo` | número 0–14 | não | dias entre um post e o próximo (padrão 0) |

- **Resposta:** `{"criados":[57,58],"fora":["XX9999"]}` (`fora` = códigos que não estão no ar no portal)
- **Erros:** 400 `Escolha ao menos um imóvel.`; 401.
- **Efeitos:** cria posts em `social_posts` com `origem='manual'` e `status='agendado'` (não passam por aprovação); auditoria `social_escolheu_imoveis`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/social/imoveis" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"codigos":["CA0012","AP0029"],"inicio":"2026-11-03","hora":"12:00","intervalo":2}'
```

### `PUT /api/social/ajustes`
- **Quem pode:** adm, gestor
- **O que faz:** muda o modo de aprovação, a pausa geral, as redes e os tipos de conteúdo ligados.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `modo` | `automatico` \| `aprovar` | não | padrão `automatico`; qualquer valor diferente de `aprovar` vira `automatico` |
| `pausado` | booleano | não | padrão `false`; pausado, o ciclo não publica nada |
| `redes` | objeto `{instagram,facebook,google}` de booleanos | não | todos `true` por padrão |
| `tipos` | objeto `{imovel,blog,revista,bairro}` de booleanos | não | todos `true` por padrão; desligar um tipo zera os dias dele na cadência |

- **Resposta:** os ajustes já salvos: `{"modo":"aprovar","pausado":false,"redes":{"instagram":true,"facebook":true,"google":false},"tipos":{"imovel":true,"blog":true,"revista":true,"bairro":true}}`
- **Erros:** 401; 403.
- **Efeitos:** grava `config.social_ajustes`. Ligar `modo:"aprovar"` passa os posts automáticos futuros de `agendado` para `aguardando`; voltar para `automatico` faz o caminho inverso. Auditoria `social_ajustes`.
- **Exemplo:**
```bash
curl -s -X PUT "$BASE/api/social/ajustes" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"modo":"aprovar","redes":{"google":false}}'
```

### `GET /api/social/contas`
- **Quem pode:** qualquer usuário logado.
- **O que faz:** lista **todas** as contas conectadas (ativas e inativas), o que está configurado na plataforma e os endereços de retorno a cadastrar na Meta e no Google.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** `{"contas":[{"id":2,"rede":"instagram","conta_id":"178…","nome":"Onde morar","usuario":"@imobiliaria","expira_em":null,"ativo":1,"ultimo_erro":null,"conectado_em":"2026-10-28 10:00"}],"disponivel":{"meta":true,"google":false,"demonstracao":false},"retorno":{"meta":"https://ondemorar.corretordofuturo.app/redes/retorno/meta","google":"https://ondemorar.corretordofuturo.app/redes/retorno/google"}}` — os tokens **nunca** aparecem.
- **Erros:** 401.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/social/contas" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/social/conectar/:rede`
- **Quem pode:** adm, gestor
- **O que faz:** devolve o endereço do consentimento (Facebook ou Google) para a pessoa abrir e ligar a conta.
- **Entrada:** nenhuma.
- **Query:** nenhuma. O `:rede` tem de ser `meta` ou `google`.
- **Resposta:** `{"url":"https://www.facebook.com/v24.0/dialog/oauth?client_id=…&state=meta.1.1762…&scope=pages_show_list,…"}`
- **Erros:** 400 `Esta é uma imobiliária de demonstração: as contas de verdade não são ligadas aqui.`; 400 `O app da plataforma na Meta ainda não foi configurado (META_APP_ID e META_APP_SECRET).`; 400 `O projeto do Google ainda não foi configurado (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET).`; 404 `Rede desconhecida.`; 401; 403.
- **Efeitos:** só leitura; o `state` é assinado com HMAC e vale 20 minutos, amarrado ao id do usuário.
- **Exemplo:**
```bash
curl -s "$BASE/api/social/conectar/meta" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/social/contas/:id/ativar`
- **Quem pode:** adm, gestor
- **O que faz:** escolhe qual conta de uma rede é a ativa (só uma por rede).
- **Entrada:** nenhuma.
- **Resposta:** `{"ok":true}`
- **Erros:** 404 `Conta não encontrada.`; 401; 403.
- **Efeitos:** desliga (`ativo=0`) as outras contas da mesma rede e liga esta; auditoria `social_conta_ativa`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/social/contas/2/ativar" -H "Authorization: Bearer $CHAVE"
```

### `DELETE /api/social/contas/:id`
- **Quem pode:** adm, gestor
- **O que faz:** apaga a conta conectada do sistema.
- **Entrada:** nenhuma.
- **Resposta:** `{"ok":true}`
- **Erros:** 404 `Conta não encontrada.`; 401; 403.
- **Efeitos:** apaga a linha de `social_contas` (**e com ela o token cifrado**); auditoria `social_conta_removida`. Nada é revogado na Meta/Google.
- **Exemplo:**
```bash
curl -s -X DELETE "$BASE/api/social/contas/2" -H "Authorization: Bearer $CHAVE"
```

### `GET /social/arte/:id/:n.jpg`
- **Quem pode:** qualquer um com o endereço assinado (sem login). É onde a Meta e o Google buscam a imagem na hora de publicar.
- **O que faz:** desenha e devolve a arte número `n` (base 0) da publicação `id`, com o preço e os dados ao vivo.
- **Entrada:** nenhuma.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `v` | número | sim | versão do post; tem de ser igual a `social_posts.versao` |
| `s` | texto (16 hex) | sim | assinatura HMAC de `<id>:<versao>` |
| `f` | `feed` \| `google` | não | formato: `feed` 1080×1350 (padrão), `google` 1200×900 |
| `baixar` | qualquer valor | não | acrescenta `Content-Disposition: attachment` |

`:id` tem de ter 1 a 9 dígitos e `:n` 1 a 2 dígitos.
- **Resposta:** o JPEG (`Content-Type: image/jpeg`, `Cache-Control: public, max-age=300, s-maxage=900, stale-while-revalidate=3600`).
- **Erros:** 404 sem corpo quando o id/n não casa com o formato, o post não existe, a versão/assinatura não confere ou o slide não existe (nesses casos `Cache-Control: no-store`); 502 quando o desenho falha.
- **Efeitos:** só leitura (lê o conteúdo ao vivo e desenha a imagem em memória).
- **Exemplo:**
```bash
curl -s "$BASE/social/arte/31/0.jpg?f=feed&v=1&s=ab12cd34ef567890" -o arte.jpg
```

### `GET /r/:cod`
- **Quem pode:** qualquer visitante (sem login).
- **O que faz:** link rastreado: conta o clique, marca no aparelho de qual rede a pessoa veio e redireciona para a página do portal/blog/bairro.
- **Entrada:** nenhuma.
- **Query:** nenhuma. O `:cod` é `<id do post>` seguido, opcionalmente, da letra da rede: `i` Instagram, `f` Facebook, `g` Google, `l` página de links; sem letra, a origem fica `redes`.
- **Resposta:** redirecionamento 302 para `<link do post>?utm_source=<rede>&utm_medium=social&utm_campaign=<tipo>-<id>`; se o código não casa, o post não existe ou o link não começa com `/`, redireciona para `/imoveis`.
- **Erros:** nenhum status de erro — todo caminho ruim cai no 302 para `/imoveis`.
- **Efeitos:** insere em `social_cliques` (não conta quando o `User-Agent` parece robô: `bot|crawl|spider|facebookexternalhit|preview`; falha ao contar é ignorada) e grava o cookie `redes_origem=<rede>.<id>` por 30 dias (`SameSite=Lax`, com `Secure` quando o site é https), que depois diz de qual rede o lead chegou.
- **Exemplo:**
```bash
curl -s -i "$BASE/r/31i"
```

### `GET /links`
- **Quem pode:** qualquer visitante (sem login). É a página "link na bio".
- **O que faz:** monta a página com as até 12 publicações mais recentes que ainda têm conteúdo no ar (procuradas entre as 24 últimas publicadas), mais os botões fixos para imóveis, revista, blog e bairros.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** HTML (`Cache-Control: public, max-age=60, s-maxage=300`, com CSP própria e `noindex`).
- **Erros:** nenhum previsto; publicação cujo conteúdo saiu do ar é simplesmente omitida.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/links"
```

### `GET /redes/retorno/:rede`
- **Quem pode:** quem voltou do Facebook/Google **com a sessão do sistema** e perfil adm ou gestor. É navegação comum, fora de `/api`.
- **O que faz:** fecha a conexão da conta: troca o `code` por token, descobre as Páginas/perfis e grava as contas.
- **Entrada:** nenhuma.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `code` | texto | sim no caminho de sucesso | código de autorização da Meta/Google |
| `state` | texto | sim | o `state` assinado devolvido pelo provedor (20 min, amarrado ao usuário) |
| `error` | texto | não | presente quando a pessoa cancelou no provedor |

`:rede` é `meta` ou `google`; qualquer outro valor redireciona para `/#/redes`.
- **Resposta:** sempre um redirecionamento para `/#/redes/contas?conexao=<mensagem>` (`conexao=ok` no sucesso; mensagens como `Entre como administrador ou gestor para conectar as redes.`, `Conexão cancelada no Facebook.`, `O pedido de conexão expirou. Tente de novo.` ou o texto do erro do provedor).
- **Erros:** não devolve status de erro — tudo vira mensagem no redirecionamento.
- **Efeitos:** **chama a Meta ou o Google**; na Meta troca o token curto por um longo e lista as Páginas com `instagram_business_account`; no Google lista contas e locais do Meu Negócio e exige `refresh_token`. Grava/atualiza `social_contas` com **token e refresh cifrados** (AES-256-GCM derivado de `'herrera-redes:' + DATABASE_URL`), deixando só uma conta ativa por rede; auditoria `social_conectou`.
- **Exemplo:**
```bash
curl -s -i "$BASE/redes/retorno/meta?code=AQB...&state=meta.1.1762000000.abcd" -H "Authorization: Bearer $CHAVE"
```

### `POST /social-ciclo`
- **Quem pode:** quem apresenta o cabeçalho `x-social-ciclo` igual a `config.social_ciclo_token` (comparação em tempo constante). Sem sessão; é o agendador do Supabase (pg_cron + pg_net), a cada 10 minutos.
- **O que faz:** roda o ciclo das redes: planeja o calendário (no máximo uma vez a cada ~50 min) e publica até 3 posts cuja hora chegou, repetindo os que falharam (até 3 tentativas, a cada 15 min).
- **Entrada:** nenhuma (só o cabeçalho).
- **Query:** nenhuma.
- **Resposta:** `{"em":"2026-10-30 12:00","planejado":{"criados":2},"publicados":[{"id":31,"status":"publicado"}],"pausado":false}`; com a conta suspensa, `{"…","suspensa":true}`; com as publicações pausadas, `{"…","pausado":true}`.
- **Erros:** 401 `{"erro":"não autorizado"}` quando o token não existe, tem tamanho diferente ou não confere.
- **Efeitos:** cria posts novos no calendário; **publica de verdade** no Instagram, no Facebook e no Google Meu Negócio; passa para `pronto_manual` o que ficou mais de 24 h sem sair; grava `resultado`, `status`, `motivo` e `publicado_em` nos posts, `social_contas.ultimo_erro`, `config.social_ciclo_em` e a auditoria `social_publicacao`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/social-ciclo" -H "x-social-ciclo: $CHAVE"
```

## LGPD no sistema (`src/routes/lgpd.js`)

Montado em `/api`, atrás de `express.json`, da entrada por chave de API (escopo **`config`**; valem as duas formas de entrar em `/api` e os erros próprios da chave descritos no módulo "Base"), de `mesmaOrigem` e de `exigeLogin`. Não usa `exigePerfil`: as rotas de pedidos e de bloqueio conferem o perfil na mão com `A.veTudo` (adm ou gestor) e devolvem 403 com mensagem própria. Versão dos Termos/Política em vigor: `2026-10-28`.

### `GET /api/lgpd/aceite`
- **Quem pode:** qualquer usuário logado (cada um vê o próprio aceite).
- **O que faz:** diz se o usuário já aceitou a versão atual dos Termos e da Política e dá os links dos textos na plataforma.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** `{"versao":"2026-10-28","aceito":true,"em":"2026-10-29T18:22:10.000Z","termos":"https://corretordofuturo.app/termos","privacidade":"https://corretordofuturo.app/privacidade"}` (`aceito` só é `true` quando a versão guardada é igual à atual; sem aceite, `em` vem `null`)
- **Erros:** 401.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/lgpd/aceite" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/lgpd/aceite`
- **Quem pode:** qualquer usuário logado (grava o aceite do próprio usuário).
- **O que faz:** registra que o usuário leu e aceitou os Termos e a Política.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `aceito` | booleano | sim | tem de ser exatamente `true` |

- **Resposta:** `{"ok":true,"versao":"2026-10-28","em":"2026-10-30T12:00:00.000Z"}`
- **Erros:** 400 `Marque que leu e aceita para continuar.`; 401; 403 (origem).
- **Efeitos:** grava `config['lgpd_aceite_u<id>']` com a versão, o instante e **o IP do usuário**; auditoria `lgpd_aceite` (também com o IP).
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/lgpd/aceite" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"aceito":true}'
```

### `GET /api/lgpd/resumo`
- **Quem pode:** qualquer usuário logado, mas só adm/gestor recebem números de verdade (os demais recebem zeros, sem erro).
- **O que faz:** quantos pedidos de titulares estão abertos e quantos vencem nos próximos 3 dias.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** `{"abertos":2,"vencendo":1}`
- **Erros:** 401.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/lgpd/resumo" -H "Authorization: Bearer $CHAVE"
```

### `GET /api/lgpd/pedidos`
- **Quem pode:** adm, gestor
- **O que faz:** lista os pedidos de titulares feitos no portal desta imobiliária (até 300, abertos primeiro), os tipos de pedido e os dados da controladora.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:**
```json
{"pedidos":[{"id":4,"protocolo":"LGPD-20261029-A1B2C3","tipo":"oposicao","nome":"Maria","email":null,"telefone":"5519999990000","mensagem":null,"origem":"portal","situacao":"aberto","resposta":null,"criado_em":"2026-10-29 14:00:00","prazo":"2026-11-13","atendido_em":null}],
 "tipos":{"oposicao":"Não quero mais ser contatado(a)","confirmar":"Saber se vocês têm dados meus","acessar":"Ver quais dados vocês têm sobre mim","corrigir":"Corrigir dados errados ou desatualizados","eliminar":"Apagar os meus dados","compartilhamento":"Saber com quem os meus dados foram compartilhados","portabilidade":"Receber os meus dados para levar a outro fornecedor","outro":"Outra dúvida sobre os meus dados"},
 "links":{"privacidade":"/privacidade","termos":"/termos"},
 "cliente":{"empresa":"Onde morar","cnpj":"","creci":"","email":""}}
```
- **Erros:** 403 `Só o administrativo ou o gestor veem os pedidos de titulares.`; 401.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/lgpd/pedidos" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/lgpd/pedidos/:id/atender`
- **Quem pode:** adm, gestor
- **O que faz:** fecha um pedido de titular, guardando por escrito o que foi feito ou respondido (fica como prova).
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `resposta` | texto (4000) | sim | o que foi feito/respondido ao titular |

- **Resposta:** `{"ok":true}`
- **Erros:** 403 `Só o administrativo ou o gestor respondem pedidos de titulares.`; 400 `Escreva o que foi feito ou respondido ao titular (fica registrado como prova).`; 404 `Pedido não encontrado.`; 401.
- **Efeitos:** em `titular_pedidos` grava `situacao='atendido'`, `resposta`, `atendido_em` e `atendido_por`; auditoria `lgpd_atendido` com o protocolo.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/lgpd/pedidos/4/atender" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"resposta":"Telefone bloqueado e dados apagados em 30/10/2026; titular avisado por WhatsApp."}'
```

### `POST /api/lgpd/nao-contatar`
- **Quem pode:** adm, gestor
- **O que faz:** põe um telefone na lista "não contatar".
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `telefone` | texto | sim | com DDD; normalizado para `55…`, tem de ficar com 12 dígitos ou mais |
| `motivo` | texto (200) | não | padrão `incluído pela equipe` |

- **Resposta:** `{"ok":true}`
- **Erros:** 403 `Só o administrativo ou o gestor incluem números na lista.`; 400 `Informe o telefone com DDD.`; 401.
- **Efeitos:** **bloqueia o número de verdade**: insere/atualiza `fisguei_bloqueios`, passa para `pulado` os contatos daquele telefone que estavam na fila do robô (`fisguei_contatos`), marca `leads.nao_contatar=1` e, no Postgres, chama `lgpd.opor(<hash do telefone>, motivo, origem)`, que grava o **hash SHA-256** do número na lista comum `plataforma.nao_contatar` — valendo para **todas as imobiliárias** da plataforma. Limpa o cache de `podeContatar`. Auditoria `lgpd_nao_contatar` só com os 4 últimos dígitos.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/lgpd/nao-contatar" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"telefone":"19999990000","motivo":"pediu por telefone"}'
```

## PCs virtuais dos agentes · lado da estação (`src/estacao/servidor.js`, `est` em `/estacao-api`)

Montado com `app.use('/estacao-api', require('./src/estacao/servidor').est)`, **antes** do `express.json` do site (o roteador tem o seu próprio parser, `limit: '2mb'`), **fora de `/api`**: não há cookie de sessão nem `mesmaOrigem`. Toda requisição passa por um middleware que lê a chave da estação no cabeçalho **`x-estacao`** e a compara (em tempo constante) com as três chaves que valem ao mesmo tempo: a própria da imobiliária (`config.estacao`, cifrada), a do ambiente (`ESTACAO_CHAVE`/`ESTACAO_ID`) e a **central da plataforma** (`plataforma.config` → `estacao_chave`). A chave reconhecida fica guardada em memória e é a usada para assinar o passe da tela. Chave errada → 401 `{"erro":"Chave da estação inválida."}`.

### `GET /estacao-api/config`
- **Quem pode:** a estação, com `x-estacao`.
- **O que faz:** diz à estação quem é esta imobiliária, quais são os 9 agentes e seus ajustes, qual IA opera o navegador (**com a chave em claro**) e quais números atendem pelo WhatsApp Web.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:**
```json
{"id":"ondemorar-ab12cd","cliente":"Onde morar","empresa":"Onde morar","sistema":"Herrera HOUSE IA","site":"https://ondemorar.corretordofuturo.app",
 "agentes":[{"slug":"casas","n":5,"nome":"Clara","cargo":"Corretora de casas até R$ 2 mi","cor":"#2f7d4f","tipo":"cliente","ativo":true,"canal":"qr","wa_filtro":"nao_salvos","linha":"gerente","resumo":"…"}],
 "ia":{"provedor":"anthropic","modelo":"claude-sonnet-5-5","base_url":null,"chave":"sk-ant-…"},
 "linhas_wa":[{"slug":"gerente","nome":"Augusto","wa_filtro":"nao_salvos"}]}
```
- **Erros:** 401 `Chave da estação inválida.`
- **Efeitos:** só leitura (lê e decifra a chave da IA para entregar à estação).
- **Exemplo:**
```bash
curl -s "$BASE/estacao-api/config" -H "x-estacao: $CHAVE"
```

### `POST /estacao-api/batida`
- **Quem pode:** a estação, com `x-estacao`. Chamada a cada ~8 segundos.
- **O que faz:** a estação conta como estão os PCs e o WhatsApp de cada um, e leva de volta as tarefas novas, as canceladas, as mensagens a enviar e os comandos pendentes.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `url` | texto | não | endereço público da estação (túnel); só é aceito se casar com `https://host` ou `http://127.0.0.1:porta`/`http://localhost:porta`, senão fica `null` |
| `versao` | texto (20) | não | versão da estação |
| `maquina` | texto (60) | não | nome do computador |
| `agentes` | objeto `slug → estado` | não | padrão `{}`; cada estado pode trazer `ligado`, `aba`, `tarefa`, `vendo` e `wa` |
| `agentes[slug].wa` | objeto | não | `estado` (texto, 20, padrão `parada`), `numero`, `qr` (data URL png/jpeg, até 30000 caracteres), `erro` (200) |

- **Resposta:**
```json
{"tarefas":[{"id":12,"agente":"casas","pedido":"Procurar o IPTU do imóvel…","alma":"Você é Clara…","nome":"Clara"}],
 "canceladas":[9],
 "saidas":[{"id":77,"linha":"gerente","telefone":"5519999990000","texto":"Oi! …"}],
 "comandos":[{"agente":"casas","comando":"ligar","em":"2026-10-30T12:00:00.000Z"}],
 "agentes":[{"slug":"casas","nome":"Clara","ativo":true,"canal":"qr","linha":"gerente"}],
 "ia_em":"2026-10-30T11:00:00.000Z","ligado":true}
```
- **Erros:** 401 `Chave da estação inválida.`
- **Efeitos:** grava `config.estacao_status` e, por agente, `config['estacao_wa:<slug>']` (inclusive o **QR code** que a tela mostra); passa para `erro` as tarefas `rodando` sem notícia há mais de 10 min; pega até 5 tarefas da fila mudando-as para `rodando` (cada tarefa vai para a estação **uma vez só**); fecha as canceladas; pega até 15 mensagens de saída dos números que atendem por WhatsApp Web, mudando-as de `fila` para `enviando` — e **descarta** as barradas (lead que pediu PARAR ou número bloqueado); devolve para a `fila` o que ficou mais de 5 min em `enviando`; esvazia `config.estacao_cmd`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/estacao-api/batida" -H "x-estacao: $CHAVE" -H 'Content-Type: application/json' -d '{"url":"https://xyz.trycloudflare.com","versao":"1.0.0","maquina":"RTX4090","agentes":{"gerente":{"ligado":true,"wa":{"estado":"conectado","numero":"5519999990000"}}}}'
```

### `POST /estacao-api/wa-entrada`
- **Quem pode:** a estação, com `x-estacao`.
- **O que faz:** entrega ao sistema uma mensagem que chegou no WhatsApp Web do PC do agente.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `linha` | slug de agente | sim | o número (linha) que recebeu |
| `telefone` | texto | sim | normalizado para `55…`; tem de ficar com 10 a 15 dígitos |
| `texto` | texto (4000) | sim | a mensagem |
| `nome` | texto | não | nome de quem escreveu (cortado em 80 no caminho comum; sem corte no `captador`) |
| `wa_id` | texto | não | id da mensagem no WhatsApp; guardado como `web:<id>` e usado para não gravar duas vezes |

- **Resposta:** `{"ok":true}`
- **Erros:** 400 `Mensagem inválida.` quando a linha não é um agente, o telefone não tem 10–15 dígitos ou o texto está vazio; 401.
- **Efeitos:** na linha `captador`, procura a pessoa do Fisguei pelos 8 últimos dígitos e grava a entrada ligada a ela; nas outras linhas chama `escritorio.entrada`, que **decide quem atende**, cria/atualiza o lead (`leads`, `interacoes`, `mensagens`, `ultimo_contato`) e grava a entrada em `agente_mensagens`. Um texto que seja só `parar`/`pare`/`sair`/`stop`/`descadastrar` marca `leads.nao_contatar=1` e **enfileira a confirmação de descadastro** (que sai no WhatsApp sem aprovação). A resposta de verdade fica para o próximo ciclo do cérebro.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/estacao-api/wa-entrada" -H "x-estacao: $CHAVE" -H 'Content-Type: application/json' -d '{"linha":"gerente","telefone":"19999990000","nome":"João","texto":"Tem casa no Cambuí?","wa_id":"3EB0A1"}'
```

### `POST /estacao-api/wa-saida/:id`
- **Quem pode:** a estação, com `x-estacao`.
- **O que faz:** informa o resultado do envio de uma mensagem que a estação tirou da fila.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `ok` | booleano | não | verdadeiro = enviada; qualquer valor falso/ausente = falhou |
| `wa_id` | texto | não | id da mensagem no WhatsApp (guardado como `web:<id>`, cortado em 120) |
| `erro` | texto | não | motivo da falha (padrão `falhou`, cortado em 200) |

- **Resposta:** `{"ok":true}`
- **Erros:** 404 `Mensagem não encontrada.`; 401.
- **Efeitos:** com `ok`, marca `agente_mensagens.status='enviada'`, espelha a mensagem na conversa do CRM (`mensagens`), apaga a sugestão pendente e atualiza `leads.ultimo_contato`. Sem `ok`, volta para `fila` (tenta de novo) ou marca `erro` quando a mensagem do erro casa com `sem WhatsApp|não existe`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/estacao-api/wa-saida/77" -H "x-estacao: $CHAVE" -H 'Content-Type: application/json' -d '{"ok":true,"wa_id":"3EB0B2"}'
```

### `POST /estacao-api/ciclo`
- **Quem pode:** a estação, com `x-estacao`. É o caminho das imobiliárias sem agendador próprio.
- **O que faz:** roda um ciclo do cérebro do escritório (prazo de 40 s) puxado pela estação.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** `{"ok":true,"ms":1540,"erro":null}`; sem chave de IA na nuvem, `{"sem_cerebro":true}`; com o escritório desligado, `{"pausado":true}`; com outro ciclo em curso, `{"ocupado":true}`.
- **Erros:** 401 `Chave da estação inválida.`
- **Efeitos:** os mesmos de `POST /escritorio-ciclo` — **chama a IA externa** e pode enfileirar/liberar mensagens de WhatsApp, criar visitas, afazeres, eventos e avisos.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/estacao-api/ciclo" -H "x-estacao: $CHAVE"
```

### `POST /estacao-api/tarefa/:id`
- **Quem pode:** a estação, com `x-estacao`.
- **O que faz:** conta o andamento de uma tarefa do PC virtual: um passo, um aviso para o escritório, a conclusão ou o erro. Os três últimos podem vir na mesma chamada.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `passo` | objeto | não | `n` (número; padrão: a posição na lista), `acao` (40), `detalhe` (300), `pensamento` (400), `url` (300) |
| `evento` | texto (200) | não | frase que aparece no mural do escritório |
| `concluir` | objeto | não | `resultado` (texto, cortado em 3500; padrão `Tarefa concluída.`) |
| `erro` | texto (500) | não | motivo da falha |

- **Resposta:** `{"ok":true}`; se a tarefa já foi cancelada na tela, `{"cancelada":true}` e nada é gravado.
- **Erros:** 404 `Tarefa não encontrada.`; 401.
- **Efeitos:** acrescenta o passo em `agente_tarefas.passos` (guarda os 80 últimos) e atualiza `n_passos`; grava `agente_eventos`; ao concluir, marca `status='feita'` com o resultado e **manda o resultado pelo WhatsApp** de quem pediu (`enfileiraSaida` com `aprovar:false`), se houver telefone; ao errar, marca `status='erro'` e **avisa pelo WhatsApp** que não conseguiu terminar.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/estacao-api/tarefa/12" -H "x-estacao: $CHAVE" -H 'Content-Type: application/json' -d '{"passo":{"n":3,"acao":"clicar","detalhe":"botão Consultar","url":"https://…"},"concluir":{"resultado":"IPTU 2026: R$ 3.420,00 em 10x"}}'
```

## PCs virtuais dos agentes · lado da tela (`src/estacao/servidor.js`, `api` em `/api`)

O mesmo arquivo exporta `api`, montado com `app.use('/api', require('./src/estacao/servidor').api)` — atrás de `express.json({limit:'1mb'})`, da entrada por chave de API, de `mesmaOrigem` e de `exigeLogin`, como o resto de `/api`. Escopo deste módulo: `/api/estacao…` pede **`escritorio`**; valem as duas formas de entrar em `/api` e os erros próprios da chave descritos no módulo "Base". As rotas marcadas "adm, gestor" usam `exigePerfil('adm','gestor')`.

### `GET /api/estacao`
- **Quem pode:** qualquer usuário logado; `ia` e `id` da estação só vão para adm/gestor.
- **O que faz:** mostra se a estação está ligada, qual máquina é, como está cada PC e as 30 últimas tarefas.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:**
```json
{"configurada":true,"online":true,"em":"2026-10-30T12:00:00.000Z","versao":"1.0.0","url":"https://xyz.trycloudflare.com","maquina":"RTX4090",
 "agentes":{"casas":{"ligado":true,"aba":{"url":"https://…","titulo":"…"},"tarefa":null,"vendo":0}},
 "ia":{"provedor":"anthropic","provedor_nome":"Anthropic Claude","modelo":"claude-sonnet-5-5","base_url":null,"tem_chave":true,"chave_final":"9f2a","usa_chave_do_escritorio":true,"precisa_chave":true,"testado_em":null,"teste_ok":null,"teste_msg":null},
 "provedores":{"gemini":{"nome":"Google Gemini","modelo":"gemini-flash-latest"},"anthropic":{"nome":"Anthropic Claude","modelo":"claude-sonnet-5-5"},"openai":{"nome":"Compatível com OpenAI (OpenRouter, Groq, OpenCode…)","modelo":"qwen/qwen2.5-vl-72b-instruct:free","base_url":"https://openrouter.ai/api/v1"},"ollama":{"nome":"IA local do PC (Ollama, grátis)","modelo":"qwen2.5vl:7b","base_url":"http://127.0.0.1:11434"}},
 "pode_editar":true,"id":"ondemorar-ab12cd",
 "tarefas":[{"id":12,"agente":"casas","pedido":"…","para_telefone":"5519999990000","para_nome":"Thiago","status":"feita","resultado":"…","erro":null,"n_passos":7,"passos":[],"criado_em":"2026-10-30 11:50:00","atualizado_em":"2026-10-30 11:56:00","concluido_em":"2026-10-30 11:56:00"}]}
```
`online` é verdadeiro quando a última batida tem menos de 60 s; `url` só vem quando está online.
- **Erros:** 401.
- **Efeitos:** só leitura; pode ler a chave central da plataforma (cache de 5 min).
- **Exemplo:**
```bash
curl -s "$BASE/api/estacao" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/estacao/passe`
- **Quem pode:** qualquer usuário logado; só adm/gestor recebem `controle: true` (os outros só assistem).
- **O que faz:** gera o passe assinado que a tela usa para abrir o PC virtual do agente direto na estação (WebSocket pelo túnel).
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `agente` | slug de agente | sim | de quem é o PC |

- **Resposta:** `{"url":"https://xyz.trycloudflare.com","passe":"ondemorar-ab12cd.casas.1762010000.3.c.aBc…","controle":true}`
- **Erros:** 404 `Agente não encontrado.`; 409 `A estação dos PCs virtuais ainda não foi ligada a esta imobiliária.`; 503 `A estação dos PCs virtuais está desligada agora. Ela volta sozinha quando o computador ligar.`; 401.
- **Efeitos:** só leitura — o passe é um HMAC-SHA256 assinado com a chave da estação sobre `<id>.<agente>.<expira>.<id do usuário>.<c|v>`, **válido por 10 minutos**; nada é gravado.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/estacao/passe" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"agente":"casas"}'
```

### `POST /api/estacao/chave`
- **Quem pode:** adm, gestor
- **O que faz:** gera (ou troca) a chave própria da estação desta imobiliária. **A chave inteira só aparece nesta resposta**; depois só os 4 últimos dígitos.
- **Entrada:** nenhuma.
- **Resposta:** `{"id":"ondemorar-ab12cd","chave":"est_AbCd…","base":"https://ondemorar.corretordofuturo.app"}`
- **Erros:** 401; 403.
- **Efeitos:** sobrescreve `config.estacao` com o id (mantido se já existia; senão criado a partir do nome do cliente + 3 bytes aleatórios) e a **chave nova cifrada** (AES-256-GCM). Trocar a chave invalida a antiga e também os passes assinados com ela. Auditoria `estacao.chave`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/estacao/chave" -H "Authorization: Bearer $CHAVE"
```

### `PUT /api/estacao/ia`
- **Quem pode:** adm, gestor
- **O que faz:** escolhe qual IA opera o navegador dos PCs virtuais (provedor, modelo, endereço da API e chave).
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `provedor` | `gemini` \| `anthropic` \| `openai` \| `ollama` | não | trocar de provedor limpa `modelo` e `base_url`; sem escolha, o padrão é `anthropic` se há chave central do Claude, `gemini` se há do Gemini, senão `ollama` |
| `modelo` | texto (120) | não | vazio volta ao modelo padrão do provedor |
| `base_url` | URL `http(s)://…` | não | endereço da API (padrão: o do provedor; `ollama` usa `http://127.0.0.1:11434`) |
| `chave` | texto 12–300 (`[\w\-.:]`) | não | vazio apaga a chave própria e volta a usar a do escritório/central |

- **Resposta:** o mesmo objeto `ia` do `GET /api/estacao`.
- **Erros:** 400 `Escolha um provedor da lista.`; 400 `Endereço da API inválido.`; 400 `Essa chave não parece válida (sem espaços, só letras, números e - _ .).`; 401; 403.
- **Efeitos:** grava `config.estacao_ia` com a **chave cifrada**, zera o último teste e guarda quem mexeu e quando; a estação recebe a configuração nova (com a chave em claro) na próxima leitura de `/estacao-api/config`. Auditoria `estacao.ia`.
- **Exemplo:**
```bash
curl -s -X PUT "$BASE/api/estacao/ia" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"provedor":"openai","base_url":"https://openrouter.ai/api/v1","chave":"sk-or-v1-...","modelo":"qwen/qwen2.5-vl-72b-instruct:free"}'
```

### `POST /api/estacao/ia/testar`
- **Quem pode:** adm, gestor
- **O que faz:** faz uma pergunta curta à IA escolhida para ver se a chave responde (a IA local do Ollama é testada pela própria estação, no PC).
- **Entrada:** nenhuma.
- **Resposta:** o objeto `ia` com o resultado, ex. `{"provedor":"anthropic","modelo":"claude-sonnet-5-5","teste_ok":true,"teste_msg":"O PC virtual está pronto. (1.2 s)","testado_em":"2026-10-30T12:05:00.000Z"}`; com `ollama`, `teste_ok` vem `null` e `teste_msg` é `A IA local é testada pela própria estação, no PC.`
- **Erros:** 401; 403. A falha da IA **não** virá como status de erro: vem em `teste_ok:false` com `teste_msg`.
- **Efeitos:** **chamada externa** ao provedor escolhido (timeout de 20 s); grava `teste_ok`, `teste_msg` e `testado_em` em `config.estacao_ia`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/estacao/ia/testar" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/estacao/tarefas`
- **Quem pode:** qualquer usuário logado.
- **O que faz:** manda uma tarefa para o PC virtual de um agente (a IA vai operar o Chrome e devolver o resultado pelo WhatsApp).
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `agente` | slug de agente | sim | de quem é o PC |
| `pedido` | texto (3000) | sim | pelo menos 8 caracteres |
| `para_telefone` | texto | não | WhatsApp que recebe o resultado; normalizado para `55DDDNNNNNNNN`. Sem ele, usa o telefone do usuário e, na falta dele, o celular do dono |

- **Resposta:** o resumo da tarefa criada: `{"id":13,"agente":"casas","pedido":"…","para_telefone":"5519999990000","para_nome":"Thiago","status":"fila","resultado":null,"erro":null,"n_passos":0,"passos":[],"criado_em":"2026-10-30 12:06:00","atualizado_em":null,"concluido_em":null}`
- **Erros:** 404 `Agente não encontrado.`; 400 `Escreva a tarefa com um pouco mais de detalhe.`; 400 `Confira o WhatsApp para receber o resultado, com DDD.`; 401.
- **Efeitos:** insere em `agente_tarefas` com `status='fila'`; grava um `agente_eventos` tipo `tarefa`; auditoria `estacao.tarefa`. Na próxima batida a estação pega a tarefa e **liga o PC do agente** (uma tarefa nova é uma das poucas coisas que ligam um PC sozinho), abre uma aba nova, e a IA passa a clicar e digitar de verdade no Chrome (até 40 passos); no fim o resultado **sai pelo WhatsApp** de quem pediu.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/estacao/tarefas" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"agente":"casas","pedido":"Procurar no site da prefeitura o valor do IPTU 2026 do imóvel da Rua X, 100","para_telefone":"19999990000"}'
```

### `GET /api/estacao/tarefas/:id`
- **Quem pode:** qualquer usuário logado.
- **O que faz:** acompanha uma tarefa: status, resultado, erro e os 25 últimos passos.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** o mesmo resumo de tarefa, com `passos` preenchido: `{"id":13,"status":"rodando","n_passos":7,"passos":[{"n":7,"acao":"clicar","detalhe":"botão Consultar","pensamento":"…","url":"https://…","em":"2026-10-30T12:07:00.000Z"}]}`
- **Erros:** 404 `Tarefa não encontrada.`; 401.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/api/estacao/tarefas/13" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/estacao/tarefas/:id/cancelar`
- **Quem pode:** qualquer usuário logado.
- **O que faz:** cancela uma tarefa que está na fila ou rodando.
- **Entrada:** nenhuma.
- **Resposta:** `{"ok":true}` — sempre, mesmo quando nada foi cancelado (tarefa inexistente ou já terminada).
- **Erros:** 401; 403 (origem).
- **Efeitos:** marca `agente_tarefas.status='cancelada'` quando o status era `fila` ou `rodando`; na próxima batida a estação é avisada e **para a tarefa no meio**.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/estacao/tarefas/13/cancelar" -H "Authorization: Bearer $CHAVE"
```

### `POST /api/estacao/comando`
- **Quem pode:** adm, gestor
- **O que faz:** manda um comando para o PC virtual de um agente na estação.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `agente` | slug de agente | sim | de quem é o PC |
| `comando` | `ligar` \| `reiniciar` \| `desligar` \| `ler_whatsapp` \| `sair_whatsapp` \| `abrir_whatsapp` | sim | qualquer outro valor é recusado |

- **Resposta:** `{"ok":true}`
- **Erros:** 400 `Comando inválido.` (agente desconhecido ou comando fora da lista); 401; 403.
- **Efeitos:** acrescenta o comando em `config.estacao_cmd` (guarda os 40 últimos); a estação o consome na próxima batida e **liga, reinicia ou desliga o Chrome do agente**, lê as conversas não lidas, abre o WhatsApp Web ou sai dele (`sair_whatsapp` encerra a sessão do número). Auditoria `estacao.comando`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/api/estacao/comando" -H "Authorization: Bearer $CHAVE" -H 'Content-Type: application/json' -d '{"agente":"casas","comando":"ligar"}'
```

## Painel do gestor da plataforma (`src/plataforma/gestor.js`)

Fica em **`corretordofuturo.app/gestor`** e a API dele usa o prefixo real **`/gestor-api/`** (o middleware tira esse prefixo antes de entregar ao roteador, que internamente conhece `/login`, `/imobiliarias`, …). O middleware `gestor` é o **primeiro** do `server.js`, antes de qualquer outra coisa, e só atende quando o `hostname` está em `GESTOR_HOSTS` (padrão `corretordofuturo.app,www.corretordofuturo.app,localhost,127.0.0.1`); em outro host, `/gestor…` devolve 404 em texto puro (`Não encontrado.`). Tudo sai com `X-Robots-Tag: noindex, nofollow` e `Cache-Control: no-store`. O roteador tem o próprio `express.json({ limit: '200kb' })` e termina com um 404 `{"erro":"Não encontrado."}` para caminho desconhecido.

**Autenticação do gestor** (separada da do sistema das imobiliárias): `POST /gestor-api/login` confere e-mail e senha na tabela `gestores` do schema `plataforma` (scrypt, `N=16384,r=8,p=1`), com freio de 8 tentativas por 15 minutos por IP+e-mail (tabela `tentativas`). No sucesso grava um token de 32 bytes (hash SHA-256) em `plataforma.sessoes` com validade de **12 horas** e manda o cookie `gestor_sessao` (`HttpOnly; SameSite=Strict; Path=/`, com `Secure` na Vercel). Todas as outras rotas passam pelo invólucro `exige`, que (1) em método diferente de `GET` obriga o cabeçalho **`x-gestor: 1`** (proteção contra CSRF) → 403 `Pedido recusado.`, e (2) resolve o gestor pelo cookie → 401 `Entre de novo.` Erros inesperados saem como 500 `Algo deu errado: <mensagem>`. O banco é o do usuário `plataforma_app` (`PLATAFORMA_DATABASE_URL`), que só vê o schema `plataforma`; sem essa variável as rotas devolvem 503 `Painel sem banco: falta PLATAFORMA_DATABASE_URL.`

`/gestor-api/` também passa pelo middleware da chave de API (escopo **`plataforma`**), mas a chave resolve um usuário do **sistema da imobiliária**, não um gestor da plataforma: o invólucro `exige` continua pedindo o cookie `gestor_sessao` (sem ele, 401 `Entre de novo.`) e o cabeçalho `x-gestor: 1` nas escritas. Por isso os exemplos deste módulo usam o cookie.

### `GET /gestor` (e `/gestor/dashboard`, `/gestor/projecao`)
- **Quem pode:** qualquer visitante nos hosts do gestor (a página em si é pública; os dados só vêm pela API, com cookie).
- **O que faz:** entrega o HTML do painel. `/gestor/dashboard` e `/gestor/projecao` entregam a mesma casca trocando o script por `/gestor/simulacao.js`, somando `bi.css` e mudando o título.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** HTML (`noindex,nofollow`, `no-store`).
- **Erros:** 404 em texto puro quando o host não está em `GESTOR_HOSTS`.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/gestor"
```

### `POST /gestor-api/login`
- **Quem pode:** qualquer um (é a porta de entrada).
- **O que faz:** entra no painel do gestor.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `email` | texto (160) | sim | e-mail do gestor |
| `senha` | texto | sim | senha |

- **Resposta:** `{"nome":"Thiago Herrera","email":"tiagaskan@gmail.com"}` + `Set-Cookie: gestor_sessao=…`
- **Erros:** 429 `Muitas tentativas. Espere 15 minutos.`; 401 `E-mail ou senha não conferem.`; 500 `Não foi possível entrar agora.`; 503 sem `PLATAFORMA_DATABASE_URL`.
- **Efeitos:** insere em `plataforma.sessoes` (12 h) e apaga as expiradas; a cada falha insere em `plataforma.tentativas`; grava um `plataforma.eventos` tipo `login` com o IP.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/gestor-api/login" -H 'Content-Type: application/json' -d '{"email":"gestor@exemplo.com","senha":"..."}' -c cookies.txt
```

### `POST /gestor-api/logout`
- **Quem pode:** qualquer um (não passa por `exige`; sem cookie não faz nada).
- **O que faz:** sai do painel.
- **Entrada:** nenhuma.
- **Resposta:** `{"ok":true}` + cookie `gestor_sessao` zerado.
- **Erros:** nenhum (falha ao apagar a sessão é ignorada).
- **Efeitos:** apaga a linha de `plataforma.sessoes`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/gestor-api/logout" -H "Cookie: gestor_sessao=$CHAVE"
```

### `GET /gestor-api/eu`
- **Quem pode:** gestor logado.
- **O que faz:** diz quem está logado.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** `{"id":1,"nome":"Thiago Herrera","email":"gestor@exemplo.com"}`
- **Erros:** 401 `Entre de novo.`
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/gestor-api/eu" -H "Cookie: gestor_sessao=$CHAVE"
```

### `POST /gestor-api/senha`
- **Quem pode:** gestor logado (precisa do cabeçalho `x-gestor: 1`).
- **O que faz:** troca a senha do gestor.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `atual` | texto | sim | senha atual |
| `nova` | texto | sim | pelo menos 10 caracteres |

- **Resposta:** `{"ok":true}`
- **Erros:** 403 `Pedido recusado.` sem `x-gestor`; 401 `Entre de novo.`; 400 `A senha nova precisa ter pelo menos 10 caracteres.`; 400 `A senha atual não confere.`
- **Efeitos:** grava o novo hash scrypt em `plataforma.gestores` e **derruba todas as outras sessões** desse gestor; grava um `plataforma.eventos` tipo `senha`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/gestor-api/senha" -H "Cookie: gestor_sessao=$CHAVE" -H 'x-gestor: 1' -H 'Content-Type: application/json' -d '{"atual":"...","nova":"..........."}'
```

### `GET /gestor-api/imobiliarias`
- **Quem pode:** gestor logado.
- **O que faz:** lista as imobiliárias clientes com cadastro, papel de parede, números de cada uma (pela função `numeros(slug)`, que devolve só contagens — nunca nomes, telefones ou endereços), a comissão calculada e o resumo da carteira.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:**
```json
{"imobiliarias":[{"id":2,"slug":"ondemorar","nome":"Onde morar","empresa":"Onde morar","materias_dia":null,"onboarding":{"dados":{"feito":true}},"contato_nome":"…","contato_email":"…","contato_telefone":"…","link":"https://ondemorar.corretordofuturo.app","dominio":"ondemorar.corretordofuturo.app","vercel_projeto":"imob-ondemorar","plano":"profissional","mensalidade":497,"comissao_pct":20,"comissao_venda_pct":6,"creditos_fisgar_mes":100,"situacao":"ativa","publicada":1,"notas":null,"fundo":{"src":"…","lugar":"Castelo d'Água","posicao":"center"},"numeros":{"imoveis":120,"leads_30d":34,"vgv_carteira":98000000,"valor_vendido_mes":1800000},"comissao_mes":21600,"comissao_total":120000}],
 "resumo":{"total":3,"ativas":2,"suspensas":0,"implantacao":1,"mensalidades":994,"comissao_mes":21600,"vgv":98000000,"imoveis":120,"leads_30d":34,"creditos_mes":0,"vercel_automatico":true}}
```
Quando `numeros()` falha para uma imobiliária, ela vem com `numeros: null` e `erro: "<mensagem>"`.
- **Erros:** 401; 503 sem banco.
- **Efeitos:** quase só leitura, com duas exceções: se a imobiliária não tem `link` mas tem projeto na Vercel e há `VERCEL_TOKEN`, **consulta a Vercel** e grava o link encontrado (`link`, `publicada=1`).
- **Exemplo:**
```bash
curl -s "$BASE/gestor-api/imobiliarias" -H "Cookie: gestor_sessao=$CHAVE"
```

### `PATCH /gestor-api/imobiliarias/:id`
- **Quem pode:** gestor logado (com `x-gestor: 1`).
- **O que faz:** edita o cadastro e os valores de uma imobiliária.
- **Entrada:** só os campos enviados são alterados; nenhum campo conhecido → `{"ok":true}` sem gravar.

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `nome` | texto (120) | não | não pode ficar vazio |
| `empresa` | texto (160) | não | razão social / nome na marca |
| `contato_nome` | texto (120) | não | — |
| `contato_email` | texto (160) | não | — |
| `contato_telefone` | texto (40) | não | — |
| `link` | texto (300) | não | se não vazio, tem de casar com `https://<host>[/...]` |
| `dominio` | texto (200) | não | — |
| `plano` | texto (40) | não | `essencial`, `profissional`, `rede`, `fundador` (o valor não é validado aqui) |
| `notas` | texto (2000) | não | — |
| `mensalidade` | número ≥ 0 | não | aceita `1.234,56` |
| `comissao_pct` | número 0–100 | não | fatia da plataforma na comissão |
| `comissao_venda_pct` | número 0–100 | não | comissão da venda |
| `creditos_fisgar_mes` | número ≥ 0 | não | arredondado para inteiro |

- **Resposta:** `{"ok":true}`
- **Erros:** 403 sem `x-gestor`; 401; 404 `Imobiliária não encontrada.`; 400 `O nome não pode ficar vazio.`; 400 `Valor inválido em <campo>.`; 400 `O link precisa começar com https://`
- **Efeitos:** `UPDATE plataforma.imobiliarias` com `atualizado_em`; grava um `plataforma.eventos` tipo `editou` com a lista de campos.
- **Exemplo:**
```bash
curl -s -X PATCH "$BASE/gestor-api/imobiliarias/2" -H "Cookie: gestor_sessao=$CHAVE" -H 'x-gestor: 1' -H 'Content-Type: application/json' -d '{"mensalidade":"597,00","plano":"rede"}'
```

### `POST /gestor-api/imobiliarias/:id/situacao`
- **Quem pode:** gestor logado (com `x-gestor: 1`).
- **O que faz:** suspende ou reativa a conta de uma imobiliária.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `suspensa` | booleano | não | valor verdadeiro suspende; ausente/falso reativa (padrão: reativar) |

- **Resposta:** `{"ok":true,"situacao":"suspensa"}`
- **Erros:** 403 sem `x-gestor`; 401; 404 `Imobiliária não encontrada.`
- **Efeitos:** chama `plataforma.suspender(slug, bool)`, que muda a `situacao` e marca a imobiliária como suspensa no banco dela. Suspensa, o **sistema, o portal e o blog daquela imobiliária passam a mostrar o aviso de conta suspensa** (middleware `src/plataforma/suspensa.js`) e o ciclo das redes para de publicar. Grava `plataforma.eventos` (`suspendeu`/`reativou`).
- **Exemplo:**
```bash
curl -s -X POST "$BASE/gestor-api/imobiliarias/2/situacao" -H "Cookie: gestor_sessao=$CHAVE" -H 'x-gestor: 1' -H 'Content-Type: application/json' -d '{"suspensa":true}'
```

### `POST /gestor-api/imobiliarias`
- **Quem pode:** gestor logado (com `x-gestor: 1`).
- **O que faz:** cadastra uma imobiliária nova, **cria o banco dela** e o usuário administrador e, se houver `VERCEL_TOKEN`, publica o projeto na Vercel.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `nome` | texto (120) | sim | nome da imobiliária |
| `slug` | texto | não | nome técnico; padrão: gerado do nome. Tem de casar `^[a-z][a-z0-9_]{2,30}$` |
| `admin_email` | e-mail (160) | sim | e-mail do administrador da imobiliária |
| `admin_senha` | texto | sim | pelo menos 8 caracteres |
| `admin_nome` | texto (120) | não | padrão `Administrador <nome>` |
| `empresa` | texto (160) | não | padrão: o `nome` |
| `contato_nome` | texto (120) | não | — |
| `contato_email` | texto (160) | não | padrão: `admin_email` |
| `contato_telefone` | texto (40) | não | — |
| `plano` | texto (40) | não | padrão `essencial` |
| `mensalidade` | número | não | padrão 0 |
| `comissao_pct` | número | não | padrão 20 |
| `comissao_venda_pct` | número | não | padrão 6 |
| `creditos_fisgar_mes` | número | não | padrão 0, arredondado |
| `notas` | texto (2000) | não | — |

- **Resposta:** `{"ok":true,"id":5,"slug":"casaprado","publicada":true,"aviso":null}` (`aviso` traz a mensagem quando a publicação na Vercel falhou)
- **Erros:** 403 sem `x-gestor`; 401; 400 `Informe o nome da imobiliária.`; 400 `Nome técnico inválido: use letras e números (começando por letra).`; 400 `Informe o e-mail do administrador da imobiliária.`; 400 `A senha do administrador precisa ter pelo menos 8 caracteres.`; 409 `Já existe uma imobiliária com o nome técnico "<slug>".`; 400 `Não foi possível criar o banco: <erro>`; 502 `Vercel: <mensagem>` (nas chamadas internas à Vercel).
- **Efeitos:** insere em `plataforma.imobiliarias` com `situacao='implantacao'`, `link` e `dominio` iguais a `https://<slug>.corretordofuturo.app`; chama `plataforma.criar_imobiliaria(slug, senha do banco, nome, e-mail, hash da senha)`, que **cria o schema/banco da imobiliária** e o usuário administrador dela (se isso falhar, o cadastro é desfeito); gera um `SECRET_KEY` de 32 bytes e guarda `{dbUrl, segredo}` **cifrado** (AES-256-GCM com chave derivada de `SECRET_KEY + '|plataforma'`) em `imobiliarias.db_url_cifrada`; com `VERCEL_TOKEN`, **cria o projeto na Vercel** ligado ao repositório `balaocastelo-dev/Corretordofuturo.app` com as variáveis de ambiente (as que terminam em `URL`/`KEY` como `encrypted`), **liga o domínio `<slug>.corretordofuturo.app`** e dispara o primeiro deploy de produção, marcando `publicada=1` e `situacao='ativa'`. Grava `plataforma.eventos` tipo `criou`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/gestor-api/imobiliarias" -H "Cookie: gestor_sessao=$CHAVE" -H 'x-gestor: 1' -H 'Content-Type: application/json' -d '{"nome":"Casa Prado","admin_email":"adm@casaprado.com.br","admin_senha":"senha1234","plano":"essencial","mensalidade":497}'
```

### `GET /gestor-api/imobiliarias/:id/instalacao`
- **Quem pode:** gestor logado.
- **O que faz:** mostra as variáveis de ambiente para publicar a imobiliária à mão na Vercel, **inclusive a conexão do banco e o `SECRET_KEY` em claro**.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** `{"variaveis":{"DATABASE_URL":"postgres://USUARIO:SENHA@HOST:5432/postgres","SECRET_KEY":"…","CLIENTE_NOME":"Casa Prado","EMPRESA":"Casa Prado","BLOG_NOME":"Casa Prado Blog","IA_MODO":"desligado","RADAR_PORTAIS":"0","FISGUEI_ROBO":"0","ESCRITORIO":"0","PUBLIC_URL":"https://casaprado.corretordofuturo.app","PORTAL_FUNDO":"lagoa"},"repo":"balaocastelo-dev/Corretordofuturo.app","dominio":"casaprado.corretordofuturo.app","vercel_automatico":true}`; para uma imobiliária instalada antes do painel, `{"variaveis":null,"aviso":"Esta imobiliária foi instalada antes do painel: as variáveis estão no projeto dela na Vercel."}`
- **Erros:** 401; 404 `Imobiliária não encontrada.`
- **Efeitos:** **decifra e expõe segredos**; grava `plataforma.eventos` tipo `viu_instalacao`.
- **Exemplo:**
```bash
curl -s "$BASE/gestor-api/imobiliarias/5/instalacao" -H "Cookie: gestor_sessao=$CHAVE"
```

### `POST /gestor-api/imobiliarias/:id/publicada`
- **Quem pode:** gestor logado (com `x-gestor: 1`).
- **O que faz:** marca a imobiliária como publicada depois de uma publicação feita à mão.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `link` | texto (300) | não | endereço do sistema; se enviado, tem de casar `https://<host>[/...]`. Ausente mantém o atual |
| `vercel_projeto` | texto (100) | não | nome do projeto na Vercel; ausente mantém o atual |

- **Resposta:** `{"ok":true}`
- **Erros:** 403 sem `x-gestor`; 401; 400 `O link precisa começar com https://`. Id inexistente **não** dá erro (o `UPDATE` simplesmente não encontra ninguém).
- **Efeitos:** grava `publicada=1`, troca `situacao` de `implantacao` para `ativa` e atualiza `link`/`vercel_projeto`; grava `plataforma.eventos` tipo `publicada`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/gestor-api/imobiliarias/5/publicada" -H "Cookie: gestor_sessao=$CHAVE" -H 'x-gestor: 1' -H 'Content-Type: application/json' -d '{"link":"https://casaprado.corretordofuturo.app","vercel_projeto":"imob-casaprado"}'
```

### `GET /gestor-api/imobiliarias/:id/assistente`
- **Quem pode:** gestor logado.
- **O que faz:** o estado do assistente "Nova imobiliária": o cadastro, a lista de passos, o que já foi marcado, o que o sistema da imobiliária diz estar configurado e se o site responde.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:**
```json
{"imobiliaria":{"id":5,"slug":"casaprado","nome":"Casa Prado","automatico":true,"onboarding":{"dados":{"feito":true,"em":"…","por":1}}},
 "passos":["boas-vindas","dados","administrador","publicar","marca","gemini","google-maps","facebook-instagram","google-meu-negocio","whatsapp","pronto"],
 "onboarding":{"dados":{"feito":true}},
 "configurado":{"usuarios":2,"gemini":true,"google_maps":false,"redes":["facebook"],"linhas_whatsapp":1},
 "publicacao":{"ok":true,"status":200}}
```
- **Erros:** 401; 404 `Imobiliária não encontrada.`
- **Efeitos:** **busca o site da imobiliária** (`GET <link>/imoveis`, timeout 9 s, `User-Agent: HerreraHouseIA-assistente/1.0`); chama `plataforma.configurado(slug)`. Não grava nada.
- **Exemplo:**
```bash
curl -s "$BASE/gestor-api/imobiliarias/5/assistente" -H "Cookie: gestor_sessao=$CHAVE"
```

### `POST /gestor-api/imobiliarias/:id/assistente/passo`
- **Quem pode:** gestor logado (com `x-gestor: 1`).
- **O que faz:** marca (ou desmarca) um passo do assistente à mão.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `passo` | um dos 11 passos | sim | `boas-vindas`, `dados`, `administrador`, `publicar`, `marca`, `gemini`, `google-maps`, `facebook-instagram`, `google-meu-negocio`, `whatsapp`, `pronto` |
| `feito` | booleano | não | só `false` desmarca; qualquer outro valor (ou ausente) marca |
| `detalhe` | texto (300) | não | observação guardada junto |

- **Resposta:** `{"ok":true}`
- **Erros:** 403 sem `x-gestor`; 401; 404 `Imobiliária não encontrada.`; 400 `Passo desconhecido.`
- **Efeitos:** altera o JSON `imobiliarias.onboarding` (põe `{feito, em, por, detalhe}` ou remove a chave); grava `plataforma.eventos` tipo `assistente`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/gestor-api/imobiliarias/5/assistente/passo" -H "Cookie: gestor_sessao=$CHAVE" -H 'x-gestor: 1' -H 'Content-Type: application/json' -d '{"passo":"marca","feito":true,"detalhe":"logo e cores enviadas"}'
```

### `POST /gestor-api/imobiliarias/:id/assistente/conferir/:passo`
- **Quem pode:** gestor logado (com `x-gestor: 1`).
- **O que faz:** confere de verdade um passo (site no ar, redes conectadas, WhatsApp, chaves, usuário) e marca o passo quando passa.
- **Entrada:** nenhuma. O passo vem no caminho e tem de ser um com conferência automática: `publicar`, `facebook-instagram`, `google-meu-negocio`, `whatsapp`, `gemini`, `google-maps` ou `administrador`.
- **Query:** nenhuma.
- **Resposta:** `{"ok":true,"status":200}` ou `{"ok":false,"motivo":"O Google Meu Negócio ainda não foi conectado no sistema da imobiliária."}`
- **Erros:** 403 sem `x-gestor`; 401; 404 `Imobiliária não encontrada.`; 400 `Esse passo não tem conferência automática.`
- **Efeitos:** no passo `publicar`, **busca o site** da imobiliária; nos outros, chama `plataforma.configurado(slug)`. Quando o resultado é `ok`, marca o passo no `onboarding`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/gestor-api/imobiliarias/5/assistente/conferir/publicar" -H "Cookie: gestor_sessao=$CHAVE" -H 'x-gestor: 1'
```

### `POST /gestor-api/imobiliarias/:id/assistente/gemini`
- **Quem pode:** gestor logado (com `x-gestor: 1`).
- **O que faz:** testa a chave do Gemini no Google e, se a imobiliária foi criada pelo painel, grava a chave **já cifrada** na configuração dela.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `chave` | texto 20–200 (`[A-Za-z0-9_-.]`) | sim | chave do Google AI Studio |

- **Resposta:** `{"ok":true,"gravado":true,"modelo":"gemini-flash-latest"}`; chave válida mas instalação antiga: `{"ok":true,"gravado":false,"modelo":"gemini-flash-latest","motivo":"Chave válida. Esta imobiliária foi instalada antes do painel: cole a chave no sistema dela, em Escritório virtual › Configuração geral."}`; chave recusada: `{"ok":false,"motivo":"O Google recusou essa chave. Confira se copiou inteira e se ela é do Google AI Studio."}`
- **Erros:** 403 sem `x-gestor`; 401; 404 `Imobiliária não encontrada.`; 400 `Isso não parece uma chave do Gemini (começa com "AIza…").`
- **Efeitos:** **chama o Google** (`generativelanguage.googleapis.com/v1beta/models`) para validar a chave e escolher o modelo flash; cifra a chave com AES-256-GCM usando o segredo derivado da conexão do banco **da imobiliária** (`'hh-escritorio-ia:' + dbUrl`, o mesmo esquema do sistema dela; o prefixo anterior ainda abre) e chama `plataforma.definir_config(slug, 'escritorio_ia', <json>)` — a chave em claro **nunca** fica no banco da plataforma. Marca o passo `gemini` e grava `plataforma.eventos`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/gestor-api/imobiliarias/5/assistente/gemini" -H "Cookie: gestor_sessao=$CHAVE" -H 'x-gestor: 1' -H 'Content-Type: application/json' -d '{"chave":"AIza..."}'
```

### `POST /gestor-api/imobiliarias/:id/assistente/maps`
- **Quem pode:** gestor logado (com `x-gestor: 1`).
- **O que faz:** testa a chave do Google Maps nas duas APIs usadas (Map Tiles, do 3D realista, e Street View Static, das fachadas), fingindo ser o site da imobiliária, e grava a chave na configuração dela.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `chave` | texto 30–60 (`[A-Za-z0-9_-]`) | sim | chave do Google Maps |

- **Resposta:** `{"ok":true,"testes":{"map_tiles":"ok","street_view":"ok"},"parcial":false,"motivo":null}`; parcial: `{"ok":true,"testes":{"map_tiles":"ok","street_view":"recusou (REQUEST_DENIED)"},"parcial":true,"motivo":"Gravada, mas uma das APIs ainda recusa: Street View Static (fachadas). Ative no Google Cloud."}`; as duas recusando: `{"ok":false,"testes":{…},"motivo":"O Google recusou a chave nas duas APIs. Ative a Map Tiles API e a Street View Static API no projeto e confira a restrição de site."}`
- **Erros:** 403 sem `x-gestor`; 401; 404 `Imobiliária não encontrada.`; 400 `Isso não parece uma chave do Google Maps (começa com "AIza…").`
- **Efeitos:** **chama `tile.googleapis.com` e `maps.googleapis.com`** com o `Referer` do site da imobiliária; se ao menos uma API aceita, grava a chave **em claro** com `plataforma.definir_config(slug, 'google_maps_chave', <chave>)`, marca o passo `google-maps` e grava `plataforma.eventos`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/gestor-api/imobiliarias/5/assistente/maps" -H "Cookie: gestor_sessao=$CHAVE" -H 'x-gestor: 1' -H 'Content-Type: application/json' -d '{"chave":"AIza..."}'
```

### `GET /gestor-api/banco`
- **Quem pode:** gestor logado.
- **O que faz:** a situação do banco de matérias do blog (estoque livre por tema, consumo por dia, dias de estoque e temas já usados), pela função `plataforma.banco_situacao()`.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** o JSON que a função devolve, ex. `{"livres":[{"tema":"financiamento","n":4}],"total_livres":31,"consumo_dia":3,"dias_de_estoque":10,"temas":["financiamento","mudança"]}`
- **Erros:** 401; 503 sem banco.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/gestor-api/banco" -H "Cookie: gestor_sessao=$CHAVE"
```

### `POST /gestor-api/banco/ciclo`
- **Quem pode:** gestor logado (com `x-gestor: 1`).
- **O que faz:** roda o ciclo do banco de matérias na hora: sincroniza o ramo do GitHub e entrega as matérias do dia (e, depois das 18 h de Brasília, também as de amanhã).
- **Entrada:** nenhuma.
- **Resposta:** `{"sincronizacao":{"novas":2,"recusadas":[{"slug":"xyz","motivo":"sem foto de capa"}]},"hoje":{"entregues":[…]},"amanha":null}`
- **Erros:** 403 sem `x-gestor`; 401; 503 sem banco.
- **Efeitos:** **busca o ramo `plataforma` no GitHub** (`raw.githubusercontent.com`), valida cada matéria nova (tema, blocos, nota de avaliação, capa e links) e **insere as aprovadas** em `plataforma.materias`; chama `plataforma.entregar_materias()`, que **distribui matérias para as imobiliárias**; grava `plataforma.eventos` tipo `banco_ciclo`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/gestor-api/banco/ciclo" -H "Cookie: gestor_sessao=$CHAVE" -H 'x-gestor: 1'
```

### `POST /gestor-api/imobiliarias/:id/materias`
- **Quem pode:** gestor logado (com `x-gestor: 1`).
- **O que faz:** define quantas matérias do banco aquela imobiliária recebe por dia, fora do que o plano dá.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `materias_dia` | inteiro 0–3 ou `null`/`""` | não | `null`/vazio/ausente = "pelo plano" (padrão) |

- **Resposta:** `{"ok":true}`
- **Erros:** 403 sem `x-gestor`; 401; 400 `Matérias por dia: de 0 a 3 (vazio = pelo plano).`
- **Efeitos:** grava `imobiliarias.materias_dia`; `plataforma.eventos` tipo `materias_dia`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/gestor-api/imobiliarias/5/materias" -H "Cookie: gestor_sessao=$CHAVE" -H 'x-gestor: 1' -H 'Content-Type: application/json' -d '{"materias_dia":2}'
```

### `GET /gestor-api/lgpd`
- **Quem pode:** gestor logado.
- **O que faz:** os pedidos de titulares feitos em `corretordofuturo.app/privacidade` (até 200, abertos primeiro), quantos números estão na lista comum "não contatar" e os tipos de pedido.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** `{"pedidos":[{"id":3,"protocolo":"LGPD-20261029-9F8E7D","tipo":"eliminar","nome":"Maria","email":"maria@…","telefone":"5519999990000","mensagem":null,"imobiliaria":"Onde morar","situacao":"aberto","resposta":null,"criado_em":"2026-10-29 14:00","prazo":"2026-11-13","atendido_em":null}],"nao_contatar":48,"tipos":{"oposicao":"Não quero mais ser contatado(a)","…":"…"}}`
- **Erros:** 401; 503 sem banco.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/gestor-api/lgpd" -H "Cookie: gestor_sessao=$CHAVE"
```

### `POST /gestor-api/lgpd/:id/atender`
- **Quem pode:** gestor logado (com `x-gestor: 1`).
- **O que faz:** fecha um pedido de titular da plataforma, guardando a resposta.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `resposta` | texto (4000) | sim | o que foi feito/respondido |

- **Resposta:** `{"ok":true}`
- **Erros:** 403 sem `x-gestor`; 401; 400 `Escreva o que foi feito ou respondido ao titular.`; 404 `Pedido não encontrado.`
- **Efeitos:** em `plataforma.titular_pedidos` grava `situacao='atendido'`, `resposta` e `atendido_em`; `plataforma.eventos` tipo `lgpd_atendido` com o protocolo.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/gestor-api/lgpd/3/atender" -H "Cookie: gestor_sessao=$CHAVE" -H 'x-gestor: 1' -H 'Content-Type: application/json' -d '{"resposta":"Dados apagados e telefone na lista não contatar; titular avisado por e-mail."}'
```

### `GET /gestor-api/eventos`
- **Quem pode:** gestor logado.
- **O que faz:** os 30 últimos eventos do painel (sem os `login`), com o nome da imobiliária envolvida.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** `[{"acao":"criou","detalhe":"Casa Prado (casaprado)","em":"2026-10-30T11:00:00.000Z","imobiliaria":"Casa Prado"}]`
- **Erros:** 401; 503 sem banco.
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/gestor-api/eventos" -H "Cookie: gestor_sessao=$CHAVE"
```

### `POST /banco-ciclo`
- **Quem pode:** quem apresenta o cabeçalho **`x-banco-ciclo`** igual a `plataforma.config` → `banco_ciclo_token` (comparação em tempo constante). Só nos hosts do gestor; **fora** do painel e sem cookie. É o `pg_cron` do Supabase que chama.
- **O que faz:** o mesmo ciclo do banco de matérias (sincronizar o ramo + entregar).
- **Entrada:** nenhuma (só o cabeçalho; o corpo não é usado).
- **Query:** nenhuma.
- **Resposta:** `{"sincronizacao":{"novas":2,"recusadas":[]},"hoje":{"entregues":[…]},"amanha":null}`
- **Erros:** 405 `{"erro":"Use POST."}` em outro método; 403 `{"erro":"Sem permissão."}` quando o token falta ou não confere; 500/503 `{"erro":"Não foi possível agora."}` / `Painel sem banco: falta PLATAFORMA_DATABASE_URL.`
- **Efeitos:** os mesmos de `POST /gestor-api/banco/ciclo` (busca o GitHub, insere matérias novas, distribui às imobiliárias), **menos** o registro em `plataforma.eventos`.
- **Exemplo:**
```bash
curl -s -X POST "$BASE/banco-ciclo" -H "x-banco-ciclo: $CHAVE"
```

### `GET /banco-materias/situacao.json`
- **Quem pode:** qualquer um, nos hosts do gestor. Sem segredo: é o resumo que a rotina que escreve as matérias consulta.
- **O que faz:** diz quantas matérias há em estoque por tema, o consumo por dia, os dias de estoque, os temas já usados e os nomes das imobiliárias.
- **Entrada:** nenhuma.
- **Query:** nenhuma.
- **Resposta:** `{"livres":[{"tema":"financiamento","n":4}],"total_livres":31,"consumo_dia":3,"dias_de_estoque":10,"temas":["financiamento"],"nomes":["Onde morar","Casa Prado"]}`
- **Erros:** 500 `{"erro":"Não foi possível agora."}`; 503 `Painel sem banco: falta PLATAFORMA_DATABASE_URL.`
- **Efeitos:** só leitura.
- **Exemplo:**
```bash
curl -s "$BASE/banco-materias/situacao.json"
```

## Entrada única da plataforma (`src/plataforma/entrada.js`)

A entrada fica em **`app.corretordofuturo.app`** (hosts em `PLATAFORMA_APP_HOSTS`, padrão `app.corretordofuturo.app`): a pessoa digita e-mail e senha uma vez, o servidor descobre de qual imobiliária ela é pelas funções `plataforma.login_busca` / `plataforma.login_entrega` (usuário `plataforma_app`) e a manda já logada para o endereço da imobiliária dela. Imobiliária suspensa ou fora do ar não aparece. Nesses hosts o middleware `entrada` também serve a página (`GET /`, qualquer outro caminho GET redireciona 302 para `/`), o script `GET /entrada.js` (`Cache-Control: public, max-age=300`) e `GET /robots.txt` (`Disallow: /`); método diferente de GET/HEAD fora de `/entrada-api` → 404 `{"erro":"Não encontrado."}`. Tudo sai com `X-Robots-Tag: noindex, nofollow`.
A rota `GET /entrar-pela-plataforma` é o outro lado: fica **no domínio da imobiliária**, registrada no `server.js` antes do parser JSON.

### `POST /entrada-api`
- **Quem pode:** qualquer um, no host de entrada da plataforma (roteador com `express.json({ limit: '4kb' })`, sem sessão).
- **O que faz:** confere e-mail e senha em todas as imobiliárias, e devolve o endereço para onde ir já logado — ou a lista de imobiliárias, quando o mesmo e-mail existe em mais de uma.
- **Entrada:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `email` | texto | sim | cortado em 200, aparado e em minúsculas |
| `senha` | texto | sim | cortado em 200 |
| `imobiliaria_id` | número | não | obrigatório na segunda chamada, quando o e-mail está em mais de uma imobiliária |

- **Resposta:** `{"ir":"https://ondemorar.corretordofuturo.app/entrar-pela-plataforma?t=<token>"}`; com mais de uma imobiliária, `{"escolher":[{"id":2,"nome":"Onde morar"},{"id":5,"nome":"Casa Prado"}]}`
- **Erros:** 400 `{"erro":"Digite o e-mail e a senha."}`; 429 `{"erro":"Muitas tentativas. Espere 15 minutos."}` (mais de 20 tentativas por IP ou 6 por e-mail em 15 minutos); 401 `{"erro":"E-mail ou senha não conferem."}`; 423 `{"erro":"Esta imobiliária está temporariamente fora do ar."}`; 500/503 `{"erro":"A entrada está indisponível agora. Tente em instantes."}`
- **Efeitos:** chama `plataforma.login_busca(email)` e confere a senha com scrypt em memória; no sucesso gera um token de 32 bytes e chama `plataforma.login_entrega(imobiliaria_id, usuario_id, <hash sha256 do token>)`, que **grava o passe no banco da imobiliária** (uma sessão especial `passe:<hash>`, válida 2 minutos e de uso único); limpa o freio por e-mail. A cada falha anota a tentativa em memória (por IP e por e-mail).
- **Exemplo:**
```bash
curl -s -X POST "$BASE/entrada-api" -H 'Content-Type: application/json' -d '{"email":"thiago@imobiliaria.com.br","senha":"..."}'
```

### `GET /entrar-pela-plataforma`
- **Quem pode:** quem chega com um passe válido, no domínio da imobiliária. Sem sessão, antes do parser JSON.
- **O que faz:** troca o passe da plataforma (2 minutos, uma vez só) por uma sessão normal do sistema e leva a pessoa para o painel.
- **Entrada:** nenhuma.
- **Query:**

| campo | tipo | obrigatório | descrição |
| --- | --- | --- | --- |
| `t` | texto 40–60 (`[A-Za-z0-9_-]`) | sim | o passe devolvido por `POST /entrada-api` |

- **Resposta:** redirecionamento 302 para `/#/painel` com o cookie `hh_sessao` (`HttpOnly; SameSite=Lax; Path=/; Max-Age=12h`, com `Secure` na Vercel); passe ausente, mal formado, expirado, já usado ou de usuário inativo → 302 para `/entrar`. Sai com `Cache-Control: no-store` e `Referrer-Policy: no-referrer`.
- **Erros:** nenhum status de erro — todo caminho ruim é um 302 para `/entrar`.
- **Efeitos:** **apaga o passe** de `sessoes` (uso único, apagado mesmo quando não serve) e, se valia, cria uma sessão nova de 12 horas para aquele usuário; grava na auditoria `login` com o detalhe `pela plataforma (app.corretordofuturo.app)`.
- **Exemplo:**
```bash
curl -s -i "$BASE/entrar-pela-plataforma?t=$CHAVE"
```


---

# 6. Índice das ações (nome para a IA)

Use em `POST /api/ia/executar` e como nome da ferramenta MCP (o ponto vira `_`).

## escopo `imoveis`

| ação | rota | o que faz |
|---|---|---|
| `imoveis.listar` | GET /api/imoveis | Lista a carteira (cards/tabela) com filtros e etapa de cada imóvel. |
| `imoveis.ver` | GET /api/imoveis/:id | Ficha completa do imóvel, com proprietário, condomínio e etapa. |
| `imoveis.criar` | POST /api/imoveis | Cadastra um imóvel na carteira e gera o código (AP0001, CA0002…). |
| `imoveis.alterar` | PUT /api/imoveis/:id | Altera os dados do imóvel (mesmos campos do cadastro). |
| `imoveis.status` | PATCH /api/imoveis/:id/status | Muda o status (captação, publicado, off_market, vendido, alugado…). Fica na auditoria. |
| `imoveis.tipos` | GET /api/imoveis/tipos | Tipos e status aceitos pelo cadastro. |
| `imoveis.endereco` | GET /api/imoveis/endereco | Procura o endereço pelo CEP (ViaCEP) e reconhece o condomínio da base. |
| `imoveis.arquivos` | GET /api/imoveis/:id/arquivos | Lista os arquivos do imóvel nas 7 pastas (fotos, documentos, fotos internas…). |
| `imoveis.enviarArquivo` | POST /api/imoveis/:id/arquivos | Envia um arquivo para uma pasta do imóvel (multipart/form-data). |
| `imoveis.compradores` | GET /api/imoveis/:id/compradores | Leads que combinam com o imóvel (match comprador × imóvel). |
| `imoveis.links` | GET /api/imoveis/:id/links | Links off-market criados para o imóvel e os acessos de cada um. |
| `imoveis.criarLink` | POST /api/imoveis/:id/links | Cria um link interno off-market com validade. |
| `imoveis.apagarLink` | DELETE /api/imoveis/:id/links/:lid | Apaga um link off-market. |
| `imoveis.autorizacoes` | GET /api/imoveis/:id/autorizacoes | Autorizações de venda do imóvel e a situação da assinatura. |
| `imoveis.autorizacao` | POST /api/imoveis/:id/autorizacao | Gera a autorização de venda e o link de assinatura eletrônica do proprietário. |
| `imoveis.cancelarAutorizacao` | POST /api/imoveis/:id/autorizacoes/:aid/cancelar | Cancela uma autorização pendente. |
| `imoveis.drivePasta` | POST /api/imoveis/:id/drive/pasta | Cria (ou refaz) a pasta do imóvel no Google Drive. |
| `imoveis.dadosFisgar` | GET /api/imoveis/:id/fisgar | Pessoas, telefones e situação no robô para o imóvel, vindos do Fisgar. |
| `imoveis.localizarDono` | POST /api/imoveis/:id/localizar-dono | Põe o imóvel na fila do Fisgar para achar o proprietário (gasta crédito). |
| `imoveis.localizarDonoLote` | POST /api/imoveis/localizar-dono | Mesma busca para vários imóveis sem dono (até 200). |
| `arquivos.baixar` | GET /api/arquivos/:id | Baixa um arquivo do sistema (foto, documento, PDF). |
| `drive.enviarPendentes` | POST /api/drive/enviar-pendentes | Manda ao Drive os arquivos que ficaram para trás. |
| `drive.arquivo` | GET /api/drive/arquivo/:imovelId/:fileId | Baixa um arquivo que está no Drive do imóvel. |

## escopo `config`

| ação | rota | o que faz |
|---|---|---|
| `drive.conectar` | GET /api/drive/conectar | Começa a conexão com o Google Drive (devolve o endereço de autorização). |
| `drive.desconectar` | POST /api/drive/desconectar | Desliga o Google Drive. |
| `painel.integracoes` | GET /api/integracoes | Situação das integrações: Drive, WhatsApp, IA, Maps, radar. |
| `conta.senha` | POST /api/me/senha | Troca a senha do próprio usuário. |
| `conta.telefone` | POST /api/me/telefone | Grava o celular do usuário (liga o botão de WhatsApp do portal). |
| `usuarios.listar` | GET /api/usuarios | Usuários do sistema (adm/gestor veem tudo). |
| `usuarios.criar` | POST /api/usuarios | Cria um usuário (adm/gestor/corretor). |
| `usuarios.alterar` | PATCH /api/usuarios/:id | Altera ou desativa um usuário. |
| `setup.precisa` | GET /api/setup | Diz se o sistema ainda não tem administrador. *(entrada publico)* |
| `setup.criar` | POST /api/setup | Cria o primeiro administrador (só no primeiro acesso). *(entrada publico)* |
| `config.ler` | GET /api/ia/config | Lê as configurações guardadas no banco (segredos aparecem só pelos 4 últimos). |
| `config.gravar` | PUT /api/ia/config | Grava uma configuração do sistema no banco (adm). |
| `lgpd.resumo` | GET /api/lgpd/resumo | Pedidos de titulares em aberto e prazos. |
| `lgpd.pedidos` | GET /api/lgpd/pedidos | Lista os pedidos de titulares (acesso, correção, eliminação, oposição). |
| `lgpd.atender` | POST /api/lgpd/pedidos/:id/atender | Registra a resposta ao titular e fecha o pedido. |
| `lgpd.naoContatar` | POST /api/lgpd/nao-contatar | Põe um telefone na lista "não contatar" (vale em todas as imobiliárias). |
| `lgpd.aceite` | GET /api/lgpd/aceite | Diz se o usuário já aceitou os termos da versão atual. |
| `lgpd.aceitar` | POST /api/lgpd/aceite | Registra o aceite dos termos pelo usuário. |
| `chaves.listar` | GET /api/chaves | Chaves de API criadas, com escopos, uso e último acesso. |
| `chaves.criar` | POST /api/chaves | Cria uma chave de API (a chave aparece uma única vez). |
| `chaves.revogar` | DELETE /api/chaves/:id | Revoga a chave na hora. |
| `chaves.log` | GET /api/chaves/log | Últimas chamadas feitas com chave de API. |
| `publico.privacidadePedido` | POST /privacidade/pedido | Pedido de titular (LGPD) pelo site. *(entrada publico)* |

## escopo `crm`

| ação | rota | o que faz |
|---|---|---|
| `leads.listar` | GET /api/leads | Lista os leads do funil, com etapa, temperatura e corretor. |
| `leads.ver` | GET /api/leads/:id | Ficha do lead com histórico, visitas e imóveis que combinam. |
| `leads.criar` | POST /api/leads | Cria um lead no CRM. |
| `leads.alterar` | PUT /api/leads/:id | Altera os dados do lead. |
| `leads.etapa` | PATCH /api/leads/:id/etapa | Move o lead no funil (novo, qualificado, visita, proposta, escritura, perdido). |
| `leads.nota` | POST /api/leads/:id/nota | Registra uma anotação no histórico do lead. |
| `visitas.listar` | GET /api/visitas | Visitas agendadas, com imóvel, lead e confirmação. |
| `visitas.criar` | POST /api/visitas | Agenda uma visita de um lead a um imóvel. |
| `visitas.alterar` | PATCH /api/visitas/:id | Confirma, remarca ou cancela a visita. |
| `whats.conversas` | GET /api/whats | Conversas de WhatsApp do CRM, com quem está esperando resposta. |
| `whats.conversa` | GET /api/whats/:leadId | Mensagens trocadas com um lead. |
| `whats.sugerir` | POST /api/whats/:leadId/sugerir | Pede à IA uma sugestão de resposta para o corretor aprovar. |
| `whats.enviar` | POST /api/whats/:leadId/enviar | Envia a mensagem de WhatsApp ao lead. |
| `whats.simular` | POST /api/whats/simular | Simula a chegada de uma mensagem (modo de teste, sem WhatsApp real). |
| `chat.caixa` | GET /api/chat/caixa | Caixa de entrada do chat interno (conversas e não lidas). |
| `chat.conversa` | GET /api/chat/conversas/:id | Mensagens de uma conversa do chat interno. |
| `chat.criarConversa` | POST /api/chat/conversas | Abre conversa direta ou sala de reunião com pessoas e robôs escolhidos. |
| `chat.enviar` | POST /api/chat/conversas/:id/mensagens | Manda uma mensagem no chat interno (serve para dar ordem a um robô). |
| `chat.novidades` | GET /api/chat/novidades | O que chegou desde a última leitura (para avisos). |
| `publico.interesse` | POST /interesse | Formulário do portal: vira lead QUENTE no CRM. *(entrada publico)* |
| `publico.contato` | POST /contato | Formulário "Fale com a imobiliária" do blog e dos guias de bairro: vira lead. *(entrada publico)* |
| `publico.signature` | POST /signature | Clube Signature: vira lead quente e libera os valores naquele aparelho. *(entrada publico)* |
| `publico.webhookWhats` | POST /webhook/whatsapp | Webhook da WhatsApp Cloud API (mensagens recebidas). *(entrada token)* |

## escopo `captacao`

| ação | rota | o que faz |
|---|---|---|
| `radar.listar` | GET /api/radar | Oportunidades do radar (anúncios de portais), com situação e prioridade. |
| `radar.ver` | GET /api/radar/:id | Ficha da oportunidade, com eventos, cartas e dados do anúncio. |
| `radar.criar` | POST /api/radar | Cria uma oportunidade de captação à mão. |
| `radar.alterar` | PUT /api/radar/:id | Altera a oportunidade. |
| `radar.resumo` | GET /api/radar/resumo | Números do radar: por situação, por portal e o que precisa de atenção. |
| `radar.assumir` | POST /api/radar/:id/assumir | Assume a oportunidade para um corretor. |
| `radar.evento` | POST /api/radar/:id/evento | Registra um passo da cascata de contato (ligação, visita, portaria…). |
| `radar.descartar` | POST /api/radar/:id/descartar | Descarta a oportunidade. |
| `radar.reabrir` | POST /api/radar/:id/reabrir | Reabre uma oportunidade descartada. |
| `radar.converter` | POST /api/radar/:id/converter | Transforma a oportunidade em imóvel em captação na carteira. |
| `radar.carta` | GET /api/radar/:id/carta.pdf | Carta ao proprietário em PDF, com QR code do WhatsApp. |
| `radar.cartas` | GET /api/radar/cartas.pdf | Várias cartas num PDF só. |
| `radar.cartaEnviada` | POST /api/radar/:id/carta-enviada | Marca que a carta foi postada. |
| `radar.cartasEnviadas` | POST /api/radar/cartas-enviadas | Marca várias cartas como enviadas. |
| `radar.matricula` | POST /api/radar/:id/matricula | Pede a consulta paga de matrícula (precisa de aprovação do gestor). |
| `radar.biro` | POST /api/radar/:id/biro | Pede a consulta paga ao birô de dados (precisa de aprovação do gestor). |
| `radar.aprovacao` | POST /api/radar/:id/aprovacao | Abre um pedido de aprovação de gasto para a oportunidade. |
| `radar.aprovacoes` | GET /api/radar/aprovacoes | Consultas pagas esperando decisão do gestor. |
| `radar.decidir` | POST /api/radar/aprovacoes/:aid/decidir | Aprova ou recusa a consulta paga. |
| `radar.alertas` | GET /api/radar/alertas | Situação do radar automático (e-mails dos portais e monitor direto). |
| `radar.lerAlertas` | POST /api/radar/alertas/ler | Lê agora a caixa de e-mail dos alertas dos portais (roda no PC). |
| `radar.lerPortais` | POST /api/radar/portais/ler | Roda agora o monitor direto dos portais (roda no PC). |
| `fisguei.listar` | GET /api/fisguei | Anúncios da base com filtros (bairro, valor, dono, situação). |
| `fisguei.ver` | GET /api/fisguei/:id | Ficha do anúncio: fotos, proprietários, telefones e histórico de preço. |
| `fisguei.explorar` | GET /api/fisguei/explorar | Leitura da IA: sinais (queda de preço, novo, antigo, abaixo do bairro, particular) e nota de cada anúncio. |
| `fisguei.explorarMapa` | GET /api/fisguei/explorar/mapa | Os mesmos anúncios da leitura da IA em pontos para o mapa. |
| `fisguei.mapa` | GET /api/fisguei/mapa | Pontos da base no mapa (até 3.000). |
| `fisguei.resumo` | GET /api/fisguei/resumo | Resumo da base para o selo do menu (anúncios, buscas, respostas). |
| `fisguei.radar` | GET /api/fisguei/radar | Situação do robô e da extensão do Chrome. |
| `fisguei.creditos` | GET /api/fisguei/creditos | Créditos do Fisgar: saldo, gasto do dia e do mês, ritmo. |
| `fisguei.corrigirCreditos` | POST /api/fisguei/creditos | Corrige o saldo de créditos do Fisgar à mão (adm/gestor). |
| `fisguei.localizar` | POST /api/fisguei/localizar | Localiza o proprietário dos anúncios escolhidos (gasta crédito do Fisgar). |
| `fisguei.buscarAnuncios` | POST /api/fisguei/buscar-anuncios | Põe vários anúncios na fila de busca de dono. |
| `fisguei.buscar` | POST /api/fisguei/buscar | Busca no Fisgar a lista toda que está na tela. |
| `fisguei.buscarUm` | POST /api/fisguei/:id/buscar | Busca os dados do dono de um anúncio no Fisgar. |
| `fisguei.importar` | POST /api/fisguei/:id/importar | Importa o anúncio para a carteira como imóvel em captação. |
| `fisguei.captar` | POST /api/fisguei/:id/captar | Leva o anúncio para o Radar como oportunidade em contato. |
| `fisguei.descartar` | POST /api/fisguei/:id/descartar | Descarta o anúncio (vale para todas as imobiliárias da base comum). |
| `fisguei.pausar` | POST /api/fisguei/:id/pausar | Pausa o robô naquele endereço. |
| `fisguei.consultarPessoa` | POST /api/fisguei/pessoas/:pid/consultar | Consulta uma pessoa no Fisgar · 1 crédito. |
| `fisguei.mensagemPessoa` | POST /api/fisguei/pessoas/:pid/mensagem | Manda mensagem de WhatsApp para a pessoa pela linha do robô. |
| `fisguei.statusPessoa` | POST /api/fisguei/pessoas/:pid/status | Marca a situação da pessoa (confirmou, não é dono, parar…). |
| `fisguei.pedidos` | GET /api/fisguei/pedidos | Fila de buscas no Fisgar e o que cada uma devolveu. |
| `fisguei.limites` | POST /api/fisguei/pedidos/limites | Muda os limites de crédito por dia e de consultas por endereço. |
| `fisguei.robo` | GET /api/fisguei/robo | Robô TH-IA-GO: situação, QR code e limites. |
| `fisguei.roboAjustes` | POST /api/fisguei/robo | Muda os ajustes do robô (intervalo, limite por dia, horário, mensagem). |
| `fisguei.roboComando` | POST /api/fisguei/robo/comando | Liga, desliga, reinicia ou desconecta a linha do robô. |
| `fisguei.chave` | POST /api/fisguei/chave | Gera a chave da extensão do Chrome (o banco guarda só o hash). |
| `captacao.painel` | GET /api/captacao/painel | Painel da captação: robô, "precisa de você", funil do anúncio até a captação. |
| `mercado.resumo` | GET /api/mercado/resumo | Bairros da base com quantidade, mediana, R$/m² e particulares. |
| `mercado.ruas` | GET /api/mercado/ruas | Ruas de um bairro com os números da base. |
| `mercado.imoveis` | GET /api/mercado/imoveis | Anúncios da vitrine (apartamentos, casas, terrenos, salas) com foto e situação. |
| `mercado.mapa` | GET /api/mercado/mapa | Os anúncios da vitrine em pontos para o mapa. |
| `mercado.busca` | GET /api/mercado/busca | Busca na base inteira por código, dono, telefone, rua, bairro, anunciante ou condomínio. |
| `mercado.iguais` | GET /api/mercado/iguais/:id | Outros anúncios do mesmo imóvel (imobiliárias diferentes). |
| `mercado.perto` | GET /api/mercado/perto/:id | O que tem perto do anúncio (pontos de interesse). |
| `mercado.cena3d` | GET /api/mercado/3d/:id | Dados do 3D da rua do anúncio. |
| `mercado.fachada` | GET /api/fachada | Foto da fachada pelo Google Street View (paga uma vez por endereço). |
| `mercado.mapasConfig` | GET /api/mapas/config | Se há chave do Google Maps (3D realista e fachada). |
| `extensao.receber` | POST /fisguei-api/receber | A extensão do Chrome entrega o que o painel do Fisgar recebeu. *(entrada extensao)* |
| `extensao.proximoPedido` | GET /fisguei-api/pedidos/proximo | A extensão pergunta qual é a próxima busca da fila. *(entrada extensao)* |
| `extensao.resultado` | POST /fisguei-api/pedidos/:id/resultado | A extensão devolve o resultado da busca no Fisgar. *(entrada extensao)* |

## escopo `condominios`

| ação | rota | o que faz |
|---|---|---|
| `condominios.listar` | GET /api/condominios | Condomínios e prédios da base, com à venda agora e anúncios em 90 dias. |
| `condominios.ver` | GET /api/condominios/:id | Raio-X do prédio: andares, unidades, taxas, imobiliárias anunciando, lazer. |
| `condominios.alterar` | PUT /api/condominios/:id | Corrige dados do condomínio (nome, posição no mapa, prédio-alvo). |
| `condominios.mapa` | GET /api/condominios/mapa | Condomínios em pontos para o mapa. |
| `condominios.bairros` | GET /api/condominios/bairros | Bairros com contagem de condomínios. |
| `condominios.perto` | GET /api/condominios/:id/perto | O que tem perto do condomínio (escolas, mercados, parques). |
| `condominios.cena3d` | GET /api/condominios/:id/3d | Dados do 3D do prédio e do entorno. |
| `condominios.reconhecer` | GET /api/condominios/reconhecer | Reconhece o condomínio pelo endereço (CEP+número, rua+número, ponto ou nome). |
| `condominios.alertas` | GET /api/condominios/alertas | Anúncios novos em prédios-alvo. |
| `condominios.alertasVisto` | POST /api/condominios/alertas/visto | Marca os alertas de prédio-alvo como vistos. |
| `condominios.vincular` | POST /api/condominios/vincular | Liga anúncios novos do Radar/Fisguei aos condomínios. |
| `publico.condominiosApi` | GET /api/publico/condominios | API das páginas públicas de condomínio. *(entrada publico)* |

## escopo `painel`

| ação | rota | o que faz |
|---|---|---|
| `painel.corretor` | GET /api/painel | Painel do corretor: seus imóveis, leads, visitas e avisos. |
| `painel.adm` | GET /api/painel/adm | Painel da imobiliária: "precisa de atenção", negócio, comercial, captação e gráficos. |
| `painel.auditoria` | GET /api/auditoria | Registro de tudo que foi feito no sistema (adm/gestor). |
| `conta.eu` | GET /api/me | Quem é o dono da chave ou da sessão (id, nome, perfil). |
| `ia.manifesto` | GET /api/ia/manifesto | Quem é esta instalação, o que a chave pode fazer e onde ficam os outros mapas. |
| `ia.acoes` | GET /api/ia/acoes | Catálogo de todas as ações do sistema (este registro). |
| `ia.ferramentas` | GET /api/ia/ferramentas.json | As mesmas ações em formato de ferramentas para LLM (Claude/OpenAI). |
| `ia.openapi` | GET /api/ia/openapi.json | OpenAPI 3.1 do sistema inteiro. |
| `ia.estado` | GET /api/ia/estado | Retrato do sistema agora: contagens, pendências, robôs, saúde. |
| `ia.eventos` | GET /api/ia/eventos | O que mudou desde um ponto (auditoria, leads, mensagens) para o robô acompanhar. |
| `ia.executar` | POST /api/ia/executar | Executa qualquer ação deste catálogo pelo nome (uma ferramenta só para a IA). |

## escopo `escritorio`

| ação | rota | o que faz |
|---|---|---|
| `escritorio.planta` | GET /api/escritorio | Planta do escritório: agentes, números do dia, o que está acontecendo, o que aprovar. |
| `escritorio.agente` | GET /api/escritorio/:slug | Mesa do agente: setor, linha, limites e últimas conversas. |
| `escritorio.alterarAgente` | PUT /api/escritorio/:slug | Muda nome, setor, limites, modo e linha do agente. |
| `escritorio.alma` | GET /api/escritorio/:slug/alma.soul | Texto da alma (.soul) do agente — as instruções dele. |
| `escritorio.gravarAlma` | PUT /api/escritorio/:slug/alma | Reescreve a alma do agente (fica no banco). |
| `escritorio.restaurarAlma` | POST /api/escritorio/:slug/alma/restaurar | Volta a alma padrão do arquivo .soul. |
| `escritorio.conversa` | GET /api/escritorio/:slug/conversa | Conversas do agente com clientes e donos. |
| `escritorio.comando` | POST /api/escritorio/:slug/comando | Conectar, desconectar, reiniciar a linha ou pedir o QR code do agente. |
| `escritorio.testar` | POST /api/escritorio/:slug/teste | Conversa de teste com o agente (responde na hora pela IA). |
| `escritorio.verTeste` | GET /api/escritorio/:slug/teste | Mensagens da conversa de teste. |
| `escritorio.limparTeste` | DELETE /api/escritorio/:slug/teste | Apaga a conversa de teste. |
| `escritorio.aprovar` | POST /api/escritorio/saidas/:id/aprovar | Aprova e envia uma mensagem que o agente sugeriu. |
| `escritorio.descartar` | POST /api/escritorio/saidas/:id/descartar | Descarta a mensagem sugerida pelo agente. |
| `escritorio.afazeres` | GET /api/escritorio/afazeres | Afazeres criados pelos agentes para a equipe. |
| `escritorio.criarAfazer` | POST /api/escritorio/afazeres | Cria um afazer para um corretor. |
| `escritorio.afazerFeito` | POST /api/escritorio/afazeres/:id/feito | Marca o afazer como feito. |
| `escritorio.aoVivo` | GET /api/escritorio/ao-vivo | O que está acontecendo agora no escritório (para a planta e o 3D). |
| `escritorio.relatorio` | GET /api/escritorio/relatorio | Relatório do dia que o gerente manda ao dono. |
| `escritorio.mandarRelatorio` | POST /api/escritorio/relatorio | Manda o relatório agora pelo WhatsApp do gerente. |
| `escritorio.config` | GET /api/escritorio/config | Configuração geral do escritório (IA, linha do sistema, regras). |
| `escritorio.geral` | PUT /api/escritorio/geral | Muda as regras gerais do escritório e a linha do sistema. |
| `escritorio.gravarIA` | PUT /api/escritorio/config/ia | Grava a chave da IA da imobiliária (cifrada no banco). |
| `escritorio.testarIA` | POST /api/escritorio/config/ia/testar | Testa a chave de IA e lista os modelos disponíveis. |
| `escritorio.midia` | GET /api/escritorio/midias/:id | Baixa uma foto que o dono mandou ao agente. |
| `escritorio.midiaParaImovel` | POST /api/escritorio/midias/:id/imovel | Leva a foto do dono para a pasta do imóvel. |
| `estacao.situacao` | GET /api/estacao | Situação da estação e de cada PC virtual (ligado, tela, túnel). |
| `estacao.passe` | POST /api/estacao/passe | Passe assinado de 10 minutos para a tela abrir o PC do agente. |
| `estacao.comando` | POST /api/estacao/comando | Liga, desliga ou reinicia o PC de um agente; manda ler as não lidas. |
| `estacao.tarefas` | POST /api/estacao/tarefas | Dá uma tarefa ao PC do agente (a IA opera o Chrome e responde pelo WhatsApp). |
| `estacao.verTarefa` | GET /api/estacao/tarefas/:id | Passo a passo e resultado da tarefa. |
| `estacao.cancelarTarefa` | POST /api/estacao/tarefas/:id/cancelar | Cancela a tarefa em andamento. |
| `estacao.chave` | POST /api/estacao/chave | Gera a chave da estação desta imobiliária (cifrada no banco). |
| `estacao.gravarIA` | PUT /api/estacao/ia | Escolhe o cérebro dos PCs virtuais (Claude central, Gemini, OpenAI-compatível, Ollama). |
| `estacao.testarIA` | POST /api/estacao/ia/testar | Testa o cérebro escolhido para os PCs. |
| `estacaoRobo.batida` | POST /estacao-api/batida | A estação dos PCs virtuais bate ponto a cada 8 s. *(entrada estacao)* |
| `estacaoRobo.config` | GET /estacao-api/config | A estação lê quais PCs e linhas de WhatsApp manter. *(entrada estacao)* |
| `estacaoRobo.entrada` | POST /estacao-api/wa-entrada | Mensagem que chegou no WhatsApp Web de um PC virtual. *(entrada estacao)* |
| `estacaoRobo.saida` | POST /estacao-api/wa-saida/:id | A estação confirma o envio de uma mensagem. *(entrada estacao)* |
| `estacaoRobo.tarefa` | POST /estacao-api/tarefa/:id | A estação devolve o passo a passo e o resultado da tarefa. *(entrada estacao)* |
| `estacaoRobo.ciclo` | POST /estacao-api/ciclo | A estação pede um ciclo do cérebro dos PCs. *(entrada estacao)* |
| `ciclos.escritorio` | POST /escritorio-ciclo | Ciclo do cérebro do escritório (agendador do Supabase ou o PC). *(entrada token)* |

## escopo `conteudo`

| ação | rota | o que faz |
|---|---|---|
| `portal.situacao` | GET /api/portal | Situação da página de cada imóvel no portal (no ar, na fila, desatualizada). |
| `portal.legenda` | GET /api/portal/:codigo/redes | Legenda e hashtags prontas do imóvel para as redes. |
| `blog.situacao` | GET /api/blog | Situação do blog: textos agendados, publicados e sem foto de capa. |
| `blog.legenda` | GET /api/blog/:slug/redes | Legenda e hashtags do texto do blog para as redes. |
| `bairros.listar` | GET /api/bairros | Guias de bairro: situação, fila, prioridade e sugestões dos cadastros. |
| `bairros.criar` | POST /api/bairros | Acrescenta um bairro à lista de guias. |
| `bairros.alterar` | PUT /api/bairros/:slug | Muda nome, região, apelidos, notas, centro, prioridade ou situação do guia. |
| `bairros.apelido` | POST /api/bairros/:slug/apelido | Liga outro nome ao mesmo bairro. |
| `bairros.reescrever` | POST /api/bairros/:slug/reescrever | Põe o guia na fila para ser reescrito. |
| `bairros.atualizar` | POST /api/bairros/atualizar | Relê agora o conteúdo publicado dos guias. |
| `bairros.legenda` | GET /api/bairros/:slug/redes | Legenda do guia de bairro para as redes. |
| `redes.calendario` | GET /api/social | Calendário do mês com posts agendados, prontos e publicados. |
| `redes.resumo` | GET /api/social/resumo | Números das publicações e avisos das redes. |
| `redes.post` | GET /api/social/posts/:id | Um post: artes, legenda, hashtags, redes e prévia. |
| `redes.alterarPost` | PUT /api/social/posts/:id | Muda legenda, hashtags, data/hora e redes do post. |
| `redes.aprovarPost` | POST /api/social/posts/:id/aprovar | Aprova o post para sair no horário. |
| `redes.publicarAgora` | POST /api/social/posts/:id/publicar | Publica o post agora nas redes conectadas. |
| `redes.cancelarPost` | POST /api/social/posts/:id/cancelar | Tira o post do calendário. |
| `redes.restaurarPost` | POST /api/social/posts/:id/restaurar | Devolve o post cancelado ao calendário. |
| `redes.trocarImovel` | POST /api/social/posts/:id/trocar | Troca o imóvel do post por outro. |
| `redes.jaPostei` | POST /api/social/posts/:id/postado | Marca como postado à mão. |
| `redes.aprovarVarios` | POST /api/social/aprovar | Aprova vários posts de uma vez. |
| `redes.planejar` | POST /api/social/planejar | Monta de novo o calendário dos próximos 35 dias. |
| `redes.imoveis` | GET /api/social/imoveis | Imóveis que podem virar post (com página e foto). |
| `redes.postExtra` | POST /api/social/imoveis | Cria um post extra para os imóveis escolhidos. |
| `redes.contas` | GET /api/social/contas | Contas conectadas (Instagram, Facebook, Google Meu Negócio). |
| `redes.conectar` | GET /api/social/conectar/:rede | Começa a conexão com a rede (devolve o endereço de autorização). |
| `redes.ativarConta` | POST /api/social/contas/:id/ativar | Liga ou desliga uma conta conectada. |
| `redes.apagarConta` | DELETE /api/social/contas/:id | Desconecta a conta da rede. |
| `redes.ajustes` | PUT /api/social/ajustes | Cadência, horários e se os posts saem sozinhos ou esperam aprovação. |
| `publico.imoveis` | GET /imoveis/dados.json | Ficha ao vivo dos imóveis publicados no portal (JSON público). *(entrada publico)* |
| `publico.portalApi` | GET /api/publico/portal | API do portal do visitante (vitrine, filtros, favoritos). *(entrada publico)* |
| `publico.blogApi` | GET /api/publico/blog | API do blog público. *(entrada publico)* |
| `publico.bairrosApi` | GET /api/publico/bairros | API dos guias de bairro. *(entrada publico)* |
| `ciclos.social` | POST /social-ciclo | Ciclo das publicações nas redes (a cada 10 min). *(entrada token)* |

## escopo `sql`

| ação | rota | o que faz |
|---|---|---|
| `ia.esquema` | GET /api/ia/esquema | Tabelas e colunas do banco desta imobiliária. |
| `ia.consulta` | POST /api/ia/consulta | Consulta SELECT de leitura ao banco, com limite automático. |
