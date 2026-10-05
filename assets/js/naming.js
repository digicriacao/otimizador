/* Regras de nomeação dos arquivos de saída */

export function splitName(filename) {
  const i = filename.lastIndexOf('.');
  return i > 0 ? { base: filename.slice(0, i), ext: filename.slice(i + 1).toLowerCase() } : { base: filename, ext: '' };
}

export function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-{2,}/g, '-').replace(/^[-.]+|[-.]+$/g, '') || 'imagem';
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * @param ctx { base, folder, index, width, height, format, ext, quality, multi }
 * @param cfg { mode, prefix, suffix, template, seqBase, seqStart, addDims, addFmt, slug, total }
 */
export function buildName(ctx, cfg) {
  const pad = String((cfg.seqStart ?? 1) + Math.max(0, (cfg.total || 1) - 1)).length;
  const n = String((cfg.seqStart ?? 1) + ctx.index).padStart(Math.max(2, pad), '0');
  const tokens = {
    nome: ctx.base, n, largura: ctx.width, altura: ctx.height, dim: `${ctx.width}x${ctx.height}`,
    formato: ctx.format === 'jpeg' ? 'jpg' : ctx.format, qualidade: ctx.quality ?? '', data: today(), pasta: ctx.folder || '',
  };
  let name;
  switch (cfg.mode) {
    case 'prefix': name = (cfg.prefix || '') + ctx.base; break;
    case 'suffix': name = ctx.base + (cfg.suffix || ''); break;
    case 'both': name = (cfg.prefix || '') + ctx.base + (cfg.suffix || ''); break;
    case 'sequence': name = `${cfg.seqBase || 'imagem'}-${n}`; break;
    case 'template': name = (cfg.template || '{nome}').replace(/\{(\w+)\}/g, (m, k) => (k in tokens ? tokens[k] : m)); break;
    default: name = ctx.base;
  }
  // Tokens vazios (ex.: {pasta} na raiz) não deixam separadores sobrando
  name = name.replace(/([-_ ])[-_ ]+/g, '$1').replace(/^[-_.\s]+|[-_.\s]+$/g, '') || ctx.base;
  const usesDimToken = cfg.mode === 'template' && /\{(dim|largura)\}/.test(cfg.template || '');
  // Em conjuntos responsivos a largura sempre vai no nome, senão os arquivos colidiriam
  if ((cfg.addDims || ctx.multi) && !usesDimToken) name += cfg.addDims ? `-${tokens.dim}` : `-${ctx.width}w`;
  if (cfg.addFmt) name += `-${tokens.formato}`;
  if (cfg.slug) name = slugify(name);
  else name = name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'imagem';
  return `${name}.${ctx.ext}`;
}

/** Garante nomes únicos dentro da mesma pasta de saída */
export function uniqueName(path, used) {
  if (!used.has(path.toLowerCase())) { used.add(path.toLowerCase()); return path; }
  const { base, ext } = splitName(path);
  for (let i = 2; ; i++) {
    const p = `${base}-${i}.${ext}`;
    if (!used.has(p.toLowerCase())) { used.add(p.toLowerCase()); return p; }
  }
}
