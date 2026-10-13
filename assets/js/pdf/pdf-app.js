/* =========================================================================
   Otimizador Digi — área de PDF
   ========================================================================= */
import * as ops from './pdf-ops.js';
import { zipSync } from '../../../vendor/fflate.js';

const $ = (id) => document.getElementById(id);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const fmtBytes = (b) => (b == null ? '—' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baseName = (n) => n.replace(/\.[^.]+$/, '');
const cleanName = (n) => n.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'documento';
const isImage = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(f.name);
const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const store = {
  get(k, d) { try { const v = localStorage.getItem('otimizador.' + k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('otimizador.' + k, JSON.stringify(v)); } catch (_) { /* ok */ } },
};

const I = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const TOOLS = [
  { id: 'comprimir', title: 'Comprimir', desc: 'Deixar o PDF mais leve', icon: I('<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>'), accept: 'pdf', run: 'Comprimir PDFs' },
  { id: 'juntar', title: 'Juntar', desc: 'Unir PDFs e imagens', icon: I('<rect x="3" y="3" width="8" height="11" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><path d="M11 8h2.5a2 2 0 0 1 2 2"/>'), accept: 'both', run: 'Juntar em um PDF' },
  { id: 'dividir', title: 'Dividir', desc: 'Separar em vários arquivos', icon: I('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/>'), accept: 'pdf', run: 'Dividir PDFs' },
  { id: 'paginas', title: 'Organizar páginas', desc: 'Excluir, girar, reordenar', icon: I('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'), accept: 'pdf', run: 'Salvar PDF organizado' },
  { id: 'pdf2img', title: 'PDF para imagem', desc: 'Páginas em JPG, PNG ou WebP', icon: I('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'), accept: 'pdf', run: 'Converter em imagens' },
  { id: 'img2pdf', title: 'Imagem para PDF', desc: 'Fotos e artes em um PDF', icon: I('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15h6"/>'), accept: 'image', run: 'Criar PDF' },
  { id: 'numerar', title: 'Numerar páginas', desc: 'Página 1 de 10', icon: I('<path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/>'), accept: 'pdf', run: 'Numerar páginas' },
  { id: 'marca', title: "Marca d'água", desc: 'Texto sobre as páginas', icon: I('<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>'), accept: 'pdf', run: "Aplicar marca d'água" },
  { id: 'senha', title: 'Senha', desc: 'Proteger ou desbloquear', icon: I('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'), accept: 'pdf', run: 'Aplicar' },
  { id: 'info', title: 'Metadados', desc: 'Título, autor, limpeza', icon: I('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'), accept: 'pdf', run: 'Salvar metadados' },
];
const TOOL = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

const HELP = {
  comprimir: 'Recomprime as imagens de dentro do PDF. Textos e vetores continuam nítidos e pesquisáveis.',
  juntar: 'Une os arquivos na ordem da lista. Arraste para reordenar. Imagens viram páginas.',
  dividir: 'Cria vários PDFs a partir de cada arquivo da lista.',
  paginas: 'Clique para selecionar (Shift para intervalo), arraste para reordenar. Funciona no arquivo destacado da lista.',
  pdf2img: 'Cada página vira uma imagem. Você pode mandar o resultado direto para a área de Imagens.',
  img2pdf: 'Monta um PDF com as imagens, na ordem da lista.',
  numerar: 'Escreve o número em todas as páginas de cada PDF da lista.',
  marca: 'Escreve um texto semitransparente sobre todas as páginas.',
  senha: 'Usa criptografia AES de 256 bits. Guarde a senha: não há como recuperá-la.',
  info: 'Edita título, autor e palavras-chave, ou remove todos os metadados.',
};

/* ================================ Estado ================================ */
const S = { files: [], activeId: null, tool: store.get('pdfTool', 'comprimir'), results: [], running: false, seq: 1, editor: null };
let ctx = null;

export function initPdf(context) {
  ctx = context;
  renderTools();
  bindInputs();
  selectTool(TOOL[S.tool] ? S.tool : 'comprimir');
  renderFiles();
}

/* ============================== Ferramentas ============================= */
function renderTools() {
  $('pdfTools').innerHTML = TOOLS.map((t) => `
    <button class="pdf-tool" data-tool="${t.id}" type="button">
      <span class="pdf-tool-ico">${t.icon}</span>
      <span><b>${t.title}</b><small>${t.desc}</small></span>
    </button>`).join('');
  $('pdfTools').addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) selectTool(b.dataset.tool); });
}

