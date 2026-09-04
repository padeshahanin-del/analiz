/**
 * kalaxa-nesting.js — v1.0.0
 * موتور بهینه‌سازی برش دوبعدی (nesting) برای پلاگین آنالیز کالاکسا
 *
 * - JS خالص، بدون وابستگی، بدون DOM، بدون fetch — الگوی UMD
 * - ورودی: kitchen_snapshot.json (schema_version: 1) — همه ابعاد mm
 * - الگوریتم: Guillotine packer (خروجی همیشه guillotine-verifiable)
 *   با اجرای هم‌زمان ۶ ترکیب استراتژی (۳ ترتیب مرتب‌سازی × ۲ هیوریستیک جای‌گذاری)
 *   و انتخاب بهترین نتیجه به‌ازای هر نوع ورق.
 * - kerf با ترفند استاندارد inflate اعمال می‌شود: هر قطعه (w+kerf, h+kerf)
 *   در ورق مؤثر (W_usable+kerf, H_usable+kerf) چیده می‌شود.
 * - قرارداد محور: x در راستای width_mm ورق، y در راستای height_mm ورق.
 *   راه چوب (grain) ورق در راستای width_mm (بُعد بلند) فرض می‌شود.
 *   قطعه با grain="length" باید cut_length_mm آن هم‌راستای x باشد.
 *   قطعه با grain="width" باید cut_length_mm هم‌راستای y باشد.
 *
 * مصرف‌کننده‌ها: HtmlDialog پلاگین اسکچاپ، اسکریپت Node، پلاگین وردپرسی kalaxa
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaNesting = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.2.0';
  var SUPPORTED_SCHEMA = [1, 2];

  /* ---------------------------------------------------------------- utils */

  function isPosInt(n) { return typeof n === 'number' && isFinite(n) && n > 0; }

  function deepFreezeResultNumbers(x) { return x; } // hook for future

  /* --------------------------------------------------------- orientations */

  /**
   * جهت‌های مجاز یک قطعه روی یک ورق مشخص.
   * خروجی: آرایه‌ای از {w, h, rotated}
   *   w,h = ابعاد قطعه در دستگاه مختصات ورق (w هم‌راستای x)
   *   rotated=false یعنی cut_length_mm هم‌راستای x
   */
  function allowedOrientations(part, sheet, allowRotationDefault) {
    var L = part.cut_length_mm, W = part.cut_width_mm;
    var grain = part.grain || 'none';
    var allowRot = (typeof part.allow_rotation === 'boolean')
      ? part.allow_rotation : allowRotationDefault;

    if (sheet.has_grain && grain !== 'none') {
      // راه چوب حاکم است؛ allow_rotation نادیده گرفته می‌شود
      if (grain === 'length') return [{ w: L, h: W, rotated: false }];
      if (grain === 'width')  return [{ w: W, h: L, rotated: true }];
    }
    if (!allowRot) return [{ w: L, h: W, rotated: false }];
    if (L === W)   return [{ w: L, h: W, rotated: false }];
    return [
      { w: L, h: W, rotated: false },
      { w: W, h: L, rotated: true }
    ];
  }

  /* ------------------------------------------------------------ heuristics */

  // امتیاز کمتر = بهتر
  var HEURISTICS = {
    // Best Area Fit: کمترین مساحت باقیمانده در free rect
    baf: function (fr, w, h) {
      return (fr.w * fr.h) - (w * h);
    },
    // Best Short Side Fit: کمترین کسری کوتاه‌ترین ضلع باقیمانده
    bssf: function (fr, w, h) {
      var dw = fr.w - w, dh = fr.h - h;
      return Math.min(dw, dh) * 100000 + Math.max(dw, dh);
    }
  };

  var SORTS = {
    area_desc: function (a, b) {
      return (b.w * b.h) - (a.w * a.h);
    },
    long_side_desc: function (a, b) {
      return Math.max(b.w, b.h) - Math.max(a.w, a.h);
    },
    short_side_desc: function (a, b) {
      return Math.min(b.w, b.h) - Math.min(a.w, a.h);
    }
  };

  var STRATEGIES = [];
  Object.keys(SORTS).forEach(function (s) {
    Object.keys(HEURISTICS).forEach(function (h) {
      STRATEGIES.push({ sort: s, heuristic: h, id: s + '+' + h });
    });
  });

  /* --------------------------------------------------------- guillotine bin */

  function newBin(capW, capH, meta) {
    return {
      meta: meta || { is_stock: false, trim: 0 },
      freeRects: [{ x: 0, y: 0, w: capW, h: capH }],
      placements: [],
      cuts: []
    };
  }

  /**
   * جای‌گذاری قطعه در free rect و تقسیم گیوتینی فضا.
   * تقسیم با قاعده Split-Longer-Leftover-Axis:
   * برش در راستایی انجام می‌شود که باقیمانده بزرگ‌تر یکپارچه بماند
   * (آفکات بزرگ‌تر و قابل‌استفاده‌تر).
   */
  function placeAndSplit(bin, frIndex, w, h) {
    var fr = bin.freeRects[frIndex];
    bin.freeRects.splice(frIndex, 1);

    var placement = { x: fr.x, y: fr.y, w: w, h: h };
    bin.placements.push(placement);

    var leftoverW = fr.w - w; // فضای سمت راست
    var leftoverH = fr.h - h; // فضای بالا

    // دو برش گیوتینی محلی: عمودی در x+w و افقی در y+h
    // ترتیب تقسیم تعیین می‌کند کدام باقیمانده full-length می‌ماند
    if (leftoverW >= leftoverH) {
      // برش عمودی اول: باقیمانده راست تمام‌ارتفاع
      if (leftoverW > 0) {
        bin.freeRects.push({ x: fr.x + w, y: fr.y, w: leftoverW, h: fr.h });
        bin.cuts.push({ axis: 'x', pos: fr.x + w, from: fr.y, to: fr.y + fr.h });
      }
      if (leftoverH > 0) {
        bin.freeRects.push({ x: fr.x, y: fr.y + h, w: w, h: leftoverH });
        bin.cuts.push({ axis: 'y', pos: fr.y + h, from: fr.x, to: fr.x + w });
      }
    } else {
      // برش افقی اول: باقیمانده بالا تمام‌عرض
      if (leftoverH > 0) {
        bin.freeRects.push({ x: fr.x, y: fr.y + h, w: fr.w, h: leftoverH });
        bin.cuts.push({ axis: 'y', pos: fr.y + h, from: fr.x, to: fr.x + fr.w });
      }
      if (leftoverW > 0) {
        bin.freeRects.push({ x: fr.x + w, y: fr.y, w: leftoverW, h: h });
        bin.cuts.push({ axis: 'x', pos: fr.x + w, from: fr.y, to: fr.y + h });
      }
    }
    return placement;
  }

  /* ------------------------------------------------------------- packGroup */

  /**
   * چیدن یک گروه قطعات (همه با sheet_id یکسان) با یک استراتژی مشخص.
   * items: قطعات بازشده (count → رکوردهای تکی) با ارجاع part
   */
  function packGroup(items, sheet, cutting, strategy, stockOffcuts) {
    var kerf = cutting.kerf_mm || 0;
    var trim = sheet.trim_margin_mm || 0;
    var usableW = sheet.width_mm - 2 * trim;
    var usableH = sheet.height_mm - 2 * trim;
    // ترفند kerf: ظرفیت مؤثر + kerf، ابعاد هر قطعه + kerf
    var capW = usableW + kerf;
    var capH = usableH + kerf;

    var errors = [];
    var unplaced = [];

    // مرتب‌سازی بر اساس بزرگ‌ترین جهت مجاز
    var sortable = items.map(function (it) {
      var ors = allowedOrientations(it.part, sheet, cutting.allow_rotation_default !== false);
      var primary = ors[0];
      return { item: it, ors: ors, w: primary.w, h: primary.h };
    });
    var primaryCmp = SORTS[strategy.sort];
    sortable.sort(function (a, b) {
      var d = primaryCmp(a, b);
      if (d !== 0) return d;
      // tiebreaker قطعی — خروجی مستقل از پیاده‌سازی sort موتور JS
      var ka = a.item.part.part_uid + '#' + a.item.instance;
      var kb = b.item.part.part_uid + '#' + b.item.instance;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

    var bins = [];
    // انبار آفکات: قطعات اول در باقیمانده‌های موجود کارگاه چیده می‌شوند
    (stockOffcuts || []).forEach(function (o) {
      if (!isPosInt(o.width_mm) || !isPosInt(o.height_mm)) return;
      bins.push(newBin(o.width_mm + kerf, o.height_mm + kerf, {
        is_stock: true, offcut_id: o.offcut_id || '', trim: 0,
        real_w: o.width_mm, real_h: o.height_mm
      }));
    });
    var heur = HEURISTICS[strategy.heuristic];

    sortable.forEach(function (rec) {
      var it = rec.item;
      var ors = rec.ors;

      // امکان‌سنجی روی ورق خام
      var fitsSomewhere = ors.some(function (o) {
        return (o.w + kerf) <= capW && (o.h + kerf) <= capH;
      });
      if (!fitsSomewhere) {
        unplaced.push({
          part_uid: it.part.part_uid,
          instance: it.instance,
          reason: 'oversize',
          message_fa: 'قطعه «' + (it.part.name_fa || it.part.key) + '» (' +
            it.part.cut_length_mm + '×' + it.part.cut_width_mm +
            ') در ورق ' + sheet.sheet_id + ' جا نمی‌شود' +
            (ors.length === 1 && (it.part.grain !== 'none' || it.part.allow_rotation === false)
              ? ' — چرخش به‌دلیل راه چوب/محدودیت مجاز نیست' : '')
        });
        return;
      }

      // بهترین (bin, freeRect, orientation)
      var best = null;
      bins.forEach(function (bin, bi) {
        bin.freeRects.forEach(function (fr, fi) {
          ors.forEach(function (o) {
            var w = o.w + kerf, h = o.h + kerf;
            if (w <= fr.w && h <= fr.h) {
              var score = heur(fr, w, h);
              if (!best || score < best.score) {
                best = { bi: bi, fi: fi, o: o, score: score };
              }
            }
          });
        });
      });

      if (!best) {
        // ورق جدید
        var bin = newBin(capW, capH, { is_stock: false, trim: trim });
        bins.push(bin);
        var bi = bins.length - 1;
        // در ورق جدید، اولین جهتی که جا می‌شود با کمترین امتیاز
        var fr0 = bin.freeRects[0];
        ors.forEach(function (o) {
          var w = o.w + kerf, h = o.h + kerf;
          if (w <= fr0.w && h <= fr0.h) {
            var score = heur(fr0, w, h);
            if (!best || score < best.score) best = { bi: bi, fi: 0, o: o, score: score };
          }
        });
      }

      var target = bins[best.bi];
      var btrim = target.meta.trim || 0;
      var p = placeAndSplit(target, best.fi, best.o.w + kerf, best.o.h + kerf);
      target.placements[target.placements.length - 1] = {
        part_uid: it.part.part_uid,
        cabinet_id: it.part.cabinet_id,
        key: it.part.key,
        name_fa: it.part.name_fa,
        instance: it.instance,
        // مختصات نهایی روی ورق واقعی (با احتساب trim)، بدون kerf
        x_mm: p.x + btrim,
        y_mm: p.y + btrim,
        w_mm: best.o.w,
        h_mm: best.o.h,
        rotated: best.o.rotated,
        // نوار لبه و شیار برای علامت‌گذاری در نقشه برش (عبوری از قطعه — بی‌اثر بر چیدمان)
        edge: it.part.edge || null,
        groove: it.part.groove || null
      };
    });

    // آفکات‌های قابل‌استفاده
    var minOff = cutting.min_offcut_mm || 100;

    function binToLayout(bin, index) {
      var btrim = bin.meta.trim || 0;
      var binW = bin.meta.is_stock ? bin.meta.real_w : usableW;
      var binH = bin.meta.is_stock ? bin.meta.real_h : usableH;

      var offcuts = bin.freeRects
        .map(function (fr) {
          // حذف kerf مجازی از ابعاد آفکات
          return {
            x_mm: fr.x + btrim,
            y_mm: fr.y + btrim,
            w_mm: Math.max(0, fr.w - kerf),
            h_mm: Math.max(0, fr.h - kerf)
          };
        })
        .filter(function (o) { return o.w_mm >= minOff && o.h_mm >= minOff; })
        .sort(function (a, b) { return (b.w_mm * b.h_mm) - (a.w_mm * a.h_mm); });

      var cuts = bin.cuts.map(function (c, i) {
        return {
          seq: i + 1,
          axis: c.axis, // 'x' = برش عمودی (موازی height)، 'y' = برش افقی
          position_mm: c.pos + btrim,
          from_mm: c.from + btrim,
          to_mm: c.to + btrim
        };
      });

      var usedArea = bin.placements.reduce(function (s, p) { return s + p.w_mm * p.h_mm; }, 0);
      return {
        sheet_index: index,
        source: bin.meta.is_stock ? 'offcut' : 'new_sheet',
        offcut_id: bin.meta.is_stock ? bin.meta.offcut_id : undefined,
        bin_w_mm: binW,
        bin_h_mm: binH,
        placements: bin.placements,
        cuts: cuts,
        offcuts: offcuts,
        used_area_mm2: usedArea,
        utilization_pct: round2(100 * usedArea / (binW * binH))
      };
    }

    var newBins = bins.filter(function (b) { return !b.meta.is_stock; });
    var stockBinsUsed = bins.filter(function (b) { return b.meta.is_stock && b.placements.length; });

    var layouts = newBins.map(function (b, i) { return binToLayout(b, i + 1); });
    var stockLayouts = stockBinsUsed.map(function (b, i) { return binToLayout(b, i + 1); });

    var totalPartArea = layouts.reduce(function (s, l) { return s + l.used_area_mm2; }, 0);
    var totalSheetArea = layouts.length * usableW * usableH;
    var stockPartArea = stockLayouts.reduce(function (s, l) { return s + l.used_area_mm2; }, 0);

    return {
      strategy: strategy.id,
      sheets_used: layouts.length,          // فقط ورق‌های نو
      layouts: layouts,
      stock_layouts: stockLayouts,          // چیدمان روی آفکات انبار
      stock_offcuts_used: stockLayouts.length,
      stock_area_used_mm2: stockPartArea,
      unplaced: unplaced,
      errors: errors,
      utilization_pct: totalSheetArea ? round2(100 * totalPartArea / totalSheetArea) : 0,
      waste_pct: totalSheetArea ? round2(100 - 100 * totalPartArea / totalSheetArea) : 0,
      largest_offcut_mm2: layouts.reduce(function (m, l) {
        return l.offcuts.length ? Math.max(m, l.offcuts[0].w_mm * l.offcuts[0].h_mm) : m;
      }, 0)
    };
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  /* ------------------------------------------------------------- validation */

  function validate(snapshot) {
    var errors = [];
    if (!snapshot || typeof snapshot !== 'object') {
      return ['ورودی snapshot نامعتبر است'];
    }
    if (SUPPORTED_SCHEMA.indexOf(snapshot.schema_version) === -1) {
      errors.push('schema_version پشتیبانی‌نشده: ' + snapshot.schema_version +
        ' (نسخه‌های پشتیبانی‌شده: ' + SUPPORTED_SCHEMA.join('، ') + ')');
    }
    if (!Array.isArray(snapshot.sheets) || snapshot.sheets.length === 0) {
      errors.push('هیچ ورقی (sheets) تعریف نشده است');
    }
    if (!Array.isArray(snapshot.parts_flat)) {
      errors.push('parts_flat موجود نیست');
    }
    var sheetIds = {};
    (snapshot.sheets || []).forEach(function (s) {
      if (!s.sheet_id) { errors.push('ورق بدون sheet_id'); return; }
      sheetIds[s.sheet_id] = true;
      if (!isPosInt(s.width_mm) || !isPosInt(s.height_mm)) {
        errors.push('ابعاد ورق ' + s.sheet_id + ' نامعتبر است');
      }
    });
    (snapshot.parts_flat || []).forEach(function (p) {
      if (!isPosInt(p.cut_length_mm) || !isPosInt(p.cut_width_mm)) {
        errors.push('ابعاد قطعه ' + (p.part_uid || p.key) + ' نامعتبر است (باید عدد مثبت باشد)');
      }
      if (!isPosInt(p.count)) {
        errors.push('count قطعه ' + (p.part_uid || p.key) + ' نامعتبر است');
      }
      if (!sheetIds[p.sheet_id]) {
        errors.push('قطعه ' + (p.part_uid || p.key) + ' به ورق ناموجود «' + p.sheet_id + '» ارجاع می‌دهد');
      }
    });
    return errors;
  }

  /* -------------------------------------------------- guillotine verification */

  /**
   * بررسی صحت هندسی چیدمان: عدم هم‌پوشانی و ماندن در محدوده ورق.
   * (تولید با الگوریتم گیوتینی، پس guillotine بودن ساختاری تضمین است؛
   *  این تابع invariant های عددی را چک می‌کند.)
   */
  function verifyLayout(layout, sheet, kerf) {
    var problems = [];
    var trim = sheet.trim_margin_mm || 0;
    var ps = layout.placements;
    for (var i = 0; i < ps.length; i++) {
      var a = ps[i];
      if (a.x_mm < trim - 0.001 || a.y_mm < trim - 0.001 ||
          a.x_mm + a.w_mm > sheet.width_mm - trim + kerf + 0.001 ||
          a.y_mm + a.h_mm > sheet.height_mm - trim + kerf + 0.001) {
        problems.push('قطعه ' + a.part_uid + ' خارج از محدوده ورق');
      }
      for (var j = i + 1; j < ps.length; j++) {
        var b = ps[j];
        if (a.x_mm < b.x_mm + b.w_mm && b.x_mm < a.x_mm + a.w_mm &&
            a.y_mm < b.y_mm + b.h_mm && b.y_mm < a.y_mm + a.h_mm) {
          problems.push('هم‌پوشانی: ' + a.part_uid + '#' + a.instance + ' با ' + b.part_uid + '#' + b.instance);
        }
      }
    }
    return problems;
  }

  /* -------------------------------------------------------------------- run */

  /**
   * نقطه ورود اصلی.
   * @param {object} snapshot - kitchen_snapshot.json
   * @param {object} [options] - { strategies: ['area_desc+baf', ...] } برای محدودکردن
   * @returns {object} نتیجه کامل nesting
   */
  function run(snapshot, options) {
    options = options || {};
    var errors = validate(snapshot);
    if (errors.length) {
      return { ok: false, version: VERSION, errors: errors, by_sheet_type: [] };
    }

    var cutting = snapshot.cutting || { kerf_mm: 0, allow_rotation_default: true };
    var sheetMap = {};
    snapshot.sheets.forEach(function (s) { sheetMap[s.sheet_id] = s; });

    // گروه‌بندی بر اساس sheet_id + بازکردن count
    var groups = {};
    snapshot.parts_flat.forEach(function (p) {
      if (!groups[p.sheet_id]) groups[p.sheet_id] = [];
      for (var i = 1; i <= p.count; i++) {
        groups[p.sheet_id].push({ part: p, instance: i });
      }
    });

    var strategies = STRATEGIES;
    if (Array.isArray(options.strategies) && options.strategies.length) {
      strategies = STRATEGIES.filter(function (s) {
        return options.strategies.indexOf(s.id) !== -1;
      });
    }

    // انبار آفکات (اختیاری): snapshot.stock_offcuts = [{offcut_id, sheet_id, width_mm, height_mm}]
    var stockBySheet = {};
    (snapshot.stock_offcuts || []).forEach(function (o) {
      if (!stockBySheet[o.sheet_id]) stockBySheet[o.sheet_id] = [];
      stockBySheet[o.sheet_id].push(o);
    });

    var bySheetType = [];
    var globalWarnings = [];
    var globalUnplaced = [];

    Object.keys(groups).forEach(function (sheetId) {
      var sheet = sheetMap[sheetId];
      var items = groups[sheetId];
      var stock = stockBySheet[sheetId] || [];

      var best = null;
      var tried = [];
      strategies.forEach(function (strategy) {
        var r = packGroup(items, sheet, cutting, strategy, stock);
        tried.push({ strategy: r.strategy, sheets_used: r.sheets_used, utilization_pct: r.utilization_pct });
        if (!best ||
            r.sheets_used < best.sheets_used ||
            (r.sheets_used === best.sheets_used && r.stock_area_used_mm2 > best.stock_area_used_mm2) ||
            (r.sheets_used === best.sheets_used && r.stock_area_used_mm2 === best.stock_area_used_mm2 &&
             r.utilization_pct > best.utilization_pct) ||
            (r.sheets_used === best.sheets_used && r.stock_area_used_mm2 === best.stock_area_used_mm2 &&
             r.utilization_pct === best.utilization_pct &&
             r.largest_offcut_mm2 > best.largest_offcut_mm2)) {
          best = r;
        }
      });

      // راستی‌آزمایی: ورق‌های نو نسبت به ابعاد ورق، چیدمان آفکات نسبت به ابعاد خود آفکات
      var verifyProblems = [];
      best.layouts.forEach(function (l) {
        verifyProblems = verifyProblems.concat(verifyLayout(l, sheet, cutting.kerf_mm || 0));
      });
      (best.stock_layouts || []).forEach(function (l) {
        var pseudo = { width_mm: l.bin_w_mm, height_mm: l.bin_h_mm, trim_margin_mm: 0 };
        verifyProblems = verifyProblems.concat(verifyLayout(l, pseudo, cutting.kerf_mm || 0));
      });

      best.unplaced.forEach(function (u) { globalUnplaced.push(u); });

      bySheetType.push({
        sheet_id: sheetId,
        material: sheet.material,
        color_code: sheet.color_code,
        thickness_mm: sheet.thickness_mm,
        sheets_used: best.sheets_used,
        stock_offcuts_used: best.stock_offcuts_used || 0,
        stock_layouts: best.stock_layouts || [],
        strategy_used: best.strategy,
        strategies_tried: tried,
        utilization_pct: best.utilization_pct,
        waste_pct: best.waste_pct,
        layouts: best.layouts,
        unplaced: best.unplaced,
        verify_problems: verifyProblems,
        price_total: (sheet.price_per_sheet || 0) * best.sheets_used
      });

      if (verifyProblems.length) {
        globalWarnings.push('مشکل راستی‌آزمایی در ورق ' + sheetId + ': ' + verifyProblems.join('؛ '));
      }
    });

    var totalSheets = bySheetType.reduce(function (s, g) { return s + g.sheets_used; }, 0);
    var totalStockUsed = bySheetType.reduce(function (s, g) { return s + (g.stock_offcuts_used || 0); }, 0);

    return deepFreezeResultNumbers({
      ok: globalUnplaced.length === 0 && globalWarnings.length === 0,
      version: VERSION,
      schema_version: snapshot.schema_version,
      snapshot_id: snapshot.snapshot_id,
      errors: [],
      warnings: globalWarnings,
      unplaced: globalUnplaced,
      total_sheets: totalSheets,
      total_stock_offcuts_used: totalStockUsed,
      total_price: bySheetType.reduce(function (s, g) { return s + g.price_total; }, 0),
      by_sheet_type: bySheetType
    });
  }

  return {
    VERSION: VERSION,
    run: run,
    // برای تست
    _internal: {
      allowedOrientations: allowedOrientations,
      packGroup: packGroup,
      validate: validate,
      verifyLayout: verifyLayout,
      STRATEGIES: STRATEGIES
    }
  };
}));
