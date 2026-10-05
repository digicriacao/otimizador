/* =========================================================================
   Otimizador Digi — worker de processamento
   Roda fora da thread principal: decodifica, redimensiona, ajusta e
   codifica as imagens com codecs WebAssembly (MozJPEG, OxiPNG, libwebp,
   libavif) — os mesmos usados pelo Squoosh, do Google.
   ========================================================================= */

import encodeJpeg from '../../vendor/jsquash/jpeg/encode.js';
import decodeJpeg from '../../vendor/jsquash/jpeg/decode.js';
import encodePng from '../../vendor/jsquash/png/encode.js';
import decodePng from '../../vendor/jsquash/png/decode.js';
import encodeWebp from '../../vendor/jsquash/webp/encode.js';
import decodeWebp from '../../vendor/jsquash/webp/decode.js';
import encodeAvif from '../../vendor/jsquash/avif/encode.js';
import decodeAvif from '../../vendor/jsquash/avif/decode.js';
import oxipng from '../../vendor/jsquash/oxipng/optimise.js';
import resizeWasm from '../../vendor/jsquash/resize/index.js';
import { computeTargets, cropBox } from './dims.js';
import { buildPaletteSync, applyPaletteSync, utils as iqUtils } from '../../vendor/image-q.js';

const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' };
const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp', avif: 'avif' };

self.onmessage = async (e) => {
  const { id, blob, imageData, srcFormat, opts } = e.data;
  try {
    const t0 = performance.now();
    const source = imageData || (await decode(blob, srcFormat));
    const outputs = [];
    const targets = computeTargets(source.width, source.height, opts);

    for (const t of targets) {
      let img = source;
      if (opts.crop && opts.crop.enabled) img = cropToRatio(img, opts.crop.ratio);
      if (t.w !== img.width || t.h !== img.height) {
        img = await resizeWasm(cloneImageData(img), {
          width: t.w, height: t.h,
          method: opts.resampler || 'lanczos3',
          fitMethod: t.cover ? 'contain' : 'stretch',
          premultiply: true, linearRGB: true,
        });
      }
      img = applyAdjustments(img, opts);

      const format = resolveFormat(opts.format, srcFormat, hasAlpha(img));
      const enc = await encodeSmart(img, format, opts);

      outputs.push({
        buffer: enc.buffer, mime: MIME[enc.format], ext: EXT[enc.format], format: enc.format,
        width: img.width, height: img.height, quality: enc.quality, label: t.label || '',
      });
    }

    const transfers = outputs.map((o) => o.buffer);
    self.postMessage({ id, ok: true, outputs, srcWidth: source.width, srcHeight: source.height, ms: Math.round(performance.now() - t0) }, transfers);
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err && err.message) || String(err) });
  }
};

/* ---------------------------- Decodificação ---------------------------- */
async function decode(blob, srcFormat) {
  // 1º: decodificador nativo do navegador (rápido, respeita a orientação EXIF)
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image', premultiplyAlpha: 'none' });
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    return ctx.getImageData(0, 0, c.width, c.height);
  } catch (_) {
    // 2º: decodificadores WASM (ex.: AVIF/WebP em navegadores mais antigos)
    const buf = await blob.arrayBuffer();
    const dec = { jpeg: decodeJpeg, png: decodePng, webp: decodeWebp, avif: decodeAvif }[srcFormat];
    if (!dec) throw new Error('Formato não suportado por este navegador');
    return dec(buf);
  }
}

function cropToRatio(img, ratio) {
  const b = cropBox(img.width, img.height, ratio);
  if (b.w === img.width && b.h === img.height) return img;
  const out = new ImageData(b.w, b.h);
  for (let y = 0; y < b.h; y++) {
    const s = ((y + b.y) * img.width + b.x) * 4;
    out.data.set(img.data.subarray(s, s + b.w * 4), y * b.w * 4);
  }
  return out;
}

/* ------------------------------ Ajustes -------------------------------- */
function applyAdjustments(img, opts) {
  const a = opts.adjust || {};
  if (a.rotate) img = rotate(img, a.rotate);
  if (a.flipH) img = flipH(img);
  if (a.grayscale) {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      d[i] = d[i + 1] = d[i + 2] = g;
    }
  }
  if (a.sharpen) img = sharpen(img, 0.35);
  return img;
}

function rotate(img, deg) {
  const { width: W, height: H, data } = img;
  const turns = ((deg / 90) % 4 + 4) % 4;
  if (!turns) return img;
  const swap = turns % 2 === 1;
  const out = new ImageData(swap ? H : W, swap ? W : H);
  const o32 = new Uint32Array(out.data.buffer), i32 = new Uint32Array(data.buffer.slice(0));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let nx, ny;
    if (turns === 1) { nx = H - 1 - y; ny = x; }
    else if (turns === 2) { nx = W - 1 - x; ny = H - 1 - y; }
    else { nx = y; ny = W - 1 - x; }
    o32[ny * out.width + nx] = i32[y * W + x];
  }
  return out;
}

function flipH(img) {
  const { width: W, height: H } = img;
  const out = new ImageData(W, H);
  const o = new Uint32Array(out.data.buffer), i = new Uint32Array(img.data.buffer.slice(0));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[y * W + (W - 1 - x)] = i[y * W + x];
  return out;
}

