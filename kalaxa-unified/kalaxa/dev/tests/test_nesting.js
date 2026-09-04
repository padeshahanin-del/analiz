/**
 * تست‌های standalone موتور nesting — اجرا: node tests/test_nesting.js
 * بدون هیچ وابستگی؛ مثل بقیه suite های پروژه کالاکسا.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const Nesting = require(path.join(__dirname, '..', '..', 'ui', 'kalaxa-nesting.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

function baseSnapshot(parts, sheets, cutting) {
  return {
    schema_version: 1,
    snapshot_id: 'test',
    sheets: sheets || [{
      sheet_id: 's1', material: 'mdf', color_code: 'W', thickness_mm: 16,
      width_mm: 3660, height_mm: 1830, has_grain: false, price_per_sheet: 0, trim_margin_mm: 10
    }],
    cutting: cutting || { kerf_mm: 4, allow_rotation_default: true, min_offcut_mm: 100 },
    cabinets: [],
    parts_flat: parts
  };
}
function part(over) {
  return Object.assign({
    part_uid: 'p1', cabinet_id: 'c1', key: 'k', name_fa: 'قطعه', count: 1,
    cut_length_mm: 500, cut_width_mm: 300, thickness_mm: 16,
    sheet_id: 's1', grain: 'none', allow_rotation: true, edge: {}, groove: {}
  }, over);
}

/* ۱. لیست خالی */
console.log('\n[1] لیست قطعات خالی');
{
  const r = Nesting.run(baseSnapshot([]));
  assert(r.ok === true, 'ok=true');
  assert(r.total_sheets === 0, 'صفر ورق');
}

/* ۲. یک قطعه ساده — جای‌گذاری داخل trim */
console.log('\n[2] یک قطعه ساده');
{
  const r = Nesting.run(baseSnapshot([part()]));
  assert(r.ok, 'ok');
  assert(r.total_sheets === 1, 'یک ورق');
  const p = r.by_sheet_type[0].layouts[0].placements[0];
  assert(p.x_mm >= 10 && p.y_mm >= 10, 'رعایت trim margin', JSON.stringify(p));
  const dimsOk = (!p.rotated && p.w_mm === 500 && p.h_mm === 300) ||
                 (p.rotated && p.w_mm === 300 && p.h_mm === 500);
  assert(dimsOk, 'ابعاد بدون kerf و سازگار با پرچم rotated', JSON.stringify(p));
}

/* ۳. قطعه بزرگ‌تر از ورق */
console.log('\n[3] قطعه بزرگ‌تر از ورق');
{
  const r = Nesting.run(baseSnapshot([part({ cut_length_mm: 4000, cut_width_mm: 2000 })]));
  assert(r.ok === false, 'ok=false');
  assert(r.unplaced.length === 1 && r.unplaced[0].reason === 'oversize', 'گزارش oversize');
  assert(/جا نمی‌شود/.test(r.unplaced[0].message_fa), 'پیام فارسی');
}

/* ۴. فقط با چرخش جا می‌شود و چرخش مجاز است */
console.log('\n[4] جای‌گذاری با چرخش مجاز');
{
  // ورق کوچک 1000×600 (usable 980×580)؛ قطعه 550×900 فقط چرخیده جا می‌شود
  const sheets = [{ sheet_id: 's1', material: 'mdf', color_code: 'W', thickness_mm: 16,
    width_mm: 1000, height_mm: 600, has_grain: false, trim_margin_mm: 10 }];
  const r = Nesting.run(baseSnapshot([part({ cut_length_mm: 550, cut_width_mm: 900 })], sheets));
  assert(r.ok, 'ok');
  assert(r.by_sheet_type[0].layouts[0].placements[0].rotated === true, 'rotated=true');
}

/* ۵. فقط با چرخش جا می‌شود ولی راه چوب چرخش را ممنوع کرده */
console.log('\n[5] راه چوب مانع چرخش');
{
  const sheets = [{ sheet_id: 's1', material: 'mdf', color_code: 'W', thickness_mm: 16,
    width_mm: 1000, height_mm: 600, has_grain: true, trim_margin_mm: 10 }];
  const r = Nesting.run(baseSnapshot(
    [part({ cut_length_mm: 550, cut_width_mm: 900, grain: 'length', allow_rotation: false })], sheets));
  assert(r.ok === false, 'ok=false');
  assert(r.unplaced.length === 1, 'unplaced=1');
  assert(/راه چوب|مجاز نیست/.test(r.unplaced[0].message_fa), 'پیام علت چرخش‌ناپذیری');
}

