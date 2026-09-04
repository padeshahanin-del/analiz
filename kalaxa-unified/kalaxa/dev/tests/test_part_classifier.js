/** تست تشخیص خودکار نقش قطعات از هندسه — node test_part_classifier.js
 *
 * قوی‌ترین تست ممکن: خروجی واقعی موتور هندسهٔ Ruby (CabinetGeometry) را می‌دهیم و
 * می‌سنجیم کلاسیفایر همان نقشی را برمی‌گرداند که موتور ساخته بود (round-trip).
 * fixture با اجرای واقعی Ruby ساخته شده، نه دست‌نویس.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const UI = path.join(__dirname, '..', '..', 'ui');
const C = require(path.join(UI, 'kalaxa-part-classifier.js'));

const FIXTURE = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'geometry_boxes.json'), 'utf8'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

// یراق قطعهٔ چوبی نیست و در مدل کاربر ممکن است اصلاً نباشد — از round-trip جدا می‌شود.
const HARDWARE = new Set(['leg', 'handle', 'slide']);
function woodBoxes(tid) {
  return FIXTURE[tid]
    .filter(b => !HARDWARE.has(b.key))
    .map((b, i) => ({ id: b.key + ':' + i, name: b.key, x: b.x, y: b.y, z: b.z,
                      dx: b.dx, dy: b.dy, dz: b.dz }));
}

console.log('\n[ورودی خالی/نامعتبر]');
{
  assert(C.classify([]).parts.length === 0, 'آرایهٔ خالی → بدون قطعه');
  assert(C.classify(null).parts.length === 0, 'null → بدون خطا');
  const zero = C.classify([{ x: 0, y: 0, z: 0, dx: 0, dy: 10, dz: 10 }]);
  assert(zero.parts.length === 0, 'جعبهٔ با بُعد صفر نادیده گرفته می‌شود');
}

console.log('\n[thinAxis — محور نازک]');
{
  assert(C.thinAxis({ dx: 16, dy: 550, dz: 720 }) === 'x', 'دیواره → محور نازک x');
  assert(C.thinAxis({ dx: 768, dy: 550, dz: 16 }) === 'z', 'کف → محور نازک z');
  assert(C.thinAxis({ dx: 784, dy: 8, dz: 704 }) === 'y', 'پشت‌بند → محور نازک y');
}

console.log('\n[round-trip روی هر ۵ تمپلیت واقعی]');
Object.keys(FIXTURE).forEach(tid => {
  const boxes = woodBoxes(tid);
  const res = C.classify(boxes);
  let ok = 0, bad = [];
  res.parts.forEach(p => {
    // موتور 'top_bottom' می‌سازد؛ کلاسیفایر ممکن است سقف را 'top_bottom' و کف را
    // 'bottom' بگوید — هر دو از نظر معنایی درست‌اند.
    const expected = p.name;
    const same = p.role === expected ||
      (expected === 'top_bottom' && (p.role === 'bottom' || p.role === 'top_bottom'));
    if (same) ok++; else bad.push(`${expected}→${p.role}`);
  });
  assert(bad.length === 0, `${tid}: هر ${boxes.length} قطعه درست تشخیص داده شد`,
    bad.join(', '));
});

console.log('\n[تفکیک درب از نمای کشو — دام واقعی]');
{
  // درب تک ۸۰cm پهن‌تر از بلند است؛ قاعدهٔ سادهٔ «پهن=کشو» اشتباه بود.
  const single = C.classify(woodBoxes('base_single_door'));
  const doors = single.parts.filter(p => p.role === 'door');
  assert(doors.length === 1, 'درب تک با وجود پهن‌تر بودن، «درب» تشخیص داده شد',
    JSON.stringify(single.parts.filter(p => p.name === 'door').map(p => p.role)));

  const drw = C.classify(woodBoxes('base_three_drawer'));
  assert(drw.parts.filter(p => p.role === 'drawer_front').length === 3, '۳ نمای کشو');
  assert(drw.parts.filter(p => p.role === 'door').length === 0, 'هیچ نمای کشویی «درب» شمرده نشد');

  // درب دولنگهٔ قدی: هر لنگه ۵۰٪ ارتفاع → با نسبت ارتفاع تنها اشتباه می‌شد
  const tall = C.classify(woodBoxes('tall_double_door'));
  assert(tall.parts.filter(p => p.role === 'door').length === 2, 'درب دولنگهٔ قدی → ۲ درب');
}

console.log('\n[پشت‌بند شیارخورده — دام واقعی رواداری]');
{
  // پشت‌بند به‌خاطر شیار از کابینت باریک‌تر است (۷۸۴ در کابینت ۸۰۰)
  const res = C.classify(woodBoxes('base_single_door'));
  const back = res.parts.filter(p => p.role === 'back');
  assert(back.length === 1, 'پشت‌بند باریک‌تر از پوسته هم «پشت‌بند» تشخیص داده شد');
  assert(back[0].thickness_mm === 8, 'ضخامت پشت‌بند ۸mm خوانده شد', String(back[0].thickness_mm));
}

console.log('\n[پشت‌بند ۱۶میل سرتاسری — حالت واقعی کارگاه کاربر]');
{
  // کاربر: «تو بعضی یونیت‌ها به‌جای پشت‌بند ۸ یا ۳، ۱۶میل سرتاسری بدون شیار می‌زنیم»
  const boxes = [
    { id: 's1', name: 'side', x: 0, y: 0, z: 0, dx: 16, dy: 550, dz: 720 },
    { id: 's2', name: 'side', x: 784, y: 0, z: 0, dx: 16, dy: 550, dz: 720 },
    { id: 'b', name: 'bottom', x: 16, y: 0, z: 0, dx: 768, dy: 550, dz: 16 },
    { id: 'bk', name: 'back', x: 0, y: 534, z: 0, dx: 800, dy: 16, dz: 720 }
  ];
  const res = C.classify(boxes);
  const back = res.parts.find(p => p.id === 'bk');
  assert(back.role === 'back', 'پشت‌بند ۱۶میل سرتاسری هم «پشت‌بند» است', back.role);
  assert(back.confidence < 0.95, 'ولی اطمینانش کمتر است (چون نازک نیست) تا کاربر چک کند',
    String(back.confidence));
}

console.log('\n[قید ایستاده (مدل L کاربر)]');
{
  // کاربر: «یه قطعهٔ نازک پشت‌بالا مثلاً ۷ سانت» — تختهٔ ایستاده، نه خوابیده
  const boxes = [
    { id: 's1', name: 'side', x: 0, y: 0, z: 0, dx: 16, dy: 550, dz: 720 },
    { id: 's2', name: 'side', x: 784, y: 0, z: 0, dx: 16, dy: 550, dz: 720 },
    { id: 'b', name: 'bottom', x: 16, y: 0, z: 0, dx: 768, dy: 550, dz: 16 },
    { id: 'r', name: 'rail', x: 16, y: 534, z: 650, dx: 768, dy: 16, dz: 70 }
  ];
  const res = C.classify(boxes);
  const rail = res.parts.find(p => p.id === 'r');
  assert(rail.role === 'rail_top', 'تختهٔ ایستادهٔ ۷سانتی پشت‌بالا → قید', rail.role);
}

console.log('\n[هشدارها و اطمینان]');
{
  const res = C.classify(woodBoxes('base_single_door'));
  assert(res.parts.every(p => p.confidence > 0 && p.confidence <= 1), 'اطمینان بین ۰ و ۱');
  assert(res.bounds.w === 800 && res.bounds.h === 720, 'محدودهٔ کابینت درست محاسبه شد');

  const weird = C.classify([{ id: 'x', x: 0, y: 0, z: 0, dx: 100, dy: 100, dz: 100 }]);
  assert(weird.parts[0].role === 'unknown', 'مکعب ضخیم → نامشخص');
  assert(weird.warnings.some(w => /تشخیص داده نشد/.test(w)), 'هشدار قطعهٔ نامشخص');
  assert(weird.warnings.some(w => /دیواره/.test(w)), 'هشدار نبودِ دیواره');
}

console.log('\n[ابعاد برش استخراج‌شده]');
{
  const res = C.classify(woodBoxes('base_single_door'));
  const side = res.parts.find(p => p.role === 'side');
  assert(side.thickness_mm === 16, 'ضخامت دیواره ۱۶');
  assert(side.cut_length_mm === 720 && side.cut_width_mm === 550,
    'ابعاد برش دیواره ۷۲۰×۵۵۰', side.cut_length_mm + 'x' + side.cut_width_mm);
}

console.log('\n[قوانین آنالیز از تنظیمات — خواستهٔ «همه قوانین قابل تنظیم»]');
{
  const Settings = require(path.join(UI, 'kalaxa-settings.js'));
  const d = Settings.defaults();
  assert(d.project.analysis_rules && typeof d.project.analysis_rules === 'object',
    'پیش‌فرض analysis_rules در تنظیمات هست');
  Object.keys(C.DEFAULTS).forEach(k => {
    // بعضی آستانه‌ها فهرست‌اند (مثل نام‌های یراق) — مقایسهٔ مرجع همیشه نابرابر
    // است و تست را الکی قرمز می‌کند. مقایسهٔ محتوایی همان قرارداد را می‌سنجد.
    const same = (C.DEFAULTS[k] && typeof C.DEFAULTS[k] === 'object')
      ? JSON.stringify(d.project.analysis_rules[k]) === JSON.stringify(C.DEFAULTS[k])
      : d.project.analysis_rules[k] === C.DEFAULTS[k];
    assert(same,
      'آستانهٔ ' + k + ' در تنظیمات با پیش‌فرض موتور یکی است',
      d.project.analysis_rules[k] + ' != ' + C.DEFAULTS[k]);
  });

  const bad = Settings.defaults(); bad.project.analysis_rules.edge_tolerance_mm = -1;
  assert(!Settings.validate(bad).ok, 'رواداری منفی رد می‌شود');
  const bad2 = Settings.defaults(); bad2.project.analysis_rules.nearly_full_ratio = 1.5;
  assert(!Settings.validate(bad2).ok, 'نسبت بزرگ‌تر از ۱ رد می‌شود');
  const okS = Settings.defaults(); okS.project.analysis_rules.drawer_front_max_height_ratio = 0.55;
  assert(Settings.validate(okS).ok, 'نسبت معتبر پذیرفته می‌شود', Settings.validate(okS).errors.join('|'));

  // اثر واقعی: آستانه فقط تزئینی نیست — با بازنویسی، تشخیص عوض می‌شود
  const overridden = C.classify(woodBoxes('base_single_door'),
    { drawer_front_max_height_ratio: 0.999 });
  assert(overridden.parts.some(p => p.role === 'drawer_front'),
    'با آستانهٔ بازنویسی‌شده تشخیص واقعاً عوض می‌شود (تنظیمات اثر دارد)');
}

console.log('\n[جبرگرایی]');
{
  const b = woodBoxes('base_single_door');
  assert(JSON.stringify(C.classify(b)) === JSON.stringify(C.classify(b)), 'دو اجرا → یکسان');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
