/**
 * Kalaxa Countertop — صفحهٔ کار چندتکه
 *
 * قدم سوم از فهرست امکاناتی که کاربر خواست. `kalaxa-moulding.js` موجود فقط
 * طول‌های دستی را به قطعهٔ برش تبدیل می‌کرد؛ چیزی دربارهٔ **اتصال‌ها** نمی‌دانست.
 *
 * چیزی که کارگاه واقعاً لازم دارد و نداشتیم:
 *
 * ۱. **تقسیم به شاخه.** رانِ ۴٫۲ متری را نمی‌شود از ورقِ ۳٫۶ متری یک‌تکه برید.
 *    باید شکسته شود و کارگاه بداند درز **کجا** می‌افتد. حدس‌زدنش در کارگاه
 *    یعنی درز وسط سینک یا وسط اجاق دربیاید.
 * ۲. **نوع هر سر.** هر انتهای هر تکه یکی از این‌هاست: اتصال به تکهٔ بعد،
 *    گوشهٔ ۹۰ درجه، لبهٔ آزاد (که پروفیل می‌خورد)، یا چسبیده به دیوار.
 *    قیمت و کار هرکدام فرق دارد.
 * ۳. **بیرون‌زدگی جلو.** صفحه از بدنه جلوتر می‌ایستد؛ عمقِ سفارش با عمق
 *    کابینت یکی نیست.
 *
 * این ماژول هیچ تصمیمی دربارهٔ **جنس** نمی‌گیرد (کورین، سنگ، پست‌فرمینگ) —
 * فقط هندسه و اتصال. قیمت کار شیت قیمت است.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KalaxaCountertop = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  // نوع هر سرِ تکه
  var END_KINDS = {
    wall:   'به دیوار',      // سر به دیوار می‌خورد؛ کاری لازم نیست
    corner: 'گوشه',          // به رانِ عمود بعدی می‌رسد
    joint:  'درز اتصال',     // ادامهٔ همان ران، چون شاخه کوتاه بود
    open:   'لبهٔ آزاد'      // انتهای ران؛ پروفیل/لبه می‌خورد
  };

  var DEFAULTS = {
    // نوع صفحه از کاتالوگ مشترک (`data/countertops.json`). طول شاخه از همان
    // می‌آید، پس عددی این‌جا ثابت نمی‌ماند.
    type_id: null,
    // انواع افزودهٔ کارگاه، کنار کاتالوگ. کاربر: «قابل اضافه کردن باشه».
    custom_types: [],
    // طول شاخهٔ ماده. اگر type_id بدهی از کاتالوگ خوانده می‌شود و این نادیده
    // گرفته می‌شود. ۰ یعنی «محدودیت ندارم» → هر ران یک‌تکه.
    bar_length_mm: 3600,
    overhang_front_mm: 20,   // بیرون‌زدگی جلو نسبت به بدنهٔ کابینت
    overhang_side_mm: 0,     // بیرون‌زدگی سرِ آزاد
    // گوشه: فارسی ۴۵ یا اتصال مستقیم. کارگاه‌ها هر دو را کار می‌کنند.
    corner_joint: 'miter',   // 'miter' | 'butt'
    // درزِ ناشی از کوتاهی شاخه نباید هرجا بیفتد. اگر ران بلند باشد،
    // نزدیک‌ترین جای مجاز به وسط انتخاب می‌شود.
    min_piece_mm: 300
  };

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }

  /**
   * انواع صفحه: کاتالوگ مشترک + انواع افزودهٔ کارگاه.
   *
   * افزوده‌ها **بعد** می‌آیند و با همان id، کاتالوگ را بازنویسی می‌کنند —
   * پس کارگاهی که طول شاخهٔ تأمین‌کننده‌اش فرق دارد، می‌تواند همان نوع را
   * اصلاح کند بدون اینکه فایل مشترک را دست بزند.
   */
  function types(cfg) {
    var base = [];
    try {
      if (typeof KalaxaCatalog !== 'undefined' && KalaxaCatalog.isLoaded()) {
        base = KalaxaCatalog.countertopTypes() || [];
      }
    } catch (e) { base = []; }
    if (typeof require === 'function' && !base.length) {
      try { base = require('./kalaxa-catalog.js').countertopTypes() || []; }
      catch (e) { base = []; }
    }

    var byId = {};
    var out = [];
    base.concat((cfg && cfg.custom_types) || []).forEach(function (t) {
      if (!t || !t.id) return;
      if (byId[t.id]) {
        // بازنویسی در جای خودش می‌ماند تا ترتیب فهرست تکان نخورد.
        Object.keys(t).forEach(function (k) { byId[t.id][k] = t[k]; });
        return;
      }
      var copy = {};
      Object.keys(t).forEach(function (k) { copy[k] = t[k]; });
      byId[t.id] = copy;
      out.push(copy);
    });
    return out;
  }

  /** نوع انتخاب‌شده، یا null اگر کاربر نوعی نداده باشد. */
  function typeOf(cfg) {
    if (!cfg || !cfg.type_id) return null;
    var found = types(cfg).filter(function (t) { return t.id === cfg.type_id; })[0];
    return found || null;
  }
  function r1(n) { return Math.round(n * 10) / 10; }

  function cfgOf(o) {
    var c = {};
    Object.keys(DEFAULTS).forEach(function (k) { c[k] = DEFAULTS[k]; });
    Object.keys(o || {}).forEach(function (k) { if (o[k] != null) c[k] = o[k]; });
    return c;
  }

  /**
   * یک ران را به تکه‌های قابل‌برش می‌شکند.
   *
   * تقسیم **مساوی** است، نه «تا جا می‌شود بعد ته‌مانده»: دو تکهٔ ۲٫۱ متری از
   * یک تکهٔ ۳٫۶ و یک تکهٔ ۰٫۶ بهتر است — تکهٔ کوتاه هم بدقواره است هم موقع
   * نصب می‌لرزد.
   */
  function splitRun(lengthMm, cfg) {
    var bar = num(cfg.bar_length_mm);
    if (bar <= 0 || lengthMm <= bar) return [lengthMm];

    var n = Math.ceil(lengthMm / bar);
    var each = lengthMm / n;
    if (each < cfg.min_piece_mm) {
      // شاخه آن‌قدر کوتاه است که تکه‌ها بدقواره می‌شوند — بهتر است کاربر
      // بداند تا ماده عوض کند.
      return [lengthMm];
    }
    var out = [];
    for (var i = 0; i < n; i++) out.push(r1(each));
    return out;
  }

  /**
   * @param {Array} runs - [{id, label_fa, length_mm, depth_mm, starts_at_wall, ends_at_corner}]
   *   هر ران یک امتداد پیوسته روی یک دیوار است.
   * @param {object} [options]
   * @returns {{pieces:Array, totals:object, warnings:Array<string>}}
   */
  function plan(runs, options) {
    var cfg = cfgOf(options);
    var pieces = [];
    var warnings = [];

    // طول شاخه از نوع انتخاب‌شده می‌آید. اگر نوعی داده شده باشد که در
    // کاتالوگ نیست، **سکوت نمی‌کنیم**: عددِ پیش‌فرض ممکن است با ماده‌ای که
    // واقعاً می‌خرند فرق داشته باشد و درز جای غلط بیفتد.
    var t = typeOf(cfg);
    if (t) {
      cfg.bar_length_mm = num(t.bar_length_mm);
      cfg.bar_width_mm = t.bar_width_mm == null ? null : num(t.bar_width_mm);
      cfg.type_label_fa = t.label_fa;
      cfg.sold_by = t.sold_by;
    } else if (cfg.type_id) {
      warnings.push('نوع صفحهٔ «' + cfg.type_id + '» در کاتالوگ نیست — ' +
        'طول شاخهٔ ' + cfg.bar_length_mm + 'mm استفاده شد؛ در تنظیمات بررسی کنید');
    }

    (runs || []).forEach(function (run, ri) {
      var len = num(run.length_mm);
      var depth = num(run.depth_mm) + cfg.overhang_front_mm;

      // عمق در برابر **عرض** شاخه. تا پیش از این فقط طول بررسی می‌شد، پس
      // صفحهٔ جزیرهٔ ۹۰ سانتی از ورقی که ۷۶ است بی‌صدا «ممکن» شمرده
      // می‌شد — و کارگاه موقع سفارش می‌فهمید. عرضِ نامعلوم (null) هشدار
      // نمی‌دهد؛ حدس‌زدن بدتر از نگفتن است.
      if (cfg.bar_width_mm && depth > cfg.bar_width_mm) {
        warnings.push('ران «' + (run.label_fa || ri + 1) + '» با احتساب ' +
          'بیرون‌زدگی ' + r1(depth) + 'mm عمق دارد ولی عرض ' +
          (cfg.type_label_fa || 'شاخه') + ' ' + cfg.bar_width_mm + 'mm است — ' +
          'یک‌تکه درنمی‌آید؛ یا درز طولی لازم دارد یا ورق عریض‌تر');
      }

      if (len <= 0 || depth <= 0) {
        warnings.push('ران «' + (run.label_fa || ri + 1) + '» ابعاد معتبر ندارد');
        return;
      }

      var parts = splitRun(len, cfg);
      if (parts.length > 1) {
        warnings.push('ران «' + (run.label_fa || ri + 1) + '» (' + Math.round(len) +
          'mm) از شاخهٔ ' + cfg.bar_length_mm + 'mm بلندتر است — به ' +
          parts.length + ' تکه شکسته شد؛ جای درز را با سینک و اجاق چک کنید');
      }
      if (parts.length === 1 && len > num(cfg.bar_length_mm) && cfg.bar_length_mm > 0) {
        warnings.push('ران «' + (run.label_fa || ri + 1) + '» از شاخه بلندتر است ولی ' +
          'تقسیمش تکه‌های کوتاه‌تر از ' + cfg.min_piece_mm + 'mm می‌ساخت — ' +
          'ماده یا طول شاخه را بازبینی کنید');
      }

      // سرِ اول ران: به دیوار یا لبهٔ آزاد. سرِ آخر: گوشه یا لبهٔ آزاد.
      var firstEnd = run.starts_at_wall ? 'wall' : 'open';
      var lastEnd = run.ends_at_corner ? 'corner' : 'open';

      parts.forEach(function (pl, i) {
        var startKind = i === 0 ? firstEnd : 'joint';
        var endKind = i === parts.length - 1 ? lastEnd : 'joint';
        var extra = 0;
        if (startKind === 'open') extra += cfg.overhang_side_mm;
        if (endKind === 'open') extra += cfg.overhang_side_mm;

        pieces.push({
          id: (run.id || 'run' + ri) + ':' + (i + 1),
          run_id: run.id || 'run' + ri,
          label_fa: (run.label_fa || 'ران ' + (ri + 1)) +
                    (parts.length > 1 ? ' — تکهٔ ' + (i + 1) : ''),
          length_mm: r1(pl + extra),
          depth_mm: r1(depth),
          start: startKind,
          end: endKind,
          start_fa: END_KINDS[startKind],
          end_fa: END_KINDS[endKind],
          // گوشه فقط وقتی فارسی می‌خورد که کارگاه فارسی کار کند.
          corner_joint: endKind === 'corner' ? cfg.corner_joint : null
        });
      });
    });

    var totalLen = pieces.reduce(function (s, p) { return s + p.length_mm; }, 0);
    var joints = pieces.filter(function (p) { return p.end === 'joint'; }).length;
    var corners = pieces.filter(function (p) { return p.end === 'corner'; }).length;
    // لبهٔ آزاد پروفیل می‌خورد — متراژش جدا لازم است.
    var openEdges = pieces.reduce(function (s, p) {
      return s + (p.start === 'open' ? 1 : 0) + (p.end === 'open' ? 1 : 0);
    }, 0);

    return {
      pieces: pieces,
      type: t ? { id: t.id, label_fa: t.label_fa, bar_length_mm: t.bar_length_mm,
                  bar_width_mm: t.bar_width_mm == null ? null : num(t.bar_width_mm),
                  sold_by: t.sold_by } : null,
      order: orderSpec(pieces, t, cfg),
      totals: {
        piece_count: pieces.length,
        total_length_mm: r1(totalLen),
        total_length_m: r1(totalLen / 1000),
        // مساحت برای سفارش سنگ/کورین
        area_m2: Math.round(pieces.reduce(function (s, p) {
          return s + p.length_mm * p.depth_mm;
        }, 0) / 1e6 * 100) / 100,
        joints: joints,
        corners: corners,
        open_ends: openEdges
      },
      warnings: warnings
    };
  }

  /**
   * رآن‌ها را از دیوارهای نقشهٔ نصب می‌سازد.
   *
   * فقط کابینت‌های **زمینی** صفحه می‌گیرند: هوایی و قدی صفحهٔ کار ندارند.
   * بدون این فیلتر، متراژ سفارش دو برابر می‌شد.
   */
  function runsFromWalls(walls) {
    return (walls || []).map(function (w, i) {
      var base = (w.items || []).filter(function (it) {
        return (it.cab && it.cab.category) === 'base';
      });
      if (!base.length) return null;

      var s0 = Math.min.apply(null, base.map(function (it) { return num(it.s_mm); }));
      var s1 = Math.max.apply(null, base.map(function (it) { return num(it.s_mm) + num(it.w_mm); }));
      var depth = Math.max.apply(null, base.map(function (it) { return num(it.d_mm); }));

      return {
        id: w.wall_id || ('wall' + (i + 1)),
        label_fa: w.label_fa || ('دیوار ' + (i + 1)),
        length_mm: r1(s1 - s0),
        depth_mm: depth,
        starts_at_wall: true,
        // اگر دیوار دیگری هم کابینت زمینی دارد، این ران به گوشه می‌رسد.
        ends_at_corner: false
      };
    }).filter(Boolean);
  }

  /**
   * چه چیزی و با چه مشخصاتی سفارش داده شود.
   *
   * واحد خرید با واحد برش یکی نیست و همین‌جا اشتباه می‌شود:
   *
   * - {@code bar}  — با **شاخه** خریده می‌شود. تکه‌ها را نمی‌شود آزادانه
   *   کنار هم چید؛ هر تکه از یک شاخه درمی‌آید و ته‌مانده‌اش ضایعات است.
   *   پس شمارش شاخه بر پایهٔ **جا شدن تکه‌ها** است نه تقسیم متراژ کل.
   * - {@code area} — با **متر مربع** خریده می‌شود (کورین، سنگ). این‌جا
   *   متراژ ملاک است، ولی ابعاد ورق باز هم لازم است: تکه‌ای بلندتر یا
   *   عریض‌تر از ورق، هرچقدر هم متراژ کم باشد، درنمی‌آید.
   */
  function orderSpec(pieces, t, cfg) {
    var barL = num(cfg.bar_length_mm);
    var barW = cfg.bar_width_mm == null ? null : num(cfg.bar_width_mm);
    var soldBy = (t && t.sold_by) || cfg.sold_by || 'bar';
    var sizeFa = barL > 0
      ? (barL + (barW ? '×' + barW : '') + 'mm')
      : 'ابعاد شاخه نامعلوم';

    var area = pieces.reduce(function (s, p) {
      return s + p.length_mm * p.depth_mm;
    }, 0) / 1e6;

    // تکه‌ای پهن‌تر از عرض شاخه یعنی دو نوار باید طولی به هم بخورند. آن
    // وقت نه شمارش شاخه معتبر است نه متراژ خام — و عددِ مطمئنِ غلط بدتر
    // از اعتراف است.
    var overWide = barW
      ? pieces.filter(function (p) { return p.depth_mm > barW; }).length
      : 0;

    if (soldBy === 'area') {
      return { sold_by: 'area', unit_fa: 'متر مربع',
               qty: Math.round(area * 100) / 100,
               sheet_size_fa: sizeFa,
               over_wide: overWide,
               text_fa: Math.round(area * 100) / 100 + ' متر مربع ' +
                        ((t && t.label_fa) || '') + '، از ورق ' + sizeFa +
                        (overWide ? ' — بدون احتساب درز طولی' : '') };
    }

    // شمارش شاخه: هر شاخه تا وقتی جا دارد تکه می‌گیرد (اولین‌جا-که-جا-شود).
    // تقسیم متراژ کل بر طول شاخه عدد کمتری می‌دهد و ماده کم می‌آید.
    var bars = 0;
    if (barL > 0) {
      var rem = [];
      pieces.slice().sort(function (a, b) { return b.length_mm - a.length_mm; })
        .forEach(function (p) {
          var i = 0;
          for (; i < rem.length; i++) {
            if (rem[i] >= p.length_mm) { rem[i] -= p.length_mm; break; }
          }
          if (i === rem.length) { rem.push(barL - Math.min(p.length_mm, barL)); }
        });
      bars = rem.length;
    }
    if (overWide) {
      // شمارش را **نمی‌دهیم**، چون معلوم نیست هر تکه از چند نوار درمی‌آید.
      return { sold_by: 'bar', unit_fa: 'شاخه', qty: null,
               sheet_size_fa: sizeFa, over_wide: overWide,
               text_fa: 'تعداد شاخه محاسبه نشد — ' + overWide +
                        ' تکه از عرض شاخه پهن‌تر است و درز طولی می‌خواهد؛ ' +
                        'اول عرض ماده یا محل درز را مشخص کنید' };
    }
    return { sold_by: 'bar', unit_fa: 'شاخه', qty: bars,
             sheet_size_fa: sizeFa, over_wide: 0,
             text_fa: bars > 0
               ? bars + ' شاخهٔ ' + ((t && t.label_fa) || '') + ' ' + sizeFa
               : 'طول شاخه نامعلوم — تعداد شاخه محاسبه نشد' };
  }

  function fa(n) {
    return String(n).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
  }

  function tableHtml(res) {
    if (!res.pieces.length) return '<div class="msg info">صفحهٔ کاری محاسبه نشد</div>';
    return '<table><tr><th>#</th><th>تکه</th><th>طول (mm)</th><th>عمق (mm)</th>' +
      '<th>سر اول</th><th>سر دوم</th></tr>' +
      res.pieces.map(function (p, i) {
        return '<tr><td class="num">' + fa(i + 1) + '</td>' +
          '<td>' + p.label_fa + '</td>' +
          '<td class="num">' + fa(p.length_mm) + '</td>' +
          '<td class="num">' + fa(p.depth_mm) + '</td>' +
          '<td>' + p.start_fa + '</td>' +
          '<td>' + p.end_fa +
            (p.corner_joint === 'miter' ? ' (فارسی ۴۵°)' : '') + '</td></tr>';
      }).join('') + '</table>' +
      '<div class="meta">' + fa(res.totals.piece_count) + ' تکه، ' +
      fa(res.totals.total_length_m) + ' متر، ' + fa(res.totals.area_m2) + ' m² — ' +
      fa(res.totals.joints) + ' درز اتصال، ' + fa(res.totals.corners) + ' گوشه، ' +
      fa(res.totals.open_ends) + ' لبهٔ آزاد.</div>' +
      // جدول بالا **برش** است؛ این سطر **خرید**. دو واحد متفاوت‌اند و
      // نگفتنِ صریحش یعنی کارگاه متراژ کل را بر طول شاخه تقسیم کند و
      // ماده کم بیاورد.
      (res.order
        ? '<div class="msg info">سفارش: <b>' + fa(res.order.text_fa) + '</b>' +
          (res.order.sold_by === 'bar'
            ? ' <span class="meta">— شمارش بر پایهٔ جا شدن تکه‌ها در شاخه است، ' +
              'نه تقسیم متراژ کل</span>'
            : ' <span class="meta">— با متر مربع خریده می‌شود، ولی هیچ تکه‌ای ' +
              'نباید از ورق بزرگ‌تر باشد</span>') + '</div>'
        : '');
  }

  return { VERSION: VERSION, DEFAULTS: DEFAULTS, END_KINDS: END_KINDS,
           plan: plan, splitRun: splitRun, runsFromWalls: runsFromWalls,
           types: types, typeOf: typeOf, tableHtml: tableHtml };
}));
