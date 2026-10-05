/* =========================================================================
   Otimizador Digi — aplicação principal
   ========================================================================= */
import { buildName, splitName, uniqueName } from './naming.js';
import { computeTargets, cropBox } from './dims.js';
import { zipSync } from '../../vendor/fflate.js';
import { loadScript, isImageName } from './cloud/common.js';
import { microsoft } from './cloud/microsoft.js';
import { isOnlineReady, canProcessOnline, splitJobs, runOnlineJob } from './online.js';

const $ = (id) => document.getElementById(id);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const fmtBytes = (b) => (b == null ? '—' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`);
const store = {
  get(k, d) { try { const v = localStorage.getItem('otimizador.' + k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('otimizador.' + k, JSON.stringify(v)); } catch (_) { /* sem storage */ } },
};

/* ============================== Estado ================================ */
const state = { items: [], running: false, nextId: 1 };
const PROVIDERS = { microsoft };

/* ============================ Predefinições ============================ */
const BUILTIN_PRESETS = [
  { name: 'Web padrão', s: { format: 'webp', quality: 80, resizeMode: 'longest', rW: 1920, pngColors: '256', sharpen: false } },
  { name: 'Máxima compressão', s: { format: 'webp', quality: 62, resizeMode: 'longest', rW: 1600, sharpen: true, pngColors: '128' } },
  { name: 'Alta qualidade', s: { format: 'original', quality: 90, resizeMode: 'none', pngColors: '0' } },
  { name: 'Redes sociais', s: { format: 'jpeg', quality: 86, resizeMode: 'width', rW: 1080 } },
  { name: 'E-mail marketing', s: { format: 'jpeg', quality: 74, resizeMode: 'width', rW: 1200, progressive: false } },
  { name: 'Miniatura', s: { format: 'webp', quality: 76, resizeMode: 'cover', rW: 400, rH: 400 } },
  { name: 'Responsivo (srcset)', s: { format: 'webp', quality: 78, resizeMode: 'responsive', rSizes: '480, 960, 1440, 1920' } },
];
const PRESET_DEFAULTS = { lossless: false, targetKB: '', cropRatio: '0', progressive: true, sharpen: false, pngColors: '256' };

/* =========================== Leitura das opções ======================== */
const SETTING_IDS = ['quality', 'lossless', 'pngColors', 'targetKB', 'background', 'resampler', 'progressive', 'resizeMode', 'rW', 'rH', 'rPct', 'rSizes',
  'cropRatio', 'noUpscale', 'nameMode', 'prefix', 'suffix', 'seqBase', 'seqStart', 'template', 'addDims', 'addFmt', 'slug', 'gifKeep', 'gifLossy',
  'gifColors', 'gifLevel', 'flipH', 'grayscale', 'sharpen', 'skipLarger', 'svgOptimize', 'keepFolders', 'concurrency', 'uploadMode', 'subfolder'];

function segValue(id) { return $$(`#${id} button.active`)[0]?.dataset.v; }
function setSeg(id, v) { $$(`#${id} button`).forEach((b) => b.classList.toggle('active', b.dataset.v === String(v))); }

function readSettings() {
  const s = { format: segValue('fmtSeg') || 'webp', rotate: Number(segValue('rotSeg') || 0) };
  for (const id of SETTING_IDS) { const el = $(id); s[id] = el.type === 'checkbox' ? el.checked : el.value; }
  return s;
}

function applySettings(s) {
  if (s.format) setSeg('fmtSeg', s.format);
  if (s.rotate != null) setSeg('rotSeg', s.rotate);
  for (const id of SETTING_IDS) {
    if (!(id in s)) continue;
    const el = $(id);
    if (el.type === 'checkbox') el.checked = !!s[id]; else el.value = s[id];
  }
  syncUI();
}

function workerOpts(s) {
  const sizes = s.resizeMode === 'responsive'
    ? s.rSizes.split(/[,\s;]+/).map(Number).filter((n) => n > 0).sort((a, b) => a - b) : null;
  return {
    format: s.format, quality: Number(s.quality), lossless: s.lossless, pngColors: Number(s.pngColors),
    targetKB: Number(s.targetKB) || 0, background: s.background, resampler: s.resampler, progressive: s.progressive,
    resize: { mode: s.resizeMode === 'responsive' ? 'none' : s.resizeMode, width: Number(s.rW) || 1, height: Number(s.rH) || 1, percent: Number(s.rPct), noUpscale: s.noUpscale },
    sizes,
    crop: { enabled: Number(s.cropRatio) > 0, ratio: Number(s.cropRatio) },
    adjust: { rotate: s.rotate, flipH: s.flipH, grayscale: s.grayscale, sharpen: s.sharpen },
  };
}

function nameCfg(s, total) {
  return { mode: s.nameMode, prefix: s.prefix, suffix: s.suffix, template: s.template, seqBase: s.seqBase, seqStart: Number(s.seqStart) || 0, addDims: s.addDims, addFmt: s.addFmt, slug: s.slug, total };
}

/* =============================== UI sync =============================== */
function syncUI() {
  const s = readSettings();
  const fmt = s.format;
  $('qualityVal').textContent = s.quality;
  $('pctVal').textContent = s.rPct + '%';
  $('gifLossyVal').textContent = s.gifLossy;
  $('fLossless').classList.toggle('hidden', !['webp', 'avif', 'auto'].includes(fmt));
  $('fPngColors').classList.toggle('hidden', !['png', 'original', 'auto'].includes(fmt));
  $('fQuality').classList.toggle('hidden', s.lossless && ['webp', 'avif'].includes(fmt));

  const m = s.resizeMode;
  $('fWH').classList.toggle('hidden', ['none', 'percent', 'responsive'].includes(m));
  $('fW').classList.toggle('hidden', m === 'height');
  $('fH').classList.toggle('hidden', ['width', 'longest'].includes(m));
  $('fW').querySelector('label').textContent = m === 'longest' ? 'Lado maior (px)' : 'Largura (px)';
  $('fPct').classList.toggle('hidden', m !== 'percent');
  $('fSizes').classList.toggle('hidden', m !== 'responsive');

  const nm = s.nameMode;
  $('fAffix').classList.toggle('hidden', !['prefix', 'suffix', 'both'].includes(nm));
  $('fPrefix').classList.toggle('hidden', nm === 'suffix');
  $('fSuffix').classList.toggle('hidden', nm === 'prefix');
  $('fSeq').classList.toggle('hidden', nm !== 'sequence');
  $('fTemplate').classList.toggle('hidden', nm !== 'template');
  $('fSubfolder').classList.toggle('hidden', s.uploadMode !== 'subfolder');

  const fmtLabel = { original: 'Original', jpeg: 'JPG', png: 'PNG', webp: 'WebP', avif: 'AVIF', auto: 'Auto' }[fmt];
  $('sumFormat').textContent = s.lossless && ['webp', 'avif'].includes(fmt) ? `${fmtLabel} · lossless` : `${fmtLabel} · ${s.quality}%${Number(s.targetKB) ? ` · ≤${s.targetKB}KB` : ''}`;
  $('sumResize').textContent = { none: 'Original', width: `L ${s.rW}px`, height: `A ${s.rH}px`, longest: `${s.rW}px`, fit: `${s.rW}×${s.rH}`, percent: `${s.rPct}%`, cover: `${s.rW}×${s.rH} corte`, responsive: `${s.rSizes.split(',').length} larguras` }[m];
  $('sumName').textContent = { keep: 'Mesmo nome', prefix: 'Prefixo', suffix: 'Sufixo', both: 'Prefixo + sufixo', sequence: 'Sequência', template: 'Modelo' }[nm];
  $('sumGif').textContent = s.gifKeep ? `GIF · perdas ${s.gifLossy}` : 'Converter';
  const adj = [s.rotate ? `${s.rotate}°` : '', s.flipH ? 'espelho' : '', s.grayscale ? 'P&B' : '', s.sharpen ? 'nitidez' : ''].filter(Boolean);
  $('sumAdjust').textContent = adj.join(' · ');

  // Prévia do nome
  const sample = state.items[0];
  const W = sample?.width || 4032, H = sample?.height || 3024;
  const base = sample ? splitName(sample.name).base : 'Foto Campanha Verão';
  const srcFmt = sample?.srcFormat || 'jpeg';
  const t = computeTargets(W, H, workerOpts(s));
  const outFmt = fmt === 'original' || fmt === 'auto' ? (['jpeg', 'png', 'webp', 'avif', 'gif', 'svg'].includes(srcFmt) ? srcFmt : 'jpeg') : fmt;
  const ext = outFmt === 'jpeg' ? 'jpg' : outFmt;
  const names = t.slice(0, 3).map((tt) => buildName({ base, folder: sample?.relDir || '', index: 0, width: tt.w, height: tt.h, format: outFmt, ext, quality: s.quality, multi: t.length > 1 }, nameCfg(s, state.items.length || 1)));
  $('namePreview').innerHTML = names.map((n) => `<b>${escapeHtml(n)}</b>`).join('<br>') + (t.length > 3 ? '<br>…' : '');

  store.set('settings', s);
  renderPresets();
  if (state.items.some((i) => i.status === 'done')) renderQueue(); // nomes são ao vivo
}

/* ============================ Predefinições ============================ */
function renderPresets() {
  const custom = store.get('presets', []);
  const cur = JSON.stringify(readPresetComparable());
  const el = $('presets');
  const all = [...BUILTIN_PRESETS.map((p) => ({ ...p, builtin: true })), ...custom];
  el.innerHTML = '';
  let activeName = '';
  all.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'chip';
    const full = { ...PRESET_DEFAULTS, ...p.s };
    const match = Object.keys(full).every((k) => String(readSettings()[k]) === String(full[k]));
    if (match) { b.classList.add('active'); activeName = p.name; }
    b.textContent = p.name;
    if (!p.builtin) {
      const x = document.createElement('span'); x.className = 'x'; x.textContent = '×'; x.title = 'Excluir';
      x.onclick = (e) => { e.stopPropagation(); const c = store.get('presets', []); c.splice(i - BUILTIN_PRESETS.length, 1); store.set('presets', c); renderPresets(); };
      b.appendChild(x);
    }
    b.onclick = () => { applySettings({ ...PRESET_DEFAULTS, ...p.s }); toast(`Predefinição "${p.name}" aplicada`); };
    el.appendChild(b);
  });
  $('sumPreset').textContent = activeName || 'Personalizado';
  void cur;
}
function readPresetComparable() { const s = readSettings(); delete s.prefix; return s; }

