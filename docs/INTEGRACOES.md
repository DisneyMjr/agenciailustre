# Marketing e NFS-e

## O que já funciona sem serviço externo

O portal mantém CRM, valor estimado das oportunidades, quadros de projetos/tarefas/campanhas, prazos em calendário, aprovação de projetos pelo cliente vinculado e relatórios financeiros com CSV. O resumo considera todos os registros ativos; os quadros, calendários e listas mostram a página corrente (até 50 itens) e respeitam busca e paginação.

Em Financeiro, informe número da NFS-e, código/chave de verificação e link HTTPS da nota que você emitiu no governo. Esses campos são referências informativas. Não validam, emitem ou cancelam notas e não substituem a guarda dos documentos fiscais. O administrador e o cliente vinculado podem consultar o registro conforme suas permissões. Não coloque senhas de acesso em links ou detalhes.

Continue usando o [Emissor Nacional da NFS-e](https://www.nfse.gov.br/EmissorNacional/) que já atende sua emissão. A [documentação oficial](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual) orienta emissão e integrações. Confirme enquadramento e parâmetros com sua contabilidade.

## Mautic: conector implementado, instalação externa pendente

Não há uma instância Mautic instalada nesta conta. Workers/D1 não substituem o ambiente PHP, banco de dados e tarefas agendadas exigidos pelo Mautic. O projeto é aberto, mas servidor, domínio e transporte de e-mail podem gerar custos; nenhum foi contratado. É possível estudar instalação em infraestrutura própria existente, sem ativar automaticamente um provedor pago.

1. Prepare uma instância externa mantida por você, em origem HTTPS pública dedicada, sem subcaminho. Siga a [documentação do projeto](https://github.com/mautic/mautic) e, se usar contêineres, a [imagem oficial](https://github.com/mautic/docker-mautic). Planeje atualizações, volumes persistentes e backup antes de importar contatos reais. Não use dados de teste em produção.
2. Configure banco, cron/worker e transporte de e-mail. Configure remetente, DNS e descadastro antes de ativar campanhas. Revise custos e limites de qualquer transporte escolhido.
3. Habilite a API e crie credenciais OAuth2 com permissão mínima para pesquisar/criar/editar contatos. O conector utiliza `client_credentials` e os endpoints `/api/contacts`, não `/api/v2`. Veja a [autenticação oficial](https://devdocs.mautic.org/en/7.3/rest_api/authentication.html).
4. No diretório do projeto, registre os valores **interativamente**, um de cada vez:

   ```text
   npx wrangler secret put MAUTIC_BASE_URL
   npx wrangler secret put MAUTIC_CLIENT_ID
   npx wrangler secret put MAUTIC_CLIENT_SECRET
   ```

   A URL deve ser apenas a origem HTTPS da instalação. Não envie valores pelo chat, não os coloque nos argumentos nem no GitHub. O painel Cloudflare também permite criar esses segredos. Reabra o portal depois de salvar.
5. Abra um contato salvo no CRM como administrador. Registre origem e data da autorização específica de marketing, marque a confirmação e escolha **Sincronizar contato**. Autorizar uma resposta ao formulário institucional não equivale a autorizar marketing.
6. O conector procura correspondência exata pelo e-mail, atualiza o contato existente ou cria um, enviando apenas nome, e-mail, telefone e a etiqueta `agencia-ilustre`. Guarda ID, momento da sincronização e evidência informada, com evento de auditoria. Não copia notas privadas ou valores comerciais. Não sobrescreve campos externos que não envia.
7. Confirme a operação na instância real antes de ampliar o uso. Os testes automatizados cobrem o contrato com respostas simuladas; nenhuma instância real foi testada nesta entrega. Se houver falha após o servidor receber a operação, confira o Mautic antes de repetir. Contatos duplicados ambíguos são recusados. Não há sincronização automática, importação em massa ou sincronização de descadastro; cadastre e respeite descadastros também no Mautic.

O portal não solicita disparos de e-mail. **Automações que você já habilitou no Mautic podem reagir à criação/edição de contatos**; revise-as antes de sincronizar. Para desativar o conector, remova um ou todos os três segredos. A existência de credenciais não comprova conexão bem-sucedida.

## ACBr: analisado, emissão automática não ativada

O [Projeto ACBr](https://github.com/Projeto-ACBr-Oficial) fornece componentes e ferramentas distintos; não é um portal pronto para instalar no Worker. ACBrLib/Monitor exigem execução nativa externa e configuração fiscal. Os [fontes](https://projetoacbr.com.br/fontes/) permitem avaliar uma solução própria; compilação, manutenção e certificado são etapas separadas. A disponibilidade gratuita dos fontes não significa que todas as distribuições prontas ou serviços comerciais sejam gratuitos.

A [ACBr API comercial consome créditos pré-pagos](https://dev.acbr.api.br/docs/limites/). Nenhuma conta comercial, emissão, consulta cobrada ou compra de créditos foi ativada. Para seu uso atual de NFS-e pelo governo, foi entregue o vínculo documental no financeiro, sem dependência paga.

Uma emissão integrada futura precisa de CNPJ, município, parâmetros do serviço/tributação e credencial/certificado aplicável, além de homologação na infraestrutura escolhida. Nenhum certificado deve ser enviado pelo chat ou versionado. Não há geração de XML fiscal, assinatura digital, transmissão ou cancelamento fiscal nesta versão.

## Dados e limites

A atualização reutiliza o mesmo D1 e não altera nem recria tabelas. Arquivamento preserva dados. Metadados de aprovação/sincronização são mantidos quando registros são editados. Exportação de registros não substitui backup completo do banco. Testes de gravação usam banco local isolado; os testes públicos são somente de leitura.

## Google Drive para materiais

Em **Meus materiais**, a equipe seleciona o cliente e envia uma foto ou um vídeo. O portal cria a pasta privada no Meu Drive da agência no primeiro envio. Os clientes visualizam ou baixam pelo portal com a conta vinculada ao seu cadastro. A pasta permanece privada no Google Drive. Os arquivos usam o espaço da conta Google da agência.

Para habilitar no Worker existente:

1. Use o projeto **Agencia Ilustre Portal** (`noted-robot-515711-m3`), com a Google Drive API habilitada e um cliente OAuth de aplicativo da Web. O redirecionamento deve ser `https://agenciailustre.disneymjr.workers.dev/api/materials/google/callback`.
2. Configure `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` e `GOOGLE_DRIVE_OWNER_EMAIL` no Worker. Armazene o segredo OAuth e o e-mail como segredos do Worker.
3. Aplique a migração `0006_materials.sql` ao D1 existente e publique o Worker. O administrador pode abrir **Meus materiais → Conectar Google Drive** e autorizar a conta configurada. A integração usa o escopo por arquivo `drive.file` e mantém o token de renovação criptografado no D1.
4. Envie um arquivo de teste pelo portal em um cadastro de teste. Confira a prévia e o download com esse cliente e verifique que outro cliente não consegue ler o arquivo pelo endereço direto.

Enquanto a configuração OAuth estiver em **Testando**, o Google pode expirar a autorização de Drive em sete dias. Use **Reconectar Google Drive** se necessário. O envio aceita fotos JPEG, PNG, WebP, GIF e AVIF e vídeos MP4, WebM e MOV de até 2 GB por arquivo, dentro da cota disponível no Drive. Para prévia de vídeo em mais navegadores, exporte em MP4 com H.264.
