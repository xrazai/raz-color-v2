# Raz / cores

> Registro histórico da implementação inicial. Consulte o [README](../README.md) e a [arquitetura atual](arquitetura.md) para a versão presente.

Aplicação local estática para carregar uma fotografia de tecido, neutralizar a cor original e aplicar um HEX, preservando variações de luminosidade e transparência. Sem sliders. Upload PNG/JPEG/WebP por botão e drop. Exemplo inicial fornecido pelo usuário. Exportação PNG da cor aplicada, em resolução original. Fotos com fundo serão recoloridas por inteiro; não há segmentação nesta versão.

Design: referência visual gerada em design/concept.png; fundo #F7F7F3, painel branco, tipografia editorial serifada nos títulos, controles sans-serif, ação #DDF064. Original, base neutra, cor aplicada e comparação lado a lado; ajuste de zoom por botões.

Motor: sRGB → luz linear → Oklab. Extrair L por pixel e mediana ponderada por alpha. Remover a/b da origem. Reancorar L na cor alvo, mantendo o relevo com compressão suave nos extremos. Ajustar croma ao gamut sRGB mantendo hue e L. Lookup table para evitar conversões caras por pixel ao trocar cor. Nunca recolorir um resultado anterior. Branco/preto absolutos usam uma pequena margem de luz em fotos com textura, explicitamente indicada na interface.

Plano de execução
- [x] Testes do motor: conversões, HEX, cor uniforme, neutralidade, ordem tonal, transparência, saturação e extremos.
- [x] Motor independente + interface estática responsiva; processamento em lotes para manter UI responsiva.
- [x] Upload validado, concorrência, zoom, comparação, PNG e mensagens de erro.
- [x] Verificação real no navegador desktop/mobile, upload, HEX inválido, exportação e fidelidade visual.

Limites: processamento limitado a 24 megapixels e 40 MB por arquivo, com rejeição explícita sem redução silenciosa. Não promete correspondência física de tinta/tingimento. Cor baseada em sRGB.

Fonte das matrizes Oklab: https://bottosson.github.io/posts/oklab/ (Björn Ottosson, domínio público).