$('btnSavePreset').onclick = () => {
  const name = prompt('Nome da predefinição:');
  if (!name) return;
  const s = readSettings();
  const keep = ['format', 'quality', 'lossless', 'pngColors', 'targetKB', 'background', 'resampler', 'progressive', 'resizeMode', 'rW', 'rH', 'rPct', 'rSizes', 'cropRatio', 'noUpscale', 'nameMode', 'prefix', 'suffix', 'template', 'addDims', 'addFmt', 'slug', 'sharpen', 'grayscale'];
  const c = store.get('presets', []);
  c.push({ name, s: Object.fromEntries(keep.map((k) => [k, s[k]])) });
  store.set('presets', c); renderPresets(); toast('Predefinição salva neste navegador', 'ok');
};

/* ============================ Entrada de arquivos ====================== */
function detectFormat(name, type = '') {
  const ext = splitName(name).ext;
  const t = type.toLowerCase();
  if (t.includes('jpeg') || ['jpg', 'jpeg', 'jfif'].includes(ext)) return 'jpeg';
  if (t.includes('png') || ext === 'png') return 'png';
  if (t.includes('webp') || ext === 'webp') return 'webp';
  if (t.includes('avif') || ext === 'avif') return 'avif';
  if (t.includes('gif') || ext === 'gif') return 'gif';
  if (t.includes('svg') || ext === 'svg') return 'svg';
  if (t.includes('heic') || t.includes('heif') || ['heic', 'heif'].includes(ext)) return 'heic';
  if (t.includes('bmp') || ext === 'bmp') return 'bmp';
  return null;
}

