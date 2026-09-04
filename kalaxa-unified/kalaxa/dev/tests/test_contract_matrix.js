/**
 * تست ماتریس اجباری قرارداد ساخت v1.2 — اجرا: node test_contract_matrix.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const UI = path.join(__dirname, '..', '..', 'ui');
const Nesting = require(path.join(UI, 'kalaxa-nesting.js'));
const Schema = require(path.join(UI, 'kalaxa-schema.js'));
const Validator = require(path.join(UI, 'kalaxa-nesting-validator.js'));

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

/* ------------------------------------------- ورودی خراب: NaN/Infinity/منفی */
console.log('\n[ورودی خراب] NaN، Infinity، منفی، جاافتاده');
{
  [NaN, Infinity, -Infinity, -5, '500', null, undefined].forEach(function (bad) {
    const r = Nesting.run(snap([part({ cut_length_mm: bad })]));
    assert(r.ok === false && r.errors.length > 0,
      'cut_length=' + String(bad) + ' رد شد', JSON.stringify(r.errors));
  });
  const r1 = Nesting.run(snap([part({ count: NaN })]));
  assert(r1.ok === false, 'count=NaN رد شد');
  const r2 = Nesting.run(snap([part({ count: 2.5 })]));
  // count اعشاری: موتور فعلی به‌واسطه isPosInt (عدد مثبت) می‌پذیرد؟ Schema سخت‌گیرتر است:
  const v2 = Schema.validateSnapshot(snap([part({ count: 2.5 })]));
  assert(v2.ok === false && v2.errors.some(e => /count/.test(e)), 'count=2.5 در schema رد شد');
  const r3 = Nesting.run(snap([part()], { sheets: [{ sheet_id: 's1', width_mm: Infinity, height_mm: 1830, trim_margin_mm: 10 }] }));
  assert(r3.ok === false, 'width ورق Infinity رد شد');
}

console.log('\n[ورودی خراب] snapshot غیرشیء و آرایه');
{
  [null, undefined, 42, 'x', []].forEach(function (bad) {
    const v = Schema.validateSnapshot(bad);
    assert(v.ok === false, 'snapshot=' + JSON.stringify(bad) + ' رد شد');
  });
}

/* ------------------------------------------------------- Schema v2 و مهاجرت */
console.log('\n[Schema] مهاجرت v1→v2 قطعی');
{
  const v1 = snap([part({ part_uid: undefined }), part({ part_uid: undefined, key: 'z' })]);
  delete v1.parts_flat[0].part_uid; delete v1.parts_flat[1].part_uid;
  const m1 = Schema.migrateToV2(v1);
  const m2 = Schema.migrateToV2(v1);
  assert(m1.migrated === true, 'مهاجرت انجام شد');
  assert(m1.snapshot.schema_version === 2, 'schema_version=2');
  assert(Array.isArray(m1.snapshot.stock_offcuts), 'stock_offcuts=[]');
  assert(m1.snapshot.parts_flat[0].part_uid === 'c1:k:1', 'uid قطعی c1:k:1',
    m1.snapshot.parts_flat[0].part_uid);
  assert(JSON.stringify(m1.snapshot) === JSON.stringify(m2.snapshot), 'مهاجرت تکرارپذیر');
  assert(v1.schema_version === 1, 'ورودی اصلی دست‌نخورده');
  // v2 وارد nesting می‌شود
  const r = Nesting.run(m1.snapshot);
  assert(r.ok, 'nesting نسخه v2 را می‌پذیرد');
}
{
  const fxv2 = Schema.migrateToV2(fx).snapshot;
  const r = Nesting.run(fxv2);
  assert(r.ok && r.total_sheets === 5, 'fixture مهاجرت‌یافته = همان ۵ ورق');
  const unknown = Schema.migrateToV2({ schema_version: 7 });
  assert(unknown.snapshot === null, 'schema ناشناخته رد شد');
}

/* -------------------------------------------------------------- جبرگرایی */
console.log('\n[جبرگرایی] دو اجرا، خروجی بیت‌به‌بیت یکسان');
{
  const a = Nesting.run(fx);
  const b = Nesting.run(fx);
  assert(JSON.stringify(a) === JSON.stringify(b), 'fixture: دو اجرا یکسان');
  const s = snap([part({ count: 30, cut_length_mm: 400, cut_width_mm: 400 }),
                  part({ part_uid: 'p2', count: 30, cut_length_mm: 400, cut_width_mm: 400 })]);
  // قطعات هم‌اندازه — tiebreaker باید ترتیب قطعی بدهد
  const c = Nesting.run(s), d = Nesting.run(s);
  assert(JSON.stringify(c) === JSON.stringify(d), 'قطعات هم‌امتیاز: خروجی قطعی');
}

