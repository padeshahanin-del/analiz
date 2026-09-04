/** نام قطعه + تعداد + یراقِ بی‌اندازه — node test_name_and_qty.js
 *
 * کاربر جدول اسکنِ کابینت واقعی‌اش را دید و گفت: «یراق که سایز نداره»،
 * «تعداد باید مشخص باشه یعنی تکراری نباشه»، «یکم باید سیستم دقیق‌تر ببینه»،
 * «خیلی قابل اعتماد به نظر نمی‌رسه».
 *
 * ریشهٔ بی‌دقتی این بود که مدل **خودش نام قطعات را دارد** — «sheet back»،
 * «sheet up»، «Body Left» — و ما همه را دور می‌ریختیم و فقط از هندسه حدس
 * می‌زدیم؛ نتیجه اینکه قطعه‌ای به‌نام «sheet back» با اطمینان ۸۵٪ «قید»
 * گزارش می‌شد. نام و هندسه دو شاهد مستقل‌اند و هر دو باید حرف بزنند.
 */
'use strict';
const path = require('path');
const C = require(path.join(__dirname, '..', '..', 'ui', 'kalaxa-part-classifier.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}
function b(name, x, y, z, dx, dy, dz) {
  return { id: name + ':' + x + ':' + z, name: name, x: x, y: y, z: z, dx: dx, dy: dy, dz: dz };
}

// کابینت واقعی کاربر، با همان نام‌ها و ابعادی که در جدولش دیده شد
const REAL = [
  b('sheet Body Left Gas', 0, 0, 0, 16, 550, 772),
  b('sheet Body Right Gas', 884, 0, 0, 16, 550, 772),
  b('sheet down Gas', 0, 0, 0, 900, 550, 16),
  b('sheet up', 16, 0, 756, 868, 100, 16),
  b('sheet back 8 mm', 10, 540, 20, 880, 8, 750),
  b('لولا 16 میل روکاری آرام‌بند 110 درجه', 20, 20, 100, 57, 81, 33),
  b('لولا 16 میل روکاری آرام‌بند 110 درجه', 20, 20, 300, 57, 81, 33),
  b('لولا 16 میل روکاری آرام‌بند 110 درجه', 20, 20, 500, 57, 81, 33),
  b('لولا 16 میل روکاری آرام‌بند 110 درجه', 20, 20, 700, 57, 81, 33)
];

console.log('نام قطعه شاهد است، نه زباله');
{
  const r = C.classify(REAL);
  const by = {};
  r.parts.forEach(p => { by[p.name] = p; });
  assert(by['sheet Body Left Gas'].role === 'side', 'Body Left → دیواره');
  assert(by['sheet down Gas'].role === 'bottom', 'sheet down → کف');
  assert(by['sheet back 8 mm'].role === 'back', 'sheet back → پشت‌بند',
         by['sheet back 8 mm'].role);
  assert(by['sheet Body Left Gas'].confidence > 0.9,
         'توافق نام و هندسه اطمینان را بالا می‌برد');
  assert(by['sheet down Gas'].reason.indexOf('نام و هندسه') !== -1,
         'دلیل می‌گوید هر دو شاهد موافق‌اند');
}

console.log('اختلاف نام و هندسه پنهان نمی‌شود');
{
  // قطعه‌ای به‌نام «sheet back» که در جای قید نشسته — دقیقاً موردی که در جدول
  // کاربر با اطمینان ۸۵٪ «قید» اعلام شده بود، انگار هیچ تردیدی نیست.
  const r = C.classify(REAL.concat([b('sheet back', 16, 450, 756, 868, 100, 16)]));
  const p = r.parts.find(q => q.name === 'sheet back');
  assert(p.confidence <= 0.5, 'اطمینان باید بیفتد، نه اینکه ۸۵٪ بماند', String(p.confidence));
  assert(p.reason.indexOf('اختلاف') !== -1, 'به کاربر گفته می‌شود که دو شاهد نمی‌خوانند');
  assert(p.name_role === 'back', 'حدسِ نام هم نگه داشته می‌شود تا جدول هر دو را بگوید');
  assert(r.warnings.some(w => w.indexOf('نمی‌خواند') !== -1), 'در هشدارها هم می‌آید');
}

console.log('یراق اندازهٔ برش ندارد');
{
  const hw = C.classify(REAL).parts.filter(p => p.role === 'hardware');
  assert(hw.length === 4, 'چهار لولا');
  assert(hw.every(p => p.cut_length_mm === null && p.cut_width_mm === null &&
                       p.thickness_mm === null),
         '«۵۷×۸۱ ضخامت ۳۳» برای یک لولا فقط گمراهی است');
  assert(hw.every(p => p.box && p.box.dx === 57),
         'ولی اندازهٔ خام می‌ماند — اگر کاربر نقش را عوض کرد از دست نرود');
}

console.log('تکراری‌ها یک ردیف با تعداد می‌شوند');
{
  const g = C.group(C.classify(REAL).parts);
  const lola = g.find(p => p.name.indexOf('لولا') === 0);
  assert(lola.qty === 4, 'چهار لولا = یک ردیف ×۴', String(lola.qty));
  assert(lola.ids.length === 4, 'شناسهٔ همهٔ اعضا می‌ماند تا اصلاح دسته‌جمعی شود');
  assert(g.length === 5, 'نُه قطعه → پنج ردیف', String(g.length));
  assert(g.reduce((s, p) => s + p.qty, 0) === 9, 'هیچ قطعه‌ای در ادغام گم نمی‌شود');

  // کاربر: «دیوارهٔ چپ و راست یک سایز هست، تعداد زیاد شود». نام نباید دو
  // قطعهٔ هم‌نقش و هم‌اندازه را در سفارش از هم جدا کند.
  const sides = g.find(p => p.role === 'side');
  assert(sides.qty === 2, 'چپ و راست یک ردیف ×۲ می‌شوند', String(sides.qty));
  assert(sides.names.length === 2 && sides.name.indexOf('+') !== -1,
         'ولی هر دو نام دیده می‌شود تا اگر ادغام اشتباه بود معلوم شود', sides.name);
}

console.log('قطعهٔ کار ماشین‌دار ادغام نمی‌شود — «اگر یک نقشه باشد»');
{
  // دیوارهٔ چپ و راست هم‌اندازه‌اند ولی **قرینه**: سوراخ لولا در دو طرف مخالف
  // است. ادغامشان یعنی یک نقشهٔ CNC برای دو قطعهٔ متفاوت، و قطعهٔ دوم اشتباه
  // سوراخ می‌شود. اندازه یکی است، نقشه یکی نیست.
  const mirrored = [
    Object.assign(b('Body Left', 0, 0, 0, 16, 550, 772), { machined: true, solid_ratio: 0.97 }),
    Object.assign(b('Body Right', 884, 0, 0, 16, 550, 772), { machined: true, solid_ratio: 0.97 })
  ];
  const g = C.group(C.classify(mirrored).parts);
  assert(g.length === 2, 'دو نقشهٔ جدا، نه یک ردیف ×۲', String(g.length));

  // ولی وقتی کار ماشین ندارند، هم‌اندازه یعنی یک کالا
  const plain = C.group(C.classify([b('Body Left', 0, 0, 0, 16, 550, 772),
                                    b('Body Right', 884, 0, 0, 16, 550, 772)]).parts);
  assert(plain.length === 1 && plain[0].qty === 2,
         'بدون کار ماشین، هم‌اندازه = یک کالا ×۲');
}

console.log('ادغام نباید قطعات نامساوی را قاطی کند');
{
  const parts = C.classify([
    b('طبقه', 20, 10, 200, 860, 500, 16),
    b('طبقه', 20, 10, 400, 860, 500, 16),
    b('طبقه', 20, 10, 600, 700, 500, 16),   // همان نام، ابعاد متفاوت
    b('دیوارهٔ چپ', 0, 0, 0, 16, 550, 720),
    b('دیوارهٔ راست', 884, 0, 0, 16, 550, 720)
  ]).parts;
  const g = C.group(parts);
  const shelves = g.filter(p => p.name === 'طبقه');
  assert(shelves.length === 2, 'دو اندازهٔ متفاوت = دو ردیف، وگرنه سفارش غلط می‌رود');
  assert(shelves.some(p => p.qty === 2) && shelves.some(p => p.qty === 1),
         'تعدادها درست تقسیم می‌شوند');
}

console.log('اطمینانِ ردیفِ ادغام‌شده = کمترینِ اعضا');
{
  const parts = [
    { id: 'a', name: 'x', role: 'shelf', confidence: 0.9, reason: 'خوب',
      cut_length_mm: 100, cut_width_mm: 50, thickness_mm: 16, machined: false },
    { id: 'b', name: 'x', role: 'shelf', confidence: 0.4, reason: 'مشکوک',
      cut_length_mm: 100, cut_width_mm: 50, thickness_mm: 16, machined: false }
  ];
  const g = C.group(parts);
  assert(g.length === 1 && g[0].confidence === 0.4,
         'میانگین، عضو مشکوک را پشت عضو سالم پنهان می‌کند');
  assert(g[0].reason === 'مشکوک', 'دلیلِ همان عضوِ مشکوک نمایش داده می‌شود');
}

console.log('مرز واژه — الگوی کوتاه نباید داخل واژهٔ دیگر گیر کند');
{
  const r = C.classify([
    b('group frame', 0, 0, 0, 16, 550, 720),      // «up» داخل «group» نیست
    b('legacy panel', 884, 0, 0, 16, 550, 720),   // «leg» داخل «legacy» نیست
    b('drawer_side', 100, 100, 100, 16, 400, 120) // زیرخط = فاصله
  ]).parts;
  assert(r[0].role === 'side', 'group ≠ up', r[0].role + '/' + r[0].reason);
  assert(r[1].role !== 'hardware', 'legacy ≠ leg', r[1].role);
  assert(r[2].role === 'drawer_side', 'drawer_side ≠ side', r[2].role);
}

console.log('قابل تنظیم — واژهٔ کارگاه خودش');
{
  // «بادخور»/«عاصف» جای «قید» — قطعه‌ای در میانهٔ کابینت که هندسه نمی‌شناسدش.
  const boxes = REAL.concat([b('عاصف میانی', 300, 200, 400, 16, 100, 100)]);
  const plain = C.classify(boxes).parts.find(p => p.name === 'عاصف میانی');
  assert(plain.role === 'unknown', 'بدون واژه‌نامه، هندسه به‌تنهایی نمی‌شناسد', plain.role);

  const tuned = C.classify(boxes, {
    role_name_patterns: Object.assign({}, C.DEFAULTS.role_name_patterns,
                                      { rail_top: ['قید', 'عاصف'] })
  }).parts.find(p => p.name === 'عاصف میانی');
  assert(tuned.role === 'rail_top', 'با واژهٔ کارگاه شناخته می‌شود', tuned.role);
  assert(tuned.reason.indexOf('عاصف') !== -1, 'دلیل می‌گوید از روی کدام واژه');
}

console.log('نام جای هندسه را نمی‌گیرد');
{
  // نام هم غلط می‌شود: کپی‌کردن قطعه، نام قبلی را با خودش می‌برد. پس در اختلاف،
  // حدس هندسه می‌ماند و فقط اطمینان می‌افتد — نه اینکه نام بی‌چون‌وچرا ببرد.
  const r = C.classify(REAL.concat([b('sheet back', 16, 450, 756, 868, 100, 16)]));
  const p = r.parts.find(q => q.name === 'sheet back');
  assert(p.role === 'rail_top', 'هندسه برنده می‌ماند', p.role);
  assert(p.name_role === 'back' && p.role !== p.name_role,
         'ولی حدس دیگر هم ثبت است تا کاربر بتواند انتخاب کند');
}

console.log('پیش‌فرض نوار/شیار از همان قاعدهٔ سازنده می‌آید');
{
  const fs = require('fs');
  const Cat = require(path.join(__dirname, '..', '..', 'ui', 'kalaxa-catalog.js'));
  // نوار و شیار از هندسه خوانده نمی‌شوند — تصمیم کارگاه‌اند. اگر این جدول در JS
  // دوباره نوشته می‌شد، با قاعدهٔ Ruby بی‌صدا از هم جدا می‌شد؛ همان الگویی که در
  // این پروژه بارها باگ ساخته. یک فایل، دو خواننده.
  const disk = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', '..', 'data', 'edges.json'), 'utf8'));
  assert(JSON.stringify(Cat.edgeDefaults()) === JSON.stringify(disk.roles),
         'JS همان فایلی را می‌خواند که Ruby');
  assert(Cat.edgeDefaultFor('side').edge.front === 1 &&
         Cat.edgeDefaultFor('side').groove.back === 1,
         'دیواره: نوار جلو + شیار پشت‌بند');
  assert(Object.keys(Cat.edgeDefaultFor('door').edge).length === 4, 'درب: هر چهار طرف');
  assert(Object.keys(Cat.edgeDefaultFor('back').edge).length === 0,
         'پشت‌بند داخل شیار می‌نشیند — نوار ندارد');
  assert(Object.keys(Cat.edgeDefaultFor('hardware').edge).length === 0, 'یراق نوار ندارد');
  assert(Object.keys(Cat.edgeDefaultFor('چیز عجیب').edge).length === 0,
         'نقش ناشناخته نباید بترکاند — بدون نوار');
  const missing = C.ROLES.filter(r => Cat.edgeDefaults()[r] == null);
  assert(missing.length === 0, 'کاتالوگ همهٔ نقش‌های کلاسیفایر را دارد', missing.join(','));
}

console.log('\n' + passed + ' گذشت، ' + failed + ' افتاد');
process.exit(failed ? 1 : 0);
