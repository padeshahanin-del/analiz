/**
 * تست ماژول‌های آنالیز تکمیلی — اجرا: node test_analysis_extras.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const UI = path.join(__dirname, '..', '..', 'ui');
const Nesting = require(path.join(UI, 'kalaxa-nesting.js'));
const InstallMap = require(path.join(UI, 'kalaxa-install-map.js'));
const Report = require(path.join(UI, 'kalaxa-report.js'));
const Rules = require(path.join(UI, 'kalaxa-rules.js'));

const fx = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'golden_kitchen_snapshot.json'), 'utf8'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

/* ---------------------------------------------------------- نقشه نصب */
console.log('\n[نقشه نصب] گروه‌بندی دیوار fixture');
{
  const walls = InstallMap.groupWalls(fx.cabinets);
  assert(walls.length === 1, 'یک دیوار (همه rot=0 و y=0)', 'got ' + walls.length);
  const w = walls[0];
  assert(w.items.length === 5, '۵ کابینت روی دیوار');
  // ترتیب: cab-001 (s=0) → cab-002 (800) → cab-003 (1400) → cab-005 (2400) → cab-004 (0, z=1480)
  const byId = {};
  w.items.forEach(it => byId[it.cab.kalaxa_id] = it);
  assert(byId['cab-002'].s_mm === 800, 'موقعیت cab-002 = 800mm', 'got ' + byId['cab-002'].s_mm);
  assert(byId['cab-004'].z_mm === 1480, 'ارتفاع نصب هوایی = 1480mm', 'got ' + byId['cab-004'].z_mm);
  assert(w.length_mm === 3000, 'طول دیوار 3000mm', 'got ' + w.length_mm);
  assert(w.height_mm === 2200, 'ارتفاع دیوار = سقف قدی 2200', 'got ' + w.height_mm);
}

console.log('\n[نقشه نصب] دیوار چرخیده ۹۰ درجه جدا می‌شود');
{
  const cabs = [
    { kalaxa_id: 'a', category: 'base', label_fa: 'الف', params: { cabinet_width: 60, cabinet_height: 72, cabinet_depth: 55 },
      world_transform: { origin_cm: [0, 0, 0], rotation_z_deg: 0 } },
    { kalaxa_id: 'b', category: 'base', label_fa: 'ب', params: { cabinet_width: 60, cabinet_height: 72, cabinet_depth: 55 },
      world_transform: { origin_cm: [300, 0, 0], rotation_z_deg: 90 } }
  ];
  const walls = InstallMap.groupWalls(cabs);
  assert(walls.length === 2, 'دو دیوار مجزا', 'got ' + walls.length);
}

console.log('\n[نقشه نصب] رندر SVG');
{
  const maps = InstallMap.renderAll(fx);
  assert(maps.length === 1 && /<svg/.test(maps[0].svg), 'SVG تولید شد');
  assert(/خط کانتر/.test(maps[0].svg), 'خط کانتر رسم شده');
  // پیش‌فرض cm: طول دیوار 3000mm → ۳۰۰ (هماهنگ با تنظیم واحد)
  assert(/۳۰۰(?!۰)/.test(maps[0].svg), 'دایمنشن جمع کل به cm پیش‌فرض (۳۰۰)');
  // با unit=mm همان ۳۰۰۰ برمی‌گردد
  const mmMaps = InstallMap.renderAll(fx, { unit: 'mm' });
  assert(/۳۰۰۰/.test(mmMaps[0].svg), 'با unit=mm دایمنشن ۳۰۰۰');
}

/* ---------------------------------------------------------- نوار لبه */
console.log('\n[گزارش] نوار لبه — محاسبه دستی یک قطعه');
{
  // قطعه: 500×300، count=2، لبه front=1 و top=1 → 2×(500+300)=1600mm=1.6m
  const snap = {
    schema_version: 1, sheets: [], cabinets: [],
    parts_flat: [{ part_uid: 'x', cabinet_id: 'c', key: 'k', name_fa: 'ق', count: 2,
      cut_length_mm: 500, cut_width_mm: 300, thickness_mm: 16, sheet_id: 's1',
      grain: 'none', edge: { front: 1, top: 1 } }]
  };
  const eb = Report.edgeBanding(snap);
  assert(eb.by_sheet[0].meters === 1.6, 'متراژ = 1.6m', 'got ' + eb.by_sheet[0].meters);
  assert(eb.total_m_with_waste === 1.68, 'با ۵٪ اضافه = 1.68m', 'got ' + eb.total_m_with_waste);
}

