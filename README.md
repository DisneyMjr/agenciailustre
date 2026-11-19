# Agência Ilustre

Site institucional e portal de gestão, criados do zero para `DisneyMjr/agenciailustre`. React + TypeScript + Vite, API Cloudflare Workers e banco D1. Sem assinatura paga, rastreamento publicitário ou dependência de provedor de fontes.

**Site publicado:** https://agenciailustre.disneymjr.workers.dev · **Portal:** https://agenciailustre.disneymjr.workers.dev/portal

O banco de produção já está vinculado no `wrangler.jsonc`; reutilize-o em futuras publicações. Não crie outro banco para atualizar o site. O MCP oficial foi configurado no Codex e autenticado via OAuth separadamente do Wrangler.

## Funcionalidades

- Site responsivo com serviços, processo, contato persistente no CRM e aviso de privacidade.
- CRM com valores estimados e funil; projetos, tarefas e campanhas em quadros persistentes, lista e calendário de prazos.
- Clientes, contatos e lançamentos financeiros: criar, pesquisar, editar, paginar e arquivar. Aprovação ou solicitação de ajustes de projetos pelo cliente vinculado.
- Indicadores agregados sobre todos os registros ativos, relatórios financeiros mensais e exportação CSV. Referências de NFS-e emitida no governo (número, chave e link).
- Conector manual Mautic OAuth2, desativado até configurar instalação externa e segredos; exige confirmação e evidência de autorização de marketing. [Configuração e limites](docs/INTEGRACOES.md).
- Administrador gerencia acessos e exporta os registros, incluindo os arquivados. Equipe acompanha a operação, sem alterar financeiro ou acessos. Cliente consulta apenas projetos, tarefas e financeiro vinculados ao seu próprio cliente e responde às aprovações de projetos em etapa própria.
- Senhas PBKDF2-SHA256 com salt individual, sessões de 8 horas com cookie HttpOnly/SameSite/Secure em HTTPS, proteção de origem, validação de entrada, SQL parametrizado e limites de tentativas.
- Arquivamento preserva os dados. Não existem clientes, resultados ou depoimentos fictícios na base de produção.

## Rodar e testar

Requer Node.js 24. Instale com `npm ci`, compile com `npm run build`, prepare o banco local com `npm run db:local` e execute `npm run preview`. O endereço padrão é informado pelo Wrangler (normalmente `http://localhost:8787`). Para interface com recarregamento, `npm run dev` serve apenas a interface; use Wrangler para testar a API completa.

Para os testes: `npx playwright install chromium` e `npm test`. A suíte cria uma instância local isolada de D1, aplica as migrações e testa API, permissões, persistência e navegador desktop/celular. As credenciais sintéticas dos testes só existem nessa instância. Nunca execute testes de criação de conta sobre uma base de produção.

## Publicar gratuitamente na Cloudflare

1. `npx wrangler login --use-keyring`: autorize sua própria conta no navegador. O armazenamento criptografado usa o gerenciador de credenciais do sistema. Não envie tokens pelo chat nem os salve no repositório.
2. Confirme `npx wrangler whoami` e mantenha o plano **Workers Free**. Não habilite Workers Paid, R2, serviços de e-mail pagos ou cobrança automática.
3. `npx wrangler d1 create agenciailustre`. Substitua somente `database_id` no `wrangler.jsonc` pelo ID retornado, mantendo o banco e os dados existentes em atualizações futuras. Se o banco já existir, use-o em vez de criar outro.
4. `npm run db:remote` aplica migrações incrementais. Elas não removem tabelas ou registros existentes. Antes de atualizações sobre dados reais, exporte o banco: `npx wrangler d1 export DB --remote --output backup.sql`. Proteja esse backup fora do repositório.
5. `npm run deploy`. O site e a API serão publicados no mesmo endereço `workers.dev`, com HTTPS gratuito. Não é necessário contratar domínio.
6. `npx wrangler secret put BOOTSTRAP_TOKEN`. Digite um código aleatório forte no terminal interativo, sem inseri-lo em argumentos, arquivos ou no chat. Alternativamente, no painel Cloudflare, abra o Worker `agenciailustre` → Configurações → Variáveis e segredos e defina `BOOTSTRAP_TOKEN` como **Segredo**. Abra `/portal/configurar` no site publicado e informe esse código, seu nome, e-mail e uma senha com pelo menos 8 caracteres. A primeira conta é administrativa; a operação só funciona uma vez, com trava transacional no banco.
7. Após criar a conta inicial, `npx wrangler secret delete BOOTSTRAP_TOKEN`. A autenticação normal continua funcionando. Não apague `setup_lock` nem recrie o banco para tentar entrar novamente.

