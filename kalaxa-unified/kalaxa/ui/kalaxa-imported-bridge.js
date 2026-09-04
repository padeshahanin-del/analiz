/**
 * Kalaxa Imported Bridge — کابینت اسکن‌شده → همان چیزی که بقیهٔ برنامه می‌فهمد
 *
 * کاربر گزارش داد: «توی کابینت‌ها اضافه نشده، توی نقشه برش نیومده».
 *
 * علت ساختاری بود، نه یک باگ کوچک: اسکنر کابینت‌های خوانده‌شده را در
 * `raw_cabinets` می‌گذاشت، ولی **هیچ‌چیز جز جدول خودشان** آن را نمی‌خواند.
 * نستینگ، نقشهٔ برش، گزارش متریال، شیت قیمت و BOM همه از `parts_flat` و
 * `cabinets` می‌خوانند. یعنی کاربر کابینتش را اسکن می‌کرد، جدول درست پر
 * می‌شد، و بعد هیچ‌کجا اثری از آن نبود. کارِ نیمه‌تمام بدتر از کارِ نکرده
 * است، چون کاربر فکر می‌کند انجام شده.
 *
 * این ماژول همان پل است. تبدیل به تمپلیت پارامتریک **نیست** — مدل کاربر
 * دست‌نخورده می‌ماند و فقط قطعاتش به زبان مشترک ترجمه می‌شوند.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KalaxaImportedBridge = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  // نقش‌هایی که ورق نیستند و در برش‌خور نمی‌آیند.
  var NON_SHEET_ROLES = { hardware: true };

  // نقش‌هایی که معمولاً از ورق **نما** بریده می‌شوند، نه ورق بدنه.
  var FRONT_ROLES = { door: true, drawer_front: true };

  var ROLE_KEYS = {
    side: 'side', bottom: 'bottom', top_bottom: 'top_bottom', shelf: 'shelf',
    back: 'back', rail_top: 'rail_top', door: 'door', drawer_front: 'drawer_front',
    drawer_side: 'drawer_side', drawer_back: 'drawer_back', drawer_bottom: 'drawer_bottom',
    unknown: 'unknown'
  };

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }

  /**
   * ابعاد کابینت از جعبه‌های خودش، به **سانتی‌متر**.
   *
   * یک رقم اعشار نگه می‌داریم: گرد کردن به عدد صحیح، کابینت ۵۶۸ میلی را ۵۷
   * سانت می‌کند و بقیهٔ برنامه دوباره در ۱۰ ضرب می‌کند → ۵۷۰. دو میلی‌متر خطا
   * روی هر کابینت، در نقشهٔ نصب یک ردیف کامل را جابه‌جا می‌کند.
   *
   * درب و دستگیره بیرون از پوستهٔ کابینت می‌ایستند؛ عرضِ **نصب** همان پوسته
   * است، پس یراق کنار گذاشته می‌شود.
   */
  function dimsCm(boxes, parts) {
    // یراق از پوستهٔ کابینت بیرون است و نباید در ابعادش بیاید.
    //
    // کاربر: «پایه جزو ارتفاع لیست کابینت‌ها نباشه». پایه زیر کف می‌نشیند
    // (z منفی)، دستگیره جلوتر از درب. اگر در ابعاد بیایند، کابینت ۷۲ سانتی
    // ۸۲ گزارش می‌شود و نقشهٔ نصب یک ردیف کامل را جابه‌جا می‌کند.
    //
    // **کامنت نسخهٔ اول همین را ادعا می‌کرد ولی هیچ فیلتری نداشت.** کامنتی
    // که کاری را که نمی‌کند ادعا کند، از نبودش بدتر است: خواننده باور می‌کند
    // و دنبال باگ جای دیگر می‌گردد.
    var skip = {};
    (parts || []).forEach(function (p) {
      if (p.role !== 'hardware') return;
      (p.ids || []).forEach(function (id) { skip[id] = true; });
    });

    var list = (boxes || []).filter(function (b) {
      if (skip[b.id]) return false;
      return num(b.dx) > 0 && num(b.dy) > 0 && num(b.dz) > 0;
    });
    if (!list.length) return { cabinet_width: null, cabinet_height: null, cabinet_depth: null };

    var x0 = Infinity, y0 = Infinity, z0 = Infinity;
    var x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    list.forEach(function (b) {
      x0 = Math.min(x0, num(b.x)); y0 = Math.min(y0, num(b.y)); z0 = Math.min(z0, num(b.z));
      x1 = Math.max(x1, num(b.x) + num(b.dx));
      y1 = Math.max(y1, num(b.y) + num(b.dy));
      z1 = Math.max(z1, num(b.z) + num(b.dz));
    });
    var cm = function (mm) { return Math.round(mm) / 10; };
    return { cabinet_width: cm(x1 - x0), cabinet_height: cm(z1 - z0), cabinet_depth: cm(y1 - y0) };
  }

  // آستانه‌ها عمداً همان‌هایی است که KalaxaAdopt برای حدس تمپلیت می‌زند.
  // اگر دو جا دو قاعده داشته باشند، یک کابینت در تب کابینت‌ها «زمینی» و در
  // پیشنهاد تبدیل «دیواری» می‌شود — و کاربر حق دارد به هیچ‌کدام اعتماد نکند.
  var TALL_MIN_CM = 140;
  var WALL_MAX_DEPTH_CM = 40;
  var WALL_MAX_HEIGHT_CM = 100;

  function categoryOf(dims) {
    var h = num(dims.cabinet_height);
    var d = num(dims.cabinet_depth);
    if (h >= TALL_MIN_CM) return 'tall';
    // کابینت دیواری کف ندارد که روی زمین بنشیند؛ نشانهٔ عملی‌اش عمق کم است.
    if (d > 0 && d <= WALL_MAX_DEPTH_CM && h <= WALL_MAX_HEIGHT_CM) return 'wall';
    return 'base';
  }

  /**
   * انتخاب ورق برای یک قطعه.
   *
   * ضخامت حرف اول را می‌زند: قطعهٔ ۸ میلی را نمی‌شود از ورق ۱۶ برید. اگر
   * ضخامت دقیق نبود، **نزدیک‌ترین** انتخاب می‌شود و صریح هشدار داده می‌شود —
   * سکوت یعنی کارگاه ورق غلط سفارش می‌دهد.
   */
  function pickSheet(part, sheets, prefs) {
    var thick = num(part.thickness_mm);
    var wanted = FRONT_ROLES[part.role] ? prefs.door_sheet_id : prefs.body_sheet_id;

    var exact = sheets.filter(function (s) { return num(s.thickness_mm) === thick; });
    if (exact.length) {
      var preferred = exact.find(function (s) { return s.sheet_id === wanted; });
      return { sheet_id: (preferred || exact[0]).sheet_id, exact: true };
    }
    if (!sheets.length) return { sheet_id: null, exact: false };

    // نزدیک‌ترین ضخامت — ولی ترجیح نقش همچنان معتبر است. نسخهٔ اول ترجیح را
    // فقط در حالت تطابق دقیق نگاه می‌کرد، پس دربِ ۱۸ میلی (که ورق ۱۸ نداشتیم)
    // از ورق **بدنه** بریده می‌شد نه ورق نما — یعنی درب سفید به‌جای هایگلاس.
    var d = function (s) { return Math.abs(num(s.thickness_mm) - thick); };
    var nearest = Math.min.apply(null, sheets.map(d));
    var tied = sheets.filter(function (s) { return d(s) === nearest; });
    var best = tied.find(function (s) { return s.sheet_id === wanted; }) || tied[0];
    return { sheet_id: best.sheet_id, exact: false, got: num(best.thickness_mm) };
  }

  /**
   * @param {object} raw - یک عضو snapshot.raw_cabinets ({kalaxa_id, label_fa, boxes})
   * @param {Array} groupedParts - خروجی KalaxaPartClassifier.group (با qty و ids)
   * @param {object} opts - { sheets, body_sheet_id, door_sheet_id, label_fa, overrides }
   * @returns {{cabinet:object, parts_flat:Array, warnings:Array<string>}}
   */
  function build(raw, groupedParts, opts) {
    opts = opts || {};
    var sheets = opts.sheets || [];
    var prefs = { body_sheet_id: opts.body_sheet_id, door_sheet_id: opts.door_sheet_id };
    var warnings = [];
    var id = raw.kalaxa_id;

    var rows = [];
    var seq = 0;
    var inexact = 0;
    var unknown = 0;

    (groupedParts || []).forEach(function (p) {
      if (NON_SHEET_ROLES[p.role]) return;
      var qty = num(p.qty) || 1;
      var L = num(p.cut_length_mm);
      var W = num(p.cut_width_mm);
      var T = num(p.thickness_mm);
      // قطعه‌ای که ابعادش معلوم نیست نباید بی‌صدا وارد برش‌خور شود: نستینگ
      // آن را جا می‌دهد و کارگاه تخته‌ای می‌برد که وجود ندارد.
      if (!(L > 0 && W > 0 && T > 0)) {
        warnings.push('قطعهٔ «' + (p.name || '—') + '» ابعاد معتبر ندارد و در برش‌خور نیامد');
        return;
      }
      if (p.role === 'unknown') unknown += qty;

      var s = pickSheet(p, sheets, prefs);
      if (!s.exact && s.sheet_id) inexact += 1;

      seq += 1;
      rows.push({
        key: ROLE_KEYS[p.role] || 'unknown',
        name_fa: p.role_label_fa || p.name || 'نامشخص',
        count: qty,
        cut_length_mm: Math.round(L),
        cut_width_mm: Math.round(W),
        thickness_mm: Math.round(T),
        sheet_id: s.sheet_id,
        grain: 'none',
        allow_rotation: true,
        edge: p.edge || {},
        groove: p.groove || {},
        // نامِ گروه در مدل می‌ماند تا کارگاه بتواند ردیف برش را در مدل پیدا کند.
        note: p.name || '',
        part_uid: id + ':imp:' + seq,
        cabinet_id: id,
        // نشانهٔ صریح «این از اسکن آمده، نه از تمپلیت» — گزارش‌ها می‌توانند
        // بگویند کدام عدد حدسی است و کدام ساخته‌شده.
        source: 'imported',
        machined: !!p.machined
      });
    });

    if (inexact) {
      warnings.push(inexact + ' قطعه ضخامتش با هیچ ورقی دقیقاً نخواند — ' +
        'نزدیک‌ترین ورق انتخاب شد؛ در تب تنظیمات ورق درست را اضافه کنید');
    }
    if (unknown) {
      warnings.push(unknown + ' قطعه با نقش «نامشخص» وارد برش‌خور شد — ' +
        'نقش را در جدول قطعات خوانده‌شده اصلاح کنید تا نوار و شیارش درست بیاید');
    }

    var dims = dimsCm(raw.boxes, groupedParts);
    return {
      cabinet: {
        kalaxa_id: id,
        template_id: 'imported',
        // دستهٔ واقعی، نه برچسب «imported».
        //
        // نسخهٔ اول `category: 'imported'` می‌گذاشت. هیچ‌جای برنامه این دسته را
        // نمی‌شناسد: تب کابینت‌ها «imported» خام نشان می‌داد، نقشهٔ نصب رنگ
        // پیش‌فرض می‌داد، و **صفحهٔ کار** فقط روی `base` کشیده می‌شود — پس
        // کابینت زمینیِ خوانده‌شده بی‌صفحه می‌ماند.
        category: categoryOf(dims),
        label_fa: opts.label_fa || raw.label_fa || 'کابینت خوانده‌شده',
        // **سانتی‌متر**، چون همه‌جای برنامه `params.cabinet_*` را cm می‌خواند و
        // در ۱۰ ضرب می‌کند (نقشهٔ نصب، شیت قیمت، چک استاندارد، BOM یراق).
        //
        // نسخهٔ اول از `raw.bounds_mm` می‌خواند — میدانی که اسکنر **هرگز
        // نمی‌سازد**. نتیجه: هر سه بعد null، و کابینت خوانده‌شده در تب کابینت‌ها
        // و نقشهٔ نصب صفر در صفر بود. عدد از هیچ‌جا نمی‌آید مگر از خودِ قطعات.
        params: dims,
        source: 'imported',
        world_transform: raw.world_transform || { origin_cm: [0, 0, 0], rotation_z_deg: 0 }
      },
      parts_flat: rows,
      warnings: warnings
    };
  }

  /**
   * اسنپ‌شاتِ «مؤثر»: همان اسنپ‌شات به‌علاوهٔ کابینت‌های خوانده‌شده.
   *
   * همه‌جای برنامه باید از این بخواند، نه از اسنپ‌شات خام. اگر یک مصرف‌کننده
   * جا بماند، همان باگِ اول دوباره ساخته می‌شود — منتها این بار فقط در یک تب.
   */
  function effectiveSnapshot(snapshot, builders) {
    if (!snapshot) return snapshot;
    var raws = snapshot.raw_cabinets || [];
    if (!raws.length) return snapshot;

    var cabinets = (snapshot.cabinets || []).slice();
    var parts = (snapshot.parts_flat || []).slice();
    var warnings = [];

    raws.forEach(function (raw) {
      var built = builders(raw);
      if (!built) return;
      // اگر کاربر همین کابینت را قبلاً «تبدیل» کرده باشد، نسخهٔ پارامتریکش
      // از قبل در cabinets هست و نباید دوبار شمرده شود.
      if (cabinets.some(function (c) { return c.kalaxa_id === built.cabinet.kalaxa_id; })) return;
      cabinets.push(built.cabinet);
      parts = parts.concat(built.parts_flat);
      warnings = warnings.concat(built.warnings || []);
    });

    var out = {};
    Object.keys(snapshot).forEach(function (k) { out[k] = snapshot[k]; });
    out.cabinets = cabinets;
    out.parts_flat = parts;
    out.imported_warnings = warnings;
    return out;
  }

  return { VERSION: VERSION, build: build, effectiveSnapshot: effectiveSnapshot,
           pickSheet: pickSheet, dimsCm: dimsCm, categoryOf: categoryOf,
           NON_SHEET_ROLES: NON_SHEET_ROLES };
}));
