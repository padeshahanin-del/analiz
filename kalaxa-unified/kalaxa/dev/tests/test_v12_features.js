/**
 * تست قابلیت‌های v1.2 — اجرا: node test_v12_features.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const UI = path.join(__dirname, '..', '..', 'ui');
const Nesting = require(path.join(UI, 'kalaxa-nesting.js'));
const Hardware = require(path.join(UI, 'kalaxa-hardware.js'));
const Scenarios = require(path.join(UI, 'kalaxa-scenarios.js'));
const Rules = require(path.join(UI, 'kalaxa-rules.js'));

const fx = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'golden_kitchen_snapshot.json'), 'utf8'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}
function snap(parts, extra) {
  return Object.assign({
    schema_version: 1, snapshot_id: 't',
    sheets: [{ sheet_id: 's1', material: 'mdf', color_code: 'W', thickness_mm: 16,
      width_mm: 3660, height_mm: 1830, has_grain: false, trim_margin_mm: 10 }],
    cutting: { kerf_mm: 4, allow_rotation_default: true, min_offcut_mm: 100 },
    cabinets: [], parts_flat: parts
  }, extra || {});
}
function part(over) {
  return Object.assign({ part_uid: 'p1', cabinet_id: 'c1', key: 'k', name_fa: 'ق',
    count: 1, cut_length_mm: 500, cut_width_mm: 300, thickness_mm: 16,
    sheet_id: 's1', grain: 'none', allow_rotation: true, edge: {}, groove: {} }, over);
}

/* ------------------------------------------------------- انبار آفکات */
console.log('\n[انبار آفکات] قطعه در آفکات جا می‌شود → صفر ورق نو');
{
  const s = snap([part({ cut_length_mm: 500, cut_width_mm: 500, allow_rotation: false })],
    { stock_offcuts: [{ offcut_id: 'off-1', sheet_id: 's1', width_mm: 600, height_mm: 600 }] });
  const r = Nesting.run(s);
  assert(r.ok, 'ok');
  assert(r.total_sheets === 0, 'ورق نو = ۰', 'got ' + r.total_sheets);
  assert(r.total_stock_offcuts_used === 1, 'یک آفکات مصرف شد');
  const g = r.by_sheet_type[0];
  assert(g.stock_layouts.length === 1 && g.stock_layouts[0].offcut_id === 'off-1',
    'چیدمان با offcut_id درست');
  assert(g.stock_layouts[0].source === 'offcut', 'source=offcut');
  const p = g.stock_layouts[0].placements[0];
  assert(p.x_mm === 0 && p.y_mm === 0, 'آفکات trim ندارد (0,0)', JSON.stringify(p));
}

console.log('\n[انبار آفکات] قطعه بزرگ‌تر از آفکات → ورق نو');
{
  const s = snap([part({ cut_length_mm: 700, cut_width_mm: 700, allow_rotation: false })],
    { stock_offcuts: [{ offcut_id: 'off-1', sheet_id: 's1', width_mm: 600, height_mm: 600 }] });
  const r = Nesting.run(s);
  assert(r.ok && r.total_sheets === 1, 'یک ورق نو');
  assert(r.total_stock_offcuts_used === 0, 'آفکات مصرف نشد');
}

console.log('\n[انبار آفکات] اولویت آفکات بر ورق نو در ترکیب');
{
  // ۳ قطعه 500×500: یکی در آفکات، دو تا در ورق نو → ۱ ورق نو + ۱ آفکات
  const s = snap([part({ count: 3, cut_length_mm: 500, cut_width_mm: 500 })],
    { stock_offcuts: [{ offcut_id: 'off-1', sheet_id: 's1', width_mm: 550, height_mm: 550 }] });
  const r = Nesting.run(s);
  assert(r.total_stock_offcuts_used === 1, 'آفکات استفاده شد', 'got ' + r.total_stock_offcuts_used);
  const total = r.by_sheet_type[0].layouts.reduce((n, l) => n + l.placements.length, 0) +
                r.by_sheet_type[0].stock_layouts.reduce((n, l) => n + l.placements.length, 0);
  assert(total === 3, 'هر ۳ قطعه جای‌گذاری شد');
  assert(r.total_sheets === 1, 'فقط یک ورق نو', 'got ' + r.total_sheets);
}

console.log('\n[انبار آفکات] fixture با آفکات — بدون رگرسیون');
{
  const s = JSON.parse(JSON.stringify(fx));
  s.stock_offcuts = [
    { offcut_id: 'w16-a', sheet_id: 'mdf_white_16', width_mm: 1200, height_mm: 800 },
    { offcut_id: 'w16-b', sheet_id: 'mdf_white_16', width_mm: 900, height_mm: 600 }
  ];
  const r = Nesting.run(s);
  assert(r.ok, 'ok با آفکات');
  const g = r.by_sheet_type.find(x => x.sheet_id === 'mdf_white_16');
  assert(g.stock_offcuts_used >= 1, 'حداقل یک آفکات بدنه مصرف شد', 'got ' + g.stock_offcuts_used);
  assert(g.sheets_used <= 2, 'ورق نو از ۲ بیشتر نشد', 'got ' + g.sheets_used);
  assert(g.verify_problems.length === 0, 'راستی‌آزمایی چیدمان آفکات');
}