function addEntries(entries) {
  let added = 0, skipped = 0;
  for (const e of entries) {
    const fmt = detectFormat(e.name, e.file?.type);
    if (!fmt) { skipped++; continue; }
    const item = {
      id: state.nextId++, name: e.name, relDir: e.relDir || '', size: e.file?.size ?? e.size ?? null, srcFormat: fmt,
      file: e.file || null, fetch: e.fetch || null, cloud: e.cloud || null,
      status: 'wait', outputs: [], error: '', width: 0, height: 0, thumb: null,
    };
    if (item.file && !['heic'].includes(fmt)) item.thumb = URL.createObjectURL(item.file);
    state.items.push(item); added++;
  }
  if (skipped) toast(`${skipped} arquivo(s) ignorado(s): formato não suportado`);
  if (added) toast(`${added} imagem(ns) adicionada(s)`);
  renderQueue(); syncUI();
}

const fromFileList = (list) => [...list].map((f) => ({ file: f, name: f.name, relDir: (f.webkitRelativePath || '').split('/').slice(0, -1).join('/') }));

$('fileInput').onchange = (e) => { addEntries(fromFileList(e.target.files)); e.target.value = ''; };
$('folderInput').onchange = (e) => { addEntries(fromFileList(e.target.files)); e.target.value = ''; };
$('btnFolder').onclick = () => $('folderInput').click();

const drop = $('drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
drop.addEventListener('drop', async (e) => {
  e.preventDefault();
  const items = [...(e.dataTransfer.items || [])];
  const entries = items.map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (!entries.length) return addEntries(fromFileList(e.dataTransfer.files));
  const out = [];
  const readDir = (dir) => new Promise((res) => { const r = dir.createReader(); const all = []; const next = () => r.readEntries((b) => (b.length ? (all.push(...b), next()) : res(all))); next(); });
  const walk = async (entry, path) => {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      out.push({ file, name: file.name, relDir: path });
    } else if (entry.isDirectory) {
      for (const child of await readDir(entry)) await walk(child, path ? `${path}/${entry.name}` : entry.name);
    }
  };
  for (const en of entries) await walk(en, '');
  addEntries(out);
});
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

document.addEventListener('paste', (e) => {
  if (e.target.closest('input, textarea')) return;
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) addEntries(files.map((f, i) => ({ file: f, name: f.name && f.name !== 'image.png' ? f.name : `colada-${Date.now()}-${i + 1}.png` })));
});