/* ----------------------------------------------------- اعتبارسنج مستقل */
console.log('\n[اعتبارسنج] نتیجه سالم fixture پاس می‌شود');
{
  const r = Nesting.run(fx);
  const v = Validator.validate(fx, r);
  assert(v.ok === true, 'fixture معتبر', v.problems.slice(0, 3).join(' | '));
  // نیت: هر نمونهٔ مورد انتظار جای‌گذاری شده — نه اینکه دقیقاً ۵۳ تا باشند.
  const want = fx.parts_flat.reduce((s, p) => s + p.count, 0);
  assert(v.stats.expected_instances === want &&
         v.stats.placed_instances === v.stats.expected_instances,
    'همهٔ نمونه‌های مورد انتظار جای‌گذاری شدند', JSON.stringify(v.stats));
}

console.log('\n[اعتبارسنج] fixture + انبار آفکات پاس می‌شود');
{
  const s = JSON.parse(JSON.stringify(fx));
  s.stock_offcuts = [{ offcut_id: 'o1', sheet_id: 'mdf_white_16', width_mm: 1200, height_mm: 800 }];
  const r = Nesting.run(s);
  const v = Validator.validate(s, r);
  assert(v.ok === true, 'با آفکات معتبر', v.problems.slice(0, 3).join(' | '));
}

console.log('\n[اعتبارسنج] Overlap مصنوعی رد می‌شود');
{
  const s = snap([part(), part({ part_uid: 'p2' })]);
  const r = Nesting.run(s);
  // دست‌کاری: قطعه دوم را روی اول بگذار
  r.by_sheet_type[0].layouts[0].placements[1].x_mm = r.by_sheet_type[0].layouts[0].placements[0].x_mm;
  r.by_sheet_type[0].layouts[0].placements[1].y_mm = r.by_sheet_type[0].layouts[0].placements[0].y_mm;
  const v = Validator.validate(s, r);
  assert(v.ok === false && v.problems.some(p => /هم‌پوشانی/.test(p)), 'هم‌پوشانی شناسایی شد');
}

console.log('\n[اعتبارسنج] قطعه گم‌شده و تکراری رد می‌شود');
{
  const s = snap([part({ count: 2 })]);
  const r1 = Nesting.run(s);
  r1.by_sheet_type[0].layouts[0].placements.pop(); // گم‌کردن نمونه ۲
  const v1 = Validator.validate(s, r1);
  assert(v1.ok === false && v1.problems.some(p => /گم‌شده/.test(p)), 'گم‌شده شناسایی شد');

  const r2 = Nesting.run(s);
  const ps = r2.by_sheet_type[0].layouts[0].placements;
  ps[1] = JSON.parse(JSON.stringify(ps[0])); // تکرار نمونه ۱
  ps[1].x_mm += 600;
  const v2 = Validator.validate(s, r2);
  assert(v2.ok === false && v2.problems.some(p => /تکراری/.test(p)), 'تکراری شناسایی شد');
}

console.log('\n[اعتبارسنج] نقض kerf رد می‌شود');
{
  const s = snap([part({ allow_rotation: false }), part({ part_uid: 'p2', allow_rotation: false })]);
  const r = Nesting.run(s);
  const ps = r.by_sheet_type[0].layouts[0].placements;
  // قطعه دوم را بچسبان به اول (فاصله ۱mm < kerf ۴mm) بدون هم‌پوشانی
  ps[1].x_mm = ps[0].x_mm + ps[0].w_mm + 1;
  ps[1].y_mm = ps[0].y_mm;
  const v = Validator.validate(s, r);
  assert(v.ok === false && v.problems.some(p => /kerf/.test(p)), 'نقض kerf شناسایی شد',
    v.problems.join(' | '));
}

console.log('\n[اعتبارسنج] چرخش غیرمجاز رد می‌شود');
{
  const sheets = [{ sheet_id: 's1', material: 'm', color_code: 'c', thickness_mm: 16,
    width_mm: 3660, height_mm: 1830, has_grain: true, trim_margin_mm: 10 }];
  const s = snap([part({ grain: 'length', allow_rotation: false })], { sheets: sheets });
  const r = Nesting.run(s);
  const p0 = r.by_sheet_type[0].layouts[0].placements[0];
  p0.rotated = true; // دست‌کاری
  var t = p0.w_mm; p0.w_mm = p0.h_mm; p0.h_mm = t;
  const v = Validator.validate(s, r);
  assert(v.ok === false && v.problems.some(p => /راه چوب/.test(p)), 'چرخش خلاف grain شناسایی شد');
}

