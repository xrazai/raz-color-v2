# Instalação e uso

[README](../README.md) · [Arquitetura](arquitetura.md) · [OpenRouter](openrouter.md)

## Requisitos e inicialização

Use Chrome ou Edge com JavaScript habilitado. A recoloração funciona ao abrir `index.html`, sem servidor ou conexão externa. Para a IA, é necessário Node.js 22 ou superior, internet e uma chave OpenRouter com créditos.

Abra um PowerShell na pasta do projeto:

```powershell
node --version
node server.cjs
```

O endereço padrão é `http://127.0.0.1:4173`. Mantenha o terminal aberto. `Ctrl+C` encerra o servidor iniciado nesse terminal. Não há dependências para instalar nem etapa de compilação.

No Windows, abra **Editar as variáveis de ambiente da sua conta**, crie `OPENROUTER_API_KEY` e coloque sua chave como valor. Depois, abra um novo terminal e inicie o servidor nele. Processos abertos anteriormente podem continuar com o ambiente antigo.

Verifique apenas a presença da chave, sem exibir seu conteúdo:

```powershell
if ($env:OPENROUTER_API_KEY) { 'Chave presente no terminal' } else { 'Chave ausente no terminal' }
```

O projeto lê o ambiente do processo e não carrega `.env` automaticamente. Não coloque a chave em arquivos do projeto ou commits.

Para escolher outra porta:

```powershell
$env:PORT = '4174'
node server.cjs
```

Abra `http://127.0.0.1:4174/upscale.html`. A variável desse exemplo vale para o terminal atual e os processos iniciados por ele. Use sempre o endereço do servidor atualizado: 4173 e 4174 podem executar versões diferentes. Servidores que apenas publicam arquivos estáticos não oferecem a API de IA.

## Recolorir tecidos

1. Clique em **Trocar imagem** ou arraste um PNG, JPG ou WebP. A amostra inicial é embutida no projeto.
2. Preencha **Nome do tecido**, usado nos nomes dos arquivos exportados.
3. Cole HEX de três ou seis dígitos, com ou sem `#`, separados por linha, espaço, vírgula ou ponto e vírgula. Clique em **Adicionar cores**.
4. Selecione uma miniatura e ajuste HEX, exposição, saturação e hue. Esses ajustes pertencem somente à versão selecionada.
5. Use **Textura global** para alterar a intensidade da trama de todas as versões.

Exemplo de lista:

```text
#687B62
#BA7C63
#304257
```

A lista começa com uma versão. Adicionar cores anexa novas versões; repetições são permitidas. Se houver um HEX inválido, a inclusão inteira é recusada. Remover uma versão renumera as seguintes; a última versão não pode ser removida. Trocar a imagem preserva paleta e ajustes.

| Ajuste | Intervalo | Valor inicial |
| --- | --- | --- |
| Exposição | −2 a +2 EV | 0 EV |
| Saturação | 0 a 200% | 100% |
| Hue | −180° a +180° | 0° |
| Textura global | 0 a 200% | 100% |

Toda a imagem é recolorida, inclusive fundo e estampas. Não há segmentação. O HEX define uma cor-base, mantendo variações de luz nos fios; não é uma prova colorimétrica de tecido físico.

## Inspeção e zoom

No estúdio, escolha **Original**, **Base neutra**, **Cor aplicada** ou **Comparar**. Na comparação de cores, as imagens compartilham zoom e deslocamento. No upscale, cada prévia tem controles independentes.

| Controle | Ação |
| --- | --- |
| Ajustar | Enquadra a imagem |
| 1:1 | Mostra 100%, usando as dimensões originais |
| − / + | Diminui ou aumenta o zoom |
| Percentual | Aceita um valor até 800% |
| Roda / arrastar | Amplia ao redor do cursor / desloca a imagem |
| Dois dedos | Amplia e desloca em tela touch |
| Duplo clique | Alterna entre 1:1 e enquadramento |
| `+`, `−`, `0`, `1` | Com o painel em foco: zoom, ajustar e 1:1 |
| Setas / `Shift` + setas | Deslocamento normal / maior |

**Expandir**, no estúdio de cores, aumenta a área de inspeção; `Esc` retorna. O zoom não altera os pixels exportados. Para comparar imagens com resoluções diferentes, use **Ajustar** nas duas: 100% pode mostrar recortes de escalas distintas.