$('urlLoad').onclick = async () => {
  const urls = $('urlList').value.split(/\s+/).filter((u) => /^https?:\/\//.test(u));
  if (!urls.length) return toast('Cole pelo menos um link começando com http', 'err');
  const entries = [];
  let fail = 0;
  await Promise.all(urls.map(async (u) => {
    try {
      const r = await fetch(u, { mode: 'cors' });
      if (!r.ok) throw new Error(r.status);
      const blob = await r.blob();
      let name = decodeURIComponent(new URL(u).pathname.split('/').pop() || 'imagem');
      if (!detectFormat(name)) name += '.' + ((blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace('svg+xml', 'svg'));
      entries.push({ file: new File([blob], name, { type: blob.type }), name });
    } catch (_) { fail++; }
  }));
  if (fail) toast(`${fail} link(s) não puderam ser baixados (o site bloqueia downloads externos)`, 'err');
  addEntries(entries);
  if (entries.length) $('urlList').value = '';
};

/* ============================ Nuvem: carregar =========================== */
const CLOUD_UI = {
  microsoft: { tab: 'sharepoint', link: 'msLink', btn: 'msLoad', rec: 'msRecursive', status: 'msStatus', notice: 'msNotice', script: 'vendor/msal-browser.min.js' },
};

function refreshCloudStatus() {
  for (const [key, ui] of Object.entries(CLOUD_UI)) {
    const p = PROVIDERS[key];
    $(ui.notice).classList.toggle('hidden', p.isConfigured());
    const st = $(ui.status);
    st.classList.toggle('on', p.isConnected());
    st.querySelector('span:last-child').textContent = p.isConnected() ? `Conectado · ${p.user()}` : p.isConfigured() ? 'Pronto para conectar (o login abre ao carregar a pasta)' : 'Integração não configurada';
  }
}

for (const [key, ui] of Object.entries(CLOUD_UI)) {
  const p = PROVIDERS[key];
  $(ui.btn).onclick = async () => {
    const link = $(ui.link).value.trim();
    if (!p.isConfigured()) return toast(`A integração do ${p.label} não está configurada (assets/js/config.js)`, 'err');
    if (!link) return toast('Cole o link da pasta', 'err');
    const btn = $(ui.btn); const old = btn.textContent;
    btn.disabled = true; btn.textContent = 'Conectando…';
    try {
      if (!p.isConnected()) await p.connect();
      refreshCloudStatus();
      btn.textContent = 'Lendo pasta…';
      const { root, files } = await p.list(link, $(ui.rec).checked);
      if (!files.length) toast('Nenhuma imagem encontrada nesse link', 'err');
      addEntries(files.map((f) => ({ name: f.name, relDir: f.relDir, size: f.size, fetch: f.fetch, cloud: { provider: key, root } })));
      if (files.length) toast(`${files.length} imagem(ns) de "${root.name}" na fila`, 'ok');
    } catch (err) {
      console.error(err);
      toast(cloudError(err), 'err');
    } finally {
      btn.disabled = false; btn.textContent = old; refreshCloudStatus();
    }
  };
}

function cloudError(err) {
  const m = err.message || String(err);
  if (/401|403|accessDenied|insufficient/i.test(m)) return 'Sem permissão para essa pasta. Confira se sua conta tem acesso ao link.';
  if (/404|itemNotFound|not_found/i.test(m)) return 'Pasta não encontrada. Confira o link.';
  if (/popup|bloque/i.test(m)) return 'O navegador bloqueou a janela de login. Libere pop-ups para este site.';
  if (/AADSTS65001|consent/i.test(m)) return 'O administrador da Microsoft precisa aprovar o app (consentimento). Veja o README.';
  return m;
}

/* ============================== Abas =================================== */
$$('.tab').forEach((t) => t.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
  $$('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== t.dataset.tab));
  const ui = Object.values(CLOUD_UI).find((u) => u.tab === t.dataset.tab);
  if (ui?.script) loadScript(ui.script).catch(() => {}); // pré-carrega para o pop-up de login não ser bloqueado
}));

/* ============================ Pool de workers =========================== */
const pool = { workers: [], pending: new Map(), seq: 0, rr: 0 };
function getWorker() {
  const n = Math.max(1, Number($('concurrency').value) || 2);
  while (pool.workers.length < n) {
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { const p = pool.pending.get(e.data.id); if (p) { pool.pending.delete(e.data.id); p(e.data); } };
    w.onerror = (e) => { console.error('worker', e); };
    pool.workers.push(w);
  }
  return pool.workers[pool.rr++ % n];
}
function runWorker(payload, transfer = []) {
  return new Promise((resolve) => {
    const id = ++pool.seq;
    pool.pending.set(id, resolve);
    getWorker().postMessage({ id, ...payload }, transfer);
  });
}

/* ============================ Processamento ============================= */
async function processItem(item, s) {
  const opts = workerOpts(s);
  const blob = item.file || (item.file = await item.fetch());
  item.size = blob.size;
  if (!item.thumb && item.srcFormat !== 'heic') item.thumb = URL.createObjectURL(blob);

  // GIF animado → Gifsicle
  if (item.srcFormat === 'gif' && s.gifKeep) return processGif(item, blob, s, opts);

  // SVG → otimização vetorial (SVGO) ou rasterização
  if (item.srcFormat === 'svg') {
    if (s.format === 'original' && s.svgOptimize) return processSvg(item, blob);
    const imageData = await rasterizeSvg(blob, opts);
    item.width = imageData.natW; item.height = imageData.natH;
    return finishFromWorker(item, await runWorker({ imageData, srcFormat: 'png', opts }, [imageData.data.buffer]), s, blob);
  }

  // HEIC/HEIF (iPhone) → converte para PNG antes
  let input = blob, srcFormat = item.srcFormat;
  if (srcFormat === 'heic') {
    await loadScript('vendor/heic2any.min.js');
    const conv = await window.heic2any({ blob, toType: 'image/png' });
    input = Array.isArray(conv) ? conv[0] : conv;
    item.preview = input;
    if (!item.thumb) item.thumb = URL.createObjectURL(input);
  }
  const res = await runWorker({ blob: input, srcFormat, opts });
  return finishFromWorker(item, res, s, blob);
}

function finishFromWorker(item, res, s, original) {
  if (!res.ok) throw new Error(res.error);
  item.width = item.width || res.srcWidth; item.height = item.height || res.srcHeight;
  item.outputs = res.outputs.map((o) => ({ blob: new Blob([o.buffer], { type: o.mime }), ext: o.ext, format: o.format, width: o.width, height: o.height, quality: o.quality, multi: res.outputs.length > 1 }));
  // Se não mudou formato nem tamanho e ficou maior, mantém o original
  if (s.skipLarger && item.outputs.length === 1) {
    const o = item.outputs[0];
    if (o.format === item.srcFormat && o.width === item.width && o.height === item.height && o.blob.size >= original.size && !hasAdjust(s)) {
      item.outputs[0] = { ...o, blob: original, keptOriginal: true };
    }
  }
}
const hasAdjust = (s) => s.rotate || s.flipH || s.grayscale || Number(s.cropRatio) > 0;

function gifSize(buf) {
  const d = new DataView(buf);
  return { w: d.getUint16(6, true), h: d.getUint16(8, true) };
}

async function processGif(item, blob, s, opts) {
  const { default: gifsicle } = await import('../../vendor/gifsicle.min.js');
  const src = gifSize(await blob.slice(0, 10).arrayBuffer());
  item.width = src.w; item.height = src.h;
  const targets = computeTargets(src.w, src.h, opts);
  const outputs = [];
  for (const t of targets) {
    const args = [`-O${s.gifLevel}`, '--no-warnings'];
    if (Number(s.gifLossy) > 0) args.push(`--lossy=${s.gifLossy}`);
    if (Number(s.gifColors) < 256) args.push(`--colors ${s.gifColors}`);
    let bw = src.w, bh = src.h;
    if (opts.crop.enabled) { // recorte centralizado antes do resize (sem distorcer)
      const b = cropBox(src.w, src.h, opts.crop.ratio);
      if (b.w !== src.w || b.h !== src.h) args.push(`--crop ${b.x},${b.y}+${b.w}x${b.h}`);
      bw = b.w; bh = b.h;
    }
    if (t.w !== bw || t.h !== bh) args.push(`--resize ${t.w}x${t.h}`);
    if (s.rotate) args.push({ 90: '--rotate-90', 180: '--rotate-180', 270: '--rotate-270' }[s.rotate]);
    if (s.flipH) args.push('--flip-horizontal');
    if (s.grayscale) args.push('--use-colormap gray');
    const res = await gifsicle.run({ input: [{ file: blob, name: 'in.gif' }], command: [`${args.join(' ')} in.gif -o /out/out.gif`] });
    if (!res || !res[0]) throw new Error('Gifsicle não conseguiu processar este GIF');
    const out = res[0];
    const swap = s.rotate === 90 || s.rotate === 270;
    outputs.push({ blob: new Blob([out], { type: 'image/gif' }), ext: 'gif', format: 'gif', width: swap ? t.h : t.w, height: swap ? t.w : t.h, multi: targets.length > 1 });
  }
  item.outputs = outputs;
  if (s.skipLarger && outputs.length === 1 && outputs[0].blob.size >= blob.size && outputs[0].width === src.w && !hasAdjust(s)) {
    outputs[0] = { ...outputs[0], blob, keptOriginal: true };
  }
}

let svgoMod = null;
async function processSvg(item, blob) {
  svgoMod = svgoMod || (await import('../../vendor/svgo.browser.js'));
  const text = await blob.text();
  const { data } = svgoMod.optimize(text, { multipass: true, plugins: [{ name: 'preset-default', params: { overrides: { removeViewBox: false } } }] });
  const img = await loadImg(URL.createObjectURL(blob));
  item.width = img.naturalWidth || 0; item.height = img.naturalHeight || 0;
  const out = new Blob([data], { type: 'image/svg+xml' });
  item.outputs = [{ blob: out.size < blob.size ? out : blob, ext: 'svg', format: 'svg', width: item.width, height: item.height, keptOriginal: out.size >= blob.size }];
}

function loadImg(url) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Não foi possível ler o SVG')); i.src = url; });
}