function selectTool(id) {
  S.tool = id; store.set('pdfTool', id);
  const t = TOOL[id];
  $$('.pdf-tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === id));
  $('pdfToolTitle').textContent = t.title;
  $('pdfToolDesc').textContent = HELP[id];
  $('pdfRun').textContent = t.run;
  $('pdfOptions').innerHTML = optionsHtml(id);
  bindOptions(id);
  const accept = t.accept === 'image' ? 'image/*' : t.accept === 'both' ? '.pdf,application/pdf,image/*' : '.pdf,application/pdf';
  $('pdfInput').accept = accept;
  $('pdfDropTitle').textContent = t.accept === 'image' ? 'Arraste imagens aqui' : t.accept === 'both' ? 'Arraste PDFs e imagens aqui' : 'Arraste PDFs aqui';
  $('pdfDropFormats').textContent = t.accept === 'image' ? 'JPG · PNG · WebP · AVIF · GIF' : t.accept === 'both' ? 'PDF · JPG · PNG · WebP' : 'PDF';
  $('pdfOrderHint').textContent = id === 'juntar' || id === 'img2pdf' ? 'Arraste para mudar a ordem' : id === 'paginas' ? 'Clique em um arquivo para editar' : '';
  renderFiles();
  updateEditor();
  if (id === 'paginas' && activeFile()) setTimeout(() => $('pageEditor').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

/* =============================== Opções ================================= */
const seg = (name, items, val) => `<div class="seg" data-seg="${name}">${items.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(v) === String(val) ? 'active' : ''}">${l}</button>`).join('')}</div>`;
const O = () => store.get('pdfOpts', {});
const saveO = (patch) => store.set('pdfOpts', { ...O(), ...patch });

function optionsHtml(id) {
  const o = O();
  switch (id) {
    case 'comprimir': return `
      <div class="field"><label>Nível de compressão</label>${seg('level', [['leve', 'Leve'], ['recomendada', 'Recomendada'], ['forte', 'Forte'], ['extrema', 'Extrema']], o.level || 'recomendada')}</div>
      <p class="help" id="levelHelp"></p>
      <label class="check"><input type="checkbox" id="pGray" ${o.gray ? 'checked' : ''}><span>Imagens em tons de cinza<small>Bom para documentos que serão impressos em P&B.</small></span></label>
      <label class="check"><input type="checkbox" id="pStrip" ${o.strip !== false ? 'checked' : ''}><span>Remover metadados<small>Autor, programa usado, datas.</small></span></label>
      ${ctx.isOnlineReady() ? `<div class="field" style="margin-top:6px"><label>Onde processar</label>${seg('where', [['local', 'No navegador'], ['online', 'Online']], o.where || 'local')}</div><p class="help" id="whereHelp"></p>` : ''}`;
    case 'juntar': return `
      <div class="field"><label>Nome do arquivo final</label><input type="text" id="pName" value="${esc(o.mergeName || 'documentos-unidos')}"></div>
      <div class="field"><label>Páginas das imagens</label><select id="pImgSize">${sizeOptions(o.imgSize || 'a4')}</select></div>`;
    case 'dividir': return `
      <div class="field"><label>Como dividir</label>
        <select id="pSplit">
          <option value="each" ${o.split === 'each' ? 'selected' : ''}>Cada página em um arquivo</option>
          <option value="every" ${o.split === 'every' ? 'selected' : ''}>A cada N páginas</option>
          <option value="ranges" ${!o.split || o.split === 'ranges' ? 'selected' : ''}>Por intervalos (um arquivo por intervalo)</option>
          <option value="extract" ${o.split === 'extract' ? 'selected' : ''}>Extrair páginas para um único arquivo</option>
        </select></div>
      <div class="field" id="fEvery"><label>Páginas por arquivo</label><input type="number" id="pEvery" min="1" value="${o.every || 2}"></div>
      <div class="field" id="fRanges"><label>Páginas <small>ex.: 1-3, 5, 8-</small></label><input type="text" id="pRanges" value="${esc(o.ranges || '1-3, 4-')}"></div>`;
    case 'paginas': return `
      <p class="help" style="margin-top:0">Atalhos: <b>Delete</b> exclui, <b>R</b> gira, <b>Ctrl+A</b> seleciona tudo.</p>
      <button class="btn btn-block" id="pExtract" type="button" style="margin-bottom:10px">Extrair só as selecionadas</button>`;
    case 'pdf2img': return `
      <div class="field"><label>Formato</label>${seg('imgFmt', [['jpeg', 'JPG'], ['png', 'PNG'], ['webp', 'WebP']], o.imgFmt || 'jpeg')}</div>
      <div class="field"><label>Resolução</label>${seg('dpi', [[72, '72'], [150, '150'], [200, '200'], [300, '300 dpi']], o.dpi || 150)}</div>
      <p class="help">150 dpi para tela e redes; 300 dpi para impressão.</p>
      <div class="field"><label>Qualidade <span class="range-val" id="pQVal">${o.q || 85}</span></label><input type="range" id="pQ" min="40" max="100" value="${o.q || 85}"></div>
      <div class="field"><label>Páginas <small>vazio = todas</small></label><input type="text" id="pPages" value="${esc(o.pages || '')}" placeholder="ex.: 1-3, 7"></div>
      <label class="check"><input type="checkbox" id="pToQueue" ${o.toQueue ? 'checked' : ''}><span>Mandar para a área de Imagens<small>Para redimensionar, renomear e otimizar depois.</small></span></label>`;
    case 'img2pdf': return `
      <div class="field"><label>Tamanho da página</label><select id="pImgSize">${sizeOptions(o.imgSize || 'a4')}</select></div>
      <div class="field"><label>Orientação</label>${seg('orient', [['auto', 'Automática'], ['portrait', 'Retrato'], ['landscape', 'Paisagem']], o.orient || 'auto')}</div>
      <div class="field"><label>Margem</label>${seg('margin', [[0, 'Nenhuma'], [10, 'Pequena'], [20, 'Média']], o.margin ?? 10)}</div>
      <label class="check"><input type="checkbox" id="pOptimize" ${o.optimize !== false ? 'checked' : ''}><span>Otimizar imagens<small>Reduz para até 2000 px e comprime (PDF bem mais leve).</small></span></label>
      <label class="check"><input type="checkbox" id="pEachImg" ${o.eachImg ? 'checked' : ''}><span>Um PDF por imagem</span></label>
      <div class="field"><label>Nome do arquivo</label><input type="text" id="pName" value="${esc(o.imgName || 'imagens')}"></div>`;
    case 'numerar': return `
      <div class="field"><label>Formato</label>
        <select id="pNumFmt">${[['{n}', '1'], ['{n} de {total}', '1 de 10'], ['Página {n}', 'Página 1'], ['Página {n} de {total}', 'Página 1 de 10'], ['- {n} -', '- 1 -']].map(([v, l]) => `<option value="${esc(v)}" ${o.numFmt === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>Posição</label>
        <div class="pos-grid" data-seg="numPos">${['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'].map((p) => `<button type="button" data-v="${p}" class="${(o.numPos || 'bottom-center') === p ? 'active' : ''}" aria-label="${p}"><i></i></button>`).join('')}</div></div>
      <div class="row2">
        <div class="field"><label>Começar em</label><input type="number" id="pStart" value="${o.start || 1}" min="0"></div>
        <div class="field"><label>Tamanho</label><input type="number" id="pSize" value="${o.size || 10}" min="6" max="48"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Margem (mm)</label><input type="number" id="pMargin" value="${o.numMargin || 10}" min="2" max="40"></div>
        <div class="field"><label>Cor</label><input type="color" id="pColor" value="${o.numColor || '#222323'}" class="color-in"></div>
      </div>
      <label class="check"><input type="checkbox" id="pSkip" ${o.skip ? 'checked' : ''}><span>Não numerar a capa (1ª página)</span></label>`;
    case 'marca': return `
      <div class="field"><label>Texto</label><input type="text" id="pWm" value="${esc(o.wm || 'CONFIDENCIAL')}"></div>
      <div class="field"><label>Opacidade <span class="range-val" id="pOpVal">${o.op || 18}%</span></label><input type="range" id="pOp" min="5" max="80" value="${o.op || 18}"></div>
      <div class="row2">
        <div class="field"><label>Tamanho</label><input type="number" id="pWmSize" value="${o.wmSize || 60}" min="10" max="200"></div>
        <div class="field"><label>Cor</label><input type="color" id="pWmColor" value="${o.wmColor || '#EA0356'}" class="color-in"></div>
      </div>
      <div class="field"><label>Disposição</label>${seg('wmLayout', [['center', 'Centro'], ['tiled', 'Repetida']], o.wmLayout || 'center')}</div>
      <label class="check"><input type="checkbox" id="pDiag" ${o.diag !== false ? 'checked' : ''}><span>Na diagonal</span></label>`;
    case 'senha': return `
      <div class="field"><label>Ação</label>${seg('pwMode', [['protect', 'Proteger'], ['unlock', 'Remover senha']], o.pwMode || 'protect')}</div>
      <div class="field"><label id="pwLabel">Senha</label><input type="password" id="pPw" autocomplete="new-password"></div>
      <div class="field" id="fPw2"><label>Confirmar senha</label><input type="password" id="pPw2" autocomplete="new-password"></div>
      <div id="fPerms">
        <label class="check"><input type="checkbox" id="pPrint" checked><span>Permitir imprimir</span></label>
        <label class="check"><input type="checkbox" id="pCopy" checked><span>Permitir copiar texto</span></label>
        <label class="check"><input type="checkbox" id="pModify"><span>Permitir editar</span></label>
      </div>`;
    case 'info': return `
      <div class="field"><label>Título</label><input type="text" id="mTitle"></div>
      <div class="field"><label>Autor</label><input type="text" id="mAuthor"></div>
      <div class="field"><label>Assunto</label><input type="text" id="mSubject"></div>
      <div class="field"><label>Palavras-chave <small>separadas por vírgula</small></label><input type="text" id="mKeywords"></div>
      <div class="field"><label>Criado com</label><input type="text" id="mCreator"></div>
      <p class="help">Os campos mostram os dados do arquivo destacado e são aplicados a todos da lista.</p>
      <label class="check"><input type="checkbox" id="mStrip"><span>Remover todos os metadados<small>Ignora os campos acima.</small></span></label>`;
    default: return '';
  }
}

const sizeOptions = (v) => [['a4', 'A4'], ['letter', 'Carta'], ['a3', 'A3'], ['a5', 'A5'], ['fit', 'Igual à imagem']].map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`).join('');
const segVal = (name) => $$(`#pdfOptions [data-seg="${name}"] button.active`)[0]?.dataset.v;

function bindOptions(id) {
  const box = $('pdfOptions');
  box.querySelectorAll('[data-seg]').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    g.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    saveO({ [g.dataset.seg]: b.dataset.v }); sync();
  }));
  const map = { pGray: 'gray', pStrip: 'strip', pName: id === 'juntar' ? 'mergeName' : 'imgName', pImgSize: 'imgSize', pSplit: 'split', pEvery: 'every', pRanges: 'ranges',
    pQ: 'q', pPages: 'pages', pToQueue: 'toQueue', pOptimize: 'optimize', pEachImg: 'eachImg', pNumFmt: 'numFmt', pStart: 'start', pSize: 'size', pMargin: 'numMargin',
    pColor: 'numColor', pSkip: 'skip', pWm: 'wm', pOp: 'op', pWmSize: 'wmSize', pWmColor: 'wmColor', pDiag: 'diag' };
  box.querySelectorAll('input, select').forEach((el) => el.addEventListener('input', () => {
    const k = map[el.id]; if (k) saveO({ [k]: el.type === 'checkbox' ? el.checked : el.value }); sync();
  }));
  if (id === 'paginas') $('pExtract').onclick = () => run('extract');
  if (id === 'info') fillMeta();
  sync();
}

