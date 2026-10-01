# Verificação — 01/10/2026

> Registro histórico da versão inicial e primeira etapa de inspeção. Referências a `app.js`, contagens de testes e limitações abaixo pertencem àquela etapa. Consulte o [roteiro atual](arquitetura.md).

## Atualização de inspeção

Zoom por percentual confirmado com Enter em 200% e 150%; botões de 100% → 125% → 100%; roda do mouse até o limite de 800%; arraste com deslocamento observado de 160 × 100 px. Na comparação, os dois canvases mantiveram transformações idênticas. Ajustar reenquadrou as imagens; Esc restaurou a interface e o foco. Inspeção expandida verificada no desktop e em 390 × 844, sem erros no console. Pinça touch implementada, mas gesto multitoque não foi exercitado pela automação. Capturas: `design/inspection.jpg` e `design/inspection-mobile.jpg`. Dimensões internas dos canvases permaneceram 1254 × 1254; o zoom usa transformações CSS. Seis testes existentes do motor continuam passando.

- Motor: 6 testes passando em `node --test tests/color.test.cjs`.
- Sintaxe: `node --check app.js` e `node --check color-engine.js`.
- Navegador interno do Codex, http://127.0.0.1:4173. Desktop 1440 × 1000 e mobile 390 × 844. Sem erros/avisos no console durante as interações verificadas.
- Verificados: carregamento do exemplo, upload PNG diferente (48 × 32), HEX inválido, troca para terracota, base neutra, comparação e restauração da cor aplicada.
- PNG efetivamente gerado pela UI extraído da prévia: 48 × 32, RGB alterado e zero divergências de alpha em todos os 1.536 pixels, inclusive alpha 0 e 128. PNG do exemplo decodificado em 1254 × 1254.
- Limitação da automação: o evento de download não retornou no IAB/Chrome. O arquivo gerado foi verificado diretamente a partir do `src` da prévia PNG. Salvar pelo gerenciador de downloads do usuário não foi confirmado. O upload via extensão Chrome requer permissão adicional para arquivos locais; foi verificado no IAB sem alterar permissões.

## Comparação visual

Referência: `design/concept.png`, gerada pela ferramenta Image Gen integrada a partir do briefing de estúdio de cor em português, com painéis claros, ação lima, upload, HEX e prévia de tecido sem sliders. Inspeção via view_image da referência e capturas do navegador.

Pontos comparados: marca/cabeçalho; título serifado; painel de origem; amostra/HEX/paleta; ação lima; controles de visualização; área central de tecido; rodapé. Layout e linguagem visual preservados. O tecido usa os pixels reais enviados pelo usuário, em lugar da trama ilustrativa gerada no conceito. Painel esquerdo de 300 px e tipografia dos controles mais compactos são adaptações intencionais. Texto adicional explica formatos, drop e aplicação à imagem inteira. Modal de exportação adicionado para prévia e download explícito. Nenhuma alteração acidental no título ou subtítulo.

Não houve teste de segmentação (não implementada), correspondência colorimétrica com amostra física, HEIC/TIFF (não suportados) ou arquivo no limite de 24 megapixels. Drag/drop implementado; upload verificado pelo seletor de arquivos.
