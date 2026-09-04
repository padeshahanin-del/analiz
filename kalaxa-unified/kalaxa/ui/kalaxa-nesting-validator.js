/**
 * kalaxa-nesting-validator.js — v1.0.0
 * اعتبارسنج مستقل خروجی nesting — هیچ کدی با موتور چیدمان مشترک نیست.
 * اگر این اعتبارسنج رد کند، نتیجه نباید نهایی یا قابل چاپ معرفی شود.
 *
 * بررسی‌ها:
 *   ۱. عدم هم‌پوشانی و عدم خروج از محدوده (با احتساب trim)
 *   ۲. فاصله kerf بین هر جفت قطعه
 *   ۳. شمارش قطعات: هیچ نمونه معتبری گم یا تکراری نباشد
 *   ۴. مشروعیت چرخش نسبت به grain و allow_rotation + سازگاری ابعاد
 *   ۵. آفکات‌ها داخل محدوده و بدون هم‌پوشانی با قطعات
 *   ۶. بازمحاسبه مستقل بازدهی و تطابق با آمار گزارش‌شده
 *   ۷. امکان‌پذیری واقعی گیوتینی: جست‌وجوی بازگشتی خط برش سراسری
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaNestingValidator = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var EPS = 0.01;

  function overlap1D(a1, a2, b1, b2) {
    return Math.min(a2, b2) - Math.max(a1, b1) > EPS;
  }
  function rectsOverlap(a, b) {
    return overlap1D(a.x_mm, a.x_mm + a.w_mm, b.x_mm, b.x_mm + b.w_mm) &&
           overlap1D(a.y_mm, a.y_mm + a.h_mm, b.y_mm, b.y_mm + b.h_mm);
  }

  /** فاصله جداکننده دو مستطیل در محور جداکننده (اگر جدا باشند) */
  function separation(a, b) {
    var gx = Math.max(b.x_mm - (a.x_mm + a.w_mm), a.x_mm - (b.x_mm + b.w_mm));
    var gy = Math.max(b.y_mm - (a.y_mm + a.h_mm), a.y_mm - (b.y_mm + b.h_mm));
    return Math.max(gx, gy);
  }

  /**
   * امکان‌پذیری گیوتینی: آیا مجموعه قطعات با برش‌های سراسری قابل تفکیک است؟
   * بازگشتی: خطی (x یا y) پیدا کن که از داخل هیچ قطعه‌ای عبور نکند و
   * مجموعه را به دو گروه ناتهی تقسیم کند؛ روی هر گروه تکرار کن.
   */
  function guillotineFeasible(rects) {
    if (rects.length <= 1) return true;

    var xs = [], ys = [];
    rects.forEach(function (r) {
      xs.push(r.x_mm + r.w_mm);
      ys.push(r.y_mm + r.h_mm);
    });

    function trySplit(coords, axis) {
      for (var i = 0; i < coords.length; i++) {
        var c = coords[i];
        var left = [], right = [];
        var cuts = true;
        for (var j = 0; j < rects.length; j++) {
          var r = rects[j];
          var lo = axis === 'x' ? r.x_mm : r.y_mm;
          var hi = lo + (axis === 'x' ? r.w_mm : r.h_mm);
          if (hi <= c + EPS) left.push(r);
          else if (lo >= c - EPS) right.push(r);
          else { cuts = false; break; } // خط از داخل قطعه می‌گذرد
        }
        if (cuts && left.length && right.length) {
          return guillotineFeasible(left) && guillotineFeasible(right);
        }
      }
      return null;
    }

    var rx = trySplit(xs, 'x');
    if (rx === true) return true;
    var ry = trySplit(ys, 'y');
    if (ry === true) return true;
    return false;
  }

  function checkLayout(layout, ctx, problems) {
    var tag = ctx.sheet_id +
      (layout.source === 'offcut' ? '/آفکات ' + (layout.offcut_id || '') : '/ورق ' + layout.sheet_index);
    var ps = layout.placements || [];
    var trim = ctx.trim;
    var maxX = ctx.w - trim, maxY = ctx.h - trim;

    // ۱+۲: محدوده، هم‌پوشانی، kerf
    ps.forEach(function (p, i) {
      if (p.x_mm < trim - EPS || p.y_mm < trim - EPS ||
          p.x_mm + p.w_mm > maxX + EPS || p.y_mm + p.h_mm > maxY + EPS) {
        problems.push('[' + tag + '] ' + p.part_uid + '#' + p.instance + ' خارج از محدوده مفید');
      }
      for (var j = i + 1; j < ps.length; j++) {
        var q = ps[j];
        if (rectsOverlap(p, q)) {
          problems.push('[' + tag + '] هم‌پوشانی ' + p.part_uid + '#' + p.instance +
            ' با ' + q.part_uid + '#' + q.instance);
        } else if (separation(p, q) < ctx.kerf - EPS) {
          problems.push('[' + tag + '] فاصله ' + p.part_uid + '#' + p.instance + ' تا ' +
            q.part_uid + '#' + q.instance + ' کمتر از kerf (' +
            separation(p, q).toFixed(1) + ' < ' + ctx.kerf + ')');
        }
      }
    });

    // ۴: مشروعیت چرخش و سازگاری ابعاد
    ps.forEach(function (p) {
      var part = ctx.partMap[p.part_uid];
      if (!part) { problems.push('[' + tag + '] قطعه ناشناخته ' + p.part_uid); return; }
      var L = part.cut_length_mm, W = part.cut_width_mm;
      var dimsOk = (!p.rotated && p.w_mm === L && p.h_mm === W) ||
                   (p.rotated && p.w_mm === W && p.h_mm === L);
      if (!dimsOk) {
        problems.push('[' + tag + '] ابعاد ' + p.part_uid + ' با پرچم rotated ناسازگار');
      }
      if (p.rotated) {
        var grain = part.grain || 'none';
        if (ctx.has_grain && grain === 'length') {
          problems.push('[' + tag + '] ' + p.part_uid + ' چرخیده ولی راه چوب length چرخش را ممنوع می‌کند');
        }
        if (grain === 'none' && part.allow_rotation === false) {
          problems.push('[' + tag + '] ' + p.part_uid + ' چرخیده ولی allow_rotation=false');
        }
      }
    });

    // ۵: آفکات‌ها
    (layout.offcuts || []).forEach(function (o, k) {
      if (o.x_mm < trim - EPS || o.y_mm < trim - EPS ||
          o.x_mm + o.w_mm > maxX + ctx.kerf + EPS || o.y_mm + o.h_mm > maxY + ctx.kerf + EPS) {
        problems.push('[' + tag + '] آفکات #' + (k + 1) + ' خارج از محدوده');
      }
      ps.forEach(function (p) {
        if (rectsOverlap({ x_mm: o.x_mm, y_mm: o.y_mm, w_mm: o.w_mm, h_mm: o.h_mm }, p)) {
          problems.push('[' + tag + '] آفکات #' + (k + 1) + ' با قطعه ' + p.part_uid + ' هم‌پوشان است');
        }
      });
    });

    // ۶: بازمحاسبه بازدهی
    var used = ps.reduce(function (s, p) { return s + p.w_mm * p.h_mm; }, 0);
    var binArea = (ctx.w - 2 * trim) * (ctx.h - 2 * trim);
    var util = binArea ? 100 * used / binArea : 0;
    if (Math.abs(util - layout.utilization_pct) > 0.1) {
      problems.push('[' + tag + '] بازدهی گزارش‌شده (' + layout.utilization_pct +
        '٪) با بازمحاسبه (' + util.toFixed(2) + '٪) نمی‌خواند');
    }

    // ۷: گیوتینی واقعی
    if (ps.length > 1 && !guillotineFeasible(ps)) {
      problems.push('[' + tag + '] چیدمان با برش‌های سراسری گیوتینی قابل تفکیک نیست');
    }
  }

  /**
   * @param {object} snapshot - همان ورودی nesting (v1 یا v2)
   * @param {object} result   - خروجی KalaxaNesting.run
   * @returns { ok, problems: [fa], stats: {expected, placed, unplaced} }
   */
  function validate(snapshot, result) {
    var problems = [];
    if (!result || !Array.isArray(result.by_sheet_type)) {
      return { ok: false, problems: ['نتیجه nesting نامعتبر است'], stats: null };
    }

    var partMap = {};
    (snapshot.parts_flat || []).forEach(function (p) { partMap[p.part_uid] = p; });
    var sheetMap = {};
    (snapshot.sheets || []).forEach(function (s) { sheetMap[s.sheet_id] = s; });
    var kerf = (snapshot.cutting || {}).kerf_mm || 0;

    // ۳: شمارش نمونه‌ها
    var expected = {};
    (snapshot.parts_flat || []).forEach(function (p) {
      for (var i = 1; i <= p.count; i++) expected[p.part_uid + '#' + i] = true;
    });
    var expectedCount = Object.keys(expected).length;

    var seen = {};
    var placedCount = 0;

    result.by_sheet_type.forEach(function (g) {
      var sheet = sheetMap[g.sheet_id];
      if (!sheet) { problems.push('گروه با ورق ناشناخته ' + g.sheet_id); return; }

      (g.layouts || []).forEach(function (l) {
        checkLayout(l, {
          sheet_id: g.sheet_id, w: sheet.width_mm, h: sheet.height_mm,
          trim: sheet.trim_margin_mm || 0, kerf: kerf,
          has_grain: !!sheet.has_grain, partMap: partMap
        }, problems);
        (l.placements || []).forEach(function (p) { tally(p); });
      });
      (g.stock_layouts || []).forEach(function (l) {
        checkLayout(l, {
          sheet_id: g.sheet_id, w: l.bin_w_mm, h: l.bin_h_mm,
          trim: 0, kerf: kerf,
          has_grain: !!sheet.has_grain, partMap: partMap
        }, problems);
        (l.placements || []).forEach(function (p) { tally(p); });
      });
    });

    function tally(p) {
      var key = p.part_uid + '#' + p.instance;
      placedCount++;
      if (!expected[key]) problems.push('نمونه ناشناخته یا خارج از count: ' + key);
      else if (seen[key]) problems.push('نمونه تکراری: ' + key);
      seen[key] = true;
    }

    var unplacedKeys = (result.unplaced || []).map(function (u) {
      return u.part_uid + '#' + u.instance;
    });
    Object.keys(expected).forEach(function (key) {
      if (!seen[key] && unplacedKeys.indexOf(key) === -1) {
        problems.push('نمونه گم‌شده (نه جای‌گذاری، نه اعلام unplaced): ' + key);
      }
    });

    return {
      version: VERSION,
      ok: problems.length === 0,
      problems: problems,
      stats: {
        expected_instances: expectedCount,
        placed_instances: placedCount,
        unplaced_instances: unplacedKeys.length
      }
    };
  }

  return { VERSION: VERSION, validate: validate, _internal: { guillotineFeasible: guillotineFeasible } };
}));