function sync() {
  const id = S.tool, o = O();
  if (id === 'comprimir') {
    const lv = segVal('level');
    $('levelHelp').textContent = {
      leve: 'Quase sem perda visível. Imagens até 2400 px. Bom para impressão em casa.',
      recomendada: 'Equilíbrio ideal para e-mail e web. Imagens até 1700 px.',
      forte: 'Bem mais leve; imagens até 1150 px. Bom para leitura em tela.',
      extrema: 'Transforma cada página em imagem (110 dpi). O texto deixa de ser selecionável. Use para documentos escaneados.',
    }[lv];
    if ($('whereHelp')) $('whereHelp').textContent = segVal('where') === 'online'
      ? 'Usa o Ghostscript nos servidores do GitHub: costuma comprimir ainda mais. Começa em 20 a 60 s.'
      : 'Os arquivos não saem do seu computador.';
  }
  if (id === 'dividir') {
    const m = $('pSplit').value;
    $('fEvery').classList.toggle('hidden', m !== 'every');
    $('fRanges').classList.toggle('hidden', !(m === 'ranges' || m === 'extract'));
  }
  if (id === 'pdf2img') { $('pQVal').textContent = $('pQ').value; $('pQ').closest('.field').classList.toggle('hidden', segVal('imgFmt') === 'png'); }
  if (id === 'marca') $('pOpVal').textContent = $('pOp').value + '%';
  if (id === 'senha') {
    const prot = segVal('pwMode') === 'protect';
    $('fPw2').classList.toggle('hidden', !prot); $('fPerms').classList.toggle('hidden', !prot);
    $('pwLabel').textContent = prot ? 'Nova senha' : 'Senha atual';
    $('pdfRun').textContent = prot ? 'Proteger PDFs' : 'Remover senha';
  }
  void o;
}

