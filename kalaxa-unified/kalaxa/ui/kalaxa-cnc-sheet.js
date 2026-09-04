/**
 * Kalaxa CNC Sheet — نقشهٔ تک‌قطعه با جای سوراخ‌ها (SVG)
 *
 * تا نسخهٔ ۳.۴۱ برگهٔ «قطعات کار ماشین» فقط فهرست بود، با این اعتراف صریح که
 * «جای سوراخ را نمی‌دانیم». حالا Kalaxa::Machining جای سوراخ‌ها را از هندسه
 * می‌خواند و این ماژول آن را به نقشهٔ قابل‌اجرا تبدیل می‌کند.
 *
 * سه قاعده که در این نقشه شکسته نمی‌شوند:
 *
 * ۱. **اندازه از گوشهٔ قطعه.** اپراتور از لبهٔ تخته اندازه می‌گیرد، نه از مرکز
 *    کابینت. هر سوراخ دو عدد دارد: از لبهٔ طول و از لبهٔ عرض.
 * ۲. **عمق نامعلوم، نامعلوم نوشته می‌شود.** عددِ حدسی قطعه را خراب می‌کند.
 * ۳. **قطعهٔ قرینه نقشهٔ خودش را دارد.** دیوارهٔ چپ و راست هم‌اندازه‌اند ولی
 *    سوراخ‌هایشان قرینه است؛ یک نقشه برای هر دو یعنی یکی‌شان اشتباه سوراخ شود.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KalaxaCncSheet = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  var DEFAULTS = {
    max_width_px: 460,
    margin_px: 44,       // جا برای خط اندازه
    font_px: 9,
    hole_stroke: '#b23',
    pocket_fill: 'rgba(178,34,51,0.12)'
  };

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }
  function fa(n) {
    return String(n).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function cfgOf(o) {
    var c = {};
    Object.keys(DEFAULTS).forEach(function (k) { c[k] = DEFAULTS[k]; });
    Object.keys(o || {}).forEach(function (k) { if (o[k] != null) c[k] = o[k]; });
    return c;
  }

  /**
   * @param {object} part - یک قطعه از KalaxaPartClassifier: name, role_label_fa,
   *   cut_length_mm, cut_width_mm, thickness_mm, و `features` از اسکنر
   * @returns {{svg:string, holes:Array, warnings:Array<string>}}
   */
  function render(part, options) {
    var cfg = cfgOf(options);
    var L = num(part && part.cut_length_mm);
    var W = num(part && part.cut_width_mm);
    var warnings = [];
    if (!(L > 0 && W > 0)) {
      return { svg: '', holes: [], warnings: ['ابعاد قطعه معلوم نیست'] };
    }

    var f = (part.features) || {};
    var holes = (f.holes || []).slice();
    var pockets = (f.pockets || []).slice();

    if (!holes.length && !pockets.length) {
      warnings.push('هندسهٔ سوراخ خوانده نشد — این قطعه کار ماشین دارد ولی ' +
                    'جای دقیق آن از مدل درنیامد؛ دستی اندازه بگیرید');
    }
    if (holes.some(function (h) { return h.depth_mm == null && !h.through; })) {
      warnings.push('عمق بعضی سوراخ‌ها از مدل درنیامد — «؟» علامت خورده‌اند');
    }

    // مقیاس طوری که طول قطعه در عرض کاغذ جا شود.
    var s = Math.min(cfg.max_width_px / L, cfg.max_width_px / W);
    var m = cfg.margin_px;
    var w = Math.round(L * s + 2 * m);
    var h = Math.round(W * s + 2 * m);
    // v از پایین اندازه گرفته می‌شود ولی SVG از بالا می‌کشد.
    var X = function (u) { return m + u * s; };
    var Y = function (v) { return m + (W - v) * s; };

    var body = '';

    // خطِ دور قطعه
    body += '<rect x="' + m + '" y="' + m + '" width="' + (L * s).toFixed(1) +
      '" height="' + (W * s).toFixed(1) +
      '" fill="#fdfdfb" stroke="#333" stroke-width="1"/>';

    pockets.forEach(function (p) {
      body += '<rect x="' + X(num(p.u_mm)).toFixed(1) +
        '" y="' + Y(num(p.v_mm) + num(p.dv_mm)).toFixed(1) +
        '" width="' + (num(p.du_mm) * s).toFixed(1) +
        '" height="' + (num(p.dv_mm) * s).toFixed(1) +
        '" fill="' + cfg.pocket_fill + '" stroke="' + cfg.hole_stroke +
        '" stroke-width="0.8" stroke-dasharray="3,2"/>';
    });

    holes.forEach(function (hole, i) {
      var cx = X(num(hole.u_mm));
      var cy = Y(num(hole.v_mm));
      var r = Math.max(1.5, num(hole.dia_mm) / 2 * s);
      body += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) +
        '" r="' + r.toFixed(1) + '" fill="none" stroke="' + cfg.hole_stroke +
        '" stroke-width="1.1"/>';
      // ضربدر مرکز — اپراتور مرکز را نشانه می‌گیرد، نه لبهٔ دایره را
      body += '<path d="M' + (cx - r - 3).toFixed(1) + ' ' + cy.toFixed(1) +
        ' H' + (cx + r + 3).toFixed(1) + ' M' + cx.toFixed(1) + ' ' +
        (cy - r - 3).toFixed(1) + ' V' + (cy + r + 3).toFixed(1) +
        '" stroke="' + cfg.hole_stroke + '" stroke-width="0.5"/>';
      body += '<text x="' + (cx + r + 4).toFixed(1) + '" y="' + (cy - r - 2).toFixed(1) +
        '" font-size="' + cfg.font_px + '" fill="#333">' + fa(i + 1) + '</text>';
    });

    // خطوط اندازهٔ کلی
    body += dimLine(m, m + W * s + 16, m + L * s, m + W * s + 16, fa(Math.round(L)), cfg);
    body += dimLineV(m - 16, m, m - 16, m + W * s, fa(Math.round(W)), cfg);

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h +
      '" viewBox="0 0 ' + w + ' ' + h + '" font-family="Tahoma, sans-serif">' +
      '<rect width="' + w + '" height="' + h + '" fill="#fff"/>' + body + '</svg>';

    return {
      svg: svg,
      holes: holes.map(function (hole, i) {
        return {
          n: i + 1,
          dia_mm: num(hole.dia_mm),
          from_length_mm: num(hole.u_mm),
          from_width_mm: num(hole.v_mm),
          depth_mm: hole.depth_mm == null ? null : num(hole.depth_mm),
          through: !!hole.through
        };
      }),
      warnings: warnings
    };
  }

  function dimLine(x1, y1, x2, y2, label, cfg) {
    return '<path d="M' + x1 + ' ' + y1 + ' H' + x2 + '" stroke="#666" stroke-width="0.6"/>' +
      '<text x="' + ((x1 + x2) / 2) + '" y="' + (y1 + 11) + '" font-size="' + cfg.font_px +
      '" text-anchor="middle" fill="#666">' + label + '</text>';
  }

  function dimLineV(x1, y1, x2, y2, label, cfg) {
    return '<path d="M' + x1 + ' ' + y1 + ' V' + y2 + '" stroke="#666" stroke-width="0.6"/>' +
      '<text x="' + (x1 - 4) + '" y="' + ((y1 + y2) / 2) + '" font-size="' + cfg.font_px +
      '" text-anchor="end" fill="#666">' + label + '</text>';
  }

  /** جدول سوراخ‌ها — همان چیزی که کنار دستگاه می‌خوانند. */
  function tableHtml(result, partName) {
    if (!result.holes.length) return '';
    return '<table><tr><th>#</th><th>قطر</th><th>از لبهٔ طول</th>' +
      '<th>از لبهٔ عرض</th><th>عمق</th></tr>' +
      result.holes.map(function (h) {
        return '<tr><td class="num">' + fa(h.n) + '</td>' +
          '<td class="num">Ø' + fa(h.dia_mm) + '</td>' +
          '<td class="num">' + fa(h.from_length_mm) + '</td>' +
          '<td class="num">' + fa(h.from_width_mm) + '</td>' +
          '<td class="num">' + (h.through ? 'سرتاسری'
            : (h.depth_mm == null ? '؟' : fa(h.depth_mm))) + '</td></tr>';
      }).join('') + '</table>' +
      (partName ? '<div class="meta">' + esc(partName) + '</div>' : '');
  }

  return { VERSION: VERSION, DEFAULTS: DEFAULTS, render: render, tableHtml: tableHtml };
}));
