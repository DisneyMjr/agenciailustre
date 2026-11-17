# Direção visual Ilustre

Refinamento do site institucional e do portal seguindo a skill [emil-design-eng](https://github.com/emilkowalski/skills). A identidade verde da Ilustre foi preservada, com base clara, tipografia de sistema e superfícies suaves.

| Before | After | Why |
| --- | --- | --- |
| Navegação escura ocupando toda a lateral | Painel claro com bordas arredondadas e seleção suave | Reduzir o peso visual e destacar o conteúdo |
| Texto pequeno e densidade irregular | Hierarquia tipográfica consistente, tamanhos maiores e espaçamento | Facilitar leitura e comparação de registros |
| Cartões planos e cantos rígidos | Superfícies brancas com contorno, sombra discreta e curvas consistentes | Separar grupos sem acrescentar ruído |
| Hero e áreas promocionais com cores muito sólidas | Luz e gradientes sutis sobre a identidade existente | Dar profundidade sem imagens externas ou rastreamento |
| Botões e campos com estilos distintos entre módulos | Botões arredondados, campos suaves e estados de foco uniformes | Tornar as interações previsíveis |
| Menu fixo comprimindo tablets | Navegação recolhível até 800px | Preservar espaço de trabalho em telas intermediárias |

`src/appearance.css`, importado depois das folhas estruturais, concentra o acabamento visual. As folhas existentes mantêm os layouts e estados funcionais. Fontes usam a pilha nativa do sistema, sem download externo. Nenhuma biblioteca de animação foi adicionada.

Hover fica restrito a ponteiros precisos. A pressão usa uma escala sutil e não é aplicada em foco visível por teclado. Navegação e carregamento de dados não têm animações de entrada. A preferência por movimento reduzido é respeitada. O cabeçalho translúcido usa uma cor de fundo suficiente para permanecer legível mesmo sem suporte a desfoque.

Esta atualização altera apresentação, sem mudanças no banco, nas permissões, nos endpoints ou nas integrações externas.
