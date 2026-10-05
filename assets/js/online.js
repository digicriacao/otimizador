/* =========================================================================
   Processamento online via GitHub Actions
   1. Compacta o lote (job.json + imagens) num input.zip
   2. Cria o branch jobs/<id> no repositório privado de processamento
   3. Acompanha o workflow até terminar
   4. Baixa job/result.zip, devolve os arquivos e apaga o branch
   ========================================================================= */
import { zipSync, unzipSync, strToU8, strFromU8 } from '../../vendor/fflate.js';

const API = 'https://api.github.com';
const MAX_JOB_BYTES = 40 * 1024 * 1024; // por lote; lotes maiores são divididos
const MAX_JOB_ITEMS = 150;
const POLL_MS = 4000;
const TIMEOUT_MS = 35 * 60 * 1000;

export function onlineConfig() {
  const base = window.OTIMIZADOR_CONFIG?.github || {};
  let local = {};
  try { local = JSON.parse(localStorage.getItem('otimizador.online') || '{}'); } catch (_) { /* sem storage */ }
  return { repo: (local.repo || base.repo || '').trim(), token: (local.token || '').trim() };
}

export function saveOnlineConfig({ repo, token }) {
  try { localStorage.setItem('otimizador.online', JSON.stringify({ repo, token })); } catch (_) { /* ok */ }
}

export const isOnlineReady = () => { const c = onlineConfig(); return !!(c.repo && c.token); };

/** Itens que podem ir para a nuvem: SharePoint fica sempre no navegador. */
export const canProcessOnline = (item) => !item.cloud && !['svg', 'bmp'].includes(item.srcFormat);

/** Divide os itens em lotes por tamanho e quantidade. */
export function splitJobs(items) {
  const jobs = []; let cur = [], size = 0;
  for (const it of items) {
    const sz = it.size || 0;
    if (cur.length && (size + sz > MAX_JOB_BYTES || cur.length >= MAX_JOB_ITEMS)) { jobs.push(cur); cur = []; size = 0; }
    cur.push(it); size += sz;
  }
  if (cur.length) jobs.push(cur);
  return jobs;
}

function client() {
  const { repo, token } = onlineConfig();
  if (!repo || !token) throw new Error('Configure o processamento online (engrenagem no topo)');
  const call = async (method, path, body, accept) => {
    const res = await fetch(API + path.replace('{repo}', repo), {
      method,
      headers: {
        Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28',
        Accept: accept || 'application/vnd.github+json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let msg = ''; try { msg = (await res.json()).message; } catch (_) { /* ok */ }
      if (res.status === 401) throw new Error('Token do GitHub inválido ou expirado');
      if (res.status === 404) throw new Error(`Repositório "${repo}" não encontrado ou o token não tem acesso a ele`);
      if (res.status === 403 || res.status === 429) throw new Error(`O GitHub recusou a operação: ${msg || res.status}`);
      throw new Error(`GitHub ${res.status}: ${msg}`);
    }
    if (res.status === 204) return null;
    return accept === 'application/vnd.github.raw' ? res.arrayBuffer() : res.json();
  };
  return { call, repo };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Processa um lote online.
 * @returns Map<item, {ok, outputs, srcWidth, srcHeight, error}>
 */
export async function runOnlineJob(items, { settings, opts }, onStage) {
  const { call } = client();
  const stage = (txt) => onStage(items, txt);

  // 1. Monta o input.zip
  stage('Preparando envio…');
  const entries = {}; const meta = [];
  for (const [k, it] of items.entries()) {
    const blob = it.file || (it.file = await it.fetch());
    it.size = blob.size;
    const ext = (it.name.split('.').pop() || 'img').toLowerCase().replace(/[^a-z0-9]/g, '') || 'img';
    const file = `in/${k}.${ext}`;
    entries[file] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
    meta.push({ key: String(k), file, srcFormat: it.srcFormat, name: it.name });
  }
  entries['job.json'] = [strToU8(JSON.stringify({ version: 1, settings, opts, items: meta })), { level: 6 }];
  const zip = new Blob([zipSync(entries)], { type: 'application/zip' });

  // 2. Cria o branch do lote
  stage('Enviando para o GitHub…');
  const id = `${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const branch = `jobs/${id}`;
  const info = await call('GET', '/repos/{repo}');
  const head = await call('GET', `/repos/{repo}/git/ref/heads/${encodeURIComponent(info.default_branch)}`);
  const baseCommit = await call('GET', `/repos/{repo}/git/commits/${head.object.sha}`);
  const blob = await call('POST', '/repos/{repo}/git/blobs', { content: await blobToBase64(zip), encoding: 'base64' });
  const tree = await call('POST', '/repos/{repo}/git/trees', { base_tree: baseCommit.tree.sha, tree: [{ path: 'job/input.zip', mode: '100644', type: 'blob', sha: blob.sha }] });
  const commit = await call('POST', '/repos/{repo}/git/commits', { message: `Lote ${id} · ${items.length} imagem(ns)`, tree: tree.sha, parents: [head.object.sha] });
  await call('POST', '/repos/{repo}/git/refs', { ref: `refs/heads/${branch}`, sha: commit.sha });

  try {
    // 3. Acompanha o workflow
    stage('Na fila do GitHub…');
    const started = Date.now();
    let run = null;
    for (;;) {
      await sleep(POLL_MS);
      if (Date.now() - started > TIMEOUT_MS) throw new Error('O processamento online demorou demais. Tente um lote menor.');
      const runs = await call('GET', `/repos/{repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=5`);
      run = runs.workflow_runs?.[0];
      if (!run) {
        if (Date.now() - started > 90000) throw new Error('O workflow não começou. Confira se a pasta .github/workflows está no repositório de processamento e se o Actions está ativado.');
        continue;
      }
      if (run.status === 'completed') break;
      stage(run.status === 'in_progress' ? 'Processando online…' : 'Na fila do GitHub…');
    }
    if (run.conclusion !== 'success') throw new Error(`O processamento online falhou (${run.conclusion}). Veja os detalhes em ${run.html_url}`);

    // 4. Baixa o resultado
    stage('Baixando resultado…');
    const buf = await call('GET', `/repos/{repo}/contents/job/result.zip?ref=${encodeURIComponent(branch)}`, null, 'application/vnd.github.raw');
    const files = unzipSync(new Uint8Array(buf));
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    const out = new Map();
    items.forEach((it, k) => {
      const m = manifest.items[String(k)];
      if (!m) out.set(it, { ok: false, error: 'Sem resultado para esta imagem' });
      else if (!m.ok) out.set(it, { ok: false, error: m.error });
      else out.set(it, { ok: true, srcWidth: m.srcWidth, srcHeight: m.srcHeight, outputs: m.outputs.map((o) => ({ ...o, buffer: files[o.file] })) });
    });
    return out;
  } finally {
    // 5. Limpa o branch (as imagens não ficam guardadas no GitHub)
    call('DELETE', `/repos/{repo}/git/refs/heads/${branch}`).catch(() => {});
  }
}

/** Testa token e repositório (usado no botão "Testar conexão"). */
export async function testOnline() {
  const { call, repo } = client();
  const info = await call('GET', '/repos/{repo}');
  if (!info.private) console.warn('Atenção: o repositório de processamento é público');
  const wf = await call('GET', '/repos/{repo}/actions/workflows');
  const ok = wf.workflows?.some((w) => w.path.endsWith('processar.yml'));
  return { repo, private: info.private, workflow: !!ok, canPush: !!info.permissions?.push };
}