async function fillMeta() {
  const f = activeFile();
  if (!f || f.kind !== 'pdf' || f.encrypted) return;
  try {
    const m = await ops.info(f.bytes);
    $('mTitle').value = m.title; $('mAuthor').value = m.author; $('mSubject').value = m.subject; $('mKeywords').value = m.keywords; $('mCreator').value = m.creator;
  } catch (_) { /* ok */ }
}

/* ============================== Arquivos ================================ */
function bindInputs() {
  $('pdfInput').onchange = (e) => { addFiles([...e.target.files]); e.target.value = ''; };
  const drop = $('pdfDrop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); addFiles([...e.dataTransfer.files]); });
  $('pdfClear').onclick = () => { S.files.forEach((f) => f.thumb && URL.revokeObjectURL(f.thumb)); S.files = []; S.activeId = null; S.editor = null; renderFiles(); updateEditor(); };
  $('pdfRun').onclick = () => run();
  $('pdfZip').onclick = downloadZip;
  $('pdfResClear').onclick = () => { S.results = []; renderResults(); };
  document.addEventListener('paste', (e) => {
    if (document.getElementById('wsPdf').classList.contains('hidden') || e.target.closest('input, textarea')) return;
    const files = [...(e.clipboardData?.files || [])]; if (files.length) addFiles(files);
  });
}

async function addFiles(list) {
  const t = TOOL[S.tool];
  let skipped = 0;
  for (const file of list) {
    const pdf = isPdf(file), img = isImage(file);
    if (!pdf && !img) { skipped++; continue; }
    if (img && t.accept === 'pdf' && !pdf) { skipped++; continue; }
    const f = { id: S.seq++, name: file.name, size: file.size, kind: pdf ? 'pdf' : 'image', mime: file.type || (pdf ? 'application/pdf' : 'image/jpeg'), bytes: new Uint8Array(await file.arrayBuffer()), pages: img ? 1 : null, thumb: null, encrypted: false };
    S.files.push(f);
    if (img) f.thumb = URL.createObjectURL(file);
    renderFiles();
    if (pdf) inspect(f);
  }
  if (skipped) ctx.toast(t.accept === 'pdf' ? `${skipped} arquivo(s) ignorado(s): esta ferramenta aceita só PDF` : `${skipped} arquivo(s) ignorado(s)`, 'err');
  if (!S.activeId && S.files[0]) S.activeId = S.files[0].id;
  renderFiles(); updateEditor();
}

async function inspect(f) {
  try {
    const view = await ops.openForView(f.bytes);
    f.pages = view.numPages;
    const page = await view.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const canvas = await ops.renderPage(view, 1, { scale: 96 / Math.max(vp.width, vp.height) });
    f.thumb = URL.createObjectURL(await ops.canvasToBlob(canvas, 'image/jpeg', 0.8));
    await ops.closeView(view);
  } catch (err) {
    if (err?.name === 'PasswordException') f.encrypted = true; else f.error = 'Não foi possível ler este PDF';
  }
  renderFiles();
  if (S.tool === 'paginas' && f.id === S.activeId) updateEditor();
}

const activeFile = () => S.files.find((f) => f.id === S.activeId) || S.files.find((f) => f.kind === 'pdf');

function renderFiles() {
  const ul = $('pdfFiles');
  $('pdfDrop').classList.toggle('compact', S.files.length > 0);
  $('pdfCount').textContent = `${S.files.length} ${S.files.length === 1 ? 'arquivo' : 'arquivos'}`;
  if (!S.files.length) { ul.innerHTML = '<li class="empty">Adicione arquivos para começar.</li>'; return; }
  const reorder = ['juntar', 'img2pdf'].includes(S.tool);
  ul.innerHTML = '';
  S.files.forEach((f, i) => {
    const li = document.createElement('li');
    li.className = 'item pdf-file' + (S.tool === 'paginas' && f.id === activeFile()?.id ? ' active' : '');
    li.draggable = reorder; li.dataset.id = f.id;
    const meta = [f.kind === 'pdf' ? (f.pages ? `${f.pages} ${f.pages === 1 ? 'página' : 'páginas'}` : 'lendo…') : 'imagem', fmtBytes(f.size)];
    li.innerHTML = `
      ${f.thumb ? `<img class="thumb pdf-thumb" src="${f.thumb}" alt="">` : `<div class="thumb pdf-thumb">${f.kind === 'pdf' ? 'PDF' : 'IMG'}</div>`}
      <div style="min-width:0">
        <div class="item-name" title="${esc(f.name)}">${reorder ? `<span class="order">${i + 1}</span>` : ''}${esc(f.name)}</div>
        <div class="item-meta"><span>${meta.join(' · ')}</span>${f.encrypted ? '<span class="badge bad">Com senha</span>' : ''}${f.error ? `<span style="color:var(--red)">${esc(f.error)}</span>` : ''}</div>
      </div>
      <div></div>
      <div class="item-actions">
        ${reorder ? `<button data-act="up" title="Subir" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>↑</button><button data-act="down" title="Descer" ${i === S.files.length - 1 ? 'disabled style="opacity:.3"' : ''}>↓</button>` : ''}
        <button data-act="rm" title="Remover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>`;
    li.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'rm') { S.files = S.files.filter((x) => x !== f); if (S.activeId === f.id) S.activeId = S.files[0]?.id || null; renderFiles(); updateEditor(); return; }
      if (act === 'up' || act === 'down') { const j = i + (act === 'up' ? -1 : 1); [S.files[i], S.files[j]] = [S.files[j], S.files[i]]; renderFiles(); return; }
      if (S.activeId !== f.id) { S.activeId = f.id; renderFiles(); updateEditor(); if (S.tool === 'info') fillMeta(); }
    });
    if (reorder) {
      li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(f.id)); li.classList.add('dragging'); });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('drop-target'); });
      li.addEventListener('dragleave', () => li.classList.remove('drop-target'));
      li.addEventListener('drop', (e) => {
        e.preventDefault(); li.classList.remove('drop-target');
        const from = S.files.findIndex((x) => String(x.id) === e.dataTransfer.getData('text/plain'));
        if (from < 0 || from === i) return;
        const [moved] = S.files.splice(from, 1); S.files.splice(i, 0, moved); renderFiles();
      });
    }
    ul.appendChild(li);
  });
}

