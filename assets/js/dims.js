/* Cálculo das dimensões de saída — usado pelo worker e pela prévia de nomes */
/* ------------------------------ Dimensões ------------------------------ */
export function computeTargets(W, H, opts) {
  const r = opts.resize || { mode: 'none' };
  const noUp = r.noUpscale !== false;
  let baseW = W, baseH = H;
  if (opts.crop && opts.crop.enabled) {
    const c = cropBox(W, H, opts.crop.ratio); baseW = c.w; baseH = c.h;
  }
  const ratio = baseW / baseH;
  const clampUp = (w, h) => (noUp && (w > baseW || h > baseH) ? [baseW, baseH] : [w, h]);
  const make = (w, h, label, cover = false) => {
    let [ww, hh] = cover ? [w, h] : clampUp(w, h);
    if (cover && noUp && (ww > baseW || hh > baseH)) {
      const s = Math.min(baseW / ww, baseH / hh); ww *= s; hh *= s;
    }
    return { w: Math.max(1, Math.round(ww)), h: Math.max(1, Math.round(hh)), label, cover };
  };

  // Conjunto responsivo: várias larguras a partir da mesma imagem
  if (Array.isArray(opts.sizes) && opts.sizes.length) {
    const seen = new Set();
    return opts.sizes
      .map((w) => make(w, w / ratio, `${w}w`))
      .filter((t) => (seen.has(t.w) ? false : seen.add(t.w)));
  }

  switch (r.mode) {
    case 'width': return [make(r.width, r.width / ratio)];
    case 'height': return [make(r.height * ratio, r.height)];
    case 'fit': { // cabe dentro da caixa L×A mantendo proporção
      const s = Math.min(r.width / baseW, r.height / baseH);
      return [make(baseW * s, baseH * s)];
    }
    case 'longest': { // lado maior = N px
      const s = r.width / Math.max(baseW, baseH);
      return [make(baseW * s, baseH * s)];
    }
    case 'percent': return [make(baseW * r.percent / 100, baseH * r.percent / 100)];
    case 'cover': return [make(r.width, r.height, '', true)]; // preenche e corta o excesso
    default: return [{ w: baseW, h: baseH }];
  }
}

export function cropBox(W, H, ratio) {
  if (!ratio) return { x: 0, y: 0, w: W, h: H };
  if (W / H > ratio) { const w = Math.round(H * ratio); return { x: Math.round((W - w) / 2), y: 0, w, h: H }; }
  const h = Math.round(W / ratio); return { x: 0, y: Math.round((H - h) / 2), w: W, h };
}