// Unsharp mask leve (3x3) — devolve nitidez perdida no redimensionamento
function sharpen(img, amount) {
  const { width: W, height: H, data: s } = img;
  const out = new ImageData(new Uint8ClampedArray(s), W, H);
  const d = out.data;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = (y * W + x) * 4;
    for (let c = 0; c < 3; c++) {
      const blur = (s[i - 4 + c] + s[i + 4 + c] + s[i - W * 4 + c] + s[i + W * 4 + c]) / 4;
      d[i + c] = s[i + c] + amount * (s[i + c] - blur) * 2;
    }
  }
  return out;
}

/* ------------------------------ Codificação ---------------------------- */
function resolveFormat(fmt, src, alpha) {
  if (fmt === 'original') return ['jpeg', 'png', 'webp', 'avif'].includes(src) ? src : (alpha ? 'png' : 'jpeg');
  if (fmt === 'auto') return 'auto';
  return fmt;
}

async function encodeSmart(img, format, opts) {
  // "Auto": testa WebP e o formato clássico mais adequado e fica com o menor
  if (format === 'auto') {
    const alpha = hasAlpha(img);
    const a = await encodeWithTarget(img, 'webp', opts);
    const b = await encodeWithTarget(img, alpha ? 'png' : 'jpeg', opts);
    return a.buffer.byteLength <= b.buffer.byteLength ? a : b;
  }
  return encodeWithTarget(img, format, opts);
}

// Se houver tamanho-alvo (KB), faz busca binária na qualidade
async function encodeWithTarget(img, format, opts) {
  const target = (opts.targetKB || 0) * 1024;
  const lossy = format === 'jpeg' || ((format === 'webp' || format === 'avif') && !opts.lossless);
  if (!target || !lossy) {
    const q = opts.quality;
    return { buffer: await encodeOnce(img, format, q, opts), format, quality: q };
  }
  let lo = 5, hi = Math.min(95, opts.quality || 95), best = null;
  for (let i = 0; i < 7 && lo <= hi; i++) {
    const q = Math.round((lo + hi) / 2);
    const buf = await encodeOnce(img, format, q, opts);
    if (buf.byteLength <= target) { best = { buffer: buf, format, quality: q }; lo = q + 1; }
    else hi = q - 1;
  }
  if (!best) best = { buffer: await encodeOnce(img, format, 5, opts), format, quality: 5 };
  return best;
}

async function encodeOnce(img, format, quality, opts) {
  switch (format) {
    case 'jpeg': {
      const flat = flatten(img, opts.background || '#ffffff');
      return encodeJpeg(flat, {
        quality, progressive: opts.progressive !== false, optimize_coding: true,
        trellis_multipass: quality < 90, auto_subsample: true,
        chroma_subsample: quality >= 90 ? 1 : 2,
      });
    }
    case 'webp':
      return encodeWebp(img, opts.lossless
        ? { lossless: 1, quality: 100, method: 4, exact: 0, near_lossless: quality >= 95 ? 100 : 60 }
        : { quality, method: 4, alpha_quality: Math.max(quality, 80), sns_strength: 60, use_sharp_yuv: 1 });
    case 'avif':
      return encodeAvif(img, opts.lossless
        ? { lossless: true, speed: 6 }
        : { quality, speed: 6, enableSharpYUV: true });
    case 'png': {
      let src = img;
      const colors = opts.pngColors || 0;
      if (colors >= 2 && colors <= 256) src = quantize(img, colors, opts.dither !== false);
      const raw = await encodePng(src);
      return oxipng(raw, { level: opts.pngLevel ?? 2, interlace: false, optimiseAlpha: true });
    }
    default:
      throw new Error('Formato de saída inválido: ' + format);
  }
}

// PNG com paleta reduzida (técnica do TinyPNG): até 70% menor
function quantize(img, colors, dither) {
  const pc = iqUtils.PointContainer.fromUint8Array(img.data, img.width, img.height);
  const palette = buildPaletteSync([pc], { colors, paletteQuantization: 'wuquant', colorDistanceFormula: 'euclidean-bt709' });
  const outPc = applyPaletteSync(pc, palette, { imageQuantization: dither ? 'floyd-steinberg' : 'nearest', colorDistanceFormula: 'euclidean-bt709' });
  return new ImageData(new Uint8ClampedArray(outPc.toUint8Array()), img.width, img.height);
}

function flatten(img, hex) {
  if (!hasAlpha(img)) return img;
  const [r, g, b] = hexToRgb(hex);
  const out = new ImageData(img.width, img.height);
  const s = img.data, d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    const a = s[i + 3] / 255;
    d[i] = s[i] * a + r * (1 - a);
    d[i + 1] = s[i + 1] * a + g * (1 - a);
    d[i + 2] = s[i + 2] * a + b * (1 - a);
    d[i + 3] = 255;
  }
  return out;
}

function hasAlpha(img) {
  const d = img.data;
  for (let i = 3; i < d.length; i += 16) if (d[i] < 255) return true;
  return false;
}

function hexToRgb(h) {
  const n = parseInt(String(h).replace('#', '').padEnd(6, 'f').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function cloneImageData(img) {
  return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
}
