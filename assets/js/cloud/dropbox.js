/* =========================================================================
   Dropbox via API v2
   Login OAuth com PKCE (sem servidor). Lê pastas por link compartilhado.
   ========================================================================= */
import { getConfig, redirectUri, okJson, isImageName } from './common.js';

const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';
let token = null;
try { token = sessionStorage.getItem('otimizador.dbx') || null; } catch (_) { /* sem storage */ }

// O cabeçalho Dropbox-API-Arg só aceita ASCII: escapa acentos
const argHeader = (obj) => JSON.stringify(obj).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

async function sha256b64url(str) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const dropbox = {
  id: 'dropbox', label: 'Dropbox',
  isConfigured: () => !!getConfig().dropbox.appKey,
  isConnected: () => !!token,
  user: () => 'Conta Dropbox',

  async connect() {
    const { appKey } = getConfig().dropbox;
    if (!appKey) throw new Error('App key do Dropbox não configurado');
    const verifier = Array.from(crypto.getRandomValues(new Uint8Array(48)), (b) => b.toString(16).padStart(2, '0')).join('');
    const state = 'dbx_' + Math.random().toString(36).slice(2);
    const url = new URL('https://www.dropbox.com/oauth2/authorize');
    Object.entries({
      client_id: appKey, response_type: 'code', code_challenge: await sha256b64url(verifier), code_challenge_method: 'S256',
      redirect_uri: redirectUri(), state, token_access_type: 'online',
    }).forEach(([k, v]) => url.searchParams.set(k, v));

    const popup = window.open(url, 'dbx-login', 'width=560,height=720');
    if (!popup) throw new Error('O navegador bloqueou a janela de login. Libere pop-ups para este site.');
    const code = await new Promise((resolve, reject) => {
      const onMsg = (e) => {
        if (e.origin !== location.origin || !e.data || e.data.state !== state) return;
        window.removeEventListener('message', onMsg); clearInterval(timer);
        e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.code);
      };
      window.addEventListener('message', onMsg);
      const timer = setInterval(() => { if (popup.closed) { clearInterval(timer); window.removeEventListener('message', onMsg); reject(new Error('Login cancelado')); } }, 600);
    });
    const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({ code, grant_type: 'authorization_code', code_verifier: verifier, client_id: appKey, redirect_uri: redirectUri() }),
    });
    const j = await okJson(res, 'Erro no login do Dropbox');
    token = j.access_token;
    try { sessionStorage.setItem('otimizador.dbx', token); } catch (_) { /* ok */ }
    return 'Conta Dropbox';
  },

  async rpc(endpoint, body) {
    if (!token) await this.connect();
    const r = await fetch(API + endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 401) { token = null; try { sessionStorage.removeItem('otimizador.dbx'); } catch (_) {} }
    return okJson(r, 'Dropbox');
  },

  async list(link, recursive = true) {
    const url = link.trim();
    const meta = await this.rpc('/sharing/get_shared_link_metadata', { url });
    const files = [];
    if (meta['.tag'] === 'file') {
      if (isImageName(meta.name)) files.push(this._entry(url, '', meta.name, meta.size, true));
      return { root: { url, name: meta.name, pathLower: null, isFile: true }, files };
    }
    const walk = async (path, relDir) => {
      let page = await this.rpc('/files/list_folder', { path, shared_link: { url } });
      for (;;) {
        for (const e of page.entries) {
          const p = `${path}/${e.name}`;
          if (e['.tag'] === 'folder') { if (recursive) await walk(p, relDir ? `${relDir}/${e.name}` : e.name); }
          else if (isImageName(e.name)) files.push(this._entry(url, p, e.name, e.size, false, relDir));
        }
        if (!page.has_more) break;
        page = await this.rpc('/files/list_folder/continue', { cursor: page.cursor });
      }
    };
    await walk('', '');
    return { root: { url, name: meta.name, pathLower: meta.path_lower || null }, files };
  },

  _entry(url, path, name, size, single, relDir = '') {
    return {
      name, relDir, size,
      fetch: async () => {
        const arg = single ? { url } : { url, path };
        const r = await fetch(CONTENT + '/sharing/get_shared_link_file', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': argHeader(arg) } });
        if (!r.ok) throw new Error('Falha no download: ' + r.status);
        return r.blob();
      },
    };
  },

  async upload(root, relPath, blob, { mode, subfolder }) {
    // Se a pasta compartilhada está montada na conta, salva ao lado do original.
    // Caso contrário, salva em /Otimizador Digi/<nome da pasta>.
    let base = root.pathLower && !root.isFile ? root.pathLower : `/Otimizador Digi/${root.name.replace(/\.[^.]+$/, '')}`;
    if (mode === 'subfolder' && subfolder) base += `/${subfolder}`;
    const path = `${base}/${relPath}`.replace(/\/{2,}/g, '/');
    const r = await fetch(CONTENT + '/files/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': argHeader({ path, mode: 'overwrite', autorename: false, mute: true }) },
      body: blob,
    });
    return okJson(r, 'Erro ao enviar ' + relPath);
  },
};
