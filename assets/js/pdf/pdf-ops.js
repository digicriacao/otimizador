/* =========================================================================
   Operações de PDF (pdf-lib, pdf.js e qpdf), todas no navegador
   ========================================================================= */
import { PDFDocument, PDFName, StandardFonts, rgb, degrees, PageSizes } from '../../../vendor/pdf-lib.esm.min.js';

/* ------------------------------- pdf.js -------------------------------- */
let pdfjsPromise = null;
export function pdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('../../../vendor/pdfjs/pdf.min.mjs').then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL('../../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
      return m;
    });
  }
  return pdfjsPromise;
}

const asset = (p) => new URL(`../../../vendor/pdfjs/${p}`, import.meta.url).href;

/** Abre um PDF para visualização (o buffer é copiado). */
export async function openForView(bytes, password) {
  const lib = await pdfjs();
  return lib.getDocument({
    data: bytes.slice(0), password,
    // cmaps (fontes asiáticas não incorporadas) não são incluídos para manter o pacote leve
    standardFontDataUrl: asset('standard_fonts/'),
    wasmUrl: asset('wasm/'), iccUrl: asset('iccs/'),
    isEvalSupported: false,
  }).promise;
}

export async function closeView(doc) {
  try { await (doc.destroy ? doc.destroy() : doc.loadingTask?.destroy()); } catch (_) { /* ok */ }
}

/** Renderiza uma página em canvas. scale 1 = 72 dpi. */
export async function renderPage(doc, pageNumber, { scale = 1, rotation = 0, background = '#ffffff' } = {}) {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, canvas, viewport, background }).promise;
  page.cleanup();
  return canvas;
}

export const canvasToBlob = (canvas, type = 'image/jpeg', quality = 0.85) =>
  new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Falha ao gerar imagem'))), type, quality));

/* ------------------------------- Workers ------------------------------- */
function makeRunner(url, type) {
  let w = null, seq = 0; const pending = new Map();
  return (payload, transfer = []) => new Promise((resolve, reject) => {
    if (!w) {
      w = new Worker(url, type ? { type } : undefined);
      w.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); e.data.ok ? p.resolve(e.data) : p.reject(Object.assign(new Error(e.data.error), { code: e.data.code, encrypted: e.data.encrypted })); };
      w.onerror = (e) => { pending.forEach((p) => p.reject(new Error(e.message || 'Erro no processamento'))); pending.clear(); w = null; };
    }
    const id = ++seq; pending.set(id, { resolve, reject });
    w.postMessage({ id, ...payload }, transfer);
  });
}
const runCompress = makeRunner(new URL('./pdf-worker.js', import.meta.url), 'module');
const runQpdf = makeRunner(new URL('./qpdf-worker.js', import.meta.url));

export async function qpdf(bytes, args) {
  const copy = bytes.slice(0);
  const r = await runQpdf({ input: copy.buffer, args }, [copy.buffer]);
  return new Uint8Array(r.buffer);
}

/* ---------------------------- Utilitários ------------------------------ */
export async function load(bytes) {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    if (err?.name === 'EncryptedPDFError' || /encrypt/i.test(err?.message || '')) {
      // Protegido só contra edição (sem senha de abertura): o qpdf libera
      try {
        const dec = await qpdf(bytes, ['--decrypt', '{in}', '{out}']);
        return await PDFDocument.load(dec, { updateMetadata: false });
      } catch (e2) {
        throw Object.assign(new Error('Este PDF tem senha de abertura. Use a ferramenta "Senha" para removê-la antes.'), { code: 'password' });
      }
    }
    throw new Error('Não foi possível ler o PDF (arquivo corrompido ou não é um PDF).');
  }
}

const save = (doc) => doc.save({ useObjectStreams: true, addDefaultPage: false });

