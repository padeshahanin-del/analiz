/**
 * kalaxa-wall-rail.js — v1.0.0
 * ریل کمد دیواری — دو مدل قیمت‌گذاری کاملاً متفاوت که کاربر صریح گفته:
 *   ۱) ریل «ساده» یا «لبه‌دار» — عمومی، بریده‌شده از عرض کمد، مثل پروفیل درب با
 *      نستینگ یک‌بعدی واقعی (دو SKU جدا: plain/edged).
 *   ۲) مکانیزم کامل برند (بلوم/فانتونی/ملونی) — یک قیمت ثابت به‌ازای هر کمد، مثل
 *      مونتاژ (کلید پایدار = برند، نه طول؛ نستینگ اصلاً معنا ندارد چون یک کیت است).
 * تشخیص از cabinet.params.wall_rail_type: 'plain' | 'edged' | 'blum' | 'fantoni' | 'meleni'.
 * JS خالص، UMD، بدون وابستگی.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaWallRail = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var CUT_TYPES = { plain: 1, edged: 1 };
  var KIT_BRANDS = { blum: 'بلوم', fantoni: 'فانتونی', meleni: 'ملونی' };

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }

  /**
   * @param {object} snapshot
   * @returns {{
   *   cut: { plain: [{id,label_fa,length_mm,qty}], edged: [...] },
   *   kits: { blum: qty, fantoni: qty, meleni: qty } (فقط برندهای واقعاً استفاده‌شده)
   * }}
   */
  function collect(snapshot) {
    var cut = { plain: [], edged: [] };
    var kits = {};
    (snapshot.cabinets || []).forEach(function (c) {
      var kind = c.params && c.params.wall_rail_type;
      if (!kind) return;
      var w = num(c.params.cabinet_width) * 10;
      if (CUT_TYPES[kind]) {
        if (!w) return;
        cut[kind].push({ id: c.kalaxa_id, label_fa: c.label_fa || c.kalaxa_id, length_mm: w, qty: 1 });
      } else if (KIT_BRANDS[kind]) {
        kits[kind] = (kits[kind] || 0) + 1;
      }
    });
    return { cut: cut, kits: kits };
  }

  return { VERSION: VERSION, collect: collect, KIT_BRANDS: KIT_BRANDS, CUT_TYPES: CUT_TYPES };
}));