console.log('\n[اعتبارسنج] تشخیص چیدمان غیرگیوتینی (pinwheel)');
{
  // چرخ‌فلک کلاسیک: هیچ برش سراسری‌ای ممکن نیست
  const pin = [
    { x_mm: 0,   y_mm: 0,   w_mm: 200, h_mm: 100, part_uid: 'a', instance: 1 },
    { x_mm: 200, y_mm: 0,   w_mm: 100, h_mm: 200, part_uid: 'b', instance: 1 },
    { x_mm: 100, y_mm: 200, w_mm: 200, h_mm: 100, part_uid: 'c', instance: 1 },
    { x_mm: 0,   y_mm: 100, w_mm: 100, h_mm: 200, part_uid: 'd', instance: 1 }
  ];
  assert(Validator._internal.guillotineFeasible(pin) === false, 'pinwheel غیرگیوتینی');
  const grid = [
    { x_mm: 0, y_mm: 0, w_mm: 100, h_mm: 100 }, { x_mm: 150, y_mm: 0, w_mm: 100, h_mm: 100 },
    { x_mm: 0, y_mm: 150, w_mm: 100, h_mm: 100 }, { x_mm: 150, y_mm: 150, w_mm: 100, h_mm: 100 }
  ];
  assert(Validator._internal.guillotineFeasible(grid) === true, 'شبکه منظم گیوتینی');
}

console.log('\n[اعتبارسنج] همه چیدمان‌های موتور گیوتینی هستند (۲۰۰ قطعه تصادفی‌نما)');
{
  const parts = [];
  for (let i = 0; i < 200; i++) {
    parts.push(part({ part_uid: 'p' + i,
      cut_length_mm: 150 + (i * 137) % 900, cut_width_mm: 120 + (i * 211) % 600 }));
  }
  const s = snap(parts);
  const r = Nesting.run(s);
  const v = Validator.validate(s, r);
  assert(v.ok === true, '۲۰۰ قطعه: اعتبارسنج کامل پاس', v.problems.slice(0, 3).join(' | '));
}

/* ------------------------------------------------- چند ضخامت / kerf دقیق */
console.log('\n[ماتریس] چند ضخامت روی ورق‌های جدا');
{
  const sheets = [
    { sheet_id: 't16', material: 'mdf', color_code: 'W', thickness_mm: 16, width_mm: 2000, height_mm: 1000, has_grain: false, trim_margin_mm: 0 },
    { sheet_id: 't8', material: 'mdf', color_code: 'W', thickness_mm: 8, width_mm: 2000, height_mm: 1000, has_grain: false, trim_margin_mm: 0 }
  ];
  const s = snap([part({ sheet_id: 't16', thickness_mm: 16 }),
                  part({ part_uid: 'p2', sheet_id: 't8', thickness_mm: 8 })], { sheets: sheets });
  const r = Nesting.run(s);
  assert(r.ok && r.by_sheet_type.length === 2, 'دو گروه ضخامت');
}

console.log('\n[ماتریس] kerf و margin دقیق در مختصات');
{
  const sheets = [{ sheet_id: 's1', material: 'm', color_code: 'c', thickness_mm: 16,
    width_mm: 1000, height_mm: 600, has_grain: false, trim_margin_mm: 15 }];
  const s = snap([part({ cut_length_mm: 300, cut_width_mm: 200, count: 2, allow_rotation: false })],
    { sheets: sheets, cutting: { kerf_mm: 6, allow_rotation_default: false, min_offcut_mm: 50 } });
  const r = Nesting.run(s);
  const ps = r.by_sheet_type[0].layouts[0].placements;
  assert(ps.every(p => p.x_mm >= 15 && p.y_mm >= 15), 'margin=15 در مختصات');
  const gap = Math.abs(ps[1].x_mm - (ps[0].x_mm + ps[0].w_mm)) < 0.01 ? null
    : Math.min(Math.abs(ps[1].x_mm - ps[0].x_mm - ps[0].w_mm), Math.abs(ps[1].y_mm - ps[0].y_mm - ps[0].h_mm));
  const v = Validator.validate(s, r);
  assert(v.ok, 'اعتبارسنج kerf=6 پاس', v.problems.join('|'));
}

/* --------------------------------------------------------- مدل بزرگ + زمان */
console.log('\n[کارایی] مدل بزرگ — ۱۰۰۰ قطعه');
{
  const parts = [];
  for (let i = 0; i < 250; i++) {
    parts.push(part({ part_uid: 'big' + i, count: 4,
      cut_length_mm: 200 + (i * 97) % 800, cut_width_mm: 150 + (i * 61) % 500 }));
  }
  const s = snap(parts);
  const t0 = Date.now();
  const r = Nesting.run(s);
  const dt = Date.now() - t0;
  assert(r.ok, '۱۰۰۰ نمونه بدون خطا');
  assert(dt < 10000, 'زیر ۱۰ ثانیه (' + dt + 'ms)');
  console.log('    زمان واقعی nesting ۱۰۰۰ قطعه × ۶ استراتژی: ' + dt + 'ms — ' +
    r.total_sheets + ' ورق');
  const tv = Date.now();
  const v = Validator.validate(s, r);
  console.log('    زمان اعتبارسنجی مستقل: ' + (Date.now() - tv) + 'ms');
  assert(v.ok, 'اعتبارسنجی مدل بزرگ پاس', v.problems.slice(0, 2).join('|'));
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
