/* =========================================================================
   Otimizador Digi — compressão de PDF (roda em segundo plano)
   Recomprime as imagens de dentro do PDF (reduzindo resolução e qualidade)
   sem mexer em textos, fontes e vetores: o PDF continua pesquisável.
   ========================================================================= */
import { PDFDocument, PDFName, PDFRawStream, PDFArray, PDFNumber, PDFDict, PDFRef, PDFBool } from '../../../vendor/pdf-lib.esm.min.js';
import encodeJpeg from '../../../vendor/jsquash/jpeg/encode.js';
import { unzlibSync } from '../../../vendor/fflate.js';

export const LEVELS = {
  leve:        { quality: 84, maxPx: 2400 },
  recomendada: { quality: 72, maxPx: 1700 },
  forte:       { quality: 58, maxPx: 1150 },
};

const N = (s) => PDFName.of(s);
const nameOf = (o) => (o instanceof PDFName ? o.toString() : null);

self.onmessage = async (e) => {
  const { id, op, buffer, opts } = e.data;
  try {
    if (op !== 'compress') throw new Error('Operação desconhecida: ' + op);
    const res = await compress(new Uint8Array(buffer), opts || {});
    self.postMessage({ id, ok: true, ...res }, [res.buffer.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || String(err), encrypted: err?.name === 'EncryptedPDFError' || /encrypt/i.test(err?.message || '') });
  }
};

async function compress(bytes, opts) {
  const level = LEVELS[opts.level] || LEVELS.recomendada;
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const ctx = doc.context;

  // Imagens usadas como máscara (SMask) não são recomprimidas: perderiam o recorte
  const masks = new Set();
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFRawStream ? obj.dict : obj instanceof PDFDict ? obj : null;
    const sm = dict?.get(N('SMask'));
    if (sm instanceof PDFRef) masks.add(sm.toString());
  }

  const stats = { images: 0, recompressed: 0, savedBytes: 0 };
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    if (nameOf(d.get(N('Subtype'))) !== '/Image') continue;
    stats.images++;
    if (masks.has(ref.toString())) continue;
    try {
      const out = await recompressImage(ctx, obj, level, opts);
      if (out) {
        stats.recompressed++;
        stats.savedBytes += obj.contents.length - out.contents.length;
        ctx.assign(ref, out);
      }
    } catch (err) {
      // Imagem em formato que não sabemos tratar: fica como está
    }
  }

  if (opts.stripMeta) stripMetadata(doc);
  const saved = await doc.save({ useObjectStreams: true, addDefaultPage: false });
  return { buffer: saved, stats };
}

function stripMetadata(doc) {
  const info = doc.getInfoDict();
  for (const k of [...info.keys()]) info.delete(k);
  doc.catalog.delete(N('Metadata'));
}

