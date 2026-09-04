/** یراق نباید «قطعهٔ نامشخص» گزارش شود — node test_hardware_role.js
 *
 * کاربر کابینت واقعی‌اش را اسکن کرد و در جدول دو سطر «lola» با نقش «نامشخص»
 * دید. لولا از هندسه قابل تشخیص نیست — یک جعبهٔ کوچک است، دقیقاً مثل یک تکه
 * ورق — پس نام تنها سرنخ صادقانه است. اگر «نامشخص» بماند دو خطر دارد:
 * کاربر فکر می‌کند تشخیص شکست خورده، و اگر روزی برش‌خور از آن بسازیم، ورق
 * الکی سفارش می‌رود.
 */
'use strict';
const path = require('path');
const C = require(path.join(__dirname, '..', '..', 'ui', 'kalaxa-part-classifier.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

function box(name, x, y, z, dx, dy, dz) {
  return { id: name + ':' + x, name: name, x: x, y: y, z: z, dx: dx, dy: dy, dz: dz };
}

// کابینتی که کاربر واقعاً داشت: پوسته + دو لولا
function cabinet(extra) {
  return [
    box('دیوارهٔ چپ', 0, 0, 0, 16, 550, 720),
    box('دیوارهٔ راست', 884, 0, 0, 16, 550, 720),
    box('کف', 16, 0, 0, 868, 550, 16),
    box('سقف', 16, 0, 704, 868, 550, 16),
    box('پشت‌بند', 16, 545, 16, 868, 5, 688),
    box('درب', 0, -18, 0, 900, 18, 720)
  ].concat(extra || []);
}

console.log('یراق');
{
  const r = C.classify(cabinet([box('lola', 20, 20, 100, 30, 60, 12),
                                box('lola', 20, 20, 600, 30, 60, 12)]));
  const hw = r.parts.filter(p => p.role === 'hardware');
  assert(hw.length === 2, 'دو لولا یراق شناخته می‌شوند', JSON.stringify(r.parts.map(p => p.role)));
  assert(hw.every(p => p.role_label_fa === 'یراق'), 'برچسب فارسی «یراق» است');
  assert(r.parts.filter(p => p.role === 'unknown').length === 0,
         'هیچ قطعه‌ای نامشخص نمی‌ماند');
  assert(r.warnings.some(w => w.indexOf('یراق') !== -1), 'به کاربر گفته می‌شود');
  assert(!r.warnings.some(w => w.indexOf('نامشخص') !== -1), 'هشدار الکی «نامشخص» نمی‌دهد');
}

console.log('نام فارسی و انگلیسی هر دو');
{
  const r = C.classify(cabinet([box('لولا آرام‌بند', 20, 20, 100, 30, 60, 12),
                                box('Hinge-165', 20, 20, 600, 30, 60, 12),
                                box('ریل کشو', 30, 10, 300, 20, 500, 45)]));
  assert(r.parts.filter(p => p.role === 'hardware').length === 3,
         'الگو باید داخل نام هم پیدا شود، نه فقط برابری کامل');
}

console.log('پوسته از یراق آسیب نمی‌بیند');
{
  // دستگیره ۳۵ میلی جلوتر از درب می‌ایستد. اگر در پوسته حساب شود، صفحهٔ جلو
  // جابه‌جا می‌شود و درب دیگر «چسبیده به جلو» نیست — یعنی همهٔ تشخیص‌ها می‌ریزد.
  const withHandle = C.classify(cabinet([box('دستگیره', 400, -53, 300, 120, 35, 20)]));
  const clean = C.classify(cabinet());
  assert(withHandle.bounds.y0 === clean.bounds.y0,
         'مرز جلوی پوسته با افزودن دستگیره تغییر نمی‌کند',
         withHandle.bounds.y0 + ' vs ' + clean.bounds.y0);
  const door = withHandle.parts.find(p => p.name === 'درب');
  assert(door.role === 'door', 'درب همچنان درب است', door.role + ' / ' + door.reason);
}

console.log('قابل تنظیم برای کارگاه');
{
  const r = C.classify(cabinet([box('قبضه', 20, 20, 100, 30, 60, 12)]),
                       { hardware_name_patterns: ['قبضه'] });
  assert(r.parts.some(p => p.role === 'hardware'),
         'کارگاه می‌تواند واژهٔ خودش را اضافه کند');
}

console.log('بدون یراق چیزی عوض نمی‌شود');
{
  const r = C.classify(cabinet());
  assert(r.parts.every(p => p.role !== 'hardware'), 'قطعهٔ چوبی یراق شمرده نمی‌شود');
  assert(!r.warnings.some(w => w.indexOf('یراق') !== -1), 'هشدار یراق الکی نمی‌آید');
}

console.log('\n' + passed + ' گذشت، ' + failed + ' افتاد');
process.exit(failed ? 1 : 0);
