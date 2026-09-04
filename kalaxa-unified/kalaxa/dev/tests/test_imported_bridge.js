/** کابینت اسکن‌شده باید به نقشهٔ برش برسد — node test_imported_bridge.js
 *
 * کاربر گزارش داد: «توی کابینت‌ها اضافه نشده، توی نقشه برش نیومده».
 *
 * علت ساختاری بود: اسکنر کابینت خوانده‌شده را در `raw_cabinets` می‌گذاشت و
 * **هیچ‌چیز جز جدول خودش** آن را نمی‌خواند. نستینگ، نقشهٔ برش، گزارش متریال،
 * شیت قیمت و BOM همه از `parts_flat` می‌خوانند.
 *
 * پس این تست به «آیا پل ردیف ساخت» قانع نمی‌شود — تا **خروجی نستینگ** جلو
 * می‌رود. تستی که وسط راه بایستد همان باگ را نمی‌گرفت.
 */
'use strict';
const path = require('path');
const UI = path.join(__dirname, '..', '..', 'ui');
const B = require(path.join(UI, 'kalaxa-imported-bridge.js'));
const C = require(path.join(UI, 'kalaxa-part-classifier.js'));
const N = require(path.join(UI, 'kalaxa-nesting.js'));
const R = require(path.join(UI, 'kalaxa-report.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

const SHEETS = [
  { sheet_id: 'mdf_white_16', material: 'mdf', color_code: 'W101', thickness_mm: 16,
    width_mm: 3660, height_mm: 1830, has_grain: false, price_per_sheet: 0, trim_margin_mm: 10 },
  { sheet_id: 'mdf_white_8', material: 'mdf', color_code: 'W101', thickness_mm: 8,
    width_mm: 3660, height_mm: 1830, has_grain: false, price_per_sheet: 0, trim_margin_mm: 10 },
  { sheet_id: 'mdf_door_16', material: 'mdf_hg', color_code: 'DOOR', thickness_mm: 16,
    width_mm: 2800, height_mm: 2100, has_grain: true, price_per_sheet: 0, trim_margin_mm: 10 }
];

function box(name, x, y, z, dx, dy, dz) {
  return { id: name + x + z, name: name, x, y, z, dx, dy, dz };
}

// کابینت واقعی: دو دیواره، کف، سقف، پشت‌بند ۸ میلی، درب، و دو لولا
const BOXES = [
  box('دیواره [side]', 0, 0, 0, 16, 550, 720),
  box('دیواره [side]', 884, 0, 0, 16, 550, 720),
  box('کف [bottom]', 16, 0, 0, 868, 550, 16),
  box('سقف [top_bottom]', 16, 0, 704, 868, 550, 16),
  box('پشت‌بند [back]', 16, 542, 16, 868, 8, 688),
  box('درب [door]', 0, -18, 0, 900, 18, 720),
  box('لولا', 20, 20, 100, 30, 60, 12),
  box('لولا', 20, 20, 600, 30, 60, 12)
];

// دقیقاً همان چیزی که extract_raw_cabinet می‌سازد — نه یک میدان بیشتر.
// نسخهٔ اول این فیکسچر `bounds_mm` داشت که اسکنر **هرگز نمی‌سازد**؛ همان
// دروغِ کوچک بود که اجازه داد باگ ابعاد از تست رد شود.
const RAW = { kalaxa_id: 'raw-001', label_fa: 'Component#6', boxes: BOXES,
              world_transform: { origin_cm: [0, 0, 0], rotation_z_deg: 0 } };

function rowsOf(boxes) {
  return C.group(C.classify(boxes || BOXES).parts);
}

function built(opts) {
  return B.build(RAW, rowsOf(), Object.assign(
    { sheets: SHEETS, body_sheet_id: 'mdf_white_16', door_sheet_id: 'mdf_door_16' },
    opts || {}));
}

console.log('قطعات به زبان مشترک ترجمه می‌شوند');
{
  const r = built();
  assert(r.parts_flat.length > 0, 'ردیف برش ساخته می‌شود');
  const keys = r.parts_flat.map(p => p.key);
  assert(keys.indexOf('side') !== -1 && keys.indexOf('back') !== -1,
         'نقش‌ها به کلید تبدیل می‌شوند', JSON.stringify(keys));
  assert(r.parts_flat.every(p => p.cut_length_mm > 0 && p.cut_width_mm > 0 && p.thickness_mm > 0),
         'همهٔ ردیف‌ها ابعاد معتبر دارند');
  assert(r.parts_flat.every(p => p.cabinet_id === 'raw-001'), 'به کابینت خودش وصل‌اند');
  assert(new Set(r.parts_flat.map(p => p.part_uid)).size === r.parts_flat.length,
         'شناسه‌ها یکتا هستند — وگرنه گزارش‌ها ردیف گم می‌کنند');
}

console.log('یراق وارد برش‌خور نمی‌شود');
{
  const r = built();
  assert(r.parts_flat.every(p => p.key !== 'hardware'),
         'لولا ورق نیست و نباید بریده شود');
  const total = rowsOf().filter(p => p.role !== 'hardware')
                        .reduce((s, p) => s + p.qty, 0);
  assert(r.parts_flat.reduce((s, p) => s + p.count, 0) === total,
         'ولی هیچ قطعهٔ ورقی گم نمی‌شود',
         r.parts_flat.reduce((s, p) => s + p.count, 0) + ' vs ' + total);
}

console.log('ورق درست انتخاب می‌شود');
{
  const r = built();
  const back = r.parts_flat.find(p => p.key === 'back');
  assert(back.thickness_mm === 8 && back.sheet_id === 'mdf_white_8',
         'پشت‌بند ۸ میلی از ورق ۸ میلی',  back.thickness_mm + ' / ' + back.sheet_id);
  const door = r.parts_flat.find(p => p.key === 'door');
  assert(door.sheet_id === 'mdf_door_16', 'درب از ورق نما', door.sheet_id);
  const side = r.parts_flat.find(p => p.key === 'side');
  assert(side.sheet_id === 'mdf_white_16', 'دیواره از ورق بدنه', side.sheet_id);

  // ضخامتی که هیچ ورقی ندارد باید **صریح** اعلام شود
  const odd = B.build(RAW, [{ role: 'shelf', role_label_fa: 'طبقه', qty: 1, ids: ['a'],
                              name: 'ط', cut_length_mm: 800, cut_width_mm: 400,
                              thickness_mm: 22 }],
                      { sheets: SHEETS, body_sheet_id: 'mdf_white_16' });
  assert(odd.warnings.some(w => w.indexOf('ضخامت') !== -1),
         'ضخامت بی‌ورق سکوت نمی‌شود — وگرنه کارگاه ورق غلط سفارش می‌دهد',
         JSON.stringify(odd.warnings));
  assert(odd.parts_flat[0].sheet_id === 'mdf_white_16',
         'ولی نزدیک‌ترین ورق انتخاب می‌شود تا آنالیز نایستد');
}

console.log('قطعهٔ بی‌ابعاد وارد نمی‌شود');
{
  const bad = B.build(RAW, [{ role: 'shelf', qty: 1, ids: ['a'], name: 'خراب',
                              cut_length_mm: 0, cut_width_mm: 400, thickness_mm: 16 }],
                      { sheets: SHEETS });
  assert(bad.parts_flat.length === 0, 'قطعهٔ با بعد صفر رد می‌شود');
  assert(bad.warnings.length > 0, 'و بی‌صدا حذف نمی‌شود',
         JSON.stringify(bad.warnings));
}

console.log('نام کابینت');
{
  assert(built().cabinet.label_fa === 'Component#6', 'پیش‌فرض همان نام مدل است');
  assert(built({ label_fa: 'کابینت زیر گاز' }).cabinet.label_fa === 'کابینت زیر گاز',
         'و قابل تغییر است — «Component#6» در نقشهٔ برش معنایی ندارد');
}

console.log('اسنپ‌شات مؤثر');
{
  const snap = { sheets: SHEETS, cabinets: [], parts_flat: [], raw_cabinets: [RAW],
                 cutting: { kerf_mm: 4 }, stock_offcuts: [] };
  const eff = B.effectiveSnapshot(snap, () => built());

  assert(eff.cabinets.length === 1, 'کابینت به فهرست کابینت‌ها اضافه می‌شود');
  assert(eff.parts_flat.length > 0, 'و قطعاتش به parts_flat');
  assert(snap.parts_flat.length === 0, 'اسنپ‌شات اصلی دست‌نخورده می‌ماند');

  // اگر کاربر همین کابینت را «تبدیل» کرده باشد، نسخهٔ پارامتریکش از قبل هست
  const already = { sheets: SHEETS, raw_cabinets: [RAW], cutting: { kerf_mm: 4 },
                    cabinets: [{ kalaxa_id: 'raw-001', label_fa: 'تبدیل‌شده' }],
                    parts_flat: [{ key: 'side', count: 2, cut_length_mm: 720,
                                   cut_width_mm: 550, thickness_mm: 16,
                                   sheet_id: 'mdf_white_16', part_uid: 'x', cabinet_id: 'raw-001' }] };
  const eff2 = B.effectiveSnapshot(already, () => built());
  assert(eff2.cabinets.length === 1 && eff2.parts_flat.length === 1,
         'کابینتِ تبدیل‌شده دوبار شمرده نمی‌شود — وگرنه متریال دو برابر سفارش می‌رود',
         eff2.cabinets.length + ' / ' + eff2.parts_flat.length);
}

console.log('و واقعاً به نقشهٔ برش می‌رسد');
{
  // این بخش اصل ماجراست: تا خروجی نستینگ جلو می‌رویم، نه فقط تا ساخت ردیف.
  // نستینگ اسنپ‌شات معتبر می‌خواهد؛ در پنل واقعی مهاجرت به v2 قبل از پل
  // انجام شده است.
  const snap = { schema_version: 2, sheets: SHEETS, cabinets: [], parts_flat: [],
                 raw_cabinets: [RAW], cutting: { kerf_mm: 4, trim_margin_mm: 10 },
                 stock_offcuts: [] };

  const before = N.run(snap);
  const beforeParts = (before.by_sheet_type || [])
    .reduce((s, g) => s + (g.sheets_used || 0), 0);
  assert(beforeParts === 0, 'قبل از پل: نقشهٔ برش خالی است — همان باگی که کاربر دید',
         String(beforeParts));

  const eff = B.effectiveSnapshot(snap, () => built());
  const after = N.run(eff);
  assert((after.errors || []).length === 0, 'نستینگ بدون خطا اجرا می‌شود',
         JSON.stringify(after.errors));
  const sheetsUsed = (after.by_sheet_type || []).reduce((s, g) => s + (g.sheets_used || 0), 0);
  assert(sheetsUsed > 0, 'بعد از پل: ورق واقعاً مصرف می‌شود', String(sheetsUsed));

  // نام میدان را اول حدس زده بودم (`sheets`) و تست «صفر قطعه» می‌دید بدون
  // اینکه چیزی خراب باشد — همان «تستی که همه‌چیز را غایب می‌بیند».
  const layouts = (after.by_sheet_type || []).reduce((s, g) => s.concat(g.layouts || []), []);
  const placed = layouts.reduce((t, l) => t + (l.placements || []).length, 0);
  assert(layouts.length > 0, 'چیدمان ورق ساخته می‌شود', String(layouts.length));
  assert(placed > 0, 'و قطعات روی ورق جا گرفته‌اند', String(placed));
  assert((after.unplaced || []).length === 0, 'هیچ قطعه‌ای جا نمانده',
         JSON.stringify(after.unplaced));

  // گزارش متریال هم باید ببیندشان
  const ms = R.materialSummary(eff, after);
  assert(ms.total_area_m2 > 0, 'گزارش متریال هم دیگر صفر نیست', String(ms.total_area_m2));
}

console.log('نوار لبه از اصلاح کاربر می‌آید');
{
  const rows = rowsOf().map(p => Object.assign({}, p, { edge: { front: 1 }, groove: {} }));
  const r = B.build(RAW, rows, { sheets: SHEETS, body_sheet_id: 'mdf_white_16' });
  assert(r.parts_flat.every(p => p.edge && p.edge.front === 1),
         'تصمیم کارگاه دربارهٔ نوار به برش‌خور می‌رسد');

  const eb = R.edgeBanding({ sheets: SHEETS, parts_flat: r.parts_flat });
  assert(eb.total_m > 0, 'و در متراژ نوار حساب می‌شود', String(eb.total_m));
}

console.log('ابعاد کابینت — سانتی‌متر، از خودِ قطعات');
{
  // گزارش کاربر: «ابعاد تو شیت کابینت‌ها اشتباهه» و «تو تنظیمات واحد
  // سانتی‌متره ولی فراخوانی میلی‌متر».
  //
  // علت: پل از `raw.bounds_mm` می‌خواند — میدانی که اسکنر **هرگز نمی‌سازد**
  // (extract_raw_cabinet فقط kalaxa_id، label_fa، boxes و world_transform
  // می‌دهد). پس هر سه بعد null می‌شد و بقیهٔ برنامه که در ۱۰ ضرب می‌کند صفر
  // می‌گرفت.
  assert(RAW.bounds_mm === undefined,
         'اسکنر واقعاً bounds_mm نمی‌دهد — تست روی همان چیزی که هست');

  const pr = built().cabinet.params;
  assert(pr.cabinet_width === 90, 'عرض ۹۰۰mm → ۹۰cm', String(pr.cabinet_width));
  assert(pr.cabinet_height === 72, 'ارتفاع ۷۲۰mm → ۷۲cm', String(pr.cabinet_height));
  // ۵۶۸ میلی: گرد کردن به عدد صحیح ۵۷ می‌دهد و بازگشتش ۵۷۰ — دو میلی خطا.
  assert(pr.cabinet_depth === 56.8, 'عمق ۵۶۸mm → ۵۶٫۸cm بدون گرد کردن',
         String(pr.cabinet_depth));

  assert(Math.round(pr.cabinet_width * 10) === 900 &&
         Math.round(pr.cabinet_depth * 10) === 568,
         'رفت و برگشت cm به mm عدد را عوض نمی‌کند');
}

console.log('دستهٔ کابینت — نه برچسب imported');
{
  assert(built().cabinet.category === 'base', 'کابینت ۷۲cm زمینی است',
         built().cabinet.category);
  assert(B.categoryOf({ cabinet_height: 200, cabinet_depth: 60 }) === 'tall',
         'کابینت ۲۰۰cm قدی است');
  assert(B.categoryOf({ cabinet_height: 70, cabinet_depth: 35 }) === 'wall',
         'عمق ۳۵cm و ارتفاع کم به معنی هوایی است');
  // imported هیچ‌جای برنامه شناخته نمی‌شود: تب کابینت‌ها آن را خام نشان
  // می‌داد و صفحهٔ کار فقط روی base کشیده می‌شود.
  assert(['base', 'wall', 'tall'].indexOf(built().cabinet.category) !== -1,
         'دسته همیشه یکی از سه دستهٔ شناخته‌شده است');
}

console.log('نقشهٔ نصب کابینت خوانده‌شده را می‌بیند');
{
  const IM = require(path.join(UI, 'kalaxa-install-map.js'));
  const snap = { schema_version: 2, sheets: SHEETS, cabinets: [], parts_flat: [],
                 raw_cabinets: [RAW], cutting: { kerf_mm: 4 }, stock_offcuts: [] };

  assert(IM.renderAll(snap, {}).length === 0, 'قبل از پل: نقشهٔ نصب خالی است');

  const eff = B.effectiveSnapshot(snap, () => built());
  const maps = IM.renderAll(eff, { counter_top_mm: 40 });
  assert(maps.length > 0, 'بعد از پل: دیوار ساخته می‌شود', String(maps.length));

  const svg = String(maps[0].svg || maps[0]);
  assert(svg.indexOf('<svg') !== -1, 'و SVG واقعی برمی‌گرداند');
  assert(maps[0].wall.length_mm >= 900, 'طول دیوار دست‌کم عرض کابینت است',
         String(maps[0].wall.length_mm));
  assert(maps[0].wall.items[0].w_mm === 900 && maps[0].wall.items[0].h_mm === 720,
         'و ابعاد کابینت روی نقشه درست است، نه صفر',
         JSON.stringify(maps[0].wall.items[0]));
  // صفحهٔ کار فقط روی دستهٔ base کشیده می‌شود
  assert(svg.indexOf('counter') !== -1 || maps[0].wall.items[0].cab.category === 'base',
         'کابینت زمینی صفحهٔ کار می‌گیرد');
}

console.log('نوار لبه: قطعهٔ خوانده‌شده همان رفتار قطعهٔ ساخته‌شده را دارد');
{
  // کاربر پرسید اندازهٔ فهرست برش، اندازهٔ نهایی است یا اندازهٔ تخته. جوابش
  // «از تنظیمات بخونه» بود — و تنظیمش (`edge_band.body.subtract`) از قبل
  // وجود دارد و در KalaxaSettings.applyToSnapshot اعمال می‌شود.
  //
  // ولی پل **بعد** از applyToSnapshot اجرا می‌شد، پس قطعات خوانده‌شده کسر
  // نوار نمی‌گرفتند: یک تختهٔ یکسان در کابینت ساختهٔ کالاکسا ۷۱۸ و در کابینت
  // خوانده‌شده ۷۲۰ بریده می‌شد. همان قطعه، دو اندازه، بدون هیچ هشداری.
  const S = require(path.join(UI, 'kalaxa-settings.js'));
  const settings = S.defaults();
  const band = settings.project.edge_band.body;
  assert(band.subtract === true && band.thickness_mm > 0,
         'کسر نوار پیش‌فرض روشن است', JSON.stringify(band));

  // یک قطعهٔ «ساختهٔ کالاکسا» و یک قطعهٔ «خوانده‌شده» با ابعاد و نوار یکسان
  const same = { key: 'side', name_fa: 'دیواره', count: 1, cut_length_mm: 720,
                 cut_width_mm: 550, thickness_mm: 16, sheet_id: 'mdf_white_16',
                 grain: 'none', allow_rotation: true, edge: { top: 1 }, groove: {},
                 part_uid: 'built:1', cabinet_id: 'built' };

  const rawOne = { kalaxa_id: 'raw-e', label_fa: 'خوانده‌شده',
                   boxes: [box('دیواره [side]', 0, 0, 0, 16, 550, 720)],
                   world_transform: { origin_cm: [0, 0, 0], rotation_z_deg: 0 } };
  const importedRows = C.group(C.classify(rawOne.boxes).parts)
    .map(p => Object.assign({}, p, { edge: { top: 1 }, groove: {} }));

  const snap = {
    schema_version: 2, sheets: SHEETS,
    cabinets: [{ kalaxa_id: 'built', label_fa: 'ساختهٔ کالاکسا', category: 'base',
                 template_id: 'base_single_door',
                 params: { cabinet_width: 90, cabinet_height: 72, cabinet_depth: 55 } }],
    parts_flat: [same], raw_cabinets: [rawOne],
    cutting: { kerf_mm: 4, trim_margin_mm: 10 }, stock_offcuts: []
  };

  // همان ترتیبی که پنل دارد: اول پل، بعد تنظیمات.
  const eff = B.effectiveSnapshot(snap, () => B.build(rawOne, importedRows, {
    sheets: SHEETS, body_sheet_id: 'mdf_white_16', door_sheet_id: 'mdf_door_16'
  }));
  const applied = S.applyToSnapshot(eff, settings).snapshot;

  const builtRow = applied.parts_flat.find(p => p.cabinet_id === 'built');
  const impRow = applied.parts_flat.find(p => p.cabinet_id === 'raw-e');
  assert(impRow, 'قطعهٔ خوانده‌شده در فهرست هست');
  assert(builtRow.cut_length_mm === impRow.cut_length_mm,
         'همان قطعه در هر دو کابینت یک اندازه دارد',
         builtRow.cut_length_mm + ' vs ' + impRow.cut_length_mm);
  assert(builtRow.cut_length_mm === 720 - band.thickness_mm,
         'و کسر نوار واقعاً اعمال شده', String(builtRow.cut_length_mm));

  // و اگر کارگاه کسر را خاموش کند، هر دو با هم خاموش می‌شوند
  const off = JSON.parse(JSON.stringify(settings));
  off.project.edge_band.body.subtract = false;
  const eff2 = B.effectiveSnapshot(snap, () => B.build(rawOne, importedRows, {
    sheets: SHEETS, body_sheet_id: 'mdf_white_16', door_sheet_id: 'mdf_door_16'
  }));
  const applied2 = S.applyToSnapshot(eff2, off).snapshot;
  const b2 = applied2.parts_flat.find(p => p.cabinet_id === 'built');
  const i2 = applied2.parts_flat.find(p => p.cabinet_id === 'raw-e');
  assert(b2.cut_length_mm === 720 && i2.cut_length_mm === 720,
         'با خاموش‌بودن کسر، هر دو اندازهٔ تخته می‌گیرند',
         b2.cut_length_mm + ' / ' + i2.cut_length_mm);
}

console.log('پایه در ارتفاع کابینت نمی‌آید');
{
  // کاربر: «پایه جزو ارتفاع لیست کابینت‌ها نباشه». پایه زیر کف می‌نشیند
  // (z منفی) و اگر در ابعاد بیاید، کابینت ۷۲ سانتی ۸۲ گزارش می‌شود و
  // نقشهٔ نصب یک ردیف کامل را جابه‌جا می‌کند.
  //
  // نکتهٔ تلخ: کامنت نسخهٔ اول `dimsCm` همین را ادعا می‌کرد ولی هیچ فیلتری
  // نداشت — کامنتی که کاری را که نمی‌کند ادعا کند، خواننده را گمراه می‌کند.
  const withLegs = BOXES.concat([
    box('پایه پلاستیکی', 30, 30, -100, 60, 60, 100),
    box('پایه پلاستیکی', 800, 30, -100, 60, 60, 100)
  ]);
  const raw = { kalaxa_id: 'r-legs', label_fa: 'با پایه', boxes: withLegs,
                world_transform: { origin_cm: [0, 0, 0], rotation_z_deg: 0 } };
  const rows = C.group(C.classify(withLegs).parts);
  assert(rows.some(p => p.role === 'hardware'), 'پایه یراق شناخته می‌شود');

  const p = B.build(raw, rows, { sheets: SHEETS }).cabinet.params;
  assert(p.cabinet_height === 72, 'ارتفاع ۷۲ است، نه ۸۲', String(p.cabinet_height));

  // و بدون پایه همان عدد درمی‌آید — یعنی فیلتر چیز دیگری را قربانی نکرده
  const plain = B.build(RAW, rowsOf(), { sheets: SHEETS }).cabinet.params;
  assert(plain.cabinet_height === p.cabinet_height,
         'حذف پایه ابعاد بقیه را عوض نمی‌کند');
}

console.log('دستگیرهٔ بیرون‌زده هم در عمق نمی‌آید');
{
  const withHandle = BOXES.concat([box('دستگیره', 400, -53, 300, 120, 35, 20)]);
  const raw = { kalaxa_id: 'r-h', label_fa: 'x', boxes: withHandle,
                world_transform: { origin_cm: [0, 0, 0], rotation_z_deg: 0 } };
  const rows = C.group(C.classify(withHandle).parts);
  const p = B.build(raw, rows, { sheets: SHEETS }).cabinet.params;
  const plain = B.build(RAW, rowsOf(), { sheets: SHEETS }).cabinet.params;
  assert(p.cabinet_depth === plain.cabinet_depth,
         'عمق نصب همان پوسته است', p.cabinet_depth + ' vs ' + plain.cabinet_depth);
}

console.log('\n' + passed + ' گذشت، ' + failed + ' افتاد');
process.exit(failed ? 1 : 0);
