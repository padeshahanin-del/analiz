/* viewer.js — چسب DOM صفحهٔ پیشخوان؛ همهٔ منطق در KalaxaViewerCore (تست‌شده در Node). */
(function () {
  'use strict';
  var cfg = window.KalaxaViewerCfg || {};
  function el(id) { return document.getElementById(id); }
  function esc(s) { return window.KalaxaViewerCore._esc(s); }

  function api(path) {
    return fetch(cfg.rest + path, { headers: { 'X-WP-Nonce': cfg.nonce } })
      .then(function (r) { return r.text().then(function (t) { return { status: r.status, text: t }; }); });
  }

  function setStatus(t) { el('kx-status').textContent = t || ''; }
  function showMsg(kind, text) {
    el('kx-msgs').innerHTML += '<div class="kx-msg ' + kind + '">' + esc(text) + '</div>';
  }

  function loadList() {
    setStatus('در حال دریافت فهرست…');
    el('kx-msgs').innerHTML = '';
    api('projects').then(function (r) {
      setStatus('');
      var data; try { data = JSON.parse(r.text); } catch (e) { data = null; }
      if (r.status !== 200 || !data || !data.ok) {
        return showMsg('err', 'فهرست پروژه‌ها دریافت نشد (HTTP ' + r.status + ')');
      }
      var sel = el('kx-projects');
      sel.innerHTML = '<option value="">— انتخاب پروژه —</option>';
      data.projects.forEach(function (p) {
        var o = document.createElement('option');
        o.value = p.project_id;
        o.textContent = p.project_id.slice(0, 8) + '… — revision ' + (p.revision || '—') +
          ' — ' + (p.updated_at || p.pushed_at || '');
        sel.appendChild(o);
      });
      if (!data.projects.length) showMsg('info', 'هنوز پروژه‌ای push نشده است.');
    });
  }

  function shareCurrent() {
    var id = el('kx-projects').value;
    if (!id) return showMsg('info', 'ابتدا پروژه را انتخاب کنید.');
    fetch(cfg.rest + 'projects/' + id + '/shares', {
      method: 'POST',
      headers: { 'X-WP-Nonce': cfg.nonce, 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: 30 })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok) return showMsg('err', 'ساخت لینک شکست خورد');
      var box = document.createElement('div');
      box.className = 'kx-msg info';
      box.innerHTML = 'لینک اشتراک ۳۰روزه (همین یک بار نمایش داده می‌شود): ' +
        '<input readonly style="width:60%;direction:ltr" value="' + esc(d.url) + '"> ' +
        '<button class="button" data-copy>کپی</button>';
      box.querySelector('[data-copy]').addEventListener('click', function () {
        box.querySelector('input').select(); document.execCommand('copy');
      });
      el('kx-msgs').appendChild(box);
    }).catch(function () { showMsg('err', 'خطای شبکه'); });
  }

  function loadProject(id) {
    el('kx-sections').innerHTML = '';
    el('kx-msgs').innerHTML = '';
    el('kx-meta').textContent = '';
    if (!id) return;
    setStatus('در حال دریافت و رندر…');
    api('projects/' + id).then(function (r) {
      setStatus('');
      if (r.status !== 200) return showMsg('err', 'دریافت پاکت شکست خورد (HTTP ' + r.status + ')');
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
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    el('kx-reload').addEventListener('click', loadList);
    var shareBtn = document.createElement('button');
    shareBtn.className = 'button'; shareBtn.id = 'kx-share';
    shareBtn.textContent = 'ساخت لینک اشتراک عمومی';
    el('kx-reload').parentNode.insertBefore(shareBtn, el('kx-status'));
    shareBtn.addEventListener('click', shareCurrent);
    el('kx-projects').addEventListener('change', function (ev) { loadProject(ev.target.value); });
    loadList();
  });
})();
