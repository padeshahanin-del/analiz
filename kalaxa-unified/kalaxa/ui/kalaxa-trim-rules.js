/**
 * kalaxa-trim-rules.js — v1.0.0
 * قانون طراحی «ران» تاج/لب‌چراغ/پاخور — رفع هشدار مستند از v3.11.0: «متراژ خام —
 * تداخل گوشه کسر نشده». به‌جای جمع خام عرض کابینت‌ها، کاربر «ران»ها را تعریف می‌کند:
 * گروهی از کابینت‌های پشت‌سرهم که یک نوار پیوسته می‌سازند + تعداد گوشهٔ آن ران.
 * طول واقعی = جمع عرض کابینت‌های ران − (تعداد گوشه × مقدار کسر هر گوشه).
 * تشخیص خودکار گوشه از هندسهٔ اسکچاپ در این محیط قابل تست نیست (اسکچاپ نصب نیست)؛
 * طبق همان الگوی تأییدشدهٔ کاربر برای قرنیز/مولدینگ، این‌جا هم **ورودی دستی** است.
 * JS خالص، UMD، بدون وابستگی.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaTrimRules = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var KINDS = { crown: 1, light_rail: 1, kick: 1 };

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }
  function r2(n) { return Math.round(n * 100) / 100; }

  /**
   * @param {Array} cabinets - snapshot.cabinets
   * @param {Array} runs - [{id, category:'crown'|'light_rail'|'kick', label_fa, cabinet_ids:[...], corners, deduction_mm}]
   * @param {number} [defaultDeductionMm] - وقتی run.deduction_mm نباشد استفاده می‌شود (پیش‌فرض ۰ = بدون کسر، سازگاری عقب‌رو)
   * @returns {{segments:{crown:[],light_rail:[],kick:[]}, warnings:[string]}}
   *   هر عضو segments[kind] یک {id,label_fa,length_mm,qty:1} است — یک ران = یک قطعهٔ پیوسته برای نستینگ.
   */
  function computeRuns(cabinets, runs, defaultDeductionMm) {
    var byId = {};
    (cabinets || []).forEach(function (c) { byId[c.kalaxa_id] = c; });
    var out = { crown: [], light_rail: [], kick: [] };
    var warnings = [];
    var defDeduction = num(defaultDeductionMm);

    (runs || []).forEach(function (run) {
      var kind = run.category;
      if (!KINDS[kind]) { warnings.push('نوع نامعتبر ران: ' + kind); return; }
      var label = run.label_fa || run.id || 'ران بی‌نام';
      var widthSum = 0;
      var missing = [];
      (run.cabinet_ids || []).forEach(function (id) {
        var c = byId[id];
        if (!c) { missing.push(id); return; }
        widthSum += num(c.params && c.params.cabinet_width) * 10; // cm → mm
      });
      if (missing.length) {
        warnings.push(label + ': ' + missing.length + ' کابینت در مدل یافت نشد — دستی بررسی شود');
      }
      if (!widthSum) return;
      var corners = typeof run.corners === 'number' && run.corners > 0 ? Math.floor(run.corners) : 0;
      var deduction = run.deduction_mm != null ? num(run.deduction_mm) : defDeduction;
      var length = Math.max(0, widthSum - corners * deduction);
      out[kind].push({ id: run.id, label_fa: label, length_mm: r2(length), qty: 1 });
    });
    return { segments: out, warnings: warnings };
  }

  return { VERSION: VERSION, KINDS: KINDS, computeRuns: computeRuns };
}));
