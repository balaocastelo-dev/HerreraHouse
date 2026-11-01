// Registro das ações do sistema: o mapa que as IAs leem.
// Cada linha: [ação, método, caminho, escopo, o que faz, corpo, querystring, entrada?]
//   campo*  = obrigatório · campo:n = número · campo:b = sim/não · campo:l = lista
//   auth:   'chave' (padrão) = chave de API ou sessão · 'publico' · 'extensao' · 'estacao' · 'gestor' · 'token'
const L = [
  // ---------------- carteira de imóveis ----------------
  ['imoveis.listar', 'GET', '/api/imoveis', 'imoveis', 'Lista a carteira (cards/tabela) com filtros e etapa de cada imóvel.', '', 'q,status,tipo,bairro,corretor_id:n,etapa,negocio,origem,exclusividade,ficha,portal,dono,ordem,limite:n'],
  ['imoveis.ver', 'GET', '/api/imoveis/:id', 'imoveis', 'Ficha completa do imóvel, com proprietário, condomínio e etapa.'],
  ['imoveis.criar', 'POST', '/api/imoveis', 'imoveis', 'Cadastra um imóvel na carteira e gera o código (AP0001, CA0002…).', 'tipo*,status,finalidade,cep,logradouro,numero,unidade,bairro,cidade,uf,lat:n,lon:n,quartos:n,suites:n,vagas:n,area_util:n,area_total:n,valor:n,valor_locacao:n,valor_condominio:n,iptu:n,descricao,exclusivo:b,exclusivo_ate,corretor_id:n,proprietario'],
  ['imoveis.alterar', 'PUT', '/api/imoveis/:id', 'imoveis', 'Altera os dados do imóvel (mesmos campos do cadastro).', 'tipo,status,finalidade,cep,logradouro,numero,unidade,bairro,cidade,uf,quartos:n,suites:n,vagas:n,area_util:n,area_total:n,valor:n,valor_locacao:n,valor_condominio:n,iptu:n,descricao,exclusivo:b,exclusivo_ate,corretor_id:n,proprietario'],
  ['imoveis.status', 'PATCH', '/api/imoveis/:id/status', 'imoveis', 'Muda o status (captação, publicado, off_market, vendido, alugado…). Fica na auditoria.', 'status*'],
  ['imoveis.tipos', 'GET', '/api/imoveis/tipos', 'imoveis', 'Tipos e status aceitos pelo cadastro.'],
  ['imoveis.endereco', 'GET', '/api/imoveis/endereco', 'imoveis', 'Procura o endereço pelo CEP (ViaCEP) e reconhece o condomínio da base.', '', 'cep,logradouro,numero,bairro'],
  ['imoveis.arquivos', 'GET', '/api/imoveis/:id/arquivos', 'imoveis', 'Lista os arquivos do imóvel nas 7 pastas (fotos, documentos, fotos internas…).'],
  ['imoveis.enviarArquivo', 'POST', '/api/imoveis/:id/arquivos', 'imoveis', 'Envia um arquivo para uma pasta do imóvel (multipart/form-data).', 'arquivo*,categoria'],
  ['imoveis.compradores', 'GET', '/api/imoveis/:id/compradores', 'imoveis', 'Leads que combinam com o imóvel (match comprador × imóvel).'],
  ['imoveis.links', 'GET', '/api/imoveis/:id/links', 'imoveis', 'Links off-market criados para o imóvel e os acessos de cada um.'],
  ['imoveis.criarLink', 'POST', '/api/imoveis/:id/links', 'imoveis', 'Cria um link interno off-market com validade.', 'dias:n,observacao'],
  ['imoveis.apagarLink', 'DELETE', '/api/imoveis/:id/links/:lid', 'imoveis', 'Apaga um link off-market.'],
  ['imoveis.autorizacoes', 'GET', '/api/imoveis/:id/autorizacoes', 'imoveis', 'Autorizações de venda do imóvel e a situação da assinatura.'],
  ['imoveis.autorizacao', 'POST', '/api/imoveis/:id/autorizacao', 'imoveis', 'Gera a autorização de venda e o link de assinatura eletrônica do proprietário.', 'exclusividade:b,dias:n,comissao:n'],
  ['imoveis.cancelarAutorizacao', 'POST', '/api/imoveis/:id/autorizacoes/:aid/cancelar', 'imoveis', 'Cancela uma autorização pendente.'],
  ['imoveis.drivePasta', 'POST', '/api/imoveis/:id/drive/pasta', 'imoveis', 'Cria (ou refaz) a pasta do imóvel no Google Drive.'],
  ['imoveis.dadosFisgar', 'GET', '/api/imoveis/:id/fisgar', 'imoveis', 'Pessoas, telefones e situação no robô para o imóvel, vindos do Fisgar.'],
  ['imoveis.localizarDono', 'POST', '/api/imoveis/:id/localizar-dono', 'imoveis', 'Põe o imóvel na fila do Fisgar para achar o proprietário (gasta crédito).'],
  ['imoveis.localizarDonoLote', 'POST', '/api/imoveis/localizar-dono', 'imoveis', 'Mesma busca para vários imóveis sem dono (até 200).', 'ids:l,etapa'],
  ['arquivos.baixar', 'GET', '/api/arquivos/:id', 'imoveis', 'Baixa um arquivo do sistema (foto, documento, PDF).'],
  ['drive.conectar', 'GET', '/api/drive/conectar', 'config', 'Começa a conexão com o Google Drive (devolve o endereço de autorização).'],
  ['drive.desconectar', 'POST', '/api/drive/desconectar', 'config', 'Desliga o Google Drive.'],
  ['drive.enviarPendentes', 'POST', '/api/drive/enviar-pendentes', 'imoveis', 'Manda ao Drive os arquivos que ficaram para trás.'],
  ['drive.arquivo', 'GET', '/api/drive/arquivo/:imovelId/:fileId', 'imoveis', 'Baixa um arquivo que está no Drive do imóvel.'],

  // ---------------- CRM ----------------
  ['leads.listar', 'GET', '/api/leads', 'crm', 'Lista os leads do funil, com etapa, temperatura e corretor.', '', 'q,etapa,temperatura,origem,corretor_id:n,limite:n'],
  ['leads.ver', 'GET', '/api/leads/:id', 'crm', 'Ficha do lead com histórico, visitas e imóveis que combinam.'],
  ['leads.criar', 'POST', '/api/leads', 'crm', 'Cria um lead no CRM.', 'nome*,telefone,email,origem,etapa,temperatura,corretor_id:n,busca,tipo_desejado,quartos_min:n,vagas_min:n,valor_max:n,bairros'],
  ['leads.alterar', 'PUT', '/api/leads/:id', 'crm', 'Altera os dados do lead.', 'nome,telefone,email,origem,temperatura,corretor_id:n,busca,tipo_desejado,quartos_min:n,vagas_min:n,valor_max:n,bairros,nao_contatar:b'],
  ['leads.etapa', 'PATCH', '/api/leads/:id/etapa', 'crm', 'Move o lead no funil (novo, qualificado, visita, proposta, escritura, perdido).', 'etapa*'],
  ['leads.nota', 'POST', '/api/leads/:id/nota', 'crm', 'Registra uma anotação no histórico do lead.', 'texto*'],
  ['visitas.listar', 'GET', '/api/visitas', 'crm', 'Visitas agendadas, com imóvel, lead e confirmação.', '', 'de,ate,corretor_id:n,situacao'],
  ['visitas.criar', 'POST', '/api/visitas', 'crm', 'Agenda uma visita de um lead a um imóvel.', 'lead_id:n*,imovel_id:n*,quando*,observacao'],
  ['visitas.alterar', 'PATCH', '/api/visitas/:id', 'crm', 'Confirma, remarca ou cancela a visita.', 'situacao,quando,observacao'],
  ['whats.conversas', 'GET', '/api/whats', 'crm', 'Conversas de WhatsApp do CRM, com quem está esperando resposta.'],
  ['whats.conversa', 'GET', '/api/whats/:leadId', 'crm', 'Mensagens trocadas com um lead.'],
  ['whats.sugerir', 'POST', '/api/whats/:leadId/sugerir', 'crm', 'Pede à IA uma sugestão de resposta para o corretor aprovar.', 'texto'],
  ['whats.enviar', 'POST', '/api/whats/:leadId/enviar', 'crm', 'Envia a mensagem de WhatsApp ao lead.', 'texto*'],
  ['whats.simular', 'POST', '/api/whats/simular', 'crm', 'Simula a chegada de uma mensagem (modo de teste, sem WhatsApp real).', 'telefone*,nome,texto*'],
  ['chat.caixa', 'GET', '/api/chat/caixa', 'crm', 'Caixa de entrada do chat interno (conversas e não lidas).'],
  ['chat.conversa', 'GET', '/api/chat/conversas/:id', 'crm', 'Mensagens de uma conversa do chat interno.', '', 'desde:n'],
  ['chat.criarConversa', 'POST', '/api/chat/conversas', 'crm', 'Abre conversa direta ou sala de reunião com pessoas e robôs escolhidos.', 'tipo,titulo,com:l,agente'],
  ['chat.enviar', 'POST', '/api/chat/conversas/:id/mensagens', 'crm', 'Manda uma mensagem no chat interno (serve para dar ordem a um robô).', 'texto*,tipo'],
  ['chat.novidades', 'GET', '/api/chat/novidades', 'crm', 'O que chegou desde a última leitura (para avisos).', '', 'desde:n'],

  // ---------------- captação: radar ----------------
  ['radar.listar', 'GET', '/api/radar', 'captacao', 'Oportunidades do radar (anúncios de portais), com situação e prioridade.', '', 'q,situacao,bairro,portal,corretor_id:n,limite:n'],
  ['radar.ver', 'GET', '/api/radar/:id', 'captacao', 'Ficha da oportunidade, com eventos, cartas e dados do anúncio.'],
  ['radar.criar', 'POST', '/api/radar', 'captacao', 'Cria uma oportunidade de captação à mão.', 'titulo,tipo,bairro,logradouro,numero,valor:n,telefone,portal,link,observacao'],
  ['radar.alterar', 'PUT', '/api/radar/:id', 'captacao', 'Altera a oportunidade.', 'titulo,tipo,bairro,logradouro,numero,valor:n,telefone,observacao'],
  ['radar.resumo', 'GET', '/api/radar/resumo', 'captacao', 'Números do radar: por situação, por portal e o que precisa de atenção.'],
  ['radar.assumir', 'POST', '/api/radar/:id/assumir', 'captacao', 'Assume a oportunidade para um corretor.', 'corretor_id:n'],
  ['radar.evento', 'POST', '/api/radar/:id/evento', 'captacao', 'Registra um passo da cascata de contato (ligação, visita, portaria…).', 'tipo*,detalhe'],
  ['radar.descartar', 'POST', '/api/radar/:id/descartar', 'captacao', 'Descarta a oportunidade.', 'motivo'],
  ['radar.reabrir', 'POST', '/api/radar/:id/reabrir', 'captacao', 'Reabre uma oportunidade descartada.'],
  ['radar.converter', 'POST', '/api/radar/:id/converter', 'captacao', 'Transforma a oportunidade em imóvel em captação na carteira.'],
  ['radar.carta', 'GET', '/api/radar/:id/carta.pdf', 'captacao', 'Carta ao proprietário em PDF, com QR code do WhatsApp.'],
  ['radar.cartas', 'GET', '/api/radar/cartas.pdf', 'captacao', 'Várias cartas num PDF só.', '', 'ids'],
  ['radar.cartaEnviada', 'POST', '/api/radar/:id/carta-enviada', 'captacao', 'Marca que a carta foi postada.'],
  ['radar.cartasEnviadas', 'POST', '/api/radar/cartas-enviadas', 'captacao', 'Marca várias cartas como enviadas.', 'ids:l*'],
  ['radar.matricula', 'POST', '/api/radar/:id/matricula', 'captacao', 'Pede a consulta paga de matrícula (precisa de aprovação do gestor).', 'observacao'],
  ['radar.biro', 'POST', '/api/radar/:id/biro', 'captacao', 'Pede a consulta paga ao birô de dados (precisa de aprovação do gestor).', 'observacao'],
  ['radar.aprovacao', 'POST', '/api/radar/:id/aprovacao', 'captacao', 'Abre um pedido de aprovação de gasto para a oportunidade.', 'tipo*,valor:n,observacao'],
  ['radar.aprovacoes', 'GET', '/api/radar/aprovacoes', 'captacao', 'Consultas pagas esperando decisão do gestor.'],
  ['radar.decidir', 'POST', '/api/radar/aprovacoes/:aid/decidir', 'captacao', 'Aprova ou recusa a consulta paga.', 'decisao*,observacao'],
  ['radar.alertas', 'GET', '/api/radar/alertas', 'captacao', 'Situação do radar automático (e-mails dos portais e monitor direto).'],
  ['radar.lerAlertas', 'POST', '/api/radar/alertas/ler', 'captacao', 'Lê agora a caixa de e-mail dos alertas dos portais (roda no PC).'],
  ['radar.lerPortais', 'POST', '/api/radar/portais/ler', 'captacao', 'Roda agora o monitor direto dos portais (roda no PC).'],

  // ---------------- captação: Fisguei (base de anúncios e proprietários) ----------------
  ['fisguei.listar', 'GET', '/api/fisguei', 'captacao', 'Anúncios da base com filtros (bairro, valor, dono, situação).', '', 'q,bairro,tipo,valor_min:n,valor_max:n,dono,situacao,limite:n,pagina:n'],
  ['fisguei.ver', 'GET', '/api/fisguei/:id', 'captacao', 'Ficha do anúncio: fotos, proprietários, telefones e histórico de preço.'],
  ['fisguei.explorar', 'GET', '/api/fisguei/explorar', 'captacao', 'Leitura da IA: sinais (queda de preço, novo, antigo, abaixo do bairro, particular) e nota de cada anúncio.', '', 'q,sinais,tipo,bairros,valor_min:n,valor_max:n,quartos:n,area_min:n,anunciante,andamento,ordem,limite:n'],
  ['fisguei.explorarMapa', 'GET', '/api/fisguei/explorar/mapa', 'captacao', 'Os mesmos anúncios da leitura da IA em pontos para o mapa.', '', 'q,sinais,tipo,bairros,valor_min:n,valor_max:n'],
  ['fisguei.mapa', 'GET', '/api/fisguei/mapa', 'captacao', 'Pontos da base no mapa (até 3.000).', '', 'q,bairro,valor_min:n,valor_max:n'],
  ['fisguei.resumo', 'GET', '/api/fisguei/resumo', 'captacao', 'Resumo da base para o selo do menu (anúncios, buscas, respostas).'],
  ['fisguei.radar', 'GET', '/api/fisguei/radar', 'captacao', 'Situação do robô e da extensão do Chrome.'],
  ['fisguei.creditos', 'GET', '/api/fisguei/creditos', 'captacao', 'Créditos do Fisgar: saldo, gasto do dia e do mês, ritmo.'],
  ['fisguei.corrigirCreditos', 'POST', '/api/fisguei/creditos', 'captacao', 'Corrige o saldo de créditos do Fisgar à mão (adm/gestor).', 'saldo:n*'],
  ['fisguei.localizar', 'POST', '/api/fisguei/localizar', 'captacao', 'Localiza o proprietário dos anúncios escolhidos (gasta crédito do Fisgar).', 'ids:l*'],
  ['fisguei.buscarAnuncios', 'POST', '/api/fisguei/buscar-anuncios', 'captacao', 'Põe vários anúncios na fila de busca de dono.', 'ids:l*'],
  ['fisguei.buscar', 'POST', '/api/fisguei/buscar', 'captacao', 'Busca no Fisgar a lista toda que está na tela.', 'filtros'],
  ['fisguei.buscarUm', 'POST', '/api/fisguei/:id/buscar', 'captacao', 'Busca os dados do dono de um anúncio no Fisgar.'],
  ['fisguei.importar', 'POST', '/api/fisguei/:id/importar', 'captacao', 'Importa o anúncio para a carteira como imóvel em captação.'],
  ['fisguei.captar', 'POST', '/api/fisguei/:id/captar', 'captacao', 'Leva o anúncio para o Radar como oportunidade em contato.'],
  ['fisguei.descartar', 'POST', '/api/fisguei/:id/descartar', 'captacao', 'Descarta o anúncio (vale para todas as imobiliárias da base comum).', 'motivo'],
  ['fisguei.pausar', 'POST', '/api/fisguei/:id/pausar', 'captacao', 'Pausa o robô naquele endereço.', 'pausado:b'],
  ['fisguei.consultarPessoa', 'POST', '/api/fisguei/pessoas/:pid/consultar', 'captacao', 'Consulta uma pessoa no Fisgar · 1 crédito.'],
  ['fisguei.mensagemPessoa', 'POST', '/api/fisguei/pessoas/:pid/mensagem', 'captacao', 'Manda mensagem de WhatsApp para a pessoa pela linha do robô.', 'texto*'],
  ['fisguei.statusPessoa', 'POST', '/api/fisguei/pessoas/:pid/status', 'captacao', 'Marca a situação da pessoa (confirmou, não é dono, parar…).', 'status*'],
  ['fisguei.pedidos', 'GET', '/api/fisguei/pedidos', 'captacao', 'Fila de buscas no Fisgar e o que cada uma devolveu.'],
  ['fisguei.limites', 'POST', '/api/fisguei/pedidos/limites', 'captacao', 'Muda os limites de crédito por dia e de consultas por endereço.', 'por_dia:n,por_endereco:n'],
  ['fisguei.robo', 'GET', '/api/fisguei/robo', 'captacao', 'Robô TH-IA-GO: situação, QR code e limites.'],
  ['fisguei.roboAjustes', 'POST', '/api/fisguei/robo', 'captacao', 'Muda os ajustes do robô (intervalo, limite por dia, horário, mensagem).', 'intervalo:n,por_dia:n,hora_de:n,hora_ate:n,modelo,modelo_locacao,ligado:b'],
  ['fisguei.roboComando', 'POST', '/api/fisguei/robo/comando', 'captacao', 'Liga, desliga, reinicia ou desconecta a linha do robô.', 'acao*'],
  ['fisguei.chave', 'POST', '/api/fisguei/chave', 'captacao', 'Gera a chave da extensão do Chrome (o banco guarda só o hash).'],
  ['captacao.painel', 'GET', '/api/captacao/painel', 'captacao', 'Painel da captação: robô, "precisa de você", funil do anúncio até a captação.', '', 'dias:n'],

  // ---------------- vitrines da base (mercado) ----------------
  ['mercado.resumo', 'GET', '/api/mercado/resumo', 'captacao', 'Bairros da base com quantidade, mediana, R$/m² e particulares.', '', 'vitrine,neg,valor_min:n,tipo,quartos:n,particular:b,ordem'],
  ['mercado.ruas', 'GET', '/api/mercado/ruas', 'captacao', 'Ruas de um bairro com os números da base.', '', 'bairro*,vitrine,neg,valor_min:n,ordem'],
  ['mercado.imoveis', 'GET', '/api/mercado/imoveis', 'captacao', 'Anúncios da vitrine (apartamentos, casas, terrenos, salas) com foto e situação.', '', 'bairro,rua,vitrine,neg,valor_min:n,valor_max:n,tipo,quartos:n,particular:b,ordem,limite:n,pagina:n'],
  ['mercado.mapa', 'GET', '/api/mercado/mapa', 'captacao', 'Os anúncios da vitrine em pontos para o mapa.', '', 'bairro,rua,vitrine,neg,valor_min:n'],
  ['mercado.busca', 'GET', '/api/mercado/busca', 'captacao', 'Busca na base inteira por código, dono, telefone, rua, bairro, anunciante ou condomínio.', '', 'q*'],
  ['mercado.iguais', 'GET', '/api/mercado/iguais/:id', 'captacao', 'Outros anúncios do mesmo imóvel (imobiliárias diferentes).'],
  ['mercado.perto', 'GET', '/api/mercado/perto/:id', 'captacao', 'O que tem perto do anúncio (pontos de interesse).'],
  ['mercado.cena3d', 'GET', '/api/mercado/3d/:id', 'captacao', 'Dados do 3D da rua do anúncio.'],
  ['mercado.fachada', 'GET', '/api/fachada', 'captacao', 'Foto da fachada pelo Google Street View (paga uma vez por endereço).', '', 'cep,logradouro,numero,lat:n,lon:n'],
  ['mercado.mapasConfig', 'GET', '/api/mapas/config', 'captacao', 'Se há chave do Google Maps (3D realista e fachada).'],

  // ---------------- condomínios ----------------
  ['condominios.listar', 'GET', '/api/condominios', 'condominios', 'Condomínios e prédios da base, com à venda agora e anúncios em 90 dias.', '', 'q,bairro,tipo,com_venda:b,alvo:b,ordem,limite:n,pagina:n'],
  ['condominios.ver', 'GET', '/api/condominios/:id', 'condominios', 'Raio-X do prédio: andares, unidades, taxas, imobiliárias anunciando, lazer.'],
  ['condominios.alterar', 'PUT', '/api/condominios/:id', 'condominios', 'Corrige dados do condomínio (nome, posição no mapa, prédio-alvo).', 'nome,bairro,lat:n,lon:n,andares:n,unidades:n,alvo:b,observacao'],
  ['condominios.mapa', 'GET', '/api/condominios/mapa', 'condominios', 'Condomínios em pontos para o mapa.', '', 'bairro,com_venda:b,alvo:b'],
  ['condominios.bairros', 'GET', '/api/condominios/bairros', 'condominios', 'Bairros com contagem de condomínios.'],
  ['condominios.perto', 'GET', '/api/condominios/:id/perto', 'condominios', 'O que tem perto do condomínio (escolas, mercados, parques).'],
  ['condominios.cena3d', 'GET', '/api/condominios/:id/3d', 'condominios', 'Dados do 3D do prédio e do entorno.', '', 'imovel:n'],
  ['condominios.reconhecer', 'GET', '/api/condominios/reconhecer', 'condominios', 'Reconhece o condomínio pelo endereço (CEP+número, rua+número, ponto ou nome).', '', 'cep,logradouro,numero,nome,lat:n,lon:n'],
  ['condominios.alertas', 'GET', '/api/condominios/alertas', 'condominios', 'Anúncios novos em prédios-alvo.'],
  ['condominios.alertasVisto', 'POST', '/api/condominios/alertas/visto', 'condominios', 'Marca os alertas de prédio-alvo como vistos.', 'ids:l'],
  ['condominios.vincular', 'POST', '/api/condominios/vincular', 'condominios', 'Liga anúncios novos do Radar/Fisguei aos condomínios.'],

  // ---------------- painéis e números ----------------
  ['painel.corretor', 'GET', '/api/painel', 'painel', 'Painel do corretor: seus imóveis, leads, visitas e avisos.'],
  ['painel.adm', 'GET', '/api/painel/adm', 'painel', 'Painel da imobiliária: "precisa de atenção", negócio, comercial, captação e gráficos.', '', 'periodo'],
  ['painel.auditoria', 'GET', '/api/auditoria', 'painel', 'Registro de tudo que foi feito no sistema (adm/gestor).', '', 'limite:n,usuario_id:n,acao'],
  ['painel.integracoes', 'GET', '/api/integracoes', 'config', 'Situação das integrações: Drive, WhatsApp, IA, Maps, radar.'],
  ['conta.eu', 'GET', '/api/me', 'painel', 'Quem é o dono da chave ou da sessão (id, nome, perfil).'],
  ['conta.senha', 'POST', '/api/me/senha', 'config', 'Troca a senha do próprio usuário.', 'atual*,nova*'],
  ['conta.telefone', 'POST', '/api/me/telefone', 'config', 'Grava o celular do usuário (liga o botão de WhatsApp do portal).', 'telefone*'],

  // ---------------- usuários e configuração ----------------
  ['usuarios.listar', 'GET', '/api/usuarios', 'config', 'Usuários do sistema (adm/gestor veem tudo).'],
  ['usuarios.criar', 'POST', '/api/usuarios', 'config', 'Cria um usuário (adm/gestor/corretor).', 'nome*,email*,senha*,perfil*,telefone'],
  ['usuarios.alterar', 'PATCH', '/api/usuarios/:id', 'config', 'Altera ou desativa um usuário.', 'nome,email,telefone,perfil,ativo:b,senha'],
  ['setup.precisa', 'GET', '/api/setup', 'config', 'Diz se o sistema ainda não tem administrador.', '', '', '', 'publico'],
  ['setup.criar', 'POST', '/api/setup', 'config', 'Cria o primeiro administrador (só no primeiro acesso).', 'nome*,email*,senha*,exemplo:b', '', '', 'publico'],
  ['config.ler', 'GET', '/api/ia/config', 'config', 'Lê as configurações guardadas no banco (segredos aparecem só pelos 4 últimos).', '', 'chave'],
  ['config.gravar', 'PUT', '/api/ia/config', 'config', 'Grava uma configuração do sistema no banco (adm).', 'chave*,valor'],

  // ---------------- LGPD ----------------
  ['lgpd.resumo', 'GET', '/api/lgpd/resumo', 'config', 'Pedidos de titulares em aberto e prazos.'],
  ['lgpd.pedidos', 'GET', '/api/lgpd/pedidos', 'config', 'Lista os pedidos de titulares (acesso, correção, eliminação, oposição).'],
  ['lgpd.atender', 'POST', '/api/lgpd/pedidos/:id/atender', 'config', 'Registra a resposta ao titular e fecha o pedido.', 'resposta*'],
  ['lgpd.naoContatar', 'POST', '/api/lgpd/nao-contatar', 'config', 'Põe um telefone na lista "não contatar" (vale em todas as imobiliárias).', 'telefone*,motivo'],
  ['lgpd.aceite', 'GET', '/api/lgpd/aceite', 'config', 'Diz se o usuário já aceitou os termos da versão atual.'],
  ['lgpd.aceitar', 'POST', '/api/lgpd/aceite', 'config', 'Registra o aceite dos termos pelo usuário.'],

  // ---------------- escritório virtual (agentes robôs) ----------------
  ['escritorio.planta', 'GET', '/api/escritorio', 'escritorio', 'Planta do escritório: agentes, números do dia, o que está acontecendo, o que aprovar.'],
  ['escritorio.agente', 'GET', '/api/escritorio/:slug', 'escritorio', 'Mesa do agente: setor, linha, limites e últimas conversas.'],
  ['escritorio.alterarAgente', 'PUT', '/api/escritorio/:slug', 'escritorio', 'Muda nome, setor, limites, modo e linha do agente.', 'nome,setor,modo,linha,ativo:b,limites'],
  ['escritorio.alma', 'GET', '/api/escritorio/:slug/alma.soul', 'escritorio', 'Texto da alma (.soul) do agente — as instruções dele.'],
  ['escritorio.gravarAlma', 'PUT', '/api/escritorio/:slug/alma', 'escritorio', 'Reescreve a alma do agente (fica no banco).', 'alma*'],
  ['escritorio.restaurarAlma', 'POST', '/api/escritorio/:slug/alma/restaurar', 'escritorio', 'Volta a alma padrão do arquivo .soul.'],
  ['escritorio.conversa', 'GET', '/api/escritorio/:slug/conversa', 'escritorio', 'Conversas do agente com clientes e donos.', '', 'telefone,limite:n'],
  ['escritorio.comando', 'POST', '/api/escritorio/:slug/comando', 'escritorio', 'Conectar, desconectar, reiniciar a linha ou pedir o QR code do agente.', 'acao*'],
  ['escritorio.testar', 'POST', '/api/escritorio/:slug/teste', 'escritorio', 'Conversa de teste com o agente (responde na hora pela IA).', 'texto*,telefone'],
  ['escritorio.verTeste', 'GET', '/api/escritorio/:slug/teste', 'escritorio', 'Mensagens da conversa de teste.'],
  ['escritorio.limparTeste', 'DELETE', '/api/escritorio/:slug/teste', 'escritorio', 'Apaga a conversa de teste.'],
  ['escritorio.aprovar', 'POST', '/api/escritorio/saidas/:id/aprovar', 'escritorio', 'Aprova e envia uma mensagem que o agente sugeriu.'],
  ['escritorio.descartar', 'POST', '/api/escritorio/saidas/:id/descartar', 'escritorio', 'Descarta a mensagem sugerida pelo agente.'],
  ['escritorio.afazeres', 'GET', '/api/escritorio/afazeres', 'escritorio', 'Afazeres criados pelos agentes para a equipe.'],
  ['escritorio.criarAfazer', 'POST', '/api/escritorio/afazeres', 'escritorio', 'Cria um afazer para um corretor.', 'texto*,para:n,prazo'],
  ['escritorio.afazerFeito', 'POST', '/api/escritorio/afazeres/:id/feito', 'escritorio', 'Marca o afazer como feito.'],
  ['escritorio.aoVivo', 'GET', '/api/escritorio/ao-vivo', 'escritorio', 'O que está acontecendo agora no escritório (para a planta e o 3D).'],
  ['escritorio.relatorio', 'GET', '/api/escritorio/relatorio', 'escritorio', 'Relatório do dia que o gerente manda ao dono.'],
  ['escritorio.mandarRelatorio', 'POST', '/api/escritorio/relatorio', 'escritorio', 'Manda o relatório agora pelo WhatsApp do gerente.'],
  ['escritorio.config', 'GET', '/api/escritorio/config', 'escritorio', 'Configuração geral do escritório (IA, linha do sistema, regras).'],
  ['escritorio.geral', 'PUT', '/api/escritorio/geral', 'escritorio', 'Muda as regras gerais do escritório e a linha do sistema.', 'linha_sistema,regras,horario'],
  ['escritorio.gravarIA', 'PUT', '/api/escritorio/config/ia', 'escritorio', 'Grava a chave da IA da imobiliária (cifrada no banco).', 'chave,modelo,provedor'],
  ['escritorio.testarIA', 'POST', '/api/escritorio/config/ia/testar', 'escritorio', 'Testa a chave de IA e lista os modelos disponíveis.', 'chave,modelo,provedor'],
  ['escritorio.midia', 'GET', '/api/escritorio/midias/:id', 'escritorio', 'Baixa uma foto que o dono mandou ao agente.'],
  ['escritorio.midiaParaImovel', 'POST', '/api/escritorio/midias/:id/imovel', 'escritorio', 'Leva a foto do dono para a pasta do imóvel.', 'codigo*'],

  // ---------------- PCs virtuais (estação) ----------------
  ['estacao.situacao', 'GET', '/api/estacao', 'escritorio', 'Situação da estação e de cada PC virtual (ligado, tela, túnel).'],
  ['estacao.passe', 'POST', '/api/estacao/passe', 'escritorio', 'Passe assinado de 10 minutos para a tela abrir o PC do agente.', 'agente*'],
  ['estacao.comando', 'POST', '/api/estacao/comando', 'escritorio', 'Liga, desliga ou reinicia o PC de um agente; manda ler as não lidas.', 'agente*,acao*'],
  ['estacao.tarefas', 'POST', '/api/estacao/tarefas', 'escritorio', 'Dá uma tarefa ao PC do agente (a IA opera o Chrome e responde pelo WhatsApp).', 'agente*,texto*,aba'],
  ['estacao.verTarefa', 'GET', '/api/estacao/tarefas/:id', 'escritorio', 'Passo a passo e resultado da tarefa.'],
  ['estacao.cancelarTarefa', 'POST', '/api/estacao/tarefas/:id/cancelar', 'escritorio', 'Cancela a tarefa em andamento.'],
  ['estacao.chave', 'POST', '/api/estacao/chave', 'escritorio', 'Gera a chave da estação desta imobiliária (cifrada no banco).'],
  ['estacao.gravarIA', 'PUT', '/api/estacao/ia', 'escritorio', 'Escolhe o cérebro dos PCs virtuais (Claude central, Gemini, OpenAI-compatível, Ollama).', 'provedor,modelo,chave'],
  ['estacao.testarIA', 'POST', '/api/estacao/ia/testar', 'escritorio', 'Testa o cérebro escolhido para os PCs.', 'provedor,modelo,chave'],

  // ---------------- conteúdo: portal, blog, bairros ----------------
  ['portal.situacao', 'GET', '/api/portal', 'conteudo', 'Situação da página de cada imóvel no portal (no ar, na fila, desatualizada).'],
  ['portal.legenda', 'GET', '/api/portal/:codigo/redes', 'conteudo', 'Legenda e hashtags prontas do imóvel para as redes.'],
  ['blog.situacao', 'GET', '/api/blog', 'conteudo', 'Situação do blog: textos agendados, publicados e sem foto de capa.'],
  ['blog.legenda', 'GET', '/api/blog/:slug/redes', 'conteudo', 'Legenda e hashtags do texto do blog para as redes.'],
  ['bairros.listar', 'GET', '/api/bairros', 'conteudo', 'Guias de bairro: situação, fila, prioridade e sugestões dos cadastros.'],
  ['bairros.criar', 'POST', '/api/bairros', 'conteudo', 'Acrescenta um bairro à lista de guias.', 'nome*,regiao,apelidos,notas'],
  ['bairros.alterar', 'PUT', '/api/bairros/:slug', 'conteudo', 'Muda nome, região, apelidos, notas, centro, prioridade ou situação do guia.', 'nome,regiao,apelidos,notas,lat:n,lon:n,prioridade:n,oculto:b'],
  ['bairros.apelido', 'POST', '/api/bairros/:slug/apelido', 'conteudo', 'Liga outro nome ao mesmo bairro.', 'apelido*'],
  ['bairros.reescrever', 'POST', '/api/bairros/:slug/reescrever', 'conteudo', 'Põe o guia na fila para ser reescrito.', 'motivo'],
  ['bairros.atualizar', 'POST', '/api/bairros/atualizar', 'conteudo', 'Relê agora o conteúdo publicado dos guias.'],
  ['bairros.legenda', 'GET', '/api/bairros/:slug/redes', 'conteudo', 'Legenda do guia de bairro para as redes.'],

  // ---------------- conteúdo: redes e publicações ----------------
  ['redes.calendario', 'GET', '/api/social', 'conteudo', 'Calendário do mês com posts agendados, prontos e publicados.', '', 'mes'],
  ['redes.resumo', 'GET', '/api/social/resumo', 'conteudo', 'Números das publicações e avisos das redes.'],
  ['redes.post', 'GET', '/api/social/posts/:id', 'conteudo', 'Um post: artes, legenda, hashtags, redes e prévia.'],
  ['redes.alterarPost', 'PUT', '/api/social/posts/:id', 'conteudo', 'Muda legenda, hashtags, data/hora e redes do post.', 'legenda,hashtags,agendado_para,redes:l'],
  ['redes.aprovarPost', 'POST', '/api/social/posts/:id/aprovar', 'conteudo', 'Aprova o post para sair no horário.'],
  ['redes.publicarAgora', 'POST', '/api/social/posts/:id/publicar', 'conteudo', 'Publica o post agora nas redes conectadas.'],
  ['redes.cancelarPost', 'POST', '/api/social/posts/:id/cancelar', 'conteudo', 'Tira o post do calendário.', 'motivo'],
  ['redes.restaurarPost', 'POST', '/api/social/posts/:id/restaurar', 'conteudo', 'Devolve o post cancelado ao calendário.'],
  ['redes.trocarImovel', 'POST', '/api/social/posts/:id/trocar', 'conteudo', 'Troca o imóvel do post por outro.', 'codigo*'],
  ['redes.jaPostei', 'POST', '/api/social/posts/:id/postado', 'conteudo', 'Marca como postado à mão.'],
  ['redes.aprovarVarios', 'POST', '/api/social/aprovar', 'conteudo', 'Aprova vários posts de uma vez.', 'ids:l*'],
  ['redes.planejar', 'POST', '/api/social/planejar', 'conteudo', 'Monta de novo o calendário dos próximos 35 dias.'],
  ['redes.imoveis', 'GET', '/api/social/imoveis', 'conteudo', 'Imóveis que podem virar post (com página e foto).'],
  ['redes.postExtra', 'POST', '/api/social/imoveis', 'conteudo', 'Cria um post extra para os imóveis escolhidos.', 'codigos:l*,quando,redes:l'],
  ['redes.contas', 'GET', '/api/social/contas', 'conteudo', 'Contas conectadas (Instagram, Facebook, Google Meu Negócio).'],
  ['redes.conectar', 'GET', '/api/social/conectar/:rede', 'conteudo', 'Começa a conexão com a rede (devolve o endereço de autorização).'],
  ['redes.ativarConta', 'POST', '/api/social/contas/:id/ativar', 'conteudo', 'Liga ou desliga uma conta conectada.', 'ativo:b'],
  ['redes.apagarConta', 'DELETE', '/api/social/contas/:id', 'conteudo', 'Desconecta a conta da rede.'],
  ['redes.ajustes', 'PUT', '/api/social/ajustes', 'conteudo', 'Cadência, horários e se os posts saem sozinhos ou esperam aprovação.', 'auto:b,horarios,cadencia'],

  // ---------------- controle por IA ----------------
  ['ia.manifesto', 'GET', '/api/ia/manifesto', 'painel', 'Quem é esta instalação, o que a chave pode fazer e onde ficam os outros mapas.'],
  ['ia.acoes', 'GET', '/api/ia/acoes', 'painel', 'Catálogo de todas as ações do sistema (este registro).', '', 'escopo,q'],
  ['ia.ferramentas', 'GET', '/api/ia/ferramentas.json', 'painel', 'As mesmas ações em formato de ferramentas para LLM (Claude/OpenAI).', '', 'escopo,formato'],
  ['ia.openapi', 'GET', '/api/ia/openapi.json', 'painel', 'OpenAPI 3.1 do sistema inteiro.'],
  ['ia.estado', 'GET', '/api/ia/estado', 'painel', 'Retrato do sistema agora: contagens, pendências, robôs, saúde.'],
  ['ia.eventos', 'GET', '/api/ia/eventos', 'painel', 'O que mudou desde um ponto (auditoria, leads, mensagens) para o robô acompanhar.', '', 'desde:n,limite:n'],
  ['ia.executar', 'POST', '/api/ia/executar', 'painel', 'Executa qualquer ação deste catálogo pelo nome (uma ferramenta só para a IA).', 'acao*,dados,query'],
  ['ia.esquema', 'GET', '/api/ia/esquema', 'sql', 'Tabelas e colunas do banco desta imobiliária.', '', 'tabela'],
  ['ia.consulta', 'POST', '/api/ia/consulta', 'sql', 'Consulta SELECT de leitura ao banco: uma por vez, tabelas da imobiliária, limite e tempo máximo.', 'sql*,limite:n'],
  ['chaves.listar', 'GET', '/api/chaves', 'config', 'Chaves de API criadas, com escopos, uso e último acesso.'],
  ['chaves.criar', 'POST', '/api/chaves', 'config', 'Cria uma chave de API (a chave aparece uma única vez).', 'nome*,usuario_id:n,escopos:l,somente_leitura:b,limite_min:n,ips:l,dias:n'],
  ['chaves.revogar', 'DELETE', '/api/chaves/:id', 'config', 'Revoga a chave na hora.'],
  ['chaves.log', 'GET', '/api/chaves/log', 'config', 'Últimas chamadas feitas com chave de API.', '', 'limite:n,chave_id:n'],

  // ---------------- público (sem chave) ----------------
  ['publico.imoveis', 'GET', '/imoveis/dados.json', 'conteudo', 'Ficha ao vivo dos imóveis publicados no portal (JSON público).', '', '', '', 'publico'],
  ['publico.interesse', 'POST', '/interesse', 'crm', 'Formulário do portal: vira lead QUENTE no CRM.', 'nome*,telefone*,email,codigo,mensagem,quando,periodo', '', '', 'publico'],
  ['publico.contato', 'POST', '/contato', 'crm', 'Formulário "Fale com a imobiliária" do blog e dos guias de bairro: vira lead.', 'nome*,telefone*,email,motivo,mensagem', '', '', 'publico'],
  ['publico.signature', 'POST', '/signature', 'crm', 'Clube Signature: vira lead quente e libera os valores naquele aparelho.', 'nome*,telefone*,email,aceite:b*', '', '', 'publico'],
  ['publico.privacidadePedido', 'POST', '/privacidade/pedido', 'config', 'Pedido de titular (LGPD) pelo site.', 'nome*,contato*,tipo*,mensagem', '', '', 'publico'],
  ['publico.portalApi', 'GET', '/api/publico/portal', 'conteudo', 'API do portal do visitante (vitrine, filtros, favoritos).', '', '', '', 'publico'],
  ['publico.blogApi', 'GET', '/api/publico/blog', 'conteudo', 'API do blog público.', '', '', '', 'publico'],
  ['publico.bairrosApi', 'GET', '/api/publico/bairros', 'conteudo', 'API dos guias de bairro.', '', '', '', 'publico'],
  ['publico.condominiosApi', 'GET', '/api/publico/condominios', 'condominios', 'API das páginas públicas de condomínio.', '', '', '', 'publico'],
  ['publico.webhookWhats', 'POST', '/webhook/whatsapp', 'crm', 'Webhook da WhatsApp Cloud API (mensagens recebidas).', '', '', '', 'token'],

  // ---------------- entradas de robô (chave própria, não é chave de API) ----------------
  ['extensao.receber', 'POST', '/fisguei-api/receber', 'captacao', 'A extensão do Chrome entrega o que o painel do Fisgar recebeu.', 'chave*,anuncios:l,pessoas:l', '', '', 'extensao'],
  ['extensao.proximoPedido', 'GET', '/fisguei-api/pedidos/proximo', 'captacao', 'A extensão pergunta qual é a próxima busca da fila.', '', '', '', 'extensao'],
  ['extensao.resultado', 'POST', '/fisguei-api/pedidos/:id/resultado', 'captacao', 'A extensão devolve o resultado da busca no Fisgar.', '', '', '', 'extensao'],
  ['estacaoRobo.batida', 'POST', '/estacao-api/batida', 'escritorio', 'A estação dos PCs virtuais bate ponto a cada 8 s.', '', '', '', 'estacao'],
  ['estacaoRobo.config', 'GET', '/estacao-api/config', 'escritorio', 'A estação lê quais PCs e linhas de WhatsApp manter.', '', '', '', 'estacao'],
  ['estacaoRobo.entrada', 'POST', '/estacao-api/wa-entrada', 'escritorio', 'Mensagem que chegou no WhatsApp Web de um PC virtual.', '', '', '', 'estacao'],
  ['estacaoRobo.saida', 'POST', '/estacao-api/wa-saida/:id', 'escritorio', 'A estação confirma o envio de uma mensagem.', '', '', '', 'estacao'],
  ['estacaoRobo.tarefa', 'POST', '/estacao-api/tarefa/:id', 'escritorio', 'A estação devolve o passo a passo e o resultado da tarefa.', '', '', '', 'estacao'],
  ['estacaoRobo.ciclo', 'POST', '/estacao-api/ciclo', 'escritorio', 'A estação pede um ciclo do cérebro dos PCs.', '', '', '', 'estacao'],
  ['ciclos.escritorio', 'POST', '/escritorio-ciclo', 'escritorio', 'Ciclo do cérebro do escritório (agendador do Supabase ou o PC).', '', '', '', 'token'],
  ['ciclos.social', 'POST', '/social-ciclo', 'conteudo', 'Ciclo das publicações nas redes (a cada 10 min).', '', '', '', 'token'],
];

