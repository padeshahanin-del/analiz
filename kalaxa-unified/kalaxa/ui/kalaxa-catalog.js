/**
 * kalaxa-catalog.js — دادهٔ دامنه، یک منبع، هر دو زبان.
 * آینهٔ lib/catalog.rb — **همان فایل‌های JSON**، نه یک کپی دستی.
 *
 * چرا: شکل درب، ورق، متریال و قید هر کدام در Ruby و JS جدا نوشته شده بودند.
 * تست‌های آینه‌سنجی واگرایی را می‌گرفتند ولی جلویش را نمی‌گرفتند — افزودن یک ورق
 * تازه یعنی دو ویرایش در دو زبان، و فراموشیِ یکی یعنی قطعه‌ای بی‌ورق.
 *
 * دو مسیر بارگذاری، عمداً بدون پیش‌فرض سخت‌کدشده:
 *   Node (تست/CLI) → مستقیم از data/*.json
 *   پنل اسکچاپ     → Ruby با Catalog#payload تزریق می‌کند (فایل محلی با fetch
 *                     خوانده نمی‌شود)
 * اگر هیچ‌کدام نبود، صدازدن هر دسترسی خطا می‌دهد — نه بازگشت خاموش به عددی که
 * ممکن است با کاتالوگ واقعی نخواند.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require);
  } else {
    root.KalaxaCatalog = factory(null);
  }
}(typeof self !== 'undefined' ? self : this, function (nodeRequire) {
  'use strict';

  var VERSION = '1.0.0';
  var NAMES = ['door_shapes', 'materials', 'sheets', 'rails', 'edges', 'countertops', 'templates', 'objects', 'system32'];
  var data = null;

  function stripNotes(o) {
    var out = {};
    Object.keys(o).forEach(function (k) { if (k.charAt(0) !== '_') out[k] = o[k]; });
    return out;
  }

  // در Node مستقیم از دیسک — همان بایت‌هایی که Ruby می‌خواند.
  function loadFromDisk() {
    if (!nodeRequire) return null;
    var path = nodeRequire('path');
    var fs = nodeRequire('fs');
    var dir = path.join(__dirname, '..', 'data');
    var out = {};
    for (var i = 0; i < NAMES.length; i++) {
      var p = path.join(dir, NAMES[i] + '.json');
      if (!fs.existsSync(p)) return null;
      out[NAMES[i]] = stripNotes(JSON.parse(fs.readFileSync(p, 'utf8')));
    }
    return out;
  }

  function ensure() {
    if (data) return data;
    data = loadFromDisk();
    if (!data) {
      throw new Error('کاتالوگ کالاکسا بارگذاری نشده — در پنل باید با KalaxaCatalog.load() ' +
                      'از سمت Ruby تزریق شود');
    }
    return data;
  }

  /** تزریق از Ruby (پنل). payload = { door_shapes, materials, sheets, rails } */
  function load(payload) {
    if (!payload || typeof payload !== 'object') return false;
    var next = {};
    for (var i = 0; i < NAMES.length; i++) {
      if (!payload[NAMES[i]]) return false;
      next[NAMES[i]] = stripNotes(payload[NAMES[i]]);
    }
    data = next;
    return true;
  }

  function isLoaded() { return !!data || !!loadFromDisk(); }
  function reset() { data = null; }

  function get(name) { return ensure()[name]; }

  // ---------------- دسترسی‌های نام‌دار (آینهٔ catalog.rb) ----------------

  function doorShapes() { return get('door_shapes').shapes; }
  function doorShapeIds() { return Object.keys(doorShapes()); }
  function defaultDoorShape() { return get('door_shapes').default_shape; }
  function doorTypeToShape() { return get('door_shapes').type_to_shape; }

  /** { shapeId: [ضخامت‌های مجاز] } — همان شکلی که تنظیمات لازم دارد. */
  function doorShapeThicknesses() {
    var s = doorShapes(), out = {};
    Object.keys(s).forEach(function (k) { out[k] = s[k].thicknesses_mm.slice(); });
    return out;
  }

  function materials() { return get('materials').materials; }
  function materialIds() { return Object.keys(materials()); }
  function defaultMaterial() { return get('materials').default_material; }
  function sheetMaterialMap() { return get('materials').sheet_material; }
  function nonSheetKeyMaterial() { return get('materials').non_sheet_key_material; }
  function keySheetMap() { return get('materials').key_sheet; }
  function glassSheetPrefix() { return get('materials').glass_sheet_prefix; }

  function countertopTypes() { return get('countertops').types; }
  function defaultCountertopType() { return get('countertops').default_type; }

  function sheets() { return get('sheets').sheets; }
  function sheetIds() { return sheets().map(function (s) { return s.sheet_id; }); }
  function cutting() { return get('sheets').cutting; }

  function rails() { return get('rails'); }

  // پیش‌فرض نوار لبه و شیارِ هر نقش — همان جدولی که CabinetBuilder با آن
  // کابینت می‌سازد. یک منبع، تا قاعده در دو جا از هم جدا نشود.
  function edgeDefaults() { return get('edges').roles; }
  function edgeSideLabels() { return get('edges').side_labels_fa; }
  function edgeDefaultFor(role) {
    var r = edgeDefaults()[String(role)] || { edge: {}, groove: {} };
    return { edge: r.edge || {}, groove: r.groove || {} };
  }

  /** ورق → متریال. پیشوند شیشه تا افزودن ضخامت تازه نیاز به کد نداشته باشد. */
  function sheetMaterial(sheetId) {
    var s = String(sheetId || '');
    if (s.indexOf(glassSheetPrefix()) === 0) return 'glass';
    return sheetMaterialMap()[s] || defaultMaterial();
  }

  function materialForKey(key, sheetId) {
    var direct = nonSheetKeyMaterial()[String(key)];
    if (direct) return direct;
    return sheetMaterial(sheetId || keySheetMap()[String(key)] || '');
  }

  return {
    VERSION: VERSION, NAMES: NAMES.slice(),
    load: load, isLoaded: isLoaded, reset: reset, get: get,
    doorShapes: doorShapes, doorShapeIds: doorShapeIds,
    defaultDoorShape: defaultDoorShape, doorTypeToShape: doorTypeToShape,
    doorShapeThicknesses: doorShapeThicknesses,
    materials: materials, materialIds: materialIds, defaultMaterial: defaultMaterial,
    sheetMaterialMap: sheetMaterialMap, nonSheetKeyMaterial: nonSheetKeyMaterial,
    keySheetMap: keySheetMap, glassSheetPrefix: glassSheetPrefix,
    sheetMaterial: sheetMaterial, materialForKey: materialForKey,
    sheets: sheets, sheetIds: sheetIds, cutting: cutting,
    countertopTypes: countertopTypes, defaultCountertopType: defaultCountertopType,
    rails: rails,
    edgeDefaults: edgeDefaults, edgeDefaultFor: edgeDefaultFor,
    edgeSideLabels: edgeSideLabels
  };
}));