/* ========================== Editor de páginas =========================== */
function updateEditor() {
  const card = $('pageEditor');
  const f = activeFile();
  if (S.tool !== 'paginas' || !f || f.kind !== 'pdf') { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  if (f.encrypted) { $('peGrid').innerHTML = '<div class="empty">Este PDF tem senha. Remova a senha com a ferramenta "Senha" antes de organizar.</div>'; $('peCount').textContent = ''; return; }
  if (!f.pages) { $('peGrid').innerHTML = '<div class="empty">Lendo o PDF…</div>'; return; }
  if (S.editor?.fileId !== f.id) openEditor(f);
  else renderEditor();
}

async function openEditor(f) {
  if (S.editor?.view) ops.closeView(S.editor.view);
  S.editor = { fileId: f.id, pages: Array.from({ length: f.pages }, (_, i) => ({ index: i, rotate: 0, selected: false })), view: null, thumbs: new Map(), last: null };
  renderEditor();
  S.editor.view = await ops.openForView(f.bytes);
  renderEditor();
}

function renderEditor() {
  const E = S.editor; const grid = $('peGrid');
  const sel = E.pages.filter((p) => p.selected).length;
  const f = activeFile();
  $('peCount').textContent = `${E.pages.length} de ${f?.pages || E.pages.length} páginas${sel ? ` · ${sel} selecionada${sel > 1 ? 's' : ''}` : ''}`;
  grid.innerHTML = '';
  if (!E.pages.length) { grid.innerHTML = '<div class="empty">Todas as páginas foram excluídas. Use "Restaurar" para voltar.</div>'; return; }
  const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { io.unobserve(en.target); drawThumb(Number(en.target.dataset.index), en.target); } }), { root: null, rootMargin: '300px' });
  E.pages.forEach((p, pos) => {
    const card = document.createElement('div');
    card.className = 'pe-card' + (p.selected ? ' selected' : '');
    card.draggable = true; card.dataset.index = p.index; card.dataset.pos = pos;
    card.innerHTML = `
      <div class="pe-thumb"><div class="pe-img" style="transform:rotate(${p.rotate}deg)">${E.thumbs.get(p.index) ? `<img src="${E.thumbs.get(p.index)}" alt="">` : '<span class="pe-load"></span>'}</div>
        <span class="pe-check">✓</span>
        <span class="pe-tools"><button data-a="rot" title="Girar">⟳</button><button data-a="del" title="Excluir">✕</button></span>
      </div>
      <div class="pe-num">${p.index + 1}${p.rotate ? ` <small>${((p.rotate % 360) + 360) % 360}°</small>` : ''}</div>`;
    card.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'rot') { p.rotate = (p.rotate + 90) % 360; renderEditor(); return; }
      if (a === 'del') { E.pages.splice(pos, 1); renderEditor(); return; }
      if (e.shiftKey && E.last != null) { const [x, y] = [Math.min(E.last, pos), Math.max(E.last, pos)]; for (let k = x; k <= y; k++) E.pages[k].selected = true; }
      else p.selected = !p.selected;
      E.last = pos; renderEditor();
    });
    card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(pos)); card.classList.add('dragging'); });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('drop-target'); });
    card.addEventListener('dragleave', () => card.classList.remove('drop-target'));
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData('text/plain'));
      if (Number.isNaN(from) || from === pos) return;
      const [m] = E.pages.splice(from, 1); E.pages.splice(pos, 0, m); renderEditor();
    });
    grid.appendChild(card);
    if (!E.thumbs.get(p.index)) io.observe(card);
  });
}

