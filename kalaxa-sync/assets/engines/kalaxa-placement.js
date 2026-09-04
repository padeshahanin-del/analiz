/**
 * kalaxa-placement.js — v1.0.0
 * ویرایشگر جانمایی (schema v3): توابع خالص روی «سند دامنه» — بدون DOM، بدون IO.
 * UI پنل و پل اسکچاپ فقط این توابع را صدا می‌زنند؛ تست کامل در Node.
 *
 * قرارداد placement (D-placement/v3): { x_mm, y_mm, z_mm, rotation_z_deg }
 * همه Integer (mm)، چرخش ۰..۳۵۹. نبودِ کلید = جانمایی‌نشده.
 * JS خالص، UMD، بدون وابستگی.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaPlacement = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.3.0';
  var KEYS = ['x_mm', 'y_mm', 'z_mm', 'rotation_z_deg'];

  function isInt(n) { return typeof n === 'number' && isFinite(n) && n === Math.floor(n); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* کپی ساختاری: فقط مسیرِ تغییر (doc → entities → units[] → unit هدف) کپی می‌شود؛
     بقیه (parts و…) با ارجاع مشترک می‌مانند. قرارداد: سندها immutable مصرف می‌شوند.
     نتیجه: هزینهٔ هر ویرایش مستقل از تعداد قطعات است (اندازه‌گیری: ~2.8ms → <0.1ms در ۶۰۰ قطعه). */
  function copyForUnit(doc, unitId) {
    var next = Object.assign({}, doc);
    next.entities = Object.assign({}, doc.entities);
    next.entities.units = (doc.entities.units || []).map(function (u) {
      return u.id === unitId ? Object.assign({}, u) : u;
    });
    var u = null;
    for (var i = 0; i < next.entities.units.length; i++) {
      if (next.entities.units[i].id === unitId) { u = next.entities.units[i]; break; }
    }
    return { doc: next, unit: u };
  }

  function valid(pl) {
    if (!pl || typeof pl !== 'object' || Array.isArray(pl)) return false;
    var ks = Object.keys(pl);
    if (ks.length !== KEYS.length) return false;
    for (var i = 0; i < KEYS.length; i++) {
      if (!isInt(pl[KEYS[i]])) return false;
    }
    return pl.rotation_z_deg >= 0 && pl.rotation_z_deg <= 359;
  }

  /** فهرست وضعیت جانمایی برای UI. */
  function listUnits(doc) {
    var units = (doc && doc.entities && doc.entities.units) || [];
    return units.map(function (u) {
      return {
        id: u.id,
        name: u.name || u.id,
        kind: u.kind || 'base',
        width_mm: u.width_mm || 0,
        placed: valid(u.placement),
        placement: u.placement ? clone(u.placement) : null
      };
    });
  }

  function findUnit(doc, unitId) {
    var units = (doc && doc.entities && doc.entities.units) || [];
    for (var i = 0; i < units.length; i++) {
      if (units[i].id === unitId) return units[i];
    }
    return null;
  }

  /** ثبت جانمایی یک یونیت — روی کپی؛ ورودی دست‌نخورده می‌ماند. */
  function setPlacement(doc, unitId, pl) {
    if (!valid(pl)) {
      return { ok: false, doc: null,
        errors: ['placement نامعتبر: چهار کلید x_mm/y_mm/z_mm/rotation_z_deg همه Integer و چرخش ۰..۳۵۹'] };
    }
    var c = copyForUnit(doc, unitId);
    if (!c.unit) return { ok: false, doc: null, errors: ['یونیت یافت نشد: ' + unitId] };
    c.unit.placement = clone(pl);
    return { ok: true, doc: c.doc, errors: [] };
  }

  /** حذف جانمایی (بازگشت به «جانمایی‌نشده») — کلید حذف می‌شود، nil نمی‌ماند. */
  function clearPlacement(doc, unitId) {
    var c = copyForUnit(doc, unitId);
    if (!c.unit) return { ok: false, doc: null, errors: ['یونیت یافت نشد: ' + unitId] };
    delete c.unit.placement;
    return { ok: true, doc: c.doc, errors: [] };
  }

  /**
   * چیدمان خودکار ردیفی: یونیت‌ها به ترتیب فهرست، کنار هم روی یک خط.
   * opts: { gap_mm=0, z_mm=0, rotation_z_deg=0, start_x_mm=0, y_mm=0, only_unplaced=false }
   * only_unplaced=true: جانمایی‌های موجود دست نمی‌خورند؛ بقیه از انتهای ردیف ادامه می‌یابند.
   */
  function autoLayoutRow(doc, opts) {
    opts = opts || {};
    var gap = isInt(opts.gap_mm) && opts.gap_mm >= 0 ? opts.gap_mm : 0;
    var z = isInt(opts.z_mm) ? opts.z_mm : 0;
    var rot = isInt(opts.rotation_z_deg) && opts.rotation_z_deg >= 0 && opts.rotation_z_deg <= 359
      ? opts.rotation_z_deg : 0;
    var x = isInt(opts.start_x_mm) ? opts.start_x_mm : 0;
    var y = isInt(opts.y_mm) ? opts.y_mm : 0;

    var next = clone(doc);
    var units = (next.entities && next.entities.units) || [];
    var changed = 0;

    if (opts.only_unplaced) {
      // ادامهٔ ردیف از بعد از آخرین یونیت جانمایی‌شدهٔ هم‌راستا
      units.forEach(function (u) {
        if (valid(u.placement) && u.placement.rotation_z_deg === rot) {
          var end = u.placement.x_mm + (u.width_mm || 0);
          if (end > x) x = end + gap;
        }
      });
    }

    units.forEach(function (u) {
      if (opts.only_unplaced && valid(u.placement)) return;
      if (!isInt(u.width_mm) || u.width_mm <= 0) return; // بدون عرض معتبر جانمایی نمی‌کنیم
      u.placement = { x_mm: x, y_mm: y, z_mm: z, rotation_z_deg: rot };
      x += u.width_mm + gap;
      changed++;
    });

    return { ok: true, doc: next, changed: changed, errors: [] };
  }

  /**
   * تشخیص هم‌پوشانی جانمایی‌ها (خطای واقعی طراحی): دو یونیت روی یک «خط دیوار»
   * (چرخش یکسان + فاصلهٔ عمودی از مبدأ با رواداری) که بازهٔ طولی و بازهٔ ارتفاعی‌شان
   * تقاطع دارد. لبه‌به‌لبه (تماس) هم‌پوشانی نیست. همان ریاضی groupWalls نقشه نصب.
   * @returns [{a_id, a_name, b_id, b_name, overlap_mm}]
   */
  function checkOverlaps(doc, opts) {
    opts = opts || {};
    var tol = isInt(opts.line_tolerance_mm) && opts.line_tolerance_mm >= 0
      ? opts.line_tolerance_mm : 100;
    // رواداری زاویه (رفع #8): مقایسهٔ دقیق rot قبلاً 359° و 0° را دو دیوار جدا می‌دید و
    // هم‌پوشانی واقعی را از دست می‌داد. رواداری کوچک عمداً است تا دیوارهای واقعاً عمود/
    // متفاوت (فاصلهٔ ۹۰/۱۸۰/۲۷۰ درجه) هرگز به‌اشتباه یکی حساب نشوند.
    var angleTol = isInt(opts.angle_tolerance_deg) && opts.angle_tolerance_deg >= 0
      ? opts.angle_tolerance_deg : 2;
    function sameWallAngle(r1, r2) {
      var diff = Math.abs(r1 - r2) % 360;
      return Math.min(diff, 360 - diff) <= angleTol;
    }
    var placed = listUnits(doc).filter(function (u) { return u.placed; });
    var items = placed.map(function (u) {
      var pl = u.placement;
      var rad = pl.rotation_z_deg * Math.PI / 180;
      var dir = { x: Math.cos(rad), y: Math.sin(rad) };
      var nrm = { x: -Math.sin(rad), y: Math.cos(rad) };
      var full = findUnit(doc, u.id) || {};
      return {
        id: u.id, name: u.name, rot: pl.rotation_z_deg,
        s: pl.x_mm * dir.x + pl.y_mm * dir.y,
        c: pl.x_mm * nrm.x + pl.y_mm * nrm.y,
        w: u.width_mm || 0,
        z0: pl.z_mm, z1: pl.z_mm + (full.height_mm || 0)
      };
    });
    var out = [];
    for (var i = 0; i < items.length; i++) {
      for (var j = i + 1; j < items.length; j++) {
        var a = items[i], b = items[j];
        if (!sameWallAngle(a.rot, b.rot)) continue;       // دیوارهای متفاوت
        if (Math.abs(a.c - b.c) > tol) continue;          // خط‌های موازی جدا
        var ov = Math.min(a.s + a.w, b.s + b.w) - Math.max(a.s, b.s);
        if (ov <= 0) continue;                            // تماس لبه = مجاز
        var zov = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
        if (zov <= 0) continue;                           // دیواری بالای زمینی = مجاز
        out.push({ a_id: a.id, a_name: a.name, b_id: b.id, b_name: b.name,
                   overlap_mm: Math.round(ov) });
      }
    }
    return out;
  }

  /** خلاصهٔ وضعیت برای نوار پنل: {placed, total, complete} */
  function status(doc) {
    var list = listUnits(doc);
    var placed = list.filter(function (u) { return u.placed; }).length;
    return { placed: placed, total: list.length,
             complete: list.length > 0 && placed === list.length };
  }

  return { VERSION: VERSION, valid: valid, listUnits: listUnits,
           setPlacement: setPlacement, clearPlacement: clearPlacement,
           autoLayoutRow: autoLayoutRow, status: status,
           checkOverlaps: checkOverlaps };
}));
