/**
 * Kalaxa Goods — فهرست کالا (برگهٔ سفارش)
 *
 * کاربر خواست «کالا هم باشه». گزارش متریال از قبل بود، ولی چیزی که به دست
 * فروشنده داده می‌شود نیست: **نمی‌شود ۴٫۷ متر مربع MDF سفارش داد.** ورق برگی
 * فروخته می‌شود، نوار متری، یراق عددی. این ماژول همان تبدیل را انجام می‌دهد.
 *
 * سه منبع را در یک برگه جمع می‌کند:
 *   - ورق  ← نتیجهٔ نستینگ (تعداد **برگ**، نه مساحت)
 *   - نوار ← گزارش نوار لبه (متر، با پرت)
 *   - یراق ← BOM یراق (عدد)
 *
 * قاعدهٔ کلی: هر سطر باید **قابل سفارش** باشد — واحد شمارش، تعداد صحیح، و
 * وقتی عددی تخمینی است صریح گفته شود. سطری که کارگاه نتواند با آن خرید کند،
 * در این فهرست جا ندارد.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KalaxaGoods = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  var DEFAULTS = {
    // درصد ورق اضافه برای خرابکاری/اشتباه برش. کارگاه‌ها معمولاً یک برگ اضافه
    // می‌گیرند؛ صفر یعنی «دقیقاً به اندازه» که در عمل کم می‌آورد.
    sheet_spare_pct: 0,
    // حداقل سفارش نوار (متر) — کمتر از این معمولاً فروخته نمی‌شود.
    edge_min_order_m: 0,
    // یراق را هم بیاور
    include_hardware: true
  };

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }
  function r2(n) { return Math.round(n * 100) / 100; }

  function cfgOf(options) {
    var c = {};
    Object.keys(DEFAULTS).forEach(function (k) { c[k] = DEFAULTS[k]; });
    Object.keys(options || {}).forEach(function (k) {
      if (options[k] != null) c[k] = options[k];
    });
    return c;
  }

  /**
   * کد کالا. اگر ورق کد فروشنده دارد همان، وگرنه از شناسه ساخته می‌شود.
   * کد پایدار لازم است تا سفارش دفعهٔ بعد با همین اسم بخواند.
   */
  function codeOf(prefix, id, explicit) {
    if (explicit) return String(explicit);
    return prefix + '-' + String(id || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-');
  }

  /**
   * @param {object} snapshot
   * @param {object} nestingResult - خروجی نستینگ؛ **تعداد برگ** از این‌جا می‌آید
   * @param {object} report - KalaxaReport (برای نوار لبه)
   * @param {object} hardwareBom - خروجی KalaxaHardware.bom (اختیاری)
   * @param {object} [options]
   * @returns {{rows:Array, groups:object, warnings:Array<string>}}
   */
  function build(snapshot, nestingResult, report, hardwareBom, options) {
    var cfg = cfgOf(options);
    var warnings = [];
    var rows = [];
    var snap = snapshot || {};

    var sheetMap = {};
    (snap.sheets || []).forEach(function (s) { sheetMap[s.sheet_id] = s; });

    /* ------------------------------- ورق ------------------------------- */
    // **تعداد برگ** از نستینگ می‌آید، نه از مساحت قطعات. مساحت قابل سفارش
    // نیست: ۴٫۷ متر مربع یعنی ممکن است ۲ برگ کافی باشد یا ۳ تا لازم شود —
    // بستگی به چیدمان دارد، و تنها نستینگ آن را می‌داند.
    var nest = ((nestingResult || {}).by_sheet_type) || [];
    if (!nest.length) {
      warnings.push('نستینگ اجرا نشده — تعداد برگ معلوم نیست. اول «اسکن مدل و آنالیز» را بزنید.');
    }
    nest.forEach(function (g) {
      var s = sheetMap[g.sheet_id] || {};
      var used = Math.max(0, Math.ceil(num(g.sheets_used)));
      var spare = Math.ceil(used * cfg.sheet_spare_pct / 100);
      rows.push({
        group: 'sheet',
        code: codeOf('SH', g.sheet_id, s.supplier_code),
        name: sheetLabel(g.sheet_id, s),
        spec: (s.thickness_mm ? s.thickness_mm + 'mm' : '') +
              (s.width_mm && s.height_mm ? ' — ' + s.width_mm + '×' + s.height_mm : ''),
        unit: 'برگ',
        qty: used + spare,
        qty_base: used,
        qty_spare: spare,
        exact: true,           // شمارش برگ از نستینگ دقیق است
        note: g.utilization_pct ? 'بهره‌وری ' + Math.round(g.utilization_pct) + '٪' : ''
      });
    });

    /* ------------------------------- نوار ------------------------------- */
    var eb = (report && report.by_sheet) || [];
    eb.forEach(function (e) {
      var s = sheetMap[e.sheet_id] || {};
      var m = Math.max(num(e.meters_with_waste), cfg.edge_min_order_m);
      if (m <= 0) return;
      rows.push({
        group: 'edge',
        code: codeOf('ED', e.sheet_id, s.edge_code),
        name: 'نوار لبه — ' + sheetLabel(e.sheet_id, s),
        spec: s.thickness_mm ? 'برای ورق ' + s.thickness_mm + 'mm' : '',
        unit: 'متر',
        qty: Math.ceil(m),
        qty_base: r2(num(e.meters)),
        qty_spare: r2(m - num(e.meters)),
        // متراژ نوار تخمینی است: پرت اتصال و تنظیم دستگاه در هر کارگاه فرق
        // می‌کند. گفتنش صادقانه‌تر از عدد قطعی‌نماست.
        exact: false,
        note: 'شامل پرت؛ به بالا گرد شده'
      });
    });

    /* ------------------------------- یراق ------------------------------- */
    // قرارداد خروجی KalaxaHardware.bom: `items` با
    // {item_id, name_fa, qty, unit, detail_fa}. کد کالا روی **item_id** بسته
    // می‌شود نه روی نام: نام از واژه‌نامهٔ کارگاه می‌آید و تغییرپذیر است، ولی
    // سفارش دفعهٔ بعد باید با همان کد بخواند.
    if (cfg.include_hardware && hardwareBom && hardwareBom.items) {
      hardwareBom.items.forEach(function (h) {
        var q = Math.max(0, Math.ceil(num(h.qty)));
        if (!q) return;
        rows.push({
          group: 'hardware',
          code: codeOf('HW', h.item_id),
          name: h.name_fa || h.item_id || '',
          spec: h.detail_fa || '',
          unit: h.unit || 'عدد',
          qty: q, qty_base: q, qty_spare: 0,
          exact: true, note: ''
        });
      });
    }

    /* ------------------------ ادغام سطرهای هم‌کالا ------------------------ */
    // دو کابینت با یک ورق نباید دو سطر سفارش بدهند.
    var byCode = {};
    var merged = [];
    rows.forEach(function (r) {
      var k = r.group + '|' + r.code + '|' + r.unit;
      if (byCode[k]) {
        byCode[k].qty += r.qty;
        byCode[k].qty_base = r2(byCode[k].qty_base + r.qty_base);
        byCode[k].qty_spare = r2(byCode[k].qty_spare + r.qty_spare);
        return;
      }
      byCode[k] = r;
      merged.push(r);
    });

    var groups = { sheet: [], edge: [], hardware: [] };
    merged.forEach(function (r) { (groups[r.group] || []).push(r); });

    if (!merged.length) warnings.push('کالایی برای سفارش نیست — هنوز قطعه‌ای تحلیل نشده.');

    return { rows: merged, groups: groups, warnings: warnings,
             estimated: merged.some(function (r) { return !r.exact; }) };
  }

  function sheetLabel(id, s) {
    var parts = [];
    if (s.material) parts.push(s.material);
    if (s.color_code) parts.push(s.color_code);
    return parts.length ? parts.join(' ') : String(id || '');
  }

  var GROUP_LABELS_FA = { sheet: 'ورق', edge: 'نوار لبه', hardware: 'یراق' };

  return { VERSION: VERSION, DEFAULTS: DEFAULTS, build: build,
           GROUP_LABELS_FA: GROUP_LABELS_FA };
}));