## Exportar cores

**Exportar esta versão** prepara um PNG. **Exportar todas** prepara um ZIP na ordem da lista, em resolução original. Clique no link de download depois da preparação. Fechar o diálogo durante a preparação cancela o lote.

Para o nome `Anarruga`, os arquivos serão `Anarruga_01.png`, `Anarruga_02.png` etc., dentro de `Anarruga.zip`. A exportação individual usa a posição da versão na lista. Caracteres incompatíveis com nomes de arquivo são normalizados. A transparência da origem é preservada.

## Upscale com IA

Acesse **Upscale IA ↗**. A tela abre em outra aba e tem upload próprio; não recebe automaticamente as variantes do estúdio.

1. Envie a imagem. Confira as dimensões, a quantidade de pixels e o tamanho do arquivo exibidos.
2. Escolha o modelo e 2K ou 4K. Apenas modelos com controle explícito de saída PNG aparecem; referência, resolução e PNG precisam ser suportados pelo mesmo provedor selecionável.
3. Confira o preço: valor calculável, faixa ou tarifa variável. Quando faltam dados, a interface informa que não há estimativa.
4. Clique em **Processar com IA**. É nesse momento que a imagem é enviada e uma geração é solicitada usando os créditos da conta.
5. Compare o resultado e clique em **Baixar PNG**. O botão está visível desde o início, mas desabilitado sem resultado e durante o processamento.

O resultado é baixado sem conversão ou redimensionamento. Se o provedor devolver outro formato, a aplicação informa um erro e não repete a geração. A preparação da imagem de entrada em PNG é uma etapa separada.

2K e 4K são faixas de resolução, não fatores de ampliação de duas ou quatro vezes. Confira as dimensões recebidas. O prompt pede preservação, mas o modelo generativo pode alterar textura, iluminação, cor ou transparência. Os [prompts exatos](openrouter.md) são definidos no servidor.

**Cancelar processamento** interrompe a espera e a conexão, sem garantir cancelamento da cobrança no provedor. Consulte a atividade da conta se a geração já tiver começado. Uma tentativa malsucedida não apaga um resultado anterior concluído; enviar outra imagem de origem limpa o resultado.

## Limites e sessão

| Item | Limite |
| --- | --- |
| Formatos de entrada | PNG, JPG e WebP |
| Arquivo de entrada | 40 MiB, exibidos como 40 MB |
| Imagem decodificada | 24 milhões de pixels; até 16.384 px por lado |
| Versões de cor | 100, incluindo as existentes |
| Exportação em lote | 256 MiB somados de PNGs, antes da estrutura do ZIP |
| PNG preparado para envio à IA | 40 MiB |
| Geração | Uma por vez por instância do servidor; até 5 minutos no provedor |

Arquivos acima dos limites são recusados sem redução automática. A sessão fica na memória da aba: atualizar ou fechar a página descarta o trabalho. Não há salvamento de projeto ou restauração automática.

## Solução de problemas

| Sintoma | Ação |
| --- | --- |
| Catálogo indisponível | Confirme a porta do Node atual, conexão e chave. Um servidor estático ou antigo não oferece as rotas atuais. |
| Chave não encontrada | Configure a variável, abra outro terminal e reinicie o Node. |
| Modelo não aparece | Verifique suporte declarado a PNG, referência e resolução no mesmo provedor. O catálogo muda com o tempo. |
| 4K indisponível | O endpoint compatível pode oferecer PNG com referência apenas em 2K. |
| Preço indisponível | Atualize modelos e consulte o link de tarifas antes de gerar. |
| Porta ocupada (`EADDRINUSE`) | Escolha outra porta ou encerre o servidor iniciado por você no terminal correspondente. |
| Chave recusada / créditos insuficientes | Confira a chave e o saldo no OpenRouter. |
| Provedor não retornou PNG | O resultado é rejeitado sem conversão. Confira a atividade da conta antes de gerar novamente. |
| Resultado alterou a trama | Compare as imagens enquadradas. O prompt não garante fidelidade de um modelo generativo. |
| PNG preparado excedeu 40 MB | Um JPG/WebP pequeno pode virar um PNG maior. Prepare uma imagem menor antes do envio. |

Alterações nos arquivos `.cjs` exigem reiniciar o servidor. Alterações na interface exigem atualizar a aba; salve os resultados antes.
