/** تبدیل کابینت آنالیزشده به پارامتریک — node test_adopt.js
 *
 * کاربر: «اونی که آنالیز کردم رو می‌خوام جزو کابینت‌های در حال ساختم باشه که
 * بتونم اندازه رو تغییر بدم».
 *
 * خطرِ اصلی این قابلیت **سکوت** است: اگر ابعاد را کمی غلط حدس بزند و بی‌صدا
 * بسازد، کاربر یک کابینت غلط دارد و نمی‌داند. پس تست‌ها دو چیز را می‌سنجند:
 * عددها درست باشند، و هرچه واقعاً حدس بوده صریح اعلام شود.
 */
'use strict';
const path = require('path');
const UI = path.join(__dirname, '..', '..', 'ui');
const C = require(path.join(UI, 'kalaxa-part-classifier.js'));
const A = require(path.join(UI, 'kalaxa-adopt.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

function b(name, x, y, z, dx, dy, dz) {
  return { id: name + x + z, name: name, x: x, y: y, z: z, dx: dx, dy: dy, dz: dz };
}

// کابینت زمینی ۹۰۰×۷۲۰×۵۵۰ با درب ۱۸ روی بدنهٔ ۱۶
const BASE = [
  b('دیواره [side]', 0, 0, 0, 16, 550, 720),
  b('دیواره [side]', 884, 0, 0, 16, 550, 720),
  b('کف [bottom]', 16, 0, 0, 868, 550, 16),
  b('سقف [top_bottom]', 16, 0, 704, 868, 550, 16),
  b('پشت‌بند [back]', 16, 542, 16, 868, 8, 688),
  b('طبقه [shelf]', 16, 10, 352, 868, 530, 16),
  b('درب [door]', 0, -18, 0, 900, 18, 720)
];

function adopt(boxes, opts) {
  const r = C.classify(boxes);
  return A.infer(r.parts, r.bounds, opts);
}

console.log('ابعاد از قطعات درمی‌آید');
{
  const a = adopt(BASE);
  assert(a.ready, 'تبدیل آماده است');
  assert(a.width_cm === 90, 'عرض ۹۰', String(a.width_cm));
  assert(a.height_cm === 72, 'ارتفاع ۷۲', String(a.height_cm));
}

console.log('عمق درب را حساب نمی‌کند');
{
  // درب ۱۸ میلی جلوی کابینت می‌ایستد. اگر در عمق بیاید، هر تبدیل کابینت را
  // ۱٫۸ سانت عمیق‌تر می‌سازد و تبدیلِ بعدی باز هم عمیق‌تر — خطای انباشتی.
  const a = adopt(BASE);
  assert(a.depth_cm === 55, 'عمق ۵۵ است نه ۵۶٫۸', String(a.depth_cm));
  assert(a.notes.some(n => n.indexOf('عمق') !== -1), 'و علتش گفته می‌شود');
}

console.log('ضخامت‌ها از قطعات، نه از پیش‌فرض');
{
  const a = adopt(BASE);
  assert(a.opts.body_thickness_mm === 16, 'ضخامت بدنه ۱۶');
  assert(a.opts.back_thickness_mm === 8, 'ضخامت پشت‌بند ۸');
  assert(a.opts.door_thickness_mm === 18,
         'ضخامت درب ۱۸ — تبدیل نباید بی‌صدا نازکش کند', String(a.opts.door_thickness_mm));

  // بدنهٔ ۱۸ میلی هم باید خوانده شود، نه اینکه همیشه ۱۶ بدهد
  const thick = BASE.map(p => p.name.indexOf('دیواره') === 0
    ? Object.assign({}, p, { dx: 18 }) : p);
  assert(adopt(thick).opts.body_thickness_mm === 18,
         'کارگاهی که ۱۸ کار می‌کند ۱۸ می‌گیرد');
}

console.log('شمارش داخلی');
{
  assert(adopt(BASE).opts.shelf_count === 1, 'یک طبقه شمرده می‌شود');
  const two = BASE.concat([b('طبقه [shelf]', 16, 10, 200, 868, 530, 16)]);
  assert(adopt(two).opts.shelf_count === 2, 'دو طبقه هم درست شمرده می‌شود');
}

console.log('تمپلیت از ترکیب قطعات، نه از ابعاد');
{
  // کشویی: سه نمای روی‌هم
  const drawers = BASE.filter(p => p.name.indexOf('درب') !== 0).concat([
    b('نما', 0, -18, 10, 900, 18, 220),
    b('نما', 0, -18, 240, 900, 18, 220),
    b('نما', 0, -18, 470, 900, 18, 220)
  ]);
  const d = adopt(drawers);
  assert(d.template_id === 'base_three_drawer', 'سه نمای روی‌هم → کشویی', d.template_id);
  assert(d.opts.drawer_count === 3, 'تعداد کشو درست شمرده می‌شود', String(d.opts.drawer_count));

  // قدی: همان ترکیب ولی بلند
  const tall = BASE.map(p => Object.assign({}, p, {
    dz: p.dz > 100 ? 2000 : p.dz
  }));
  assert(adopt(tall).template_id === 'tall_double_door', 'ارتفاع بلند → قدی',
         adopt(tall).template_id);

  // دیواری: کم‌عمق. عمق را باید **کل کابینت** کم کرد، نه فقط dy هر قطعه —
  // نسخهٔ اول این تست فقط dy را کوچک کرد و y پشت‌بند سر جای ۵۴۲ ماند، پس
  // کابینت اصلاً کم‌عمق نشد و تست الکی قرمز شد. اشکال از تست بود نه کد.
  const wall = [
    b('دیواره [side]', 0, 0, 0, 16, 320, 700),
    b('دیواره [side]', 584, 0, 0, 16, 320, 700),
    b('کف [bottom]', 16, 0, 0, 568, 320, 16),
    b('سقف [top_bottom]', 16, 0, 684, 568, 320, 16),
    b('پشت‌بند [back]', 16, 312, 16, 568, 8, 668),
    b('درب [door]', 0, -18, 0, 600, 18, 700)
  ];
  assert(adopt(wall).template_id === 'wall_single_door', 'کم‌عمق → دیواری',
         adopt(wall).template_id + ' عمق=' + adopt(wall).depth_cm);
}

console.log('حدس‌ها پنهان نمی‌شوند');
{
  // کابینت بدون پشت‌بند: ضخامتش را نمی‌شود دانست
  const noBack = BASE.filter(p => p.name.indexOf('پشت‌بند') !== 0);
  const a = adopt(noBack);
  assert(a.opts.back_thickness_mm === 8, 'پیش‌فرض می‌گیرد');
  assert(a.guesses.some(g => g.indexOf('پشت‌بند') !== -1),
         'ولی صریح می‌گوید که حدس زده', JSON.stringify(a.guesses));
}

console.log('اطمینان پایین منتقل می‌شود');
{
  // یک تودهٔ بی‌شکل: کلاسیفایر مطمئن نیست، تبدیل هم نباید مطمئن باشد
  const vague = [b('چیزی', 0, 0, 0, 300, 300, 300), b('چیز دیگر', 400, 0, 0, 300, 300, 300)];
  const a = adopt(vague);
  assert(a.confidence < 0.8, 'اطمینان پایین گزارش می‌شود', String(a.confidence));
  assert(a.notes.some(n => n.indexOf('دیواره') !== -1),
         'و گفته می‌شود که دیواره‌ای پیدا نشد');
}

console.log('یراق در ابعاد دخالت نمی‌کند');
{
  // یک دستگیره ۳۵ میلی جلوتر از درب. اگر در ابعاد بیاید عمق غلط می‌شود.
  const withHw = BASE.concat([b('دستگیره', 400, -53, 300, 120, 35, 20)]);
  assert(adopt(withHw).depth_cm === 55, 'دستگیره عمق را جابه‌جا نمی‌کند',
         String(adopt(withHw).depth_cm));
}

console.log('حالت‌های خالی');
{
  assert(A.infer([], null).ready === false, 'ورودی خالی تبدیل نمی‌سازد');
  assert(A.infer(null, null).ready === false, 'null نباید بشکند');
  assert((A.infer([], null).notes || []).length > 0, 'و علتش گفته می‌شود');
}

console.log('\n' + passed + ' گذشت، ' + failed + ' افتاد');
process.exit(failed ? 1 : 0);
