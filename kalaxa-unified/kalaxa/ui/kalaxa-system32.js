/**
 * Kalaxa System 32 — ردیف سوراخ پین طبقه روی دیواره
 *
 * تا اینجا پین طبقه فقط **شمرده** می‌شد (۴ به ازای هر طبقه) ولی جای سوراخش
 * هیچ‌جا گفته نمی‌شد. یعنی کارگاه پین را می‌خرید و بعد دستی متر می‌کرد —
 * جایی که طبقه‌های چپ و راست هم‌تراز درنمی‌آیند.
 *
 * این ماژول سوراخ‌ها را به همان شکلی می‌سازد که `KalaxaCncSheet` از اسکنر
 * می‌گیرد (`{u_mm, v_mm, dia_mm, depth_mm, through}`)، پس نقشه و جدولش
 * همان مسیر موجود است و کد رسم تازه‌ای لازم ندارد.
 *
 * چهار چیزی که این‌جا اگر اشتباه شود، تخته دور ریخته می‌شود:
 *
 * ۱. **کدام لبه طول است؟** برای دیوارهٔ کابینت قدی، طول = ارتفاع و عرض =
 *    عمق؛ ولی برای دیوارهٔ یک کابینت کوتاه و عمیق برعکس می‌شود. حدس زدن
 *    یعنی شبکهٔ سوراخ ۹۰ درجه چرخیده. پس ارتفاع و عمقِ واقعی گرفته می‌شود
 *    و با ابعاد برش **تطبیق** داده می‌شود؛ اگر نخواند، سوراخ ساخته
 *    **نمی‌شود** و خطا داده می‌شود.
 *
 * ۲. **قرینه.** دیوارهٔ چپ و راست هم‌اندازه‌اند و هر دو روی میز دستگاه
 *    رو-به-داخل می‌خوابند؛ پس لبهٔ جلو در یکی سمت راست است و در دیگری سمت
 *    چپ. اگر قرینه نشود، یکی از دو دیواره سوراخش از عقب زده می‌شود.
 *
 * ۳. **سرتاسری نشدن.** سوراخ پین اگر از تخته رد شود، از بیرونِ کابینت
 *    دیده می‌شود. عمق در برابر ضخامت تخته بررسی می‌شود.
 *
 * ۴. **مبدأ مشترک.** هر دو دیواره از **کف** اندازه می‌خورند، نه از سقف.
 *    اگر یکی از کف و یکی از سقف اندازه بخورد، در ارتفاعِ غیرمضربِ ۳۲
 *    طبقه کج می‌نشیند.
 *
 * دربارهٔ تعداد: ردیفِ **کامل** زده می‌شود تا طبقه بعداً جابه‌جا شود، ولی
 * پین فقط به‌اندازهٔ طبقه‌های موجود خریده می‌شود. این دو عدد عمداً یکی
 * نیستند و `kalaxa-hardware.js` دست‌نخورده می‌ماند.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KalaxaSystem32 = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  // اگر کاتالوگ نبود. عمداً همان اعداد `data/system32.json`.
  var FALLBACK = {
    pitch_mm: 32, dia_mm: 5, depth_mm: 13,
    front_setback_mm: 37, back_setback_mm: 37,
    end_clearance_mm: 32, min_wall_left_mm: 3,
    collision_clearance_mm: 6,
    pinned_roles: ['side', 'divider']
  };

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }
  function isNum(n) { return typeof n === 'number' && isFinite(n); }

  function catalog() {
    try {
      if (typeof KalaxaCatalog !== 'undefined' && KalaxaCatalog.isLoaded()) {
        return KalaxaCatalog.get('system32') || FALLBACK;
      }
    } catch (e) { /* پایین می‌افتد */ }
    if (typeof require === 'function') {
      try { return require('./kalaxa-catalog.js').get('system32') || FALLBACK; }
      catch (e) { /* تهی */ }
    }
    return FALLBACK;
  }

  function params(overrides) {
    var c = catalog();
    var p = {};
    Object.keys(FALLBACK).forEach(function (k) {
      p[k] = c[k] != null ? c[k] : FALLBACK[k];
    });
    Object.keys(overrides || {}).forEach(function (k) {
      if (overrides[k] != null) p[k] = overrides[k];
    });
    return p;
  }

  function pinned(role, p) {
    return (p.pinned_roles || []).indexOf(String(role)) >= 0;
  }

  /**
   * کدام بعدِ برش ارتفاع است و کدام عمق.
   *
   * حدس بر پایهٔ «بزرگ‌تر = ارتفاع» زده **نمی‌شود**: دیوارهٔ یک کابینت
   * زمینی ۷۲ در عمق ۵۵ نزدیک به مربع است و یک کابینت کم‌ارتفاعِ عمیق کاملاً
   * برعکس. به‌جایش ابعاد واقعیِ یونیت با ابعاد برش تطبیق داده می‌شود.
   *
   * @returns {{ok:boolean, uIsHeight:boolean, reason:string}}
   */
  function orient(part, heightMm, depthMm, tolMm) {
    var tol = isNum(tolMm) ? tolMm : 1.5;
    var L = num(part && part.cut_length_mm), W = num(part && part.cut_width_mm);
    var near = function (a, b) { return Math.abs(a - b) <= tol; };

    var asHeight = near(L, heightMm) && near(W, depthMm);
    var asDepth = near(W, heightMm) && near(L, depthMm);

    if (asHeight && asDepth) {
      // دیوارهٔ مربع: هر دو می‌خوانَد و هیچ‌کدام قابل اثبات نیست.
      return { ok: false, uIsHeight: true,
               reason: 'دیواره تقریباً مربع است (' + Math.round(L) + '×' +
                       Math.round(W) + ') و معلوم نیست کدام لبه ارتفاع است — ' +
                       'جهت را دستی مشخص کنید' };
    }
    if (asHeight) return { ok: true, uIsHeight: true, reason: '' };
    if (asDepth) return { ok: true, uIsHeight: false, reason: '' };

    return { ok: false, uIsHeight: true,
             reason: 'ابعاد برش (' + Math.round(L) + '×' + Math.round(W) +
                     ') با ارتفاع ' + Math.round(heightMm) + ' و عمق ' +
                     Math.round(depthMm) + ' نمی‌خوانَد — سوراخ زده نشد' };
  }

  /**
   * ترازهای سوراخ در راستای ارتفاع، از **کف** دیواره.
   *
   * از مضربِ ۳۲ شروع می‌شود تا مبدأ همهٔ دیواره‌های پروژه یکی باشد؛ اگر هر
   * دیواره از فاصلهٔ آزادِ خودش شروع کند، طبقه بین دو دیوارهٔ مجاور
   * هم‌تراز درنمی‌آید.
   */
  function levels(heightMm, p) {
    var pitch = num(p.pitch_mm);
    if (pitch <= 0) return [];
    var lo = num(p.end_clearance_mm);
    var hi = heightMm - num(p.end_clearance_mm);
    var out = [];
    var z = Math.ceil(lo / pitch) * pitch;
    for (; z <= hi + 1e-6; z += pitch) out.push(Math.round(z * 10) / 10);
    return out;
  }

  function hit(hole, avoid, clr) {
    for (var i = 0; i < (avoid || []).length; i++) {
      var a = avoid[i];
      var dx = num(a.u_mm) - hole.u_mm, dy = num(a.v_mm) - hole.v_mm;
      var lim = clr + num(a.dia_mm) / 2 + hole.dia_mm / 2;
      if (Math.sqrt(dx * dx + dy * dy) < lim) return a;
    }
    return null;
  }

  /**
   * ردیف سوراخ برای یک دیواره.
   *
   * @param part {role, cut_length_mm, cut_width_mm, thickness_mm, name}
   * @param spec {height_mm, depth_mm, mirror, shelf_levels_mm, avoid, both_faces}
   * @param overrides جایگزینی پارامترهای کاتالوگ (تنظیمات کارگاه)
   * @returns {{holes, rows, warnings, shelf_holes}}
   */
  function planPart(part, spec, overrides) {
    var p = params(overrides);
    var s = spec || {};
    var warnings = [];
    var none = function () {
      return { holes: [], rows: 0, warnings: warnings, shelf_holes: [] };
    };

    if (!pinned(part && part.role, p)) return none();

    var H = num(s.height_mm), D = num(s.depth_mm);
    if (!(H > 0 && D > 0)) {
      warnings.push('ارتفاع یا عمق دیواره داده نشد — ردیف پین ساخته نشد');
      return none();
    }

    var o = orient(part, H, D);
    if (!o.ok) { warnings.push(o.reason); return none(); }

    // عمق کور: نباید از تخته بزند بیرون.
    var th = num(part.thickness_mm);
    var depth = num(p.depth_mm);
    if (th > 0 && depth + num(p.min_wall_left_mm) > th) {
      warnings.push('عمق سوراخ ' + Math.round(depth) + ' روی تختهٔ ' +
        Math.round(th) + ' میلی‌متری از پشت می‌زند بیرون — ' +
        'عمق را کم کنید یا تختهٔ ضخیم‌تر بگذارید');
      return none();
    }

    // دو ردیف در راستای عمق: جلو و عقب.
    var vFront = num(p.front_setback_mm);
    var vBack = D - num(p.back_setback_mm);
    if (vBack <= vFront) {
      warnings.push('عمق ' + Math.round(D) + ' برای دو ردیف پین کم است — ' +
        'ردیف‌ها روی هم می‌افتند');
      return none();
    }
    var vs = [vFront, vBack];

    // قرینه: لبهٔ جلو در دیوارهٔ روبه‌رو آن‌سو می‌افتد.
    if (s.mirror) vs = vs.map(function (v) { return D - v; });

    var zs = levels(H, p);
    if (!zs.length) {
      warnings.push('ارتفاع ' + Math.round(H) + ' برای هیچ سوراخ پینی جا ندارد');
      return none();
    }

    var holes = [];
    var collided = 0;
    zs.forEach(function (z) {
      vs.forEach(function (v) {
        var h = {
          u_mm: o.uIsHeight ? z : v,
          v_mm: o.uIsHeight ? v : z,
          dia_mm: num(p.dia_mm),
          depth_mm: depth,
          through: false,
          source: 'system32',
          height_mm: z          // ترازِ طبقه، مستقل از جهتِ تخته
        };
        if (hit(h, s.avoid, num(p.collision_clearance_mm))) { collided++; return; }
        holes.push(h);
      });
    });

    if (collided) {
      warnings.push(fa(collided) + ' سوراخ پین در حریم لولا یا مینی‌فیکس ' +
        'می‌افتاد و زده نشد — اگر طبقه در آن تراز لازم است، دستی جابه‌جا کنید');
    }

    // کدام سوراخ‌ها ترازِ طراحی‌شدهٔ طبقه‌اند.
    var want = (s.shelf_levels_mm || []).map(num);
    var shelf = [];
    want.forEach(function (z) {
      var best = null, bd = Infinity;
      zs.forEach(function (g) {
        var d = Math.abs(g - z);
        if (d < bd) { bd = d; best = g; }
      });
      if (best == null) return;
      shelf.push({ wanted_mm: Math.round(z * 10) / 10, hole_mm: best,
                   off_mm: Math.round((best - z) * 10) / 10 });
      if (bd > num(p.pitch_mm) / 2 + 0.1) {
        warnings.push('تراز طبقهٔ ' + fa(Math.round(z)) + ' روی هیچ سوراخی ' +
          'نمی‌افتد');
      } else if (bd > 0.5) {
        warnings.push('طبقهٔ ' + fa(Math.round(z)) + ' روی مضرب ۳۲ نیست؛ ' +
          'نزدیک‌ترین سوراخ ' + fa(Math.round(best)) + ' است (' +
          fa(Math.abs(Math.round(best - z))) + ' اختلاف)');
      }
    });

    return { holes: holes, rows: vs.length, warnings: warnings,
             shelf_holes: shelf, levels_mm: zs };
  }

  function fa(n) {
    return String(n).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * سوراخ‌های پین را به `features` قطعه اضافه می‌کند تا نقشهٔ CNC موجود
   * بدون تغییر آن‌ها را بکشد.
   *
   * سوراخِ خوانده‌شده از مدل **پاک نمی‌شود** — اگر مدل خودش پین دارد، هر دو
   * می‌مانند و تکراری‌بودنشان از فاصله پیداست؛ حذفِ خودکار یعنی سوراخِ
   * واقعیِ مدل بی‌صدا گم شود.
   */
  function attach(part, spec, overrides) {
    var res = planPart(part, spec, overrides);
    if (!res.holes.length) return res;
    var f = part.features || (part.features = {});
    f.holes = (f.holes || []).concat(res.holes);
    return res;
  }

  /**
   * همهٔ دیواره‌های یک کابینت.
   *
   * این‌جاست و نه در `analysis_panel.html` چون منطقِ داخل HTML قابل تست
   * نیست، و شکافِ «نویسنده و خواننده هم را نمی‌بینند» دقیقاً همان‌جا باز
   * می‌شود.
   *
   * ارتفاع و عمق از **جعبهٔ سه‌بعدی** گرفته می‌شود نه از ابعاد برش: جعبه
   * می‌داند کدام راستا بالاست، برگهٔ برش این را از دست داده.
   *
   * @param parts خروجی KalaxaPartClassifier (هر قطعه با `box`)
   * @returns {{sides:Array<{part,result}>, warnings:Array<string>}}
   */
  function planCabinet(parts, overrides) {
    var p = params(overrides);
    var list = (parts || []).filter(function (q) {
      return pinned(q.role, p) && q.box;
    });
    var out = { sides: [], warnings: [] };
    if (!list.length) return out;

    var xs = list.map(function (q) { return num(q.box.x); });
    var maxX = Math.max.apply(null, xs), minX = Math.min.apply(null, xs);

    list.forEach(function (q) {
      // قرارداد ثابت: دیوارهٔ سمتِ x بزرگ‌تر آینه می‌شود. کدام‌یک قراردادی
      // است ولی باید **ثابت** بماند، وگرنه دو بار اجرا دو نقشه می‌دهد.
      var mirror = maxX > minX && num(q.box.x) >= maxX - 1;
      var res = attach(q, {
        height_mm: num(q.box.dz),
        depth_mm: num(q.box.dy),
        mirror: mirror,
        avoid: (((q.features || {}).holes) || []).filter(function (h) {
          return h.source !== 'system32';   // پینِ خودمان حریمِ خودش نیست
        }),
        shelf_levels_mm: shelfLevels(parts, q)
      }, overrides);
      q._s32 = res;
      out.sides.push({ part: q, result: res, mirror: mirror });
      // هشدارِ «طبقه روی مضرب ۳۲ نیست» یک **خاصیت طرح** است نه یک تخته؛
      // دو دیوارهٔ روبه‌رو همان را می‌گویند. تکرارش کارگاه را کر می‌کند و
      // هشدارِ واقعیِ بعدی را زیر خودش دفن می‌کند.
      res.warnings.forEach(function (w) {
        var tag = (q.name ? '«' + q.name + '»: ' : '') + w;
        var shared = w.indexOf('طبقهٔ') === 0;
        var line = shared ? w : tag;
        if (out.warnings.indexOf(line) < 0) out.warnings.push(line);
      });
    });
    return out;
  }

  /** ترازِ کفِ طبقه‌های موجود، نسبت به کفِ همان دیواره. */
  function shelfLevels(parts, side) {
    var z0 = num(side.box.z);
    return (parts || []).filter(function (q) {
      return q.role === 'shelf' && q.box;
    }).map(function (q) { return num(q.box.z) - z0; })
      .filter(function (z) { return z > 0; });
  }

  /** خلاصه برای برگهٔ کارگاه. */
  function noteHtml(res) {
    if (!res || !res.holes.length) return '';
    var p = params();
    return '<div class="meta">ردیف پین سیستم ۳۲: ' + fa(res.holes.length) +
      ' سوراخ Ø' + fa(p.dia_mm) + ' به عمق ' + fa(p.depth_mm) +
      ' در ' + fa(res.rows) + ' ردیف، گام ' + fa(p.pitch_mm) +
      '، اندازه از <b>کف</b> دیواره. ردیف کامل زده می‌شود تا طبقه بعداً ' +
      'جابه‌جا شود؛ پین فقط به‌اندازهٔ طبقه‌های موجود خریده می‌شود.</div>' +
      (res.shelf_holes.length
        ? '<table><tr><th>طبقه</th><th>تراز طراحی</th><th>سوراخ</th></tr>' +
          res.shelf_holes.map(function (s, i) {
            return '<tr><td class="num">' + fa(i + 1) + '</td><td class="num">' +
              fa(Math.round(s.wanted_mm)) + '</td><td class="num">' +
              fa(Math.round(s.hole_mm)) +
              (Math.abs(s.off_mm) > 0.5 ? ' <span class="meta">(' +
                fa(Math.round(s.off_mm)) + ')</span>' : '') + '</td></tr>';
          }).join('') + '</table>'
        : '');
  }

  return { VERSION: VERSION, FALLBACK: FALLBACK, params: params,
           orient: orient, levels: levels, planPart: planPart,
           attach: attach, planCabinet: planCabinet, shelfLevels: shelfLevels,
           noteHtml: noteHtml, esc: esc };
}));
