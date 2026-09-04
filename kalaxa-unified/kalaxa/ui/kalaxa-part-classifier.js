/**
 * kalaxa-part-classifier.js — v1.0.0
 *
 * تشخیص خودکار «نقش» هر قطعه از روی هندسهٔ کابینتی که کاربر خودش در اسکچاپ ساخته
 * (مورد ۱۰ کاربر). تا این نسخه کالاکسا فقط کابینت‌هایی را می‌شناخت که ابزار خودش
 * ساخته بود (dictionary «kalaxa_cabinet»)؛ یعنی مدل‌های واقعی کارگاه اصلاً قابل
 * آنالیز نبودند. حالا از ابعاد/ضخامت/جهت هر جعبه نقشش حدس زده می‌شود.
 *
 * طبق تصمیم صریح کاربر، خروجی این موتور **نهایی نیست**: در پنل به‌صورت یک جدول
 * سادهٔ قابل‌ویرایش نشان داده می‌شود تا کاربر چک و در صورت لزوم اصلاح کند. پس هدف
 * «حدس خوب با اعتماد صادقانه» است، نه «حدس قطعی». هر قطعه یک confidence دارد و
 * موارد مشکوک صریح علامت می‌خورند تا کاربر بداند کجا را نگاه کند.
 *
 * قرارداد محورها (همان قرارداد CabinetGeometry): x = عرض، y = عمق (جلو y=0)،
 * z = ارتفاع (کف z=0). ورودی به میلی‌متر.
 * JS خالص، UMD، بدون وابستگی.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaPartClassifier = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  // نقش‌هایی که تشخیص داده می‌شوند — همان کلیدهای parts_flat که بقیهٔ موتورها می‌فهمند.
  var ROLES = ['side', 'bottom', 'top_bottom', 'shelf', 'back', 'rail_top', 'door',
               'drawer_front', 'drawer_side', 'drawer_back', 'drawer_bottom',
               'hardware', 'unknown'];

  var ROLE_LABELS_FA = {
    side: 'دیواره', bottom: 'کف', top_bottom: 'سقف/کف', shelf: 'طبقه', back: 'پشت‌بند',
    rail_top: 'قید', door: 'درب', drawer_front: 'نمای کشو', drawer_side: 'بدنه کشو',
    drawer_back: 'پشت کشو', drawer_bottom: 'کف کشو', hardware: 'یراق', unknown: 'نامشخص'
  };

  // آستانه‌ها — عمداً بیرون از توابع تا در تست/تنظیمات قابل تغییر باشند.
  var DEFAULTS = {
    // ضخامت بیشتر از این «قطعهٔ ضخیم» نیست (یعنی احتمالاً چند قطعهٔ چسبیده یا جسم غیرورقی)
    max_panel_thickness_mm: 40,
    // ورق نازک (پشت‌بند ۳/۸ میل). کاربر گفت گاهی پشت‌بند ۱۶میل سرتاسری است،
    // پس «نازکی» تنها معیار پشت‌بند نیست — موقعیت عقب هم لازم است.
    thin_sheet_max_mm: 10,
    // قطعه‌ای که در محور عمق خیلی کم‌عمق و در عرض بلند است = قید
    rail_max_depth_mm: 200,
    // رواداری برای «چسبیده به لبه» (mm)
    edge_tolerance_mm: 5,
    // نسبتِ «تقریباً تمام‌عرض/تمام‌قد» — نسبی است چون قطعات شیارخورده چند میلی‌متر کوچک‌ترند
    nearly_full_ratio: 0.9,
    // نمای جلویی که ارتفاعش کمتر از این نسبت از ارتفاع کابینت باشد = نمای کشو، وگرنه درب.
    // صرفِ «پهن‌تر از بلند» کافی نیست: یک درب تک ۸۰cm هم پهن‌تر از بلند است.
    drawer_front_max_height_ratio: 0.4,
    // سقف مطلق ارتفاع یک نمای کشو. نسبت به‌تنهایی کافی نیست: دو دربِ
    // روی‌همِ کابینت قدی هم «روی هم» اند — ولی هرکدام ۱۰۹۶ میلی است و
    // نمای کشو ندرتاً از ۴۰۰ بلندتر می‌شود (حتی کشوی قابلمه‌ای).
    drawer_front_max_height_mm: 400,
    // یراق‌آلات (لولا، ریل، دستگیره، پایه) در مدل هم گروه‌اند و اسکنر آن‌ها را
    // مثل هر قطعهٔ دیگر می‌بیند. کاربر دو «lola» را در جدول به‌صورت «نامشخص»
    // دید — که هم اشتباه است و هم اگر روزی برش‌خور از آن ساخته شود، ورق الکی
    // سفارش می‌دهد. هندسه اینجا کمک نمی‌کند (لولا هم یک جعبهٔ کوچک است)، پس
    // نام تنها سرنخ صادقانه است. الگوها اینجاست تا کارگاه بتواند نام‌های خودش
    // را اضافه کند — با options.hardware_name_patterns.
    hardware_name_patterns: [
      'لولا', 'lola', 'hinge', 'ریل', 'ril', 'slide', 'دستگیره', 'handle', 'knob',
      'پیچ', 'screw', 'قفل', 'lock', 'جک', 'piston', 'براکت', 'bracket',
      'پایه', 'leg', 'یراق', 'hardware'
    ],
    // نام قطعه در مدل کاربر معمولاً **نقشش را می‌گوید** («sheet back»،
    // «sheet up»، «Body Left»). تا این نسخه کاملاً نادیده گرفته می‌شد و فقط از
    // هندسه حدس زده می‌شد — نتیجه‌اش این بود که قطعه‌ای به‌نام «sheet back»
    // «قید» گزارش می‌شد و کاربر حق داشت بگوید «قابل اعتماد نیست».
    //
    // نام هم بی‌خطا نیست (کپی‌کردن قطعه نام قبلی را با خودش می‌برد)، پس نام
    // جای هندسه را نمی‌گیرد — کنارش می‌نشیند: توافق = اطمینان بالا،
    // اختلاف = اطمینان پایین و اعلام صریح هر دو حدس به کاربر.
    role_name_patterns: {
      side: ['body left', 'body right', 'side', 'دیواره', 'کناره', 'بدنه چپ', 'بدنه راست'],
      back: ['back', 'پشت‌بند', 'پشت بند'],
      bottom: ['down', 'bottom', 'کف'],
      top_bottom: ['up', 'top', 'سقف'],
      shelf: ['shelf', 'طبقه'],
      rail_top: ['rail', 'قید'],
      door: ['door', 'درب'],
      drawer_front: ['drawer front', 'نمای کشو'],
      drawer_side: ['drawer side', 'بدنه کشو'],
      drawer_back: ['drawer back', 'پشت کشو'],
      drawer_bottom: ['drawer bottom', 'کف کشو']
    }
  };

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }

  /** محور نازک یک جعبه: 'x' | 'y' | 'z' */
  function thinAxis(b) {
    var dx = num(b.dx), dy = num(b.dy), dz = num(b.dz);
    if (dx <= dy && dx <= dz) return 'x';
    if (dy <= dx && dy <= dz) return 'y';
    return 'z';
  }

  function thickness(b) { return num(b['d' + thinAxis(b)]); }

  /** محدودهٔ کلی مجموعهٔ قطعات — «پوستهٔ» کابینت */
  function boundsOf(boxes) {
    if (!boxes || !boxes.length) return null;
    var r = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
    boxes.forEach(function (b) {
      r.x0 = Math.min(r.x0, num(b.x)); r.y0 = Math.min(r.y0, num(b.y)); r.z0 = Math.min(r.z0, num(b.z));
      r.x1 = Math.max(r.x1, num(b.x) + num(b.dx));
      r.y1 = Math.max(r.y1, num(b.y) + num(b.dy));
      r.z1 = Math.max(r.z1, num(b.z) + num(b.dz));
    });
    r.w = r.x1 - r.x0; r.d = r.y1 - r.y0; r.h = r.z1 - r.z0;
    return r;
  }

  /**
   * تشخیص نقش یک قطعه.
   * @returns {{role:string, confidence:number, reason:string}}
   *   confidence بین ۰ و ۱ — عدد پایین یعنی «کاربر حتماً نگاه کند».
   */
  /**
   * آیا الگو در نام هست؟
   *
   * برای الگوی لاتین **مرز واژه** لازم است، وگرنه «up» داخل «group» و «leg» داخل
   * «legacy» پیدا می‌شود و قطعهٔ سالم را خراب گزارش می‌کند. فارسی مرز واژهٔ
   * قابل‌اتکا ندارد (نیم‌فاصله، چسبندگی)، پس زیررشته می‌ماند.
   */
  function nameHas(name, pat) {
    // «drawer_side» و «drawer-side» همان «drawer side» اند. بدون این یکسان‌سازی،
    // الگوی کوتاه‌ترِ «side» برنده می‌شد و بدنهٔ کشو، دیوارهٔ کابینت گزارش می‌شد.
    var n = String(name).toLowerCase().replace(/[_\-]+/g, ' ');
    var p = String(pat).toLowerCase();
    if (!/[a-z]/.test(p)) return n.indexOf(p) !== -1;
    var esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z0-9])' + esc + '([^a-z0-9]|$)').test(n);
  }

  /** آیا نام قطعه یراق را اعلام می‌کند؟ */
  function isHardwareName(name, cfg) {
    if (!name) return null;
    var pats = cfg.hardware_name_patterns || [];
    for (var i = 0; i < pats.length; i++) {
      if (nameHas(name, pats[i])) return pats[i];
    }
    return null;
  }

  /** نقشی که **نام** قطعه اعلام می‌کند — یا null. */
  function roleFromName(name, cfg) {
    if (!name) return null;
    var map = cfg.role_name_patterns || {};
    var best = null;
    Object.keys(map).forEach(function (role) {
      (map[role] || []).forEach(function (pat) {
        // بلندترین الگوی منطبق برنده است: «drawer back» باید بر «back» بچربد،
        // وگرنه بدنهٔ کشو پشت‌بندِ کابینت گزارش می‌شود.
        if (nameHas(name, pat) && (!best || String(pat).length > best.pat.length)) {
          best = { role: role, pat: String(pat) };
        }
      });
    });
    return best;
  }

  /** دو نقش که عملاً یک چیزند و اختلافشان هشدار ندارد. */
  function rolesCompatible(a, b) {
    if (a === b) return true;
    var pair = [a, b].sort().join('|');
    return pair === 'bottom|top_bottom' || pair === 'rail_top|top_bottom';
  }

  function classifyOne(b, bounds, cfg) {
    // نام اول: یراق را نباید با هندسه حدس زد. یک لولا دقیقاً شبیه یک قطعهٔ
    // کوچک ورق است، و اگر «نامشخص» بماند سر از برش‌خور درمی‌آورد.
    var hw = isHardwareName(b.name, cfg);
    if (hw) {
      return { role: 'hardware', confidence: 0.9,
               reason: 'نام قطعه شامل «' + hw + '» → یراق، نه ورق' };
    }

    var t = thinAxis(b);
    var thick = thickness(b);
    var tol = cfg.edge_tolerance_mm;
    var x0 = num(b.x), y0 = num(b.y), z0 = num(b.z);
    var x1 = x0 + num(b.dx), y1 = y0 + num(b.dy), z1 = z0 + num(b.dz);

    if (thick > cfg.max_panel_thickness_mm) {
      return { role: 'unknown', confidence: 0.2,
               reason: 'ضخامت ' + Math.round(thick) + 'mm بیش از حد ورق — شاید چند قطعهٔ چسبیده' };
    }

    var atLeft = Math.abs(x0 - bounds.x0) <= tol;
    var atRight = Math.abs(x1 - bounds.x1) <= tol;
    var atFront = Math.abs(y0 - bounds.y0) <= tol;
    var atBack = Math.abs(y1 - bounds.y1) <= tol;
    var atBottom = Math.abs(z0 - bounds.z0) <= tol;
    var atTop = Math.abs(z1 - bounds.z1) <= tol;
    // «تقریباً تمام‌قد/تمام‌عرض» — نسبتی، نه رواداری مطلق. دلیل واقعی: پشت‌بند به‌خاطر
    // نشستن در شیار از هر طرف نصفِ ضخامت بدنه کوچک‌تر است (در کابینت ۸۰۰ → ۷۸۴)؛
    // با رواداری مطلق چند میلی‌متری رد می‌شد و اصلاً «پشت‌بند» تشخیص داده نمی‌شد.
    var fullH = num(b.dz) >= bounds.h * cfg.nearly_full_ratio;
    var fullD = num(b.dy) >= bounds.d * cfg.nearly_full_ratio;
    var fullW = num(b.dx) >= bounds.w * cfg.nearly_full_ratio;

    // --- ورقِ نازکِ عمودی چسبیده به عقب = پشت‌بند ---
    // توجه: کاربر گفت گاهی پشت‌بند ۱۶میل است، پس فقط به نازکی تکیه نمی‌کنیم.
    if (t === 'y' && atBack && fullW && num(b.dz) > bounds.h * 0.5) {
      return { role: 'back', confidence: thick <= cfg.thin_sheet_max_mm ? 0.95 : 0.8,
               reason: 'ورق عمودی چسبیده به لبهٔ عقب و تقریباً تمام‌عرض' };
    }

    // --- ورقِ عمودی در دو طرف = دیواره ---
    if (t === 'x' && (atLeft || atRight) && fullH && num(b.dy) > bounds.d * 0.5) {
      return { role: 'side', confidence: 0.95, reason: 'ورق عمودی کناری، تمام‌قد' };
    }

    // --- قید ایستاده (آرایش L) — باید **پیش از** قاعدهٔ نما بیاید ---
    // این قاعده قبلاً آخر فهرست بود و با شرط atTop سنجیده می‌شد؛ ولی قید ایستاده
    // زیر قید خوابیده می‌نشیند، پس بالایش یک ضخامتِ بدنه (۱۶mm) پایین‌تر از سقف
    // کابینت است و رواداری مطلق ۵ میلی ردش می‌کرد. نتیجه: در کابینت تک‌درب
    // «نامشخص» می‌شد و در کابینت کشویی **با اطمینان ۸۰٪ «پشت کشو»** — چون پاس دوم
    // آن را داخل نوار ارتفاعی نما می‌دید.
    //
    // همان درسی که برای پشت‌بند ثبت شده بود: نسبی بسنج، نه مطلق. معیار درست
    // «چسبیده به سقف» نیست، «آویزان زیر سقف به اندازهٔ یک قید» است.
    //
    // !atFront نما را جدا می‌کند: نمای کشو و درب روی وجه جلویی‌اند، قید داخل بدنه.
    // «بین دو دیواره» به‌جای «تقریباً تمام‌عرض»: قید بین دو بدنه می‌نشیند، پس
    // عرضش همیشه w − ۲×ضخامت است. نسبت ۹۰٪ در کابینت باریک می‌شکند — در کابینت
    // ۳۰ سانتی می‌شود ۲۶۸/۳۰۰ = ۸۹٪ و رد می‌شد. هرچه کابینت باریک‌تر، سهم دو
    // دیواره از عرض بیشتر؛ پس معیار نسبی این‌جا ذاتاً شکننده است.
    var spansInterior = (bounds.w - num(b.dx)) <= 2 * cfg.max_panel_thickness_mm;

    // معیارِ **تمایزدهنده**: قید روی محیط بدنه می‌نشیند (لبهٔ جلو یا عقب)، ولی
    // پشتِ کشو داخل جعبهٔ کشو است و از هر دو لبه فاصله دارد.
    // فقط تکیه بر عرض کافی نبود: با ریل کف‌ریل (لقی ۱۱ به‌جای ۲۵) پشت کشو
    // ۵۲۵ می‌شود و از آستانهٔ عرض رد می‌شد — حاشیه‌ای که خیلی باریک بود.
    var onCarcassPerimeter = atBack || (y0 - bounds.y0) <= 2 * cfg.max_panel_thickness_mm;

    if (t === 'y' && !atFront && spansInterior && onCarcassPerimeter &&
        num(b.dz) <= cfg.rail_max_depth_mm &&
        (bounds.z1 - z1) <= cfg.rail_max_depth_mm) {
      return { role: 'rail_top', confidence: 0.85,
               reason: 'ورق عمودی کوتاه و تمام‌عرض، آویزان زیر سقف → قید ایستاده (آرایش L)' };
    }

    // --- ورقِ نازکِ جلوی همه‌چیز (بیرون از پوسته یا روی لبهٔ جلو) = درب/نمای کشو ---
    if (t === 'y' && atFront) {
      // تفکیک درب از نمای کشو: اول «بلندتر از پهن» (درب دولنگهٔ قدی)، بعد نسبت ارتفاع
      // به ارتفاع کابینت. صرفِ پهن‌بودن معیار نیست — درب تک ۸۰cm هم پهن‌تر از بلند است.
      if (num(b.dz) >= num(b.dx)) {
        return { role: 'door', confidence: 0.9, reason: 'ورق جلویی بلندتر از پهن → درب' };
      }
      var hRatio = bounds.h > 0 ? num(b.dz) / bounds.h : 1;
      if (hRatio < cfg.drawer_front_max_height_ratio) {
        return { role: 'drawer_front', confidence: 0.85,
                 reason: 'ورق جلویی کوتاه (' + Math.round(hRatio * 100) + '٪ ارتفاع) → نمای کشو' };
      }
      return { role: 'door', confidence: 0.8,
               reason: 'ورق جلویی تقریباً تمام‌ارتفاع (' + Math.round(hRatio * 100) + '٪) → درب' };
    }

    // --- ورقِ افقی ---
    if (t === 'z') {
      if (atBottom) return { role: 'bottom', confidence: 0.9, reason: 'ورق افقی در پایین‌ترین تراز' };
      if (atTop) {
        // قید = افقی، بالا، ولی کم‌عمق (تمام عمق کابینت را نمی‌گیرد)
        if (num(b.dy) <= cfg.rail_max_depth_mm && !fullD) {
          return { role: 'rail_top', confidence: 0.85, reason: 'ورق افقی بالا و کم‌عمق → قید' };
        }
        return { role: 'top_bottom', confidence: 0.85, reason: 'ورق افقی در بالاترین تراز و تمام‌عمق' };
      }
      // افقی، نه بالا نه پایین = طبقه (یا کف کشو)
      return { role: 'shelf', confidence: 0.75, reason: 'ورق افقی میانی → طبقه' };
    }

    // --- ورق عمودی کم‌عمق و بالا که کنار/عقب نیست = قید ایستاده (مدل L کاربر) ---
    if (t === 'y' && atTop && num(b.dz) <= cfg.rail_max_depth_mm) {
      return { role: 'rail_top', confidence: 0.7, reason: 'ورق عمودی کوتاه در بالا → قید ایستاده (مدل L)' };
    }

    return { role: 'unknown', confidence: 0.3, reason: 'الگوی شناخته‌شده‌ای مطابقت نکرد' };
  }

  /**
   * تشخیص نقش همهٔ قطعات یک کابینت.
   * @param {Array} boxes - [{id, name, x, y, z, dx, dy, dz}] به mm
   * @param {object} [options] - بازنویسی آستانه‌ها (DEFAULTS)
   * @returns {{parts:Array, bounds:object, warnings:Array<string>}}
   */
  function classify(boxes, options) {
    var cfg = {};
    Object.keys(DEFAULTS).forEach(function (k) { cfg[k] = DEFAULTS[k]; });
    Object.keys(options || {}).forEach(function (k) {
      if (options[k] != null) cfg[k] = options[k];
    });

    var list = (boxes || []).filter(function (b) {
      return num(b.dx) > 0 && num(b.dy) > 0 && num(b.dz) > 0;
    });
    var warnings = [];
    // پوسته را فقط از روی ورق‌ها می‌سنجیم. یک دستگیره جلوتر از درب می‌ایستد و
    // یک پایه پایین‌تر از کف؛ اگر در پوسته حساب شوند، صفحهٔ جلو و کف جابه‌جا
    // می‌شود و **همهٔ** تشخیص‌های «چسبیده به لبه» غلط درمی‌آید.
    var sheets = list.filter(function (b) { return !isHardwareName(b.name, cfg); });
    var bounds = boundsOf(sheets.length ? sheets : list);
    if (!bounds) return { parts: [], bounds: null, warnings: ['هیچ قطعهٔ معتبری یافت نشد'] };

    var firstPass = list.map(function (b) { return classifyOne(b, bounds, cfg); });

    // --- پاس نام: آنچه کاربر خودش روی قطعه نوشته ---
    // نام و هندسه دو شاهد مستقل‌اند. یکی‌شان را دور انداختن یعنی دور انداختن
    // نصف اطلاعات — و همین باعث شد قطعهٔ «sheet back» با اطمینان ۸۵٪ «قید»
    // گزارش شود. حالا هر دو حرف می‌زنند و اختلافشان به کاربر گفته می‌شود.
    firstPass.forEach(function (r, i) {
      if (r.role === 'hardware') return;   // یراق پیش‌تر از روی نام قطعی شده
      var hit = roleFromName(list[i].name, cfg);
      if (!hit) return;

      if (r.role === 'unknown') {
        firstPass[i] = { role: hit.role, confidence: 0.75,
                         reason: 'هندسه الگویی نشناخت؛ نام قطعه («' + hit.pat + '») می‌گوید ' +
                                 (ROLE_LABELS_FA[hit.role] || hit.role) };
      } else if (rolesCompatible(r.role, hit.role)) {
        firstPass[i] = { role: r.role, confidence: Math.min(0.97, r.confidence + 0.1),
                         reason: 'نام و هندسه هر دو ' +
                                 (ROLE_LABELS_FA[r.role] || r.role) + ' می‌گویند' };
      } else {
        // نام هم می‌تواند غلط باشد (کپیِ قطعه نام قبلی را با خود می‌برد)، پس
        // حدس هندسه را نگه می‌داریم ولی وانمود نمی‌کنیم مطمئنیم.
        firstPass[i] = { role: r.role, confidence: Math.min(r.confidence, 0.5), name_role: hit.role,
                         reason: 'اختلاف: هندسه ' + (ROLE_LABELS_FA[r.role] || r.role) +
                                 ' می‌گوید ولی نام («' + hit.pat + '») ' +
                                 (ROLE_LABELS_FA[hit.role] || hit.role) + ' — خودتان تصمیم بگیرید' };
      }
    });

    // --- پاس تفکیک نما: درب یا نمای کشو؟ ---
    // نسبت ارتفاع به‌تنهایی جواب نمی‌دهد. کابینت دوکشویی، هر نما ~۴۹٪ ارتفاع است و
    // با آستانهٔ ۰٫۴ «درب» می‌شد — بعد چون هیچ نمای کشویی تشخیص داده نشده بود، کل
    // جعبهٔ کشو (بدنه/پشت/کف) هم آبشاری «نامشخص» و «طبقه» می‌شد.
    //
    // معیار درست **ساختاری** است، همان‌طور که آدم نگاه می‌کند: چند نمای روی‌هم در
    // یک ستون = کشو؛ یک نمای تمام‌قد = درب. نماهای کنارِ هم (دولنگه) هر دو دربند.
    var frontIdx = [];
    firstPass.forEach(function (r, i) {
      if (r.role === 'door' || r.role === 'drawer_front') frontIdx.push(i);
    });

    if (frontIdx.length > 1) {
      // ستون‌بندی بر پایهٔ هم‌پوشانی افقی
      var cols = [];
      frontIdx.forEach(function (i) {
        var b = list[i];
        var x0 = num(b.x), x1 = x0 + num(b.dx);
        var col = cols.find(function (c) { return x0 < c.x1 - 1 && x1 > c.x0 + 1; });
        if (col) {
          col.items.push(i);
          col.x0 = Math.min(col.x0, x0);
          col.x1 = Math.max(col.x1, x1);
        } else {
          cols.push({ x0: x0, x1: x1, items: [i] });
        }
      });

      cols.forEach(function (c) {
        if (c.items.length < 2) return;
        // چند نما در یک ستون، روی هم چیده → همه نمای کشو
        var sorted = c.items.slice().sort(function (p, q) { return num(list[p].z) - num(list[q].z); });
        var stacked = true;
        for (var k = 1; k < sorted.length; k++) {
          var prev = list[sorted[k - 1]], cur = list[sorted[k]];
          if (num(cur.z) < num(prev.z) + num(prev.dz) - cfg.edge_tolerance_mm) { stacked = false; break; }
        }
        if (!stacked) return;

        // دو نمای روی‌هم می‌تواند دو دربِ کابینت قدی باشد. سه تا و بیشتر عملاً
        // همیشه کشوست؛ در حالت دوتایی، ارتفاع مطلق تصمیم می‌گیرد.
        var allShort = sorted.every(function (i) {
          return num(list[i].dz) <= cfg.drawer_front_max_height_mm;
        });
        if (sorted.length === 2 && !allShort) return;

        sorted.forEach(function (i) {
          firstPass[i] = { role: 'drawer_front', confidence: 0.9,
                           reason: c.items.length + ' نمای روی‌هم در یک ستون → نمای کشو' };
        });
      });
    }

    // --- پاس دوم: قطعات داخلی جعبهٔ کشو ---
    // چرا پاس جدا لازم است: بدنه/پشت/کف کشو به هیچ لبه‌ای از کابینت نمی‌چسبند (برخلاف
    // دیواره و پشت‌بند)، پس قواعد «چسبیده به لبه» آن‌ها را نمی‌گیرد و nameless می‌مانند.
    // نشانهٔ قطعی: در همان نوار ارتفاعیِ یک «نمای کشو» قرار دارند و از پوسته فاصله دارند.
    var tol2 = cfg.edge_tolerance_mm;
    var fronts = [];
    firstPass.forEach(function (r, i) {
      if (r.role !== 'drawer_front') return;
      var b = list[i];
      fronts.push({ z0: num(b.z), z1: num(b.z) + num(b.dz) });
    });
    if (fronts.length) {
      firstPass.forEach(function (r, i) {
        // فقط «نامشخص» و «طبقه» نامزد بازنویسی‌اند. قید ایستاده عمداً بیرون است:
        // چون تمام‌عرض و آویزان زیر سقف است، در نوار ارتفاعی نمای کشوی بالایی هم
        // می‌افتد و پیش‌تر همین پاس آن را با اطمینان ۸۰٪ «پشت کشو» می‌کرد.
        if (r.role !== 'unknown' && r.role !== 'shelf') return;
        var b = list[i];
        var z0 = num(b.z), z1 = z0 + num(b.dz);
        var inBand = fronts.some(function (f) { return z0 < f.z1 - tol2 && z1 > f.z0 + tol2; });
        if (!inBand) return;
        // باید از پوستهٔ کابینت فاصله داشته باشد، وگرنه قطعهٔ خود کابینت است
        var inset = num(b.x) > bounds.x0 + tol2 && num(b.x) + num(b.dx) < bounds.x1 - tol2 ||
                    num(b.y) > bounds.y0 + tol2 && num(b.y) + num(b.dy) < bounds.y1 - tol2;
        if (!inset) return;
        var t = thinAxis(b);
        var role = t === 'x' ? 'drawer_side' : (t === 'y' ? 'drawer_back' : 'drawer_bottom');
        firstPass[i] = { role: role, confidence: 0.8,
                         reason: 'داخل نوار ارتفاعی یک نمای کشو و جدا از پوسته → قطعهٔ جعبهٔ کشو' };
      });
    }

    var parts = list.map(function (b, i) {
      var res = firstPass[i];
      var t = thinAxis(b);
      // ابعاد برش: دو بُعد غیرِ محور نازک؛ بزرگ‌تر = طول، کوچک‌تر = عرض
      var dims = ['x', 'y', 'z'].filter(function (a) { return a !== t; })
                                .map(function (a) { return num(b['d' + a]); })
                                .sort(function (p, q) { return q - p; });
      // یراق ابعاد برش ندارد. یک لولا «۵۷×۸۱ ضخامت ۳۳» نیست — آن عدد جعبهٔ
      // محیطیِ یک قطعهٔ فلزی است و در جدولِ برش هیچ معنایی ندارد جز گمراهی.
      // اندازهٔ خام در `box` می‌ماند تا اگر کاربر نقش را عوض کرد از دست نرود.
      var isHw = res.role === 'hardware';
      return {
        id: b.id != null ? b.id : 'p' + i,
        name: b.name || '',
        role: res.role,
        role_label_fa: ROLE_LABELS_FA[res.role],
        confidence: res.confidence,
        reason: res.reason,
        // وقتی نام و هندسه اختلاف دارند، حدسِ نام هم می‌ماند تا جدول بتواند
        // «یا این یا آن» را نشان دهد، نه اینکه یکی را بی‌صدا برنده کند.
        name_role: res.name_role || null,
        cut_length_mm: isHw ? null : Math.round(dims[0]),
        cut_width_mm: isHw ? null : Math.round(dims[1]),
        thickness_mm: isHw ? null : Math.round(thickness(b)),
        // نشانهٔ کار ماشین از RawGeometry می‌آید (حجم واقعی کمتر از جعبهٔ محیطی،
        // یا بیش از شش وجه). کلاسیفایر خودش نمی‌تواند بفهمد — فقط عبورش می‌دهد تا
        // در جدول دیده شود. بدون این، قطعهٔ شیارخورده و ساده یکسان گزارش می‌شدند.
        machined: b.machined === true,
        // جای دقیق سوراخ‌ها از Kalaxa::Machining می‌آید. کلاسیفایر خودش کاری
        // با آن ندارد — فقط عبورش می‌دهد تا نقشهٔ CNC بتواند بکشدش. بدون این،
        // داده همین‌جا سر بریده می‌شد و نقشه همیشه خالی درمی‌آمد.
        features: b.features || null,
        solid_ratio: typeof b.solid_ratio === 'number' ? b.solid_ratio : null,
        face_count: typeof b.face_count === 'number' ? b.face_count : null,
        box: { x: num(b.x), y: num(b.y), z: num(b.z), dx: num(b.dx), dy: num(b.dy), dz: num(b.dz) }
      };
    });

    var machined = parts.filter(function (p) { return p.machined; }).length;
    if (machined) {
      warnings.push(machined + ' قطعه کار ماشین دارد (شیار/فرز/CNC) — ' +
        'نوع کار از هندسه قابل تشخیص نیست؛ دستی بررسی کنید');
    }

    var conflict = parts.filter(function (p) { return p.name_role; }).length;
    if (conflict) {
      warnings.push(conflict + ' قطعه نامش با هندسه‌اش نمی‌خواند — ' +
        'ستون «دلیل» هر دو حدس را می‌گوید؛ نقش درست را خودتان انتخاب کنید');
    }

    var unknown = parts.filter(function (p) { return p.role === 'unknown'; }).length;
    if (unknown) warnings.push(unknown + ' قطعه نقشش تشخیص داده نشد — در جدول دستی مشخص کنید');
    var lowConf = parts.filter(function (p) { return p.role !== 'unknown' && p.confidence < 0.8; }).length;
    if (lowConf) warnings.push(lowConf + ' قطعه با اطمینان پایین حدس زده شد — بررسی کنید');
    var hwCount = parts.filter(function (p) { return p.role === 'hardware'; }).length;
    if (hwCount) {
      warnings.push(hwCount + ' قطعه یراق تشخیص داده شد (از روی نام) — در برش‌خور نمی‌آید');
    }
    if (hwCount < parts.length && !parts.some(function (p) { return p.role === 'side'; })) {
      warnings.push('هیچ دیواره‌ای تشخیص داده نشد — شاید محورهای مدل با قرارداد فرق دارد');
    }
    return { parts: parts, bounds: bounds, warnings: warnings };
  }

  /**
   * تجمیع قطعات یکسان به یک ردیف با تعداد.
   *
   * کاربر چهار لولای یکسان را چهار ردیف جدا دید و گفت «تعداد باید مشخص باشه».
   * حق دارد: کارگاه «۴ عدد» سفارش می‌دهد، نه چهار سطر تکراری. ضمناً وقتی ۱۹
   * قطعه به ۹ ردیف تبدیل می‌شود، اشتباهِ واقعی در جدول دیده می‌شود.
   *
   * کلیدِ یکسانی **نقش و ابعاد و ضخامت و کار ماشین** است — عمداً بدون نام.
   *
   * کاربر: «دیوارهٔ چپ و راست یک سایز هست، تعداد زیاد شود». حق دارد: در برش‌خور
   * دو قطعهٔ هم‌نقش و هم‌اندازه **یک کالا با تعداد ۲** اند، هرچند در مدل
   * «Body Left» و «Body Right» نام گرفته باشند. کلید کردنِ نام یعنی هر قطعه‌ای
   * که کاربر جداگانه نام‌گذاری کرده، جداگانه سفارش برود.
   *
   * ولی ابعاد در کلید می‌ماند: دو «طبقه» با اندازهٔ متفاوت یکی نیستند و
   * ادغامشان یعنی سفارش غلط.
   *
   * @param {object} [opts] - { by_name: true } برای تفکیک بر پایهٔ نام هم
   * @returns {Array} ردیف‌ها با `qty`، `ids` و `names` (همهٔ نام‌های ادغام‌شده)
   */
  function group(parts, opts) {
    var byName = !!(opts && opts.by_name);
    var out = [], byKey = {};
    (parts || []).forEach(function (p) {
      // قطعهٔ کار ماشین‌دار فقط وقتی ادغام می‌شود که **نامش هم یکی باشد**.
      // دیوارهٔ چپ و راست هم‌اندازه‌اند ولی قرینه‌اند: سوراخ لولا در دو طرف
      // مخالف است. ادغامشان یعنی یک نقشهٔ CNC برای دو قطعهٔ متفاوت — و قطعهٔ
      // دوم اشتباه سوراخ می‌شود. اندازه یکی است، نقشه یکی نیست.
      var splitByName = byName || p.machined;
      var key = [p.role, splitByName ? p.name : '', p.cut_length_mm, p.cut_width_mm,
                 p.thickness_mm, p.machined ? 1 : 0].join('|');
      if (byKey[key]) {
        byKey[key].qty += 1;
        byKey[key].ids.push(p.id);
        if (byKey[key].names.indexOf(p.name) === -1) byKey[key].names.push(p.name);
        // اطمینانِ ردیف = کمترینِ اعضا. میانگین، یک عضو مشکوک را پشت سه عضو
        // سالم پنهان می‌کند — دقیقاً همان چیزی که نباید.
        if (p.confidence < byKey[key].confidence) {
          byKey[key].confidence = p.confidence;
          byKey[key].reason = p.reason;
        }
        return;
      }
      var row = {};
      Object.keys(p).forEach(function (k) { row[k] = p[k]; });
      row.qty = 1;
      row.ids = [p.id];
      row.names = [p.name];
      byKey[key] = row;
      out.push(row);
    });
    // نام ردیف: اگر اعضا نام‌های متفاوت دارند هر دو دیده شود — کاربر باید بتواند
    // ردیف را در مدل پیدا کند، و اگر ادغام اشتباه بوده همان‌جا معلوم شود.
    out.forEach(function (r) {
      var named = r.names.filter(function (n) { return n; });
      r.name = named.length > 1 ? named.join(' + ') : (named[0] || '');
    });
    return out;
  }

  return { VERSION: VERSION, ROLES: ROLES, ROLE_LABELS_FA: ROLE_LABELS_FA,
           DEFAULTS: DEFAULTS, classify: classify, group: group,
           thinAxis: thinAxis, boundsOf: boundsOf };
}));
