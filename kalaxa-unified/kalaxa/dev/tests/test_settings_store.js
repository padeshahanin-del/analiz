/** تست v1.2.1: تنظیمات + انبار ماندگار آفکات — اجرا: node test_settings_store.js */
'use strict';
const path = require('path');
const fs = require('fs');
const UI = path.join(__dirname, '..', '..', 'ui');
const Nesting = require(path.join(UI, 'kalaxa-nesting.js'));
const Settings = require(path.join(UI, 'kalaxa-settings.js'));
const Store = require(path.join(UI, 'kalaxa-offcut-store.js'));
const Validator = require(path.join(UI, 'kalaxa-nesting-validator.js'));

const fx = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'golden_kitchen_snapshot.json'), 'utf8'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

/* ------------------------------------------------------------- تنظیمات */
console.log('\n[تنظیمات] پیش‌فرض معتبر و ایزوله');
{
  const d1 = Settings.defaults(), d2 = Settings.defaults();
  d1.sheets[0].width_mm = 1;
  assert(d2.sheets[0].width_mm === 3660, 'defaults ایزوله (کلون)');
  assert(Settings.validate(Settings.defaults()).ok, 'پیش‌فرض‌ها معتبر');
}

console.log('\n[تنظیمات] اعتبارسنجی موارد خراب');
{
  const bad = Settings.defaults();
  bad.sheets[1].sheet_id = bad.sheets[0].sheet_id;
  assert(!Settings.validate(bad).ok, 'sheet_id تکراری رد شد');

  const bad2 = Settings.defaults();
  bad2.sheets[0].width_mm = NaN;
  assert(!Settings.validate(bad2).ok, 'width NaN رد شد');

  const bad3 = Settings.defaults();
  bad3.cutting.kerf_mm = 50;
  assert(Settings.validate(bad3).errors.some(e => /غیرمنطقی/.test(e)), 'kerf=50 رد شد');

  const bad4 = Settings.defaults();
  bad4.sheets[0].trim_margin_mm = 2000;
  assert(!Settings.validate(bad4).ok, 'trim بزرگ‌تر از ورق رد شد');

  assert(!Settings.validate({ sheets: [] }).ok, 'sheets خالی رد شد');
}

console.log('\n[تنظیمات] اعمال روی snapshot + آشتی‌سنجی');
{
  const origKerf = fx.cutting.kerf_mm;
  const origSheetCount = fx.sheets.length;
  const st = Settings.defaults();
  st.cutting.kerf_mm = 3;
  st.sheets = st.sheets.filter(s => s.sheet_id !== 'hdf_3'); // ورق مصرفی fixture حذف
  const r = Settings.applyToSnapshot(fx, st);
  assert(r.snapshot.cutting.kerf_mm === 3, 'kerf از تنظیمات اعمال شد');
  // عدد ثابت ننویس: کاتالوگ ورق رشد می‌کند (شیشه اضافه شد). نیت این است که
  // «ورق‌های تنظیمات جایگزین ورق‌های snapshot شدند»، نه اینکه دقیقاً سه‌تا باشند.
  assert(r.snapshot.sheets.length === st.sheets.length, 'sheets جایگزین شد',
    'انتظار ' + st.sheets.length + '، دریافت ' + r.snapshot.sheets.length);
  assert(!r.snapshot.sheets.some(s => s.sheet_id === 'hdf_3'),
    'ورق حذف‌شده از تنظیمات در snapshot نماند');
  assert(r.warnings.some(w => /hdf_3/.test(w)), 'هشدار ارجاع به ورق حذف‌شده', r.warnings.join('|'));
  // نیت: applyToSnapshot ورودی را تغییر ندهد. با **مقدار اولیه** سنجیده می‌شود،
  // نه با عددی که با رشد کاتالوگ کهنه می‌شود.
  assert(fx.cutting.kerf_mm === origKerf && fx.sheets.length === origSheetCount,
    'snapshot اصلی دست‌نخورده',
    'kerf ' + origKerf + '→' + fx.cutting.kerf_mm +
    '، ورق ' + origSheetCount + '→' + fx.sheets.length);
  // nesting باید قطعات hdf را با خطا رد کند، نه بی‌صدا
  const nr = Nesting.run(r.snapshot);
  assert(nr.ok === false && nr.errors.some(e => /hdf_3/.test(e)), 'nesting ارجاع ناموجود را رد کرد');
}
{
  // اعمال کامل بدون حذف: نتیجه معتبر و برابر تنظیمات
  const st = Settings.defaults();
  st.sheets.find(s => s.sheet_id === 'mdf_white_16').width_mm = 2800;
  st.sheets.find(s => s.sheet_id === 'mdf_white_16').height_mm = 2100;
  const r = Settings.applyToSnapshot(fx, st);
  const nr = Nesting.run(r.snapshot);
  assert(nr.ok, 'nesting با ورق تغییرکرده از تنظیمات');
  assert(Validator.validate(r.snapshot, nr).ok, 'اعتبارسنج مستقل پاس');
}

