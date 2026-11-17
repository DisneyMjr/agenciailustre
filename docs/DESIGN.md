# Direção visual Ilustre

Refinamento do site institucional e do portal seguindo a skill [emil-design-eng](https://github.com/emilkowalski/skills). A paleta escolhida pelo responsável é roxo intenso (`#5B2DA8`), laranja (`#E67B27`) e branco, com tipografia de sistema e superfícies suaves. O laranja escuro (`#A14A15`) é usado onde o texto precisa de maior contraste. O símbolo passou a ser uma lâmpada de ideia, desenhada em SVG e compartilhada entre site, portal e favicon.

| Before                                              | After                                                                   | Why                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| Navegação escura ocupando toda a lateral            | Painel claro com bordas arredondadas e seleção suave                    | Reduzir o peso visual e destacar o conteúdo           |
| Texto pequeno e densidade irregular                 | Hierarquia tipográfica consistente, tamanhos maiores e espaçamento      | Facilitar leitura e comparação de registros           |
| Cartões planos e cantos rígidos                     | Superfícies brancas com contorno, sombra discreta e curvas consistentes | Separar grupos sem acrescentar ruído                  |
| Hero e áreas promocionais com cores muito sólidas   | Luz e gradientes sutis sobre a identidade existente                     | Dar profundidade sem imagens externas ou rastreamento |
| Botões e campos com estilos distintos entre módulos | Botões arredondados, campos suaves e estados de foco uniformes          | Tornar as interações previsíveis                      |
| Menu fixo comprimindo tablets                       | Navegação recolhível até 800px                                          | Preservar espaço de trabalho em telas intermediárias  |

`src/appearance.css`, importado depois das folhas estruturais, concentra o acabamento visual. As folhas existentes mantêm os layouts e estados funcionais. Fontes usam a pilha nativa do sistema, sem download externo. Nenhuma biblioteca de animação foi adicionada.

Hover fica restrito a ponteiros precisos. A pressão usa uma escala sutil e não é aplicada em foco visível por teclado. Navegação e carregamento de dados não têm animações de entrada. A preferência por movimento reduzido é respeitada. O cabeçalho translúcido usa uma cor de fundo suficiente para permanecer legível mesmo sem suporte a desfoque.

Esta atualização altera apresentação, sem mudanças no banco, nas permissões, nos endpoints ou nas integrações externas.

## Referências de agências

Foram consultados os sites oficiais da [PORTO ROCHA](https://www.portorocha.com/), [COLLINS](https://wearecollins.com/) e [Africa Creative](https://www.africacreative.com.br/pt/). A leitura editorial, a hierarquia e a apresentação dos trabalhos orientaram a proposta. Nenhum trabalho, logo, cliente, prêmio ou imagem dessas agências foi incorporado à Ilustre.

A paleta é uma criação para a Ilustre, não uma extração das cores dessas marcas. O responsável escolheu roxo, laranja e branco entre três direções apresentadas. A lâmpada foi solicitada explicitamente como elemento da logo. `src/brand-mark.tsx` concentra seu desenho vetorial; uma versão independente com fundo transparente está em `public/brand/ilustre-symbol.svg`. O ícone da aba usa uma versão monocromática sobre roxo para legibilidade em tamanhos pequenos.
