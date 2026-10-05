/* Utilidades compartilhadas pelas integrações com nuvem */

export const IMAGE_EXT = ['jpg', 'jpeg', 'jfif', 'png', 'webp', 'avif', 'gif', 'svg', 'heic', 'heif', 'bmp'];

export function isImageName(name) {
  const ext = name.split('.').pop().toLowerCase();
  return IMAGE_EXT.includes(ext);
}

export function getConfig() {
  const base = window.OTIMIZADOR_CONFIG || {};
  return {
    microsoft: { clientId: base.microsoft?.clientId || '', tenantId: base.microsoft?.tenantId || 'organizations' },
  };
}

export function redirectUri() {
  return new URL('auth-callback.html', location.href).href.split('#')[0].split('?')[0];
}

const loaded = {};
export function loadScript(src) {
  if (!loaded[src]) {
    loaded[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error('Falha ao carregar ' + src));
      document.head.appendChild(s);
    });
  }
  return loaded[src];
}

export async function okJson(res, what) {
  if (!res.ok) {
    let msg = '';
    try { const j = await res.json(); msg = j.error?.message || j.error_summary || j.error_description || JSON.stringify(j.error || j); } catch (_) { msg = res.statusText; }
    const e = new Error(`${what}: ${res.status} ${msg}`); e.status = res.status; throw e;
  }
  return res.status === 204 ? null : res.json();
}
