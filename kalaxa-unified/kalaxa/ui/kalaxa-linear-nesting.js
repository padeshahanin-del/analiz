/**
 * kalaxa-linear-nesting.js — v1.0.0
 * نستینگ یک‌بعدی برای متریال طولی (تاج/لب‌چراغ/پاخور/پروفیل/قرنیز — هر چیزی که به
 * صورت شاخهٔ استاندارد خریداری و به قطعات کوتاه‌تر بریده می‌شود). الگوریتم قطعی
 * First-Fit-Decreasing (استاندارد صنعتی برای cutting-stock ۱بعدی، ساده و قابل‌آزمون).
 * JS خالص، UMD، بدون وابستگی.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaLinearNesting = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  function r2(n) { return Math.round(n * 100) / 100; }

  /**
   * @param {Array} segments - [{id, label_fa, length_mm, qty}] — طول قطعات لازم
   * @param {object} opts - { bar_length_mm (اجباری), kerf_mm=3 }
   * @returns {{
   *   ok: boolean, error: string|null,
   *   bars: [{bar_index, cuts:[{id,label_fa,length_mm,position_mm}], waste_mm, utilization_pct}],
   *   total_bars, total_waste_mm, oversized: [{id,label_fa,length_mm}]
   * }}
   */
  function run(segments, opts) {
    opts = opts || {};
    var barLen = opts.bar_length_mm;
    var kerf = typeof opts.kerf_mm === 'number' && opts.kerf_mm >= 0 ? opts.kerf_mm : 3;

    if (typeof barLen !== 'number' || !(barLen > 0)) {
      return { ok: false, error: 'bar_length_mm نامعتبر یا تعریف‌نشده', bars: [], total_bars: 0,
               total_waste_mm: 0, oversized: [] };
    }

    var items = [];
    var oversized = [];
    (segments || []).forEach(function (s) {
      var qty = typeof s.qty === 'number' && s.qty > 0 ? Math.floor(s.qty) : 1;
      if (s.length_mm > barLen) {
        oversized.push({ id: s.id, label_fa: s.label_fa, length_mm: s.length_mm });
        return; // بلندتر از شاخهٔ استاندارد — قابل جاگذاری نیست، نه سکوت، نه خطای کلی
      }
      for (var i = 0; i < qty; i++) {
        items.push({ id: s.id, label_fa: s.label_fa, length_mm: s.length_mm });
      }
    });

    // مرتب‌سازی نزولی (FFD) — نتیجهٔ قطعی و مستقل از ترتیب ورودی
    items.sort(function (a, b) { return b.length_mm - a.length_mm || (a.id < b.id ? -1 : 1); });

    var bars = [];
    items.forEach(function (it) {
      var placed = false;
      for (var i = 0; i < bars.length; i++) {
        var b = bars[i];
        var used = b.cuts.reduce(function (s, c) { return s + c.length_mm + kerf; }, 0);
        if (barLen - used >= it.length_mm) {
          b.cuts.push({ id: it.id, label_fa: it.label_fa, length_mm: it.length_mm, position_mm: used });
          placed = true;
          break;
        }
      }
      if (!placed) {
        bars.push({ bar_index: bars.length + 1, cuts: [{ id: it.id, label_fa: it.label_fa,
                     length_mm: it.length_mm, position_mm: 0 }] });
      }
    });

    var totalWaste = 0;
    bars.forEach(function (b) {
      var used = b.cuts.reduce(function (s, c) { return s + c.length_mm; }, 0) +
                 Math.max(0, b.cuts.length - 1) * kerf;
      b.waste_mm = Math.max(0, r2(barLen - used));
      b.utilization_pct = r2(used / barLen * 100);
      totalWaste += b.waste_mm;
    });

    return { ok: true, error: null, bars: bars, total_bars: bars.length,
             total_waste_mm: r2(totalWaste), oversized: oversized };
  }

  return { VERSION: VERSION, run: run };
}));
