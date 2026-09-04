/** تست موتور فهرست/نمای کابینت‌ها — اجرا: node test_cabinet_view.js */
'use strict';
const path = require('path');
const fs = require('fs');
const UI = path.join(__dirname, '..', '..', 'ui');
const CV = require(path.join(UI, 'kalaxa-cabinet-view.js'));
const Settings = require(path.join(UI, 'kalaxa-settings.js'));

const snapshot = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'golden_kitchen_snapshot.json'), 'utf8'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

console.log('\n[fmtLen — واحد نمایش]');
{
  assert(CV.fmtLen(800, 'cm') === '80', '۸۰۰mm → ۸۰ (cm بدون اعشار اضافه)');
  assert(CV.fmtLen(555, 'cm') === '55.5', '۵۵۵mm → 55.5cm (یک رقم اعشار)');
  assert(CV.fmtLen(800, 'mm') === '800', 'حالت mm دست‌نخورده');
  assert(CV.fmtLen(800) === '80', 'پیش‌فرض بدون unit = cm');
  assert(CV.fmtLen(null, 'cm') === '—', 'مقدار نامعتبر → —');
}

console.log('\n[summarize — فهرست کابینت‌ها از snapshot طلایی]');
{
  const sum = CV.summarize(snapshot);
  assert(sum.cabinets.length === 5, '۵ کابینت', String(sum.cabinets.length));
  assert(sum.warnings.length === 0, 'بدون هشدار (هر کابینت قطعه دارد)', sum.warnings.join('|'));

  const c0 = sum.cabinets[0];
  assert(c0.label_fa.indexOf('زمینی') !== -1, 'برچسب فارسی حاضر است', c0.label_fa);
  assert(c0.w_mm === 800 && c0.h_mm === 720 && c0.d_mm === 550,
    'ابعاد cm×۱۰ → mm (۸۰/۷۲/۵۵)', [c0.w_mm, c0.h_mm, c0.d_mm].join(','));
  assert(c0.category_fa === 'زمینی', 'دسته فارسی شد');

  const totalQty = sum.cabinets.reduce((a, c) => a + c.parts_qty, 0);
  const expectQty = snapshot.parts_flat.reduce((a, p) => a + p.count, 0);
  assert(totalQty === expectQty, 'جمع قطعات فهرست = جمع snapshot (' + expectQty + ')', String(totalQty));

  const doors = sum.cabinets.reduce((a, c) => a + c.doors, 0);
  const expectDoors = snapshot.parts_flat.filter(p => p.key === 'door')
    .reduce((a, p) => a + p.count, 0);
  assert(doors === expectDoors && doors > 0, 'شمارش درب‌ها درست (' + expectDoors + ')', String(doors));

  const drawers = sum.cabinets.reduce((a, c) => a + c.drawer_fronts, 0);
  const expectDrawers = snapshot.parts_flat.filter(p => p.key === 'drawer_front')
    .reduce((a, p) => a + p.count, 0);
  assert(drawers === expectDrawers, 'شمارش کشوها درست (' + expectDrawers + ')', String(drawers));

  sum.cabinets.forEach(c => {
    assert(c.materials.length > 0 && c.materials.every(m => m.qty > 0 && m.area_m2 > 0),
      'متریال «' + c.label_fa + '» ناخالی و مثبت');
  });

  // تفکیک متریال باید همهٔ sheet_id های قطعات همان کابینت را بپوشاند (شامل ورق درب)
  const c0ids = new Set(snapshot.parts_flat.filter(p => p.cabinet_id === c0.id).map(p => p.sheet_id));
  assert(c0.materials.length === c0ids.size, 'همهٔ ورق‌های کابینت اول در تفکیک هستند');
}

console.log('\n[summarize — لبه‌ها]');
{
  const empty = CV.summarize({});
  assert(empty.cabinets.length === 0 && empty.warnings.length === 0, 'snapshot خالی → خروجی خالی');
  const orphan = CV.summarize({ cabinets: [{ kalaxa_id: 'x', label_fa: 'تنها', params: {} }], parts_flat: [] });
  assert(orphan.warnings.length === 1 && /تنها/.test(orphan.warnings[0]), 'کابینت بی‌قطعه هشدار می‌گیرد');
}

console.log('\n[frontSVG — نمای روبه‌رو]');
{
  const sum = CV.summarize(snapshot);
  const svg = CV.frontSVG(sum.cabinets[0], { unit: 'cm' });
  assert(/^<svg/.test(svg) && /<\/svg>$/.test(svg), 'خروجی SVG معتبر');
  assert(svg.indexOf(sum.cabinets[0].label_fa.replace(/&/g, '&amp;')) !== -1 ||
         svg.indexOf('زمینی') !== -1, 'برچسب کابینت داخل SVG');
  assert(svg.indexOf('80×72×55 cm') !== -1, 'ابعاد cm در برچسب', svg.match(/direction="ltr">([^<]*)/)?.[1]);
  const mmSvg = CV.frontSVG(sum.cabinets[0], { unit: 'mm' });
  assert(mmSvg.indexOf('800×720×550 mm') !== -1, 'ابعاد mm با unit=mm');

  const withDoor = sum.cabinets.find(c => c.doors > 0);
  assert(CV.frontSVG(withDoor, {}).indexOf('<polyline') !== -1, 'خط اریب لولا برای درب‌دار');
  const withDrawer = sum.cabinets.find(c => c.drawer_fronts > 0);
  if (withDrawer) {
    const dsvg = CV.frontSVG(withDrawer, {});
    assert((dsvg.match(/<rect/g) || []).length >= 1 + withDrawer.drawer_fronts,
      'به ازای هر کشو یک مستطیل');
  }
  // XSS: نام مخرب escape شود
  const evil = CV.frontSVG({ label_fa: '<img src=x>', w_mm: 600, h_mm: 720, d_mm: 550, doors: 0 }, {});
  assert(evil.indexOf('<img') === -1 && evil.indexOf('&lt;img') !== -1, 'نام مخرب escape شد');
}

console.log('\n[displayUnit — تنظیمات واحد]');
{
  assert(Settings.displayUnit(Settings.defaults()) === 'cm', 'پیش‌فرض cm');
  assert(Settings.displayUnit(null) === 'cm', 'تنظیمات قدیمی بدون display → cm');
  assert(Settings.displayUnit({ display: { unit: 'mm' } }) === 'mm', 'mm قابل انتخاب');
  assert(Settings.displayUnit({ display: { unit: 'inch' } }) === 'cm', 'واحد ناشناخته → cm امن');
  assert(Settings.validate(Settings.defaults()).ok, 'پیش‌فرض جدید معتبر است');
  const bad = Settings.defaults(); bad.display.unit = 'inch';
  assert(!Settings.validate(bad).ok, "display.unit نامعتبر رد می‌شود");
}

console.log('\n[جبرگرایی]');
{
  const a = JSON.stringify(CV.summarize(snapshot));
  const b = JSON.stringify(CV.summarize(snapshot));
  assert(a === b, 'دو اجرا خروجی یکسان');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
