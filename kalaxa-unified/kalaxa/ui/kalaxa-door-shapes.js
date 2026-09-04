/**
 * kalaxa-door-shapes.js — شکل ساخت درب. آینهٔ دقیق lib/door_shapes.rb.
 *
 * چرا هر دو زبان: اسکچاپ Ruby را داخل خودش دارد و موقع ساخت کابینت دیالوگی باز
 * نیست که JS اجرا کند، پس فعلاً Ruby باید محاسبه کند. ولی مکس (Python)، رویت
 * (C#/Python)، سایت و نرم‌افزار ویندوز هیچ‌کدام Ruby ندارند — پس مرجع باید JS باشد.
 *
 * این دوگانگی **امن و موقت** است، چون:
 *   - داده از کاتالوگ مشترک می‌آید (data/door_shapes.json)، نه از کد
 *   - test_domain_parity.rb خروجی هر دو را برای یک ماتریس ورودی بایت‌به‌بایت
 *     مقایسه می‌کند
 * وقتی سرویس محلی Node بالا آمد، نسخهٔ Ruby حذف می‌شود.
 *
 * قواعد عددی عمداً با Ruby یکی شده‌اند: Ruby نیم را از صفر دور می‌کند
 * (2.5→3، −2.5→−3) ولی Math.round به سمت +∞ می‌رود (−2.5→−2). برای ابعاد مثبت
 * فرقی ندارد، ولی y جعبه‌ها منفی است — پس helper خودمان را داریم.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./kalaxa-catalog.js'));
  } else {
    root.KalaxaDoorShapes = factory(root.KalaxaCatalog);
  }
}(typeof self !== 'undefined' ? self : this, function (Catalog) {
  'use strict';

  var VERSION = '1.0.0';

  // ---- هم‌ارزهای عددی Ruby ----
  function rround(v) { // Float#round — نیم از صفر دور
    return v < 0 ? -Math.round(-v) : Math.round(v);
  }
  function rround2(v) { // Float#round(2)
    return v < 0 ? -(Math.round(-v * 100) / 100) : Math.round(v * 100) / 100;
  }
  function toF(v) { // to_f روی nil/undefined = 0.0
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  function shapes() { return Catalog.doorShapes(); }
  function ids() { return Catalog.doorShapeIds(); }
  function defaultShape() { return Catalog.defaultDoorShape(); }

  /** سند قدیمی door_shape ندارد → از door_type (رویه) حدس زده می‌شود. */
  function shapeId(opts) {
    opts = opts || {};
    var given = String(opts.door_shape == null ? '' : opts.door_shape);
    if (shapes()[given]) return given;
    return Catalog.doorTypeToShape()[String(opts.door_type == null ? '' : opts.door_type)] ||
           defaultShape();
  }

  function spec(shape) { return shapes()[shape] || shapes()[defaultShape()]; }

  function thicknessesMm(shape) { return spec(shape).thicknesses_mm; }

  /** ضخامت مؤثر: از تنظیمات، وگرنه پیش‌فرض شکل. */
  function thicknessMm(shape, opts) {
    var t = toF((opts || {}).door_thickness_mm);
    return t > 0 ? rround(t) : spec(shape).default_mm;
  }

  function isFramed(shape) { return spec(shape).kind === 'framed'; }
  function isProfile(shape) { return spec(shape).kind === 'profile'; }

  function frameWidthMm(shape, opts) {
    var w = toF((opts || {}).door_frame_width_mm);
    return w > 0 ? w : (spec(shape).frame_width_mm || 0);
  }

  // ---------------- لیست برش ----------------
  // count به‌ازای **یک** درب است؛ فراخوان در تعداد لنگه ضرب می‌کند.
  function pieces(shape, fw, fh, opts) {
    opts = opts || {};
    var s = spec(shape);
    var t = thicknessMm(shape, opts);

    if (s.kind === 'framed') return framedPieces(shape, fw, fh, t, opts);
    if (s.kind === 'profile') return profilePieces(shape, fw, fh, opts);

    return [{ key: 'door', count: 1, length_mm: fh, width_mm: fw, thickness_mm: t,
              sheet: s.sheet, grain: 'length', note: s.operation ? 'فرزکاری طرح' : '' }];
  }

  // کلاف و تنپوش: ۲ قائم (تمام‌قد) + ۲ افقی (بین قائم‌ها) + ۱ تنپوش نازک‌تر.
  function framedPieces(shape, fw, fh, t, opts) {
    var s = spec(shape);
    var fwid = frameWidthMm(shape, opts);
    var groove = toF(opts.door_groove_depth_mm != null ? opts.door_groove_depth_mm : s.groove_depth_mm);
    var panelT = toF(opts.door_panel_thickness_mm != null ? opts.door_panel_thickness_mm : s.panel_thickness_mm);

    return [
      { key: 'door_stile', count: 2, length_mm: fh, width_mm: fwid, thickness_mm: t,
        sheet: s.sheet, grain: 'length', note: 'قائم کلاف' },
      { key: 'door_rail', count: 2, length_mm: fw - 2 * fwid, width_mm: fwid, thickness_mm: t,
        sheet: s.sheet, grain: 'length', note: 'افقی کلاف' },
      { key: 'door_panel', count: 1,
        length_mm: fh - 2 * fwid + 2 * groove, width_mm: fw - 2 * fwid + 2 * groove,
        thickness_mm: rround(panelT), sheet: s.panel_sheet, grain: 'none',
        note: 'تنپوش، داخل شیار' }
    ];
  }

  // فریم آلومینیوم: پروفیل متری است و در kalaxa-door-profile.js شمرده می‌شود، نه
  // در نستینگ ورق. این‌جا فقط تویی می‌رود — با ورق مخصوص خودش.
  function profilePieces(shape, fw, fh, opts) {
    var s = spec(shape);
    var fwid = frameWidthMm(shape, opts);
    var lap = toF(s.infill_overlap_mm);
    return [{ key: s.infill === 'glass' ? 'door_glass' : 'door_panel', count: 1,
              length_mm: fh - 2 * fwid + 2 * lap, width_mm: fw - 2 * fwid + 2 * lap,
              thickness_mm: s.infill_thickness_mm, sheet: s.infill_sheet, grain: 'none',
              note: s.infill === 'glass' ? 'شیشه، داخل پروفیل' : 'تویی، داخل پروفیل' }];
  }

  // ---------------- مدل سه‌بعدی ----------------
  // نما همیشه بیرون بدنه است: از y = -t تا y = 0.
  function box(key, x, y, z, dx, dy, dz) {
    return { key: key, x: rround2(x), y: rround2(y), z: rround2(z),
             dx: rround2(dx), dy: rround2(dy), dz: rround2(dz) };
  }

  function boxes(shape, fx, fz, fw, fh, opts) {
    opts = opts || {};
    var s = spec(shape);
    var t = thicknessMm(shape, opts);

    if (s.kind === 'framed') return framedBoxes(shape, fx, fz, fw, fh, t, opts);
    if (s.kind === 'profile') return profileBoxes(shape, fx, fz, fw, fh, t, opts);
    return [box('door', fx, -t, fz, fw, t, fh)];
  }

  function framedBoxes(shape, fx, fz, fw, fh, t, opts) {
    var s = spec(shape);
    var fwid = frameWidthMm(shape, opts);
    var panelT = toF(opts.door_panel_thickness_mm != null ? opts.door_panel_thickness_mm : s.panel_thickness_mm);
    var innerW = fw - 2 * fwid;
    var innerH = fh - 2 * fwid;
    // تنپوش وسطِ ضخامت کلاف می‌نشیند (نه هم‌سطح جلو)، مثل درب واقعی.
    var panelY = -t + (t - panelT) / 2;

    return [
      box('door_stile', fx, -t, fz, fwid, t, fh),
      box('door_stile', fx + fw - fwid, -t, fz, fwid, t, fh),
      box('door_rail', fx + fwid, -t, fz, innerW, t, fwid),
      box('door_rail', fx + fwid, -t, fz + fh - fwid, innerW, t, fwid),
      box('door_panel', fx + fwid, panelY, fz + fwid, innerW, panelT, innerH)
    ];
  }

  function profileBoxes(shape, fx, fz, fw, fh, t, opts) {
    var s = spec(shape);
    var fwid = frameWidthMm(shape, opts);
    var infillT = toF(s.infill_thickness_mm);
    var innerW = fw - 2 * fwid;
    var innerH = fh - 2 * fwid;
    var infillY = -t + (t - infillT) / 2;
    var key = s.infill === 'glass' ? 'door_glass' : 'door_panel';

    return [
      box('door_frame', fx, -t, fz, fwid, t, fh),
      box('door_frame', fx + fw - fwid, -t, fz, fwid, t, fh),
      box('door_frame', fx + fwid, -t, fz, innerW, t, fwid),
      box('door_frame', fx + fwid, -t, fz + fh - fwid, innerW, t, fwid),
      box(key, fx + fwid, infillY, fz + fwid, innerW, infillT, innerH)
    ];
  }

  return {
    VERSION: VERSION,
    shapes: shapes, ids: ids, defaultShape: defaultShape,
    shapeId: shapeId, spec: spec,
    thicknessesMm: thicknessesMm, thicknessMm: thicknessMm,
    isFramed: isFramed, isProfile: isProfile, frameWidthMm: frameWidthMm,
    pieces: pieces, boxes: boxes,
    _rround: rround, _rround2: rround2
  };
}));