const drawing = new Set();
async function drawThumb(index, card) {
  const E = S.editor; if (!E?.view || drawing.has(index) || E.thumbs.get(index)) return;
  drawing.add(index);
  try {
    const page = await E.view.getPage(index + 1);
    const vp = page.getViewport({ scale: 1 });
    const canvas = await ops.renderPage(E.view, index + 1, { scale: 260 / Math.max(vp.width, vp.height) });
    const url = URL.createObjectURL(await ops.canvasToBlob(canvas, 'image/jpeg', 0.8));
    E.thumbs.set(index, url);
    const holder = card.querySelector('.pe-img'); if (holder) holder.innerHTML = `<img src="${url}" alt="">`;
  } catch (_) { /* ok */ } finally { drawing.delete(index); }
}

function editorToolbar(action) {
  const E = S.editor; if (!E) return;
  const sel = E.pages.filter((p) => p.selected);
  const target = sel.length ? sel : E.pages;
  if (action === 'all') { const all = E.pages.every((p) => p.selected); E.pages.forEach((p) => { p.selected = !all; }); }
  if (action === 'left') target.forEach((p) => { p.rotate = (p.rotate + 270) % 360; });
  if (action === 'right') target.forEach((p) => { p.rotate = (p.rotate + 90) % 360; });
  if (action === 'del') { if (!sel.length) return ctx.toast('Selecione as páginas que quer excluir'); E.pages = E.pages.filter((p) => !p.selected); }
  if (action === 'reverse') E.pages.reverse();
  if (action === 'reset') { const f = activeFile(); E.pages = Array.from({ length: f.pages }, (_, i) => ({ index: i, rotate: 0, selected: false })); }
  renderEditor();
}

document.addEventListener('click', (e) => { const b = e.target.closest('[data-pe]'); if (b) editorToolbar(b.dataset.pe); });
document.addEventListener('keydown', (e) => {
  if (S.tool !== 'paginas' || !S.editor || $('pageEditor').classList.contains('hidden') || $('wsPdf').classList.contains('hidden')) return;
  if (e.target.closest('input, textarea, select') || document.querySelector('.modal:not(.hidden)')) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); editorToolbar('del'); }
  else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) editorToolbar(e.shiftKey ? 'left' : 'right');
  else if (e.key.toLowerCase() === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); S.editor.pages.forEach((p) => { p.selected = true; }); renderEditor(); }
});

/* =============================== Executar =============================== */
const pdfBlob = (bytes) => new Blob([bytes], { type: 'application/pdf' });
function addResult(r) { S.results.unshift(r); renderResults(); }

function progress(done, total) {
  $('pdfProg').style.width = total ? `${(done / total) * 100}%` : '0';
  $('pdfRun').textContent = total && done < total ? `Processando ${done + 1} de ${total}…` : TOOL[S.tool].run;
  if (total) window.DigiFavicon?.progress(done / total);
}

