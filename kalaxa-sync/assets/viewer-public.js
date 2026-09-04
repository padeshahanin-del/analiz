/* viewer-public.js — صفحهٔ اشتراک عمومی: دریافت پاکت با توکن و رندر با هستهٔ تست‌شده. */
(function () {
  'use strict';
  var cfg = window.KalaxaShareCfg || {};
  function el(id) { return document.getElementById(id); }
  function esc(s) { return window.KalaxaViewerCore._esc(s); }
  function showMsg(kind, text) {
    el('kx-msgs').innerHTML += '<div class="kx-msg ' + kind + '">' + esc(text) + '</div>';
  }
  fetch(cfg.endpoint).then(function (r) {
    return r.text().then(function (t) { return { status: r.status, text: t }; });
  }).then(function (r) {
    if (r.status !== 200) return showMsg('err', 'دریافت پروژه شکست خورد (HTTP ' + r.status + ')');
    var out = window.KalaxaViewerCore.render(r.text);
    (out.errors || []).forEach(function (e) { showMsg('err', e); });
    (out.limitations || []).forEach(function (l) { showMsg('info', l); });
    if (out.meta) {
      el('kx-meta').textContent = out.meta.project_name +
        (out.meta.revision ? ' — revision ' + out.meta.revision : '');
    }
    var host = el('kx-sections');
    out.sections.forEach(function (s) {
      var d = document.createElement('section');
      d.innerHTML = '<h2>' + esc(s.title_fa) + '</h2>' + s.html;
      host.appendChild(d);
    });
  }).catch(function () { showMsg('err', 'خطای شبکه'); });
})();
