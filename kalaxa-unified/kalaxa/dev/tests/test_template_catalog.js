/** تست رجیستری کاتالوگ تمپلیت — node test_template_catalog.js */
'use strict';
const path = require('path');
const fs = require('fs');
const UI = path.join(__dirname, '..', '..', 'ui');
const TC = require(path.join(UI, 'kalaxa-template-catalog.js'));
const CV = require(path.join(UI, 'kalaxa-cabinet-view.js'));
const Settings = require(path.join(UI, 'kalaxa-settings.js'));

const snapshot = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'golden_kitchen_snapshot.json'), 'utf8'));
const cabinetRows = CV.summarize(snapshot).cabinets;

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

console.log('\n[mergeFromCabinets — کاتالوگ خالی → همه تازه]');
{
  const r = TC.mergeFromCabinets({}, cabinetRows);
  assert(r.new_keys.length === 5, '۵ تمپلیت طلایی همه تازه‌اند', String(r.new_keys.length));
  assert(Object.keys(r.catalog).length === 5, '۵ ردیف در کاتالوگ');
  assert(r.catalog['base_single_door'].label_fa.indexOf('زمینی') !== -1, 'برچسب اولیه از نمونهٔ واقعی گرفته شد');
  assert(r.catalog['base_single_door'].user_labeled === false, 'پرچم user_labeled پیش‌فرض false');
}

console.log('\n[برچسب کاربرویرایش‌شده هرگز بازنویسی نمی‌شود]');
{
  const first = TC.mergeFromCabinets({}, cabinetRows).catalog;
  first['base_single_door'].label_fa = 'نام دلخواه من';
  first['base_single_door'].user_labeled = true;
  const second = TC.mergeFromCabinets(first, cabinetRows); // همان اسکن دوباره
  assert(second.catalog['base_single_door'].label_fa === 'نام دلخواه من', 'برچسب سفارشی حفظ شد');
  assert(second.new_keys.length === 0, 'هیچ تمپلیتی تازه نیست (همه از قبل در کاتالوگ بودند)');
  // ابعاد باید همچنان به‌روزرسانی شود (برچسب دست‌نخورده، بقیه تازه)
  assert(second.catalog['base_single_door'].w_mm === 800, 'ابعاد هنوز از داده تازه می‌آید', String(second.catalog['base_single_door'].w_mm));
}

console.log('\n[تمپلیت بدون کد — قابل کاتالوگ‌شدن نیست]');
{
  const rows = [{ template_id: '', label_fa: 'بی‌نام', category_fa: 'زمینی', w_mm: 1, h_mm: 1, d_mm: 1, doors: 0, drawer_fronts: 0, shelf_count: 0 }];
  const r = TC.mergeFromCabinets({}, rows);
  assert(Object.keys(r.catalog).length === 0, 'ردیف بدون template_id وارد کاتالوگ نمی‌شود');
}

console.log('\n[registry-not-consumption — تمپلیت حذف‌شده از اسکن، در کاتالوگ می‌ماند]');
{
  const full = TC.mergeFromCabinets({}, cabinetRows).catalog;
  const fewerRows = cabinetRows.filter(c => c.template_id !== 'wall_single_door'); // یکی حذف شد
  const r2 = TC.mergeFromCabinets(full, fewerRows);
  assert('wall_single_door' in r2.catalog, 'تمپلیتِ دیگر استفاده‌نشده همچنان در کاتالوگ است — حذف خودکار نمی‌شود');
  assert(r2.seen_keys.indexOf('wall_single_door') === -1, 'ولی در seen_keys این دور نیست (برای qty=0)');
  const entries = TC.listEntries(r2.catalog, r2.seen_keys);
  const wallEntry = entries.find(e => e.key === 'wall_single_door');
  assert(wallEntry.in_current_scan === false, 'listEntries صریح می‌گوید این دور دیده نشد (نه qty=0 پنهان)');
  const seenEntry = entries.find(e => e.key === 'base_single_door');
  assert(seenEntry.in_current_scan === true, 'تمپلیت‌های واقعاً دیده‌شده هم درست علامت می‌خورند');
}

console.log('\n[frontSVG با ردیف کاتالوگ — همان قرارداد تب کابینت‌ها]');
{
  const r = TC.mergeFromCabinets({}, cabinetRows);
  const entries = TC.listEntries(r.catalog, r.seen_keys);
  entries.forEach(e => {
    const svg = CV.frontSVG(e, { unit: 'cm' });
    assert(/^<svg/.test(svg) && /<\/svg>$/.test(svg), 'پیش‌نمایش SVG برای «' + e.key + '» معتبر است');
  });
}

console.log('\n[تنظیمات: template_catalog در KalaxaSettings]');
{
  const d = Settings.defaults();
  assert(d.project.template_catalog && typeof d.project.template_catalog === 'object',
    'پیش‌فرض template_catalog وجود دارد (خالی)');
  assert(Settings.validate(d).ok, 'پیش‌فرض معتبر است', Settings.validate(d).errors.join('|'));
  assert(PANEL_TABS_HAS_TEMPLATES(), 'تب templates در PANEL_TABS ثبت شده (برای اعتبارسنجی چیدمان تب‌ها)');

  const withEntry = Settings.defaults();
  withEntry.project.template_catalog = { base_single_door: { label_fa: 'زمینی من', w_mm: 800 } };
  assert(Settings.validate(withEntry).ok, 'ورودی معتبر پذیرفته می‌شود');

  const badShape = Settings.defaults();
  badShape.project.template_catalog = { x: 'not-an-object' };
  assert(!Settings.validate(badShape).ok, 'مقدار غیرشیء رد می‌شود');

  const badLabel = Settings.defaults();
  badLabel.project.template_catalog = { x: { label_fa: 123 } };
  assert(!Settings.validate(badLabel).ok, 'label_fa غیرمتن رد می‌شود');

  const noCatalog = Settings.defaults(); delete noCatalog.project.template_catalog;
  assert(Settings.validate(noCatalog).ok, 'نبود template_catalog معتبر (سازگاری عقب‌رو)');
}
function PANEL_TABS_HAS_TEMPLATES() {
  const d = Settings.defaults();
  return Array.isArray(d.display.tab_order) && d.display.tab_order.indexOf('templates') !== -1;
}

console.log('\n[جبرگرایی]');
{
  const a = JSON.stringify(TC.mergeFromCabinets({}, cabinetRows).catalog);
  const b = JSON.stringify(TC.mergeFromCabinets({}, cabinetRows).catalog);
  assert(a === b, 'دو اجرای یکسان → خروجی یکسان');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