/** Analisa "1-3, 5, 8-" → [[0,2],[4,4],[7,total-1]] (índices base 0). */
export function parseRanges(text, total) {
  const out = [];
  for (const part of String(text).split(/[,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)?\s*(?:-|a|até)\s*(\d+)?$/i) || part.match(/^(\d+)$/);
    if (!m) throw new Error(`Intervalo inválido: "${part}"`);
    let a, b;
    if (m.length === 2) { a = b = Number(m[1]); } else { a = m[1] ? Number(m[1]) : 1; b = m[2] ? Number(m[2]) : total; }
    if (a < 1 || b > total || a > b) throw new Error(`Intervalo fora do documento (1 a ${total}): "${part}"`);
    out.push([a - 1, b - 1]);
  }
  if (!out.length) throw new Error('Informe pelo menos uma página ou intervalo');
  return out;
}
const span = ([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

async function copyPagesTo(src, indices, target) {
  const dst = target || (await PDFDocument.create());
  const pages = await dst.copyPages(src, indices);
  pages.forEach((p) => dst.addPage(p));
  return dst;
}

/* ------------------------------ Operações ------------------------------ */
export async function info(bytes) {
  const doc = await load(bytes);
  return {
    pages: doc.getPageCount(),
    title: doc.getTitle() || '', author: doc.getAuthor() || '', subject: doc.getSubject() || '',
    keywords: doc.getKeywords() || '', creator: doc.getCreator() || '', producer: doc.getProducer() || '',
  };
}

/** Comprime recomprimindo as imagens internas e limpando a estrutura. */
export async function compress(bytes, opts) {
  let input = bytes;
  // Desbloqueia PDFs protegidos só contra edição (sem senha de abertura)
  try { await PDFDocument.load(bytes, { updateMetadata: false }); }
  catch (err) {
    if (!(/encrypt/i.test(err?.message || '') || err?.name === 'EncryptedPDFError')) throw new Error('Não foi possível ler o PDF (arquivo corrompido ou não é um PDF).');
    try { input = await qpdf(bytes, ['--decrypt', '{in}', '{out}']); }
    catch (_) { throw Object.assign(new Error('Este PDF tem senha de abertura. Use a ferramenta "Senha" para removê-la antes.'), { code: 'password' }); }
  }

  if (opts.level === 'extrema') return rasterize(input, opts);

  const copy = input.slice(0);
  const r = await runCompress({ op: 'compress', buffer: copy.buffer, opts }, [copy.buffer]);
  let out = new Uint8Array(r.buffer);
  // qpdf remove objetos órfãos e recompacta a estrutura
  try { out = await qpdf(out, ['--object-streams=generate', '--compression-level=9', '--recompress-flate', '{in}', '{out}']); } catch (_) { /* segue sem */ }
  return { bytes: out, stats: r.stats };
}

/** Compressão extrema: cada página vira uma imagem JPEG (perde texto selecionável). */
async function rasterize(bytes, opts) {
  const view = await openForView(bytes);
  const out = await PDFDocument.create();
  const dpi = opts.dpi || 110;
  for (let i = 1; i <= view.numPages; i++) {
    const page = await view.getPage(i);
    const vp = page.getViewport({ scale: 1, rotation: page.rotate });
    const canvas = await renderPage(view, i, { scale: dpi / 72 });
    if (opts.grayscale) {
      const c = canvas.getContext('2d'); const d = c.getImageData(0, 0, canvas.width, canvas.height); const a = d.data;
      for (let k = 0; k < a.length; k += 4) { const g = 0.2126 * a[k] + 0.7152 * a[k + 1] + 0.0722 * a[k + 2]; a[k] = a[k + 1] = a[k + 2] = g; }
      c.putImageData(d, 0, 0);
    }
    const jpg = await (await canvasToBlob(canvas, 'image/jpeg', (opts.quality || 60) / 100)).arrayBuffer();
    const img = await out.embedJpg(jpg);
    const p = out.addPage([vp.width, vp.height]);
    p.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
    canvas.width = canvas.height = 0;
  }
  await closeView(view);
  return { bytes: await save(out), stats: { rasterized: true } };
}

export async function merge(sources) {
  const out = await PDFDocument.create();
  for (const s of sources) {
    if (s.kind === 'image') await addImagePage(out, s.bytes, s.mime, s.imageOpts || {});
    else { const src = await load(s.bytes); await copyPagesTo(src, src.getPageIndices(), out); }
  }
  return save(out);
}

export async function split(bytes, mode, { every = 1, ranges = '' } = {}) {
  const src = await load(bytes);
  const total = src.getPageCount();
  let groups;
  if (mode === 'each') groups = src.getPageIndices().map((i) => [i, i]);
  else if (mode === 'every') {
    const n = Math.max(1, Number(every) || 1); groups = [];
    for (let i = 0; i < total; i += n) groups.push([i, Math.min(total - 1, i + n - 1)]);
  } else groups = parseRanges(ranges, total);

  if (mode === 'extract') {
    const idx = groups.flatMap(span);
    return [{ label: `paginas-${String(ranges).replace(/\s+/g, '').replace(/[^\d,-]/g, '').replace(/,/g, '_')}`, bytes: await save(await copyPagesTo(src, idx)) }];
  }
  const files = [];
  for (const g of groups) {
    const label = g[0] === g[1] ? `p${g[0] + 1}` : `p${g[0] + 1}-${g[1] + 1}`;
    files.push({ label, bytes: await save(await copyPagesTo(src, span(g))) });
  }
  return files;
}

/** pages: [{ index, rotate }] na ordem final (páginas ausentes são excluídas). */
export async function organize(bytes, pages) {
  const src = await load(bytes);
  const out = await copyPagesTo(src, pages.map((p) => p.index));
  out.getPages().forEach((p, i) => {
    const r = pages[i].rotate || 0;
    if (r) p.setRotation(degrees((p.getRotation().angle + r + 360) % 360));
  });
  return save(out);
}

function hexToRgb(hex) {
  const n = parseInt(String(hex || '#000000').replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Texto em fonte padrão: troca caracteres fora do WinAnsi para não falhar. */
const safeText = (s) => String(s).replace(/[^\x20-\x7E -ÿ]/g, '');

export async function numberPages(bytes, o) {
  const doc = await load(bytes);
  const font = await doc.embedFont(o.bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
  const pages = doc.getPages();
  const total = pages.length;
  const start = Number(o.start) || 1;
  const size = Number(o.size) || 10;
  const margin = (Number(o.margin) || 10) * 2.8346; // mm → pt
  const color = hexToRgb(o.color);
  pages.forEach((page, i) => {
    if (o.skipFirst && i === 0) return;
    const n = start + i - (o.skipFirst ? 1 : 0);
    const shownTotal = total - (o.skipFirst ? 1 : 0) + start - 1;
    const text = safeText((o.format || '{n}').replace('{n}', n).replace('{total}', shownTotal));
    const tw = font.widthOfTextAtSize(text, size);
    const { width, height } = page.getSize();
    const rot = page.getRotation().angle % 360;
    // Posição no sistema da página considerando a rotação de exibição
    const [vw, vh] = rot % 180 ? [height, width] : [width, height];
    const pos = o.position || 'bottom-center';
    let x = pos.endsWith('left') ? margin : pos.endsWith('right') ? vw - margin - tw : (vw - tw) / 2;
    let y = pos.startsWith('top') ? vh - margin - size : margin;
    const pt = toPageCoords(x, y, rot, width, height);
    page.drawText(text, { x: pt.x, y: pt.y, size, font, color, rotate: degrees(rot) });
  });
  return save(doc);
}

// Converte coordenadas "como a página aparece" para o sistema da página rotacionada
function toPageCoords(x, y, rot, w, h) {
  switch (rot) {
    case 90: return { x: w - y, y: x };
    case 180: return { x: w - x, y: h - y };
    case 270: return { x: y, y: h - x };
    default: return { x, y };
  }
}

export async function watermark(bytes, o) {
  const doc = await load(bytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const text = safeText(o.text || 'CONFIDENCIAL');
  const size = Number(o.size) || 60;
  const opacity = Math.max(0.03, Math.min(1, (Number(o.opacity) || 20) / 100));
  const angle = o.diagonal ? 45 : 0;
  const color = hexToRgb(o.color || '#EA0356');
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const tw = font.widthOfTextAtSize(text, size);
    const rad = (angle * Math.PI) / 180;
    const draw = (cx, cy) => page.drawText(text, {
      x: cx - (tw / 2) * Math.cos(rad) + (size / 3) * Math.sin(rad),
      y: cy - (tw / 2) * Math.sin(rad) - (size / 3) * Math.cos(rad),
      size, font, color, opacity, rotate: degrees(angle),
    });
    if (o.tiled) {
      const stepX = tw * 0.9 + 80, stepY = size * 4;
      for (let y = stepY / 2; y < height + stepY; y += stepY) for (let x = 0; x < width + stepX; x += stepX) draw(x + ((y / stepY) % 2) * stepX / 2, y);
    } else draw(width / 2, height / 2);
  }
  return save(doc);
}

export async function setMetadata(bytes, m) {
  const doc = await load(bytes);
  if (m.strip) {
    const infoDict = doc.getInfoDict();
    for (const k of [...infoDict.keys()]) infoDict.delete(k);
    doc.catalog.delete(PDFName.of('Metadata'));
  } else {
    doc.setTitle(m.title || '', { showInWindowTitleBar: !!m.title });
    doc.setAuthor(m.author || '');
    doc.setSubject(m.subject || '');
    doc.setKeywords((m.keywords || '').split(',').map((s) => s.trim()).filter(Boolean));
    doc.setCreator(m.creator || '');
    doc.setProducer('Otimizador Digi');
    doc.setModificationDate(new Date());
  }
  return save(doc);
}

export async function protect(bytes, { userPassword, ownerPassword, print = true, copy = true, modify = false }) {
  const owner = ownerPassword || userPassword + '-' + Math.random().toString(36).slice(2, 10);
  return qpdf(bytes, [
    '--encrypt', `--user-password=${userPassword}`, `--owner-password=${owner}`, '--bits=256',
    `--print=${print ? 'full' : 'none'}`, `--extract=${copy ? 'y' : 'n'}`, `--modify=${modify ? 'all' : 'none'}`,
    '--', '{in}', '{out}',
  ]);
}

export async function unlock(bytes, password) {
  try { return await qpdf(bytes, [`--password=${password || ''}`, '--decrypt', '{in}', '{out}']); }
  catch (err) { throw Object.assign(new Error(err.code === 'password' || /password/i.test(err.message) || /código 2/.test(err.message) ? 'Senha incorreta' : err.message), { code: 'password' }); }
}

/* -------------------------- Imagens → PDF ------------------------------ */
const SIZES = { a4: PageSizes.A4, letter: PageSizes.Letter, a3: PageSizes.A3, a5: PageSizes.A5 };

export async function imagesToPdf(images, o) {
  const doc = await PDFDocument.create();
  for (const im of images) await addImagePage(doc, im.bytes, im.mime, o);
  return save(doc);
}

async function addImagePage(doc, bytes, mime, o = {}) {
  let data = bytes, type = mime;
  // pdf-lib só embute JPG e PNG: converte os demais e, se pedido, reduz
  const needsConvert = !/jpe?g|png/.test(type) || o.optimize;
  if (needsConvert) {
    const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
    const max = o.optimize ? 2000 : 6000;
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    const ctx = c.getContext('2d');
    const alpha = /png|webp|gif|avif/.test(type);
    if (!alpha || o.optimize) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
    const toPng = alpha && !o.optimize;
    data = await (await canvasToBlob(c, toPng ? 'image/png' : 'image/jpeg', 0.85)).arrayBuffer();
    type = toPng ? 'image/png' : 'image/jpeg';
  }
  const img = /png/.test(type) ? await doc.embedPng(data) : await doc.embedJpg(data);
  const margin = (Number(o.margin) || 0) * 2.8346;
  let pw, ph;
  if (!o.pageSize || o.pageSize === 'fit') { pw = img.width * 0.75 + margin * 2; ph = img.height * 0.75 + margin * 2; } // 96 dpi
  else {
    [pw, ph] = SIZES[o.pageSize] || PageSizes.A4;
    const landscape = o.orientation === 'landscape' || (o.orientation !== 'portrait' && img.width > img.height);
    if (landscape) [pw, ph] = [ph, pw];
  }
  const page = doc.addPage([pw, ph]);
  const aw = pw - margin * 2, ah = ph - margin * 2;
  const s = Math.min(aw / img.width, ah / img.height);
  const w = img.width * s, h = img.height * s;
  page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
}

/* -------------------------- PDF → imagens ------------------------------ */
export async function pdfToImages(bytes, o, onPage) {
  const view = await openForView(bytes, o.password);
  const total = view.numPages;
  const indices = o.ranges ? parseRanges(o.ranges, total).flatMap(span) : Array.from({ length: total }, (_, i) => i);
  const mime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[o.format] || 'image/jpeg';
  const out = [];
  for (const i of indices) {
    const canvas = await renderPage(view, i + 1, { scale: (Number(o.dpi) || 150) / 72, background: o.format === 'png' && o.transparent ? 'rgba(0,0,0,0)' : '#ffffff' });
    out.push({ page: i + 1, width: canvas.width, height: canvas.height, blob: await canvasToBlob(canvas, mime, (Number(o.quality) || 85) / 100) });
    canvas.width = canvas.height = 0;
    onPage?.(out.length, indices.length);
  }
  await closeView(view);
  return out;
}
