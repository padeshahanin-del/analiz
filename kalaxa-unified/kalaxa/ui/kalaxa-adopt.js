/**
 * Kalaxa Adopt — تبدیل کابینتِ آنالیزشده به کابینتِ پارامتریک
 *
 * کاربر: «اونی که آنالیز کردم رو می‌خوام جزو کابینت‌های در حال ساختم باشه که
 * بتونم اندازه رو تغییر بدم».
 *
 * کابینتی که کاربر خودش کشیده، هندسهٔ **مرده** است: عرضش را نمی‌شود عوض کرد،
 * چون هیچ‌جا نوشته نشده «این ۹۰۰ است»؛ فقط چند جعبه در فضا هستند. کابینت
 * کالاکسا برعکس، از چند عدد ساخته می‌شود و با عوض شدن آن‌ها دوباره ساخته
 * می‌شود. این ماژول پل بین این دو است: از قطعات، همان چند عدد را حدس می‌زند.
 *
 * چرا در JS و نه روبی: تشخیص نقش قطعات این‌جاست (kalaxa-part-classifier.js).
 * اگر استنتاج را در روبی می‌نوشتیم، نسخهٔ دومی از همان قواعد پیدا می‌شد و
 * دیر یا زود از هم واگرا می‌شدند — الگویی که در این پروژه بارها باگ ساخته.
 *
 * قاعدهٔ سخت: **هیچ عددی از هوا ساخته نمی‌شود.** چیزی که از قطعات درنیامد،
 * به‌عنوان «حدس» علامت می‌خورد تا کاربر قبل از تبدیل ببیندش. تبدیلِ بی‌صدا با
 * ابعاد غلط، از تبدیل‌نکردن بدتر است.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KalaxaAdopt = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }
  function r1(n) { return Math.round(n * 10) / 10; }

  function has(parts, role) {
    return parts.some(function (p) { return p.role === role; });
  }
  function pick(parts, role) {
    return parts.filter(function (p) { return p.role === role; });
  }

  /** پرتکرارترین مقدار — میانه در برابر یک قطعهٔ پرت مقاوم نیست، مُد هست. */
  function mode(values) {
    if (!values.length) return null;
    var count = {}, best = null, bestN = 0;
    values.forEach(function (v) {
      var k = String(v);
      count[k] = (count[k] || 0) + 1;
      if (count[k] > bestN) { bestN = count[k]; best = v; }
    });
    return best;
  }

  /**
   * تمپلیت را از **ترکیب قطعات** حدس می‌زند، نه از ابعاد.
   *
   * ابعاد گمراه‌کننده‌اند: یک کابینت زمینیِ کوتاه و یک کابینت دیواریِ بلند
   * می‌توانند ارتفاع یکسان داشته باشند. آنچه واقعاً فرق می‌گذارد این است که
   * داخلش چه هست: نمای کشو، چند درب، یا هیچ‌کدام.
   */
  function inferTemplate(parts, bounds) {
    var drawers = pick(parts, 'drawer_front').length;
    var doors = pick(parts, 'door').length;
    var h = bounds.h;

    if (drawers >= 2) return { id: 'base_three_drawer', why: drawers + ' نمای کشو' };
    if (h >= 1400) {
      return { id: 'tall_double_door', why: 'ارتفاع ' + Math.round(h) + 'mm → قدی' };
    }
    // کابینت دیواری کف ندارد که روی زمین بنشیند؛ نشانهٔ عملی‌اش عمق کم است.
    if (bounds.d <= 400 && h <= 1000) {
      return { id: 'wall_single_door', why: 'عمق ' + Math.round(bounds.d) + 'mm → دیواری' };
    }
    if (doors >= 2) return { id: 'base_sink_double_door', why: doors + ' درب' };
    return { id: 'base_single_door', why: 'یک درب زمینی' };
  }

  /**
   * @param {Array} parts - خروجی KalaxaPartClassifier.classify(...).parts
   * @param {object} bounds - همان classify(...).bounds
   * @returns {{template_id, width_cm, height_cm, depth_cm, opts, notes, guesses, ready}}
   *   `guesses` = چیزهایی که از قطعات درنیامد و پیش‌فرض گرفته‌اند.
   */
  function infer(parts, bounds, options) {
    var list = (parts || []).filter(function (p) { return p.role !== 'hardware'; });
    var notes = [], guesses = [];

    if (!list.length || !bounds) {
      return { ready: false, notes: ['قطعه‌ای برای تبدیل نیست'], guesses: [] };
    }

    /* --------------------------- ابعاد بیرونی --------------------------- */
    // درب جلوی کابینت می‌ایستد و در عمق حساب نمی‌شود — وگرنه هر تبدیلی کابینت
    // را ~۱۸ میلی عمیق‌تر می‌ساخت و دفعهٔ بعد باز هم عمیق‌تر.
    var carcass = list.filter(function (p) {
      return p.role !== 'door' && p.role !== 'drawer_front';
    });
    var body = carcass.length ? carcass : list;
    var d = Math.max.apply(null, body.map(function (p) { return num(p.box.y) + num(p.box.dy); })) -
            Math.min.apply(null, body.map(function (p) { return num(p.box.y); }));
    if (carcass.length !== list.length) {
      notes.push('عمق از بدنه گرفته شد، نه از درب — درب جلوی کابینت می‌ایستد');
    }

    /* ---------------------------- ضخامت‌ها ---------------------------- */
    var sides = pick(list, 'side');
    var bodyT = mode(sides.map(function (p) { return p.thickness_mm; }));
    if (bodyT == null) {
      bodyT = mode(list.map(function (p) { return p.thickness_mm; }));
      if (bodyT != null) guesses.push('ضخامت بدنه از پرتکرارترین ضخامت قطعات حدس زده شد');
    }
    if (bodyT == null) { bodyT = 16; guesses.push('ضخامت بدنه پیش‌فرض ۱۶ گرفته شد'); }

    var backs = pick(list, 'back');
    var backT = backs.length ? mode(backs.map(function (p) { return p.thickness_mm; })) : null;
    if (backT == null) {
      backT = 8;
      guesses.push(backs.length ? 'ضخامت پشت‌بند خوانده نشد' : 'پشت‌بندی پیدا نشد — ۸ فرض شد');
    }

    /* --------------------------- شمارش داخلی --------------------------- */
    var shelfCount = pick(list, 'shelf').length;
    var drawerCount = pick(list, 'drawer_front').length;
    var doorCount = pick(list, 'door').length;

    var tpl = inferTemplate(list, bounds);
    notes.push('تمپلیت: ' + tpl.why);

    if (!has(list, 'side')) {
      notes.push('هیچ دیواره‌ای تشخیص داده نشد — ابعاد ممکن است درست نباشند');
    }

    var opts = {
      body_thickness_mm: Math.round(bodyT),
      back_thickness_mm: Math.round(backT),
      shelf_count: shelfCount,
      drawer_count: Math.max(1, drawerCount)
    };
    if (!drawerCount && tpl.id === 'base_three_drawer') {
      guesses.push('تعداد کشو خوانده نشد');
    }
    if (!doorCount && tpl.id !== 'base_three_drawer') {
      guesses.push('دربی تشخیص داده نشد — با تنظیمات پیش‌فرض ساخته می‌شود');
    }

    // ضخامت درب از خودِ درب می‌آید، نه از پیش‌فرض: کاربر ممکن است درب ۱۸ روی
    // بدنهٔ ۱۶ داشته باشد و تبدیل نباید بی‌صدا نازکش کند.
    var doors = pick(list, 'door').concat(pick(list, 'drawer_front'));
    var doorT = doors.length ? mode(doors.map(function (p) { return p.thickness_mm; })) : null;
    if (doorT) opts.door_thickness_mm = Math.round(doorT);

    if (options && options.door_shape) opts.door_shape = options.door_shape;

    return {
      ready: true,
      template_id: tpl.id,
      width_cm: r1(bounds.w / 10),
      height_cm: r1(bounds.h / 10),
      depth_cm: r1(d / 10),
      opts: opts,
      notes: notes,
      guesses: guesses,
      // اطمینان تبدیل = کمترین اطمینانِ قطعاتی که ابعاد از آن‌ها درآمد. یک
      // دیوارهٔ مشکوک یعنی کل عرض مشکوک است.
      confidence: body.reduce(function (m, p) {
        return Math.min(m, typeof p.confidence === 'number' ? p.confidence : 1);
      }, 1)
    };
  }

  return { VERSION: VERSION, infer: infer, inferTemplate: inferTemplate, _mode: mode };
}));