async function run(mode) {
  if (S.running) return;
  const t = TOOL[S.tool];
  const pdfs = S.files.filter((f) => f.kind === 'pdf' && !f.error);
  const images = S.files.filter((f) => f.kind === 'image');
  const needsPdf = t.accept === 'pdf';
  if ((needsPdf && !pdfs.length) || (t.accept === 'image' && !images.length) || (t.accept === 'both' && !S.files.length)) {
    return ctx.toast(t.accept === 'image' ? 'Adicione imagens primeiro' : 'Adicione PDFs primeiro', 'err');
  }
  const locked = pdfs.filter((f) => f.encrypted);
  if (locked.length && !(S.tool === 'senha' && segVal('pwMode') === 'unlock')) {
    return ctx.toast(`${locked.length === 1 ? `"${locked[0].name}" tem` : `${locked.length} arquivos têm`} senha. Use a ferramenta "Senha" → Remover senha antes.`, 'err');
  }
  S.running = true; $('pdfRun').disabled = true;
  const before = S.results.length;
  const o = O();
  try {
    switch (S.tool) {
      case 'comprimir': await runCompress(pdfs); break;
      case 'juntar': {
        progress(0, 1);
        const sources = S.files.filter((f) => !f.error).map((f) => (f.kind === 'pdf' ? { bytes: f.bytes } : { kind: 'image', bytes: f.bytes, mime: f.mime, imageOpts: { pageSize: $('pImgSize').value, margin: 0, optimize: true } }));
        const bytes = await ops.merge(sources);
        const total = S.files.reduce((a, f) => a + f.size, 0);
        addResult({ name: cleanName($('pName').value || 'documentos-unidos') + '.pdf', blob: pdfBlob(bytes), note: `${S.files.length} arquivos unidos · ${fmtBytes(total)} no total` });
        break;
      }
      case 'dividir': {
        const m = $('pSplit').value;
        for (const [i, f] of pdfs.entries()) {
          progress(i, pdfs.length);
          const parts = await ops.split(f.bytes, m, { every: $('pEvery').value, ranges: $('pRanges').value });
          parts.reverse().forEach((p) => addResult({ name: `${baseName(f.name)}-${p.label}.pdf`, blob: pdfBlob(p.bytes), note: `de ${f.name}` }));
        }
        break;
      }
      case 'paginas': {
        const f = activeFile(); const E = S.editor;
        if (!E || E.fileId !== f.id) throw new Error('Abra o arquivo no editor de páginas');
        let pages = E.pages;
        if (mode === 'extract') { pages = E.pages.filter((p) => p.selected); if (!pages.length) throw new Error('Selecione as páginas que quer extrair'); }
        if (!pages.length) throw new Error('Não há páginas para salvar');
        const bytes = await ops.organize(f.bytes, pages);
        addResult({ name: `${baseName(f.name)}-${mode === 'extract' ? 'extraido' : 'organizado'}.pdf`, blob: pdfBlob(bytes), note: `${pages.length} de ${f.pages} páginas` });
        break;
      }
      case 'pdf2img': {
        const fmt = segVal('imgFmt') || 'jpeg';
        const ext = fmt === 'jpeg' ? 'jpg' : fmt;
        const toQueue = $('pToQueue').checked; const queued = [];
        for (const [i, f] of pdfs.entries()) {
          progress(i, pdfs.length);
          const imgs = await ops.pdfToImages(f.bytes, { format: fmt, dpi: segVal('dpi'), quality: $('pQ').value, ranges: $('pPages').value.trim() });
          const pad = String(f.pages || imgs.length).length;
          for (const im of imgs.reverse()) {
            const name = `${baseName(f.name)}-p${String(im.page).padStart(Math.max(2, pad), '0')}.${ext}`;
            addResult({ name, blob: im.blob, note: `${im.width}×${im.height} px`, image: true });
            if (toQueue) queued.unshift(new File([im.blob], name, { type: im.blob.type }));
          }
        }
        if (toQueue && queued.length) { ctx.addToImageQueue(queued); ctx.toast(`${queued.length} imagem(ns) enviadas para a área de Imagens`, 'ok'); }
        break;
      }
      case 'img2pdf': {
        const opts = { pageSize: $('pImgSize').value, orientation: segVal('orient'), margin: Number(segVal('margin')), optimize: $('pOptimize').checked };
        if ($('pEachImg').checked) {
          for (const [i, f] of images.entries()) { progress(i, images.length); addResult({ name: `${baseName(f.name)}.pdf`, blob: pdfBlob(await ops.imagesToPdf([f], opts)), srcSize: f.size }); }
        } else {
          progress(0, 1);
          addResult({ name: cleanName($('pName').value || 'imagens') + '.pdf', blob: pdfBlob(await ops.imagesToPdf(images, opts)), srcSize: images.reduce((a, f) => a + f.size, 0), note: `${images.length} páginas` });
        }
        break;
      }
      case 'numerar': await eachPdf(pdfs, 'numerado', (f) => ops.numberPages(f.bytes, {
        format: $('pNumFmt').value, position: segVal('numPos') || 'bottom-center', start: $('pStart').value, size: $('pSize').value, margin: $('pMargin').value, color: $('pColor').value, skipFirst: $('pSkip').checked,
      })); break;
      case 'marca': await eachPdf(pdfs, 'marca-dagua', (f) => ops.watermark(f.bytes, {
        text: $('pWm').value, opacity: $('pOp').value, size: $('pWmSize').value, color: $('pWmColor').value, diagonal: $('pDiag').checked, tiled: segVal('wmLayout') === 'tiled',
      })); break;
      case 'senha': {
        const pw = $('pPw').value;
        if (segVal('pwMode') === 'protect') {
          if (pw.length < 4) throw new Error('Use uma senha com pelo menos 4 caracteres');
          if (pw !== $('pPw2').value) throw new Error('As senhas não conferem');
          await eachPdf(pdfs, 'protegido', (f) => ops.protect(f.bytes, { userPassword: pw, print: $('pPrint').checked, copy: $('pCopy').checked, modify: $('pModify').checked }));
        } else {
          await eachPdf(pdfs, 'sem-senha', async (f) => {
            const out = await ops.unlock(f.bytes, pw);
            // O arquivo desbloqueado volta para a lista, pronto para as outras ferramentas
            f.bytes = out; f.size = out.length; f.encrypted = false; inspect(f);
            return out;
          });
        }
        break;
      }
      case 'info': await eachPdf(pdfs, 'metadados', (f) => ops.setMetadata(f.bytes, {
        strip: $('mStrip').checked, title: $('mTitle').value, author: $('mAuthor').value, subject: $('mSubject').value, keywords: $('mKeywords').value, creator: $('mCreator').value,
      })); break;
    }
    const n = S.results.length - before;
    if (n) ctx.toast(`Pronto! ${n} arquivo(s) gerado(s)`, 'ok');
    $('pdfResultsCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    console.error(err);
    ctx.toast(err.message || String(err), 'err');
  } finally {
    S.running = false; $('pdfRun').disabled = false; progress(0, 0); sync();
    window.DigiFavicon?.done();
  }
}

async function eachPdf(pdfs, suffix, fn) {
  const errors = [];
  for (const [i, f] of pdfs.entries()) {
    progress(i, pdfs.length);
    try { const bytes = await fn(f); addResult({ name: `${baseName(f.name)}-${suffix}.pdf`, blob: pdfBlob(bytes), note: `de ${f.name}` }); }
    catch (err) { errors.push(`${f.name}: ${err.message}`); }
  }
  if (errors.length) throw new Error(errors.join(' · '));
}

async function runCompress(pdfs) {
  const level = segVal('level') || 'recomendada';
  const opts = { level, grayscale: $('pGray').checked, stripMeta: $('pStrip').checked };
  const online = segVal('where') === 'online' && ctx.isOnlineReady();
  const finish = async (f, bytes) => {
    if (opts.stripMeta && online) { try { bytes = await ops.setMetadata(bytes, { strip: true }); } catch (_) { /* ok */ } }
    const kept = bytes.length >= f.size;
    addResult({ name: `${baseName(f.name)}-comprimido.pdf`, blob: kept ? pdfBlob(f.bytes) : pdfBlob(bytes), srcSize: f.size, note: kept ? 'Já estava otimizado: mantido o original' : '' });
  };
  if (online) {
    const items = pdfs.map((f) => ({ name: f.name, file: pdfBlob(f.bytes), size: f.size, srcFormat: 'pdf', src: f }));
    let done = 0; progress(0, pdfs.length);
    for (const job of ctx.splitJobs(items)) {
      const results = await ctx.runOnlineJob(job, { settings: { kind: 'pdf', level, grayscale: opts.grayscale }, opts: {} }, (_, txt) => { $('pdfRun').textContent = txt; });
      for (const it of job) {
        const r = results.get(it);
        if (r?.ok) await finish(it.src, new Uint8Array(r.outputs[0].buffer));
        else ctx.toast(`${it.name}: ${r?.error || 'falhou'}`, 'err');
        progress(++done, pdfs.length);
      }
    }
    return;
  }
  const errors = [];
  for (const [i, f] of pdfs.entries()) {
    progress(i, pdfs.length);
    try { const r = await ops.compress(f.bytes, opts); await finish(f, r.bytes); }
    catch (err) { errors.push(`${f.name}: ${err.message}`); }
  }
  if (errors.length) throw new Error(errors.join(' · '));
}

/* ============================== Resultados ============================== */
function renderResults() {
  const card = $('pdfResultsCard'); const ul = $('pdfResults');
  card.classList.toggle('hidden', !S.results.length);
  $('pdfResCount').textContent = `${S.results.length} ${S.results.length === 1 ? 'arquivo' : 'arquivos'}`;
  const withSrc = S.results.filter((r) => r.srcSize);
  const before = withSrc.reduce((a, r) => a + r.srcSize, 0), after = withSrc.reduce((a, r) => a + r.blob.size, 0);
  $('pdfSumBefore').textContent = withSrc.length ? fmtBytes(before) : '—';
  $('pdfSumAfter').textContent = S.results.length ? fmtBytes(S.results.reduce((a, r) => a + r.blob.size, 0)) : '—';
  $('pdfSumSaved').textContent = withSrc.length && before > after ? `${Math.round((1 - after / before) * 100)}%` : '—';
  $('pdfSumFiles').textContent = S.results.length || '—';
  ul.innerHTML = '';
  S.results.forEach((r) => {
    const li = document.createElement('li'); li.className = 'item';
    const pct = r.srcSize ? Math.round((1 - r.blob.size / r.srcSize) * 100) : null;
    if (r.image && !r.url) r.url = URL.createObjectURL(r.blob);
    li.innerHTML = `
      ${r.image ? `<img class="thumb" src="${r.url}" alt="">` : '<div class="thumb pdf-thumb pdf-ico">PDF</div>'}
      <div style="min-width:0"><div class="item-name" title="${esc(r.name)}">${esc(r.name)}</div><div class="item-meta">${r.note ? `<span>${esc(r.note)}</span>` : ''}</div></div>
      <div class="item-sizes">${r.srcSize ? `<div><span class="from">${fmtBytes(r.srcSize)}</span> <span class="to">${fmtBytes(r.blob.size)}</span></div>${pct > 0 ? `<span class="badge good">−${pct}%</span>` : pct < 0 ? `<span class="badge wait">+${-pct}%</span>` : ''}` : `<div class="to">${fmtBytes(r.blob.size)}</div>`}</div>
      <div class="item-actions">
        <button data-a="open" title="Abrir"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
        ${r.image ? '' : '<button data-a="reuse" title="Usar como entrada da próxima ferramenta"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg></button>'}
        <button data-a="dl" title="Baixar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg></button>
        <button data-a="rm" title="Remover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>`;
    li.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'open') { const u = URL.createObjectURL(r.blob); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60000); }
      if (a === 'dl') download(r.blob, r.name);
      if (a === 'rm') { S.results = S.results.filter((x) => x !== r); renderResults(); }
      if (a === 'reuse') { await addFiles([new File([r.blob], r.name, { type: 'application/pdf' })]); ctx.toast(`"${r.name}" adicionado à lista de arquivos`, 'ok'); $('pdfFiles').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    });
    ul.appendChild(li);
  });
}

function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function downloadZip() {
  if (!S.results.length) return;
  if (S.results.length === 1) return download(S.results[0].blob, S.results[0].name);
  const used = new Set(); const entries = {};
  for (const r of [...S.results].reverse()) {
    let n = r.name, k = 2; while (used.has(n.toLowerCase())) n = r.name.replace(/(\.[^.]+)$/, `-${k++}$1`);
    used.add(n.toLowerCase()); entries[n] = [new Uint8Array(await r.blob.arrayBuffer()), { level: 0 }];
  }
  download(new Blob([zipSync(entries)], { type: 'application/zip' }), `pdfs-${new Date().toISOString().slice(0, 10)}.zip`);
}
