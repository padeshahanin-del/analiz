/** تست تنظیمات پروژه (ورق بدنه/درب/پشت‌بند + نوع ریل) و چیدمان تب‌ها — node test_project_settings.js */
'use strict';
const path = require('path');
const fs = require('fs');
const UI = path.join(__dirname, '..', '..', 'ui');
const S = require(path.join(UI, 'kalaxa-settings.js'));
const HW = require(path.join(UI, 'kalaxa-hardware.js'));

const snapshot = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'golden_kitchen_snapshot.json'), 'utf8'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

console.log('\n[پیش‌فرض‌ها و اعتبارسنجی project]');
{
  const d = S.defaults();
  assert(d.project && d.project.body_sheet_id === 'mdf_white_16' &&
         d.project.door_sheet_id === 'mdf_door_16' && d.project.back_sheet_id === 'mdf_white_8' &&
         d.project.drawer_bottom_sheet_id === 'hdf_3',
    'پیش‌فرض project: بدنه/درب/پشت‌بند/کف کشو');
  assert(S.SLIDE_TYPES[d.project.slide_type], 'نوع ریل پیش‌فرض معتبر');
  assert(S.validate(d).ok, 'پیش‌فرض‌ها معتبرند', S.validate(d).errors.join('|'));

  const badSheet = S.defaults(); badSheet.project.body_sheet_id = 'no_such_sheet';
  const v1 = S.validate(badSheet);
  assert(!v1.ok && /no_such_sheet/.test(v1.errors.join('|')), 'ورق ناموجود رد می‌شود');

  const badSlide = S.defaults(); badSlide.project.slide_type = 'maglev';
  assert(!S.validate(badSlide).ok, 'نوع ریل ناشناخته رد می‌شود');

  const noProject = S.defaults(); delete noProject.project;
  assert(S.validate(noProject).ok, 'تنظیمات قدیمی بدون project همچنان معتبر');
}

console.log('\n[اعتبارسنجی چیدمان تب‌ها]');
{
  const d = S.defaults();
  assert(Array.isArray(d.display.tab_order) && d.display.tab_order.indexOf('settings') !== -1,
    'tab_order پیش‌فرض کامل است');
  const hid = S.defaults(); hid.display.hidden_tabs = ['scenarios', 'rules'];
  assert(S.validate(hid).ok, 'مخفی‌کردن تب‌های عادی مجاز');
  const hidSettings = S.defaults(); hidSettings.display.hidden_tabs = ['settings'];
  assert(!S.validate(hidSettings).ok, 'مخفی‌کردن تب تنظیمات رد می‌شود');
  const badTab = S.defaults(); badTab.display.tab_order = ['cut', 'bogus'];
  assert(!S.validate(badTab).ok, 'تب ناشناخته در ترتیب رد می‌شود');
}

console.log('\n[applyToSnapshot — نگاشت نقش‌محور ورق]');
{
  // بدنه → ورق ۸ میل: قطعات نقش بدنه باید sheet و ضخامت تازه بگیرند
  const st = S.defaults();
  st.project.body_sheet_id = 'mdf_white_8';
  const r = S.applyToSnapshot(snapshot, st);
  const bodyKeys = S.ROLE_KEYS.body;
  const bodyParts = r.snapshot.parts_flat.filter(p => bodyKeys.indexOf(p.key) !== -1);
  assert(bodyParts.length > 0 && bodyParts.every(p => p.sheet_id === 'mdf_white_8' && p.thickness_mm === 8),
    'قطعات بدنه → mdf_white_8 با ضخامت ۸');
  const doorParts = r.snapshot.parts_flat.filter(p => S.ROLE_KEYS.door.indexOf(p.key) !== -1);
  assert(doorParts.every(p => p.sheet_id === 'mdf_door_16'), 'قطعات درب دست‌نخورده روی ورق درب');
  const backParts = r.snapshot.parts_flat.filter(p => S.ROLE_KEYS.back.indexOf(p.key) !== -1);
  assert(backParts.every(p => p.sheet_id === 'mdf_white_8' && p.thickness_mm === 8),
    'پشت‌بند کابینت روی MDF ۸ (قرارداد دامنه)');
  const dbParts = r.snapshot.parts_flat.filter(p => p.key === 'drawer_bottom');
  assert(dbParts.every(p => p.sheet_id === 'hdf_3' && p.thickness_mm === 3), 'کف کشو روی hdf');
  assert(r.warnings.some(w => /نگاشت شد/.test(w)), 'هشدار نگاشت آمد');
  assert(r.warnings.some(w => /ضخامت/.test(w)), 'هشدار بازمحاسبهٔ ضخامت در اسکن بعدی آمد');
  assert(snapshot.parts_flat.some(p => p.sheet_id === 'mdf_white_16'),
    'ورودی اصلی mutate نشد (خلوص)');

  // اعمال دوباره با همان تنظیمات = بدون تغییر تازه (idempotent)
  const r2 = S.applyToSnapshot(r.snapshot, st);
  assert(!r2.warnings.some(w => /نگاشت شد/.test(w)), 'اعمال دوباره نگاشت تازه ندارد');

  // با پیش‌فرض‌ها روی snapshot طلایی هیچ نگاشتی لازم نیست (سازگاری عقب‌رو)
  const r3 = S.applyToSnapshot(snapshot, S.defaults());
  assert(!r3.warnings.some(w => /نگاشت شد/.test(w)), 'پیش‌فرض‌ها = وضع موجود طلایی');
}