/* ------------------------------ Imagens -------------------------------- */
async function recompressImage(ctx, stream, level, opts) {
  const d = stream.dict;
  const w = d.lookup(N('Width'), PDFNumber)?.asNumber();
  const h = d.lookup(N('Height'), PDFNumber)?.asNumber();
  const bpc = d.lookup(N('BitsPerComponent'))?.asNumber?.() ?? 8;
  if (!w || !h || bpc !== 8) return null;
  const imgMask = d.lookup(N('ImageMask'));
  if (imgMask instanceof PDFBool && imgMask.asBoolean()) return null;
  if (d.get(N('Mask')) || d.get(N('Decode'))) return null;
  if (w * h < 40000) return null; // ícones e imagens pequenas não compensam

  const cs = colorInfo(ctx, d.get(N('ColorSpace')));
  if (!cs) return null;

  // Filtro: só DCT (JPEG) ou Flate (sem perdas)
  let filter = d.lookup(N('Filter'));
  if (filter instanceof PDFArray) { if (filter.size() !== 1) return null; filter = filter.lookup(0); }
  const f = nameOf(filter);

  let bitmap;
  if (f === '/DCTDecode') {
    bitmap = await createImageBitmap(new Blob([stream.contents], { type: 'image/jpeg' }));
    if (bitmap.width !== w || bitmap.height !== h) { bitmap.close(); return null; }
  } else if (f === '/FlateDecode') {
    let raw = unzlibSync(stream.contents);
    const parms = d.lookup(N('DecodeParms'));
    const pDict = parms instanceof PDFArray ? parms.lookup(0) : parms;
    const predictor = pDict instanceof PDFDict ? (pDict.lookup(N('Predictor'))?.asNumber?.() ?? 1) : 1;
    if (predictor >= 10) raw = undoPng(raw, w, cs.n);
    else if (predictor !== 1) return null;
    if (raw.length < w * h * cs.n) return null;
    // Gráficos com poucas cores (prints, diagramas) ficam sem perdas: JPEG borraria o texto
    if (fewColors(raw, w, h, cs.n)) return null;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0; i < w * h; i++, j += cs.n) {
      const o = i * 4;
      if (cs.n === 1) { rgba[o] = rgba[o + 1] = rgba[o + 2] = raw[j]; }
      else { rgba[o] = raw[j]; rgba[o + 1] = raw[j + 1]; rgba[o + 2] = raw[j + 2]; }
      rgba[o + 3] = 255;
    }
    bitmap = await createImageBitmap(new ImageData(rgba, w, h));
  } else {
    return null; // JPX, JBIG2, CCITT etc.
  }

  // Reduz a resolução se passar do limite do nível
  const scale = Math.min(1, level.maxPx / Math.max(w, h));
  const nw = Math.max(1, Math.round(w * scale)), nh = Math.max(1, Math.round(h * scale));
  const canvas = new OffscreenCanvas(nw, nh);
  const c2d = canvas.getContext('2d', { willReadFrequently: true });
  c2d.imageSmoothingQuality = 'high';
  c2d.drawImage(bitmap, 0, 0, nw, nh);
  bitmap.close();
  const img = c2d.getImageData(0, 0, nw, nh);

  const gray = cs.n === 1 || opts.grayscale;
  const jpeg = new Uint8Array(await encodeJpeg(img, {
    quality: level.quality, progressive: true, optimize_coding: true,
    color_space: gray ? 1 : 3, chroma_subsample: 2, auto_subsample: !gray,
  }));

  // Só troca se ganhar de verdade
  if (jpeg.length > stream.contents.length * 0.92) return null;

  const keepCs = !gray || cs.n === 1;
  const dict = ctx.obj({
    Type: 'XObject', Subtype: 'Image', Width: nw, Height: nh, BitsPerComponent: 8, Filter: 'DCTDecode', Length: jpeg.length,
  });
  dict.set(N('ColorSpace'), keepCs ? d.get(N('ColorSpace')) : N(gray ? 'DeviceGray' : 'DeviceRGB'));
  for (const k of ['SMask', 'Intent', 'Interpolate', 'OC', 'Alternates']) { const v = d.get(N(k)); if (v) dict.set(N(k), v); }
  return PDFRawStream.of(dict, jpeg);
}

function colorInfo(ctx, csObj) {
  const cs = csObj instanceof PDFRef ? ctx.lookup(csObj) : csObj;
  const n = nameOf(cs);
  if (n === '/DeviceRGB' || n === '/CalRGB') return { n: 3 };
  if (n === '/DeviceGray' || n === '/CalGray') return { n: 1 };
  if (cs instanceof PDFArray) {
    const kind = nameOf(cs.lookup(0));
    if (kind === '/ICCBased') {
      const icc = cs.lookup(1);
      const comps = (icc instanceof PDFRawStream ? icc.dict : icc?.dict)?.lookup(N('N'))?.asNumber?.();
      if (comps === 3 || comps === 1) return { n: comps };
    }
    if (kind === '/CalRGB') return { n: 3 };
    if (kind === '/CalGray') return { n: 1 };
  }
  return null; // CMYK, Indexed, Lab, Separation…
}

function undoPng(data, w, n) {
  const stride = w * n;
  const rows = Math.floor(data.length / (stride + 1));
  const out = new Uint8Array(rows * stride);
  for (let y = 0; y < rows; y++) {
    const t = data[y * (stride + 1)];
    const src = y * (stride + 1) + 1, dst = y * stride, prev = dst - stride;
    for (let x = 0; x < stride; x++) {
      const raw = data[src + x];
      const a = x >= n ? out[dst + x - n] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = x >= n && y > 0 ? out[prev + x - n] : 0;
      let v;
      switch (t) {
        case 0: v = raw; break;
        case 1: v = raw + a; break;
        case 2: v = raw + b; break;
        case 3: v = raw + ((a + b) >> 1); break;
        case 4: { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
        default: v = raw;
      }
      out[dst + x] = v & 255;
    }
  }
  return out;
}

function fewColors(raw, w, h, n) {
  const seen = new Set();
  const total = w * h, step = Math.max(1, Math.floor(total / 6000));
  for (let i = 0; i < total; i += step) {
    const j = i * n;
    seen.add(n === 1 ? raw[j] : (raw[j] << 16) | (raw[j + 1] << 8) | raw[j + 2]);
    if (seen.size > 600) return false;
  }
  return true;
}
