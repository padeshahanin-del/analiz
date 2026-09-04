/** تست نستینگ یک‌بعدی متریال طولی — node test_linear_nesting.js */
'use strict';
const LN = require(require('path').join(__dirname, '..', '..', 'ui', 'kalaxa-linear-nesting.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

console.log('\n[bar_length_mm نامعتبر]');
{
  const r1 = LN.run([{ id: 'a', length_mm: 100, qty: 1 }], {});
  assert(!r1.ok && /نامعتبر/.test(r1.error), 'بدون bar_length_mm رد می‌شود');
  const r2 = LN.run([{ id: 'a', length_mm: 100, qty: 1 }], { bar_length_mm: 0 });
  assert(!r2.ok, 'bar_length_mm صفر رد می‌شود');
  const r3 = LN.run([{ id: 'a', length_mm: 100, qty: 1 }], { bar_length_mm: -5 });
  assert(!r3.ok, 'bar_length_mm منفی رد می‌شود');
}

console.log('\n[سه قطعه که در یک شاخه جا می‌شوند]');
{
  const r = LN.run([{ id: 'wall1', label_fa: 'دیوار ۱', length_mm: 800, qty: 3 }],
    { bar_length_mm: 2500, kerf_mm: 3 });
  assert(r.ok, 'موفق');
  assert(r.total_bars === 1, '۳×۸۰۰ + ۲کرف = ۲۴۰۶ ≤ ۲۵۰۰ → یک شاخه', String(r.total_bars));
  assert(r.bars[0].cuts.length === 3, 'هر ۳ برش در همان شاخه');
  assert(r.bars[0].waste_mm === 2500 - 2406, 'پرت درست محاسبه شد', String(r.bars[0].waste_mm));
}

console.log('\n[سرریز به شاخهٔ دوم]');
{
  const r = LN.run([{ id: 'w', length_mm: 900, qty: 3 }], { bar_length_mm: 2500, kerf_mm: 3 });
  // 900*3+2*3=2706 > 2500 → دو شاخه لازم است (FFD: دو تا در اول، یکی در دوم)
  assert(r.total_bars === 2, '۳×۹۰۰ در ۲۵۰۰ جا نمی‌شود → ۲ شاخه', String(r.total_bars));
  assert(r.bars[0].cuts.length === 2 && r.bars[1].cuts.length === 1, 'توزیع FFD: ۲ در اول، ۱ در دوم');
}

console.log('\n[قطعهٔ بلندتر از شاخه — oversized، نه throw]');
{
  const r = LN.run([{ id: 'huge', label_fa: 'بیش‌ازحد', length_mm: 3000, qty: 1 },
                     { id: 'ok', length_mm: 500, qty: 1 }], { bar_length_mm: 2500 });
  assert(r.ok, 'کل عملیات موفق (نه throw)');
  assert(r.oversized.length === 1 && r.oversized[0].id === 'huge', 'قطعهٔ بزرگ در oversized گزارش شد');
  assert(r.total_bars === 1 && r.bars[0].cuts.length === 1, 'قطعهٔ معتبر دیگر همچنان نست شد');
}

console.log('\n[کرف صفر]');
{
  const r = LN.run([{ id: 'a', length_mm: 1250, qty: 2 }], { bar_length_mm: 2500, kerf_mm: 0 });
  assert(r.total_bars === 1 && r.bars[0].waste_mm === 0, 'بدون کرف، دقیقاً پر می‌شود');
}

console.log('\n[پیش‌فرض کرف = ۳ میلی‌متر وقتی داده نشود]');
{
  const withDefault = LN.run([{ id: 'a', length_mm: 1250, qty: 2 }], { bar_length_mm: 2500 });
  const explicit3 = LN.run([{ id: 'a', length_mm: 1250, qty: 2 }], { bar_length_mm: 2500, kerf_mm: 3 });
  assert(JSON.stringify(withDefault) === JSON.stringify(explicit3), 'پیش‌فرض کرف با کرف=۳ صریح یکی است');
}

console.log('\n[جبرگرایی — ترتیب ورودی روی نتیجه اثر ندارد]');
{
  const segs1 = [{ id: 'a', length_mm: 500, qty: 1 }, { id: 'b', length_mm: 1800, qty: 1 }, { id: 'c', length_mm: 300, qty: 1 }];
  const segs2 = [{ id: 'c', length_mm: 300, qty: 1 }, { id: 'a', length_mm: 500, qty: 1 }, { id: 'b', length_mm: 1800, qty: 1 }];
  const r1 = LN.run(segs1, { bar_length_mm: 2500, kerf_mm: 3 });
  const r2 = LN.run(segs2, { bar_length_mm: 2500, kerf_mm: 3 });
  assert(r1.total_bars === r2.total_bars, 'تعداد شاخه مستقل از ترتیب ورودی است');
  assert(JSON.stringify(r1.bars) === JSON.stringify(r2.bars), 'چیدمان کامل هم یکسان است (FFD قطعی)');
}

console.log('\n[qty پیش‌فرض = ۱ وقتی داده نشود]');
{
  const r = LN.run([{ id: 'a', length_mm: 500 }], { bar_length_mm: 2500 });
  assert(r.bars[0].cuts.length === 1, 'بدون qty یعنی یک عدد');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
