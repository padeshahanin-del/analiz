/**
 * قرارداد کاتالوگ مشترک — اجرا: node test_catalog.js
 *
 * تا ۳.۳۱.۰ شکل درب، ورق، متریال و قید در Ruby و JS **جدا** نوشته می‌شدند و
 * تست‌های «آینه‌سنجی» فقط واگرایی را گزارش می‌کردند، نه اینکه جلویش را بگیرند:
 * هر افزودن یعنی دو ویرایش در دو زبان، و فراموشیِ یکی یعنی قطعه‌ای بی‌ورق
 * (همان چیزی که با glass_4 رخ داد).
 *
 * حالا هر دو طرف همان data/*.json را می‌خوانند. این تست دو چیز را قفل می‌کند:
 *   ۱) JS واقعاً از فایل می‌خواند، نه از کپی داخلی.
 *   ۲) خروجی Ruby::Catalog و KalaxaCatalog بایت‌به‌بایت یکی است (با اجرای واقعی ruby).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const UI = path.join(__dirname, '..', '..', 'ui');
const DATA = path.join(__dirname, '..', '..', 'data');
const LIB = path.join(__dirname, '..', '..', 'lib');
const Catalog = require(path.join(UI, 'kalaxa-catalog.js'));
const Settings = require(path.join(UI, 'kalaxa-settings.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

/* ------------------------------------------------ فایل‌ها منبع واحدند */
console.log('\n[کاتالوگ] فایل‌های داده');
{
  Catalog.NAMES.forEach(function (n) {
    assert(fs.existsSync(path.join(DATA, n + '.json')), n + '.json روی دیسک هست');
  });
  assert(Catalog.isLoaded(), 'JS کاتالوگ را از دیسک می‌خواند');
  assert(Catalog.doorShapeIds().length >= 6, 'شکل‌های درب از فایل آمد',
    Catalog.doorShapeIds().join(', '));
  assert(Catalog.sheetIds().indexOf('glass_4') !== -1, 'ورق شیشه در کاتالوگ هست');
}

/* --------------------------------- هیچ کپی سخت‌کدشده‌ای باقی نمانده */
console.log('\n[کاتالوگ] بدون کپی در کد');
{
  const settingsSrc = fs.readFileSync(path.join(UI, 'kalaxa-settings.js'), 'utf8');
  assert(!/framed_panel:\s*\[/.test(settingsSrc),
    'فهرست شکل‌ها دیگر در kalaxa-settings.js کپی نشده');
  // دقت: body_sheet_id یک **ارجاع** است (کدام ورق برای بدنه)، نه کپی کاتالوگ.
  // آنچه نباید بماند، تعریف کامل ورق است — نسخهٔ اول این تست هر دو را یکی گرفت.
  assert(!/\{\s*sheet_id:\s*'[a-z0-9_]+',\s*material:/.test(settingsSrc),
    'تعریف ورق دیگر در kalaxa-settings.js کپی نشده');
  assert(/body_sheet_id:/.test(settingsSrc),
    'ارجاع پروژه به ورق سر جایش است — آن تنظیمات است، نه کاتالوگ');

  const rbFiles = ['door_shapes.rb', 'materials.rb', 'cabinet_builder.rb'];
  rbFiles.forEach(function (f) {
    const src = fs.readFileSync(path.join(LIB, f), 'utf8');
    assert(/require_relative 'catalog'/.test(src), f + ' از کاتالوگ می‌خواند');
  });
  const scanner = fs.readFileSync(path.join(LIB, 'project_scanner.rb'), 'utf8');
  assert(!/'sheet_id' => 'mdf_white_16'/.test(scanner),
    'ورق‌ها دیگر در project_scanner.rb کپی نشده‌اند');
}

/* ------------------------------- تنظیمات از کاتالوگ تغذیه می‌شود */
console.log('\n[کاتالوگ] تنظیمات');
{
  const d = Settings.defaults();
  assert(JSON.stringify(d.sheets.map(s => s.sheet_id)) ===
         JSON.stringify(Catalog.sheetIds()),
    'ورق‌های پیش‌فرض تنظیمات = ورق‌های کاتالوگ');
  assert(d.cutting.kerf_mm === Catalog.cutting().kerf_mm, 'kerf از کاتالوگ');
  assert(JSON.stringify(Object.keys(Settings.DOOR_SHAPES).sort()) ===
         JSON.stringify(Catalog.doorShapeIds().sort()),
    'شکل‌های تنظیمات = شکل‌های کاتالوگ');
  assert(Settings.validate(d).ok, 'پیش‌فرض‌های ساخته‌شده از کاتالوگ معتبرند');
}

/* --------------------------- Ruby و JS دقیقاً یک چیز می‌بینند */
console.log('\n[کاتالوگ] هم‌نظری Ruby و JS');
{
  let rubyPayload = null;
  try {
    const script =
      "require './kalaxa/lib/catalog'; " +
      "print JSON.generate(Kalaxa::Catalog.payload)";
    const out = execFileSync('ruby', ['-rjson', '-e', script],
      { cwd: path.join(__dirname, '..', '..', '..'), encoding: 'utf8' });
    rubyPayload = JSON.parse(out);
  } catch (e) {
    console.log('  … ruby در دسترس نبود، این بخش رد شد (' + e.message.split('\n')[0] + ')');
  }

  if (rubyPayload) {
    const jsPayload = {};
    Catalog.NAMES.forEach(function (n) { jsPayload[n] = Catalog.get(n); });
    Catalog.NAMES.forEach(function (n) {
      assert(JSON.stringify(rubyPayload[n]) === JSON.stringify(jsPayload[n]),
        n + ': Ruby و JS دقیقاً یکی می‌بینند');
    });
  }
}

/* ------------------------------------------- نگاشت‌های مشتق */
console.log('\n[کاتالوگ] نگاشت متریال');
{
  assert(Catalog.sheetMaterial('mdf_door_16') === 'mdf_hg', 'ورق → متریال');
  assert(Catalog.sheetMaterial('glass_10') === 'glass',
    'ضخامت تازهٔ شیشه بدون تغییر کد شناخته می‌شود');
  assert(Catalog.materialForKey('door_frame') === 'aluminum', 'قطعهٔ غیرورقی → متریال مستقیم');
  assert(Catalog.materialForKey('side') === 'mdf', 'قطعهٔ بدنه از راه ورق پیش‌فرضش');
  assert(Catalog.materials().glass.alpha < 1, 'شیشه شفاف است');
}

/* ------------------------------------- تزریق از Ruby به پنل */
console.log('\n[کاتالوگ] تزریق به پنل');
{
  const snapshot = {};
  Catalog.NAMES.forEach(function (n) { snapshot[n] = Catalog.get(n); });
  assert(Catalog.load(snapshot), 'بستهٔ تزریقی پذیرفته می‌شود');
  assert(Catalog.doorShapeIds().length >= 6, 'پس از تزریق هم کار می‌کند');
  assert(!Catalog.load({ door_shapes: {} }), 'بستهٔ ناقص رد می‌شود');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed === 0 ? 0 : 1);