async function rasterizeSvg(blob, opts) {
  const img = await loadImg(URL.createObjectURL(blob));
  let w = img.naturalWidth || 1024, h = img.naturalHeight || 1024;
  // Rasteriza já no tamanho final (vetor não perde nitidez)
  const r = opts.resize;
  const want = opts.sizes ? Math.max(...opts.sizes) : ['width', 'longest', 'fit', 'cover'].includes(r.mode) ? r.width : r.mode === 'height' ? r.height * (w / h) : w;
  const scale = opts.resize.noUpscale ? 1 : Math.min(8, Math.max(1, want / w));
  w = Math.round(w * scale); h = Math.round(h * scale);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  data.natW = img.naturalWidth || w; data.natH = img.naturalHeight || h;
  return data;
}

async function runAll() {
  if (state.running) return;
  const todo = state.items.filter((i) => i.status === 'wait' || i.status === 'err');
  if (!todo.length) return toast(state.items.length ? 'Tudo já foi otimizado. Use "Refazer com novas opções" para processar de novo.' : 'Adicione imagens primeiro');
  state.running = true; $('btnRun').disabled = true;
  window.DigiFavicon?.progress(0);
  const s = readSettings();
  const n = Math.max(1, Number(s.concurrency) || 2);
  let idx = 0, done = 0;
  const t0 = performance.now();

  // Modo online: SharePoint, SVG e BMP continuam no navegador
  const online = getMode() === 'online';
  const onlineTodo = online ? todo.filter(canProcessOnline) : [];
  const localTodo = online ? todo.filter((i) => !canProcessOnline(i)) : todo;
  if (online && localTodo.some((i) => i.cloud)) toast('Imagens do SharePoint são processadas no navegador', '');

  const tick = (item) => {
    done++; $('progBar').style.width = `${(done / todo.length) * 100}%`;
    window.DigiFavicon?.progress(done / todo.length);
    renderItem(item); renderSummary();
  };

  const runOnline = async () => {
    const jobs = splitJobs(onlineTodo);
    const opts = workerOpts(s);
    let j = 0;
    const lane = async () => {
      while (j < jobs.length) {
        const items = jobs[j++];
        items.forEach((it) => { it.status = 'run'; it.error = ''; it.stage = 'Na fila…'; renderItem(it); });
        try {
          const results = await runOnlineJob(items, { settings: s, opts }, (its, txt) => its.forEach((it) => { it.stage = txt; renderItem(it); }));
          for (const it of items) {
            const r = results.get(it);
            try {
              if (!r.ok) throw new Error(r.error);
              finishFromWorker(it, r, s, it.file);
              if (!it.thumb && it.outputs[0]) it.thumb = URL.createObjectURL(it.outputs[0].blob);
              it.status = 'done';
            } catch (err) { it.status = 'err'; it.error = err.message || String(err); }
            it.stage = ''; tick(it);
          }
        } catch (err) {
          console.error(err);
          for (const it of items) { it.status = 'err'; it.error = err.message || String(err); it.stage = ''; tick(it); }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, lane));
  };

  const next = async () => {
    while (idx < localTodo.length) {
      const item = localTodo[idx++];
      item.status = 'run'; item.error = ''; renderItem(item);
      try { await processItem(item, s); item.status = 'done'; }
      catch (err) { console.error(item.name, err); item.status = 'err'; item.error = err.message || String(err); }
      tick(item);
    }
  };
  await Promise.all([runOnline(), ...Array.from({ length: n }, next)]);
  state.running = false; $('btnRun').disabled = false;
  window.DigiFavicon?.done();
  renderQueue();
  const errs = todo.filter((i) => i.status === 'err').length;
  toast(errs ? `Concluído com ${errs} erro(s)` : `Pronto! ${todo.length} imagem(ns) em ${((performance.now() - t0) / 1000).toFixed(1)}s`, errs ? 'err' : 'ok');
  setTimeout(() => { $('progBar').style.width = '0'; }, 1200);
}

/* ============================ Nomes finais ============================== */
function finalFiles() {
  const s = readSettings();
  const done = state.items.filter((i) => i.status === 'done');
  const cfg = nameCfg(s, done.length);
  const used = new Set();
  const files = [];
  done.forEach((item, index) => {
    const base = splitName(item.name).base;
    item.outputs.forEach((o) => {
      let name = buildName({ base, folder: item.relDir.split('/').pop() || '', index, width: o.width, height: o.height, format: o.format, ext: o.ext, quality: o.quality, multi: o.multi }, cfg);
      if (o.keptOriginal && s.nameMode === 'keep' && !s.addDims && !s.addFmt && !o.multi) name = item.name;
      const dir = s.keepFolders && item.relDir ? item.relDir + '/' : '';
      const path = uniqueName(dir + name, used);
      files.push({ item, out: o, path, name: path.split('/').pop() });
      o.finalName = path.split('/').pop();
    });
  });
  return files;
}

/* ============================== Render ================================== */
function renderQueue() {
  const q = $('queue');
  $('qCount').textContent = `${state.items.length} ${state.items.length === 1 ? 'imagem' : 'imagens'}`;
  if (!state.items.length) { q.innerHTML = '<li class="empty">Adicione imagens para começar.</li>'; renderSummary(); return; }
  finalFiles(); // atualiza finalName
  q.innerHTML = '';
  for (const item of state.items) {
    const li = document.createElement('li'); li.className = 'item'; li.id = 'it' + item.id;
    q.appendChild(li); fillItem(li, item);
  }
  renderSummary();
}

function renderItem(item) {
  const li = $('it' + item.id);
  if (li) { if (item.status === 'done') finalFiles(); fillItem(li, item); }
}

const ICON = {
  cmp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/></svg>',
  dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  rm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>',
};

function fillItem(li, item) {
  const total = item.outputs.reduce((a, o) => a + o.blob.size, 0);
  const saved = item.size && total ? Math.round((1 - total / (item.size * (item.outputs.length > 1 ? 1 : 1))) * 100) : null;
  const multi = item.outputs.length > 1;
  let badge;
  if (item.status === 'wait') badge = '<span class="badge wait">Na fila</span>';
  else if (item.status === 'run') badge = `<span class="badge ${item.stage ? 'cloud' : 'run'}">${escapeHtml(item.stage || 'Processando…')}</span>`;
  else if (item.status === 'err') badge = `<span class="badge err" title="${escapeHtml(item.error)}">Erro</span>`;
  else if (item.outputs[0]?.keptOriginal) badge = '<span class="badge wait">Original mantido</span>';
  else if (multi) badge = `<span class="badge good">${item.outputs.length} tamanhos</span>`;
  else badge = saved >= 0 ? `<span class="badge good">−${saved}%</span>` : `<span class="badge bad">+${-saved}%</span>`;

  const newName = item.status === 'done' ? item.outputs.map((o) => o.finalName).join(', ') : '';
  const dims = item.width ? `${item.width}×${item.height}` : '';
  const outDims = item.status === 'done' && !multi ? ` → ${item.outputs[0].width}×${item.outputs[0].height}` : '';
  const src = item.cloud ? 'SharePoint' : '';
  li.innerHTML = `
    ${item.thumb ? `<img class="thumb" src="${item.thumb}" alt="" loading="lazy">` : `<div class="thumb">${item.srcFormat.toUpperCase()}</div>`}
    <div style="min-width:0">
      <div class="item-name" title="${escapeHtml(item.relDir ? item.relDir + '/' + item.name : item.name)}">${escapeHtml(item.name)}</div>
      ${newName ? `<div class="item-new" title="${escapeHtml(newName)}">→ ${escapeHtml(newName)}</div>` : ''}
      <div class="item-meta">${dims ? `<span>${dims}${outDims}</span>` : ''}${item.relDir ? `<span>📁 ${escapeHtml(item.relDir)}</span>` : ''}${src ? `<span>☁ ${src}</span>` : ''}${item.status === 'err' ? `<span style="color:var(--red)">${escapeHtml(item.error)}</span>` : ''}</div>
    </div>
    <div class="item-sizes">
      ${item.status === 'done' ? `<div><span class="from">${fmtBytes(item.size)}</span> <span class="to">${fmtBytes(total)}</span></div>` : `<div>${fmtBytes(item.size)}</div>`}
      ${badge}
    </div>
    <div class="item-actions">
      <button data-act="cmp" title="Comparar antes e depois" ${item.status !== 'done' || item.outputs[0]?.format === 'svg' ? 'disabled style="opacity:.3"' : ''}>${ICON.cmp}</button>
      <button data-act="dl" title="Baixar" ${item.status !== 'done' ? 'disabled style="opacity:.3"' : ''}>${ICON.dl}</button>
      <button data-act="rm" title="Remover da fila">${ICON.rm}</button>
    </div>`;
  li.querySelector('[data-act=rm]').onclick = () => { state.items = state.items.filter((i) => i !== item); renderQueue(); syncUI(); };
  li.querySelector('[data-act=dl]').onclick = () => downloadItem(item);
  li.querySelector('[data-act=cmp]').onclick = () => openCompare(item);
}

function renderSummary() {
  const done = state.items.filter((i) => i.status === 'done');
  const before = done.reduce((a, i) => a + (i.size || 0), 0);
  const after = done.reduce((a, i) => a + i.outputs.reduce((b, o) => b + o.blob.size, 0), 0);
  const nFiles = done.reduce((a, i) => a + i.outputs.length, 0);
  $('sumBefore').textContent = done.length ? fmtBytes(before) : '—';
  $('sumAfter').textContent = done.length ? fmtBytes(after) : '—';
  const anyMulti = done.some((i) => i.outputs.length > 1);
  $('sumSaved').textContent = done.length ? (anyMulti ? 'vários tamanhos' : `${Math.round((1 - after / before) * 100)}%`) : '—';
  $('sumFiles').textContent = done.length ? nFiles : '—';
  const has = done.length > 0;
  $('btnZip').disabled = !has; $('btnSaveDir').disabled = !has || !window.showDirectoryPicker; $('btnSrcset').disabled = !has; $('btnReset').disabled = !has;
  $('btnUpload').disabled = !done.some((i) => i.cloud);
}

/* ============================== Saída =================================== */
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function downloadItem(item) {
  const files = finalFiles().filter((f) => f.item === item);
  if (files.length === 1) return downloadBlob(files[0].out.blob, files[0].name);
  const zip = await makeZip(files.map((f) => ({ ...f, path: f.name })));
  downloadBlob(zip, splitName(item.name).base + '.zip');
}

async function makeZip(files) {
  const entries = {};
  for (const f of files) entries[f.path] = [new Uint8Array(await f.out.blob.arrayBuffer()), { level: 0 }];
  return new Blob([zipSync(entries)], { type: 'application/zip' });
}

$('btnZip').onclick = async () => {
  const btn = $('btnZip'); btn.disabled = true;
  try {
    const zip = await makeZip(finalFiles());
    downloadBlob(zip, `imagens-otimizadas-${new Date().toISOString().slice(0, 10)}.zip`);
  } finally { btn.disabled = false; }
};

$('btnSaveDir').onclick = async () => {
  try {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'otimizador' });
    const files = finalFiles();
    for (const f of files) {
      const parts = f.path.split('/'); const name = parts.pop();
      let d = dir;
      for (const p of parts) d = await d.getDirectoryHandle(p, { create: true });
      const fh = await d.getFileHandle(name, { create: true });
      const w = await fh.createWritable(); await w.write(f.out.blob); await w.close();
    }
    toast(`${files.length} arquivo(s) salvos na pasta "${dir.name}"`, 'ok');
  } catch (e) { if (e.name !== 'AbortError') toast('Não foi possível salvar: ' + e.message, 'err'); }
};

