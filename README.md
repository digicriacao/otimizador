# Otimizador de Imagens · Digi

Plataforma web para **converter, redimensionar, renomear e otimizar imagens em lote**, com leitura direta de pastas do **SharePoint/OneDrive**. Por padrão roda 100% no navegador, sem servidor e sem custo. Há também um modo **Online**, gratuito, que processa os lotes nos servidores do GitHub Actions.

## O que ela faz

| Recurso | Detalhes |
| --- | --- |
| Conversão | JPG, PNG, WebP, AVIF e modo **Auto** (testa e fica com o menor arquivo) |
| Entrada | JPG, PNG, WebP, AVIF, GIF, SVG, HEIC/HEIF (iPhone), BMP |
| Compressão | MozJPEG, OxiPNG, libwebp e libavif (os codecs do Squoosh, do Google), em WebAssembly |
| PNG com paleta | Redução para 256/128/64… cores (técnica do TinyPNG), até 70% menor |
| Tamanho máximo | Ex.: "no máximo 200 KB": a qualidade é ajustada sozinha |
| Sem perdas | WebP/AVIF lossless |
| Redimensionar | Largura, altura, lado maior, caber em caixa, porcentagem, preencher e cortar, **várias larguras (srcset)**. Sempre mantém a proporção; opção de não aumentar imagens pequenas |
| Recorte | 1:1, 4:5, 16:9, 9:16, 3:2, 4:3, 1,91:1 (centralizado) |
| GIF | Otimização com Gifsicle (perdas, nº de cores, nível -O1/-O2/-O3) mantendo a animação, com resize |
| SVG | Limpeza vetorial com SVGO, ou conversão para imagem |
| Nomes | Manter, prefixo, sufixo, prefixo + sufixo, sequência numerada, modelo com tokens (`{nome}` `{n}` `{largura}` `{altura}` `{dim}` `{formato}` `{qualidade}` `{data}` `{pasta}`), dimensões ao fim (`-1920x1080`), formato ao fim (`-webp`), nome amigável para web |
| Ajustes | Girar, espelhar, preto e branco, nitidez após reduzir. Remove EXIF/GPS e aplica a rotação do celular |
| Lote | Arrastar arquivos ou pastas inteiras, colar (Ctrl+V), links diretos, processamento paralelo |
| Onde processar | **No navegador** (padrão) ou **Online** (GitHub Actions). Imagens do SharePoint são sempre processadas no navegador |
| Saída | ZIP (mantendo subpastas), salvar direto numa pasta do computador (Chrome/Edge), enviar de volta para a nuvem (em subpasta ou na mesma pasta) |
| Visual | Tema claro e escuro (segue o sistema, com botão no topo), favicon animado que mostra o progresso do lote, imagem de compartilhamento (OG) |
| Guia | **Boas práticas para imagens** (abaixo das opções): formatos, qualidade, tamanhos, pesos-alvo, srcset, performance, favicon, OG, redes sociais, e-mail, GIF, logos, cor, nomes, acessibilidade, impressão e checklist. Link direto: `#boas-praticas`. Texto editável em `assets/js/guide.js` |
| Extras | Comparador antes/depois, resumo da economia, predefinições (Web, Redes sociais, E-mail marketing, Miniatura, Responsivo…) e predefinições próprias, código `<img srcset>` pronto com `width`, `height` e `loading="lazy"` |

## Estrutura

```
index.html              interface
auth-callback.html      página de retorno do login da Microsoft
.nojekyll               faz o GitHub Pages servir todos os arquivos como estão
public/
  logo-rosa.png         logo do topo (temas claro e escuro)
  logo-escuro.png       logo do rodapé no tema claro
  logo-claro.png        logo do rodapé no tema escuro
  favicon.svg / favicon-32.png / apple-touch-icon.png
  og-image.png          imagem de compartilhamento (1200×630)
assets/
  css/styles.css        identidade visual: cores do tema claro no topo, tema escuro no fim
  js/config.js          IDs do SharePoint e endereço do intermediário do modo Online
  js/favicon.js         animação do favicon
  js/online.js          envio e acompanhamento do processamento online
  js/guide.js           conteúdo do guia de boas práticas
  js/app.js             fila, opções, downloads e envio
  js/worker.js          processamento (roda em segundo plano)
  js/dims.js            cálculo de dimensões
  js/naming.js          regras de nomes
  js/cloud/             microsoft.js · common.js
vendor/                 bibliotecas de código aberto já incluídas (sem CDN)
```

## Publicar no GitHub Pages

