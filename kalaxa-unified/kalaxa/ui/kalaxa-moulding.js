/**
 * kalaxa-moulding.js — v1.0.0
 * قرنیز/مولدینگ مستقل (جدا از تاج/پاخور کابینت) — از «صفحه/کانترتاپ» می‌آید که فعلاً
 * در مدل دادهٔ اسکن‌شده هیچ مفهومی ندارد (نه در snapshot، نه در schema). طبق تصمیم
 * صریح کاربر، این‌جا **ورودی دستی** است: کاربر طول/عرض هر صفحه + تعداد «برگشت»
 * (قطعهٔ کوتاه انتهایی که قرنیز به سمت دیوار/کابینت برمی‌گردد) را در شیت
 * قیمت وارد می‌کند، نه از مدل اسکچاپ استخراج می‌شود.
 *
 * فرض هندسی (چون مدل واقعی کانترتاپ وجود ندارد، مستند و قابل‌تصحیح): قرنیز هر صفحه از
 * یک نوار جلو به طول صفحه + به‌ازای هر «برگشت» یک قطعهٔ کوتاه به طول عرض صفحه تشکیل
 * می‌شود. اگر این فرض با واقعیت کارگاه فرق دارد، فقط تابع segments() نیاز به اصلاح دارد.
 * JS خالص، UMD، بدون وابستگی.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaMoulding = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }

  /**
   * @param {Array} boards - [{id, label_fa, length_mm, width_mm, returns}] — ورودی دستی کاربر
   * @returns {Array<{id,label_fa,length_mm,qty}>} segments برای KalaxaLinearNesting.run
   */
  function segments(boards) {
    var out = [];
    (boards || []).forEach(function (b, i) {
      var label = b.label_fa || 'صفحه ' + (i + 1);
      var len = num(b.length_mm), wid = num(b.width_mm);
      var returns = typeof b.returns === 'number' && b.returns > 0 ? Math.floor(b.returns) : 0;
      if (len > 0) out.push({ id: (b.id || 'board' + i) + ':front', label_fa: label + ' — جلو', length_mm: len, qty: 1 });
      if (wid > 0 && returns > 0) {
        out.push({ id: (b.id || 'board' + i) + ':return', label_fa: label + ' — برگشت', length_mm: wid, qty: returns });
      }
    });
    return out;
  }

  return { VERSION: VERSION, segments: segments };
}));
