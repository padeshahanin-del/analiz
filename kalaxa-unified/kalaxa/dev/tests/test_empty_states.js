/**
 * حالت‌های خالی پنل — اجرا: node test_empty_states.js
 *
 * چرا: کاربر واقعی کابینت را با «خواندن کابینت انتخاب‌شده» وارد کرد، دیالوگ گفت
 * «تب قطعات خوانده‌شده را ببینید»، و تب **کاملاً خالی** بود — نه جدول، نه راهنما.
 * علت: `renderImportedParts()` فقط پس از اسکن صدا زده می‌شد، پس div از ابتدا خالی
 * می‌ماند.
 *
 * این کلاس خطا (صفحهٔ خالی بدون توضیح) بدتر از خطاست: کاربر نمی‌داند خراب است یا
 * خودش کاری نکرده. این تست می‌سنجد که هر حالت خالی **خودش را توضیح بدهد**.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const UI = path.join(__dirname, '..', '..', 'ui');
const HTML = fs.readFileSync(path.join(UI, 'analysis_panel.html'), 'utf8');
const SCRIPT = HTML.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*)<\/script>/)[1];

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

/* ------------------------------------------------ ترتیب فراخوانی در بوت */
console.log('\n[حالت خالی] تب قطعات خوانده‌شده هنگام باز شدن پنل رسم می‌شود');
{
  // بدون اجرای کامل DOM، ترتیب را از خودِ متن می‌سنجیم: فراخوانی باید **بیرون**
  // از doHandleSnapshot هم باشد، وگرنه تا اسکن نزنی چیزی رسم نمی‌شود.
  const inSnapshotOnly = SCRIPT.indexOf('renderImportedParts();') !== -1;
  assert(inSnapshotOnly, 'تابع اصلاً صدا زده می‌شود');

  // فراخوانی در سطح ماژول (نه داخل تابع) — نشانه‌اش این است که پیش از
  // `if (inSketchUp) {` بیاید، جایی که بوت انجام می‌شود.
  const bootIdx = SCRIPT.indexOf('if (inSketchUp) {\n    dockPanel();');
  const beforeBoot = SCRIPT.slice(0, bootIdx);
  assert(bootIdx > 0, 'بلوک بوت پیدا شد');
  assert(/\n  renderImportedParts\(\);/.test(beforeBoot),
    'renderImportedParts در بوت پنل صدا زده می‌شود، نه فقط پس از اسکن');
}

/* ------------------------------------------------ دو حالت خالیِ متفاوت */
console.log('\n[حالت خالی] «هنوز اسکن نزده‌ای» با «کابینتی نیست» یکی نیست');
{
  const fnIdx = SCRIPT.indexOf('function renderImportedParts()');
  const fn = SCRIPT.slice(fnIdx, fnIdx + 2000);

  assert(/state\.snapshot\s*\n?\s*\?/.test(fn) || /state\.snapshot[\s\S]{0,40}\?/.test(fn),
    'بین «اسکن نزده» و «کابینتی نیست» تفکیک می‌شود');
  assert(/اسکن مدل و آنالیز/.test(fn),
    'حالت «اسکن نزده» کاربر را به دکمهٔ درست هدایت می‌کند');
  assert(/msg warn/.test(fn),
    'حالت «اسکن نزده» هشدار است، نه اطلاع خنثی');
  assert(/msg info/.test(fn),
    'حالت «واقعاً کابینتی نیست» اطلاع است، نه هشدار');
}