console.log('\n[نوع ریل در BOM یراق]');
{
  const st = S.defaults(); st.project.slide_type = 'tandem';
  const r = S.applyToSnapshot(snapshot, st);
  assert(r.snapshot.project.slide_type_fa === 'تاندم (زیرکشویی)', 'برچسب فارسی ریل در snapshot');
  const bom = HW.bom(r.snapshot);
  const slide = bom.items.find(it => /^slide_/.test(it.item_id));
  assert(!!slide, 'ریل در BOM هست');
  assert(slide && /تاندم/.test(slide.detail_fa), 'نوع ریل در ستون مبنا', slide && slide.detail_fa);
  const bomPlain = HW.bom(snapshot);
  const slidePlain = bomPlain.items.find(it => /^slide_/.test(it.item_id));
  assert(slidePlain && slidePlain.detail_fa === '', 'بدون تنظیمات پروژه، BOM مثل قبل (سازگاری)');
  assert(slide.item_id === slidePlain.item_id, 'item_id قرارداد قیمت ثابت ماند');
}

console.log('\n[toUnit/fromUnit — تبدیل فرم‌های ورودی]');
{
  assert(S.toUnit(3660, 'cm') === 366 && S.toUnit(3660, 'mm') === 3660, 'mm→نمایش: ۳۶۶cm / ۳۶۶۰mm');
  assert(S.toUnit(16, 'cm') === 1.6, 'ضخامت ۱۶mm → 1.6cm (مثل ورودی کاربر)');
  assert(S.fromUnit('366', 'cm') === 3660 && S.fromUnit('1.6', 'cm') === 16, 'نمایش→mm: ۳۶۶ و 1.6');
  assert(S.fromUnit(1830, 'mm') === 1830, 'حالت mm عبوری');
  assert(S.fromUnit('abc', 'cm') === null && S.toUnit(null, 'cm') === null, 'نامعتبر → null');
  // رفت‌وبرگشت روی همهٔ ورق‌های پیش‌فرض بدون اتلاف
  S.defaults().sheets.forEach(sh => {
    ['thickness_mm', 'width_mm', 'height_mm'].forEach(f => {
      assert(S.fromUnit(S.toUnit(sh[f], 'cm'), 'cm') === sh[f],
        'رفت‌وبرگشت cm بدون اتلاف: ' + sh.sheet_id + '.' + f);
    });
  });
}

console.log('\n[سناریوی مدیریت ورق — افزودن/تغییرنام/حذف]');
{
  const st = S.defaults();
  st.sheets.push({ sheet_id: 'سفید بدنه', material: 'سفید بدنه', color_code: '',
    thickness_mm: 16, width_mm: 3660, height_mm: 1830,
    has_grain: true, price_per_sheet: 0, trim_margin_mm: 10 });
  assert(S.validate(st).ok, 'ورق تازه با نام فارسی معتبر است', S.validate(st).errors.join('|'));
  st.project.body_sheet_id = 'سفید بدنه';
  assert(S.validate(st).ok, 'ارجاع پروژه به ورق فارسی معتبر');
  const r = S.applyToSnapshot(snapshot, st);
  const bodyParts = r.snapshot.parts_flat.filter(p => S.ROLE_KEYS.body.indexOf(p.key) !== -1);
  assert(bodyParts.every(p => p.sheet_id === 'سفید بدنه'), 'بدنه به ورق فارسی نگاشت شد');
  assert(r.snapshot.sheets.some(sh => sh.sheet_id === 'سفید بدنه' && sh.has_grain === true),
    'ورق تازه با تیک راه در snapshot اعمال‌شده هست');

  // حذف ورقی که قطعه به آن ارجاع دارد → هشدار مستند (رفتار موجود، رگرسیون نگیرد)
  const st2 = S.defaults();
  st2.sheets = st2.sheets.filter(sh => sh.sheet_id !== 'hdf_3');
  st2.project.drawer_bottom_sheet_id = 'mdf_white_8';
  const r2 = S.applyToSnapshot(snapshot, st2);
  assert(S.validate(st2).ok, 'حذف ورق با جایگزینی ارجاع پروژه معتبر است');
  assert(r2.snapshot.parts_flat.filter(p => p.key === 'drawer_bottom')
    .every(p => p.sheet_id === 'mdf_white_8'), 'کف کشو پس از حذف hdf به ورق جایگزین رفت');
}

console.log('\n[سلامت پنل — کامپایل اسکریپت داخلی analysis_panel.html]');
{
  // خطای syntax در اسکریپت داخلی، کل پنل را بی‌صدا می‌کشد (تجربهٔ واقعی ۱۴۰۵/۰۵/۰۲)
  const html = fs.readFileSync(path.join(UI, 'analysis_panel.html'), 'utf8');
  const m = html.match(/<script>\n([\s\S]*)\n<\/script>/);
  assert(!!m, 'اسکریپت داخلی پیدا شد');
  let err = null;
  try { new Function(m[1]); } catch (e) { err = e.message; }
  assert(err === null, 'اسکریپت داخلی پنل بدون خطای syntax کامپایل می‌شود', err);
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
