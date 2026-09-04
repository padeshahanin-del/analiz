/**
 * kalaxa-install-map.js — v1.1.0
 * نقشه نصب: elevation خودکار هر دیوار از world_transform کابینت‌ها.
 *
 * - گروه‌بندی دیوار: کابینت‌های هم‌زاویه (rotation_z) که روی یک خط قرار دارند
 * - مختصات روی دیوار: s = تصویر origin روی بردار جهت دیوار (mm)
 * - خروجی هر دیوار: SVG با زنجیره دایمنشن پایین (عرض‌ها + جمع)،
 *   زنجیره ارتفاع راست، خط کانتر، لیبل فارسی هر کابینت
 * - JS خالص، UMD، بدون وابستگی
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaInstallMap = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.1.0';

  function fa(n) {
    return String(n).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
  }
  // فرمت طول در واحد نمایش (پیش‌فرض cm؛ همتراز KalaxaSettings) — ارقام فارسی
  function fmtLen(mm, unit) {
    if (typeof mm !== 'number' || !isFinite(mm)) return '—';
    if (unit === 'mm') return fa(Math.round(mm));
    var cm = Math.round(mm / 10 * 10) / 10;
    return fa(cm % 1 === 0 ? Math.round(cm) : cm);
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function round(n) { return Math.round(n); }

  /* --------------------------------------------------------- گروه‌بندی دیوار */

  /**
   * @param {Array} cabinets - snapshot.cabinets
   * @returns {Array<{wall_id, rotation_deg, items:[...]}>}
   * هر item: { cab, s_mm, z_mm, w_mm, h_mm, d_mm }
   */
  function groupWalls(cabinets, opts) {
    opts = opts || {};
    var lineTol = opts.line_tolerance_mm || 100; // کابینت‌های روی یک خط با رواداری
    var walls = [];

    (cabinets || []).forEach(function (cab) {
      var wt = cab.world_transform || {};
      var o = wt.origin_cm || [0, 0, 0];
      var rot = normDeg(wt.rotation_z_deg || 0);
      var rad = rot * Math.PI / 180;
      var dir = { x: Math.cos(rad), y: Math.sin(rad) };
      var nrm = { x: -Math.sin(rad), y: Math.cos(rad) };

      var ox = o[0] * 10, oy = o[1] * 10, oz = o[2] * 10; // cm → mm
      var s = ox * dir.x + oy * dir.y;      // مختصات طولی روی دیوار
      var c = ox * nrm.x + oy * nrm.y;      // فاصله خط دیوار از مبدأ

      var p = cab.params || {};
      var item = {
        cab: cab,
        s_mm: round(s),
        z_mm: round(oz),
        w_mm: round((p.cabinet_width || 0) * 10),
        h_mm: round((p.cabinet_height || 0) * 10),
        d_mm: round((p.cabinet_depth || 0) * 10)
      };

      var wall = walls.find(function (w) {
        return w.rotation_deg === rot && Math.abs(w.c_mm - c) <= lineTol;
      });
      if (!wall) {
        wall = { rotation_deg: rot, c_mm: c, items: [] };
        walls.push(wall);
      }
      wall.items.push(item);
    });

    walls.forEach(function (w, i) {
      w.items.sort(function (a, b) { return a.s_mm - b.s_mm; });
      // نرمال‌سازی: شروع دیوار از صفر
      var s0 = w.items.length ? w.items[0].s_mm : 0;
      w.items.forEach(function (it) { it.s_mm -= s0; });
      w.wall_id = 'wall-' + (i + 1);
      w.label_fa = 'دیوار ' + fa(i + 1) +
        (w.rotation_deg ? ' (زاویه ' + fa(w.rotation_deg) + '°)' : '');
      w.length_mm = w.items.reduce(function (m, it) {
        return Math.max(m, it.s_mm + it.w_mm);
      }, 0);
      w.height_mm = w.items.reduce(function (m, it) {
        return Math.max(m, it.z_mm + it.h_mm);
      }, 0);
    });

    return walls;
  }

  function normDeg(d) {
    var x = Math.round(d) % 360;
    return x < 0 ? x + 360 : x;
  }

  /* ------------------------------------------------------- عناصر دایمنشن */

  function dimH(out, x1, x2, y, valueMm, scale, ox, unit) {
    var X1 = ox + x1 * scale, X2 = ox + x2 * scale;
    out.push('<line x1="' + X1 + '" y1="' + y + '" x2="' + X2 + '" y2="' + y +
      '" stroke="#555" stroke-width="1"/>');
    [X1, X2].forEach(function (X) {
      out.push('<line x1="' + X + '" y1="' + (y - 5) + '" x2="' + X + '" y2="' + (y + 5) +
        '" stroke="#555" stroke-width="1"/>');
    });
    out.push('<text x="' + ((X1 + X2) / 2) + '" y="' + (y - 4) +
      '" text-anchor="middle" font-size="11" fill="#333">' + fmtLen(valueMm, unit) + '</text>');
  }

  function dimV(out, y1, y2, x, valueMm, unit) {
    out.push('<line x1="' + x + '" y1="' + y1 + '" x2="' + x + '" y2="' + y2 +
      '" stroke="#555" stroke-width="1"/>');
    [y1, y2].forEach(function (Y) {
      out.push('<line x1="' + (x - 5) + '" y1="' + Y + '" x2="' + (x + 5) + '" y2="' + Y +
        '" stroke="#555" stroke-width="1"/>');
    });
    out.push('<text x="' + (x + 6) + '" y="' + ((y1 + y2) / 2 + 4) +
      '" font-size="11" fill="#333">' + fmtLen(valueMm, unit) + '</text>');
  }

  /* --------------------------------------------------------- رندر elevation */

  var CAT_FILL = { base: '#e9dfd0', wall: '#dce8f0', tall: '#e4e0ee' };

  /**
   * رندر یک دیوار.
   * @param {object} wall - خروجی groupWalls
   * @param {object} [opts] - { px_per_mm, floor_line, counter_top_mm }
   */
  function renderWall(wall, opts) {
    opts = opts || {};
    var unit = opts.unit === 'mm' ? 'mm' : 'cm';     // واحد نمایش ابعاد (پیش‌فرض cm)
    var scale = opts.px_per_mm || 0.22;
    var padL = 40, padR = 90, padT = 50, padB = 110;

    var W = wall.length_mm * scale;
    var H = wall.height_mm * scale;
    var svgW = W + padL + padR;
    var svgH = H + padT + padB;
    var ox = padL, oyTop = padT;

    function X(mm) { return ox + mm * scale; }
    function Y(zmm, hmm) { return oyTop + H - (zmm + hmm) * scale; }

    var out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + svgW + '" height="' + svgH +
      '" viewBox="0 0 ' + svgW + ' ' + svgH +
      '" font-family="Vazirmatn, Tahoma, sans-serif" direction="rtl">');

    out.push('<text x="' + (svgW / 2) + '" y="26" text-anchor="middle" font-size="17" font-weight="bold">' +
      esc('نقشه نصب — ' + wall.label_fa) + '</text>');

    // خط زمین
    out.push('<line x1="' + (ox - 15) + '" y1="' + (oyTop + H) + '" x2="' + (ox + W + 15) +
      '" y2="' + (oyTop + H) + '" stroke="#222" stroke-width="2.5"/>');
    out.push('<text x="' + (ox + W + 18) + '" y="' + (oyTop + H + 4) +
      '" font-size="11" fill="#666">کف تمام‌شده</text>');

    // خط کانتر: بالای بلندترین کابینت زمینی (+ صفحه در صورت تنظیم)
    var baseTops = wall.items
      .filter(function (it) { return (it.cab.category || '') === 'base'; })
      .map(function (it) { return it.z_mm + it.h_mm; });
    if (baseTops.length) {
      var counterZ = Math.max.apply(null, baseTops) + (opts.counter_top_mm || 0);
      var cy = Y(counterZ, 0);
      out.push('<line x1="' + ox + '" y1="' + cy + '" x2="' + (ox + W) + '" y2="' + cy +
        '" stroke="#b08d57" stroke-width="2" stroke-dasharray="10,5"/>');
      out.push('<text x="' + (ox + 4) + '" y="' + (cy - 5) +
        '" font-size="11" fill="#b08d57">خط کانتر ' + fmtLen(counterZ, unit) + '</text>');
    }

    // کابینت‌ها
    wall.items.forEach(function (it) {
      var x = X(it.s_mm), y = Y(it.z_mm, it.h_mm);
      var w = it.w_mm * scale, h = it.h_mm * scale;
      var fill = CAT_FILL[it.cab.category] || '#eee';
      out.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
        '" fill="' + fill + '" stroke="#333" stroke-width="1.4"/>');
      if (w > 55 && h > 34) {
        out.push('<text x="' + (x + w / 2) + '" y="' + (y + h / 2 - 3) +
          '" text-anchor="middle" font-size="11" font-weight="bold">' +
          esc(it.cab.label_fa || it.cab.template_id) + '</text>');
        out.push('<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + 13) +
          '" text-anchor="middle" font-size="10" fill="#444">' +
          fmtLen(it.w_mm, unit) + '×' + fmtLen(it.h_mm, unit) + '</text>');
      }
    });

    // زنجیره دایمنشن پایین: عرض‌ها و فاصله‌های خالی سطح پایین (کابینت‌های z=0)
    var dimY1 = oyTop + H + 28;
    var floorItems = wall.items.filter(function (it) { return it.z_mm < 300; })
      .sort(function (a, b) { return a.s_mm - b.s_mm; });
    var cursor = 0;
    floorItems.forEach(function (it) {
      if (it.s_mm > cursor + 1) dimH(out, cursor, it.s_mm, dimY1, it.s_mm - cursor, scale, ox, unit);
      dimH(out, it.s_mm, it.s_mm + it.w_mm, dimY1, it.w_mm, scale, ox, unit);
      cursor = Math.max(cursor, it.s_mm + it.w_mm);
    });
    // جمع کل
    dimH(out, 0, wall.length_mm, dimY1 + 30, wall.length_mm, scale, ox, unit);

    // زنجیره ارتفاع راست: ترازهای z متمایز (کف هر کابینت و سقفش)
    var levels = [0];
    wall.items.forEach(function (it) {
      pushUniq(levels, it.z_mm);
      pushUniq(levels, it.z_mm + it.h_mm);
    });
    levels.sort(function (a, b) { return a - b; });
    var dimX = ox + W + 30;
    for (var i = 1; i < levels.length; i++) {
      dimV(out, Y(levels[i], 0), Y(levels[i - 1], 0), dimX, levels[i] - levels[i - 1], unit);
    }

    out.push('</svg>');
    return out.join('\n');
  }

  function pushUniq(arr, v) {
    if (!arr.some(function (x) { return Math.abs(x - v) < 2; })) arr.push(v);
  }

  /** رندر همه دیوارها از snapshot */
  function renderAll(snapshot, opts) {
    return groupWalls(snapshot.cabinets, opts).map(function (w) {
      return { wall_id: w.wall_id, label_fa: w.label_fa, svg: renderWall(w, opts), wall: w };
    });
  }

  return {
    VERSION: VERSION,
    groupWalls: groupWalls,
    renderWall: renderWall,
    renderAll: renderAll
  };
}));
