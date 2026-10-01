# OpenRouter e API local

[README](../README.md) · [Uso](guia-de-uso.md) · [Arquitetura](arquitetura.md)

Este guia descreve `openrouter.cjs`, `server.cjs` e `upscale.js`. A integração usa a [Image API do OpenRouter](https://openrouter.ai/docs/guides/overview/multimodal/image-generation). Modelos e preços são consultados durante o uso; não há uma lista ou tarifa fixa neste documento.

## Filtro e PNG

O servidor consulta `GET https://openrouter.ai/api/v1/images/models`. Candidatos precisam declarar entrada e saída de imagem, uma referência permitida, 2K ou 4K e `output_format` contendo `png`.

Para cada candidato, consulta `/images/models/{model}/endpoints`. Um endpoint elegível tem `provider_tag` selecionável, aceita uma referência e declara PNG. As resoluções exibidas são construídas somente desses endpoints. Capacidades distribuídas entre provedores diferentes não bastam.

O catálogo filtrado fica em memória por cinco minutos. **Atualizar modelos** consulta o servidor, mas pode receber esse cache. Reiniciar o servidor limpa o cache. Antes de estimar preço ou gerar, as capacidades do endpoint são consultadas novamente.

A aplicação usa o primeiro endpoint compatível na ordem recebida, fixa `provider.only` e desabilita fallback. Não busca automaticamente o menor preço. Sempre envia `output_format: "png"`.

O formato retornado é identificado pelos bytes, não apenas pelo MIME informado. Saída diferente de PNG é recusada. Não há conversão, troca artificial de extensão ou nova tentativa paga automática. O download preserva os bytes recebidos.

## Prompts exatos

### 2K

```text
Preserve all aspects of the original image. Your goal is simply to upscale the image to 2K resolution. Do not alter the colors, lighting, or texture.
```

### 4K

```text
Preserve all aspects of the original image. Your goal is simply to upscale the image to 4K resolution. Do not alter the colors, lighting, or texture.
```

A imagem vai em `input_references`, como data URL PNG. A proporção usa `auto` quando disponível ou a proporção numérica suportada mais próxima da origem. A resolução também é enviada no campo `resolution`.

O prompt não garante fidelidade de um modelo generativo. A interface mostra as dimensões recebidas e informa quando não são maiores que as da origem.

## Preços

A consulta usa o mesmo critério de endpoint da geração, sem iniciar uma imagem. Os valores são em dólares americanos, sem conversão cambial.

| `estimate.kind` | Significado |
| --- | --- |
| `fixed` | Um total calculável por imagem, somando entrada e saída |
| `range` | Totais distintos, como modalidades de qualidade |
| `variable` | Linha relevante cobra por unidade diferente de imagem, como token ou megapixel |
| `unknown` | Dados insuficientes ou variante não resolvida |

O cálculo considera `input_image`, `input_reference` e `output_image`. Busca a variante exata da resolução ou um sufixo como `_4k`. Se há tarifas por resolução e falta a selecionada, não usa 2K ou tarifa-base como preço de 4K. Entradas por imagem são somadas quando determináveis.

A estimativa não é um orçamento garantido: catálogo e condições do provedor podem mudar. Após gerar, a interface mostra `usage.cost` quando informado. `cost: null` significa valor não informado, não gratuidade.

## API local

Base padrão: `http://127.0.0.1:4173`. Ajuste a porta conforme `PORT`. Respostas JSON usam `Cache-Control: no-store`. Erros têm formato `{ "error": "mensagem" }`.

### `GET /api/ai/models`

Sem chave, retorna HTTP 200:

```json
{ "configured": false, "models": [] }
```

Exemplo com modelo fictício elegível:

```json
{
  "configured": true,
  "models": [
    { "id": "vendor/model", "name": "Exemplo", "resolutions": ["2K", "4K"] }
  ]
}
```

A lista pode estar vazia mesmo com chave configurada.

### `GET /api/ai/pricing?model={id}&resolution=2K`

Use parâmetros codificados por `URLSearchParams`. Exemplo de resposta com valores fictícios:

```json
{
  "model": "vendor/model",
  "resolution": "2K",
  "provider": "provider-tag",
  "pricing": [
    { "billable": "output_image", "unit": "image", "cost_usd": 0.04, "variant": "2k" }
  ],
  "estimate": { "kind": "fixed", "min": 0.04, "max": 0.04 }
}
```

Para `variable` e `unknown`, `estimate` contém somente `kind`. As linhas publicadas continuam em `pricing`.

### `POST /api/ai/upscale`

Essa rota inicia geração cobrada pelo provedor, após ação do usuário. Exige `Content-Type: application/json`, `Origin` exatamente igual à origem local usada e `X-Raz-Request: image-upscale`.

Corpo ilustrativo; o marcador precisa ser substituído por PNG válido:

```json
{
  "model": "vendor/model",
  "resolution": "4K",
  "image": "data:image/png;base64,<PNG válido>"
}
```

Aceita somente `2K` ou `4K`. A entrada deve ter assinatura PNG e cabeçalho IHDR válidos, até 40 MiB, 24 milhões de pixels e 16.384 px por lado. URLs externas não são aceitas. A interface prepara o PNG necessário.

Resposta:

```json
{
  "image": "data:image/png;base64,<PNG retornado>",
  "model": "vendor/model",
  "resolution": "4K",
  "cost": null
}
```

`resolution` informa a solicitação; o navegador decodifica `image` para descobrir as dimensões efetivas.

## Erros e cancelamento

| HTTP | Situação |
| --- | --- |
| 400 | Entrada ou capacidades inválidas; parâmetros recusados pelo provedor |
| 401 | Chave recusada |
| 402 | Créditos insuficientes |
| 403 | Host, origem ou cabeçalho recusados; falta de permissão no provedor |
| 404 | Rota inexistente |
| 409 | Outra geração nessa instância está em andamento |
| 413 | Corpo ou imagem acima do limite de bytes |
| 415 | POST sem JSON |
| 429 | Limite de requisições do OpenRouter |
| 499 | Operação abortada, se ainda for possível responder |
| 500 | Erro interno não classificado |
| 502 | Comunicação, resposta ou formato inválido do provedor |
| 503 | Chave ausente para operação que a exige |
| 504 | Tempo de espera do provedor excedido |

O transporte remoto aguarda até 20 segundos por consulta e 300 segundos por geração. O navegador limita catálogo/preços a 30 segundos e a requisição de processamento a 330 segundos.

A trava permite uma geração por instância de `createOpenRouter`, não por todos os servidores da máquina. Cancelar ou desconectar propaga um sinal de aborto, sem confirmar interrupção do trabalho ou da cobrança no provedor. Não há repetição automática, inclusive quando o resultado não é PNG.

## Diagnóstico sem gerar imagens

Com o servidor iniciado, estes comandos consultam somente catálogo e preços:

```powershell
$base = 'http://127.0.0.1:4173'
$catalogo = Invoke-RestMethod "$base/api/ai/models"
$catalogo.models | Select-Object id, name, resolutions
if ($catalogo.models.Count -gt 0) {
  $modelo = $catalogo.models[0]
  $id = [uri]::EscapeDataString($modelo.id)
  $resolucao = $modelo.resolutions[0]
  Invoke-RestMethod "$base/api/ai/pricing?model=$id&resolution=$resolucao"
}
```

Não imprima a chave para diagnosticar problemas. Para conferir sem rede nem custos: `node --test tests/openrouter.test.cjs`.
