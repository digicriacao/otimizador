/* =========================================================================
   qpdf (WebAssembly) em segundo plano: senha, desbloqueio e limpeza final
   Worker clássico (o qpdf.js não é módulo ES).
   ========================================================================= */
/* global Module */
importScripts('../../../vendor/qpdf/qpdf.js');

let ready = null;
let log = [];
// O qpdf escreve as mensagens no console (ligado na criação do módulo): redireciona para o log
console.log = console.error = console.warn = (...a) => log.push(a.join(' '));
function qpdf() {
  if (!ready) {
    ready = Module({
      locateFile: () => new URL('../../../vendor/qpdf/qpdf.wasm', self.location.href).href,
      print: (t) => log.push(t), printErr: (t) => log.push(t),
    });
  }
  return ready;
}

self.onmessage = async (e) => {
  const { id, args, input } = e.data;
  try {
    const q = await qpdf();
    log = [];
    q.FS.writeFile('/in.pdf', new Uint8Array(input));
    try { q.FS.unlink('/out.pdf'); } catch (_) { /* ok */ }
    const full = args.map((a) => (a === '{in}' ? '/in.pdf' : a === '{out}' ? '/out.pdf' : a));
    let rc;
    try { rc = q.callMain(full); } catch (err) { rc = typeof err?.status === 'number' ? err.status : 2; }
    // 0 = ok, 3 = ok com avisos
    if (rc !== 0 && rc !== 3) {
      const msg = log.join(' ');
      if (/invalid password/i.test(msg)) throw Object.assign(new Error('Senha incorreta'), { code: 'password' });
      throw new Error(msg.replace(/^.*?:\s*/, '') || `qpdf terminou com código ${rc}`);
    }
    const out = q.FS.readFile('/out.pdf');
    q.FS.unlink('/in.pdf'); q.FS.unlink('/out.pdf');
    self.postMessage({ id, ok: true, buffer: out.buffer, warnings: rc === 3 ? log.join(' ') : '' }, [out.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message, code: err.code || '' });
  }
};
