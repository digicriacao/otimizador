/* =========================================================================
   Favicon animado: bolinha rosa da Digi "respirando".
   Durante o processamento, um anel mostra o progresso do lote.
   ========================================================================= */
(function () {
  var link = document.getElementById('favicon');
  var c = document.createElement('canvas');
  if (!link || !c.getContext) return;
  var S = 64; c.width = c.height = S;
  var ctx = c.getContext('2d');
  var ROSA = '#EA0356';
  var progress = null;      // null = parado; 0..1 = processando
  var doneAt = 0;           // momento em que terminou (mostra um "ok" breve)
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var t0 = performance.now();

  function draw(now) {
    var t = ((now - t0) / 2400) % 1;              // ciclo de 2,4 s
    ctx.clearRect(0, 0, S, S);

    if (progress !== null) {
      // Trilha + arco de progresso
      ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(234,3,86,.22)';
      ctx.beginPath(); ctx.arc(32, 32, 27, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = ROSA;
      ctx.beginPath(); ctx.arc(32, 32, 27, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.04, progress)); ctx.stroke();
      ctx.fillStyle = ROSA;
      ctx.beginPath(); ctx.arc(32, 32, 14 + Math.sin(t * Math.PI * 2) * 2, 0, Math.PI * 2); ctx.fill();
    } else if (now - doneAt < 2500) {
      // Concluído: bolinha cheia com um check branco
      ctx.fillStyle = ROSA;
      ctx.beginPath(); ctx.arc(32, 32, 28, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(19, 33); ctx.lineTo(28, 42); ctx.lineTo(45, 23); ctx.stroke();
    } else {
      // Em repouso: halo que se expande e some, bolinha que pulsa de leve
      var e = reduce ? 0 : t;
      if (!reduce) {
        ctx.fillStyle = 'rgba(234,3,86,' + (0.35 * (1 - e)).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(32, 32, 20 + 12 * e, 0, Math.PI * 2); ctx.fill();
      }
      var pulse = reduce ? 0 : Math.sin(t * Math.PI * 2) * 1.5;
      ctx.fillStyle = ROSA;
      ctx.beginPath(); ctx.arc(32, 32, 19 + pulse, 0, Math.PI * 2); ctx.fill();
    }
    link.type = 'image/png';
    link.href = c.toDataURL('image/png');
  }

  // ~12 quadros por segundo: suave sem pesar. Em aba oculta o navegador reduz sozinho.
  draw(performance.now());
  if (!reduce) setInterval(function () { draw(performance.now()); }, 83);

  window.DigiFavicon = {
    progress: function (p) { progress = Math.max(0, Math.min(1, p)); draw(performance.now()); },
    done: function () { progress = null; doneAt = performance.now(); draw(doneAt); setTimeout(function () { draw(performance.now()); }, 2600); },
  };
})();