$('btnUpload').onclick = async () => {
  const s = readSettings();
  const files = finalFiles().filter((f) => f.item.cloud);
  if (s.uploadMode === 'same') {
    const clash = files.some((f) => f.name.toLowerCase() === f.item.name.toLowerCase());
    if (clash && !confirm('Alguns arquivos têm o mesmo nome dos originais e vão SUBSTITUÍ-LOS na pasta. Continuar?')) return;
  }
  const btn = $('btnUpload'); btn.disabled = true;
  let ok = 0, fail = 0;
  for (const f of files) {
    btn.textContent = `Enviando ${ok + fail + 1}/${files.length}…`;
    const p = PROVIDERS[f.item.cloud.provider];
    const rel = (f.item.relDir ? f.item.relDir + '/' : '') + f.name;
    try { await p.upload(f.item.cloud.root, rel, f.out.blob, { mode: s.uploadMode, subfolder: s.subfolder.trim() }); ok++; }
    catch (e) { console.error(e); fail++; }
  }
  btn.textContent = 'Enviar para a nuvem'; btn.disabled = false;
  toast(fail ? `${ok} enviado(s), ${fail} com erro` : `${ok} arquivo(s) enviados para a nuvem`, fail ? 'err' : 'ok');
};

$('btnSrcset').onclick = async () => {
  const files = finalFiles();
  const byItem = new Map();
  files.forEach((f) => { if (!byItem.has(f.item)) byItem.set(f.item, []); byItem.get(f.item).push(f); });
  const blocks = [];
  for (const [item, fs] of byItem) {
    const alt = splitName(item.name).base.replace(/[-_]+/g, ' ');
    const big = fs[fs.length - 1].out;
    if (fs.length > 1) {
      const srcset = fs.map((f) => `${f.path} ${f.out.width}w`).join(', ');
      blocks.push(`<img src="${fs[Math.min(1, fs.length - 1)].path}"\n     srcset="${srcset}"\n     sizes="(max-width: ${big.width}px) 100vw, ${big.width}px"\n     width="${big.width}" height="${big.height}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`);
    } else {
      blocks.push(`<img src="${fs[0].path}" width="${big.width}" height="${big.height}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`);
    }
  }
  try { await navigator.clipboard.writeText(blocks.join('\n\n')); toast('Código HTML copiado (com width/height e lazy loading)', 'ok'); }
  catch (_) { downloadBlob(new Blob([blocks.join('\n\n')], { type: 'text/html' }), 'imagens.html'); }
};

