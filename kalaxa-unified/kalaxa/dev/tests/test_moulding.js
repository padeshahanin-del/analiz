/** تست قرنیز/مولدینگ مستقل (ورودی دستی صفحه) — node test_moulding.js */
'use strict';
const M = require(require('path').join(__dirname, '..', '..', 'ui', 'kalaxa-moulding.js'));
const LN = require(require('path').join(__dirname, '..', '..', 'ui', 'kalaxa-linear-nesting.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

console.log('\n[بدون ورودی — بدون قطعه]');
{
  assert(M.segments([]).length === 0, 'آرایهٔ خالی → بدون قطعه');
  assert(M.segments(null).length === 0, 'null → بدون خطا، بدون قطعه');
}

console.log('\n[یک صفحه با ۲ برگشت — جلو + دو قطعهٔ برگشت]');
{
  const segs = M.segments([{ id: 'b1', label_fa: 'کانتر اصلی', length_mm: 3000, width_mm: 600, returns: 2 }]);
  const front = segs.find(s => s.id === 'b1:front');
  const ret = segs.find(s => s.id === 'b1:return');
  assert(front && front.length_mm === 3000, 'قطعهٔ جلو = طول صفحه');
  assert(ret && ret.length_mm === 600 && ret.qty === 2, 'قطعهٔ برگشت = عرض صفحه، به تعداد returns');
}

console.log('\n[بدون برگشت — فقط جلو]');
{
  const segs = M.segments([{ label_fa: 'x', length_mm: 2000, width_mm: 600, returns: 0 }]);
  assert(segs.length === 1, 'فقط یک قطعه (جلو)');
}

console.log('\n[برچسب پیش‌فرض وقتی label_fa نیست]');
{
  const segs = M.segments([{ length_mm: 1000, width_mm: 500, returns: 1 }]);
  assert(segs[0].label_fa.indexOf('صفحه ۱') !== -1 || segs[0].label_fa.indexOf('صفحه 1') !== -1,
    'برچسب پیش‌فرض ساخته شد', segs[0].label_fa);
}

console.log('\n[چند صفحه هم‌زمان]');
{
  const segs = M.segments([
    { id: 'b1', label_fa: 'آ', length_mm: 3000, width_mm: 600, returns: 1 },
    { id: 'b2', label_fa: 'ب', length_mm: 1500, width_mm: 600, returns: 2 }
  ]);
  assert(segs.filter(s => s.id.indexOf('b1') === 0).length === 2, 'صفحهٔ اول: جلو + برگشت');
  assert(segs.filter(s => s.id.indexOf('b2') === 0).length === 2, 'صفحهٔ دوم: جلو + برگشت');
}

console.log('\n[length_mm صفر/نامعتبر — نادیده گرفته می‌شود]');
{
  const segs = M.segments([{ length_mm: 0, width_mm: 600, returns: 1 }]);
  assert(segs.length === 1 && segs[0].id.indexOf(':return') !== -1, 'بدون طول جلو، فقط برگشت (اگر عرض معتبر باشد)');
}

console.log('\n[یکپارچگی با نستینگ یک‌بعدی]');
{
  const segs = M.segments([{ id: 'b1', label_fa: 'کانتر', length_mm: 3000, width_mm: 600, returns: 2 }]);
  const res = LN.run(segs, { bar_length_mm: 2500, kerf_mm: 3 });
  assert(res.ok, 'نستینگ موفق روی خروجی segments');
  assert(res.oversized.length === 1, 'قطعهٔ جلوی ۳۰۰۰mm بلندتر از شاخهٔ ۲۵۰۰mm → در oversized (نه throw)');
  assert(res.total_bars === 1, 'دو قطعهٔ برگشت (۶۰۰mm) در یک شاخهٔ ۲۵۰۰mm جا می‌شوند', String(res.total_bars));
}

console.log('\n[جبرگرایی]');
{
  const boards = [{ id: 'b1', label_fa: 'x', length_mm: 3000, width_mm: 600, returns: 2 }];
  const a = JSON.stringify(M.segments(boards));
  const b = JSON.stringify(M.segments(boards));
  assert(a === b, 'دو اجرای یکسان → خروجی یکسان');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