1. Crie um repositório (ex.: `otimizador`) e envie **todo o conteúdo desta pasta** para a raiz (inclusive `.nojekyll` e a pasta `vendor`).
2. Em **Settings → Pages**, escolha *Deploy from a branch*, branch `main`, pasta `/ (root)`.
3. Em 1–2 minutos o site fica em `https://digicriacao.github.io/otimizador/`.

Pronto: conversão, otimização, renomeação e lote funcionam sem nenhuma chave.

> **Compartilhamento (OG):** as tags apontam para `https://digicriacao.github.io/otimizador/`. Se o endereço mudar (outro repositório ou domínio próprio), troque esse endereço nas tags `og:` e `twitter:` do `index.html`. Para conferir a prévia, use o [Post Inspector do LinkedIn](https://www.linkedin.com/post-inspector/) ou o [Sharing Debugger do Facebook](https://developers.facebook.com/tools/debug/).

> Não abra o `index.html` com duplo clique: o navegador bloqueia os módulos em `file://`. Para testar no computador, rode `python -m http.server` na pasta e acesse `http://localhost:8000`.

## SharePoint / OneDrive (Microsoft Graph)

O app da Digi já está configurado em `assets/js/config.js`:

| Campo | Valor |
| --- | --- |
| ID do aplicativo (cliente) | `d7ece8ff-91c1-4808-b7cd-eda1dbd1a368` |
| ID do diretório (locatário) | `16d33860-3ad3-492d-a8cb-1ef530cbaab8` |

Esses IDs são públicos (não são senhas). Para o login funcionar, confira no [Microsoft Entra](https://entra.microsoft.com) → **Registros de aplicativo → Otimizador**:

1. **Autenticação → Adicionar plataforma → Aplicativo de página única (SPA)** com o URI de redirecionamento
   `https://digicriacao.github.io/otimizador/auth-callback.html`
   (precisa ser do tipo **SPA**; se estiver como "Web", o login falha com erro AADSTS9002326).
2. **Permissões de API → Microsoft Graph → Permissões delegadas**: `Files.ReadWrite.All`, `Sites.Read.All` e `User.Read`.
3. Se a empresa bloqueia consentimento de usuários, o administrador precisa clicar em **Conceder consentimento do administrador para Digi**.
4. Para testar no computador (`http://localhost:8000`), adicione também `http://localhost:8000/auth-callback.html` como SPA.

Uso: no SharePoint, clique com o botão direito na pasta → **Copiar link** → cole na aba SharePoint → *Carregar pasta*. Depois de otimizar, *Enviar para a nuvem* grava o resultado numa subpasta (padrão `otimizadas`) ou na mesma pasta.

> **Atalho sem login:** se a pasta do SharePoint estiver sincronizada pelo OneDrive no computador, use *Selecionar pasta inteira* e depois *Salvar em pasta* apontando para a mesma pasta sincronizada. O OneDrive sobe o resultado sozinho.

## Processamento online (GitHub Actions)

No topo da fila, o seletor **No navegador / Online** escolhe onde as imagens são processadas. No modo Online:

1. a plataforma compacta o lote e cria um branch temporário `jobs/<id>` num **repositório privado**;
2. o GitHub Actions otimiza as imagens (sharp/libvips, MozJPEG, libwebp, libavif, Gifsicle, HEIC);
3. a plataforma baixa o resultado para a mesma fila e **apaga o branch**. Um workflow diário apaga lotes esquecidos.

As opções, os nomes, o ZIP, o comparador e o código `<picture>` funcionam igual aos do modo local.

**Fica sempre no navegador:** imagens do SharePoint, SVG e BMP. Em lotes misturados, essas imagens são processadas localmente e as demais vão para a nuvem.

**Por que um repositório separado e privado:** o repositório do site precisa ser público para o GitHub Pages gratuito. Se os lotes fossem para ele, as imagens ficariam visíveis enquanto processam.

### Configuração (uma vez)

1. **Crie o repositório privado** `digicriacao/otimizador-processamento`. Se usar outro nome, troque `github.repo` em `assets/js/config.js`.
2. **Envie o conteúdo da pasta `processamento-online`** (do ZIP separado) para a raiz desse repositório, incluindo a pasta oculta `.github`.
   - Se o upload pelo navegador ignorar a pasta `.github` (o Mac esconde pastas com ponto), crie os dois arquivos em **Add file → Create new file**, com os caminhos `.github/workflows/processar.yml` e `.github/workflows/limpar.yml`, e cole o conteúdo de cada um.
3. Ainda no repositório privado, vá em **Settings → Actions → General** e confira duas opções:
   - *Actions permissions* deve permitir as actions.
   - Em *Workflow permissions*, marque **Read and write permissions**.
4. **Crie um token do GitHub** (um só, para toda a equipe), logado na conta `digicriacao`, em [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new):
   - Tipo: **Fine-grained**. *Resource owner*: `digicriacao`.
   - *Repository access*: **Only select repositories → otimizador-processamento**.
   - *Permissions → Repository*: **Contents: Read and write** e **Actions: Read-only**.
   - Validade: a mais longa disponível. Anote a data de vencimento.
5. **Publique o intermediário no Cloudflare** (grátis, sem cartão). O token fica guardado nele como segredo e nunca vai para o site:
   1. Crie uma conta em [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
   2. Vá em **Workers & Pages → Create → Create Worker**, dê o nome `otimizador-digi` e clique em **Deploy**.
   3. Clique em **Edit code**, apague o código de exemplo, cole o conteúdo de `cloudflare-worker/worker.js` (do ZIP de processamento) e clique em **Deploy**.
   4. Em **Settings → Variables and Secrets → Add**, escolha o tipo **Secret**, com nome `GITHUB_TOKEN` e o token como valor. Salve com **Deploy**.
   5. Copie o endereço do Worker (algo como `https://otimizador-digi.SUA-CONTA.workers.dev`).
6. **Cole o endereço** em `assets/js/config.js`, no campo `github.proxy`, e envie o arquivo para o repositório do site. Pronto: o botão **Online** passa a funcionar para todo mundo, sem configurar nada.

**Por que um intermediário:** tudo o que está no site (inclusive o `config.js`) pode ser lido por qualquer pessoa no navegador, mesmo com o repositório privado. Além disso, o GitHub cancela sozinho tokens encontrados em repositórios públicos. O Worker guarda o token e só aceita as operações do otimizador: criar e apagar lotes `jobs/*`, acompanhar o processamento e baixar o resultado. Ele não altera nenhum código e só aceita pedidos vindos do endereço do site.

**Quando o token vencer ou precisar ser trocado:** gere outro e substitua o segredo `GITHUB_TOKEN` no Worker. Não é preciso mexer no site.

### Custos e limites

- Repositórios privados no plano gratuito do GitHub têm **2.000 minutos de Actions por mês**. Cada lote usa cerca de 1 minuto de preparação mais o tempo de processamento. Fotos comuns levam menos de 1 s cada; AVIF demora mais.
- O Cloudflare Workers gratuito permite 100 mil pedidos por dia; cada lote usa algumas dezenas.
- Lotes acima de ~40 MB ou de 150 imagens são divididos automaticamente, e até 3 lotes rodam ao mesmo tempo.
- O resultado de cada lote precisa ter menos de 100 MB (limite da API do GitHub).
- O endereço do Worker é público. Fora do site ele recusa os pedidos, mas alguém determinado poderia usar o processamento e gastar minutos do mês. No plano gratuito isso nunca vira cobrança: no pior caso, o modo Online para até o mês virar (o modo No navegador continua funcionando).
- Entre o clique e o início do processamento costuma haver de 20 a 60 s (fila do GitHub + instalação). Para poucas imagens, o modo local é mais rápido. O online compensa em lotes grandes, em computadores mais fracos e com HEIC/AVIF.
- A lógica de dimensões está em dois lugares: `assets/js/dims.js` (site) e `processar/dims.js` (repositório privado). Se mudar uma, copie para a outra.

## Limites e observações

- **No modo No navegador, tudo roda no computador de quem usa.** Lotes de centenas de fotos funcionam, mas o tempo depende da máquina. AVIF é o formato mais lento de gerar; para lotes pesados, use o modo Online.
- **GIF para WebP/AVIF animado** não está incluído: ao desmarcar *Manter GIFs animados*, o GIF vira imagem estática (1º quadro).
- **Links diretos** só funcionam com sites que permitem download por outros domínios (CORS).
- **Salvar em pasta** usa a File System Access API: Chrome e Edge. Nos outros navegadores, use o ZIP.
- **HEIC** é convertido com `heic2any` no navegador (pode demorar em fotos grandes) ou com `heic-convert` no modo Online.
- Metadados (EXIF, GPS, perfil de câmera) são sempre removidos.

## Bibliotecas incluídas (todas de código aberto)

jSquash (MozJPEG, OxiPNG, libwebp, libavif, resize) · gifsicle-wasm-browser · image-q · SVGO · heic2any · fflate · MSAL.js. As licenças estão na pasta `vendor/`.