// ---- monta o catálogo ----
function campos(txt) {
  const out = {};
  for (const p of String(txt || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = p.match(/^([a-z_0-9]+)(:[nbl])?(\*)?$/i);
    if (!m) continue;
    out[m[1]] = { tipo: { ':n': 'numero', ':b': 'sim/nao', ':l': 'lista' }[m[2]] || 'texto', obrigatorio: !!m[3] };
  }
  return out;
}
const ACOES = L.map(([nome, metodo, caminho, escopo, resumo, corpo, query, _x, auth]) => ({
  nome, metodo, caminho, escopo, resumo,
  corpo: campos(corpo), query: campos(query),
  auth: auth || 'chave',
  parametros: (caminho.match(/:[a-z_]+/gi) || []).map((s) => s.slice(1)),
}));
const PORNOME = new Map(ACOES.map((a) => [a.nome, a]));

// ---- formatos para LLM ----
const TIPOJSON = { numero: 'number', 'sim/nao': 'boolean', lista: 'array', texto: 'string' };
function esquemaDe(a) {
  const props = {}, req = [];
  for (const p of a.parametros) { props[p] = { type: 'string', description: `Valor de :${p} no caminho.` }; req.push(p); }
  for (const [k, v] of Object.entries({ ...a.query, ...a.corpo })) {
    props[k] = v.tipo === 'lista' ? { type: 'array', items: { type: 'string' } } : { type: TIPOJSON[v.tipo] };
    if (v.obrigatorio) req.push(k);
  }
  return { type: 'object', properties: props, required: [...new Set(req)], additionalProperties: true };
}
const ferramentas = (formato = 'anthropic', escopos = null) => ACOES
  .filter((a) => a.auth === 'chave' && (!escopos || escopos.includes('*') || escopos.includes(a.escopo)))
  .map((a) => (formato === 'openai'
    ? { type: 'function', function: { name: a.nome.replace('.', '_'), description: `${a.resumo} (${a.metodo} ${a.caminho})`, parameters: esquemaDe(a) } }
    : { name: a.nome.replace('.', '_'), description: `${a.resumo} (${a.metodo} ${a.caminho})`, input_schema: esquemaDe(a) }));

function openapi(base, nome) {
  const paths = {};
  for (const a of ACOES) {
    const p = a.caminho.replace(/:([a-z_]+)/gi, '{$1}');
    paths[p] = paths[p] || {};
    paths[p][a.metodo.toLowerCase()] = {
      operationId: a.nome.replace('.', '_'),
      summary: a.resumo,
      tags: [a.escopo],
      security: a.auth === 'chave' ? [{ chaveApi: [] }] : [],
      parameters: [
        ...a.parametros.map((n) => ({ name: n, in: 'path', required: true, schema: { type: 'string' } })),
        ...Object.entries(a.query).map(([n, v]) => ({ name: n, in: 'query', required: v.obrigatorio, schema: { type: TIPOJSON[v.tipo] || 'string' } })),
      ],
      ...(Object.keys(a.corpo).length ? { requestBody: { required: true, content: { 'application/json': { schema: esquemaDe({ ...a, query: {}, parametros: [] }) } } } } : {}),
      responses: { 200: { description: 'ok' }, 401: { description: 'chave ausente ou inválida' }, 403: { description: 'escopo ou perfil sem permissão' } },
    };
  }
  return {
    openapi: '3.1.0',
    info: { title: `${nome} · API`, version: '1.0.0', description: 'Controle completo do sistema por IAs e robôs. Toda rota aceita Authorization: Bearer <chave de API>.' },
    servers: [{ url: base }],
    components: { securitySchemes: { chaveApi: { type: 'http', scheme: 'bearer' } } },
    security: [{ chaveApi: [] }],
    paths,
  };
}

module.exports = { ACOES, PORNOME, ferramentas, openapi, esquemaDe };
