/**
 * kalaxa-hardware.js — v1.0.0
 * موتور یراق: BOM قطعی از snapshot — بدون تغییر schema (استخراج از parts_flat + params).
 * JS خالص، UMD، بدون وابستگی.
 *
 * قواعد قطعی v1 (قابل override با options.rules):
 *   لولا:      ارتفاع درب <900→۲، <1600→۳، <2000→۴، وگرنه ۵ (به‌ازای هر لنگه)
 *   ریل کشو:   هر نمای کشو یک جفت؛ طول ریل = بزرگ‌ترین سایز استاندارد ≤ (عمق کابینت−50)
 *   دستگیره:   هر درب و هر کشو ۱
 *   پایه:      کابینت زمینی/قدی: عرض ≤900→۴، وگرنه ۶
 *   پین طبقه:  هر طبقه ۴
 *   مینی‌فیکس: هر قطعه افقی بدنه (کف/سقف/قید) ۴ عدد + دوبل به همان تعداد
 *
 * ادغام یراق صریح سند (v1.1 — D-HW-1):
 *   options.explicit = [{unit_id, name, kind, qty, sku}]
 *   سیاست: «صریح بر قاعده غالب است، به تفکیک (کابینت، نوع)» —
 *   اگر یونیتی یراق صریح از نوع K داشته باشد، سهم قاعده‌محور همان نوع برای همان
 *   کابینت حذف و ردیف‌های صریح جایگزین می‌شود؛ بقیه کابینت‌ها و نوع‌ها با قاعده
 *   پر می‌شوند. نگاشت نوع: hinge→لولا، slide→ریل، handle→دستگیره، leg→پایه،
 *   connector→مینی‌فیکس+دوبل؛ نوع ناشناخته فقط ردیف مستقل می‌شود.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaHardware = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.2.0';
  var SLIDE_SIZES = [250, 300, 350, 400, 450, 500, 550, 600];

  var DEFAULT_RULES = {
    hinge_breaks: [[900, 2], [1600, 3], [2000, 4], [Infinity, 5]],
    legs_narrow: 4, legs_wide: 6, legs_width_break_mm: 900,
    shelf_pins_per_shelf: 4,
    minifix_per_horizontal: 4,
    door_keys: ['door'],
    drawer_front_keys: ['drawer_front'],
    shelf_keys: ['shelf'],
    horizontal_keys: ['bottom', 'top_bottom', 'rail_top', 'rail_bottom'],
    // نوع دستگیره‌هایی که «دستگیرهٔ خریدنی» ندارند. تا پیش از این BOM بدون توجه به
    // params.handle_kind همیشه یک دستگیره به‌ازای هر درب/کشو می‌شمرد — حتی وقتی کاربر
    // در دیالوگ ساخت «بدون دستگیره» را انتخاب کرده بود؛ یعنی مدل سه‌بعدی هیچ دستگیره‌ای
    // نمی‌کشید ولی شیت قیمت آن را فاکتور می‌کرد. «مخفی/گاولا» هم یک فرورفتگی ماشین‌کاری‌شده
    // است نه قطعهٔ شمارشی (پروفیل گاولا اگر لازم بود، متری و به‌صورت یراق صریح سند اضافه
    // می‌شود) — پس هشدار می‌دهیم تا خاموش از قلم نیفتد.
    handle_kinds_without_hardware: ['none', 'hidden'],
    handle_kinds_needing_profile: ['hidden']
  };

  function fa(n) {
    return String(n).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
  }

  function hingesForDoorHeight(h, breaks) {
    for (var i = 0; i < breaks.length; i++) {
      if (h < breaks[i][0]) return breaks[i][1];
    }
    return breaks[breaks.length - 1][1];
  }

  // بزرگ‌ترین سایز استاندارد ≤ target؛ اگر عمق آن‌قدر کم است که هیچ‌کدام جا نشود،
  // به‌جای بازگشت خاموش به کوچک‌ترین سایز (که خلاف قرارداد مستندشده و گمراه‌کننده
  // بود)، null برمی‌گرداند تا caller آگاهانه تصمیم بگیرد و هشدار بدهد.
  function slideSizeForDepth(depthMm) {
    var target = depthMm - 50;
    var best = null;
    SLIDE_SIZES.forEach(function (s) { if (s <= target) best = s; });
    return best;
  }

  /**
   * @param {object} snapshot
   * @param {object} [options] - { rules: {...} }
   * @returns {items: [{item_id, name_fa, qty, unit, detail_fa}], by_cabinet: {...}}
   */
  function bom(snapshot, options) {
    options = options || {};
    var R = Object.assign({}, DEFAULT_RULES, options.rules || {});

    var cabMap = {};
    (snapshot.cabinets || []).forEach(function (c) { cabMap[c.kalaxa_id] = c; });

    var byCabinet = {};
    var shallowWarnings = {}; // "کابینت|عمق" → {cabinet, depth_mm} — عمق کمتر از حداقل ریل استاندارد
    var profileCabs = {};   // کابینت‌هایی که گاولا دارند
    var golaMm = 0;         // متراژ خام گاولا (mm)
    function cab(id) {
      if (!byCabinet[id]) {
        byCabinet[id] = { hinge: 0, slide_pairs: 0, handle: 0, leg: 0, shelf_pin: 0, minifix: 0,
                          _slides: {}, _dowel: 0 };
      }
      return byCabinet[id];
    }

    (snapshot.parts_flat || []).forEach(function (p) {
      var c = cabMap[p.cabinet_id] || {};
      var params = c.params || {};
      var bc = cab(p.cabinet_id);

      // نوع دستگیرهٔ همین کابینت (نبودنش = 'bar'، رفتار قبلی برای snapshotهای قدیمی)
      var handleKind = String(params.handle_kind || 'bar');
      var billsHandle = R.handle_kinds_without_hardware.indexOf(handleKind) === -1;
      // گاولا: پروفیل متری که روی لبهٔ نما می‌نشیند.
      //
      // تا این نسخه فقط **هشدار** می‌داد: «اگر پروفیل گاولا می‌خرید، خودتان
      // متری اضافه کنید». یعنی کالاکسا می‌دانست لازم است ولی حساب نمی‌کرد و
      // کار را به کاربر پس می‌داد. حالا از عرض همان نماهایی که گاولا دارند
      // متراژ درمی‌آید.
      if (R.handle_kinds_needing_profile.indexOf(handleKind) !== -1) {
        profileCabs[p.cabinet_id] = c.label_fa || p.cabinet_id;
        if (R.door_keys.indexOf(p.key) !== -1 || R.drawer_front_keys.indexOf(p.key) !== -1) {
          // گاولا در راستای **عرض** نما می‌رود، نه ارتفاعش. برای درب،
          // cut_length ارتفاع است و cut_width عرض — پس عرض همان چیزی است که
          // متراژ می‌سازد.
          golaMm += (p.cut_width_mm || 0) * p.count;
        }
      }

      if (R.door_keys.indexOf(p.key) !== -1) {
        var perDoor = hingesForDoorHeight(p.cut_length_mm, R.hinge_breaks);
        bc.hinge += perDoor * p.count;
        if (billsHandle) bc.handle += p.count;
      }

      if (R.drawer_front_keys.indexOf(p.key) !== -1) {
        var depthMm = (params.cabinet_depth || 55) * 10;
        var size = slideSizeForDepth(depthMm);
        if (size === null) {
          size = SLIDE_SIZES[0]; // بهترین تخمین ممکن، اما با هشدار صریح — نه سکوت
          shallowWarnings[(c.label_fa || p.cabinet_id) + '|' + depthMm] = {
            cabinet: c.label_fa || p.cabinet_id, depth_mm: depthMm
          };
        }
        bc._slides[size] = (bc._slides[size] || 0) + p.count;
        bc.slide_pairs += p.count;
        if (billsHandle) bc.handle += p.count;
      }

      if (R.shelf_keys.indexOf(p.key) !== -1) {
        bc.shelf_pin += R.shelf_pins_per_shelf * p.count;
      }

      if (R.horizontal_keys.indexOf(p.key) !== -1) {
        bc.minifix += R.minifix_per_horizontal * p.count;
        bc._dowel += R.minifix_per_horizontal * p.count;
      }
    });

    // پایه: به‌ازای هر کابینت روی زمین
    (snapshot.cabinets || []).forEach(function (c) {
      var catOnFloor = (c.category === 'base' || c.category === 'tall');
      if (!catOnFloor) return;
      var wMm = (c.params && c.params.cabinet_width || 0) * 10;
      cab(c.kalaxa_id).leg += wMm > R.legs_width_break_mm ? R.legs_wide : R.legs_narrow;
    });

    // --- ادغام یراق صریح (D-HW-1): صریح بر قاعده غالب، به تفکیک (کابینت، نوع) ---
    var KIND_FIELDS = { hinge: ['hinge'], handle: ['handle'], leg: ['leg'],
                        connector: ['minifix', '_dowel'] };
    var explicitRows = [];
    var overridden = {}; // "cabId|kind" → true (برای گزارش)
    (options.explicit || []).forEach(function (h) {
      if (!h || typeof h !== 'object') return;
      var qty = h.qty;
      // متریال متری اعشار دارد (۲٫۸ متر پروفیل). اجبار به عدد صحیح یعنی هر
      // ردیف متری بی‌صدا دور انداخته شود.
      if (typeof qty !== 'number' || !isFinite(qty) || qty <= 0) return;
      if (h.unit !== 'متر' && qty !== Math.floor(qty)) return;
      explicitRows.push(h);
      var bc = byCabinet[h.unit_id];
      if (!bc) return; // یونیت بدون قطعه/کابینت — فقط ردیف مستقل
      var key = h.unit_id + '|' + h.kind;
      if (overridden[key]) return;
      overridden[key] = true;
      if (h.kind === 'slide') {
        bc._slides = {};
        bc.slide_pairs = 0;
      } else {
        (KIND_FIELDS[h.kind] || []).forEach(function (f) { bc[f] = 0; });
      }
    });

    // --- جمع‌بندی از per-cabinet ---
    var totals = { hinge: 0, handle: 0, leg: 0, shelf_pin: 0, minifix: 0, dowel: 0 };
    var slides = {};
    Object.keys(byCabinet).forEach(function (id) {
      var bc = byCabinet[id];
      totals.hinge += bc.hinge; totals.handle += bc.handle; totals.leg += bc.leg;
      totals.shelf_pin += bc.shelf_pin; totals.minifix += bc.minifix; totals.dowel += bc._dowel;
      Object.keys(bc._slides).forEach(function (sz) {
        slides[sz] = (slides[sz] || 0) + bc._slides[sz];
      });
      delete bc._slides; delete bc._dowel; // قرارداد خروجی by_cabinet مثل v1.0
    });

    // نام یراق و واحدها از واژه‌نامهٔ کارگاه حل می‌شود (options.glossary). اگر نباشد،
    // همان رشتهٔ پیش‌فرض قبلی برمی‌گردد — پس snapshot قدیمی و تست‌های موجود دست‌نخورده می‌مانند.
    // item_id همیشه ثابت است — جدول قیمت روی آن کلید می‌خورد، نه روی نام.
    var gloss = options.glossary || null;
    function word(key, fallback) {
      if (!gloss || typeof gloss.t !== 'function') return fallback;
      return gloss.t(key, fallback);
    }
    function hwName(itemId, fallback) {
      if (!gloss || typeof gloss.hardware !== 'function') return fallback;
      return gloss.hardware(itemId, fallback);
    }

    // کاتالوگ یراق از تنظیمات پروژه: کدام قلم اصلاً در این کارگاه استفاده
    // می‌شود، و با چه واحدی.
    //
    // کاربر: «مینی‌فیکس و دوبل چوبی نداریم» — ولی BOM آن‌ها را می‌شمرد و در
    // شیت قیمت می‌آورد. قلمی که کارگاه استفاده نمی‌کند نباید در فاکتور بیاید.
    //
    // **نام** عمداً این‌جا نیست: نام یراق از واژه‌نامه می‌آید و همان‌جا هم
    // ویرایش می‌شود. دو منبع برای یک نام یعنی روزی جدول یک چیز بگوید و فاکتور
    // چیز دیگری — همان چیزی که کاربر خواست «یکی بشه».
    var catalog = (options && options.catalog) || {};
    var catalogWarnings = [];
    function spec(id) { return catalog[id] || {}; }

    // متریال طولی (دستگیرهٔ متری، پروفیل گاولا): تعداد × طول → متر.
    // طول از تنظیمات می‌آید؛ اگر نیامده باشد صریح می‌گوییم نمی‌دانیم، نه
    // اینکه عدد بی‌معنا در فاکتور بگذاریم.
    function toMeters(id, qty) {
      var sp = spec(id);
      var len = Number(sp.length_mm);
      if (!(len > 0)) {
        catalogWarnings.push('«' + hwName(id, id) + '» متری است ولی طولش در تنظیمات ' +
          'وارد نشده — متراژ محاسبه نشد و در فاکتور نیامد');
        return null;
      }
      return Math.round(qty * len / 1000 * 100) / 100;
    }

    var UNIT_WORD = { piece: ['unit.piece', 'عدد'], pair: ['unit.pair', 'جفت'],
                      m: ['unit.meter', 'متر'] };

    var items = [];
    function push(id, name, qty, unit, detail) {
      if (!(qty > 0)) return;
      var sp = spec(id);
      if (sp.enabled === false) return;   // این کارگاه این قلم را ندارد

      var u = sp.unit;
      if (u === 'm') {
        var m = toMeters(id, qty);
        if (m == null) return;
        items.push({ item_id: id, name_fa: name, qty: m,
                     unit: word('unit.meter', 'متر'), detail_fa: detail || '',
                     count: qty });
        return;
      }
      if (u && UNIT_WORD[u]) unit = word(UNIT_WORD[u][0], UNIT_WORD[u][1]);
      items.push({ item_id: id, name_fa: name, qty: qty,
                   unit: unit || word('unit.piece', 'عدد'), detail_fa: detail || '' });
    }
    push('hinge', hwName('hinge', 'لولا آرام‌بند'), totals.hinge, word('unit.piece', 'عدد'), 'بر اساس ارتفاع هر لنگه');
    // نوع ریل از تنظیمات پروژه (اگر باشد) — فقط برچسب گزارش؛ item_id قرارداد قیمت ثابت می‌ماند
    var slideTypeFa = (snapshot.project && snapshot.project.slide_type_fa) || '';
    Object.keys(slides).sort(function (a, b) { return a - b; }).forEach(function (s) {
      push('slide_' + s, hwName('slide_' + s, 'ریل کشو ' + fa(s) + ' میلی‌متر'), slides[s], word('unit.pair', 'جفت'),
           slideTypeFa ? 'نوع: ' + slideTypeFa : '');
    });
    push('handle', hwName('handle', 'دستگیره'), totals.handle, word('unit.piece', 'عدد'), 'درب + کشو');
    push('leg', hwName('leg', 'پایه تنظیمی'), totals.leg, word('unit.piece', 'عدد'), 'زمینی و قدی');
    push('shelf_pin', hwName('shelf_pin', 'پین طبقه'), totals.shelf_pin, word('unit.piece', 'عدد'), '');
    push('minifix', hwName('minifix', 'مینی‌فیکس'), totals.minifix, word('unit.piece', 'عدد'), 'اتصالات افقی بدنه');
    push('dowel', hwName('dowel', 'دوبل چوبی'), totals.dowel, word('unit.piece', 'عدد'), '');

    // گاولا **متری** است، نه شمارشی. `push` واحد را از کاتالوگ می‌خواند، ولی
    // این قلم ذاتاً طولی است، پس متراژ را همین‌جا می‌دهیم و واحدش را متر
    // می‌گذاریم مگر کارگاه چیز دیگری بگوید.
    var golaBilled = false;
    if (golaMm > 0 && spec('gola').enabled !== false) {
      var golaWaste = Number(spec('gola').waste_pct);
      if (!(golaWaste >= 0)) golaWaste = 5;   // پرت برش پروفیل
      var meters = Math.round(golaMm / 1000 * (1 + golaWaste / 100) * 100) / 100;
      items.push({ item_id: 'gola', name_fa: hwName('gola', 'پروفیل گاولا'),
                   qty: meters, unit: word('unit.meter', 'متر'),
                   detail_fa: 'در راستای عرض نماهای گاولادار، با ' +
                              fa(golaWaste) + '٪ پرت برش' });
      golaBilled = true;
    }

    // ردیف‌های صریح: گروه‌بندی بر اساس (نوع، نام، sku) — همیشه با نشان «صریح از سند»
    var expGroups = {};
    explicitRows.forEach(function (h) {
      // واحد و زیرگروه هم بخشی از هویت ردیف‌اند: «ریل ۵۰۰ عدد» و «ریل ۵۰۰
      // متر» یک کالا نیستند. نسخهٔ اول واحد را قفلِ «عدد» گذاشته بود، پس
      // یراق متری (پروفیل، نوار، زنجیر) اصلاً قابل ثبت نبود.
      var gk = [h.kind, h.name || '', h.sku || '', h.unit || '', h.group || ''].join('|');
      if (!expGroups[gk]) {
        expGroups[gk] = { kind: h.kind, name: h.name, sku: h.sku, qty: 0,
                          unit: h.unit, group: h.group };
      }
      expGroups[gk].qty += h.qty;
    });
    Object.keys(expGroups).sort().forEach(function (gk) {
      var g = expGroups[gk];
      var detail = 'صریح از سند' + (g.sku ? ' — ' + g.sku : '');
      if (g.group) detail = g.group + ' — ' + detail;
      var row = { item_id: 'explicit_' + (g.sku || g.kind),
                  name_fa: g.name || g.kind, qty: g.qty,
                  unit: g.unit || word('unit.piece', 'عدد'),
                  detail_fa: detail };
      if (g.group) row.group_fa = g.group;
      items.push(row);
    });

    var warnings = Object.keys(shallowWarnings).map(function (k) {
      var w = shallowWarnings[k];
      return 'کابینت «' + w.cabinet + '» عمق ' + w.depth_mm + 'mm دارد — حتی کوچک‌ترین ریل ' +
        'استاندارد (' + SLIDE_SIZES[0] + 'mm) هم ممکن است جا نشود؛ اندازه دستی بررسی شود';
    });
    // گاولا فقط وقتی هشدار است که **حساب نشده باشد**. حالا حساب می‌شود، پس
    // به‌جای «خودت اضافه کن» یک ردیف واقعی می‌آید.
    var golaCount = Object.keys(profileCabs).length;
    if (golaCount && !golaBilled) {
      warnings.push(fa(golaCount) + ' کابینت دستگیرهٔ مخفی (گاولا) دارد ولی پروفیل ' +
        'گاولا در کاتالوگ یراق خاموش است — متراژش فاکتور نشد');
    }

    // هشدارهای کاتالوگ **قبل** از این نقطه ساخته می‌شوند (داخل push)، پس
    // این‌جا اضافه می‌شوند. نسخهٔ اول مستقیم روی `warnings` می‌نوشت که هنوز
    // تعریف نشده بود — هشدار بی‌صدا گم می‌شد.
    catalogWarnings.forEach(function (w) {
      if (warnings.indexOf(w) === -1) warnings.push(w);
    });

    return { version: VERSION, items: items, by_cabinet: byCabinet, rules_used: R,
             explicit_count: explicitRows.length, warnings: warnings };
  }

  /** برآورد قیمت یراق: priceTable.hardware = { item_id: unit_price } (ریل: slide_450 و…) */
  function price(bomResult, priceTable) {
    var hw = (priceTable || {}).hardware || {};
    var lines = bomResult.items.map(function (it) {
      var unit = hw[it.item_id] || 0;
      return {
        kind: 'hardware', item_id: it.item_id,
        qty: it.qty, unit_price: unit, cost: unit * it.qty,
        label_fa: it.name_fa + ' × ' + it.qty
      };
    });
    return {
      lines: lines,
      total: lines.reduce(function (s, l) { return s + l.cost; }, 0)
    };
  }

  return { VERSION: VERSION, bom: bom, price: price, DEFAULT_RULES: DEFAULT_RULES };
}));
