/**
 * kalaxa-doc-adapter.js — v1.0.0
 * آداپتور Kalaxa → Kalaxa Analysis:
 *   سند کالاکسا (kalaxa-doc، schema v2) → kitchen_snapshot (schema v2)
 *
 * هدف: فازهای تولید کالاکسا (نقشه برش، BOM، بهینه‌سازی ورق) بدون بازنویسی،
 * از موتورهای تست‌شدهٔ آنالیز کالاکسا استفاده کنند (nesting گیوتینی، اعتبارسنج
 * مستقل، گزارش متریال/نوار لبه، یراق، انبار آفکات).
 *
 * تصمیم‌های نگاشت (قطعی و مستند):
 *   materials(kind=sheet) → sheets:
 *     width_mm  = max(sheet_length_mm, sheet_width_mm)   ← محور بلند = محور x کالاکسا
 *     height_mm = min(...)
 *     has_grain = آیا هیچ قطعه‌ای روی این متریال grain≠none دارد؟ (هیوریستیک،
 *                 با options.sheet_overrides قابل بازنویسی)
 *   parts → parts_flat:
 *     count=1 (سند کالاکسا قطعات را تکی نگه می‌دارد)
 *     cut_length_mm=length_mm، cut_width_mm=width_mm
 *     edgebanding {l1,l2,w1,w2} → edge {front,back,top,bottom} (لبه‌های l در
 *       راستای طول = front/back کالاکسا)
 *     allow_rotation = (grain=='none')
 *   units → cabinets: category=kind (base|wall|tall — enum ها یکی‌اند)،
 *     params از ابعاد mm به cm.
 *   hardware: به‌صورت explicit_hardware در «خروجی آداپتور» (نه داخل snapshot)
 *     عبور داده می‌شود تا KalaxaHardware.bom(snapshot, {explicit}) ادغام کند
 *     (D-HW-1: صریح بر قاعده غالب، به تفکیک کابینت/نوع).
 *   operations → groove روی قطعه و drill در features.holes؛ نوع cut جایی
 *     ندارد و صریح اعلام می‌شود. فارسی‌بر و کج‌بری در طرحوارهٔ سند وجود
 *     ندارند (OPERATION_KINDS فقط drill/groove/cut است).
 *
 * محدودیت صادقانه: سند کالاکسا v2 موقعیت/چرخش یونیت‌ها را ندارد →
 * world_transform صفر گذاشته می‌شود و «نقشه نصب» تا افزودن placement به schema
 * کالاکسا قابل اتکا نیست (در خروجی limitations اعلام می‌شود).
 *
 * JS خالص، UMD، بدون وابستگی.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaDocAdapter = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.3.0';
  var EDGE_MAP = { l1: 'front', l2: 'back', w1: 'top', w2: 'bottom' };

  function isInt(n) { return typeof n === 'number' && isFinite(n) && n === Math.floor(n); }

  // schema v3: placement اختیاری روی unit — {x_mm,y_mm,z_mm,rotation_z_deg} همه Integer.
  function validPlacement(pl) {
    return !!pl && typeof pl === 'object' &&
      isInt(pl.x_mm) && isInt(pl.y_mm) && isInt(pl.z_mm) &&
      isInt(pl.rotation_z_deg) && pl.rotation_z_deg >= 0 && pl.rotation_z_deg <= 359;
  }

  /**
   * @param {object} doc - سند کالاکسا v2 (بخش doc از پاکت، نه خود پاکت)
   * @param {object} [options]
   *   - cutting: override پارامترهای برش {kerf_mm, allow_rotation_default, min_offcut_mm}
   *   - sheet_overrides: { material_id: {has_grain, trim_margin_mm, price_per_sheet, color_code} }
   *   - project_label: نام مدل برای snapshot.source
   * @returns { ok, snapshot, errors[fa], limitations[fa] }
   */
  function toSnapshot(doc, options) {
    options = options || {};
    var errors = [];
    var limitations = [];

    if (!doc || typeof doc !== 'object' || !doc.entities || typeof doc.entities !== 'object') {
      return { ok: false, snapshot: null,
        errors: ['سند کالاکسا نامعتبر است (entities موجود نیست)'], limitations: [] };
    }
    var e = doc.entities;
    var materials = e.materials || [];
    var parts = e.parts || [];
    var units = e.units || [];

    // ۱) کدام متریال‌های ورق grain-دار مصرف می‌شوند؟ (هیوریستیک از قطعات)
    var grainByMaterial = {};
    parts.forEach(function (p) {
      if (p.grain && p.grain !== 'none') grainByMaterial[p.material_id] = true;
    });

    // ۲) sheets از materials(kind=sheet)
    var sheetIds = {};
    var sheets = [];
    materials.forEach(function (m) {
      if (m.kind !== 'sheet') return;
      var L = m.sheet_length_mm, W = m.sheet_width_mm;
      if (!isInt(L) || !isInt(W) || L <= 0 || W <= 0) {
        errors.push('متریال ورق «' + (m.name || m.id) + '» ابعاد ورق (sheet_length/width_mm) ندارد');
        return;
      }
      var ov = (options.sheet_overrides || {})[m.id] || {};
      sheetIds[m.id] = true;
      sheets.push({
        sheet_id: m.id,
        material: m.name || 'sheet',
        color_code: ov.color_code || (m.name || ''),
        thickness_mm: m.thickness_mm,
        width_mm: Math.max(L, W),
        height_mm: Math.min(L, W),
        has_grain: (typeof ov.has_grain === 'boolean') ? ov.has_grain : !!grainByMaterial[m.id],
        price_per_sheet: ov.price_per_sheet || 0,
        trim_margin_mm: (ov.trim_margin_mm != null) ? ov.trim_margin_mm : 10
      });
    });
    if (!sheets.length) errors.push('هیچ متریالی با kind=sheet و ابعاد معتبر یافت نشد');

    // ۳) متریال‌های نوار لبه (برای گزارش نگاشت لبه)
    var edgebandIds = {};
    materials.forEach(function (m) { if (m.kind === 'edgeband') edgebandIds[m.id] = m; });

    // ۴) cabinets از units — placement (schema v3) در صورت وجودِ کامل و معتبر
    //     به world_transform نگاشت می‌شود (mm → cm)؛ سیاست همه-یا-هیچ:
    //     نقشهٔ نصب نیمه‌کاره گمراه‌کننده‌تر از نبودِ آن است.
    var placedCount = 0;
    units.forEach(function (u) {
      var pl = u.placement;
      if (pl == null) return;
      if (validPlacement(pl)) { placedCount++; }
      else {
        errors.push('یونیت «' + (u.name || u.id) + '» placement نامعتبر دارد ' +
          '(کلیدهای x_mm/y_mm/z_mm/rotation_z_deg همه Integer و چرخش ۰..۳۵۹)');
      }
    });
    var allPlaced = units.length > 0 && placedCount === units.length;

    var cabinets = units.map(function (u) {
      var wt = { origin_cm: [0, 0, 0], rotation_z_deg: 0 };
      if (allPlaced) {
        var pl = u.placement;
        wt = {
          origin_cm: [pl.x_mm / 10, pl.y_mm / 10, pl.z_mm / 10],
          rotation_z_deg: pl.rotation_z_deg
        };
      }
      return {
        kalaxa_id: u.id,
        template_id: 'kalaxa:' + (u.kind || 'unit'),
        category: u.kind || 'base',
        label_fa: u.name || u.id,
        params: {
          cabinet_width: (u.width_mm || 0) / 10,
          cabinet_height: (u.height_mm || 0) / 10,
          cabinet_depth: (u.depth_mm || 0) / 10
        },
        world_transform: wt
      };
    });
    if (units.length && !allPlaced) {
      limitations.push('placement برای همه یونیت‌ها ثبت نشده (' + placedCount + '/' + units.length +
        ') — «نقشه نصب» تا تکمیل جانمایی قابل اتکا نیست');
    }

    // ۵) parts_flat
    var partsFlat = [];
    parts.forEach(function (p) {
      if (!sheetIds[p.material_id]) {
        errors.push('قطعه «' + (p.name || p.id) + '» به متریال غیرورق یا ناموجود اشاره می‌کند: ' + p.material_id);
        return;
      }
      var edge = {};
      var eb = p.edgebanding || {};
      Object.keys(EDGE_MAP).forEach(function (k) {
        if (eb[k]) {
          edge[EDGE_MAP[k]] = 1;
          if (!edgebandIds[eb[k]]) {
            errors.push('لبه‌چسب قطعه «' + (p.name || p.id) + '» به متریال edgeband معتبر اشاره نمی‌کند');
          }
        }
      });
      var grain = ['length', 'width', 'none'].indexOf(p.grain) !== -1 ? p.grain : 'none';
      partsFlat.push({
        part_uid: p.id,
        cabinet_id: p.unit_id,
        key: p.role || 'part',
        name_fa: p.name || p.role || p.id,
        count: 1,
        cut_length_mm: p.length_mm,
        cut_width_mm: p.width_mm,
        thickness_mm: p.thickness_mm,
        sheet_id: p.material_id,
        grain: grain,
        allow_rotation: grain === 'none',
        edge: edge,
        // شیار و سوراخ از `operations` سند پر می‌شوند (پایین‌تر). این‌جا
        // خالی می‌مانند چون خودِ قطعه آن‌ها را ندارد؛ عملیات جدا ثبت شده.
        groove: {},
        // فارسی‌بر ۴۵° و کج‌بری در `OPERATION_KINDS` سند دامنه **وجود
        // ندارند** (فقط drill/groove/cut). این یکی محدودیتِ واقعیِ
        // طرحواره است، نه چیزی که آداپتور بتواند رفعش کند.
        miter: {},
        bevel: {},
        note: ''
      });
    });

    // یراق صریح سند → خروجی آداپتور (D-HW-1)؛ qty نامعتبر خطای صریح است.
    var explicitHardware = [];
    (e.hardware || []).forEach(function (h) {
      var q = h.qty;
      if (typeof q !== 'number' || !isFinite(q) || q <= 0 || q !== Math.floor(q)) {
        errors.push('یراق «' + (h.name || h.id) + '» qty نامعتبر دارد (Integer مثبت لازم است)');
        return;
      }
      explicitHardware.push({ unit_id: h.unit_id, name: h.name || '', kind: h.kind || '',
                              qty: q, sku: h.sku || null });
    });
    applyOperations(e.operations, partsFlat, parts, errors, limitations);

    var snapshot = {
      schema_version: 2,
      snapshot_id: 'kalaxa:' + ((doc.project || {}).id || 'doc'),
      created_at: (doc.project || {}).created_at || '',
      source: {
        plugin_version: 'kalaxa-doc-adapter ' + VERSION,
        sketchup_version: '',
        model_name: options.project_label || (doc.project || {}).name || 'kalaxa-doc'
      },
      project_settings_snapshot: {},
      sheets: sheets,
      cutting: Object.assign(
        { kerf_mm: 4, allow_rotation_default: true, min_offcut_mm: 100 },
        options.cutting || {}
      ),
      stock_offcuts: [],
      // true فقط اگر همهٔ یونیت‌ها placement معتبر داشتند (همان allPlaced که world_transform
      // را تعیین کرد). مصرف‌کننده‌های موقعیت‌محور (مثل kalaxa-rules.js) باید قبل از تکیه بر
      // world_transform این پرچم را چک کنند — وگرنه {0,0,0} مشترکِ «جانمایی‌نشده» را با یک
      // موقعیت واقعی روی‌هم اشتباه می‌گیرند (باگ #9: تداخل/ارتفاع نصب کاذب).
      placement_complete: allPlaced,
      cabinets: cabinets,
      parts_flat: partsFlat,
      scan_errors: []
    };

    return { ok: errors.length === 0, snapshot: snapshot, errors: errors,
             limitations: limitations, explicit_hardware: explicitHardware };
  }

  /**
   * عملیات سند دامنه → قطعهٔ snapshot.
   *
   * تا ۳.۷۱ این‌جا نوشته بود «عملیات CNC در snapshot جایی ندارد». آن حرف
   * وقتی نوشته شد درست بود، ولی از ۳.۴۱ به بعد **دیگر نبود**: قطعه هم
   * `groove` دارد و هم `features.holes`، و نقشهٔ CNC از روی همان‌ها کشیده
   * می‌شود. یعنی اعترافِ صادقانه به مرور تبدیل به دروغ شده بود و سندی که
   * می‌گفت «این قطعه شیار دارد»، بعد از تبدیل شیارش گم می‌شد — بی‌صدا.
   *
   * سه نوع عملیات در طرحواره هست و هر سه رفتار متفاوتی می‌گیرند:
   *
   * - `groove` → فیلد `groove` قطعه. سمت باید معلوم باشد؛ شیارِ بی‌سمت
   *   یعنی نمی‌دانیم کجای تخته، و گذاشتنش روی یک سمت دلخواه بدتر از
   *   نگذاشتن است.
   * - `drill`  → `features.holes`، همان قالبی که اسکنر می‌سازد و نقشهٔ
   *   CNC می‌خواند. مختصات از **گوشهٔ قطعه** است، مثل بقیهٔ خط.
   * - `cut`    → جایی در snapshot ندارد و ساختنش هم درست نیست؛ صریح
   *   اعلام می‌شود.
   *
   * پارامترِ ناقص هرگز بی‌صدا دور ریخته نمی‌شود.
   */
  var GROOVE_SIDES = { front: 1, back: 1, top: 1, bottom: 1 };

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }

  function applyOperations(ops, partsFlat, parts, errors, limitations) {
    ops = ops || [];
    if (!ops.length) return;

    var byUid = {};
    partsFlat.forEach(function (p) { byUid[p.part_uid] = p; });
    var nameOf = {};
    (parts || []).forEach(function (p) { nameOf[p.id] = p.name || p.id; });

    var applied = { groove: 0, drill: 0 };
    var cuts = 0;
    var orphan = 0;

    ops.forEach(function (op) {
      var target = byUid[op.part_id];
      if (!target) {
        // قطعه‌ای که عملیات به آن اشاره می‌کند یا رد شده (متریال نامعتبر)
        // یا اصلاً نیست. هر دو حالت باید دیده شوند.
        orphan++;
        return;
      }
      var pr = op.params || {};
      var label = nameOf[op.part_id] || op.part_id;

      if (op.kind === 'groove') {
        var side = String(pr.side || pr.edge || '');
        var width = num(pr.width_mm != null ? pr.width_mm : pr.w_mm);
        if (!GROOVE_SIDES[side]) {
          errors.push('شیار قطعهٔ «' + label + '» سمت معتبر ندارد (' +
            (side || 'خالی') + ') — یکی از front/back/top/bottom لازم است');
          return;
        }
        if (!(width > 0)) {
          errors.push('شیار قطعهٔ «' + label + '» عرض معتبر ندارد (width_mm)');
          return;
        }
        target.groove[side] = width;
        applied.groove++;
        return;
      }

      if (op.kind === 'drill') {
        var dia = num(pr.d_mm != null ? pr.d_mm : pr.dia_mm);
        var x = pr.x_mm, y = pr.y_mm;
        if (!(dia > 0) || typeof x !== 'number' || typeof y !== 'number') {
          errors.push('سوراخ قطعهٔ «' + label + '» مختصات یا قطر معتبر ندارد ' +
            '(x_mm، y_mm، d_mm لازم است)');
          return;
        }
        // عمق: اگر داده نشده، **حدس زده نمی‌شود**. نقشهٔ CNC عمقِ نامعلوم
        // را «؟» می‌نویسد؛ عددِ ساختگی قطعه را خراب می‌کند.
        var depth = pr.depth_mm;
        var through = pr.through === true ||
                      (depth == null && pr.through == null ? false : !!pr.through);
        target.features = target.features || {};
        target.features.holes = target.features.holes || [];
        target.features.holes.push({
          u_mm: num(x), v_mm: num(y), dia_mm: dia,
          depth_mm: typeof depth === 'number' ? depth : null,
          through: through,
          source: 'doc'
        });
        target.machined = true;
        applied.drill++;
        return;
      }

      if (op.kind === 'cut') { cuts++; return; }

      errors.push('عملیات ناشناختهٔ «' + op.kind + '» روی قطعهٔ «' + label + '»');
    });

    if (applied.groove || applied.drill) {
      limitations.push('از عملیات سند: ' + applied.groove + ' شیار و ' +
        applied.drill + ' سوراخ به قطعات منتقل شد');
    }
    if (cuts) {
      limitations.push(cuts + ' عملیات از نوع cut در snapshot جایی ندارد — ' +
        'برش آزاد در قالب قطعهٔ مستطیلی بیان نمی‌شود؛ دستی به کارگاه بگویید');
    }
    if (orphan) {
      errors.push(orphan + ' عملیات به قطعه‌ای اشاره می‌کند که در خروجی نیست — ' +
        'یا قطعه رد شده یا part_id غلط است');
    }
  }

  return { VERSION: VERSION, toSnapshot: toSnapshot, EDGE_MAP: EDGE_MAP };
}));