/* ۶. بازشدن count */
console.log('\n[6] بازشدن count');
{
  const r = Nesting.run(baseSnapshot([part({ count: 5 })]));
  const n = r.by_sheet_type[0].layouts.reduce((s, l) => s + l.placements.length, 0);
  assert(n === 5, '۵ جای‌گذاری از count=5', 'n=' + n);
}

/* ۷. اثر kerf — بدون kerf در یک ورق، با kerf در دو ورق */
console.log('\n[7] اثر kerf');
{
  // ورق 1000×600، trim 0 → usable 1000×600
  // دو قطعه 500×600: بدون kerf دقیقاً کنار هم؛ با kerf=4 نمی‌گنجند
  const sheets = [{ sheet_id: 's1', material: 'mdf', color_code: 'W', thickness_mm: 16,
    width_mm: 1000, height_mm: 600, has_grain: false, trim_margin_mm: 0 }];
  const parts = [part({ cut_length_mm: 500, cut_width_mm: 600, count: 2, allow_rotation: false })];

  const r0 = Nesting.run(baseSnapshot(parts, sheets, { kerf_mm: 0, allow_rotation_default: true }));
  const r4 = Nesting.run(baseSnapshot(parts, sheets, { kerf_mm: 4, allow_rotation_default: true }));
  assert(r0.total_sheets === 1, 'kerf=0 → ۱ ورق', 'got ' + r0.total_sheets);
  assert(r4.total_sheets === 2, 'kerf=4 → ۲ ورق', 'got ' + r4.total_sheets);
}

/* ۸. مسیریابی چند نوع ورق */
console.log('\n[8] مسیریابی sheet_id');
{
  const sheets = [
    { sheet_id: 'white16', material: 'mdf', color_code: 'W', thickness_mm: 16, width_mm: 3660, height_mm: 1830, has_grain: false, trim_margin_mm: 10 },
    { sheet_id: 'hdf3', material: 'hdf', color_code: 'RAW', thickness_mm: 3, width_mm: 2440, height_mm: 1220, has_grain: false, trim_margin_mm: 5 }
  ];
  const parts = [
    part({ part_uid: 'a', sheet_id: 'white16' }),
    part({ part_uid: 'b', sheet_id: 'hdf3' })
  ];
  const r = Nesting.run(baseSnapshot(parts, sheets));
  assert(r.by_sheet_type.length === 2, 'دو گروه ورق');
  const g = {};
  r.by_sheet_type.forEach(x => g[x.sheet_id] = x);
  assert(g.white16.layouts[0].placements[0].part_uid === 'a', 'قطعه a روی white16');
  assert(g.hdf3.layouts[0].placements[0].part_uid === 'b', 'قطعه b روی hdf3');
}

/* ۹. ارجاع به ورق ناموجود + ابعاد نامعتبر */
console.log('\n[9] اعتبارسنجی ورودی');
{
  const r1 = Nesting.run(baseSnapshot([part({ sheet_id: 'ghost' })]));
  assert(r1.ok === false && r1.errors.some(e => /ناموجود/.test(e)), 'خطای ورق ناموجود');
  const r2 = Nesting.run(baseSnapshot([part({ cut_length_mm: 0 })]));
  assert(r2.ok === false && r2.errors.some(e => /نامعتبر/.test(e)), 'خطای بعد صفر');
  const r3 = Nesting.run({ schema_version: 99, sheets: [], parts_flat: [] });
  assert(r3.ok === false && r3.errors.some(e => /schema_version/.test(e)), 'خطای نسخه schema');
}

