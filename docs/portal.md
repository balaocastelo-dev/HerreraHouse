# Portal de imóveis — o site do visitante

O portal público da imobiliária fica em `/imoveis` do Herrera HOUSE IA (online: o endereço da imobiliária, em /imoveis;
no PC: http://localhost:3333/imoveis). Sem login. Montado em 26/10/2026 no mesmo esquema do blog
(guia `BLOG-AUTONOMO-COMO-RECRIAR.md`).

O visitante vê os imóveis, filtra, guarda favoritos, abre a **página única** de cada imóvel, fala com o corretor
(formulário ou WhatsApp) e pede visita. Todo contato vira lead no CRM com origem **Portal da imobiliária** ("Portal " + nome do cliente).

## A regra que não muda

**Nenhum imóvel aparece no portal sem a página aprovada.** E a página nunca contradiz a ficha:
valor, áreas, quartos, suítes e vagas vêm do banco, ao vivo; se a ficha mudar e o texto passar a discordar,
a página sai do ar até ser reescrita.

## As peças

| Peça | Onde | O que faz |
|---|---|---|
| Páginas | `src/routes/portal.js`, `src/portal/paginas.js`, `public/portal-assets/` | `/imoveis` (vitrine, busca, filtros), `/imoveis/<endereço>` (página do imóvel), `/imoveis/favoritos`, `/imoveis/foto/<n>`. HTML montado no servidor, JSON-LD (`RealEstateListing`, `FAQPage`), Open Graph. |
| Ficha ao vivo | `src/portal/dados.js` | Imóveis com status **publicado** e foto. Nunca saem: rua, número, unidade, CEP, coordenadas, proprietário. Calcula a "versão" (o que a página usou: ficha, descrição e fotos — o preço não entra). |
| Junta tudo | `src/portal/fonte.js` | Lê o ramo `claude/portal-conteudo` (cache de 10 min, cópia em `data/portal-cache`), confere formato e régua contra a ficha de agora e decide o que está no ar. |
| Formato e régua | `src/portal/validar.js`, `src/portal/regua.js` | O mesmo código no comando de publicar e no site. |
| Comando | `scripts/portal-publicar.mjs` | Única porta de entrada: `preparar` (fila + fotos em /tmp/portal), `conferir`, `publicar`, `listar`, `retirar`. |
| Ramo de conteúdo | `claude/portal-conteudo` em `balaocastelo-dev/Corretordofuturo.app` | `indice.json`, `paginas/<CÓDIGO>.json` e `ROTINA.md` (as regras de quem escreve). |
| Para quem escreve | `/imoveis/dados.json` | A ficha, as fotos e o estado da página de cada imóvel à venda. |
| Rotina na nuvem | tarefa agendada "Portal da imobiliária - páginas dos imóveis" | Pega os próximos da fila, olha as fotos, escreve, confere e publica. |
| Contato | `POST /api/publico/portal/interesse` | Lead quente no CRM (mesmo telefone não duplica), interação com o imóvel, a mensagem e o pedido de visita. Armadilha de robô e limite por IP. |
| Tela no sistema | menu Conteúdo › Portal de imóveis | A situação da página de cada imóvel e "Copiar legenda" para as redes. |

Estados da página: **no ar**; **desatualizada** (no ar, mas a ficha ou as fotos mudaram: entra na fila);
**esperando a página**; **reprovada** (fora do ar: o texto contradiz a ficha ou o arquivo está errado; entra na fila).

## Configuração (.env e Vercel)

```
PORTAL=true          # false tira todos os imóveis do portal sem apagar nada
PORTAL_URL=          # endereço público (domínio). Vazio = o de quem acessa. O comando usa 
WHATSAPP_CLIENTE=    # botão "Falar no WhatsApp" quando o imóvel não tem corretor com celular
BLOG_CRECI=          # aparece no rodapé
```

O corretor aparece com nome e WhatsApp quando o imóvel está com um usuário de perfil **corretor** que tem telefone.
Sem isso, a página mostra "Equipe da imobiliária" (Equipe + nome do cliente) e o botão usa `WHATSAPP_CLIENTE`; sem número, fica só o formulário.

## Parar, pausar, tirar do ar

- Pausar a escrita: desligar a tarefa agendada (as páginas publicadas continuam).
- Tirar um imóvel do portal: mudar o status no sistema (vendido, suspenso…) — sai em até 2 minutos.
- Tirar uma página: `node scripts/portal-publicar.mjs retirar AP0029`.
- Tirar tudo: `PORTAL=false` na Vercel e no .env.

## Teste

`node test/portal.js` — banco temporário, ramo falso: régua contra a ficha, "sem página não aparece",
ficha que muda derruba a página, foto só de imóvel à venda, formulário vira lead, robots e sitemap.
