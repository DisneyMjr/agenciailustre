# Agência Ilustre

Site institucional e portal de gestão, criados do zero para `DisneyMjr/agenciailustre`. React + TypeScript + Vite, API Cloudflare Workers e banco D1. Sem assinatura paga, rastreamento publicitário ou dependência de provedor de fontes.

## Funcionalidades

- Site responsivo com serviços, processo, contato persistente no CRM e aviso de privacidade.
- CRM, clientes, projetos, tarefas, lançamentos financeiros e planejamento de campanhas: criar, pesquisar, editar, paginar e arquivar.
- Administrador gerencia acessos e exporta os registros, incluindo os arquivados. Equipe acompanha a operação, sem alterar financeiro ou acessos. Cliente consulta apenas projetos, tarefas e financeiro vinculados ao seu próprio cliente.
- Senhas PBKDF2-SHA256 com salt individual, sessões de 8 horas com cookie HttpOnly/SameSite/Secure em HTTPS, proteção de origem, validação de entrada, SQL parametrizado e limites de tentativas.
- Arquivamento preserva os dados. Não existem clientes, resultados ou depoimentos fictícios na base de produção.

## Rodar e testar

Requer Node.js 24. Instale com `npm ci`, compile com `npm run build`, prepare o banco local com `npm run db:local` e execute `npm run preview`. O endereço padrão é informado pelo Wrangler (normalmente `http://localhost:8787`). Para interface com recarregamento, `npm run dev` serve apenas a interface; use Wrangler para testar a API completa.

Para os testes: `npx playwright install chromium` e `npm test`. A suíte cria uma instância local isolada de D1, aplica as migrações e testa API, permissões, persistência e navegador desktop/celular. As credenciais sintéticas dos testes só existem nessa instância. Nunca execute testes de criação de conta sobre uma base de produção.

## Publicar gratuitamente na Cloudflare

1. `npx wrangler login`: autorize sua própria conta no navegador. Não envie tokens pelo chat nem os salve no repositório.
2. Confirme `npx wrangler whoami` e mantenha o plano **Workers Free**. Não habilite Workers Paid, R2, serviços de e-mail pagos ou cobrança automática.
3. `npx wrangler d1 create agenciailustre`. Substitua somente `database_id` no `wrangler.jsonc` pelo ID retornado, mantendo o banco e os dados existentes em atualizações futuras. Se o banco já existir, use-o em vez de criar outro.
4. `npm run db:remote` aplica migrações incrementais. Elas não removem tabelas ou registros existentes. Antes de atualizações sobre dados reais, exporte o banco: `npx wrangler d1 export DB --remote --output backup.sql`. Proteja esse backup fora do repositório.
5. `npm run deploy`. O site e a API serão publicados no mesmo endereço `workers.dev`, com HTTPS gratuito. Não é necessário contratar domínio.
6. `npx wrangler secret put BOOTSTRAP_TOKEN`. Digite um código aleatório forte no terminal interativo, sem inseri-lo em argumentos, arquivos ou no chat. Abra `/portal/configurar` no site publicado e informe esse código, seu nome, e-mail e uma senha com pelo menos 12 caracteres. A primeira conta é administrativa; a operação só funciona uma vez, com trava transacional no banco.
7. Após criar a conta inicial, `npx wrangler secret delete BOOTSTRAP_TOKEN`. A autenticação normal continua funcionando. Não apague `setup_lock` nem recrie o banco para tentar entrar novamente.

O login existente do painel Cloudflare não autentica automaticamente o CLI. A autorização OAuth do Wrangler é uma etapa externa necessária. Publicar exige essa autorização; uma prévia local não é publicação.

As cotas oficiais do plano gratuito incluem 100 mil requisições Workers/dia e D1 com 5 milhões de linhas lidas/dia, 100 mil linhas escritas/dia e 5 GB totais. Verifique os limites atuais no [preço oficial](https://developers.cloudflare.com/workers/platform/pricing/). No plano gratuito, exceder a cota pode interromper o atendimento; não autorize upgrade para contornar isso automaticamente. Ativos estáticos são servidos diretamente pelo binding de assets.

## Operação e configurações externas

- Cadastre o cliente antes de criar seu acesso. Vincule os projetos, tarefas e lançamentos ao cliente correto. Sem vínculo, são internos.
- Campanhas são planejamento e registro de produção. **Não há disparo de e-mails, automação de jornadas, pixels de rastreamento ou instalação do Mautic.** Para essas funções será necessário integrar um provedor autorizado e configurar remetente, consentimento, descadastro e DNS. Nada foi contratado.
- Financeiro é controle interno, sem cobrança automática, PIX, conciliação ou nota fiscal.
- Não há upload de arquivos, Google Drive, Google Calendar ou geração de PDF nesta versão. Não foram ativados serviços externos.
- O administrador cria e bloqueia acessos e redefine senhas de equipe/clientes; cada pessoa também pode alterar sua senha. Não há e-mail de recuperação. Se o administrador perder acesso, a recuperação exige acesso administrativo ao banco; preserve os dados e não reinicie a configuração inicial.
- Exportação pelo portal inclui registros e arquivados, mas não senhas/sessões. Para restauração completa, use exportação D1 protegida. Não há restauração automática pelo portal.
- Revise dados de contato e retenção periodicamente. O texto institucional e a identidade visual são uma proposta inicial; substitua por informações oficiais da agência antes de divulgá-las como posicionamento definitivo.
- O agendamento diário limpa apenas sessões e contadores de tentativas expirados; não exclui contatos ou dados de negócio.
- A listagem é paginada em 50 registros. O resumo mostra a página mais recente, sem apresentar contagens parciais como totais da empresa.

## Referências e escolha da base

O [portal-agencia-marketing](https://github.com/enzoterra/portal-agencia-marketing) inspirou o fluxo de agência. Nenhum código foi copiado; não foi encontrada licença para reutilização na versão consultada. O [Mautic](https://github.com/mautic/mautic) é uma plataforma de automação mais completa, mas depende de PHP e banco compatível com sua aplicação; não é um aplicativo nativo Workers/D1. Esta base prioriza a hospedagem gratuita solicitada e deixa as integrações avançadas explícitas, sem prometer equivalência ao Mautic.

## MCP oficial da Cloudflare

Depois da publicação, conecte o servidor oficial com OAuth:

```text
codex mcp add cloudflare-api --url https://mcp.cloudflare.com/mcp
codex mcp login cloudflare-api
```

Autorize sua própria conta na página oficial e confirme com `codex mcp list`. A autorização é separada do Wrangler e pode exigir reabrir a sessão para disponibilizar as ferramentas. Não compartilhe credenciais. Consulte os [servidores oficiais da Cloudflare](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/).
