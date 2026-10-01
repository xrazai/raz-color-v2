# Paleta de tecidos em lote

Uma imagem de origem gera uma lista ordenada de variantes HEX. Cada variante tem exposição (-2 a +2 EV), saturação (0–200%) e hue (-180–180°) independentes; textura (0–200%) é compartilhada. Alterar textura mantém os ajustes individuais. Selecionar uma variante abre seus controles e a inspeção já existente, preservando o zoom.

Nome do tecido compartilhado; exportação individual e ZIP de todas as variantes usam Nome_01.png, Nome_02.png etc. Exportação sempre usa a imagem original, parâmetros atuais e resolução completa. Lista aceita espaços, vírgulas, ponto e vírgula e quebras de linha. Validação atômica: entrada inválida não modifica a lista. Máximo 100 variantes; duplicatas permitidas para tratamentos diferentes. Adicionar não sobrescreve variantes; remoção renumera a lista.

Implementação: motor com parâmetros; modelo de coleção e nomes; ZIP local com CRC32; worker com chamadas identificadas e miniaturas menores; atualização de preview com controle de revisão; exportação sequencial com cancelamento e progresso. Não manter buffers de resolução completa para cada variante. Durante exportação, congelar alterações da coleção para que o ZIP seja consistente.

Verificar motor com ajustes, independência das variantes, nomes seguros, ordem sequencial, integridade ZIP; exercitar a interface com três cores, nome Anarruga, ajuste individual, textura global, troca de seleção, exportação PNG e ZIP. Nenhuma dependência ou servidor externo.