$('btnRun').onclick = runAll;
$('btnClear').onclick = () => { if (state.running) return; state.items.forEach((i) => i.thumb && URL.revokeObjectURL(i.thumb)); state.items = []; renderQueue(); syncUI(); };
$('btnReset').onclick = () => { state.items.forEach((i) => { if (i.status !== 'wait') { i.status = 'wait'; i.outputs = []; } }); renderQueue(); runAll(); };

/* ============================== Comparar ================================ */
function openCompare(item) {
  const o = item.outputs[item.outputs.length > 1 ? item.outputs.length - 1 : 0];
  const before = item.preview || item.file;
  $('cmpBefore').src = URL.createObjectURL(before);
  $('cmpAfter').src = URL.createObjectURL(o.blob);
  $('cmpTitle').textContent = item.name;
  $('cmpMetaL').textContent = `Original · ${item.srcFormat.toUpperCase()} · ${item.width}×${item.height} · ${fmtBytes(item.size)}`;
  $('cmpMetaR').textContent = `Otimizada · ${o.format.toUpperCase()} · ${o.width}×${o.height} · ${fmtBytes(o.blob.size)}`;
  setSplit(50);
  openModal('cmpModal');
}
function setSplit(p) {
  p = Math.max(0, Math.min(100, p));
  $('cmpAfterWrap').style.clipPath = `inset(0 0 0 ${p}%)`;
  $('cmpHandle').style.left = p + '%';
}
(() => {
  const el = $('cmp'); let drag = false;
  const move = (e) => { if (!drag) return; const r = el.getBoundingClientRect(); setSplit(((e.clientX - r.left) / r.width) * 100); };
  el.addEventListener('pointerdown', (e) => { drag = true; el.setPointerCapture(e.pointerId); move(e); });
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', () => { drag = false; });
})();

