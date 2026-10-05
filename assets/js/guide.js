/* =========================================================================
   Guia de boas práticas para imagens
   Conteúdo do modal "Boas práticas". Cada seção vira um item do índice.
   Para editar o texto, altere o HTML de cada seção abaixo.
   ========================================================================= */

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const code = (s) => `<pre class="g-code"><button class="g-copy" type="button">Copiar</button><code>${esc(s.trim())}</code></pre>`;
const tip = (s) => `<div class="g-tip"><b>No Otimizador</b>${s}</div>`;
const warn = (s) => `<div class="g-warn">${s}</div>`;

export const GUIDE_UPDATED = 'outubro de 2026';

export const SECTIONS = [
  {
    id: 'regras', title: 'Regras de ouro',
    html: `
<p class="g-lead">Se for lembrar de só uma parte deste guia, que seja esta.</p>
<ol class="g-golden">
  <li><b>Tamanho certo antes de tudo.</b> Nunca publique uma imagem maior que o dobro do espaço em que ela aparece. Uma foto de 4000 px num bloco de 800 px desperdiça mais de 90% do peso.</li>
  <li><b>WebP para sites.</b> Fica de 25% a 35% menor que JPG com a mesma qualidade e funciona em todos os navegadores atuais. AVIF é ainda menor, se a plataforma aceitar.</li>
  <li><b>Formato pelo conteúdo:</b> foto em JPG, WebP ou AVIF; logo e ícone em SVG; gráfico com transparência em PNG ou WebP.</li>
  <li><b>Qualidade entre 75 e 85%</b> resolve quase tudo. Acima de 90% o arquivo cresce muito e o olho não percebe a diferença.</li>
  <li><b>Peso-alvo:</b> imagem de destaque até 150 KB, imagens de conteúdo até 80 KB, miniaturas até 20 KB.</li>
  <li><b>Sempre informe largura e altura</b> no HTML e use <code>loading="lazy"</code> em tudo que não aparece na primeira tela.</li>
  <li><b>Texto alternativo (alt)</b> em toda imagem com conteúdo. Ajuda acessibilidade e SEO.</li>
  <li><b>Nome de arquivo descritivo</b>, em minúsculas, sem acentos e com hífens: <code>campanha-verao-2026-banner.webp</code>.</li>
  <li><b>Cores em sRGB</b> e sem metadados (EXIF, GPS). Perfis CMYK e Adobe RGB deixam as cores lavadas na tela.</li>
  <li><b>Guarde o original.</b> Otimize sempre a partir do arquivo de maior qualidade, nunca de uma versão já comprimida.</li>
</ol>`,
  },
  {
    id: 'formatos', title: 'Qual formato usar',
    html: `
<table class="g-table">
  <thead><tr><th>Conteúdo</th><th>Melhor formato</th><th>Alternativa</th><th>Evite</th></tr></thead>
  <tbody>
    <tr><td>Foto em site</td><td><b>WebP</b> ou <b>AVIF</b></td><td>JPG progressivo</td><td>PNG (5 a 10× maior)</td></tr>
    <tr><td>Foto em e-mail marketing</td><td><b>JPG</b></td><td>PNG</td><td>WebP/AVIF (não abrem em vários leitores de e-mail)</td></tr>
    <tr><td>Logo, ícone, ilustração chapada</td><td><b>SVG</b></td><td>PNG ou WebP sem perdas</td><td>JPG (borra as bordas)</td></tr>
    <tr><td>Imagem com transparência</td><td><b>WebP</b></td><td>PNG com paleta reduzida</td><td>JPG (não tem transparência)</td></tr>
    <tr><td>Print de tela, texto, interface</td><td><b>PNG</b> ou <b>WebP sem perdas</b></td><td>WebP 90%</td><td>JPG baixo (cria "sujeira" no texto)</td></tr>
    <tr><td>Animação curta em site</td><td><b>Vídeo MP4/WebM</b></td><td>WebP animado</td><td>GIF longo (até 10× maior)</td></tr>
    <tr><td>Animação em e-mail</td><td><b>GIF</b></td><td>—</td><td>Vídeo (não toca em e-mail)</td></tr>
    <tr><td>Redes sociais</td><td><b>JPG</b> de alta qualidade</td><td>PNG para artes com texto</td><td>WebP (algumas redes recusam ou recomprimem mal)</td></tr>
    <tr><td>Impressão</td><td><b>PDF</b>, TIFF ou JPG máximo</td><td>PNG</td><td>WebP/AVIF (gráficas não aceitam)</td></tr>
  </tbody>
</table>
<h4>Resumo de cada formato</h4>
<dl class="g-dl">
  <dt>JPG</dt><dd>Compatível com tudo. Ótimo para fotos, sem transparência. Use a versão <i>progressiva</i>, que aparece em camadas enquanto carrega.</dd>
  <dt>PNG</dt><dd>Sem perdas e com transparência. Pesado para fotos. Para gráficos, reduzir a paleta para 256 cores ou menos corta 50% a 70% do peso.</dd>
  <dt>WebP</dt><dd>O padrão para web hoje. Tem perdas ou sem perdas, transparência e animação. Funciona em Chrome, Safari, Edge e Firefox.</dd>
  <dt>AVIF</dt><dd>O mais eficiente: cerca de 20% a 30% menor que WebP. Funciona nos navegadores atuais, mas é mais lento para gerar e alguns sistemas (CMS, e-mail, redes) ainda não aceitam.</dd>
  <dt>SVG</dt><dd>Vetor: fica nítido em qualquer tamanho e costuma pesar poucos KB. Ideal para logos e ícones. Não serve para fotos.</dd>
  <dt>GIF</dt><dd>Formato antigo, limitado a 256 cores. Só vale para animações em e-mail ou onde vídeo não funciona.</dd>
  <dt>HEIC</dt><dd>Formato das fotos de iPhone. Não abre na maioria dos sites e sistemas: converta para JPG ou WebP antes de usar.</dd>
</dl>
${tip('Escolha <b>Auto</b> em "Converter para" e a plataforma testa WebP e JPG/PNG e fica com o menor arquivo.')}`,
  },
  {
    id: 'qualidade', title: 'Qualidade e compressão',
    html: `
<table class="g-table">
  <thead><tr><th>Formato</th><th>Qualidade recomendada</th><th>Observação</th></tr></thead>
  <tbody>
    <tr><td>JPG</td><td><b>78 a 85%</b></td><td>Até 72% para fundos e imagens decorativas. Acima de 90% só para fotos de produto em zoom.</td></tr>
    <tr><td>WebP</td><td><b>75 a 82%</b></td><td>A escala é diferente da do JPG: WebP 80% equivale mais ou menos a JPG 85%.</td></tr>
    <tr><td>AVIF</td><td><b>50 a 65%</b></td><td>Os números são mais baixos, mas o resultado visual é comparável ao de WebP 80%.</td></tr>
    <tr><td>PNG</td><td><b>256 cores</b> (paleta)</td><td>Use "todas as cores" só quando houver degradês suaves ou fotos com transparência.</td></tr>
  </tbody>
</table>
<h4>Com perdas ou sem perdas?</h4>
<ul>
  <li><b>Com perdas</b> (lossy): fotos e imagens com muitos detalhes. A diferença é imperceptível na qualidade recomendada.</li>
  <li><b>Sem perdas</b> (lossless): prints de tela, textos, gráficos com poucas cores, arquivos que ainda serão editados.</li>
  <li>Nunca recomprima várias vezes o mesmo JPG: cada rodada perde qualidade. Volte ao original.</li>
</ul>
<h4>Como avaliar</h4>
<ul>
  <li>Compare em 100% de zoom, nas áreas difíceis: céu, pele, degradês e textos.</li>
  <li>Sinais de compressão demais: blocos quadrados em áreas lisas, faixas em degradês e halos em volta de textos.</li>
</ul>
${tip('Use o botão <b>comparar</b> (ícone de tela dividida) em cada imagem da fila para ver antes e depois lado a lado. Em <b>Tamanho máximo por arquivo</b>, a plataforma encontra sozinha a maior qualidade que cabe no limite.')}`,
  },
  {
    id: 'dimensoes', title: 'Tamanho e resolução',
    html: `
<h4>Na web, o que importa é pixel, não DPI</h4>
<p>"72 dpi" ou "300 dpi" não muda nada numa tela: o navegador só considera a largura e a altura em pixels. DPI só importa para impressão.</p>
<h4>Telas de alta densidade (retina)</h4>
<p>Celulares e notebooks modernos têm 2 ou 3 pixels físicos por pixel de layout. Para ficar nítido, a imagem deve ter <b>até 2× o tamanho em que aparece</b>. Acima de 2× o ganho é invisível e o arquivo cresce muito.</p>
<table class="g-table">
  <thead><tr><th>Uso no site</th><th>Exibido em</th><th>Exportar com</th></tr></thead>
  <tbody>
    <tr><td>Banner de tela cheia (hero)</td><td>até 1920 px</td><td>1920 a 2560 px de largura</td></tr>
    <tr><td>Imagem dentro do texto</td><td>700 a 900 px</td><td>1400 a 1600 px</td></tr>
    <tr><td>Card / grade de produtos</td><td>300 a 400 px</td><td>600 a 800 px</td></tr>
    <tr><td>Miniatura / avatar</td><td>48 a 150 px</td><td>2× o tamanho exibido</td></tr>
    <tr><td>Imagem de fundo decorativa</td><td>tela cheia</td><td>1600 a 1920 px, qualidade mais baixa</td></tr>
  </tbody>
</table>
<ul>
  <li><b>Não aumente</b> imagens pequenas: ampliar não cria detalhe, só borra e pesa mais.</li>
  <li><b>Recorte antes de reduzir</b> quando o espaço tem proporção fixa (1:1, 16:9). Assim nada é desperdiçado.</li>
  <li>Fotos de câmera e celular saem com 4000 a 8000 px: sempre precisam ser reduzidas para a web.</li>
</ul>
${tip('Em <b>Redimensionar</b>, o modo <b>Lado maior</b> em 1920 px atende a maioria dos usos, e <b>Não aumentar imagens pequenas</b> fica ligado por padrão. Para 1:1, 16:9 etc., use <b>Recortar proporção antes</b>.')}`,
  },
  {
    id: 'pesos', title: 'Pesos-alvo (KB)',
    html: `
<p>Referências para sites rápidos em conexão móvel. São metas, não limites rígidos.</p>
<table class="g-table">
  <thead><tr><th>Tipo</th><th>Meta</th><th>Máximo aceitável</th></tr></thead>
  <tbody>
    <tr><td>Imagem de destaque / hero</td><td><b>até 150 KB</b></td><td>300 KB</td></tr>
    <tr><td>Imagem de conteúdo</td><td><b>até 80 KB</b></td><td>150 KB</td></tr>
    <tr><td>Card / produto</td><td><b>até 50 KB</b></td><td>100 KB</td></tr>
    <tr><td>Miniatura / avatar</td><td><b>até 20 KB</b></td><td>40 KB</td></tr>
    <tr><td>Logo / ícone (SVG)</td><td><b>até 10 KB</b></td><td>30 KB</td></tr>
    <tr><td>Imagem de compartilhamento (OG)</td><td><b>até 200 KB</b></td><td>300 KB (WhatsApp)</td></tr>
    <tr><td>E-mail marketing (cada imagem)</td><td><b>até 150 KB</b></td><td>e-mail inteiro abaixo de 1 MB</td></tr>
    <tr><td>Todas as imagens de uma página</td><td><b>até 1 MB</b></td><td>2 MB</td></tr>
  </tbody>
</table>
${warn('Uma única imagem de 3 MB no topo da página pode fazer o site levar vários segundos para aparecer no celular e piorar a posição no Google (métrica LCP).')}
${tip('Preencha <b>Tamanho máximo por arquivo</b> com a meta da tabela (ex.: 150) e a plataforma ajusta a qualidade de cada imagem para caber.')}`,
  },
  {
    id: 'responsivas', title: 'Imagens responsivas',
    html: `
<p>Em vez de mandar a mesma imagem grande para celular e desktop, gere algumas larguras e deixe o navegador escolher a ideal.</p>
<h4>Várias larguras com srcset</h4>
${code(`<img src="banner-960.webp"
     srcset="banner-480.webp 480w, banner-960.webp 960w, banner-1440.webp 1440w, banner-1920.webp 1920w"
     sizes="(max-width: 768px) 100vw, 1200px"
     width="1920" height="1080"
     alt="Descrição da imagem" loading="lazy" decoding="async">`)}
<ul>
  <li><b>srcset</b>: lista os arquivos com a largura real de cada um (<code>480w</code>).</li>
  <li><b>sizes</b>: diz quanto da tela a imagem ocupa. Sem isso, o navegador assume 100% da largura e baixa a versão maior.</li>
  <li>Larguras sugeridas: 480, 960, 1440 e 1920 px. Para imagens pequenas, 320, 640 e 960.</li>
</ul>
<h4>AVIF com alternativa em WebP e JPG</h4>
${code(`<picture>
  <source srcset="foto.avif" type="image/avif">
  <source srcset="foto.webp" type="image/webp">
  <img src="foto.jpg" width="1200" height="800" alt="Descrição da imagem" loading="lazy">
</picture>`)}
<h4>Recorte diferente no celular (direção de arte)</h4>
${code(`<picture>
  <source media="(max-width: 768px)" srcset="banner-mobile-1080x1350.webp">
  <img src="banner-desktop-1920x700.webp" width="1920" height="700" alt="Descrição">
</picture>`)}
${tip('A predefinição <b>Responsivo (srcset)</b> gera as 4 larguras de uma vez, e o botão <b>Copiar código &lt;picture&gt;</b> entrega o HTML pronto, com width, height e lazy loading.')}`,
  },
  {
    id: 'performance', title: 'Performance no site',
    html: `
<ul class="g-check">
  <li><b>width e height</b> em toda <code>&lt;img&gt;</code>: o navegador reserva o espaço e a página não "pula" enquanto carrega (métrica CLS).</li>
  <li><b><code>loading="lazy"</code></b> em imagens abaixo da primeira tela: elas só carregam quando a pessoa rola até elas.</li>
  <li><b>Não use lazy na imagem principal</b> (hero/banner do topo). Nela, use <code>fetchpriority="high"</code> para carregar primeiro.</li>
  <li><b><code>decoding="async"</code></b> evita travar a página enquanto a imagem é decodificada.</li>
  <li><b>Pré-carregue</b> a imagem do topo quando ela vier do CSS: <code>&lt;link rel="preload" as="image" href="hero.webp" fetchpriority="high"&gt;</code>.</li>
  <li><b>Cache longo</b> (1 ano) para imagens, trocando o nome do arquivo quando a imagem mudar (<code>banner-v2.webp</code>).</li>
  <li><b>CDN</b>: sirva as imagens de um servidor perto do usuário. Muitos CMS e hospedagens já fazem isso.</li>
  <li><b>Imagens de fundo no CSS</b> não têm lazy loading nem srcset. Prefira <code>&lt;img&gt;</code> com <code>object-fit: cover</code>.</li>
  <li><b>Ícones</b>: use SVG inline ou uma única folha de ícones em vez de dezenas de PNGs.</li>
</ul>
${code(`<!-- Imagem principal (topo da página) -->
<img src="hero-1920.webp" width="1920" height="800" alt="…" fetchpriority="high" decoding="async">

<!-- Demais imagens -->
<img src="card-800.webp" width="800" height="600" alt="…" loading="lazy" decoding="async">`)}
<p class="g-note">Para medir: <a href="https://pagespeed.web.dev/" target="_blank" rel="noopener">PageSpeed Insights</a> mostra quais imagens estão pesando e quanto dá para economizar.</p>`,
  },
  {
    id: 'favicon', title: 'Favicon e ícones de app',
    html: `
<p>Crie <b>um original quadrado de 512 × 512 px</b> (ou um SVG) e gere os demais tamanhos a partir dele.</p>
<table class="g-table">
  <thead><tr><th>Arquivo</th><th>Tamanho</th><th>Para quê</th></tr></thead>
  <tbody>
    <tr><td><code>favicon.ico</code></td><td>32 × 32 (com 16 e 48 dentro)</td><td>Aba do navegador, favoritos, navegadores antigos</td></tr>
    <tr><td><code>favicon.svg</code></td><td>vetor</td><td>Aba dos navegadores modernos; aceita versão para tema escuro</td></tr>
    <tr><td><code>apple-touch-icon.png</code></td><td><b>180 × 180</b></td><td>Atalho na tela inicial do iPhone/iPad</td></tr>
    <tr><td><code>icon-192.png</code></td><td><b>192 × 192</b></td><td>Android e app instalável (PWA)</td></tr>
    <tr><td><code>icon-512.png</code></td><td><b>512 × 512</b></td><td>Tela de abertura do app e lojas (PWA)</td></tr>
    <tr><td><code>icon-maskable-512.png</code></td><td>512 × 512</td><td>Ícone adaptável do Android (com margem de segurança)</td></tr>
  </tbody>
</table>
<h4>Regras</h4>
<ul>
  <li><b>Sempre quadrado</b> (1:1). O Google exige no mínimo 8 × 8 px e recomenda <b>maior que 48 × 48 px</b> para aparecer bem nos resultados de busca.</li>
  <li><b>Simplifique:</b> em 16 px não cabem texto nem detalhes. Use o símbolo ou a inicial da marca.</li>
  <li><b>Contraste</b> em fundo claro e escuro: teste a aba do navegador nos dois temas.</li>
  <li><b>Ícone maskable:</b> mantenha o desenho dentro do círculo central de 80%, porque o Android corta as bordas em formatos diferentes.</li>
  <li>O <code>apple-touch-icon</code> não deve ter transparência: o iPhone preenche com preto.</li>
  <li>Mantenha o endereço do favicon fixo: o Google pode levar semanas para atualizar.</li>
</ul>
${code(`<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">`)}
${tip('Para gerar os tamanhos: modo <b>Preencher L × A e cortar</b> com 512 × 512, depois 192 × 192 e 180 × 180, em PNG. Em <b>Nome dos arquivos</b>, ligue <b>Adicionar dimensões ao fim</b> para separar as versões.')}`,
  },
  {
    id: 'og', title: 'Compartilhamento (OG)',
    html: `
<p>É a imagem que aparece quando o link é colado no WhatsApp, LinkedIn, Facebook, X, Slack ou Teams.</p>
<ul class="g-check">
  <li><b>1200 × 630 px</b> (proporção 1,91:1) funciona em todas as plataformas.</li>
  <li><b>JPG ou PNG</b>, idealmente <b>abaixo de 300 KB</b>. Arquivos maiores podem não aparecer no WhatsApp.</li>
  <li><b>Endereço absoluto</b>, com https: <code>https://site.com/og.jpg</code>, nunca <code>/og.jpg</code>.</li>
  <li><b>Área segura:</b> deixe textos e logo no centro, com margem de uns 60 px. Algumas plataformas cortam as bordas ou mostram a imagem quadrada.</li>
  <li><b>Pouco texto e grande:</b> a prévia aparece pequena no celular.</li>
  <li>Cada página importante pode ter a sua própria imagem OG.</li>
</ul>
${code(`<meta property="og:title" content="Título da página">
<meta property="og:description" content="Descrição curta (até ~150 caracteres)">
<meta property="og:image" content="https://site.com/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">`)}
<p class="g-note">Para testar e limpar o cache das prévias: <a href="https://www.linkedin.com/post-inspector/" target="_blank" rel="noopener">Post Inspector do LinkedIn</a> e <a href="https://developers.facebook.com/tools/debug/" target="_blank" rel="noopener">Sharing Debugger do Facebook</a> (vale também para WhatsApp e Instagram).</p>`,
  },
  {
    id: 'redes', title: 'Redes sociais',
    html: `
<p>Tamanhos recomendados (referência de ${GUIDE_UPDATED}; as redes mudam com frequência, confira antes de grandes campanhas). Exporte em <b>JPG de alta qualidade (85 a 92%)</b>: as próprias redes recomprimem a imagem.</p>
<table class="g-table g-table-compact">
  <thead><tr><th>Rede</th><th>Formato</th><th>Tamanho (px)</th><th>Proporção</th></tr></thead>
  <tbody>
    <tr><td rowspan="5"><b>Instagram</b></td><td>Feed vertical (recomendado)</td><td>1080 × 1350</td><td>4:5</td></tr>
    <tr><td>Feed vertical alto</td><td>1080 × 1440</td><td>3:4</td></tr>
    <tr><td>Feed quadrado</td><td>1080 × 1080</td><td>1:1</td></tr>
    <tr><td>Stories e Reels</td><td>1080 × 1920</td><td>9:16</td></tr>
    <tr><td>Foto de perfil</td><td>320 × 320 (mín.)</td><td>1:1, círculo</td></tr>
    <tr><td rowspan="4"><b>Facebook</b></td><td>Post vertical</td><td>1080 × 1350</td><td>4:5</td></tr>
    <tr><td>Post / link</td><td>1200 × 630</td><td>1,91:1</td></tr>
    <tr><td>Capa da página</td><td>851 × 315 (envie 1702 × 630)</td><td>~2,7:1</td></tr>
    <tr><td>Capa de evento</td><td>1920 × 1005</td><td>~1,91:1</td></tr>
    <tr><td rowspan="5"><b>LinkedIn</b></td><td>Post vertical</td><td>1080 × 1350</td><td>4:5</td></tr>
    <tr><td>Post quadrado</td><td>1080 × 1080</td><td>1:1</td></tr>
    <tr><td>Link / artigo</td><td>1200 × 627</td><td>1,91:1</td></tr>
    <tr><td>Banner de perfil</td><td>1584 × 396</td><td>4:1</td></tr>
    <tr><td>Banner da página da empresa</td><td>1128 × 191</td><td>~5,9:1</td></tr>
    <tr><td rowspan="2"><b>X (Twitter)</b></td><td>Post horizontal</td><td>1600 × 900</td><td>16:9</td></tr>
    <tr><td>Capa</td><td>1500 × 500</td><td>3:1</td></tr>
    <tr><td rowspan="2"><b>YouTube</b></td><td>Thumbnail</td><td>1280 × 720 (até 2 MB)</td><td>16:9</td></tr>
    <tr><td>Banner do canal</td><td>2560 × 1440 (área segura 1546 × 423)</td><td>16:9</td></tr>
    <tr><td><b>TikTok</b></td><td>Vídeo / foto</td><td>1080 × 1920</td><td>9:16</td></tr>
    <tr><td><b>Pinterest</b></td><td>Pin</td><td>1000 × 1500</td><td>2:3</td></tr>
    <tr><td><b>WhatsApp</b></td><td>Status</td><td>1080 × 1920</td><td>9:16</td></tr>
  </tbody>
</table>
<ul>
  <li><b>Grade do Instagram:</b> desde 2025, o perfil mostra as miniaturas em 3:4. Mantenha o assunto principal no centro.</li>
  <li><b>Stories e Reels:</b> deixe livres cerca de 250 px no topo e embaixo, onde ficam a interface e a legenda.</li>
  <li><b>Artes com muito texto:</b> PNG evita borrões nas letras, mas a rede pode converter. Teste antes.</li>
</ul>
${tip('Use a predefinição <b>Redes sociais</b> (JPG 86%, 1080 px de largura) ou <b>Preencher L × A e cortar</b> com o tamanho da tabela.')}`,
  },
  {
    id: 'email', title: 'E-mail marketing',
    html: `
<ul class="g-check">
  <li><b>Largura do e-mail:</b> 600 a 640 px. Exporte as imagens com <b>2×</b> (1200 a 1280 px) e fixe a largura no HTML (<code>width="600"</code>) para ficar nítido em telas retina.</li>
  <li><b>Formatos seguros:</b> JPG para fotos, PNG para logos e textos, GIF para animação. <b>WebP e AVIF não abrem</b> em parte dos leitores (como o Outlook para Windows).</li>
  <li><b>Peso:</b> até 150 KB por imagem e menos de 1 MB no e-mail inteiro. O Gmail corta mensagens com HTML acima de 102 KB (o texto do código, não as imagens).</li>
  <li><b>Não faça e-mail só de imagem:</b> filtros de spam desconfiam, e muita gente abre com as imagens bloqueadas. Títulos, botões e informações importantes devem ser texto.</li>
  <li><b>Alt em todas as imagens</b>: é o que aparece quando as imagens estão bloqueadas.</li>
  <li><b>GIF animado:</b> o Outlook para Windows mostra só o primeiro quadro. Coloque a mensagem principal nele.</li>
  <li><b>Hospede as imagens</b> num endereço público e estável (https). Não use anexos nem imagens em base64.</li>
  <li><b>Modo escuro:</b> logos com fundo transparente podem sumir. Use uma borda clara ou um fundo sólido.</li>
</ul>
${tip('A predefinição <b>E-mail marketing</b> gera JPG de 1200 px (2× de 600) com qualidade 74%.')}`,
  },
  {
    id: 'gif', title: 'GIFs e animações',
    html: `
<ul class="g-check">
  <li><b>Em sites, prefira vídeo:</b> um MP4 ou WebM costuma ser de 5 a 10 vezes menor que o GIF equivalente. Use <code>&lt;video autoplay muted loop playsinline&gt;</code>.</li>
  <li><b>Curto:</b> até 3 a 5 segundos e poucos quadros. Cada quadro aumenta o peso.</li>
  <li><b>Pequeno:</b> na largura em que vai aparecer, sem 2×. Em e-mail, 600 px no máximo.</li>
  <li><b>Menos cores:</b> 64 a 128 cores bastam para a maioria das animações gráficas.</li>
  <li><b>Peso-alvo:</b> até 1 MB em e-mail, 2 MB no máximo.</li>
  <li><b>Primeiro quadro completo:</b> é o que aparece no Outlook e enquanto o GIF carrega.</li>
  <li><b>Acessibilidade:</b> evite piscar mais de 3 vezes por segundo, porque pode causar crises em pessoas com epilepsia fotossensível.</li>
</ul>
${tip('Na seção <b>GIFs</b>, a compressão com perdas entre 30 e 80 reduz de 30% a 60% sem quebrar a animação. Combine com 128 ou 64 cores e redimensione para o tamanho real de uso.')}`,
  },
  {
    id: 'logos', title: 'Logos e ícones',
    html: `
<ul class="g-check">
  <li><b>SVG sempre que possível:</b> nítido em qualquer tela e geralmente abaixo de 10 KB.</li>
  <li><b>Limpe o SVG</b> exportado de Illustrator ou Figma: metadados, camadas vazias e casas decimais demais podem dobrar o tamanho.</li>
  <li><b>Converta textos em contornos</b> no SVG, ou a fonte pode não existir no computador de quem abre.</li>
  <li><b>Quando precisar de PNG</b> (e-mail, redes, sistemas que não aceitam SVG): exporte em 2× o tamanho de uso, com fundo transparente e paleta reduzida.</li>
  <li><b>Tenha versões</b> para fundo claro e escuro (como o logo-rosa, o logo-claro e o logo-escuro da Digi).</li>
  <li><b>Margem de respiro</b> ao redor do logo dentro do arquivo: evita cortes e desalinhamento.</li>
</ul>
${tip('Com <b>Original</b> em "Converter para", os SVGs são limpos automaticamente (SVGO) e continuam vetoriais.')}`,
  },
  {
    id: 'fotos', title: 'Fotos, cor e metadados',
    html: `
<ul class="g-check">
  <li><b>Perfil de cor sRGB:</b> é o padrão da web e das telas. Fotos em Adobe RGB ou ProPhoto ficam lavadas no navegador, e arquivos CMYK (de gráfica) podem até não abrir.</li>
  <li><b>Remova metadados:</b> dados de câmera, GPS e miniaturas embutidas podem somar de 20 a 100 KB e expor a localização de quem fotografou.</li>
  <li><b>Orientação:</b> celulares salvam a foto "deitada" com uma marcação de rotação. Aplique a rotação antes de publicar, ou a imagem pode aparecer de lado.</li>
  <li><b>Nitidez leve</b> depois de reduzir muito uma foto devolve o contraste dos detalhes.</li>
  <li><b>Fotos de iPhone (HEIC)</b> precisam ser convertidas para JPG ou WebP.</li>
  <li><b>Direitos de uso:</b> confirme licença, autoria e autorização de imagem das pessoas fotografadas antes de publicar.</li>
</ul>
${tip('A plataforma sempre remove os metadados e aplica a rotação do celular. A opção <b>Nitidez após reduzir</b> fica em <b>Ajustes</b>.')}`,
  },
  {
    id: 'nomes', title: 'Nomes e organização',
    html: `
<ul class="g-check">
  <li><b>Minúsculas, sem acentos e sem espaços</b>, com hífen entre as palavras: <code>cafe-da-manha.webp</code>, e não <code>Café da Manhã (1).webp</code>.</li>
  <li><b>Descritivo:</b> o Google usa o nome do arquivo para entender a imagem. <code>tenis-corrida-azul.webp</code> é melhor que <code>IMG_4821.webp</code>.</li>
  <li><b>Padrão de equipe:</b> <code>cliente-campanha-peca-formato</code>, por exemplo <code>tim-ultrafibra-banner-1920x700.webp</code>.</li>
  <li><b>Dimensões no nome</b> quando houver várias versões da mesma peça: <code>-1080x1350</code>, <code>-1080x1920</code>.</li>
  <li><b>Versões</b> com sufixo (<code>-v2</code>) em vez de "final", "final-agora-vai".</li>
  <li><b>Separe originais e otimizadas</b> em pastas diferentes (ex.: <code>originais/</code> e <code>web/</code>). Nunca substitua o original pela versão comprimida.</li>
</ul>
${tip('Em <b>Nome dos arquivos</b>: ligue <b>Nome amigável para web</b>, use <b>Prefixo</b> com o nome do cliente ou da campanha e <b>Adicionar dimensões ao fim</b> para as versões. O <b>Modelo personalizado</b> aceita {nome}, {dim}, {formato}, {data} e outros.')}`,
  },
  {
    id: 'acessibilidade', title: 'Acessibilidade e SEO',
    html: `
<h4>Texto alternativo (alt)</h4>
<ul>
  <li>Descreva <b>o que a imagem comunica</b>, em uma frase curta (até ~125 caracteres).</li>
  <li>Não comece com "imagem de" ou "foto de": o leitor de tela já avisa que é uma imagem.</li>
  <li>Imagens <b>decorativas</b> levam <code>alt=""</code> (vazio), para o leitor de tela ignorar.</li>
  <li>Se a imagem tem texto (banner, arte), o alt deve trazer <b>o mesmo texto</b>.</li>
  <li>Em botões e links que são só imagem, o alt descreve <b>a ação</b>: "Baixar o catálogo", e não "ícone de seta".</li>
</ul>
<h4>Evite texto dentro da imagem</h4>
<p>Texto em imagem não é lido pelo Google nem por leitores de tela, não se adapta ao celular e não pode ser traduzido. Quando for inevitável, garanta contraste e repita o texto no alt.</p>
<h4>SEO</h4>
<ul>
  <li>Nome de arquivo e alt descritivos, com as palavras que as pessoas buscariam.</li>
  <li>Imagem perto do texto que fala dela.</li>
  <li>Páginas rápidas ranqueiam melhor: imagens leves e com width/height contam pontos.</li>
</ul>`,
  },
  {
    id: 'impressao', title: 'Impressão x tela',
    html: `
<table class="g-table">
  <thead><tr><th></th><th>Tela (web, redes, e-mail)</th><th>Impressão</th></tr></thead>
  <tbody>
    <tr><td>Resolução</td><td>Medida em pixels; DPI é irrelevante</td><td><b>300 dpi</b> no tamanho final (150 dpi para banners vistos de longe)</td></tr>
    <tr><td>Cor</td><td><b>sRGB</b></td><td><b>CMYK</b>, conforme o perfil da gráfica</td></tr>
    <tr><td>Formato</td><td>WebP, AVIF, JPG, PNG, SVG</td><td>PDF/X, TIFF, JPG em qualidade máxima</td></tr>
    <tr><td>Sangria</td><td>Não existe</td><td>Normalmente 3 a 5 mm em cada lado</td></tr>
  </tbody>
</table>
<p>Para calcular os pixels de um impresso: <b>(cm ÷ 2,54) × 300</b>. Um A4 (21 × 29,7 cm) precisa de cerca de 2480 × 3508 px.</p>
${warn('Não use arquivos otimizados para web em impressão. Envie sempre o original em alta resolução.')}`,
  },
  {
    id: 'checklist', title: 'Checklist antes de publicar',
    html: `
<ul class="g-checklist">
  <li><label><input type="checkbox"> Tamanho em pixels de até 2× o espaço onde a imagem aparece</label></li>
  <li><label><input type="checkbox"> Formato certo: WebP/AVIF no site, JPG no e-mail e nas redes, SVG no logo</label></li>
  <li><label><input type="checkbox"> Peso dentro da meta (hero até 150 KB, conteúdo até 80 KB)</label></li>
  <li><label><input type="checkbox"> Qualidade conferida no comparador, em 100% de zoom</label></li>
  <li><label><input type="checkbox"> Cores em sRGB e sem metadados</label></li>
  <li><label><input type="checkbox"> Nome em minúsculas, sem acentos, descritivo</label></li>
  <li><label><input type="checkbox"> Texto alternativo (alt) escrito</label></li>
  <li><label><input type="checkbox"> width e height no HTML; lazy loading fora da primeira tela</label></li>
  <li><label><input type="checkbox"> Versões responsivas (srcset) para imagens grandes</label></li>
  <li><label><input type="checkbox"> Imagem OG de 1200 × 630 testada no Post Inspector</label></li>
  <li><label><input type="checkbox"> Original guardado em alta qualidade</label></li>
</ul>
<p class="g-note">As marcações desta lista não ficam salvas. Servem só para conferência rápida.</p>`,
  },
];
