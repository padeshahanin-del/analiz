/** نقشهٔ CNC تک‌قطعه — node test_cnc_sheet.js
 *
 * این تست عمداً از **خروجی واقعی روبی** شروع می‌کند، نه از داده‌ی دست‌ساز:
 * فیکسچر با اجرای Kalaxa::Machining ساخته شده. الگویی که در این پروژه بارها
 * باگ ساخته این است که نویسنده و خواننده هرگز هم را نمی‌بینند و هر دو سبزند.
 *
 * قید اخلاقی نقشه: عمق نامعلوم باید «؟» بماند. عددِ حدسی قطعه را خراب می‌کند.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const UI = path.join(__dirname, '..', '..', 'ui');
const S = require(path.join(UI, 'kalaxa-cnc-sheet.js'));
const C = require(path.join(UI, 'kalaxa-part-classifier.js'));

const FIX = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'machining_features.json'), 'utf8'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

console.log('قرارداد اسکنر روبی ↔ نقشهٔ JS');
{
  // این‌جا دقیقاً همان چیزی می‌آید که RawGeometry در جعبه می‌گذارد.
  const box = FIX.side_with_hinges;
  assert(box.features && Array.isArray(box.features.holes),
         'فیکسچر واقعاً شکل خروجی روبی را دارد', JSON.stringify(Object.keys(box)));

  const parts = C.classify([box]).parts;
  assert(parts[0].features != null,
         'کلاسیفایر features را سر نمی‌برد — بدون این نقشه همیشه خالی است');
  assert(parts[0].features.holes.length === box.features.holes.length,
         'و چیزی از سوراخ‌ها گم نمی‌شود');
}

console.log('نقشه کشیده می‌شود');
{
  const part = C.classify([FIX.side_with_hinges]).parts[0];
  const r = S.render(part);
  assert(r.svg.indexOf('<svg') === 0, 'SVG معتبر');
  assert((r.svg.match(/<circle/g) || []).length === part.features.holes.length,
         'هر سوراخ یک دایره', String((r.svg.match(/<circle/g) || []).length));
  assert(r.holes.length === part.features.holes.length, 'جدول هم همان تعداد دارد');
}

console.log('اندازه از گوشهٔ قطعه — نه از کابینت');
{
  const part = C.classify([FIX.side_with_hinges]).parts[0];
  const r = S.render(part);
  r.holes.forEach(h => {
    assert(h.from_length_mm >= 0 && h.from_length_mm <= part.cut_length_mm,
           'سوراخ ' + h.n + ' داخل طول قطعه است',
           h.from_length_mm + ' از ' + part.cut_length_mm);
    assert(h.from_width_mm >= 0 && h.from_width_mm <= part.cut_width_mm,
           'سوراخ ' + h.n + ' داخل عرض قطعه است');
  });
}

console.log('عمق: معلوم گفته می‌شود، نامعلوم اعتراف');
{
  const part = C.classify([FIX.side_with_hinges]).parts[0];
  const r = S.render(part);
  const cup = r.holes.find(h => h.dia_mm === 35);
  assert(cup && cup.depth_mm === 12, 'کاسهٔ لولا عمق ۱۲ دارد',
         cup ? String(cup.depth_mm) : 'پیدا نشد');

  const through = r.holes.find(h => h.through);
  assert(through, 'سوراخ سرتاسری علامت خورده');
  assert(S.tableHtml(r).indexOf('سرتاسری') !== -1, 'و در جدول «سرتاسری» نوشته می‌شود');

  const blind = S.render(C.classify([FIX.unknown_depth]).parts[0]);
  assert(blind.holes[0].depth_mm === null, 'عمق نامعلوم تهی می‌ماند');
  assert(S.tableHtml(blind).indexOf('؟') !== -1,
         'و در جدول «؟» می‌آید — نه عددی که قطعه را خراب کند');
  assert(blind.warnings.some(w => w.indexOf('عمق') !== -1), 'و هشدار داده می‌شود');
}

console.log('قطعهٔ ماشین‌کاری‌شده بدون هندسه، اعتراف می‌کند');
{
  // این حالت واقعی است: قطعه machined=true دارد ولی سوراخ‌ها خوانده نشدند.
  const part = C.classify([FIX.machined_no_features]).parts[0];
  const r = S.render(part);
  assert(r.warnings.length > 0, 'سکوت نمی‌کند');
  assert(r.warnings.some(w => w.indexOf('دستی') !== -1),
         'و می‌گوید دستی اندازه بگیرید', JSON.stringify(r.warnings));
  assert(r.svg.indexOf('<svg') === 0, 'ولی خطِ دور قطعه را می‌کشد');
}

console.log('قطعهٔ قرینه نقشهٔ خودش را دارد');
{
  // چپ و راست هم‌اندازه‌اند ولی سوراخ‌ها قرینه‌اند. اگر نقشه یکی بود، یکی از
  // دو قطعه اشتباه سوراخ می‌شد.
  const left = S.render(C.classify([FIX.side_with_hinges]).parts[0]);
  const right = S.render(C.classify([FIX.side_mirrored]).parts[0]);
  const pos = h => h.from_length_mm + ',' + h.from_width_mm;
  // فقط یکی از دو مختصات کافی نیست: قرینه‌بودن یعنی یکی‌شان یکی می‌ماند و
  // دیگری برعکس می‌شود. مقایسهٔ تک‌بُعدی این را نمی‌گیرد.
  assert(pos(left.holes[0]) !== pos(right.holes[0]),
         'دو نقشه واقعاً فرق دارند',
         pos(left.holes[0]) + ' vs ' + pos(right.holes[0]));
}

console.log('جیب/شیار');
{
  const r = S.render(C.classify([FIX.grooved_back]).parts[0]);
  assert(r.svg.indexOf('stroke-dasharray') !== -1, 'شیار با خط‌چین کشیده می‌شود');
}

console.log('حالت‌های خالی');
{
  assert(S.render(null).svg === '', 'null نباید بشکند');
  assert(S.render({ cut_length_mm: 0, cut_width_mm: 0 }).warnings.length > 0,
         'ابعاد صفر پیام می‌دهد');
  assert(S.tableHtml({ holes: [] }) === '', 'جدول خالی چیزی نمی‌سازد');
}

console.log('\n' + passed + ' گذشت، ' + failed + ' افتاد');
process.exit(failed ? 1 : 0);