console.log('\n[گزارش] نوار لبه fixture — درب‌ها چهارطرف نوار');
{
  const eb = Report.edgeBanding(fx);
  const door = eb.by_sheet.find(r => r.sheet_id === 'mdf_door_16');
  // درب‌ها: p-006 (2×716+2×796)=3024، p-011 3×1664=4992، p-019 2×2424=4848،
  //          p-024 3024، p-029 2×3384=6768 → مجموع 22656mm = 22.66m
  assert(door && Math.abs(door.meters - 22.66) < 0.01, 'نوار درب = 22.66m', 'got ' + (door && door.meters));
}

/* -------------------------------------------------------- وزن و قیمت */
console.log('\n[گزارش] خلاصه متریال و وزن');
{
  const nest = Nesting.run(fx);
  const ms = Report.materialSummary(fx, nest);
  assert(ms.rows.length === 4, '۴ ردیف ورق');
  assert(ms.total_weight_kg > 100 && ms.total_weight_kg < 300,
    'وزن کل در بازه منطقی (۱۰۰–۳۰۰kg)', 'got ' + ms.total_weight_kg);
  const w16 = ms.rows.find(r => r.sheet_id === 'mdf_white_16');
  assert(w16.sheets_used === 2, 'sheets_used از nesting تزریق شده');
}

console.log('\n[گزارش] برآورد قیمت');
{
  const nest = Nesting.run(fx);
  const pt = { currency: 'تومان',
    sheets: { mdf_white_16: 2000000, mdf_white_8: 1200000, mdf_door_16: 5000000, hdf_3: 400000 },
    edge_per_m: { mdf_door_16: 50000, mdf_white_16: 15000 } };
  const pe = Report.priceEstimate(fx, nest, pt);
  // ورق: 2×2M + 1×1.2M + 1×5M + 1×0.4M = 10.6M + نوار
  const sheetCost = pe.lines.filter(l => l.kind === 'sheet').reduce((s, l) => s + l.cost, 0);
  assert(sheetCost === 10600000, 'هزینه ورق = ۱۰٬۶۰۰٬۰۰۰', 'got ' + sheetCost);
  assert(pe.total > sheetCost, 'نوار لبه به جمع اضافه شده');
  assert(pe.complete === true, 'پرچم کامل‌بودن قیمت');
}

console.log('\n[گزارش] برچسب قطعات');
{
  const html = Report.labelsHtml(fx, 'پروژه تست');
  const count = (html.match(/class="lbl"/g) || []).length;
  // عدد ثابت ننویس: با تغییر قواعد (مثلاً قید L) تعداد قطعات عوض می‌شود و
  // assertion بی‌دلیل قرمز می‌شود. نیت این است که «هر نمونهٔ قطعه یک برچسب دارد».
  const expectedLabels = fx.parts_flat.reduce((s, p) => s + p.count, 0);
  assert(count === expectedLabels, 'هر نمونهٔ قطعه یک برچسب دارد',
    'انتظار ' + expectedLabels + '، دریافت ' + count);
  assert(/راه چوب/.test(html), 'نشانه راه چوب روی برچسب درب');
  assert(/ط۲ ع۲/.test(html), 'کد لبه چهارطرف درب (ط۲ ع۲)');
}

/* ------------------------------------------------------- چک استاندارد */
console.log('\n[قوانین] fixture سالم');
{
  const r = Rules.run(fx);
  assert(r.ok === true, 'بدون error', JSON.stringify(r.findings.filter(f => f.severity === 'error')));
  // ارتفاع نصب 1480 داخل بازه 1350..1550 → بدون هشدار R2
  assert(!r.findings.some(f => f.rule_id === 'R2_wall_mount_height'), 'ارتفاع هوایی استاندارد');
  // فاصله کانتر: 1480 - (720+40) = 720mm ≤ 750 → بدون هشدار R3
  assert(!r.findings.some(f => f.rule_id === 'R3_counter_gap'), 'فاصله کانتر استاندارد');
}

