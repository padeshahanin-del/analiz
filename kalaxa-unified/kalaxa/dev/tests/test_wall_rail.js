/** تست ریل کمد دیواری (ساده/لبه‌دار + کیت برند) — node test_wall_rail.js */
'use strict';
const WR = require(require('path').join(__dirname, '..', '..', 'ui', 'kalaxa-wall-rail.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

function cab(id, rail, width) {
  return { kalaxa_id: id, label_fa: 'کمد ' + id, category: 'wall',
    params: { cabinet_width: width || 80, wall_rail_type: rail } };
}

console.log('\n[بدون wall_rail_type — نادیده گرفته می‌شود]');
{
  const r = WR.collect({ cabinets: [cab('c1', null)] });
  assert(r.cut.plain.length === 0 && r.cut.edged.length === 0, 'بدون قطعهٔ برشی');
  assert(Object.keys(r.kits).length === 0, 'بدون کیت');
}

console.log('\n[ریل ساده و لبه‌دار — دو SKU جدا]');
{
  const r = WR.collect({ cabinets: [cab('c1', 'plain', 80), cab('c2', 'edged', 60)] });
  assert(r.cut.plain.length === 1 && r.cut.plain[0].length_mm === 800, 'ریل ساده = عرض کمد (mm)');
  assert(r.cut.edged.length === 1 && r.cut.edged[0].length_mm === 600, 'ریل لبه‌دار جدا از ساده');
}

console.log('\n[کیت برند — قیمت ثابت به‌ازای هر کمد، نه طول]');
{
  const r = WR.collect({ cabinets: [cab('c1', 'blum'), cab('c2', 'blum'), cab('c3', 'fantoni')] });
  assert(r.kits.blum === 2, 'دو کمد بلوم شمرده شد');
  assert(r.kits.fantoni === 1, 'یک کمد فانتونی جدا شمرده شد');
  assert(!('meleni' in r.kits), 'ملونی که استفاده نشده در نتیجه نیست');
  assert(r.cut.plain.length === 0 && r.cut.edged.length === 0, 'کیت‌ها وارد لیست برشی نمی‌شوند');
}

console.log('\n[ترکیب هر دو مدل هم‌زمان]');
{
  const r = WR.collect({ cabinets: [cab('c1', 'plain'), cab('c2', 'blum'), cab('c3', 'meleni')] });
  assert(r.cut.plain.length === 1, 'یک ریل ساده');
  assert(r.kits.blum === 1 && r.kits.meleni === 1, 'دو کیت برند جدا');
}

console.log('\n[عرض صفر/نامعتبر — نادیده گرفته می‌شود، نه NaN]');
{
  const r = WR.collect({ cabinets: [{ kalaxa_id: 'c1', label_fa: 'x', params: { wall_rail_type: 'plain' } }] });
  assert(r.cut.plain.length === 0, 'بدون عرض معتبر، قطعه ساخته نمی‌شود');
}

console.log('\n[جبرگرایی]');
{
  const snap = { cabinets: [cab('c1', 'plain', 80), cab('c2', 'blum')] };
  const a = JSON.stringify(WR.collect(snap));
  const b = JSON.stringify(WR.collect(snap));
  assert(a === b, 'دو اجرای یکسان → خروجی یکسان');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
