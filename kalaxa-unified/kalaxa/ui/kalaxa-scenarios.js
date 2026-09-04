/**
 * kalaxa-scenarios.js — v1.0.0
 * مقایسه‌گر سناریو پارامتریک: «اگر kerf عوض شود؟ اگر سایز ورق دیگری بخرم؟»
 * snapshot با patch عمیق تغییر می‌کند، nesting دوباره اجرا و نتایج مقایسه می‌شود.
 * JS خالص، UMD؛ به KalaxaNesting نیاز دارد (تزریق در compare).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaScenarios = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.1.0';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /**
   * اعمال patch روی snapshot کلون‌شده.
   * patch = {
   *   cutting: { kerf_mm, allow_rotation_default },        ← merge
   *   sheets:  { sheet_id: { width_mm, height_mm, ... } }, ← merge روی ورق موجود
   *   stock_offcuts: [...]                                 ← جایگزینی کامل
   * }
   */
  function applyPatch(snapshot, patch) {
    var s = clone(snapshot);
    patch = patch || {};
    if (patch.cutting) Object.assign(s.cutting = s.cutting || {}, patch.cutting);
    if (patch.sheets) {
      (s.sheets || []).forEach(function (sh) {
        if (patch.sheets[sh.sheet_id]) Object.assign(sh, patch.sheets[sh.sheet_id]);
      });
    }
    if (patch.stock_offcuts) s.stock_offcuts = clone(patch.stock_offcuts);
    return s;
  }

  /**
   * @param {object} snapshot
   * @param {Array} scenarios - [{label_fa, patch}] — سناریوی اول همیشه «وضع فعلی» اضافه می‌شود
   * @param {object} Nesting - ماژول KalaxaNesting
   * @param {object} [priceTable] - اختیاری برای ستون هزینه ورق
   * @returns {rows: [{label_fa, total_sheets, per_sheet, waste, unplaced, sheet_cost, delta_sheets}]}
   */
  function compare(snapshot, scenarios, Nesting, priceTable) {
    var all = [{ label_fa: 'وضع فعلی', patch: {} }].concat(scenarios || []);
    var sheetPrices = (priceTable || {}).sheets || {};

    var rows = all.map(function (sc) {
      var snap = applyPatch(snapshot, sc.patch);
      var r = Nesting.run(snap);

      var perSheet = {};
      var cost = 0;
      (r.by_sheet_type || []).forEach(function (g) {
        perSheet[g.sheet_id] = {
          sheets: g.sheets_used,
          utilization_pct: g.utilization_pct,
          stock_used: g.stock_offcuts_used || 0
        };
        var unit = sheetPrices[g.sheet_id] != null ? sheetPrices[g.sheet_id] : 0;
        cost += unit * g.sheets_used;
      });

      return {
        label_fa: sc.label_fa || '؟',
        ok: r.ok,
        total_sheets: r.total_sheets || 0,
        total_stock_offcuts_used: r.total_stock_offcuts_used || 0,
        unplaced_count: (r.unplaced || []).length,
        per_sheet: perSheet,
        sheet_cost: cost,
        errors: r.errors || []
      };
    });

    var base = rows[0];
    rows.forEach(function (row) {
      row.delta_sheets = row.total_sheets - base.total_sheets;
      row.delta_cost = row.sheet_cost - base.sheet_cost;
    });

    return { version: VERSION, rows: rows };
  }

  /** سناریوهای پیش‌فرض پیشنهادی */
  function defaultScenarios(snapshot) {
    var out = [
      { label_fa: 'kerf = ۳ میلی‌متر', patch: { cutting: { kerf_mm: 3 } } },
      { label_fa: 'kerf = ۵ میلی‌متر', patch: { cutting: { kerf_mm: 5 } } }
    ];
    // اگر ورق بدنه بزرگ است، سناریوی ورق کوچک‌تر
    var body = (snapshot.sheets || []).find(function (s) { return s.width_mm >= 3600; });
    if (body) {
      var p = {}; p[body.sheet_id] = { width_mm: 2800, height_mm: 2100 };
      out.push({ label_fa: (body.material || body.sheet_id) + ' → ورق ۲۸۰۰×۲۱۰۰', patch: { sheets: p } });
    }
    return out;
  }

  return { VERSION: VERSION, compare: compare, applyPatch: applyPatch, defaultScenarios: defaultScenarios };
}));