console.log('\n[قوانین] تشخیص تداخل');
{
  const bad = JSON.parse(JSON.stringify(fx));
  bad.cabinets[1].world_transform.origin_cm = [40, 0, 0]; // cab-002 روی cab-001
  const r = Rules.run(bad);
  assert(r.ok === false, 'error شناسایی شد');
  const f = r.findings.find(x => x.rule_id === 'R1_overlap');
  assert(!!f && /تداخل/.test(f.message_fa), 'پیام تداخل فارسی');
}

console.log('\n[قوانین] هوایی خیلی پایین');
{
  const bad = JSON.parse(JSON.stringify(fx));
  bad.cabinets[3].world_transform.origin_cm = [0, 0, 100]; // z=1000mm
  const r = Rules.run(bad);
  const f = r.findings.find(x => x.rule_id === 'R2_wall_mount_height');
  assert(!!f, 'هشدار ارتفاع نصب');
  assert(r.counts.warn >= 1, 'شمارنده warn');
}

console.log('\n[قوانین] عمق هوایی مساوی زمینی');
{
  const bad = JSON.parse(JSON.stringify(fx));
  bad.cabinets[3].params.cabinet_depth = 55; // = عمق زمینی
  const r = Rules.run(bad);
  const f = r.findings.find(x => x.rule_id === 'R4_wall_deeper_than_base');
  assert(!!f && f.severity === 'error', 'خطای عمق هوایی');
}

console.log('\n[قوانین] غیرفعال‌سازی قانون');
{
  const bad = JSON.parse(JSON.stringify(fx));
  bad.cabinets[0].params.cabinet_width = 83; // خارج از مدول 50mm
  const r1 = Rules.run(bad);
  assert(r1.findings.some(f => f.rule_id === 'R5_module_width'), 'info مدول عرض');
  const r2 = Rules.run(bad, { disabled: ['R5_module_width'] });
  assert(!r2.findings.some(f => f.rule_id === 'R5_module_width'), 'قانون غیرفعال شد');
}

console.log('\n[رفع #6 — عمق کابینت خیلی کم: ریل بدون سکوت]');
{
  const Hardware = require(path.join(UI, 'kalaxa-hardware.js'));
  const Adapter = require(path.join(UI, 'kalaxa-doc-adapter.js'));
  const doc = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'fixtures', 'kalaxa_doc_v2_golden.json'), 'utf8'));
  const u = doc.entities.units[0];
  const mat = doc.entities.materials.find(m => m.kind === 'sheet');
  const drawerFrontId = '00000000-0000-4000-8000-0000000000f1';
  doc.entities.parts.push({ id: drawerFrontId, unit_id: u.id, material_id: mat.id,
    name: 'روکش کشو', role: 'drawer_front', length_mm: 500, width_mm: 100, thickness_mm: 16,
    grain: 'length', edgebanding: { l1: null, l2: null, w1: null, w2: null } });
  u.depth_mm = 250; // آداپتور از همین cabinet_depth (cm) می‌سازد؛ target=200، زیر کوچک‌ترین ریل (250)

  const snap = Adapter.toSnapshot(doc).snapshot;
  const bom = Hardware.bom(snap);
  assert(Array.isArray(bom.warnings) && bom.warnings.length === 1,
    'هشدار صریح تولید شد (نه سکوت)', JSON.stringify(bom.warnings));
  assert(/عمق ۲۵۰mm|عمق 250mm/.test(bom.warnings[0]) || /250/.test(bom.warnings[0]),
    'هشدار به عمق واقعی اشاره دارد', bom.warnings[0]);
  const slideItem = bom.items.find(i => i.item_id.indexOf('slide_') === 0);
  assert(!!slideItem, 'با این حال یک ردیف ریل (بهترین تخمین) تولید شد');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
