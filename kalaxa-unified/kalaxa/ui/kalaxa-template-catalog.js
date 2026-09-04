/**
 * kalaxa-template-catalog.js — v1.0.0
 * رجیستری تمپلیت‌های کابینت — الگوی «رجیستری، نه مصرف» (طبق اصلاح باگ v3.11.1 و
 * قرارداد صریح سند مرجع: رجیستری باید از تعریف‌شده‌ها بیاید، نه فقط از مصرف فعلی).
 * تمپلیت‌ها همین‌جا از مصرف واقعی کشف می‌شوند (چون کاتالوگ مستقلی در سند دامنه وجود
 * ندارد) ولی بعد از اولین کشف، در تنظیمات پروژه ماندگارند و دیگر از مصرف پاک نمی‌شوند
 * حتی اگر آن تمپلیت دیگر در snapshot جاری استفاده نشود (qty=0 نمایش داده می‌شود، حذف
 * خودکار نمی‌شود — تصمیم کاربر است).
 * JS خالص، UMD، بدون وابستگی.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaTemplateCatalog = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  /**
   * ادغام کاتالوگ ذخیره‌شده با تمپلیت‌های واقعاً دیده‌شده در cabinetRows (خروجی
   * KalaxaCabinetView.summarize). ورودی/خروجی immutable — catalog اصلی mutate نمی‌شود.
   * برچسب کاربرویرایش‌شده هرگز بازنویسی نمی‌شود؛ فقط تمپلیت تازه یا بی‌نمونهٔ ذخیره‌شده
   * از داده‌های تازه پر می‌شود.
   * @param {object} catalog - { [template_key]: {label_fa, category_fa, w_mm,h_mm,d_mm,
   *   doors,drawer_fronts,shelf_count, user_labeled:boolean} }
   * @param {Array} cabinetRows - خروجی KalaxaCabinetView.summarize(snapshot).cabinets
   * @returns {{ catalog, new_keys: [string], seen_keys: [string] }}
   */
  function mergeFromCabinets(catalog, cabinetRows) {
    var out = {};
    Object.keys(catalog || {}).forEach(function (k) { out[k] = Object.assign({}, catalog[k]); });

    var seen = {};
    var newKeys = [];
    (cabinetRows || []).forEach(function (c) {
      var key = (c.template_id && c.template_id.trim()) || null;
      if (!key) return; // بدون تمپلیت — قابل کاتالوگ‌شدن نیست (شبیه دستهٔ «بی‌نام» در شیت قیمت)
      seen[key] = true;
      var snap = {
        category_fa: c.category_fa, w_mm: c.w_mm, h_mm: c.h_mm, d_mm: c.d_mm,
        doors: c.doors, drawer_fronts: c.drawer_fronts, shelf_count: c.shelf_count,
        door_swing: c.door_swing
      };
      if (!out[key]) {
        out[key] = Object.assign({ label_fa: c.label_fa, user_labeled: false }, snap);
        newKeys.push(key);
      } else if (!out[key].user_labeled) {
        // برچسب کاربر دست نخورده می‌ماند؛ فقط اگر کاربر برچسب را عوض نکرده، با آخرین نمونه به‌روز شود
        out[key] = Object.assign({}, out[key], snap, { label_fa: c.label_fa });
      } else {
        out[key] = Object.assign({}, out[key], snap); // ابعاد/تعداد تازه، برچسب کاربر دست‌نخورده
      }
    });

    return { catalog: out, new_keys: newKeys, seen_keys: Object.keys(seen) };
  }

  /** فهرست همهٔ تمپلیت‌های کاتالوگ برای نمایش — با qty=0 برای آن‌هایی که این دور دیده نشدند. */
  function listEntries(catalog, seenKeys) {
    var seen = {};
    (seenKeys || []).forEach(function (k) { seen[k] = true; });
    return Object.keys(catalog || {}).sort().map(function (key) {
      var e = catalog[key];
      return Object.assign({ key: key, in_current_scan: !!seen[key] }, e);
    });
  }

  return { VERSION: VERSION, mergeFromCabinets: mergeFromCabinets, listEntries: listEntries };
}));
