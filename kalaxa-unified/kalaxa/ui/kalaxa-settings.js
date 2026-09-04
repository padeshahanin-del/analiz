/**
 * kalaxa-settings.js — v1.12.0
 * منطق تنظیمات پروژه (State 5 قرارداد): پیش‌فرض‌ها، اعتبارسنجی، اعمال روی snapshot.
 * ماندگاری سمت Ruby است (AttributeDictionary مدل)؛ این ماژول فقط منطق خالص است.
 * JS خالص، UMD، بدون وابستگی.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./kalaxa-catalog.js'));
  } else {
    root.KalaxaSettings = factory(root.KalaxaCatalog);
  }
}(typeof self !== 'undefined' ? self : this, function (Catalog) {
  'use strict';

  var VERSION = '1.16.0';

  // نوع ریل کشو — کلید پایدار (برای قیمت/گزارش) + برچسب فارسی
  var SLIDE_TYPES = {
    ball_3piece: 'ساچمه‌ای سه‌تکه',
    tandem: 'تاندم (زیرکشویی)',
    roller: 'غلتکی ساده'
  };

  // ضخامت‌های استاندارد نوار لبه (میلی‌متر)
  var EDGE_BAND_THICKNESS = [1, 2];

  // نگاشت نقش قطعه از روی key قرارداد snapshot — مبنای «ورق بدنه/درب/پشت‌بند»
  var ROLE_KEYS = {
    body: ['side', 'top_bottom', 'bottom', 'shelf', 'rail_top', 'drawer_side', 'drawer_back'],
    door: ['door', 'drawer_front'],
    back: ['back'],
    drawer_bottom: ['drawer_bottom']
  };

  // تب‌های شناخته‌شدهٔ پنل — مبنای اعتبارسنجی چیدمان تب‌ها ('settings' مخفی‌شدنی نیست)
  var PANEL_TABS = ['cut', 'install', 'cabinets', 'placement', 'material',
                    'hardware', 'price', 'templates', 'imported', 'scenarios', 'settings', 'rules'];

  // انواع علامت قابل‌تعریف کاربر — کد/حرف کنار هر ضلع در نقشه برش و لیست قطعات
  // (نه رنگ، نه خط — کدهایی که کارگر می‌شناسد. کاربر خودش تعیین می‌کند تا با چیزی
  // که در فرمول‌ها/برچسب‌گذاری دیگر استفاده نشده تداخل نداشته باشد.)
  // miter = فارسی‌بر: کج‌بری دقیقاً ۴۵° در گوشه (اتصال قاب/کابینت).
  // bevel = کج‌بری/زاویه: برش با زاویهٔ دلخواه (غیر از فارسی)؛ دو نوع کار جداییم، کد جدا.
  // شکل ساخت درب و ضخامت‌های مجاز — از data/door_shapes.json، همان فایلی که
  // lib/door_shapes.rb می‌خواند. پیش از این فهرست این‌جا دستی کپی شده بود و فقط
  // یک تست جلوی واگراییش را می‌گرفت؛ حالا واگرایی **ممکن** نیست.
  function doorShapes() {
    return Catalog && Catalog.isLoaded && Catalog.isLoaded()
      ? Catalog.doorShapeThicknesses() : {};
  }

  var MARK_KEYS = ['band_body', 'band_door', 'groove', 'miter', 'bevel'];
  var MARK_LABELS_FA = {
    band_body: 'نوار بدنه', band_door: 'نوار درب', groove: 'شیار',
    miter: 'فارسی‌بر (۴۵°)', bevel: 'کج‌بری با زاویه'
  };
  var DEFAULT_MARKS = {
    band_body: { code: '#', label_fa: MARK_LABELS_FA.band_body },
    band_door: { code: 'P', label_fa: MARK_LABELS_FA.band_door },
    groove:    { code: 'W', label_fa: MARK_LABELS_FA.groove },
    miter:     { code: 'F', label_fa: MARK_LABELS_FA.miter },
    bevel:     { code: 'Z', label_fa: MARK_LABELS_FA.bevel }
  };

  var DEFAULTS = {
    settings_version: 1,
    // واحد نمایش 'cm' پیش‌فرض | 'mm' (داده‌ها داخلی mm)؛ tab_order/hidden_tabs چیدمان تب‌ها
    display: { unit: 'cm', tab_order: PANEL_TABS.slice(), hidden_tabs: [] },
    project: {
      body_sheet_id: 'mdf_white_16',         // ورق بدنه (ضخامت بدنه = ضخامت همین ورق)
      door_sheet_id: 'mdf_door_16',          // ورق درب (ضخامت درب = ضخامت همین ورق)
      back_sheet_id: 'mdf_white_8',          // ورق پشت‌بند کابینت (قرارداد دامنه: MDF ۸)
      drawer_bottom_sheet_id: 'hdf_3',       // ورق کف کشو
      slide_type: 'ball_3piece',
      // ریل و جعبهٔ کشو — اعداد واقعی کارگاه کاربر، **مجموع هر دو طرف**:
      // ساچمه‌ای (ریل + بادخور) = ۲۵mm، کف‌ریل = ۱۱mm. هیچ‌کدام در کد ثابت نیست.
      // عرض بیرونی جعبهٔ کشو = فضای داخلی کابینت − همین عدد.
      drawer: {
        slide_kind: 'ball',              // 'ball' (ساچمه‌ای) | 'bottom' (کف ریل)
        ball_total_clearance_mm: 25,
        bottom_total_clearance_mm: 11,
        side_height_mm: 150,             // ارتفاع بدنهٔ کشو
        // ۰ = خودکار از عمق کابینت (عمق − ۵۰). عدد بده تا دقیقاً همان استفاده شود.
        depth_mm: 0,
        slide_length_mm: 0               // ۰ = خودکار از عمق؛ برای BOM/سفارش ریل
      },
      // درب: شکل ساخت + ضخامت. هر شکل چند ضخامت مجاز دارد (بعضی چهار تا)؛
      // عدد انتخابی در thickness_mm می‌نشیند. موتور: lib/door_shapes.rb — همان منبعی
      // که هم لیست برش و هم مدل سه‌بعدی از آن می‌خوانند، پس نمی‌توانند واگرا شوند.
      // ضخامت درب دیگر به ضخامت بدنه گره نخورده است.
      doors: {
        shape: 'flat',
        thickness_mm: 0,          // ۰ = پیش‌فرض همان شکل؛ عدد بده تا دقیقاً همان استفاده شود
        frame_width_mm: 0,        // ۰ = پیش‌فرض شکل (کلاف‌وتنپوش ۷۰، فریم آلومینیوم ۲۴)
        panel_thickness_mm: 0,    // ضخامت تنپوش کلاف‌وتنپوش
        groove_depth_mm: 0        // عمق شیاری که تنپوش داخلش می‌نشیند
      },
      // نوار لبه: ضخامت (۱/۲ میل) + توضیحات آزاد؛ بدنه تیک «کسر» دارد یعنی ضخامت نوار
      // از اندازهٔ برش قطعه کم می‌شود تا اندازهٔ نهایی درست دربیاید (اثر واقعی در نستینگ).
      edge_band: {
        body: { thickness_mm: 1, note: '', subtract: true },
        door: { thickness_mm: 2, note: '' }
      },
      // علامت هر نوع کار روی نقشه برش/لیست قطعات — کد را کاربر تعیین می‌کند
      marks: clone(DEFAULT_MARKS),
      // شیت قیمت کامل — یک‌بار وارد و در مدل ماندگار (assembly به‌ازای هر تمپلیت کابینت،
      // دیگر برای تمپلیت‌های قیمت‌گذاری‌شده پرسیده نمی‌شود). موتور: kalaxa-price-sheet.js
      price_sheet: {
        currency: 'تومان',
        sheets: {},            // { sheet_id: قیمت هر ورق }
        hardware: {},          // { item_id: قیمت واحد } — لولا/ریل/دستگیره/پایه/...
        edge_body_per_m: 0,
        edge_door_per_m: 0,
        assembly: {},          // { template_id_یا_دسته: قیمت مونتاژ هر یونیت }
        trim: { crown_per_m: 0, light_rail_per_m: 0, kick_per_m: 0 },
        // پروفیل درب آلومینیومی/شیشه‌ای — دو SKU جدا (ساده/دستگیره)، هر کدام شاخهٔ خودش.
        // موتور: kalaxa-door-profile.js + kalaxa-linear-nesting.js
        door_profile: { door_types: [], plain_bar_length_mm: 0, plain_price_per_bar: 0, plain_kerf_mm: 3,
                        handle_bar_length_mm: 0, handle_price_per_bar: 0, handle_kerf_mm: 3 },
        // ریل کمد دیواری — ریل عمومی برشی (ساده/لبه‌دار) + کیت مکانیزم برند (قیمت ثابت هر کمد).
        // موتور: kalaxa-wall-rail.js
        wall_rail: { plain_bar_length_mm: 0, plain_price_per_bar: 0, plain_kerf_mm: 3,
                     edged_bar_length_mm: 0, edged_price_per_bar: 0, edged_kerf_mm: 3,
                     kits: { blum: 0, fantoni: 0, meleni: 0 } },
        // قرنیز/مولدینگ مستقل — ورودی دستی صفحه (بدون مفهوم کانترتاپ در snapshot).
        // موتور: kalaxa-moulding.js. boards را خود کاربر در پنل اضافه/حذف می‌کند.
        moulding: { boards: [], bar_length_mm: 0, price_per_bar: 0, kerf_mm: 3 },
        // نوار لبهٔ رولی — مصرف واقعی + افت هر برش (پیش‌فرض ۵۰mm طبق گفتهٔ کاربر).
        // موتور: kalaxa-edge-roll.js. جدا از edge_body_per_m/edge_door_per_m (متری/برش‌خورده).
        edge_roll: { waste_mm: 50, body_price_per_m: 0, door_price_per_m: 0 },
        // قانون طراحی «ران» تاج/لب‌چراغ/پاخور — رفع تداخل گوشه (کسر با تعداد گوشه × مقدار کسر).
        // موتور: kalaxa-trim-rules.js. runs را خود کاربر در پنل اضافه/حذف می‌کند؛ خالی = متراژ خام قدیمی.
        trim_rules: { runs: [], default_deduction_mm: 0 }
      },
      // کاتالوگ تمپلیت کابینت — رجیستری، نه مصرف (تمپلیت حذف‌شده از اسکن جاری هم می‌ماند).
      // موتور: kalaxa-template-catalog.js. کلید = template_id.
      template_catalog: {},
      // ساختار قید بالای کابینت — کاربر: «تو مدل ما ۴ قید به‌صورت L می‌زنیم،
      // اما گاهی جلو افقی عقب L». تعداد/آرایش در تنظیمات، نه ثابت در کد.
      // 'L' = یک تختهٔ افقی + یک تختهٔ عمودی؛ 'h' = فقط افقی؛ 'none' = ندارد.
      rails: {
        front: 'L',
        back: 'L',
        vertical_height_mm: 70,   // ارتفاع تختهٔ ایستاده (کاربر: «مثلاً ۷ سانت»)
        horizontal_depth_mm: 100, // عمق تختهٔ خوابیده
        banded: []                // کدام قیدها نوار می‌خورند: 'front_h','front_v','back_h','back_v'
      },
      // موقعیت پنل روی صفحه — کاربر: «قابل تنظیم چپ یا راست».
      panel: { side: 'right' },
      // چیدمان: چسبیدن خودکار کابینت جدید به کابینت مجاور + هشدار هم‌پوشانی.
      placement: {
        snap_enabled: true,
        snap_distance_mm: 300,  // از این نزدیک‌تر شد، بچسبد
        snap_gap_mm: 0,         // درز بین دو کابینت (۰ = دیواره‌به‌دیواره)
        warn_overlap: true
      },
      // صفحهٔ کار: طول شاخهٔ ماده، بیرون‌زدگی، و نوع گوشه.
      // موتور: kalaxa-countertop.js. تهی = پیش‌فرض‌های همان ماژول.
      countertop: {
        // نوع از کاتالوگ مشترک (data/countertops.json). طول شاخه از همان
        // می‌آید — عدد اینجا فقط وقتی به کار می‌آید که نوعی انتخاب نشده باشد.
        type_id: 'company',
        // نوع افزودهٔ کارگاه؛ با همان id، کاتالوگ را بازنویسی می‌کند.
        custom_types: [],
        bar_length_mm: 4100,     // ۰ = ماده محدودیت طول ندارد
        overhang_front_mm: 20,
        overhang_side_mm: 0,
        corner_joint: 'miter',   // 'miter' (فارسی ۴۵) | 'butt' (اتصال مستقیم)
        min_piece_mm: 300
      },

      // کاتالوگ یراق: کدام قلم در این کارگاه استفاده می‌شود و با چه واحدی.
      //
      // کاربر: «مینی‌فیکس و دوبل چوبی نداریم» — ولی BOM آن‌ها را می‌شمرد و در
      // شیت قیمت می‌آورد. قلمی که کارگاه ندارد نباید در فاکتور بیاید.
      //
      // **نام این‌جا نیست، عمداً.** نام یراق از واژه‌نامه می‌آید و همان‌جا هم
      // ویرایش می‌شود. دو منبع برای یک نام یعنی روزی جدول یک چیز بگوید و
      // فاکتور چیز دیگری.
      //
      // unit: 'piece' | 'pair' | 'm'. برای متری (دستگیرهٔ متری، پروفیل گاولا)
      // طول هر عدد لازم است، وگرنه متراژ محاسبه نمی‌شود و صریح گفته می‌شود.
      hardware_catalog: {
        hinge:     { enabled: true,  unit: 'piece' },
        handle:    { enabled: true,  unit: 'piece', length_mm: 0 },
        leg:       { enabled: true,  unit: 'piece' },
        shelf_pin: { enabled: true,  unit: 'piece' },
        minifix:   { enabled: true,  unit: 'piece' },
        dowel:     { enabled: true,  unit: 'piece' },
        // گاولا ذاتاً متری است — واحدش قابل تغییر نیست، ولی درصد پرت برش
        // پروفیل قابل تنظیم است (پیش‌فرض ۵٪).
        gola:      { enabled: true,  unit: 'm', waste_pct: 5 }
      },

      // نوار لبه/شیارِ پیش‌فرض هر نقش. تهی یعنی «از کاتالوگ مشترک بخوان»
      // (kalaxa/data/edges.json — همان قاعده‌ای که CabinetBuilder با آن می‌سازد).
      // هر کلیدی که این‌جا بیاید روی کاتالوگ می‌نشیند، تا کارگاهی که مثلاً
      // پشت‌بند را روکار می‌کوبد و شیار نمی‌زند بتواند قاعده را عوض کند —
      // بدون اینکه مجبور باشد تک‌تک ردیف‌های جدول را دستی بزند.
      edge_defaults: {},

      // قوانین تشخیص خودکار نقش قطعات از هندسه (موتور: kalaxa-part-classifier.js).
      // خواستهٔ صریح کاربر: «همهٔ قوانین آنالیز قابل تنظیم باشد» — هیچ آستانه‌ای در کد
      // ثابت نماند، چون روش ساخت هر کارگاه فرق دارد (ضخامت پشت‌بند، ارتفاع قید و ...).
      analysis_rules: {
        max_panel_thickness_mm: 40,        // ضخیم‌تر از این = ورق نیست (شاید چند قطعهٔ چسبیده)
        thin_sheet_max_mm: 10,             // مرز «ورق نازک» (پشت‌بند ۳/۸میل)
        rail_max_depth_mm: 200,            // عمق/ارتفاع بیشینهٔ یک قید
        edge_tolerance_mm: 5,              // رواداری «چسبیده به لبه»
        nearly_full_ratio: 0.9,            // نسبت «تقریباً تمام‌عرض/تمام‌قد»
        drawer_front_max_height_ratio: 0.4, // کمتر از این نسبتِ ارتفاع کابینت = نمای کشو
        // سقف مطلق ارتفاع یک نمای کشو. نسبت به‌تنهایی کافی نیست: دو دربِ روی‌همِ
        // کابینت قدی هم «روی هم» اند — ولی هرکدام ~۱۱۰۰ میلی است.
        drawer_front_max_height_mm: 400,
        // یراق از هندسه قابل تشخیص نیست — یک لولا دقیقاً شبیه تکه‌ورق است. نام
        // تنها سرنخ است، و هر کارگاه نام خودش را دارد، پس اینجا قابل ویرایش است.
        hardware_name_patterns: [
          'لولا', 'lola', 'hinge', 'ریل', 'ril', 'slide', 'دستگیره', 'handle', 'knob',
          'پیچ', 'screw', 'قفل', 'lock', 'جک', 'piston', 'براکت', 'bracket',
          'پایه', 'leg', 'یراق', 'hardware'
        ],
        // نام قطعه در مدل معمولاً نقشش را می‌گوید؛ هر کارگاه با واژهٔ خودش.
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
      }
    },
    // sheets/cutting عمداً این‌جا نیستند: در پنل اسکچاپ کاتالوگ **در زمان بارگذاری
    // اسکریپت هنوز نرسیده** (Ruby بعداً با onCatalog تزریقش می‌کند). اگر این‌جا
    // Catalog.sheets() صدا زده شود، در مرورگر استثنا می‌دهد، کل ماژول می‌میرد و
    // پنل با «KalaxaSettings is not defined» می‌ترکد — که دقیقاً در نصب واقعی رخ داد.
    // در Node این اتفاق نمی‌افتاد چون کاتالوگ را از دیسک می‌خواند، پس همهٔ تست‌ها
    // سبز بودند. حالا در defaults() و در زمان فراخوانی پر می‌شوند.
    sheets: [],
    cutting: {}
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // دسترسی ایمن به کاتالوگ: نبودنش یعنی «هنوز نرسیده»، نه «خراب است».
  // پنلِ بی‌ورق قابل بازیابی است؛ پنلِ مرده نه.
  function catalogReady() {
    return !!(Catalog && Catalog.isLoaded && Catalog.isLoaded());
  }
  function catalogSheets() {
    try { return catalogReady() ? Catalog.sheets() : []; } catch (e) { return []; }
  }
  function catalogCutting() {
    try { return catalogReady() ? Catalog.cutting() : {}; } catch (e) { return {}; }
  }
  function catalogDefaultShape() {
    try { return catalogReady() ? Catalog.defaultDoorShape() : 'flat'; } catch (e) { return 'flat'; }
  }
  function finitePos(n) { return typeof n === 'number' && isFinite(n) && n > 0; }
  function finiteNonNeg(n) { return typeof n === 'number' && isFinite(n) && n >= 0; }

  // ورق‌ها و پارامترهای برش در **زمان فراخوانی** از کاتالوگ خوانده می‌شوند، نه
  // زمان بارگذاری — تا پنل پیش از رسیدن کاتالوگ هم زنده بماند.
  function defaults() {
    var d = clone(DEFAULTS);
    d.sheets = catalogSheets().map(function (x) { return clone(x); });
    d.cutting = clone(catalogCutting());
    return d;
  }

  /** اعتبارسنجی تنظیمات — خروجی { ok, errors[fa] } */
  function validate(settings) {
    var errors = [];
    // هشدار = مشکوک ولی مجاز (مثلاً ضخامت درب غیراستاندارد). ذخیره را نمی‌بندد؛
    // کارگاه ممکن است ورق غیراستاندارد داشته باشد و ما حق نداریم جلویش را بگیریم.
    var warnings = [];
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return { ok: false, errors: ['تنظیمات باید شیء JSON باشد'], warnings: [] };
    }
    if (!Array.isArray(settings.sheets) || !settings.sheets.length) {
      errors.push('حداقل یک ورق باید تعریف شود');
    }
    var ids = {};
    (settings.sheets || []).forEach(function (s, i) {
      var tag = 'ورق #' + (i + 1) + (s && s.sheet_id ? ' (' + s.sheet_id + ')' : '');
      if (!s || typeof s !== 'object') { errors.push(tag + ' نامعتبر'); return; }
      if (!s.sheet_id || typeof s.sheet_id !== 'string' || !s.sheet_id.trim()) {
        errors.push(tag + ': sheet_id جاافتاده');
      } else if (ids[s.sheet_id]) { errors.push(tag + ': sheet_id تکراری'); }
      else ids[s.sheet_id] = true;
      if (!finitePos(s.width_mm)) errors.push(tag + ': width_mm نامعتبر');
      if (!finitePos(s.height_mm)) errors.push(tag + ': height_mm نامعتبر');
      if (!finitePos(s.thickness_mm)) errors.push(tag + ': thickness_mm نامعتبر');
      if (s.trim_margin_mm != null && !finiteNonNeg(s.trim_margin_mm)) errors.push(tag + ': trim_margin_mm نامعتبر');
      if (s.price_per_sheet != null && !finiteNonNeg(s.price_per_sheet)) errors.push(tag + ': price_per_sheet نامعتبر');
      if (s.width_mm && s.height_mm && s.trim_margin_mm != null &&
          (s.width_mm <= 2 * s.trim_margin_mm || s.height_mm <= 2 * s.trim_margin_mm)) {
        errors.push(tag + ': trim از نصف ابعاد ورق بزرگ‌تر است');
      }
    });
    var c = settings.cutting || {};
    if (c.kerf_mm != null && !finiteNonNeg(c.kerf_mm)) errors.push('kerf_mm نامعتبر');
    if (c.kerf_mm != null && c.kerf_mm > 20) errors.push('kerf_mm غیرمنطقی (>20mm)');
    if (c.min_offcut_mm != null && !finiteNonNeg(c.min_offcut_mm)) errors.push('min_offcut_mm نامعتبر');
    if (settings.display != null) {
      if (typeof settings.display !== 'object' || Array.isArray(settings.display)) {
        errors.push('display باید شیء باشد');
      } else {
        var d = settings.display;
        if (d.unit != null && d.unit !== 'cm' && d.unit !== 'mm') {
          errors.push("display.unit فقط 'cm' یا 'mm' — مقدار فعلی: " + d.unit);
        }
        ['tab_order', 'hidden_tabs'].forEach(function (k) {
          if (d[k] == null) return;
          if (!Array.isArray(d[k])) { errors.push('display.' + k + ' باید آرایه باشد'); return; }
          d[k].forEach(function (t) {
            if (PANEL_TABS.indexOf(t) === -1) errors.push('display.' + k + ': تب ناشناخته «' + t + '»');
          });
        });
        if (Array.isArray(d.hidden_tabs) && d.hidden_tabs.indexOf('settings') !== -1) {
          errors.push('تب تنظیمات مخفی‌شدنی نیست (راه برگشت بسته می‌شود)');
        }
      }
    }
    if (settings.project != null) {
      var pr = settings.project;
      if (typeof pr !== 'object' || Array.isArray(pr)) {
        errors.push('project باید شیء باشد');
      } else {
        var sheetIds = {};
        (settings.sheets || []).forEach(function (s) { if (s && s.sheet_id) sheetIds[s.sheet_id] = true; });
        ['body_sheet_id', 'door_sheet_id', 'back_sheet_id', 'drawer_bottom_sheet_id'].forEach(function (k) {
          if (pr[k] != null && !sheetIds[pr[k]]) {
            errors.push('project.' + k + ' به ورق ناموجود «' + pr[k] + '» اشاره دارد');
          }
        });
        if (pr.slide_type != null && !SLIDE_TYPES[pr.slide_type]) {
          errors.push('project.slide_type ناشناخته: ' + pr.slide_type +
            ' (مجاز: ' + Object.keys(SLIDE_TYPES).join('، ') + ')');
        }
        if (pr.doors != null) {
          var dr = pr.doors;
          if (typeof dr !== 'object' || Array.isArray(dr)) {
            errors.push('project.doors باید شیء باشد');
          } else {
            var SHAPES = doorShapes();
            if (dr.shape != null && !SHAPES[dr.shape]) {
              errors.push('project.doors.shape ناشناخته: ' + dr.shape +
                ' (مجاز: ' + Object.keys(SHAPES).join('، ') + ')');
            }
            // ضخامت خارج از فهرست مجاز رد **نمی‌شود** — کارگاه ممکن است ورق
            // غیراستاندارد داشته باشد؛ فقط هشدار می‌دهیم. منفی و غیرعدد خطاست.
            ['thickness_mm', 'frame_width_mm', 'panel_thickness_mm', 'groove_depth_mm'].forEach(function (k) {
              if (dr[k] == null) return;
              if (typeof dr[k] !== 'number' || !isFinite(dr[k]) || dr[k] < 0) {
                errors.push('project.doors.' + k + ' باید عدد نامنفی باشد');
              }
            });
            var allowed = SHAPES[dr.shape || catalogDefaultShape()];
            if (allowed && dr.thickness_mm > 0 && allowed.indexOf(dr.thickness_mm) === -1) {
              warnings.push('ضخامت درب ' + dr.thickness_mm + ' جزء ضخامت‌های متداول این شکل (' +
                allowed.join('/') + ') نیست — اگر عمدی است مشکلی نیست');
            }
          }
        }
        if (pr.edge_band != null) {
          var eb = pr.edge_band;
          if (typeof eb !== 'object' || Array.isArray(eb)) {
            errors.push('project.edge_band باید شیء باشد');
          } else {
            ['body', 'door'].forEach(function (side) {
              var b = eb[side];
              if (b == null) return;
              if (typeof b !== 'object' || Array.isArray(b)) {
                errors.push('project.edge_band.' + side + ' باید شیء باشد'); return;
              }
              if (b.thickness_mm != null && EDGE_BAND_THICKNESS.indexOf(b.thickness_mm) === -1) {
                errors.push('نوار ' + (side === 'body' ? 'بدنه' : 'درب') + ': ضخامت فقط ' +
                  EDGE_BAND_THICKNESS.join(' یا ') + ' میل — مقدار: ' + b.thickness_mm);
              }
              if (b.note != null && typeof b.note !== 'string') {
                errors.push('project.edge_band.' + side + '.note باید متن باشد');
              }
              if (side === 'body' && b.subtract != null && typeof b.subtract !== 'boolean') {
                errors.push('project.edge_band.body.subtract باید بولین باشد');
              }
            });
          }
        }
        if (pr.marks != null) {
          var mk = pr.marks;
          if (typeof mk !== 'object' || Array.isArray(mk)) {
            errors.push('project.marks باید شیء باشد');
          } else {
            var seenCodes = {};
            MARK_KEYS.forEach(function (mkey) {
              var m = mk[mkey];
              if (m == null) return;
              if (typeof m !== 'object' || Array.isArray(m)) {
                errors.push('project.marks.' + mkey + ' باید شیء باشد'); return;
              }
              var code = (m.code == null ? '' : String(m.code)).trim();
              if (!code) {
                errors.push('علامت «' + (MARK_LABELS_FA[mkey] || mkey) + '» کد ندارد');
                return;
              }
              if (code.length > 3) {
                errors.push('علامت «' + (MARK_LABELS_FA[mkey] || mkey) + '»: کد حداکثر ۳ نویسه — «' + code + '»');
              }
              var norm = code.toLowerCase();
              if (seenCodes[norm]) {
                errors.push('کد «' + code + '» تکراری است (هم برای «' + seenCodes[norm] +
                  '» و هم «' + (MARK_LABELS_FA[mkey] || mkey) + '»)');
              } else {
                seenCodes[norm] = MARK_LABELS_FA[mkey] || mkey;
              }
            });
          }
        }
        if (pr.price_sheet != null) {
          var ps = pr.price_sheet;
          if (typeof ps !== 'object' || Array.isArray(ps)) {
            errors.push('project.price_sheet باید شیء باشد');
          } else {
            if (ps.currency != null && typeof ps.currency !== 'string') {
              errors.push('project.price_sheet.currency باید متن باشد');
            }
            ['edge_body_per_m', 'edge_door_per_m'].forEach(function (k) {
              if (ps[k] != null && !finiteNonNeg(ps[k])) {
                errors.push('project.price_sheet.' + k + ' باید عدد نامنفی باشد');
              }
            });
            ['sheets', 'hardware', 'assembly'].forEach(function (k) {
              var obj = ps[k];
              if (obj == null) return;
              if (typeof obj !== 'object' || Array.isArray(obj)) {
                errors.push('project.price_sheet.' + k + ' باید شیء باشد'); return;
              }
              Object.keys(obj).forEach(function (code) {
                if (!finiteNonNeg(obj[code])) {
                  errors.push('project.price_sheet.' + k + '.' + code + ' باید عدد نامنفی باشد — مقدار: ' + obj[code]);
                }
              });
            });
            if (ps.trim != null) {
              if (typeof ps.trim !== 'object' || Array.isArray(ps.trim)) {
                errors.push('project.price_sheet.trim باید شیء باشد');
              } else {
                ['crown_per_m', 'light_rail_per_m', 'kick_per_m',
                 'crown_bar_length_mm', 'light_rail_bar_length_mm', 'kick_bar_length_mm',
                 'crown_price_per_bar', 'light_rail_price_per_bar', 'kick_price_per_bar',
                 'crown_kerf_mm', 'light_rail_kerf_mm', 'kick_kerf_mm'].forEach(function (k) {
                  if (ps.trim[k] != null && !finiteNonNeg(ps.trim[k])) {
                    errors.push('project.price_sheet.trim.' + k + ' باید عدد نامنفی باشد');
                  }
                });
              }
            }
            if (ps.door_profile != null) {
              var dpv = ps.door_profile;
              if (typeof dpv !== 'object' || Array.isArray(dpv)) {
                errors.push('project.price_sheet.door_profile باید شیء باشد');
              } else {
                if (dpv.door_types != null && !Array.isArray(dpv.door_types)) {
                  errors.push('project.price_sheet.door_profile.door_types باید آرایه باشد');
                }
                ['plain_bar_length_mm', 'plain_price_per_bar', 'plain_kerf_mm',
                 'handle_bar_length_mm', 'handle_price_per_bar', 'handle_kerf_mm'].forEach(function (k) {
                  if (dpv[k] != null && !finiteNonNeg(dpv[k])) {
                    errors.push('project.price_sheet.door_profile.' + k + ' باید عدد نامنفی باشد');
                  }
                });
              }
            }
            if (ps.wall_rail != null) {
              var wrv = ps.wall_rail;
              if (typeof wrv !== 'object' || Array.isArray(wrv)) {
                errors.push('project.price_sheet.wall_rail باید شیء باشد');
              } else {
                ['plain_bar_length_mm', 'plain_price_per_bar', 'plain_kerf_mm',
                 'edged_bar_length_mm', 'edged_price_per_bar', 'edged_kerf_mm'].forEach(function (k) {
                  if (wrv[k] != null && !finiteNonNeg(wrv[k])) {
                    errors.push('project.price_sheet.wall_rail.' + k + ' باید عدد نامنفی باشد');
                  }
                });
                if (wrv.kits != null) {
                  if (typeof wrv.kits !== 'object' || Array.isArray(wrv.kits)) {
                    errors.push('project.price_sheet.wall_rail.kits باید شیء باشد');
                  } else {
                    Object.keys(wrv.kits).forEach(function (brand) {
                      if (!finiteNonNeg(wrv.kits[brand])) {
                        errors.push('project.price_sheet.wall_rail.kits.' + brand + ' باید عدد نامنفی باشد');
                      }
                    });
                  }
                }
              }
            }
            if (ps.moulding != null) {
              var mldv = ps.moulding;
              if (typeof mldv !== 'object' || Array.isArray(mldv)) {
                errors.push('project.price_sheet.moulding باید شیء باشد');
              } else {
                ['bar_length_mm', 'price_per_bar', 'kerf_mm'].forEach(function (k) {
                  if (mldv[k] != null && !finiteNonNeg(mldv[k])) {
                    errors.push('project.price_sheet.moulding.' + k + ' باید عدد نامنفی باشد');
                  }
                });
                if (mldv.boards != null) {
                  if (!Array.isArray(mldv.boards)) {
                    errors.push('project.price_sheet.moulding.boards باید آرایه باشد');
                  } else {
                    mldv.boards.forEach(function (b, i) {
                      if (b == null || typeof b !== 'object' || Array.isArray(b)) {
                        errors.push('project.price_sheet.moulding.boards[' + i + '] باید شیء باشد'); return;
                      }
                      ['length_mm', 'width_mm', 'returns'].forEach(function (k) {
                        if (b[k] != null && !finiteNonNeg(b[k])) {
                          errors.push('project.price_sheet.moulding.boards[' + i + '].' + k + ' باید عدد نامنفی باشد');
                        }
                      });
                      if (b.label_fa != null && typeof b.label_fa !== 'string') {
                        errors.push('project.price_sheet.moulding.boards[' + i + '].label_fa باید متن باشد');
                      }
                    });
                  }
                }
              }
            }
            if (ps.edge_roll != null) {
              var erv = ps.edge_roll;
              if (typeof erv !== 'object' || Array.isArray(erv)) {
                errors.push('project.price_sheet.edge_roll باید شیء باشد');
              } else {
                ['waste_mm', 'body_price_per_m', 'door_price_per_m'].forEach(function (k) {
                  if (erv[k] != null && !finiteNonNeg(erv[k])) {
                    errors.push('project.price_sheet.edge_roll.' + k + ' باید عدد نامنفی باشد');
                  }
                });
              }
            }
            if (ps.trim_rules != null) {
              var trv = ps.trim_rules;
              if (typeof trv !== 'object' || Array.isArray(trv)) {
                errors.push('project.price_sheet.trim_rules باید شیء باشد');
              } else {
                if (trv.default_deduction_mm != null && !finiteNonNeg(trv.default_deduction_mm)) {
                  errors.push('project.price_sheet.trim_rules.default_deduction_mm باید عدد نامنفی باشد');
                }
                if (trv.runs != null) {
                  if (!Array.isArray(trv.runs)) {
                    errors.push('project.price_sheet.trim_rules.runs باید آرایه باشد');
                  } else {
                    var TRIM_RUN_KINDS = { crown: 1, light_rail: 1, kick: 1 };
                    trv.runs.forEach(function (run, i) {
                      if (run == null || typeof run !== 'object' || Array.isArray(run)) {
                        errors.push('project.price_sheet.trim_rules.runs[' + i + '] باید شیء باشد'); return;
                      }
                      if (run.category != null && !TRIM_RUN_KINDS[run.category]) {
                        errors.push('project.price_sheet.trim_rules.runs[' + i + '].category نامعتبر است');
                      }
                      if (run.cabinet_ids != null && !Array.isArray(run.cabinet_ids)) {
                        errors.push('project.price_sheet.trim_rules.runs[' + i + '].cabinet_ids باید آرایه باشد');
                      }
                      if (run.corners != null && !finiteNonNeg(run.corners)) {
                        errors.push('project.price_sheet.trim_rules.runs[' + i + '].corners باید عدد نامنفی باشد');
                      }
                      if (run.deduction_mm != null && !finiteNonNeg(run.deduction_mm)) {
                        errors.push('project.price_sheet.trim_rules.runs[' + i + '].deduction_mm باید عدد نامنفی باشد');
                      }
                      if (run.label_fa != null && typeof run.label_fa !== 'string') {
                        errors.push('project.price_sheet.trim_rules.runs[' + i + '].label_fa باید متن باشد');
                      }
                    });
                  }
                }
              }
            }
          }
        }
        if (pr.drawer != null) {
          var dw = pr.drawer;
          if (typeof dw !== 'object' || Array.isArray(dw)) {
            errors.push('project.drawer باید شیء باشد');
          } else {
            if (dw.slide_kind != null && ['ball', 'bottom'].indexOf(dw.slide_kind) === -1) {
              errors.push("project.drawer.slide_kind باید 'ball' یا 'bottom' باشد");
            }
            ['ball_total_clearance_mm', 'bottom_total_clearance_mm', 'side_height_mm',
             'depth_mm', 'slide_length_mm'].forEach(function (k) {
              if (dw[k] != null && !finiteNonNeg(dw[k])) {
                errors.push('project.drawer.' + k + ' باید عدد نامنفی باشد');
              }
            });
          }
        }
        if (pr.panel != null) {
          var pn = pr.panel;
          if (typeof pn !== 'object' || Array.isArray(pn)) {
            errors.push('project.panel باید شیء باشد');
          } else if (pn.side != null && ['left', 'right'].indexOf(pn.side) === -1) {
            errors.push("project.panel.side باید 'left' یا 'right' باشد");
          }
        }
        if (pr.rails != null) {
          var rl = pr.rails;
          if (typeof rl !== 'object' || Array.isArray(rl)) {
            errors.push('project.rails باید شیء باشد');
          } else {
            ['front', 'back'].forEach(function (k) {
              if (rl[k] != null && ['L', 'h', 'none'].indexOf(rl[k]) === -1) {
                errors.push("project.rails." + k + " باید 'L' یا 'h' یا 'none' باشد");
              }
            });
            ['vertical_height_mm', 'horizontal_depth_mm'].forEach(function (k) {
              if (rl[k] != null && !finiteNonNeg(rl[k])) {
                errors.push('project.rails.' + k + ' باید عدد نامنفی باشد');
              }
            });
            if (rl.banded != null && !Array.isArray(rl.banded)) {
              errors.push('project.rails.banded باید آرایه باشد');
            }
          }
        }
        if (pr.placement != null) {
          var pl = pr.placement;
          if (typeof pl !== 'object' || Array.isArray(pl)) {
            errors.push('project.placement باید شیء باشد');
          } else {
            ['snap_distance_mm', 'snap_gap_mm'].forEach(function (k) {
              if (pl[k] != null && !finiteNonNeg(pl[k])) {
                errors.push('project.placement.' + k + ' باید عدد نامنفی باشد');
              }
            });
          }
        }
        if (pr.analysis_rules != null) {
          var ar = pr.analysis_rules;
          if (typeof ar !== 'object' || Array.isArray(ar)) {
            errors.push('project.analysis_rules باید شیء باشد');
          } else {
            ['max_panel_thickness_mm', 'thin_sheet_max_mm', 'rail_max_depth_mm',
             'edge_tolerance_mm'].forEach(function (k) {
              if (ar[k] != null && !finiteNonNeg(ar[k])) {
                errors.push('project.analysis_rules.' + k + ' باید عدد نامنفی باشد');
              }
            });
            // این دو «نسبت»اند و باید بین ۰ و ۱ بمانند، وگرنه تشخیص بی‌معنا می‌شود
            ['nearly_full_ratio', 'drawer_front_max_height_ratio'].forEach(function (k) {
              if (ar[k] == null) return;
              if (!finiteNonNeg(ar[k]) || ar[k] > 1) {
                errors.push('project.analysis_rules.' + k + ' باید نسبتی بین ۰ و ۱ باشد');
              }
            });
          }
        }
        if (pr.template_catalog != null) {
          if (typeof pr.template_catalog !== 'object' || Array.isArray(pr.template_catalog)) {
            errors.push('project.template_catalog باید شیء باشد');
          } else {
            Object.keys(pr.template_catalog).forEach(function (key) {
              var t = pr.template_catalog[key];
              if (t == null || typeof t !== 'object' || Array.isArray(t)) {
                errors.push('project.template_catalog.' + key + ' باید شیء باشد'); return;
              }
              if (t.label_fa != null && typeof t.label_fa !== 'string') {
                errors.push('project.template_catalog.' + key + '.label_fa باید متن باشد');
              }
            });
          }
        }
      }
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  function roleOfKey(key) {
    for (var role in ROLE_KEYS) {
      if (ROLE_KEYS[role].indexOf(key) !== -1) return role;
    }
    return null;
  }

  /** واحد نمایش مؤثر از تنظیمات (پیش‌فرض cm — تنظیمات قدیمیِ بدون display هم cm می‌گیرند). */
  function displayUnit(settings) {
    var u = settings && settings.display && settings.display.unit;
    return u === 'mm' ? 'mm' : 'cm';
  }

  /** mm داخلی → عدد در واحد نمایش (cm با حداکثر یک اعشار). برای فرم‌های ورودی. */
  function toUnit(mm, unit) {
    if (typeof mm !== 'number' || !isFinite(mm)) return null;
    return unit === 'mm' ? Math.round(mm) : Math.round(mm) / 10;
  }

  /** عدد واردشده در واحد نمایش → mm داخلی (صحیح). ورودی نامعتبر → null. */
  function fromUnit(val, unit) {
    var n = typeof val === 'number' ? val : parseFloat(val);
    if (!isFinite(n)) return null;
    return Math.round(unit === 'mm' ? n : n * 10);
  }

  /**
   * اعمال قطعی تنظیمات روی snapshot (کلون — ورودی mutate نمی‌شود).
   * sheets تنظیمات منبع حقیقت است و جایگزین snapshot.sheets می‌شود؛
   * cutting به‌صورت merge اعمال می‌شود.
   * @returns { snapshot, warnings[fa] }
   */
  function applyToSnapshot(snapshot, settings) {
    var s = clone(snapshot);
    var warnings = [];
    if (!settings) return { snapshot: s, warnings: warnings };

    if (Array.isArray(settings.sheets) && settings.sheets.length) {
      var newIds = {};
      settings.sheets.forEach(function (sh) { newIds[sh.sheet_id] = true; });
      // آشتی‌سنجی: قطعاتی که به ورق حذف‌شده ارجاع دارند
      var missing = {};
      (s.parts_flat || []).forEach(function (p) {
        if (!newIds[p.sheet_id]) missing[p.sheet_id] = (missing[p.sheet_id] || 0) + 1;
      });
      Object.keys(missing).forEach(function (id) {
        warnings.push(missing[id] + ' ردیف قطعه به ورق «' + id +
          '» ارجاع دارد که در تنظیمات جدید نیست — آنالیز با خطا رد خواهد شد');
      });
      s.sheets = clone(settings.sheets);
    }
    if (settings.cutting) {
      s.cutting = Object.assign({}, s.cutting || {}, clone(settings.cutting));
    }

    // تنظیمات پروژه: نگاشت نقش‌محور قطعات به ورق انتخابی (بدنه/درب/پشت‌بند).
    // ضخامت قطعه = ضخامت ورق مقصد. ابعاد پارامتریک (که به ضخامت وابسته‌اند) این‌جا
    // بازمحاسبه نمی‌شوند — آن کار دامنهٔ Ruby است و در اسکن بعدی انجام می‌شود؛
    // اگر ضخامتی عوض شود، صادقانه هشدار می‌دهیم.
    if (settings.project) {
      var pr = settings.project;
      var bySheet = {};
      (s.sheets || []).forEach(function (sh) { bySheet[sh.sheet_id] = sh; });
      var target = {
        body: bySheet[pr.body_sheet_id] || null,
        door: bySheet[pr.door_sheet_id] || null,
        back: bySheet[pr.back_sheet_id] || null,
        drawer_bottom: bySheet[pr.drawer_bottom_sheet_id] || null
      };
      var remapped = 0, thicknessChanged = 0;
      (s.parts_flat || []).forEach(function (p) {
        var role = roleOfKey(p.key);
        var t = role && target[role];
        if (!t) return;
        if (p.sheet_id !== t.sheet_id) { p.sheet_id = t.sheet_id; remapped++; }
        if (p.thickness_mm !== t.thickness_mm) { p.thickness_mm = t.thickness_mm; thicknessChanged++; }
      });
      if (remapped) {
        warnings.push(remapped + ' ردیف قطعه طبق تنظیمات پروژه به ورق بدنه/درب/پشت‌بند نگاشت شد');
      }
      if (thicknessChanged) {
        warnings.push(thicknessChanged + ' ردیف ضخامت تازه گرفت — ابعاد پارامتریک وابسته به ضخامت ' +
          'در اسکن بعدی داخل اسکچاپ بازمحاسبه می‌شود');
      }
      // نوار لبه در محاسبات: ضخامت نوار از اندازهٔ برش کم می‌شود تا اندازهٔ نهایی (قطعه+نوار)
      // درست دربیاید. قرارداد جهت: front/back در راستای طول (نوارشان به عرض اضافه می‌کند →
      // از cut_width کم می‌شود)؛ top/bottom در راستای عرض (→ از cut_length کم می‌شود).
      // فقط برای نواری که subtract روشن است. درب طبق خواستهٔ کاربر کسر نمی‌شود.
      var eb = pr.edge_band || {};
      var bandOf = function (role) { return role === 'door' ? (eb.door || {}) : (eb.body || {}); };
      var subtracted = 0;
      (s.parts_flat || []).forEach(function (p) {
        var role = roleOfKey(p.key);
        var spec = bandOf(role);
        if (!spec || !spec.subtract || !spec.thickness_mm) return; // فقط بدنه (subtract) کسر می‌شود
        var e = p.edge || {};
        var dLen = ((e.top || 0) + (e.bottom || 0)) * spec.thickness_mm;   // نوار عرض‌راستا → طول
        var dWid = ((e.front || 0) + (e.back || 0)) * spec.thickness_mm;   // نوار طول‌راستا → عرض
        if (dLen && p.cut_length_mm - dLen > 0) { p.cut_length_mm -= dLen; subtracted++; }
        if (dWid && p.cut_width_mm - dWid > 0) { p.cut_width_mm -= dWid; }
      });
      if (subtracted) {
        warnings.push(subtracted + ' قطعهٔ نواردار: ضخامت نوار از اندازهٔ برش کم شد (اندازهٔ نهایی درست)');
      }

      // فارسی‌بر (کج‌بری ۴۵°) روی قطعه: هر ضلع مثل groove — بدون داده در قطعاتی که ندارند،
      // با {} پیش‌فرض تا موتورهای مصرف‌کننده بی‌نیاز از چک null باشند.
      (s.parts_flat || []).forEach(function (p) {
        if (p.miter == null) p.miter = {};
        if (p.bevel == null) p.bevel = {};
      });

      // متادیتای ریل/نوار/علائم برای گزارش و علامت‌گذاری (موتورهای مصرف‌کننده مستقل می‌مانند)
      var mk = Object.assign({}, DEFAULT_MARKS, pr.marks || {});
      var marksOut = {};
      MARK_KEYS.forEach(function (mkey) {
        var m = mk[mkey] || DEFAULT_MARKS[mkey];
        marksOut[mkey] = { code: (m.code || DEFAULT_MARKS[mkey].code), label_fa: MARK_LABELS_FA[mkey] };
      });
      s.project = {
        slide_type: pr.slide_type || null,
        slide_type_fa: SLIDE_TYPES[pr.slide_type] || null,
        edge_band: {
          body: {
            thickness_mm: (eb.body && eb.body.thickness_mm) || null,
            note: (eb.body && eb.body.note) || '',
            subtract: !!(eb.body && eb.body.subtract)
          },
          door: {
            thickness_mm: (eb.door && eb.door.thickness_mm) || null,
            note: (eb.door && eb.door.note) || '',
            subtract: false
          }
        },
        marks: marksOut
      };
    }
    return { snapshot: s, warnings: warnings };
  }

  return { VERSION: VERSION, defaults: defaults, validate: validate,
    get DOOR_SHAPES() { return doorShapes(); },
           applyToSnapshot: applyToSnapshot, displayUnit: displayUnit,
           toUnit: toUnit, fromUnit: fromUnit,
           SLIDE_TYPES: SLIDE_TYPES, EDGE_BAND_THICKNESS: EDGE_BAND_THICKNESS, ROLE_KEYS: ROLE_KEYS,
           MARK_KEYS: MARK_KEYS, MARK_LABELS_FA: MARK_LABELS_FA, DEFAULT_MARKS: DEFAULT_MARKS };
}));
