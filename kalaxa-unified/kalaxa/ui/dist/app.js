/* Kalaxa UI — بدون وابستگی خارجی؛ همهٔ ارتباط با Ruby از طریق KY */
'use strict';

/** @typedef {{id:string, ok:boolean, payload?:any, error?:{code:string,message:string}}} KyResponse */

var KY = (function () {
  var pending = Object.create(null);
  var seq = 0;

  function send(type, payload) {
    return new Promise(function (resolve, reject) {
      var id = 'm' + (++seq) + '-' + Date.now();
      pending[id] = { resolve: resolve, reject: reject };
      var raw = JSON.stringify({ id: id, type: type, payload: payload || {} });
      if (window.sketchup && window.sketchup.ky_message) {
        window.sketchup.ky_message(raw);
      } else {
        reject(new Error('sketchup bridge unavailable'));
      }
    });
  }

  /** نقطهٔ ورود پاسخ‌ها از Ruby (dialog.rb → execute_script) */
  function receive(rawJson) {
    /** @type {KyResponse} */
    var msg = JSON.parse(rawJson);
    var slot = msg.id ? pending[msg.id] : null;
    if (!slot) { return; }
    delete pending[msg.id];
    if (msg.ok) { slot.resolve(msg.payload); }
    else { slot.reject(Object.assign(new Error(msg.error.message), { code: msg.error.code })); }
  }

  return { send: send, receive: receive };
})();

/* ---------------- Error Boundary رابط ---------------- */
function showBoundary(strings) {
  var s = strings || {};
  document.getElementById('app').classList.add('hidden');
  var b = document.getElementById('boundary');
  document.getElementById('boundary-title').textContent = s['error.boundary_title'] || 'A UI error occurred';
  document.getElementById('boundary-body').textContent = s['error.boundary_body'] || 'Details were logged.';
  var btn = document.getElementById('boundary-reload');
  btn.textContent = s['error.reload'] || 'Reload UI';
  btn.onclick = function () { window.location.reload(); };
  b.classList.remove('hidden');
}

window.addEventListener('error', function (ev) {
  try {
    KY.send('ui/error', {
      message: String(ev.message || ev.error || 'unknown'),
      source: String(ev.filename || ''),
      line: ev.lineno || 0
    }).catch(function () {});
  } catch (_) { /* لاگ نباید خودش خطا بسازد */ }
  showBoundary(App.strings);
});

/* ---------------- برنامهٔ پنل ---------------- */
var App = {
  strings: null,

  init: function () {
    KY.send('app/get_state').then(App.applyState).catch(function () {
      showBoundary(null);
    });
  },

  applyState: function (state) {
    App.strings = state.strings;
    document.documentElement.lang = state.locale;
    document.documentElement.dir = state.direction;

    var t = function (k) { return state.strings[k] || k; };
    document.getElementById('t-title').textContent = t('app.title');
    document.getElementById('t-subtitle').textContent = t('app.subtitle');
    document.getElementById('t-status').textContent = t('panel.status_ready');
    document.getElementById('t-version').textContent = 'v' + state.version + ' · ' + state.build.type;
    document.getElementById('t-language').textContent = t('panel.language');
    document.getElementById('btn-ping').textContent = t('panel.ping');
    document.getElementById('btn-error').textContent = t('panel.raise_error');
    document.getElementById('btn-ui-error').textContent = t('panel.ui_error_test');
    document.getElementById('result').textContent = '';

    var wrap = document.getElementById('locale-buttons');
    wrap.textContent = '';
    state.locales.forEach(function (loc) {
      var b = document.createElement('button');
      b.className = 'locale' + (loc === state.locale ? ' active' : '');
      b.textContent = t('panel.lang_' + loc);
      b.onclick = function () {
        KY.send('app/set_locale', { locale: loc }).then(App.applyState).catch(App.showError);
      };
      wrap.appendChild(b);
    });

    document.getElementById('btn-ping').onclick = App.ping;
    document.getElementById('btn-error').onclick = App.controlledError;
    document.getElementById('btn-ui-error').onclick = function () {
      // خطای عمدی کنترل‌نشده برای آزمون Error Boundary
      throw new Error('deliberate ui boundary test');
    };

    document.getElementById('boundary').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
  },

  ping: function () {
    var t0 = performance.now();
    KY.send('app/ping', { n: 1 }).then(function () {
      var ms = Math.round(performance.now() - t0);
      var msg = (App.strings['panel.ping_result'] || 'Response in {ms} ms').replace('{ms}', String(ms));
      document.getElementById('result').textContent = msg;
    }).catch(App.showError);
  },

  controlledError: function () {
    KY.send('app/raise_test_error').then(function () {
      document.getElementById('result').textContent = 'unexpected success';
    }).catch(function (err) {
      var msg = (App.strings['panel.error_caught'] || 'Controlled error: {code}').replace('{code}', err.code || '?');
      document.getElementById('result').textContent = msg;
    });
  },

  showError: function (err) {
    document.getElementById('result').textContent = (err && err.message) || String(err);
  }
};

document.addEventListener('DOMContentLoaded', App.init);