/* ============================== Modais ================================== */
function openModal(id) { $(id).classList.remove('hidden'); }
function closeModal(el) { el.closest('.modal').classList.add('hidden'); }
$$('[data-close]').forEach((b) => b.addEventListener('click', () => closeModal(b)));
$$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.modal').forEach((m) => m.classList.add('hidden')); });

/* ======================== Modo de processamento ========================= */
function getMode() { return segValue('modeSeg') || 'local'; }
function applyMode(mode, silent) {
  if (mode === 'online' && !isOnlineReady()) {
    if (!silent) toast('O processamento online ainda não foi configurado. Veja o README (seção Processamento online).', 'err');
    mode = 'local';
  }
  setSeg('modeSeg', mode);
  store.set('mode', mode);
  const pill = $('modePill');
  pill.classList.toggle('online', mode === 'online');
  pill.querySelector('span').textContent = mode === 'online' ? 'Processamento online' : 'Processamento local';
  pill.title = mode === 'online'
    ? 'As imagens são enviadas a um repositório privado do GitHub, processadas e apagadas em seguida. SharePoint continua no navegador.'
    : 'As imagens são processadas no seu navegador. Nada é enviado para servidores.';
}
$$('#modeSeg button').forEach((b) => b.addEventListener('click', () => applyMode(b.dataset.v)));

/* ======================== Guia de boas práticas ========================= */
let guideBuilt = false;
async function openGuide(sectionId) {
  if (!guideBuilt) {
    const { SECTIONS, GUIDE_UPDATED } = await import('./guide.js');
    $('guideUpdated').textContent = `Atualizado em ${GUIDE_UPDATED}`;
    $('guideToc').innerHTML = SECTIONS.map((sec, i) => `<a href="#g-${sec.id}" data-id="${sec.id}"><span>${String(i + 1).padStart(2, '0')}</span>${sec.title}</a>`).join('');
    $('guideBody').innerHTML = SECTIONS.map((sec, i) => `<section id="g-${sec.id}"><h2><small>${String(i + 1).padStart(2, '0')}</small>${sec.title}</h2>${sec.html}</section>`).join('');
    const body = $('guideBody');
    $('guideToc').addEventListener('click', (e) => {
      const a = e.target.closest('a'); if (!a) return;
      e.preventDefault();
      body.querySelector('#g-' + a.dataset.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('.g-copy'); if (!b) return;
      try { await navigator.clipboard.writeText(b.nextElementSibling.textContent); b.textContent = 'Copiado!'; }
      catch (_) { b.textContent = 'Selecione e copie'; }
      setTimeout(() => { b.textContent = 'Copiar'; }, 1500);
    });
    // Destaca no índice a seção visível
    const links = new Map($$('#guideToc a').map((a) => [a.dataset.id, a]));
    const setActive = (id) => links.forEach((a, k) => { a.classList.toggle('active', k === id); if (k === id) a.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
    body.addEventListener('scroll', () => {
      const top = body.getBoundingClientRect().top + 90;
      let current = SECTIONS[0].id;
      for (const sec of body.querySelectorAll('section')) { if (sec.getBoundingClientRect().top <= top) current = sec.id.slice(2); }
      if (body.scrollTop + body.clientHeight >= body.scrollHeight - 4) current = SECTIONS[SECTIONS.length - 1].id;
      setActive(current);
    }, { passive: true });
    setActive(SECTIONS[0].id);
    guideBuilt = true;
  }
  openModal('guideModal');
  if (sectionId) $('guideBody').querySelector('#g-' + sectionId)?.scrollIntoView({ block: 'start' });
}
$('btnGuide').onclick = () => openGuide();
if (location.hash === '#boas-praticas') openGuide();

/* =============================== Tema ==================================== */
$('btnTheme').onclick = () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('otimizador.theme', next); } catch (_) { /* sem storage */ }
};
// Segue o sistema enquanto a pessoa não escolher um tema manualmente
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
  let saved = null; try { saved = localStorage.getItem('otimizador.theme'); } catch (_) { /* ok */ }
  if (!saved) document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
});

/* ============================== Diversos ================================ */
function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
  $('toasts').appendChild(t); setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3200);
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Liga os controles
$$('#fmtSeg button, #rotSeg button').forEach((b) => b.addEventListener('click', () => { b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); syncUI(); }));
for (const id of SETTING_IDS) $(id).addEventListener('input', syncUI);
$('tokens').addEventListener('click', (e) => { if (e.target.tagName === 'CODE') { const t = $('template'); t.value += e.target.textContent; syncUI(); } });
$('concurrency').value = String(Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 4) - 1)));

// Estado inicial
applySettings(store.get('settings', { ...PRESET_DEFAULTS, ...BUILTIN_PRESETS[0].s, format: 'webp' }));
if (!segValue('fmtSeg')) setSeg('fmtSeg', 'webp');
refreshCloudStatus();
applyMode(store.get('mode', 'local'), true);
// Remove dados de versões anteriores (token e IDs salvos no navegador)
try { localStorage.removeItem('otimizador.online'); localStorage.removeItem('otimizador.cloud'); } catch (_) { /* ok */ }
renderQueue();
window.__otimizador = { state, addEntries, runAll, finalFiles }; // útil para testes
