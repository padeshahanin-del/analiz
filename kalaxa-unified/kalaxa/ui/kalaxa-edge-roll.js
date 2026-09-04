/**
 * kalaxa-edge-roll.js — v1.0.0
 * نوار لبهٔ رولی (مصرف واقعی از رول، نه برش‌خورده/متری آماده). طبق تصمیم صریح کاربر:
 * مبنای قیمت‌گذاری = طول واقعی مصرفی از رول؛ ولی به‌ازای هر «برش» (هر بار که نوار روی
 * یک ضلع از یک قطعه زده می‌شود) یک افت/پرت ثابت اضافه می‌شود («اگه یک طول ۱۰۰ باشه
 * برای نوار ۱۰۵ بشه» — پیش‌فرض ۵۰mm). این جدا از گروه «نوار لبه» فعلی (که متری/آمادهٔ
 * برش‌خورده حساب می‌شود) است — برای کارگاه‌هایی که نوار را رولی می‌خرند.
 * JS خالص، UMD، بدون وابستگی.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaEdgeRoll = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var DOOR_KEYS = { door: 1, drawer_front: 1 };
  var DEFAULT_WASTE_MM = 50;

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }
  function r2(n) { return Math.round(n * 100) / 100; }

  /**
   * @param {object} snapshot - snapshot.parts_flat
   * @param {number} [wasteMm] - افت هر برش به mm (پیش‌فرض ۵۰)
   * @returns {{body_m:number, door_m:number, body_cuts:number, door_cuts:number, waste_mm:number}}
   */
  function consumption(snapshot, wasteMm) {
    var waste = typeof wasteMm === 'number' && wasteMm >= 0 ? wasteMm : DEFAULT_WASTE_MM;
    var mm = { body: 0, door: 0 };
    var cuts = { body: 0, door: 0 };
    (snapshot && snapshot.parts_flat || []).forEach(function (p) {
      var e = p.edge || {};
      var role = DOOR_KEYS[p.key] ? 'door' : 'body';
      var count = num(p.count) || 0;
      if (!count) return;
      ['front', 'back'].forEach(function (side) {
        if (!e[side]) return;
        mm[role] += count * (num(p.cut_length_mm) + waste);
        cuts[role] += count;
      });
      ['top', 'bottom'].forEach(function (side) {
        if (!e[side]) return;
        mm[role] += count * (num(p.cut_width_mm) + waste);
        cuts[role] += count;
      });
    });
    return {
      body_m: r2(mm.body / 1000), door_m: r2(mm.door / 1000),
      body_cuts: cuts.body, door_cuts: cuts.door, waste_mm: waste
    };
  }

  return { VERSION: VERSION, DEFAULT_WASTE_MM: DEFAULT_WASTE_MM, consumption: consumption };
}));