O login existente do painel Cloudflare não autentica automaticamente o CLI. A autorização OAuth do Wrangler é uma etapa externa necessária. Publicar exige essa autorização; uma prévia local não é publicação.

As cotas oficiais do plano gratuito incluem 100 mil requisições Workers/dia e D1 com 5 milhões de linhas lidas/dia, 100 mil linhas escritas/dia e 5 GB totais. Verifique os limites atuais no [preço oficial](https://developers.cloudflare.com/workers/platform/pricing/). No plano gratuito, exceder a cota pode interromper o atendimento; não autorize upgrade para contornar isso automaticamente. Ativos estáticos são servidos diretamente pelo binding de assets.

## Operação e configurações externas

- Cadastre o cliente antes de criar seu acesso. Vincule os projetos, tarefas e lançamentos ao cliente correto. Sem vínculo, são internos.
- Campanhas são planejamento e registro de produção. **Não há disparo de e-mails pelo portal, automação de jornadas, pixels de rastreamento ou instalação do Mautic.** Existe um conector manual de contatos, condicionado à instalação externa e aos segredos descritos em [Integrações](docs/INTEGRACOES.md). Para essas funções será necessário integrar um provedor autorizado e configurar remetente, consentimento, descadastro e DNS. Nada foi contratado.
- Financeiro é controle interno, sem cobrança automática, PIX, conciliação ou emissão fiscal. Pode guardar referências das NFS-e emitidas no governo. ACBr comercial não foi ativado; componentes nativos dependem de infraestrutura e configuração externas.
- Há upload de imagens no portfólio. Não há anexos gerais, Google Drive, Google Calendar ou geração de PDF. Não foram ativados serviços externos.
- O administrador cria e bloqueia acessos e redefine senhas de equipe/clientes; cada pessoa também pode alterar sua senha. Não há e-mail de recuperação. Se o administrador perder acesso, a recuperação exige acesso administrativo ao banco; preserve os dados e não reinicie a configuração inicial.
- Exportação pelo portal inclui registros e arquivados, mas não senhas/sessões. Para restauração completa, use exportação D1 protegida. Não há restauração automática pelo portal.
- Revise dados de contato e retenção periodicamente. O texto institucional e a identidade visual são uma proposta inicial; substitua por informações oficiais da agência antes de divulgá-las como posicionamento definitivo.
- O agendamento diário limpa apenas sessões e contadores de tentativas expirados; não exclui contatos ou dados de negócio.
- Listas, quadros e calendários são paginados em 50 registros e respeitam a busca. Indicadores globais e relatórios financeiros são agregados no banco, respeitando o escopo do usuário. Os painéis de projetos/tarefas recentes usam a primeira página, sem prometer uma agenda global. O seletor de cliente percorre todas as páginas de clientes ativos.

## Referências e escolha da base

O [portal-agencia-marketing](https://github.com/enzoterra/portal-agencia-marketing) inspirou o fluxo de agência. Nenhum código foi copiado; não foi encontrada licença para reutilização na versão consultada. O [Mautic](https://github.com/mautic/mautic) é uma plataforma de automação mais completa, mas depende de PHP e banco compatível com sua aplicação; não é um aplicativo nativo Workers/D1. Esta base prioriza a hospedagem gratuita solicitada e deixa as integrações avançadas explícitas, sem prometer equivalência ao Mautic.

## MCP oficial da Cloudflare

Depois da publicação, conecte o servidor oficial com OAuth:

```text
codex mcp add cloudflare-api --url https://mcp.cloudflare.com/mcp
codex mcp login cloudflare-api
```

Autorize sua própria conta na página oficial e confirme com `codex mcp list`. A autorização é separada do Wrangler e pode exigir reabrir a sessão para disponibilizar as ferramentas. Não compartilhe credenciais. Consulte os [servidores oficiais da Cloudflare](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/).

## Design e validação da evolução

Interface refinada usando os princípios da skill [emil-design-eng](https://github.com/emilkowalski/skills): hierarquia visual, foco visível, hover em ponteiro preciso, feedback de pressão, movimento reduzido e navegação móvel. Não foi copiado um produto de terceiros.

A suíte cobre isolamento entre clientes, aprovação restrita por etapa, contagem acima de 50 registros, referências fiscais, persistência de etapas, calendário, CSV, layout móvel e contrato OAuth Mautic com respostas simuladas. A conexão com um Mautic real ainda requer instalação/configuração externa.


## Portfólio e nova apresentação

No painel, entre como administrador e abra **Portfólio → Novo trabalho**. Preencha título, categoria, descrição, imagem e, se desejar, um link HTTPS. Marque **Publicar no site** para aparecer na seção Trabalhos; sem essa opção, o trabalho permanece como rascunho. A opção destaque prioriza sua posição. Editar permite atualizar ou retirar da publicação. Arquivar preserva o registro e a imagem no banco.

O envio aceita JPEG, PNG e WebP de até 8 MB. O navegador remove metadados e converte a imagem em JPEG, com dimensão máxima de 1600 pixels e até 600 KB. As imagens ficam no D1 existente; não exigem R2 nem outro serviço. O uso está sujeito às cotas do plano gratuito. A exportação JSON contém os metadados do portfólio; o backup completo do D1 inclui as imagens.

A apresentação usa a Velo como referência de hierarquia visual, com textos, composição e elementos próprios. O retrato editorial foi gerado como imagem conceitual e não representa integrante da equipe ou cliente. Não foram copiados trabalhos ou depoimentos. O WhatsApp comercial autorizado é (37) 99912-9477. Nenhuma configuração externa nova é necessária para o portfólio.

| Antes | Depois | Por quê |
| --- | --- | --- |
| Abertura institucional simples | Retrato editorial, tipografia ampla e elementos da marca | Comunicar a proposta criativa da agência |
| Sem cadastro público de trabalhos | Portfólio com rascunhos, publicação e imagens pelo administrador | Permitir atualização sem editar código |
| Contato somente por formulário | Formulário integrado ao CRM e atalho para WhatsApp | Oferecer os canais solicitados |


### Movimento e paleta

A apresentação pública agora usa preto e tons de roxo, com entrada de títulos e cards na rolagem, sequência na abertura, parallax discreto no retrato e resposta nos links e imagens. Implementação nativa com IntersectionObserver e Web Animations, sem bibliotecas ou serviços adicionais. A rolagem permanece nativa, os elementos aparecem apenas uma vez e `prefers-reduced-motion` desativa os efeitos, inclusive quando a preferência muda durante a visita. O foco de teclado cancela animações em curso. Dados e regras do painel permanecem preservados.

| Antes | Depois | Por quê |
| --- | --- | --- |
| Abertura estática e detalhes laranja | Entrada em sequência e acentos violetas | Aproximar o movimento da referência e seguir a nova paleta |
| Seções sem transição | Revelação na rolagem, sem repetir entradas | Dar continuidade à leitura |
| Efeitos sem opção específica | Movimento reduzido e foco imediato por teclado | Manter acesso confortável ao conteúdo |


## Agenda de reuniões e calendário editorial

Módulos próprios inspirados nos fluxos de agendamento e gestão editorial, sem incorporar código dos repositórios citados. Não são instalações do Easy!Appointments, Postiz, Documenso ou Pipecat.

### Reuniões

No painel, equipe e administrador abrem **Agenda de reuniões**, escolhem data/hora de Brasília e duração, e adicionam horários. O visitante entra em **Agendar** no site, escolhe um horário e envia nome, e-mail e assunto, com consentimento. A reserva fica **Aguardando confirmação** e ocupa o horário. A equipe confirma ou cancela pelo painel. A agenda é única da agência e impede sobreposição ou duas reservas ativas no mesmo horário, inclusive em pedidos simultâneos. Cancelar libera o horário se ele ainda for futuro; retirar um horário arquiva a disponibilidade sem apagar registros. É necessário cancelar a reunião antes de retirar um horário reservado.

Não há e-mail automático, link de videoconferência ou sincronização externa. A equipe combina os detalhes com o visitante pelos canais informados. Clientes conectados que reservam pelo site veem suas reuniões no portal e podem cancelá-las; reservas anônimas ficam sob acompanhamento da equipe e não são vinculadas apenas pela coincidência do e-mail.

### Editorial

Equipe e administrador abrem **Calendário editorial → Novo conteúdo**. É necessário um cliente ativo. Informe título, canal, data/hora planejada, legenda e link HTTPS opcional para o material. Salve como rascunho e clique **Enviar para aprovação**. O cliente vinculado vê o conteúdo em seu próprio portal e pode aprovar ou solicitar ajustes com comentário. Rascunhos não são visíveis ao cliente. Alterações posteriores voltam a rascunho e exigem nova aprovação. A proteção de versão recusa gravações ou decisões sobre versões antigas.

Após aprovação, publique pelos canais habituais e use **Marcar publicado** para registrar isso no painel. O sistema não envia posts para redes sociais nem afirma que a publicação foi verificada externamente. O histórico preserva as revisões do cliente, com as últimas 100 disponíveis na consulta do conteúdo. O arquivamento mantém conteúdo e revisões na exportação administrativa.

Todas as datas seguem Brasília (UTC−3). O editorial lista 50 conteúdos por página e o calendário destaca apenas a página atual; use a paginação para consultar os demais. A agenda pública mostra até 100 horários livres futuros e o painel até 200 disponibilidades futuras, além da lista paginada de reuniões.

A migração `0004_planning.sql` é aditiva. A exportação administrativa e o backup D1 incluem os registros desses módulos. Não há serviços, contas externas ou segredos adicionais necessários. Continuam aplicáveis as cotas gratuitas da Cloudflare. Contratos/assinatura e atendimento por IA ficam para etapas futuras.


## Documentos e assinatura eletrônica

Módulo próprio inspirado no fluxo de documentos do Documenso, com um destinatário por PDF. **Não é uma instalação do Documenso nem assinatura certificada ICP-Brasil/PAdES.** O registro comprova a confirmação pela conta e senha do portal, com nome declarado, identidade da conta, data do servidor, consentimento e SHA-256 do PDF original. A adequação da forma de assinatura ao documento e a representação do cliente precisam ser avaliadas pela agência; o módulo não verifica identidade civil ou poderes de representação.

### Preparar e enviar

1. Cadastre o cliente e um acesso individual de cliente vinculado em **Meu acesso**. O destinatário precisa estar ativo.
2. Abra **Documentos & assinaturas → Novo documento**, informe título, selecione o acesso do destinatário e envie um PDF sem senha, de até **1,5 MB e 20 páginas**. O seletor lista até 500 acessos ativos.
3. Salve e confira o arquivo. Rascunhos ficam privados da equipe e podem ser editados.
4. Clique **Enviar ao cliente** e confirme o destinatário. O PDF e seus dados ficam bloqueados para edição. Avise o cliente pelos canais habituais; não há envio automático de e-mail ou link anônimo de assinatura.

### Assinar e guardar

O destinatário entra em sua própria conta, abre o PDF, confere todas as páginas e escolhe assinatura digitada ou desenhada. A conclusão exige nome, consentimento explícito e nova confirmação da senha. A senha não integra o comprovante. Outro acesso do mesmo cliente não pode assinar no lugar do destinatário escolhido. A imagem manuscrita é uma representação visual, não uma verificação biométrica.

Após concluir, equipe e destinatário podem baixar **PDF com comprovante** e **registro JSON**. A cópia PDF contém as páginas visualmente renderizadas e uma página de comprovante (ou mais, se necessário), com assinatura, identificação da conta, data, consentimento e hashes. Inclui o PDF original e o JSON como anexos. A cópia é estática: campos de formulário, links interativos e outras funções do original não são preservados visualmente. O original permanece preservado em seus bytes exatos, inclusive se já possuir assinaturas externas; a cópia visual não mantém uma eventual certificação digital do original. Não substitua o arquivo original pela cópia para validar certificados preexistentes.

**Conferir integridade** compara o original, o manifesto e o desenho com os registros atuais do servidor. O SHA-256 não é um selo criptográfico de entidade independente; não há certificado de assinatura, carimbo de tempo confiável externo ou validação pública no ITI. A data é registrada pelo servidor. O sistema guarda o hash do IP (não o IP bruto) e o identificador do navegador no manifesto. O visualizador é local ao navegador e não executa ações do PDF.

A equipe pode cancelar um envio pendente, e o destinatário pode recusar com motivo. Documentos assinados não podem ser alterados ou cancelados. Arquivar preserva arquivos, assinatura e histórico; o destinatário mantém acesso aos seus documentos assinados. As listas são paginadas em 50 itens. O histórico de visualização registra uma ocorrência por acesso e versão, sem duplicar cada abertura.

### Integridade e operação

A migração `0005_documents.sql` é aditiva. Triggers bloqueiam alterações de conteúdo depois do envio, alteração de assinaturas, exclusão de documentos e alteração/exclusão de eventos. A confirmação usa condições de versão e um lote D1 atômico para evitar assinaturas duplicadas ou concorrência com cancelamento. Reautenticações de assinatura são limitadas a 12 tentativas por conta a cada 15 minutos.

Arquivos ficam no D1 existente; não é necessário ativar R2, SMTP, certificado ou serviço pago para esta modalidade. Aplicam-se as cotas de armazenamento, leitura, gravação e requisições da conta gratuita. Bibliotecas PDF são carregadas apenas quando necessárias. A exportação administrativa contém metadados, eventos e manifestos; **não inclui os arquivos PDF nem desenhos**. Para cópia completa, use o backup D1 protegido fora do repositório. Os PDFs e registros JSON baixados pelo cliente também contêm informações pessoais e precisam ser guardados com cuidado.

Para assinatura certificada ou equivalência a outros recursos do Documenso (campos posicionáveis, vários signatários, convites por e-mail, selo PAdES), será necessária outra etapa com infraestrutura e configurações específicas. Nada disso foi ativado ou contratado.
