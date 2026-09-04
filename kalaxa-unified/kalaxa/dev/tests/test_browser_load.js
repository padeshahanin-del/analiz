/**
 * بارگذاری در مرورگر (پنل اسکچاپ) — اجرا: node test_browser_load.js
 *
 * چرا این فایل وجود دارد:
 * پنل اسکچاپ یک مرورگر است، نه Node. کاتالوگ آن‌جا **از دیسک خوانده نمی‌شود** —
 * Ruby بعداً با onCatalog تزریقش می‌کند. یعنی بین بارگذاری اسکریپت‌ها و رسیدن
 * کاتالوگ، یک پنجرهٔ زمانی هست که کاتالوگ خالی است.
 *
 * `kalaxa-settings.js` در سطح ماژول `Catalog.sheets()` صدا می‌زد. در Node کار
 * می‌کرد (دیسک هست) و همهٔ ۲۴ سوئیت سبز بودند — ولی در نصب واقعی پنل با
 * «KalaxaSettings is not defined» می‌ترکید، چون استثنای کاتالوگ کل ماژول را
 * می‌کشت.
 *
 * این تست همان شرایط را می‌سازد: ماژول‌ها را مثل مرورگر روی یک global بارگذاری
 * می‌کند، **بدون** دسترسی به دیسک، و می‌سنجد هیچ‌کدام نمیرند.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const UI = path.join(__dirname, '..', '..', 'ui');

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

// مثل مرورگر: نه require، نه module، نه fs. فقط یک global مشترک.
function browserContext() {
  const sandbox = { console: console };
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  return vm.createContext(sandbox);
}

// همان ترتیبی که analysis_panel.html بارگذاری می‌کند.
function panelScriptOrder() {
  const html = fs.readFileSync(path.join(UI, 'analysis_panel.html'), 'utf8');
  return [...html.matchAll(/<script src="([^"]+\.js)"/g)].map(m => m[1]);
}

function loadInto(ctx, file) {
  const src = fs.readFileSync(path.join(UI, file), 'utf8');
  vm.runInContext(src, ctx, { filename: file });
}

/* ------------------------------------------- بارگذاری بدون کاتالوگ */
console.log('\n[مرورگر] بارگذاری اسکریپت‌ها پیش از رسیدن کاتالوگ');
{
  const ctx = browserContext();
  const order = panelScriptOrder();
  assert(order.length > 5, 'ترتیب اسکریپت‌ها از خود پنل خوانده شد',
    'یافت: ' + order.length);

  const broken = [];
  for (const file of order) {
    try { loadInto(ctx, file); }
    catch (e) { broken.push(file + ' → ' + e.message); }
  }
  assert(broken.length === 0,
    'هیچ موتوری هنگام بارگذاری نمی‌میرد',
    broken.join(' ؛ '));

  // همان نمادی که در نصب واقعی گم شده بود
  assert(typeof ctx.KalaxaSettings === 'object' && ctx.KalaxaSettings !== null,
    'KalaxaSettings تعریف می‌شود (خطای واقعی نصب: is not defined)');
  assert(typeof ctx.KalaxaCatalog === 'object', 'KalaxaCatalog تعریف می‌شود');
  assert(typeof ctx.KalaxaSchema === 'object', 'KalaxaSchema تعریف می‌شود');
}

/* ------------------------------------------- کار کردن بدون کاتالوگ */
console.log('\n[مرورگر] پنل پیش از رسیدن کاتالوگ باید زنده بماند');
{
  const ctx = browserContext();
  for (const file of panelScriptOrder()) loadInto(ctx, file);

  let d = null, err = null;
  try { d = ctx.KalaxaSettings.defaults(); } catch (e) { err = e.message; }
  assert(d !== null, 'defaults() بدون کاتالوگ استثنا نمی‌دهد', err);
  assert(Array.isArray(d && d.sheets), 'sheets آرایه است (خالی، ولی نه غایب)');
  assert(d && d.project != null, 'بقیهٔ تنظیمات سر جایشان‌اند');

  let v = null;
  try { v = ctx.KalaxaSettings.validate(d); } catch (e) { err = e.message; }
  assert(v !== null, 'validate() بدون کاتالوگ استثنا نمی‌دهد', err);
}

/* ------------------------------------------- پس از تزریق کاتالوگ */
console.log('\n[مرورگر] پس از تزریق کاتالوگ از Ruby');
{
  const ctx = browserContext();
  for (const file of panelScriptOrder()) loadInto(ctx, file);

  // همان بستهٔ Kalaxa::Catalog#payload
  const payload = {};
  // فهرست از خودِ Ruby خوانده می‌شود، نه دست‌نویس: با دست‌نویس، افزودن هر
  // کاتالوگ تازه این تست را الکی قرمز می‌کرد و آدم وسوسه می‌شد فهرست را
  // «درست» کند — درحالی‌که نکتهٔ تست همین است که دو طرف یکی بمانند.
  const RUBY_FILES = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'catalog.rb'), 'utf8')
    .match(/FILES = %w\[([^\]]+)\]/)[1].trim().split(/\s+/);
  for (const name of RUBY_FILES) {
    payload[name] = JSON.parse(
      fs.readFileSync(path.join(UI, '..', 'data', name + '.json'), 'utf8'));
  }
  assert(ctx.KalaxaCatalog.load(payload) === true, 'تزریق کاتالوگ پذیرفته می‌شود');

  const d = ctx.KalaxaSettings.defaults();
  assert(d.sheets.length > 0, 'حالا ورق‌ها پر می‌شوند', 'تعداد: ' + d.sheets.length);
  assert(d.cutting && d.cutting.kerf_mm > 0, 'پارامترهای برش هم می‌آیند');
  assert(ctx.KalaxaSettings.validate(d).ok, 'تنظیمات پیش‌فرض معتبرند');
  assert(Object.keys(ctx.KalaxaSettings.DOOR_SHAPES).length >= 6,
    'شکل‌های درب از کاتالوگ می‌آیند');
}

/* ------------------------------------------- کاتالوگ ناقص */
console.log('\n[مرورگر] بستهٔ ناقص نباید بی‌صدا پذیرفته شود');
{
  const ctx = browserContext();
  for (const file of panelScriptOrder()) loadInto(ctx, file);
  assert(ctx.KalaxaCatalog.load({ door_shapes: {} }) === false,
    'بستهٔ ناقص رد می‌شود تا پنل بتواند خطا نشان دهد');
  assert(ctx.KalaxaCatalog.load(null) === false, 'بستهٔ تهی رد می‌شود');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed === 0 ? 0 : 1);
