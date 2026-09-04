/**
 * kalaxa-door-profile.js — v1.0.0
 * پروفیل درب آلومینیومی/شیشه‌ای — قطعات فریم هر درب را از ابعاد درب استخراج می‌کند
 * تا با KalaxaLinearNesting به شاخهٔ واقعی تبدیل شود. فقط دربی که نوعش در فهرست
 * «نیازمند فریم آلومینیوم» باشد وارد محاسبه می‌شود (پیش‌فرض: glass_aluminum،
 * mdf_aluminum_frame — طبق طبقه‌بندی ضخامت/نوع درب کاربر).
 *
 * قرارداد فریم هر درب — ۴ ضلع، دو نوع پروفیل متفاوت (SKU جدا، شاخهٔ جدا):
 *   ۲ ریل افقی (بالا/پایین) + ۱ ستون سمت لولا  → پروفیل «ساده» (بدون دستگیره)
 *   ۱ ستون سمت دستگیره (مقابل لولا)             → پروفیل «دستگیره‌دار»
 * سمت دستگیره از door_swing تعیین می‌شود (دستگیره مقابل لولاست)؛ نبود door_swing → نامشخص،
 * هر دو ستون به‌عنوان «ساده» فرض می‌شوند (کمتر از واقع تخمین نمی‌زند، فقط دستگیره را جا نمی‌اندازد
 * — با هشدار صریح، نه سکوت).
 * JS خالص، UMD، بدون وابستگی.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaDoorProfile = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var DEFAULT_ALUMINUM_DOOR_TYPES = ['glass_aluminum', 'mdf_aluminum_frame'];

  /**
   * @param {object} snapshot
   * @param {Array<string>} [aluminumDoorTypes] - مقادیر door_type که فریم آلومینیوم می‌خواهند
   * @returns {{ plain: [{id,label_fa,length_mm,qty}], handle: [{id,label_fa,length_mm,qty}],
   *             door_count: number, unknown_swing_count: number }}
   */
  function segments(snapshot, aluminumDoorTypes) {
    var types = {};
    (aluminumDoorTypes && aluminumDoorTypes.length ? aluminumDoorTypes : DEFAULT_ALUMINUM_DOOR_TYPES)
      .forEach(function (t) { types[t] = true; });

    var cabMap = {};
    (snapshot.cabinets || []).forEach(function (c) { cabMap[c.kalaxa_id] = c; });

    var plain = [], handle = [];
    var doorCount = 0, unknownSwing = 0;

    (snapshot.parts_flat || []).forEach(function (p) {
      if (p.key !== 'door') return;
      var cab = cabMap[p.cabinet_id] || {};
      var dt = cab.params && cab.params.door_type;
      if (!dt || !types[dt]) return;

      var swing = cab.params && cab.params.door_swing; // 'left'|'right' — لولا کدام‌طرف است
      var known = swing === 'left' || swing === 'right';
      if (!known) unknownSwing += p.count;

      var label = cab.label_fa || p.cabinet_id;
      for (var i = 0; i < p.count; i++) {
        doorCount++;
        var uid = p.part_uid + '#' + i;
        plain.push({ id: uid + ':top', label_fa: label + ' — ریل بالا', length_mm: p.cut_width_mm, qty: 1 });
        plain.push({ id: uid + ':bottom', label_fa: label + ' — ریل پایین', length_mm: p.cut_width_mm, qty: 1 });
        if (known) {
          plain.push({ id: uid + ':hinge', label_fa: label + ' — ستون لولا', length_mm: p.cut_length_mm, qty: 1 });
          handle.push({ id: uid + ':handle', label_fa: label + ' — ستون دستگیره', length_mm: p.cut_length_mm, qty: 1 });
        } else {
          // بدون door_swing، سمت دستگیره نامشخص است — هر دو ستون «ساده» فرض می‌شود تا
          // کم‌تر از واقع تخمین زده نشود؛ فراخوان با unknown_swing_count مطلع می‌شود.
          plain.push({ id: uid + ':col1', label_fa: label + ' — ستون (سمت نامشخص)', length_mm: p.cut_length_mm, qty: 1 });
          plain.push({ id: uid + ':col2', label_fa: label + ' — ستون (سمت نامشخص)', length_mm: p.cut_length_mm, qty: 1 });
        }
      }
    });

    return { plain: plain, handle: handle, door_count: doorCount, unknown_swing_count: unknownSwing };
  }

  return { VERSION: VERSION, segments: segments, DEFAULT_ALUMINUM_DOOR_TYPES: DEFAULT_ALUMINUM_DOOR_TYPES };
}));
