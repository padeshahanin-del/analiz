/** تست قانون طراحی «ران» تاج/لب‌چراغ/پاخور (کسر گوشه) — node test_trim_rules.js */
'use strict';
const R = require(require('path').join(__dirname, '..', '..', 'ui', 'kalaxa-trim-rules.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

const cabs = [
  { kalaxa_id: 'c1', params: { cabinet_width: 80 } },
  { kalaxa_id: 'c2', params: { cabinet_width: 60 } },
  { kalaxa_id: 'c3', params: { cabinet_width: 100 } }
];

console.log('\n[بدون ران — بدون قطعه]');
{
  const res = R.computeRuns(cabs, []);
  assert(res.segments.crown.length === 0 && res.segments.light_rail.length === 0 && res.segments.kick.length === 0,
    'آرایهٔ خالی → همه گروه‌ها خالی');
  const res2 = R.computeRuns(cabs, null);
  assert(res2.segments.crown.length === 0, 'null runs → بدون خطا');
}

console.log('\n[یک ران ساده — بدون گوشه]');
{
  const res = R.computeRuns(cabs, [{ id: 'r1', category: 'crown', label_fa: 'دیوار شمالی', cabinet_ids: ['c1', 'c2'] }]);
  assert(res.segments.crown.length === 1, 'یک قطعهٔ تاج ساخته شد');
  assert(res.segments.crown[0].length_mm === 1400, 'طول = ۸۰۰+۶۰۰=۱۴۰۰mm (بدون کسر گوشه)', String(res.segments.crown[0].length_mm));
}

console.log('\n[کسر گوشه — رفع هشدار تداخل v3.11.0]');
{
  const res = R.computeRuns(cabs, [{ id: 'r1', category: 'crown', label_fa: 'گوشهٔ L', cabinet_ids: ['c1', 'c2'], corners: 1, deduction_mm: 18 }]);
  assert(res.segments.crown[0].length_mm === 1382, '۱۴۰۰ − ۱×۱۸ = ۱۳۸۲mm', String(res.segments.crown[0].length_mm));
}

console.log('\n[چند گوشه]');
{
  const res = R.computeRuns(cabs, [{ id: 'r1', category: 'kick', cabinet_ids: ['c1', 'c2', 'c3'], corners: 2, deduction_mm: 18 }]);
  assert(res.segments.kick[0].length_mm === 240 * 10 - 36, 'جمع ۲۴۰cm − ۲×۱۸mm', String(res.segments.kick[0].length_mm));
}

console.log('\n[deduction_mm پیش‌فرض سراسری وقتی ران خودش مشخص نکرده]');
{
  const res = R.computeRuns(cabs, [{ id: 'r1', category: 'crown', cabinet_ids: ['c1'], corners: 1 }], 20);
  assert(res.segments.crown[0].length_mm === 780, '۸۰۰ − ۱×۲۰(پیش‌فرض سراسری) = ۷۸۰mm', String(res.segments.crown[0].length_mm));
}

console.log('\n[طول منفی نمی‌شود — سقف صفر]');
{
  const res = R.computeRuns(cabs, [{ id: 'r1', category: 'crown', cabinet_ids: ['c1'], corners: 10, deduction_mm: 100 }]);
  assert(res.segments.crown[0].length_mm === 0, 'کسر بیش‌ازحد → صفر نه منفی');
}

console.log('\n[کابینت ناموجود در مدل — هشدار، نه خطا]');
{
  const res = R.computeRuns(cabs, [{ id: 'r1', category: 'crown', label_fa: 'ران تست', cabinet_ids: ['c1', 'ghost'] }]);
  assert(res.warnings.some(w => /ران تست/.test(w) && /یافت نشد/.test(w)), 'هشدار کابینت ناموجود ثبت شد');
  assert(res.segments.crown[0].length_mm === 800, 'فقط عرض کابینت موجود حساب شد (c1=۸۰۰mm)');
}

console.log('\n[نوع نامعتبر → هشدار، بدون خطا]');
{
  const res = R.computeRuns(cabs, [{ id: 'r1', category: 'invalid_kind', cabinet_ids: ['c1'] }]);
  assert(res.warnings.some(w => /نوع نامعتبر/.test(w)), 'هشدار نوع نامعتبر ثبت شد');
}

console.log('\n[چند ران هم‌زمان روی انواع مختلف]');
{
  const res = R.computeRuns(cabs, [
    { id: 'r1', category: 'crown', cabinet_ids: ['c1'] },
    { id: 'r2', category: 'light_rail', cabinet_ids: ['c2'] },
    { id: 'r3', category: 'kick', cabinet_ids: ['c3'] }
  ]);
  assert(res.segments.crown.length === 1 && res.segments.light_rail.length === 1 && res.segments.kick.length === 1,
    'هر ران در گروه نوع خودش قرار گرفت');
}

console.log('\n[برچسب پیش‌فرض وقتی label_fa نیست]');
{
  const res = R.computeRuns(cabs, [{ id: 'r1', category: 'crown', cabinet_ids: ['c1'] }]);
  assert(res.segments.crown[0].label_fa === 'r1', 'برچسب پیش‌فرض = id');
}

console.log('\n[جبرگرایی]');
{
  const runs = [{ id: 'r1', category: 'crown', cabinet_ids: ['c1', 'c2'], corners: 1, deduction_mm: 18 }];
  const a = JSON.stringify(R.computeRuns(cabs, runs));
  const b = JSON.stringify(R.computeRuns(cabs, runs));
  assert(a === b, 'دو اجرای یکسان → خروجی یکسان');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