/* -------------------------------------------------------------- یراق */
console.log('\n[یراق] BOM دستی‌تأییدشده fixture');
{
  const b = Hardware.bom(fx);
  const q = {}; b.items.forEach(i => q[i.item_id] = i.qty);
  // لولا: p-006 h716→2، p-019 ۲عدد×2=4، p-024→2، p-029 ۲عدد h1096→3×2=6 → 14
  assert(q.hinge === 14, 'لولا = ۱۴', 'got ' + q.hinge);
  // دستگیره: درب‌ها 1+2+1+2=6 + کشو 3 = 9
  assert(q.handle === 9, 'دستگیره = ۹', 'got ' + q.handle);
  // ریل: عمق 550 → 500؛ ۳ نما
  assert(q.slide_500 === 3, 'ریل ۵۰۰ = ۳ جفت', 'got ' + q.slide_500);
  // پایه: base ۸۰۰→4، ۶۰۰→4، ۱۰۰۰→6 + tall ۶۰۰→4 = 18
  assert(q.leg === 18, 'پایه = ۱۸', 'got ' + q.leg);
  // پین طبقه: طبقات 1+1+2=4 → 16
  assert(q.shelf_pin === 16, 'پین طبقه = ۱۶', 'got ' + q.shelf_pin);
  // مینی‌فیکس: ۴ عدد به‌ازای هر قطعهٔ افقی بدنه. عدد ثابت ننویس — تعداد قید با
  // آرایش L عوض می‌شود و assertion بی‌دلیل قرمز می‌شود.
  const HORIZ = ['bottom', 'top_bottom', 'rail_top', 'rail_bottom'];
  const horizCount = fx.parts_flat
    .filter(p => HORIZ.indexOf(p.key) !== -1)
    .reduce((s, p) => s + p.count, 0);
  assert(q.minifix === horizCount * 4,
    'مینی‌فیکس = ۴ × هر قطعهٔ افقی بدنه',
    'افقی ' + horizCount + ' → انتظار ' + (horizCount * 4) + '، دریافت ' + q.minifix);
}

console.log('\n[یراق] قیمت یراق');
{
  const b = Hardware.bom(fx);
  const p = Hardware.price(b, { hardware: { hinge: 100000, slide_500: 800000, handle: 250000 } });
  // 14×100k + 3×800k + 9×250k = 1.4M + 2.4M + 2.25M = 6.05M
  assert(p.total === 6050000, 'جمع = ۶٬۰۵۰٬۰۰۰', 'got ' + p.total);
}

/* ----------------------------------------------------------- سناریو */
console.log('\n[سناریو] مقایسه kerf و سایز ورق');
{
  const res = Scenarios.compare(fx, Scenarios.defaultScenarios(fx), Nesting,
    { sheets: { mdf_white_16: 2000000, mdf_white_8: 1200000, mdf_door_16: 5000000, hdf_3: 400000 } });
  assert(res.rows.length === 4, '۴ ردیف (فعلی + ۳ سناریو)', 'got ' + res.rows.length);
  assert(res.rows[0].label_fa === 'وضع فعلی' && res.rows[0].delta_sheets === 0, 'مبنا صفر');
  assert(res.rows[0].total_sheets === 5, 'مبنای ۵ ورق fixture');
  res.rows.forEach(r => assert(r.ok, 'سناریو «' + r.label_fa + '» بدون خطا'));
  // ورق کوچک‌تر برای بدنه نباید ورق کمتر بدهد (دیواره قدی 2200 فقط در 2800 جا می‌شود)
  const small = res.rows.find(r => /۲۸۰۰×۲۱۰۰/.test(r.label_fa));
  assert(small.delta_sheets >= 0, 'ورق کوچک‌تر: ورق نو کمتر نشد', 'delta=' + small.delta_sheets);
}

console.log('\n[سناریو] patch مقصد را تغییر نمی‌دهد');
{
  const before = JSON.stringify(fx.cutting);
  Scenarios.compare(fx, [{ label_fa: 'x', patch: { cutting: { kerf_mm: 99 } } }], Nesting);
  assert(JSON.stringify(fx.cutting) === before, 'snapshot اصلی دست‌نخورده');
}

/* ------------------------------------------------------------- فیلر */
console.log('\n[قوانین] R7 گپ فیلر');
{
  const bad = JSON.parse(JSON.stringify(fx));
  // cab-002 را ۳cm جلوتر ببر → گپ 30mm با cab-001
  bad.cabinets[1].world_transform.origin_cm = [83, 0, 0];
  const r = Rules.run(bad);
  const f = r.findings.find(x => x.rule_id === 'R7_filler_gap');
  assert(!!f, 'گپ ۳۰mm شناسایی شد');
  assert(f && /فیلر/.test(f.message_fa), 'پیشنهاد فیلر در پیام');
}
{
  const r = Rules.run(fx);
  assert(!r.findings.some(f => f.rule_id === 'R7_filler_gap'), 'fixture بدون گپ — R7 ساکت');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