/* ۱۰. قطعه دقیقاً هم‌اندازه فضای مفید ورق */
console.log('\n[10] قطعه هم‌اندازه فضای مفید');
{
  const sheets = [{ sheet_id: 's1', material: 'mdf', color_code: 'W', thickness_mm: 16,
    width_mm: 1000, height_mm: 600, has_grain: false, trim_margin_mm: 10 }];
  const r = Nesting.run(baseSnapshot(
    [part({ cut_length_mm: 980, cut_width_mm: 580, allow_rotation: false })], sheets));
  assert(r.ok, 'جا می‌شود (usable = 980×580)');
  assert(r.total_sheets === 1, 'یک ورق');
}

/* ۱۱. راستی‌آزمایی گیوتینی: عدم هم‌پوشانی در چیدمان شلوغ */
console.log('\n[11] عدم هم‌پوشانی');
{
  const parts = [];
  for (let i = 0; i < 20; i++) {
    parts.push(part({ part_uid: 'p' + i, cut_length_mm: 300 + (i * 37) % 500, cut_width_mm: 200 + (i * 53) % 400 }));
  }
  const r = Nesting.run(baseSnapshot(parts));
  const problems = r.by_sheet_type[0].verify_problems;
  assert(problems.length === 0, 'verify_problems خالی', problems.join('؛ '));
  assert(r.ok, 'ok');
}

/* ۱۲. رگرسیون fixture طلایی */
console.log('\n[12] fixture طلایی — آشپزخانه ۵ کابینته');
{
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'golden_kitchen_snapshot.json'), 'utf8'));
  const r = Nesting.run(fx);

  assert(r.ok === true, 'همه قطعات جای‌گذاری شدند', JSON.stringify(r.unplaced) + ' | ' + r.warnings.join('؛ '));

  // تعداد کل نمونه‌ها = مجموع count
  const expectedInstances = fx.parts_flat.reduce((s, p) => s + p.count, 0);
  const placedInstances = r.by_sheet_type.reduce((s, g) =>
    s + g.layouts.reduce((s2, l) => s2 + l.placements.length, 0), 0);
  assert(placedInstances === expectedInstances,
    'تعداد جای‌گذاری = مجموع count (' + expectedInstances + ')', 'placed=' + placedInstances);

  // قواعد راه چوب روی ورق درب: هیچ قطعه‌ای نباید چرخیده باشد (همه grain=length)
  const doorGroup = r.by_sheet_type.find(g => g.sheet_id === 'mdf_door_16');
  const anyRotated = doorGroup.layouts.some(l => l.placements.some(p => p.rotated));
  assert(!anyRotated, 'راه چوب: هیچ درب/نمای کشویی نچرخیده');

  // سقف منطقی تعداد ورق (cutlist دستی: بدنه ≤3، پشت ≤2، درب ≤2، HDF =1)
  const g = {}; r.by_sheet_type.forEach(x => g[x.sheet_id] = x);
  assert(g.mdf_white_16.sheets_used <= 3, 'بدنه ۱۶mm حداکثر ۳ ورق', 'got ' + g.mdf_white_16.sheets_used);
  assert(g.mdf_white_8.sheets_used <= 2, 'پشت‌بند ۸mm حداکثر ۲ ورق', 'got ' + g.mdf_white_8.sheets_used);
  assert(g.mdf_door_16.sheets_used <= 2, 'درب حداکثر ۲ ورق', 'got ' + g.mdf_door_16.sheets_used);
  assert(g.hdf_3.sheets_used === 1, 'HDF دقیقاً ۱ ورق', 'got ' + g.hdf_3.sheets_used);

  // هر layout باید cut sequence و در صورت وجود، آفکات گزارش کند
  const anyCuts = g.mdf_white_16.layouts.every(l => l.cuts.length > 0);
  assert(anyCuts, 'توالی برش برای هر ورق تولید شده');

  // راستی‌آزمایی همه گروه‌ها
  const allVerified = r.by_sheet_type.every(x => x.verify_problems.length === 0);
  assert(allVerified, 'راستی‌آزمایی هندسی همه ورق‌ها');

  console.log('\n  خلاصه fixture:');
  r.by_sheet_type.forEach(x => {
    console.log('    ' + x.sheet_id + ': ' + x.sheets_used + ' ورق، بازدهی ' +
      x.utilization_pct + '٪، استراتژی ' + x.strategy_used);
  });
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
