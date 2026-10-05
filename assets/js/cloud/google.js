/* =========================================================================
   Google Drive via Drive API v3
   Login com Google Identity Services (popup de token).
   ========================================================================= */
import { getConfig, loadScript, okJson, isImageName } from './common.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const SCOPE = 'https://www.googleapis.com/auth/drive';
const FOLDER = 'application/vnd.google-apps.folder';

let accessToken = null, expiresAt = 0, tokenClient = null;

export const google = {
  id: 'google', label: 'Google Drive',
  isConfigured: () => !!getConfig().google.clientId,
  isConnected: () => !!accessToken && Date.now() < expiresAt,
  user: () => 'Conta Google',

  async connect() {
    const { clientId } = getConfig().google;
    if (!clientId) throw new Error('Client ID do Google não configurado');
    await loadScript('https://accounts.google.com/gsi/client');
    return new Promise((resolve, reject) => {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: SCOPE,
        callback: (r) => {
          if (r.error) return reject(new Error(r.error_description || r.error));
          accessToken = r.access_token; expiresAt = Date.now() + (r.expires_in - 60) * 1000;
          resolve('Conta Google');
        },
        error_callback: (e) => reject(new Error(e.message || 'Login cancelado')),
      });
      tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
    });
  },

  async api(url, init = {}) {
    if (!this.isConnected()) await this.connect();
    return fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) } });
  },

  folderIdFromLink(link) {
    const m = link.match(/folders\/([\w-]+)/) || link.match(/[?&]id=([\w-]+)/) || link.match(/\/d\/([\w-]+)/);
    if (m) return m[1];
    if (/^[\w-]{20,}$/.test(link.trim())) return link.trim();
    throw new Error('Link do Google Drive inválido');
  },

  async list(link, recursive = true) {
    const rootId = this.folderIdFromLink(link);
    const meta = await okJson(await this.api(`${API}/files/${rootId}?fields=id,name,mimeType,size,driveId&supportsAllDrives=true`), 'Não foi possível abrir a pasta');
    const files = [];
    if (meta.mimeType !== FOLDER) {
      if (isImageName(meta.name)) files.push(this._entry(meta, ''));
      return { root: { id: null, name: meta.name, isFile: true }, files };
    }
    const walk = async (folderId, relDir) => {
      let pageToken = '';
      do {
        const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
        const url = `${API}/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,size)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? '&pageToken=' + pageToken : ''}`;
        const page = await okJson(await this.api(url), 'Erro ao listar a pasta');
        for (const f of page.files) {
          if (f.mimeType === FOLDER) { if (recursive) await walk(f.id, relDir ? `${relDir}/${f.name}` : f.name); }
          else if (isImageName(f.name)) files.push(this._entry(f, relDir));
        }
        pageToken = page.nextPageToken || '';
      } while (pageToken);
    };
    await walk(rootId, '');
    return { root: { id: rootId, name: meta.name }, files };
  },

  _entry(f, relDir) {
    return {
      name: f.name, relDir, size: Number(f.size || 0),
      fetch: async () => {
        const r = await this.api(`${API}/files/${f.id}?alt=media&supportsAllDrives=true`);
        if (!r.ok) throw new Error('Falha no download: ' + r.status);
        return r.blob();
      },
    };
  },

  _folderCache: new Map(),

  async ensureFolder(parentId, name) {
    const key = `${parentId}:${name.toLowerCase()}`;
    if (this._folderCache.has(key)) return this._folderCache.get(key);
    const q = encodeURIComponent(`'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = '${FOLDER}' and trashed = false`);
    const found = await okJson(await this.api(`${API}/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`), 'Erro ao procurar pasta');
    let id = found.files[0]?.id;
    if (!id) {
      const c = await okJson(await this.api(`${API}/files?supportsAllDrives=true`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }),
      }), 'Erro ao criar pasta');
      id = c.id;
    }
    this._folderCache.set(key, id);
    return id;
  },

  async upload(root, relPath, blob, { mode, subfolder }) {
    if (!root.id) throw new Error('Para enviar de volta, use o link de uma pasta');
    let parent = root.id;
    const parts = relPath.split('/');
    const filename = parts.pop();
    if (mode === 'subfolder' && subfolder) parent = await this.ensureFolder(parent, subfolder);
    for (const p of parts) parent = await this.ensureFolder(parent, p);

    const boundary = 'digi' + Math.random().toString(36).slice(2);
    const meta = JSON.stringify({ name: filename, parents: [parent] });
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
      `--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`, blob,
      `\r\n--${boundary}--`,
    ]);
    const r = await this.api(`${UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id`, {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
    });
    return okJson(r, 'Erro ao enviar ' + filename);
  },
};
