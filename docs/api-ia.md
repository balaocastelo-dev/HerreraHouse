# Controle do sistema por IA — como funciona por dentro

Resumo técnico. O catálogo das rotas está em [api.md](api.md).

## Peças
| arquivo | o que é |
|---|---|
| `src/api-ia/chaves.js` | cria, confere e revoga chaves; mapa caminho → escopo; limite por minuto; registro de uso |
| `src/api-ia/registro.js` | catálogo das ações (232, sendo 209 por chave) e os geradores de OpenAPI e de ferramentas de LLM |
| `src/api-ia/index.js` | middleware `porChave` + rotas `/api/chaves` e `/api/ia/*` |
| `scripts/api-chave.js` | cria/lista/revoga chave pelo PC |
| `scripts/mcp-herrera.mjs` | servidor MCP (Node puro, sem dependência) que publica as ações como ferramentas |
| `sql/api-ia.sql` | tabelas `api_chaves` e `api_log` em todos os schemas (migração `api_ia_chaves` já aplicada no Supabase) |
| `test/api-ia.js` | teste ponta a ponta (entrou no `npm test`) |

## Como a chave entra
`server.js` monta `apiIA.porChave` em `/api` e `/gestor-api` **antes** do `mesmaOrigem`. A chave resolve o
usuário (`req.usuario`) e marca `req.apiChave`; daí:
- `auth.exigeLogin` devolve na hora se `req.usuario` já existe;
- `auth.mesmaOrigem` pula o CSRF quando há `req.apiChave` (não é navegador).

Nada mais no sistema precisou mudar: as 209 rotas passaram a aceitar chave sem reescrever handler nenhum.
Permissão continua sendo a do usuário dono da chave (`exigePerfil`, `veTudo`, filtro por corretor), e o escopo
só diminui. Segurança: hash SHA-256 da chave, comparação em tempo constante, prazo, lista de IP,
somente-leitura, limite por minuto e registro de cada chamada.

## Rotas novas
`/api/chaves` (listar, criar, revogar, log) e `/api/ia/*`: `manifesto`, `acoes`, `ferramentas.json`,
`openapi.json`, `estado`, `eventos`, `executar`, `esquema`, `consulta`, `config`.

`POST /api/ia/executar` acha a ação no registro, monta o caminho e chama o próprio sistema
(`127.0.0.1:PORT` no PC, o próprio host na Vercel) repassando a chave — por isso vale exatamente a mesma
permissão da chamada direta.

`POST /api/ia/consulta` (só adm e gestor) aceita um `SELECT` ou `WITH … SELECT` por vez, sem comentário e sem segundo comando. Recusa escrita, função perigosa (`pg_sleep`, `pg_read_file`, `lo_*`, `dblink`, `copy`, `set_config`, `pg_terminate_backend` e afins) e tabela fora da imobiliária. Força `LIMIT` de no máximo 500. No Postgres roda em transação só de leitura com tempo limite; no SQLite do PC a conexão fica `query_only` durante a consulta.

## Ressalva: painel do gestor
`porChave` está montado em `/gestor-api`, mas a chave pertence a um usuário da imobiliária, e o invólucro
`exige` de `src/plataforma/gestor.js` continua pedindo o cookie `gestor_sessao` (tabela `plataforma.gestores`).
Na prática, o escopo `plataforma` está reservado: o painel do gestor só abre pelo login dele. Para abrir por
chave seria preciso uma chave do gestor da plataforma, no cofre `plataforma.config`.

## Tela (Sistema › Configurações)
Só o perfil **adm** vê a seção "Chaves de API" em `#/configuracoes` (`public/chaves.js`). Gestor e corretor não veem a seção. As rotas continuam como estavam: adm e gestor podem listar, criar, revogar e ler o log; o corretor recebe 403.

A lista mostra nome, prefixo, escopos, só leitura, limite por minuto, IPs, validade, último uso e situação (ativa, vencida ou revogada). **Revogar** pede confirmação e chama `DELETE /api/chaves/:id`. **Chamadas** abre o `api_log` daquela chave (`GET /api/chaves/log?chave_id=`).

O formulário pede nome, caixas de escopo (`imoveis`, `crm`, `captacao`, `condominios`, `conteudo`, `escritorio`, `painel`, `config`, `sql`), somente leitura, limite por minuto (padrão **60**) e validade em dias (padrão **90**). A lista de IPs é opcional. A caixa **plataforma** só aparece para o gestor da plataforma: o e-mail do administrador é o de um gestor ativo em `plataforma.gestores`, ou existe sessão do painel (`gestor_sessao`) no mesmo endereço. Sem nenhuma caixa marcada, a chave recebe todos os escopos que essa pessoa pode conceder — e isso não inclui `plataforma`, a menos que a caixa esteja na tela.

Na criação, a chave aparece uma única vez num modal com botão **Copiar** e o aviso de que ela não aparece de novo. Clicar fora ou apertar Esc não fecha esse modal; só o botão Fechar.

Pela API, pedir o escopo `plataforma` sem ser gestor da plataforma responde **403**. O padrão da API, quando o campo não vem, continua outro: limite 300 por minuto e sem prazo. A tela é que manda 60 e 90.

## O que falta (opcional)
- Chave do gestor da plataforma para `/gestor-api/*`.
- Webhooks de saída (hoje a IA acompanha por `GET /api/ia/eventos?desde=`).
