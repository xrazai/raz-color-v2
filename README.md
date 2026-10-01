# Raz / cores

Abra `index.html` no Chrome ou Edge. Não precisa instalar dependências, enviar imagens a servidores ou configurar chaves.

Opcionalmente, execute `node server.cjs` e abra http://127.0.0.1:4173.

1. Use **Trocar imagem** ou arraste uma imagem PNG, JPG ou WebP para a página.
2. Digite um HEX de três ou seis dígitos e pressione Enter ou **Aplicar cor**. As amostras também aplicam a cor.
3. Alterne entre Original, Base neutra, Cor aplicada e Comparar. Amplie com a roda do mouse, os botões **+ / −** ou digitando o percentual (até 800%). Arraste para explorar. **1:1** mostra os pixels no tamanho original; **Ajustar** enquadra toda a imagem. Duplo clique alterna entre 1:1 e enquadramento. Em telas touch, use dois dedos para ampliar. A comparação mantém o mesmo zoom e deslocamento nas duas imagens.
4. **Expandir** ocupa toda a área do navegador. Use **Esc** para voltar. Com a imagem em foco, **+ / −**, **0** (ajustar), **1** (1:1) e as setas também controlam a inspeção.
5. **Exportar PNG** prepara uma prévia. Clique em **Baixar PNG** para salvar a cor aplicada na resolução original, mesmo se a visualização atual for Original ou Base neutra.

Limites: 40 MB, 24 megapixels e 16.384 pixels por lado. Arquivos maiores são rejeitados sem redimensionamento silencioso. A transparência é preservada. O exemplo está embutido em `sample.js` para funcionar também ao abrir o HTML diretamente.

## Tratamento da cor

O motor converte sRGB para Oklab, separa a luminosidade da cor original, ancora a luminosidade mediana na cor escolhida e preserva as diferenças de luz com compressão suave. Cores fora do gamut têm o croma reduzido com preservação de matiz e luminosidade. Uma tabela de conversão acelera a troca. Cada aplicação parte da imagem original, evitando degradação cumulativa. O processamento roda em Web Worker local.

O HEX é uma referência para a cor-base; cada fio possui variações de luz. Em imagens com textura, alvos muito próximos de preto e branco recebem uma pequena margem de luminosidade para não eliminar a trama; a interface sinaliza esse caso. A imagem inteira é recolorida, inclusive fundo e estampas: esta versão é destinada a amostras de tecido e não faz segmentação. Não representa uma prova colorimétrica de tecido físico.

Matrizes Oklab: [Björn Ottosson](https://bottosson.github.io/posts/oklab/) (domínio público). Sem bibliotecas de produção.

## Verificação

`node --test tests/color.test.cjs`

Testes do motor cobrem parsing HEX, round-trip sRGB/Oklab, correspondência em imagem uniforme, neutralidade, ordem tonal, alpha, alvos saturados e extremos.
