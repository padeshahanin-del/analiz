/** تست نوار لبهٔ رولی (مصرف واقعی + افت هر برش) — node test_edge_roll.js */
'use strict';
const R = require(require('path').join(__dirname, '..', '..', 'ui', 'kalaxa-edge-roll.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

console.log('\n[بدون snapshot/بدون قطعه]');
{
  assert(R.consumption(null).body_m === 0, 'null snapshot → صفر');
  assert(R.consumption({}).body_m === 0, 'بدون parts_flat → صفر');
  assert(R.consumption({ parts_flat: [] }).body_m === 0, 'آرایهٔ خالی → صفر');
}

console.log('\n[یک برش — افت پیش‌فرض ۵۰mm]');
{
  const snap = { parts_flat: [{ key: 'side', count: 1, cut_length_mm: 100, cut_width_mm: 500, edge: { front: 1 } }] };
  const res = R.consumption(snap);
  assert(res.waste_mm === 50, 'افت پیش‌فرض ۵۰mm');
  assert(res.body_m === 0.15, 'طول ۱۰۰mm + افت ۵۰mm = ۱۵۰mm = ۰٫۱۵m', String(res.body_m));
  assert(res.body_cuts === 1, 'یک برش ثبت شد');
  assert(res.door_m === 0, 'بدون درب → صفر درب');
}

console.log('\n[افت سفارشی]');
{
  const snap = { parts_flat: [{ key: 'side', count: 1, cut_length_mm: 1000, edge: { front: 1 } }] };
  const res = R.consumption(snap, 30);
  assert(res.waste_mm === 30, 'افت سفارشی اعمال شد');
  assert(res.body_m === 1.03, '۱۰۰۰mm + ۳۰mm = ۱٫۰۳m', String(res.body_m));
}

console.log('\n[چند ضلع روی یک قطعه — هر ضلع یک برش جدا]');
{
  const snap = { parts_flat: [{ key: 'side', count: 1, cut_length_mm: 100, cut_width_mm: 200,
    edge: { front: 1, back: 1, top: 1, bottom: 1 } }] };
  const res = R.consumption(snap, 50);
  // front+back از cut_length (۱۰۰+۵۰=۱۵۰ هرکدام)، top+bottom از cut_width (۲۰۰+۵۰=۲۵۰ هرکدام)
  assert(res.body_cuts === 4, '۴ برش (۴ ضلع)');
  assert(res.body_m === 0.8, '(۱۵۰+۱۵۰+۲۵۰+۲۵۰)mm = ۸۰۰mm = ۰٫۸m', String(res.body_m));
}

console.log('\n[count > 1 → ضرب در تعداد]');
{
  const snap = { parts_flat: [{ key: 'side', count: 3, cut_length_mm: 100, edge: { front: 1 } }] };
  const res = R.consumption(snap, 50);
  assert(res.body_cuts === 3, 'تعداد برش = count × اضلاع دارای نوار');
  assert(res.body_m === 0.45, '۳ × (۱۰۰+۵۰)mm = ۴۵۰mm = ۰٫۴۵m', String(res.body_m));
}

console.log('\n[تفکیک درب/بدنه — door و drawer_front به گروه درب می‌روند]');
{
  const snap = { parts_flat: [
    { key: 'door', count: 1, cut_length_mm: 700, edge: { front: 1 } },
    { key: 'drawer_front', count: 1, cut_length_mm: 500, edge: { front: 1 } },
    { key: 'side', count: 1, cut_length_mm: 300, edge: { front: 1 } }
  ] };
  const res = R.consumption(snap, 50);
  assert(res.door_cuts === 2, 'door + drawer_front → ۲ برش درب');
  assert(res.body_cuts === 1, 'side → ۱ برش بدنه');
  assert(res.door_m === 1.3, '(700+50 + 500+50)mm = 1300mm = 1.3m', String(res.door_m));
  assert(res.body_m === 0.35, '(300+50)mm = 350mm = 0.35m', String(res.body_m));
}

console.log('\n[بدون edge روی هیچ ضلع → بدون برش]');
{
  const snap = { parts_flat: [{ key: 'side', count: 5, cut_length_mm: 100, edge: {} }] };
  const res = R.consumption(snap);
  assert(res.body_cuts === 0 && res.body_m === 0, 'بدون edge تنظیم‌شده → مصرف صفر');
}

console.log('\n[جبرگرایی]');
{
  const snap = { parts_flat: [{ key: 'side', count: 2, cut_length_mm: 400, cut_width_mm: 200, edge: { front: 1, top: 1 } }] };
  const a = JSON.stringify(R.consumption(snap, 50));
  const b = JSON.stringify(R.consumption(snap, 50));
  assert(a === b, 'دو اجرای یکسان → خروجی یکسان');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