/* ------------------------------------------------ نتیجهٔ خالی نستینگ */
console.log('\n[حالت خالی] «۰ ورق» نباید پیام سبز موفقیت بگیرد');
{
  const idx = SCRIPT.indexOf('expected_instances === 0');
  assert(idx > 0, 'حالت «هیچ قطعه‌ای نبود» جدا سنجیده می‌شود');

  const block = SCRIPT.slice(idx, idx + 900);
  assert(/msg\('warn'/.test(block), 'نتیجهٔ خالی هشدار می‌گیرد، نه موفقیت');
  assert(/قطعات خوانده‌شده/.test(block),
    'و اگر کابینت خوانده‌شدهٔ تأییدنشده باشد، به تب درست هدایت می‌کند');

  // پیام سبز باید فقط برای حالت واقعاً موفق بماند
  const okIdx = SCRIPT.indexOf('همه قطعات جای‌گذاری شدند');
  assert(okIdx > idx, 'شاخهٔ موفقیت **بعد از** شاخهٔ خالی می‌آید (وگرنه هرگز نمی‌رسد)');
}

/* ------------------------------------------------ پیام ابزار ورود */
console.log('\n[حالت خالی] پیام «کابینت خوانده شد» ترتیب کار را می‌گوید');
{
  const rb = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', 'import_selection.rb'), 'utf8');

  // کامنت‌ها را بردار و بعد بسنج — نسخهٔ اول این تست به کامنت خودِ کد برخورد کرد
  // و ترتیب را اشتباه خواند؛ نسخهٔ دوم خط‌های ادامهٔ رشته را نگرفت.
  const msgLines = rb.split('\n')
    .filter(l => !/^\s*#/.test(l))
    .join('\n');

  assert(/اسکن مدل و آنالیز/.test(msgLines),
    'پیام باید بگوید اول اسکن بزن — کاربر واقعی دقیقاً روی همین گیر کرد');
  const scanIdx = msgLines.indexOf('اسکن مدل و آنالیز');
  const tabIdx = msgLines.indexOf('قطعات خوانده‌شده');
  assert(scanIdx >= 0 && tabIdx > scanIdx,
    'ترتیب درست در متن پیام: اول اسکن، بعد تب',
    'scan@' + scanIdx + ' tab@' + tabIdx);
}

console.log('\n=================================');
/* ------------------------------------------- تب باید خودش را توضیح بدهد */
console.log('\n[حالت خالی] هر تب می‌گوید به چه درد می‌خورد');
{
  // کاربر: «سناریو خالی هست، کاربردش رو هم نمی‌دونم — یا استاندارد خالی هست».
  // یک تب خالی بدون توضیح، از تب نبودن بدتر است: کاربر فکر می‌کند خراب است.
  //
  // متن راهنما باید در **خودِ HTML** باشد، نه فقط بعد از اجرای JS: کسی که
  // هنوز اسکن نزده هم باید بفهمد این تب چیست.
  const pane = (id) => {
    const i = HTML.indexOf('<div id="pane-' + id + '"');
    if (i === -1) return '';
    const j = HTML.indexOf('<div id="pane-', i + 10);
    return HTML.slice(i, j === -1 ? HTML.length : j);
  };

  // هر تبی که کاربر گفت 'نمی‌دونم به چه درد می‌خوره' باید در این فهرست باشد.
  ['scenarios', 'rules', 'placement', 'templates'].forEach(id => {
    const html = pane(id);
    assert(html.length > 0, 'تب ' + id + ' وجود دارد');
    assert(html.indexOf('به چه درد می‌خورد') !== -1,
           'تب ' + id + ' توضیح می‌دهد به چه درد می‌خورد');
  });

  // «چک استاندارد» خالی خبر خوبی است — ولی کاربر باید بداند
  assert(pane('rules').indexOf('خبر خوبی') !== -1,
         'خالی‌بودن چک استاندارد به‌عنوان خبر خوب توضیح داده می‌شود');
}

console.log('\n[سناریو] بدون نوشتن JSON قابل استفاده است');
{
  // تب قبلاً فقط یک textarea خالی و یک دکمه داشت. کسی که نمی‌داند «patch»
  // چیست هیچ راهی برای شروع نداشت.
  assert(HTML.indexOf('id="scenario-presets"') !== -1,
         'دکمه‌های آمادهٔ سناریو وجود دارند');
  assert(/renderScenarioPresets\(\);/.test(SCRIPT),
         'و هنگام باز شدن پنل رسم می‌شوند');

  // فراخوانی **بوت** آن است که تورفتگی ندارد (بیرون از هر تابع). جست‌وجوی
  // ساده اولین رخداد را می‌گیرد که داخل doHandleSnapshot است و بعد از اسکن
  // اجرا می‌شود — یعنی دقیقاً همان چیزی که نباید بسنجیم.
  // همان روشی که تست بالا برای پیدا کردن بلوک بوت دارد: هرچه **پیش از**
  // `if (inSketchUp)` بیاید در سطح ماژول اجرا می‌شود، نه بعد از اسکن.
  // لنگر باید **بلوک بوت** باشد نه هر `if (inSketchUp)`؛ یکی از آن‌ها در
  // هندلر دکمهٔ اسکن است و خیلی زودتر می‌آید. همان لنگر تست بالا.
  const NEWLINE = String.fromCharCode(10);
  const bootIdx = SCRIPT.indexOf('if (inSketchUp) {' + NEWLINE + '    dockPanel();');
  assert(bootIdx > 0, 'بلوک بوت پیدا شد');
  const beforeBoot = SCRIPT.slice(0, bootIdx);
  assert(/renderScenarioPresets\(\);/.test(beforeBoot),
         'دکمه‌های سناریو در بوت پنل رسم می‌شوند — نه فقط بعد از اسکن');

  // JSON خام باید بماند ولی پشت «حالت پیشرفته»
  assert(HTML.indexOf('<details') !== -1 && HTML.indexOf('سناریوی دلخواه') !== -1,
         'JSON دلخواه هست ولی جلوی چشم نیست');
}

console.log('\n[سناریو] یک رندر برای هر دو مسیر');
{
  // دکمهٔ آماده و JSON دلخواه هر دو باید یک جدول بسازند؛ دو نسخه یعنی روزی
  // یکی ستون تازه بگیرد و دیگری نه.
  const tables = SCRIPT.match(/<th>سناریو<\/th>/g) || [];
  assert(tables.length === 1, 'جدول سناریو فقط یک جا ساخته می‌شود',
         String(tables.length));
  assert(/function renderScenarioTable/.test(SCRIPT), 'و در تابع مشترک است');
}

console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed === 0 ? 0 : 1);