/* --------------------------------------------------------------- انبار */
console.log('\n[انبار] نرمال‌سازی فایل خراب');
{
  const n1 = Store.normalize(null);
  assert(n1.store.offcuts.length === 0, 'null → انبار خالی');
  const n2 = Store.normalize({ offcuts: [
    { offcut_id: 'a', sheet_id: 's1', width_mm: 500, height_mm: 400 },
    { offcut_id: 'a', sheet_id: 's1', width_mm: 500, height_mm: 400 },
    { offcut_id: 'b', sheet_id: 's1', width_mm: NaN, height_mm: 400 },
    { bad: true }
  ]});
  assert(n2.store.offcuts.length === 1, 'تکراری و خراب حذف شد', 'got ' + n2.store.offcuts.length);
  assert(n2.warnings.length === 3, '۳ هشدار', n2.warnings.join('|'));
}

console.log('\n[انبار] چرخه کامل: برداشت → استفاده → مصرف');
{
  // پروژه ۱: nesting fixture و برداشت آفکات‌ها به انبار
  const r1 = Nesting.run(fx);
  let store = Store.emptyStore();
  const h = Store.harvest(store, r1, fx, { min_mm: 200, project: 'proj1', now: '2026-07-13' });
  store = h.store;
  assert(h.added > 0, 'آفکات برداشت شد (' + h.added + ' رکورد)');
  assert(store.offcuts.every(o => /^proj1:/.test(o.offcut_id)), 'شناسه قطعی با پیشوند پروژه');
  const h2 = Store.harvest(store, r1, fx, { min_mm: 200, project: 'proj1', now: '2026-07-13' });
  assert(h2.added === 0, 'برداشت مجدد همان پروژه تکراری نمی‌سازد');

  const metaOk = store.offcuts.every(o => o.material && o.thickness_mm > 0 && o.created_at === '2026-07-13');
  assert(metaOk, 'متادیتا (جنس/ضخامت/تاریخ) از snapshot پر شد');

  // پروژه ۲: همان fixture با انبار — باید آفکات مصرف شود
  const s2 = JSON.parse(JSON.stringify(fx));
  s2.stock_offcuts = Store.toStockOffcuts(store);
  assert(s2.stock_offcuts.length === Store.stats(store).available, 'toStockOffcuts فقط مصرف‌نشده‌ها');
  const r2 = Nesting.run(s2);
  assert(r2.ok, 'پروژه ۲ با انبار ok');
  assert(r2.total_stock_offcuts_used > 0, 'آفکات انبار مصرف شد (' + r2.total_stock_offcuts_used + ')');
  assert(Validator.validate(s2, r2).ok, 'اعتبارسنج مستقل پروژه ۲ پاس');

  const m = Store.markConsumed(store, r2, { now: '2026-07-14', project: 'proj2' });
  assert(m.marked === r2.total_stock_offcuts_used, 'markConsumed = تعداد مصرف واقعی',
    m.marked + ' vs ' + r2.total_stock_offcuts_used);
  const st = Store.stats(m.store);
  assert(st.consumed === m.marked && st.total === store.offcuts.length, 'آمار انبار درست');
  const consumedRec = m.store.offcuts.find(o => o.consumed);
  assert(consumedRec.consumed_project === 'proj2' && consumedRec.consumed_at === '2026-07-14',
    'رد مصرف ثبت شد');
  // مصرف‌شده دیگر به nesting نمی‌رود
  assert(Store.toStockOffcuts(m.store).length === st.available, 'مصرف‌شده از ورودی nesting حذف شد');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
