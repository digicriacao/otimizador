/* =========================================================================
   SharePoint / OneDrive via Microsoft Graph
   Login com MSAL (popup). Lê a pasta pelo link de compartilhamento,
   baixa as imagens e devolve o resultado para a mesma biblioteca.
   ========================================================================= */
import { getConfig, redirectUri, loadScript, okJson, isImageName } from './common.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = ['Files.ReadWrite.All', 'Sites.Read.All', 'User.Read'];

let pca = null, account = null;

export const microsoft = {
  id: 'microsoft', label: 'SharePoint / OneDrive',
  isConfigured: () => !!getConfig().microsoft.clientId,
  isConnected: () => !!account,
  user: () => account?.username || '',

  async connect() {
    const cfg = getConfig().microsoft;
    if (!cfg.clientId) throw new Error('Client ID da Microsoft não configurado');
    await loadScript('vendor/msal-browser.min.js');
    if (!pca) {
      pca = new window.msal.PublicClientApplication({
        auth: { clientId: cfg.clientId, authority: `https://login.microsoftonline.com/${cfg.tenantId || 'organizations'}`, redirectUri: redirectUri() },
        cache: { cacheLocation: 'sessionStorage' },
      });
      await pca.initialize();
    }
    account = pca.getAllAccounts()[0] || null;
    if (!account) {
      const r = await pca.loginPopup({ scopes: SCOPES, prompt: 'select_account' });
      account = r.account;
    }
    return account.username;
  },

  async token() {
    if (!account) await this.connect();
    try {
      return (await pca.acquireTokenSilent({ scopes: SCOPES, account })).accessToken;
    } catch (_) {
      return (await pca.acquireTokenPopup({ scopes: SCOPES, account })).accessToken;
    }
  },

  async api(path, init = {}) {
    const t = await this.token();
    const res = await fetch(path.startsWith('http') ? path : GRAPH + path, {
      ...init, headers: { Authorization: `Bearer ${t}`, ...(init.headers || {}) },
    });
    return res;
  },

  /** Resolve o link e lista as imagens. */
  async list(link, recursive = true) {
    const shareId = 'u!' + btoa(unescape(encodeURIComponent(link.trim()))).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
    const root = await okJson(await this.api(`/shares/${shareId}/driveItem`), 'Não foi possível abrir o link');
    const driveId = root.parentReference?.driveId;
    const files = [];

    if (root.file) { // link de um arquivo só
      if (isImageName(root.name)) files.push(this._entry(driveId, root, ''));
      return { root: { driveId, id: root.parentReference.id, name: root.name, isFile: true }, files };
    }

    const walk = async (itemId, relDir) => {
      let url = `/drives/${driveId}/items/${itemId}/children?$top=999`;
      while (url) {
        const page = await okJson(await this.api(url), 'Erro ao listar a pasta');
        for (const it of page.value) {
          if (it.folder && recursive) await walk(it.id, relDir ? `${relDir}/${it.name}` : it.name);
          else if (it.file && isImageName(it.name)) files.push(this._entry(driveId, it, relDir));
        }
        url = page['@odata.nextLink'] || null;
      }
    };
    await walk(root.id, '');
    return { root: { driveId, id: root.id, name: root.name }, files };
  },

  _entry(driveId, it, relDir) {
    return {
      name: it.name, relDir, size: it.size,
      fetch: async () => {
        let url = it['@microsoft.graph.downloadUrl'];
        if (!url) { // URL expirada: pede de novo
          const fresh = await okJson(await this.api(`/drives/${driveId}/items/${it.id}`), 'Erro ao baixar');
          url = fresh['@microsoft.graph.downloadUrl'];
        }
        const r = await fetch(url);
        if (!r.ok) throw new Error('Falha no download: ' + r.status);
        return r.blob();
      },
    };
  },

  _folderCache: new Map(),

  async ensureFolder(driveId, parentId, name) {
    const key = `${driveId}:${parentId}:${name.toLowerCase()}`;
    if (this._folderCache.has(key)) return this._folderCache.get(key);
    let res = await this.api(`/drives/${driveId}/items/${parentId}:/${encodeURIComponent(name)}`);
    let item;
    if (res.status === 404) {
      res = await this.api(`/drives/${driveId}/items/${parentId}/children`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
      });
    }
    item = await okJson(res, 'Erro ao criar pasta');
    this._folderCache.set(key, item.id);
    return item.id;
  },

  /** Envia um arquivo. relPath = "sub/pasta/arquivo.webp" relativo ao destino. */
  async upload(root, relPath, blob, { mode, subfolder }) {
    const { driveId } = root;
    let parent = root.id;
    const parts = relPath.split('/');
    const filename = parts.pop();
    if (mode === 'subfolder' && subfolder) parent = await this.ensureFolder(driveId, parent, subfolder);
    for (const p of parts) parent = await this.ensureFolder(driveId, parent, p);

    const path = `/drives/${driveId}/items/${parent}:/${encodeURIComponent(filename)}:`;
    if (blob.size <= 4 * 1024 * 1024) {
      const r = await this.api(`${path}/content?@microsoft.graph.conflictBehavior=replace`, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type || 'application/octet-stream' } });
      return okJson(r, 'Erro ao enviar ' + filename);
    }
    // Arquivos grandes: sessão de upload em partes
    const s = await okJson(await this.api(`${path}/createUploadSession`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }),
    }), 'Erro ao iniciar upload');
    const CHUNK = 320 * 1024 * 16;
    for (let start = 0; start < blob.size; start += CHUNK) {
      const end = Math.min(start + CHUNK, blob.size);
      const r = await fetch(s.uploadUrl, { method: 'PUT', body: blob.slice(start, end), headers: { 'Content-Range': `bytes ${start}-${end - 1}/${blob.size}` } });
      if (!r.ok && r.status !== 202) throw new Error('Erro no upload em partes: ' + r.status);
    }
    return true;
  },
};
