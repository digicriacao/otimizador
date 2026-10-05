# Otimizador de Imagens · Digi

Plataforma web para **converter, redimensionar, renomear e otimizar imagens em lote**, com leitura direta de pastas do **SharePoint/OneDrive, Google Drive e Dropbox**. Roda 100% no navegador: as imagens não passam por nenhum servidor, então não há custo de hospedagem nem de processamento.

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
| Saída | ZIP (mantendo subpastas), salvar direto numa pasta do computador (Chrome/Edge), enviar de volta para a nuvem (em subpasta ou na mesma pasta) |
| Extras | Comparador antes/depois, resumo da economia, predefinições (Web, Redes sociais, E-mail marketing, Miniatura, Responsivo…) e predefinições próprias, código `<img srcset>` pronto com `width`, `height` e `loading="lazy"` |

## Estrutura

```
index.html              interface
auth-callback.html      página de retorno do login (Microsoft e Dropbox)
logo-rosa.png           ← suba a logo da Digi aqui (sem ela aparece "digi" em texto)
.nojekyll               faz o GitHub Pages servir todos os arquivos como estão
assets/
  css/styles.css        identidade visual (todas as cores no topo do arquivo)
  js/config.js          IDs das integrações com nuvem  ← único arquivo a editar
  js/app.js             fila, opções, downloads e envio
  js/worker.js          processamento (roda em segundo plano)
  js/dims.js            cálculo de dimensões
  js/naming.js          regras de nomes
  js/cloud/             microsoft.js · google.js · dropbox.js · common.js
vendor/                 bibliotecas de código aberto já incluídas (sem CDN)
```

## Publicar no GitHub Pages

1. Crie um repositório (ex.: `otimizador`) e envie **todo o conteúdo desta pasta** para a raiz (inclusive `.nojekyll` e a pasta `vendor`).
2. Suba a `logo-rosa.png` na raiz.
3. Em **Settings → Pages**, escolha *Deploy from a branch*, branch `main`, pasta `/ (root)`.
4. Em 1–2 minutos o site fica em `https://SEU-USUARIO.github.io/otimizador/`.

Pronto: conversão, otimização, renomeação e lote já funcionam sem nenhuma chave. As integrações com nuvem são opcionais e estão abaixo.

> Não abra o `index.html` com duplo clique: o navegador bloqueia os módulos em `file://`. Para testar no computador, rode `python -m http.server` na pasta e acesse `http://localhost:8000`.

## APIs: o que você precisa fornecer

Todas são **gratuitas**. Nenhuma pede cartão. O que vai no código é só um ID público de aplicativo (não é senha), então pode ficar no GitHub.

| Integração | O que fornecer | Onde criar | Custo |
| --- | --- | --- | --- |
| Arquivos locais, links, pastas sincronizadas | nada | — | grátis |
| SharePoint / OneDrive | **Client ID** (+ Tenant ID) | Microsoft Entra ID | grátis |
| Google Drive | **OAuth Client ID** | Google Cloud Console | grátis |
| Dropbox | **App key** | Dropbox App Console | grátis |

Depois de criar, cole os IDs em `assets/js/config.js` (vale para toda a equipe) ou no ícone de engrenagem do site (vale só para aquele navegador).

Em todos os casos o **endereço de retorno** é:
`https://SEU-USUARIO.github.io/otimizador/auth-callback.html`
(a engrenagem do site mostra o endereço exato).

> **Atalho sem API:** se a pasta do SharePoint estiver sincronizada pelo OneDrive no computador, basta usar *Selecionar pasta inteira* e depois *Salvar em pasta* apontando para a mesma pasta sincronizada. O OneDrive sobe o resultado sozinho.

### 1. SharePoint / OneDrive (Microsoft Graph)

1. Acesse [entra.microsoft.com](https://entra.microsoft.com) → **Aplicativos → Registros de aplicativo → Novo registro**.
2. Nome: `Otimizador Digi`. Tipos de conta: *Somente contas deste diretório* (recomendado).
3. **URI de redirecionamento**: plataforma **Aplicativo de página única (SPA)** → cole o endereço de retorno acima.
4. Em **Permissões de API → Adicionar → Microsoft Graph → Permissões delegadas**, adicione `Files.ReadWrite.All`, `Sites.Read.All` e `User.Read`.
5. Se a empresa bloqueia consentimento de usuários, peça ao administrador para clicar em **Conceder consentimento do administrador**.
6. Copie o **ID do aplicativo (cliente)** e o **ID do diretório (locatário)** para o `config.js`.

Uso: no SharePoint, clique com o botão direito na pasta → **Copiar link** → cole na aba SharePoint → *Carregar pasta*.

### 2. Google Drive

1. Acesse [console.cloud.google.com](https://console.cloud.google.com), crie um projeto e ative a **Google Drive API** (*APIs e serviços → Biblioteca*).
2. Em **Tela de consentimento OAuth**, escolha **Interno** se a Digi usa Google Workspace (evita a verificação do Google). Se for conta Gmail comum, use *Externo* e adicione os e-mails da equipe como **usuários de teste**.
3. Em **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**.
4. Em **Origens JavaScript autorizadas**, adicione `https://SEU-USUARIO.github.io`.
5. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`) para o `config.js`.

### 3. Dropbox

1. Acesse [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) → **Create app** → *Scoped access* → *Full Dropbox*.
2. Aba **Permissions**: marque `files.metadata.read`, `files.content.read`, `files.content.write` e `sharing.read` e clique em *Submit*.
3. Aba **Settings**: em *OAuth 2 → Redirect URIs*, adicione o endereço de retorno; em *Allow public clients (Implicit Grant & PKCE)*, deixe **Allow**.
4. Copie o **App key** para o `config.js`.
5. Enquanto o app estiver em modo de desenvolvimento, até 500 usuários podem conectar, o que costuma bastar para uso interno.

## Limites e observações

- **Tudo roda no computador de quem usa.** Lotes de centenas de fotos funcionam, mas o tempo depende da máquina. AVIF é o formato mais lento de gerar.
- **GIF para WebP/AVIF animado** não está incluído: ao desmarcar *Manter GIFs animados*, o GIF vira imagem estática (1º quadro).
- **Links diretos** só funcionam com sites que permitem download por outros domínios (CORS).
- **Salvar em pasta** usa a File System Access API: Chrome e Edge. Nos outros navegadores, use o ZIP.
- **HEIC** é convertido com `heic2any` (pode demorar em fotos grandes).
- Metadados (EXIF, GPS, perfil de câmera) são sempre removidos.

## Bibliotecas incluídas (todas de código aberto)

jSquash (MozJPEG, OxiPNG, libwebp, libavif, resize) · gifsicle-wasm-browser · image-q · SVGO · heic2any · fflate · MSAL.js. As licenças estão na pasta `vendor/`.
