/** بستهٔ تمپلیت و دسته‌بندی — node test_template_pack.js
 *
 * کاربر گفت «تمپلیت‌ها را از نت ایمپورت کن و دسته‌بندی کن».
 *
 * «از نت» شدنی نبود و باید صریح گفته می‌شد: کتابخانهٔ آمادهٔ تمپلیت کابینت
 * به شکل ماشین‌خوان وجود ندارد — یا فایل بستهٔ نرم‌افزار تجاری است
 * (رمزگذاری‌شده و لایسنس‌دار) یا PDF کاتالوگ که داده نیست.
 *
 * کاری که دوام دارد: قالب مستند بسته، تا کارگاه/تأمین‌کننده بسته بسازد و رد
 * و بدل کند. این تست همان قالب را نگه می‌دارد.
 */
'use strict';
const path = require('path');
const UI = path.join(__dirname, '..', '..', 'ui');
const P = require(path.join(UI, 'kalaxa-template-pack.js'));
const C = require(path.join(UI, 'kalaxa-catalog.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

// فهرست از **خودِ کاتالوگ** می‌آید، نه دستی.
//
// نسخهٔ اول این‌جا هشت نام دستی داشت و با افزودن پنج تمپلیت تازه قرمز شد —
// دقیقاً همان اشتباهی که `CATEGORY_OF` داشت و باعث شد کمد ۲۴۰ سانتی صفحهٔ
// کار بگیرد. فهرستی که با هر تمپلیت تازه باید دستی به‌روز شود، دیر یا زود
// عقب می‌ماند؛ حتی وقتی داخل تست باشد.
const KNOWN = Object.keys(C.get('templates').templates);

const PACK = {
  groups: { custom: { label_fa: 'سفارشی', order: 9 } },
  templates: {
    base_single_door: {
      group: 'custom', label_fa: 'تک‌درب کارگاه من',
      presets: [{ label_fa: '۴۵', w: 45, h: 72, d: 57 }]
    }
  }
};

console.log('کاتالوگ پایه دسته‌بندی دارد');
{
  const cat = C.get('templates');
  assert(cat && cat.groups && cat.templates, 'کاتالوگ تمپلیت بار می‌شود');

  const gs = P.grouped(cat);
  assert(gs.length >= 4, 'چند دسته دارد', String(gs.length));
  assert(gs[0].label_fa.indexOf('زمینی') !== -1,
         'ترتیب دسته‌ها رعایت می‌شود — زمینی اول', gs[0].label_fa);

  const all = gs.reduce((s, g) => s + g.templates.length, 0);
  assert(all === KNOWN.length, 'همهٔ تمپلیت‌ها دسته دارند',
         all + ' vs ' + KNOWN.length);
  gs.forEach(g => assert(g.label_fa !== 'دسته‌بندی‌نشده',
                         'دستهٔ «' + g.id + '» برچسب فارسی دارد'));
}

console.log('کمد و کتابخانه زمینی نیستند');
{
  // پیش از این `CATEGORY_OF` دستی بود و این سه تمپلیت در آن نبودند، پس
  // همه 'base' حساب می‌شدند: کمد ۲۴۰ سانتی صفحهٔ کار هم می‌گرفت.
  const t = C.get('templates').templates;
  assert(t.wardrobe.category === 'tall', 'کمد قدی است', t.wardrobe.category);
  assert(t.bookcase.category === 'tall', 'کتابخانه قدی است', t.bookcase.category);
  assert(t.base_corner_diagonal.category === 'base', 'گوشه زمینی است');
  assert(t.wall_single_door.category === 'wall', 'هوایی هوایی است');
}

console.log('اندازه‌های آماده');
{
  const t = C.get('templates').templates;
  KNOWN.forEach(id => {
    assert((t[id].presets || []).length > 0, id + ' اندازهٔ آماده دارد');
  });
  const sink = t.base_sink_double_door.presets;
  assert(sink.every(p => p.w > 0 && p.h > 0 && p.d > 0), 'ابعاد معتبرند');
}

console.log('وارد کردن بسته');
{
  const r = P.validate(PACK, KNOWN);
  assert(r.ok, 'بستهٔ سالم پذیرفته می‌شود', JSON.stringify(r.errors));
  assert(r.groups.custom.label_fa === 'سفارشی', 'گروه تازه وارد می‌شود');
  assert(r.templates.base_single_door.presets.length === 1, 'اندازه‌ها وارد می‌شوند');
}

console.log('تمپلیتی که موتور نمی‌سازد رد می‌شود');
{
  // ردیفی که انتخابش خطا می‌دهد از نبودنش بدتر است: کاربر فکر می‌کند
  // برنامه خراب است.
  const r = P.validate({ templates: {
    base_single_door: { presets: [{ w: 40, h: 72, d: 55 }] },
    fantasy_unit: { label_fa: 'چیزی که نداریم', presets: [{ w: 40, h: 72, d: 55 }] }
  } }, KNOWN);
  assert(!r.templates.fantasy_unit, 'تمپلیت ناشناخته وارد نمی‌شود');
  assert(r.skipped.indexOf('fantasy_unit') !== -1, 'و در فهرست ردشده‌ها می‌آید');
  assert(r.warnings.some(w => w.indexOf('fantasy_unit') !== -1),
         'و صریح گفته می‌شود', JSON.stringify(r.warnings));
  assert(r.ok && r.templates.base_single_door,
         'ولی بقیهٔ بسته پذیرفته می‌شود — یک ردیف خراب کل بسته را رد نمی‌کند');
}

console.log('ورودی خراب');
{
  assert(!P.validate(null, KNOWN).ok, 'null رد می‌شود');
  assert(!P.validate({}, KNOWN).ok, 'بدون templates رد می‌شود');
  assert(P.validate({}, KNOWN).errors.length > 0, 'و می‌گوید چرا');

  const bad = P.validate({ templates: { base_single_door: {
    presets: [{ label_fa: 'خراب', w: 0, h: 72, d: 55 }]
  } } }, KNOWN);
  assert(bad.templates.base_single_door.presets.length === 0,
         'اندازهٔ با بعد صفر وارد نمی‌شود');
  assert(bad.warnings.length > 0, 'و بی‌صدا حذف نمی‌شود');

  const noneOk = P.validate({ templates: { fantasy: {} } }, KNOWN);
  assert(!noneOk.ok, 'بسته‌ای که هیچ تمپلیت شناخته‌شده‌ای ندارد رد می‌شود');
}

console.log('ادغام: بسته جای کاتالوگ را نمی‌گیرد');
{
  const base = C.get('templates');
  const merged = P.merge(base, P.validate(PACK, KNOWN));

  assert(Object.keys(merged.templates).length === Object.keys(base.templates).length,
         'تمپلیتی که در بسته نیست پاک نمی‌شود',
         Object.keys(merged.templates).length + ' vs ' + Object.keys(base.templates).length);
  assert(merged.templates.wardrobe, 'کمد سر جایش است');
  assert(merged.templates.base_single_door.label_fa === 'تک‌درب کارگاه من',
         'ولی آنچه بسته آورده، بازنویسی می‌کند');
  assert(merged.groups.custom, 'گروه تازه اضافه می‌شود');
  assert(merged.groups.kitchen_base, 'و گروه‌های قبلی می‌مانند');
}

console.log('میدان تهی مقدار موجود را پاک نمی‌کند');
{
  // بسته‌ای که فقط اندازه می‌آورد نباید برچسب فارسی را از بین ببرد.
  const base = C.get('templates');
  const onlySizes = P.validate({ templates: { wardrobe: {
    presets: [{ label_fa: '۱۸۰', w: 180, h: 230, d: 60 }]
  } } }, KNOWN);
  const merged = P.merge(base, onlySizes);
  assert(merged.templates.wardrobe.label_fa === base.templates.wardrobe.label_fa,
         'برچسب فارسی سالم می‌ماند', String(merged.templates.wardrobe.label_fa));
  assert(merged.templates.wardrobe.presets.length === 1, 'ولی اندازه‌ها عوض می‌شوند');
}

console.log('خروجی بسته');
{
  const json = P.toPack(C.get('templates'));
  const back = JSON.parse(json);
  assert(back.kalaxa_template_pack === 1, 'نشان قالب دارد');
  const round = P.validate(back, KNOWN);
  assert(round.ok, 'خروجی خودمان دوباره قابل ورود است — رفت و برگشت سالم',
         JSON.stringify(round.errors));
}

console.log('\n' + passed + ' گذشت، ' + failed + ' افتاد');
process.exit(failed ? 1 : 0);
