/** تست پروفیل درب آلومینیومی/شیشه‌ای — node test_door_profile.js */
'use strict';
const path = require('path');
const DP = require(path.join(__dirname, '..', '..', 'ui', 'kalaxa-door-profile.js'));
const LN = require(path.join(__dirname, '..', '..', 'ui', 'kalaxa-linear-nesting.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

function snap(doorType, swing, count) {
  return {
    cabinets: [{ kalaxa_id: 'c1', label_fa: 'کابینت آزمون', category: 'base',
      params: { door_type: doorType, door_swing: swing } }],
    parts_flat: [{ part_uid: 'p1', cabinet_id: 'c1', key: 'door', count: count || 1,
      cut_length_mm: 700, cut_width_mm: 400 }]
  };
}

console.log('\n[دربی که نوعش آلومینیوم نیست — نادیده گرفته می‌شود]');
{
  const r = DP.segments(snap('mdf', 'right'));
  assert(r.door_count === 0, 'درب MDF معمولی وارد محاسبه نمی‌شود');
  assert(r.plain.length === 0 && r.handle.length === 0, 'بدون قطعه');
}

console.log('\n[درب شیشه‌ای با لولای مشخص — ۳ ساده + ۱ دستگیره]');
{
  const r = DP.segments(snap('glass_aluminum', 'right'));
  assert(r.door_count === 1, 'یک درب شمرده شد');
  assert(r.plain.length === 3, '۳ قطعهٔ ساده (۲ ریل + ۱ ستون لولا)', String(r.plain.length));
  assert(r.handle.length === 1, '۱ قطعهٔ دستگیره‌دار');
  assert(r.plain.filter(s => s.length_mm === 400).length === 2, 'ریل‌ها = عرض درب (۴۰۰)');
  assert(r.plain.some(s => s.length_mm === 700), 'ستون لولا = طول درب (۷۰۰)');
  assert(r.handle[0].length_mm === 700, 'ستون دستگیره هم = طول درب');
  assert(r.unknown_swing_count === 0, 'لولا مشخص بود — بدون هشدار');
}

console.log('\n[دومین نوع مجاز: mdf_aluminum_frame]');
{
  const r = DP.segments(snap('mdf_aluminum_frame', 'left'));
  assert(r.door_count === 1, 'این نوع هم شناخته می‌شود');
}

console.log('\n[بدون door_swing — دستگیره نامشخص، هر دو ستون ساده فرض می‌شود]');
{
  const r = DP.segments(snap('glass_aluminum', null));
  assert(r.door_count === 1, 'درب شمرده شد');
  assert(r.plain.length === 4, '۲ ریل + ۲ ستون همه ساده (کم‌تر از واقع تخمین نمی‌زند)', String(r.plain.length));
  assert(r.handle.length === 0, 'بدون قطعهٔ دستگیره‌دار چون سمتش معلوم نیست');
  assert(r.unknown_swing_count === 1, 'هشدار: یک درب با سمت نامشخص');
}

console.log('\n[count>1 — چند نمونه از یک درب]');
{
  const r = DP.segments(snap('glass_aluminum', 'right', 3));
  assert(r.door_count === 3, '۳ درب شمرده شد');
  assert(r.plain.length === 9 && r.handle.length === 3, 'قطعات به نسبت هر درب ضرب شدند');
}

console.log('\n[فهرست نوع درب سفارشی]');
{
  const r = DP.segments(snap('custom_alu', 'right'), ['custom_alu']);
  assert(r.door_count === 1, 'با فهرست سفارشی، نوع دیگری هم قابل تشخیص است');
  const r2 = DP.segments(snap('custom_alu', 'right')); // بدون فهرست سفارشی، پیش‌فرض استفاده می‌شود
  assert(r2.door_count === 0, 'بدون فهرست سفارشی، نوع ناشناخته نادیده گرفته می‌شود');
}

console.log('\n[یکپارچگی با نستینگ یک‌بعدی]');
{
  const big = { cabinets: [], parts_flat: [] };
  for (let i = 0; i < 5; i++) {
    big.cabinets.push({ kalaxa_id: 'c' + i, label_fa: 'د' + i, category: 'wall',
      params: { door_type: 'glass_aluminum', door_swing: i % 2 ? 'left' : 'right' } });
    big.parts_flat.push({ part_uid: 'p' + i, cabinet_id: 'c' + i, key: 'door', count: 1,
      cut_length_mm: 700, cut_width_mm: 400 });
  }
  const segs = DP.segments(big);
  const plainNest = LN.run(segs.plain, { bar_length_mm: 6000, kerf_mm: 3 });
  const handleNest = LN.run(segs.handle, { bar_length_mm: 3000, kerf_mm: 3 });
  assert(plainNest.ok && plainNest.total_bars > 0, 'نستینگ ساده روی خروجی segments کار می‌کند',
    JSON.stringify(plainNest.error));
  assert(handleNest.ok && handleNest.total_bars > 0, 'نستینگ دستگیره‌دار هم کار می‌کند');
}

console.log('\n[جبرگرایی]');
{
  const s = snap('glass_aluminum', 'right', 2);
  const a = JSON.stringify(DP.segments(s));
  const b = JSON.stringify(DP.segments(s));
  assert(a === b, 'دو اجرای یکسان → خروجی یکسان');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
