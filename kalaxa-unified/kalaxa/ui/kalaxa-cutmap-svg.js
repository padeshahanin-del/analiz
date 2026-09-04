/**
 * kalaxa-cutmap-svg.js — v1.6.0
 * رندر SVG نقشه برش برای اپراتور پنل‌بر — JS خالص، UMD، بدون وابستگی.
 *
 * ورودی: خروجی KalaxaNesting.run() + آرایه sheets از snapshot
 * خروجی: رشته‌های SVG (یک SVG به‌ازای هر ورق فیزیکی) — قابل چاپ A4/A3 افقی
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaCutmapSVG = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.6.0';

  var COLORS = ['#cfe3f7', '#f7e3cf', '#d8f0d4', '#f0d4e8', '#e6e0f2',
                '#f5f0c8', '#d4ecf0', '#f0dcd4', '#e0f2dc', '#ecd4d8'];

  // نقش پیش‌فرض قطعه از روی key (برای تمایز علامت نوار بدنه/درب) — همتراز ROLE_KEYS تنظیمات
  var DOOR_KEYS = { door: 1, drawer_front: 1 };
  function defaultRole(key) { return DOOR_KEYS[key] ? 'door' : 'body'; }

  // اگر opts.marks داده نشود (مثلاً فراخوانی مستقل بدون تنظیمات) — همتراز KalaxaSettings.DEFAULT_MARKS
  var DEFAULT_MARKS_FALLBACK = {
    band_body: { code: '#', label_fa: 'نوار بدنه' },
    band_door: { code: 'P', label_fa: 'نوار درب' },
    groove:    { code: 'W', label_fa: 'شیار' },
    miter:     { code: 'F', label_fa: 'فارسی‌بر (۴۵°)' },
    bevel:     { code: 'Z', label_fa: 'کج‌بری با زاویه' }
  };
  var MARK_ORDER = ['band_body', 'band_door', 'groove', 'miter', 'bevel'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function faNum(n) {
    var fa = '۰۱۲۳۴۵۶۷۸۹';
    return String(n).replace(/[0-9]/g, function (d) { return fa[+d]; });
  }

  // فرمت طول در واحد نمایش (پیش‌فرض cm؛ همتراز KalaxaSettings/CabinetView) — ارقام فارسی
  function fmtLen(mm, unit) {
    if (typeof mm !== 'number' || !isFinite(mm)) return '—';
    if (unit === 'mm') return faNum(Math.round(mm));
    var cm = Math.round(mm / 10 * 10) / 10;
    return faNum(cm % 1 === 0 ? Math.round(cm) : cm);
  }
  function unitLabel(unit) { return unit === 'mm' ? 'میلی‌متر' : 'سانتی‌متر'; }

  function colorFor(key, map) {
    if (!map[key]) map[key] = COLORS[Object.keys(map).length % COLORS.length];
    return map[key];
  }

  /**
   * رندر یک layout (یک ورق فیزیکی).
   * @param {object} layout  - عضو layouts از خروجی nesting
   * @param {object} sheet   - تعریف ورق از snapshot.sheets
   * @param {object} [opts]  - { px_per_mm, show_cuts, show_offcuts, title }
   * @returns {string} SVG
   */
  function renderSheet(layout, sheet, opts) {
    opts = opts || {};
    var unit = opts.unit === 'mm' ? 'mm' : 'cm';     // واحد نمایش ابعاد (پیش‌فرض cm)
    var scale = opts.px_per_mm || 0.28;              // 3660mm → ~1025px
    var pad = 60;
    var W = sheet.width_mm * scale;
    var H = sheet.height_mm * scale;
    var svgW = W + pad * 2;
    var svgH = H + pad * 2 + 40;
    var colorMap = {};

    var out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + svgW +
      '" height="' + svgH + '" viewBox="0 0 ' + svgW + ' ' + svgH +
      '" font-family="Vazirmatn, Tahoma, sans-serif" direction="rtl">');

    // عنوان
    var title = opts.title ||
      (sheet.sheet_id + ' — ورق ' + faNum(layout.sheet_index) +
       ' — بازدهی ' + faNum(layout.utilization_pct) + '٪');
    out.push('<text x="' + (svgW / 2) + '" y="28" text-anchor="middle" font-size="18" font-weight="bold">' +
      esc(title) + '</text>');

    var ox = pad, oy = pad + 20;
    function X(mm) { return ox + mm * scale; }
    // محور y نقشه از پایین ورق (مثل ایستادن اپراتور جلوی پنل‌بر)
    function Y(mm, h) { return oy + H - (mm + h) * scale; }

    // بدنه ورق
    out.push('<rect x="' + ox + '" y="' + oy + '" width="' + W + '" height="' + H +
      '" fill="#fafafa" stroke="#333" stroke-width="2"/>');

    // trim margin
    var t = (sheet.trim_margin_mm || 0) * scale;
    if (t > 0) {
      out.push('<rect x="' + (ox + t) + '" y="' + (oy + t) + '" width="' + (W - 2 * t) +
        '" height="' + (H - 2 * t) + '" fill="none" stroke="#bbb" stroke-dasharray="6,4"/>');
    }

    // آفکات‌ها (هاشور)
    if (opts.show_offcuts !== false) {
      out.push('<defs><pattern id="hatch' + layout.sheet_index +
        '" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">' +
        '<line x1="0" y1="0" x2="0" y2="8" stroke="#c9c9c9" stroke-width="2"/></pattern></defs>');
      (layout.offcuts || []).forEach(function (o) {
        out.push('<rect x="' + X(o.x_mm) + '" y="' + Y(o.y_mm, o.h_mm) +
          '" width="' + (o.w_mm * scale) + '" height="' + (o.h_mm * scale) +
          '" fill="url(#hatch' + layout.sheet_index + ')" stroke="#aaa" stroke-width="1"/>');
        if (o.w_mm * scale > 70 && o.h_mm * scale > 24) {
          out.push('<text x="' + (X(o.x_mm) + o.w_mm * scale / 2) + '" y="' +
            (Y(o.y_mm, o.h_mm) + o.h_mm * scale / 2) +
            '" text-anchor="middle" font-size="11" fill="#888">آفکات ' +
            fmtLen(o.w_mm, unit) + '×' + fmtLen(o.h_mm, unit) + '</text>');
        }
      });
    }

    // قطعات
    (layout.placements || []).forEach(function (p) {
      var fill = colorFor(p.key, colorMap);
      var x = X(p.x_mm), y = Y(p.y_mm, p.h_mm);
      var w = p.w_mm * scale, h = p.h_mm * scale;
      out.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
        '" fill="' + fill + '" stroke="#444" stroke-width="1.2"/>');

      var label = (p.name_fa || p.key) +
        (p.instance > 1 || true ? ' ' + faNum(p.instance) : '');
      var dims = fmtLen(p.w_mm, unit) + '×' + fmtLen(p.h_mm, unit) + (p.rotated ? ' ↻' : '');
      if (w > 60 && h > 30) {
        out.push('<text x="' + (x + w / 2) + '" y="' + (y + h / 2 - 4) +
          '" text-anchor="middle" font-size="12" font-weight="bold">' + esc(label) + '</text>');
        out.push('<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + 12) +
          '" text-anchor="middle" font-size="11" fill="#333">' + dims + '</text>');
      } else if (w > 30 && h > 14) {
        out.push('<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + 4) +
          '" text-anchor="middle" font-size="9">' + dims + '</text>');
      }
    });

    // علامت نوار/شیار/فارسی‌بر روی هر قطعه — کدِ حرفی که کاربر در تنظیمات تعیین کرده،
    // کنار همان ضلع نوشته می‌شود (نه رنگ، نه خط — امن برای چاپ سیاه‌وسفید و مستقیماً
    // خواندنی برای کارگر). قرارداد جهت (همتراز kalaxa-report): front/back راستای طول،
    // top/bottom راستای عرض؛ rotated=true یعنی محور طول عمودی شده، نگاشت اضلاع عوض می‌شود.
    var roleOf = typeof opts.role_of === 'function' ? opts.role_of : defaultRole;
    var showEdges = opts.show_edges !== false;
    var showGrooves = opts.show_grooves !== false;
    var marks = opts.marks || DEFAULT_MARKS_FALLBACK;
    var usedMarks = {}; // mkey → true، برای راهنمای پای صفحه

    (layout.placements || []).forEach(function (p) {
      var x = X(p.x_mm), y = Y(p.y_mm, p.h_mm);
      var w = p.w_mm * scale, h = p.h_mm * scale;
      // نقطهٔ وسط هر ضلع برای چسباندن برچسب کد، با آفست کوچک رو به داخل قطعه
      var MID = {
        topH:    { x: x + w / 2, y: y,     dy: 11 },
        bottomH: { x: x + w / 2, y: y + h, dy: -4 },
        leftV:   { x: x,        y: y + h / 2, dx: 3 },
        rightV:  { x: x + w,    y: y + h / 2, dx: -8 }
      };
      var map = p.rotated
        ? { front: 'leftV', back: 'rightV', top: 'topH', bottom: 'bottomH' }
        : { front: 'bottomH', back: 'topH', top: 'rightV', bottom: 'leftV' };

      function putCode(mkey, sideKey, angleDeg) {
        var mk = marks[mkey] || DEFAULT_MARKS_FALLBACK[mkey];
        var m = MID[sideKey];
        var tx = m.x + (m.dx || 0), ty = m.y + (m.dy || 0);
        // زاویهٔ عددی (کج‌بری) کنار کد نوشته می‌شود — بدون آن، کارگر نمی‌داند چند درجه (ADR-0001)
        var label = mk.code + (typeof angleDeg === 'number' && angleDeg > 0 ? faNum(angleDeg) + '°' : '');
        out.push('<text x="' + tx + '" y="' + ty + '" text-anchor="middle" font-size="10" ' +
          'font-weight="bold" fill="#111">' + esc(label) + '</text>');
        usedMarks[mkey] = true;
      }

      if (showEdges && p.edge) {
        var bandKey = roleOf(p.key) === 'door' ? 'band_door' : 'band_body';
        ['front', 'back', 'top', 'bottom'].forEach(function (name) {
          if (!p.edge[name]) return;
          putCode(bandKey, map[name]);
        });
      }
      if (showGrooves && p.groove) {
        ['front', 'back', 'top', 'bottom'].forEach(function (name) {
          if (!p.groove[name]) return;
          putCode('groove', map[name]);
        });
      }
      if (showEdges && p.miter) {
        ['front', 'back', 'top', 'bottom'].forEach(function (name) {
          if (!p.miter[name]) return;
          putCode('miter', map[name]);
        });
      }
      if (showEdges && p.bevel) {
        // قرارداد مقدار (ADR-0001): true یا هر عدد صفر/بی‌معنا فقط پرچم است (زاویه نامشخص)؛
        // عدد مثبت واقعی = درجهٔ کج‌بری و کنار کد نوشته می‌شود. bevel:1 هم به‌قصد «فقط پرچم»
        // خوانده می‌شود (هم‌تراز edge/groove/miter که ۱ را «هست» معنا می‌کنند)، نه ۱ درجه.
        ['front', 'back', 'top', 'bottom'].forEach(function (name) {
          if (!p.bevel[name]) return;
          var v = p.bevel[name];
          var ang = (typeof v === 'number' && v > 1) ? v : null;
          putCode('bevel', map[name], ang);
        });
      }
    });

    // توالی برش (خط‌چین قرمز + شماره)
    if (opts.show_cuts) {
      (layout.cuts || []).forEach(function (c) {
        var x1, y1, x2, y2;
        if (c.axis === 'x') {
          x1 = x2 = X(c.position_mm);
          y1 = Y(c.from_mm, 0); y2 = Y(c.to_mm, 0);
        } else {
          y1 = y2 = Y(c.position_mm, 0);
          x1 = X(c.from_mm); x2 = X(c.to_mm);
        }
        out.push('<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
          '" stroke="#d33" stroke-width="1" stroke-dasharray="4,3" opacity="0.8"/>');
        out.push('<circle cx="' + x1 + '" cy="' + y1 + '" r="9" fill="#d33"/>' +
          '<text x="' + x1 + '" y="' + (y1 + 4) +
          '" text-anchor="middle" font-size="10" fill="#fff">' + faNum(c.seq) + '</text>');
      });
    }

    // پانویس ابعاد ورق
    out.push('<text x="' + (ox + W / 2) + '" y="' + (oy + H + 24) +
      '" text-anchor="middle" font-size="13">' +
      fmtLen(sheet.width_mm, unit) + ' × ' + fmtLen(sheet.height_mm, unit) + ' ' + unitLabel(unit) +
      ' — کرف ' + faNum(4) + ' میلی‌متر</text>');

    // راهنمای علائم — «کد = معنی» برای هر نوع کاری که واقعاً روی این ورق آمده
    var usedList = MARK_ORDER.filter(function (k) { return usedMarks[k]; });
    if (usedList.length) {
      var band = opts.edge_band || {};
      var noteOf = function (side) {
        var b = band[side] || {};
        var bits = [];
        if (b.thickness_mm) bits.push(faNum(b.thickness_mm) + 'م');
        if (b.note) bits.push(b.note);
        return bits.length ? ' (' + esc(bits.join('، ')) + ')' : '';
      };
      var lx = ox, ly = oy + H + 40;
      usedList.forEach(function (mkey) {
        var mk = marks[mkey] || DEFAULT_MARKS_FALLBACK[mkey];
        var extra = mkey === 'band_body' ? noteOf('body') : mkey === 'band_door' ? noteOf('door') : '';
        var label = esc(mk.code) + ' = ' + esc(mk.label_fa) + extra;
        out.push('<text x="' + lx + '" y="' + (ly + 4) + '" font-size="12" font-weight="bold" ' +
          'fill="#111">' + label + '</text>');
        lx += 24 + label.length * 7;
      });
    }

    // ---- خطوط برش گیلوتینی، با شمارهٔ ترتیب ----
    //
    // جدولِ دستور برش به‌تنهایی کافی نیست: اپراتور کنار دستگاه نمی‌تواند عدد
    // را با نقشه تطبیق بدهد. خط روی همان تصویری که جلویش است باید دیده شود.
    //
    // مرحلهٔ اول پررنگ‌تر است — همان برش‌های سراسری که کل ورق را تکه می‌کنند.
    if (opts.cuts && opts.cuts.length) {
      out.push('<g id="cuts' + layout.sheet_index + '">');
      opts.cuts.forEach(function (c) {
        var strong = c.stage === 1;
        var w = strong ? 2.2 : 1.2;
        var col = strong ? '#c0392b' : '#e07b39';
        var x1, y1, x2, y2;
        if (c.axis === 'x') {
          x1 = x2 = X(c.pos_mm);
          y1 = Y(c.from_mm, 0);
          y2 = Y(c.to_mm, 0);
        } else {
          y1 = y2 = Y(c.pos_mm, 0);
          x1 = X(c.from_mm);
          x2 = X(c.to_mm);
        }
        out.push('<path d="M' + x1.toFixed(1) + ' ' + y1.toFixed(1) +
          ' L' + x2.toFixed(1) + ' ' + y2.toFixed(1) + '" stroke="' + col +
          '" stroke-width="' + w + '" stroke-dasharray="' +
          (strong ? '10,5' : '5,4') + '" fill="none"/>');
        // شماره روی وسط خط
        var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        out.push('<circle cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) +
          '" r="9" fill="#fff" stroke="' + col + '" stroke-width="1.2"/>');
        out.push('<text x="' + mx.toFixed(1) + '" y="' + (my + 4).toFixed(1) +
          '" font-size="11" font-weight="bold" text-anchor="middle" fill="' + col +
          '">' + faNum(c.n) + '</text>');
      });
      out.push('</g>');
    }

    out.push('</svg>');
    return out.join('\n');
  }

  /**
   * رندر همه ورق‌های یک نتیجه nesting.
   * @returns {Array<{sheet_id, sheet_index, svg}>}
   */
  function renderAll(nestingResult, sheets, opts) {
    var sheetMap = {};
    (sheets || []).forEach(function (s) { sheetMap[s.sheet_id] = s; });
    var out = [];
    (nestingResult.by_sheet_type || []).forEach(function (g) {
      var sheet = sheetMap[g.sheet_id];
      if (!sheet) return;
      g.layouts.forEach(function (l) {
        // ترتیب برش از بیرون تزریق می‌شود، نه اینکه این ماژول ماژول دیگری را
        // بشناسد: نقشه‌کش نباید بداند درخت برش چطور ساخته می‌شود.
        var o = opts;
        if (opts && typeof opts.cuts_for === 'function') {
          var seq = opts.cuts_for(l, sheet) || {};
          o = Object.assign({}, opts, { cuts: seq.ok ? seq.cuts : [] });
        }
        out.push({
          sheet_id: g.sheet_id,
          sheet_index: l.sheet_index,
          svg: renderSheet(l, sheet, o)
        });
      });
    });
    return out;
  }

  return { VERSION: VERSION, renderSheet: renderSheet, renderAll: renderAll,
           DEFAULT_MARKS_FALLBACK: DEFAULT_MARKS_FALLBACK };
}));
