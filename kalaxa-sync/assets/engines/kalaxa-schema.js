/**
 * kalaxa-schema.js — v1.0.0
 * Schema v2 + مهاجرت v1→v2 + اعتبارسنجی عمیق payload.
 * JS خالص، UMD، بدون وابستگی.
 *
 * schema_version 2 = v1 به‌علاوه:
 *   - stock_offcuts: []            (رسمی‌شدن انبار آفکات)
 *   - scan_stats: {}               (زمان و آمار اسکن — اختیاری)
 *   - part_uid پایدار برای همه قطعات (تولید قطعی برای فایل‌های قدیمی)
 * هیچ فیلد v1 حذف یا تغییرنام نمی‌یابد؛ سازگاری رو به عقب کامل است.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaSchema = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  // نسخهٔ قرارداد از data/snapshot.json می‌آید — همان فایلی که تولیدکننده
  // (ProjectScanner) هم می‌خواند. پیش از این هر طرف عدد خودش را داشت، روی
  // مهم‌ترین قرارداد سیستم. اگر کاتالوگ در دسترس نبود (پنل، پیش از تزریق)،
  // به عدد شناخته‌شده برمی‌گردیم تا اعتبارسنجی هرگز از کار نیفتد.
  var FALLBACK_CURRENT = 2;
  var FALLBACK_SUPPORTED = [1, 2];

  function catalogSnapshot() {
    try {
      var C = (typeof require === 'function')
        ? require('./kalaxa-catalog.js')
        : (typeof KalaxaCatalog !== 'undefined' ? KalaxaCatalog : null);
      if (C && C.isLoaded()) return C.get('snapshot');
    } catch (e) { /* کاتالوگ نبود — پیش‌فرض */ }
    return null;
  }

  var snap = catalogSnapshot();
  var CURRENT_SCHEMA = (snap && snap.current_version) || FALLBACK_CURRENT;
  var SUPPORTED = (snap && snap.supported_versions) || FALLBACK_SUPPORTED;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function finitePos(n) { return typeof n === 'number' && isFinite(n) && n > 0; }
  function finiteNonNeg(n) { return typeof n === 'number' && isFinite(n) && n >= 0; }
  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }

  /**
   * مهاجرت به v2. ورودی v2 دست‌نخورده (کلون) برمی‌گردد.
   * قطعی است: part_uid های جاافتاده از cabinet_id:key:index ساخته می‌شوند، نه تصادفی.
   */
  function migrateToV2(snapshot) {
    var s = clone(snapshot);
    var notes = [];

    if (s.schema_version === CURRENT_SCHEMA) {
      // فقط تضمین فیلدهای v2
      if (!Array.isArray(s.stock_offcuts)) s.stock_offcuts = [];
      return { snapshot: s, migrated: false, notes: notes };
    }
    if (s.schema_version !== 1) {
      return { snapshot: null, migrated: false,
        notes: ['schema_version ناشناخته: ' + s.schema_version] };
    }

    s.schema_version = CURRENT_SCHEMA;
    if (!Array.isArray(s.stock_offcuts)) { s.stock_offcuts = []; notes.push('stock_offcuts=[] اضافه شد'); }
    if (!s.scan_stats) s.scan_stats = {};

    // شناسه پایدار برای قطعات بدون part_uid — قطعی و تکرارپذیر
    var counters = {};
    (s.parts_flat || []).forEach(function (p) {
      if (!p.part_uid) {
        var base = (p.cabinet_id || 'c') + ':' + (p.key || 'k');
        counters[base] = (counters[base] || 0) + 1;
        p.part_uid = base + ':' + counters[base];
        notes.push('part_uid قطعی تولید شد: ' + p.part_uid);
      }
    });

    return { snapshot: s, migrated: true, notes: notes };
  }

  /**
   * اعتبارسنجی عمیق: NaN/Infinity/منفی/صفر/فیلد جاافتاده/نوع غلط/uid تکراری.
   * خروجی: { ok, errors:[fa], warnings:[fa] }
   */
  function validateSnapshot(snapshot) {
    var errors = [], warnings = [];
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return { ok: false, errors: ['snapshot باید یک شیء JSON باشد'], warnings: [] };
    }
    if (SUPPORTED.indexOf(snapshot.schema_version) === -1) {
      errors.push('schema_version پشتیبانی‌نشده: ' + snapshot.schema_version);
    }
    if (!Array.isArray(snapshot.sheets) || !snapshot.sheets.length) {
      errors.push('sheets تعریف نشده یا خالی است');
    }
    if (!Array.isArray(snapshot.parts_flat)) {
      errors.push('parts_flat موجود نیست یا آرایه نیست');
    }

    var sheetIds = {};
    (snapshot.sheets || []).forEach(function (s, i) {
      var tag = 'ورق #' + (i + 1) + (s && s.sheet_id ? ' (' + s.sheet_id + ')' : '');
      if (!s || typeof s !== 'object') { errors.push(tag + ' نامعتبر'); return; }
      if (!s.sheet_id || typeof s.sheet_id !== 'string') errors.push(tag + ': sheet_id جاافتاده');
      else if (sheetIds[s.sheet_id]) errors.push(tag + ': sheet_id تکراری');
      else sheetIds[s.sheet_id] = true;
      if (!finitePos(s.width_mm)) errors.push(tag + ': width_mm نامعتبر (' + s.width_mm + ')');
      if (!finitePos(s.height_mm)) errors.push(tag + ': height_mm نامعتبر (' + s.height_mm + ')');
      if (s.trim_margin_mm != null && !finiteNonNeg(s.trim_margin_mm)) {
        errors.push(tag + ': trim_margin_mm نامعتبر');
      }
    });

    var cutting = snapshot.cutting || {};
    if (cutting.kerf_mm != null && !finiteNonNeg(cutting.kerf_mm)) {
      errors.push('kerf_mm نامعتبر (' + cutting.kerf_mm + ')');
    }

    var uids = {};
    (snapshot.parts_flat || []).forEach(function (p, i) {
      var tag = 'قطعه #' + (i + 1) + (p && p.part_uid ? ' (' + p.part_uid + ')' : '');
      if (!p || typeof p !== 'object') { errors.push(tag + ' نامعتبر'); return; }
      if (!finitePos(p.cut_length_mm)) errors.push(tag + ': cut_length_mm نامعتبر (' + p.cut_length_mm + ')');
      if (!finitePos(p.cut_width_mm)) errors.push(tag + ': cut_width_mm نامعتبر (' + p.cut_width_mm + ')');
      if (!finitePos(p.count) || p.count !== Math.floor(p.count)) {
        errors.push(tag + ': count باید عدد صحیح مثبت باشد (' + p.count + ')');
      }
      if (!p.sheet_id || !sheetIds[p.sheet_id]) {
        errors.push(tag + ': ارجاع به ورق ناموجود «' + p.sheet_id + '»');
      }
      if (p.grain != null && ['length', 'width', 'none'].indexOf(p.grain) === -1) {
        warnings.push(tag + ': grain ناشناخته «' + p.grain + '» — none فرض می‌شود');
      }
      if (p.part_uid) {
        if (uids[p.part_uid]) errors.push(tag + ': part_uid تکراری');
        uids[p.part_uid] = true;
      } else {
        warnings.push(tag + ': part_uid ندارد — مهاجرت v2 آن را قطعی می‌سازد');
      }
    });

    // صفحه/قرنیز: تا این نسخه اصلاً سنجیده نمی‌شد. موتور قرنیز با `len > 0` خودش
    // را حفظ می‌کند، پس صفحهٔ صفر قیمت غلط نمی‌دهد — ولی بی‌صدا از فاکتور می‌افتد.
    // خطا نیست (سند همچنان قابل پردازش است)، ولی هشدار لازم دارد.
    (snapshot.moulding_boards || []).forEach(function (b, i) {
      var tag = 'صفحه/قرنیز #' + (i + 1) + (b && b.label_fa ? ' (' + b.label_fa + ')' : '');
      if (!b || typeof b !== 'object') { errors.push(tag + ' نامعتبر'); return; }
      if (!finitePos(b.length_mm)) {
        warnings.push(tag + ': طول نامعتبر (' + b.length_mm + ') — در فاکتور نمی‌آید');
      }
      if (!finitePos(b.width_mm) && num(b.returns) > 0) {
        warnings.push(tag + ': عرض نامعتبر ولی «برگشت» دارد — برگشت‌ها در فاکتور نمی‌آیند');
      }
      if (b.returns != null && (!isFinite(b.returns) || b.returns < 0)) {
        warnings.push(tag + ': تعداد برگشت نامعتبر (' + b.returns + ')');
      }
    });

    (snapshot.stock_offcuts || []).forEach(function (o, i) {
      var tag = 'آفکات #' + (i + 1);
      if (!finitePos(o.width_mm) || !finitePos(o.height_mm)) errors.push(tag + ': ابعاد نامعتبر');
      if (!o.sheet_id || !sheetIds[o.sheet_id]) errors.push(tag + ': ارجاع به ورق ناموجود');
    });

    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  return {
    VERSION: VERSION,
    CURRENT_SCHEMA: CURRENT_SCHEMA,
    SUPPORTED: SUPPORTED,
    migrateToV2: migrateToV2,
    validateSnapshot: validateSnapshot
  };
}));
