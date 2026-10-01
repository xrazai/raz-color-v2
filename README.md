# Raz / cores

Para recolorir tecidos, abra `index.html` no Chrome ou Edge. A recoloração não precisa instalar dependências, enviar imagens a servidores ou configurar chaves.

Opcionalmente, execute `node server.cjs` e abra http://127.0.0.1:4173.

1. Use **Trocar imagem** ou arraste uma imagem PNG, JPG ou WebP para a página.
2. Dê um **Nome do tecido** para o lote. Cole uma lista de HEX de três ou seis dígitos, separados por linha, espaço, vírgula ou ponto e vírgula, e clique em **Adicionar cores**. As novas versões entram depois das existentes, na ordem da lista; cores repetidas são permitidas.
3. Selecione uma miniatura para editar seu HEX, **Exposição**, **Saturação** e **Hue**. Cada versão mantém seus próprios ajustes. **Textura global** altera a intensidade da trama em todas as versões. Trocar a imagem original preserva a paleta e os ajustes.
4. Alterne entre Original, Base neutra, Cor aplicada e Comparar. Amplie com a roda do mouse, os botões **+ / −** ou digitando o percentual (até 800%). Arraste para explorar. **1:1** mostra os pixels no tamanho original; **Ajustar** enquadra toda a imagem. Duplo clique alterna entre 1:1 e enquadramento. Em telas touch, use dois dedos para ampliar. A comparação mantém o mesmo zoom e deslocamento nas duas imagens.
5. **Expandir** ocupa toda a área do navegador. Use **Esc** para voltar. Com a imagem em foco, **+ / −**, **0** (ajustar), **1** (1:1) e as setas também controlam a inspeção.
6. **Exportar esta versão** prepara um PNG; **Exportar todas** prepara um ZIP com todos os PNGs na resolução original. Clique no link de download quando estiver pronto. Para o nome Anarruga, os arquivos serão `Anarruga_01.png`, `Anarruga_02.png` etc., dentro de `Anarruga.zip`. A numeração acompanha a ordem atual da lista, inclusive na exportação individual. É possível cancelar a geração do lote.

Limites: 40 MB, 24 megapixels e 16.384 pixels por lado na imagem original; 100 versões e 256 MB de PNGs por lote. Arquivos maiores são rejeitados sem redimensionamento silencioso. A transparência é preservada. O exemplo está embutido em `sample.js` para funcionar também ao abrir o HTML diretamente. A sessão fica na memória da aba: recarregar a página reinicia o trabalho.

## Tratamento da cor

O motor converte sRGB para Oklab, separa a luminosidade da cor original, ancora a luminosidade mediana na cor escolhida e preserva as diferenças de luz com compressão suave. Cores fora do gamut têm o croma reduzido com preservação de matiz e luminosidade. Uma tabela de conversão acelera a troca. Cada aplicação parte da imagem original, evitando degradação cumulativa. O processamento roda em Web Worker local.

O HEX é uma referência para a cor-base; cada fio possui variações de luz. Em imagens com textura, alvos muito próximos de preto e branco recebem uma pequena margem de luminosidade para não eliminar a trama; a interface sinaliza esse caso. A imagem inteira é recolorida, inclusive fundo e estampas: esta versão é destinada a amostras de tecido e não faz segmentação. Não representa uma prova colorimétrica de tecido físico.

Matrizes Oklab: [Björn Ottosson](https://bottosson.github.io/posts/oklab/) (domínio público). Sem bibliotecas de produção.

## Upscale IA (tela separada)

Acesse **Upscale IA ↗** no cabeçalho ou abra http://127.0.0.1:4173/upscale.html após iniciar `node server.cjs` (Node.js 22 ou superior). A tela tem seu próprio upload e não recebe imagens nem versões do estúdio de cor. O link do estúdio abre outra aba para preservar a sessão de recoloração.

Configure a variável de ambiente `OPENROUTER_API_KEY` no Windows e inicie/reinicie o servidor em um terminal que tenha recebido essa variável. A chave é lida apenas pelo servidor, nunca enviada ao navegador nem gravada nos arquivos. Se o terminal estava aberto antes de configurar a variável, abra outro terminal. Nenhuma dependência adicional é necessária.

1. Envie uma imagem PNG, JPG ou WebP. A resolução original em pixels, a quantidade de pixels e o tamanho do arquivo aparecem abaixo do upload.
2. Escolha um modelo. O catálogo é consultado no OpenRouter e filtrado por entrada e saída de imagem, referência única e suporte a 2K ou 4K. Somente as resoluções suportadas ficam habilitadas.
3. Clique em **Processar com IA**. Essa ação envia a imagem ao OpenRouter e usa seus créditos. O upload e a consulta de modelos não iniciam geração. O servidor também confere as capacidades do provedor antes de gerar.
4. Compare original e resultado e clique em **Baixar resultado**. A resolução efetivamente recebida e o custo retornado pela API, quando disponível, aparecem na tela. O original é preservado. O resultado é baixado no formato retornado pelo modelo (PNG, JPG ou WebP).

2K e 4K são faixas de resolução do modelo, não fatores de ampliação. A proporção usa `auto` quando disponível; caso contrário, a proporção suportada mais próxima. A IA pode modificar detalhes, texturas, cores ou transparência. O modelo pode retornar dimensões diferentes das esperadas: confira os pixels exibidos. O processamento usa uma instrução conservadora de restauração, sem recoloração.

Limites de entrada: 40 MB, 24 megapixels e 16.384 px por lado. O envio é convertido localmente para PNG, sem redimensionamento; se esse PNG exceder 40 MB, o processamento é bloqueado. Uma geração por vez, prazo de até 5 minutos no provedor, sem repetição automática de chamadas pagas. Cancelar interrompe a espera e a conexão; confira sua atividade no OpenRouter se a geração já tiver sido concluída. Atualizar ou fechar a página descarta a sessão local.

O servidor escuta somente em `127.0.0.1`, restringe as origens e só publica os arquivos da interface. Ele é voltado a uso local, não a implantação pública multiusuário.

Documentação: [Image API do OpenRouter](https://openrouter.ai/docs/guides/overview/multimodal/image-generation).

## Verificação

`node --test tests/*.test.cjs`

Testes cobrem parsing HEX, round-trip sRGB/Oklab, correspondência em imagem uniforme, neutralidade, ordem tonal, alpha, alvos saturados e extremos, textura e ajustes individuais, validação da lista, nomes sequenciais e estrutura/CRC do ZIP. A integração de IA é testada com respostas simuladas do provedor, sem gastos: filtragem de modelos, referência e resolução, proteção da chave e origem, validações e erros.
