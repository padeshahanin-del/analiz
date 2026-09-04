/** تست موتور چک استاندارد — اجرا: node test_rules.js
 * قبل از این فایل، kalaxa-rules.js هیچ تست اختصاصی نداشت — همین نبودِ پوشش
 * گذاشت باگ #9 (هشدار غلط تداخل/ارتفاع روی سند نیمه‌جانمایی‌شده) نامرئی بماند. */
'use strict';
const path = require('path');
const fs = require('fs');
const UI = path.join(__dirname, '..', '..', 'ui');
const Rules = require(path.join(UI, 'kalaxa-rules.js'));
const Adapter = require(path.join(UI, 'kalaxa-doc-adapter.js'));
const Placement = require(path.join(UI, 'kalaxa-placement.js'));

const goldenRaw = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'kalaxa_doc_v2_golden.json'), 'utf8');
const golden = () => JSON.parse(goldenRaw);

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}
function addUnit(doc, id, w, h, spaceId) {
  doc.entities.units.push({ id, space_id: spaceId, name: 'u-' + id.slice(-4),
    kind: 'base', width_mm: w, depth_mm: 560, height_mm: h, params: {} });
}

console.log('\n[رگرسیون باگ #9 — جانمایی ناقص نباید تداخل کاذب بسازد]');
{
  const doc = golden();
  const spaceId = doc.entities.units[0].space_id;
  addUnit(doc, '00000000-0000-4000-8000-0000000000e1', 500, 720, spaceId);
  doc.entities.units[0].placement = { x_mm: 0, y_mm: 0, z_mm: 100, rotation_z_deg: 0 };
  // یونیت دوم عمداً بدون placement — دقیقاً حالت طبیعیِ کار در حال انجام

  const ad = Adapter.toSnapshot(doc);
  assert(ad.ok, 'نگاشت موفق', (ad.errors || []).join('|'));
  assert(ad.snapshot.placement_complete === false, 'پرچم placement_complete درست false است');

  const res = Rules.run(ad.snapshot);
  const fakeOverlap = res.findings.filter(f => f.rule_id === 'R1_overlap');
  const fakeHeight = res.findings.filter(f => f.rule_id === 'R2_wall_mount_height');
  assert(fakeOverlap.length === 0, 'بدون تداخل کاذب (قبل از رفع: ۱ بود)');
  assert(fakeHeight.length === 0, 'بدون هشدار ارتفاع کاذب');
  assert(res.findings.some(f => f.rule_id === 'R0_placement_incomplete'),
    'یادداشت توضیحی «چک‌های وابسته به موقعیت رد شدند» وجود دارد');
  assert(res.ok, 'با فقط یک info، نتیجهٔ کلی همچنان ok است');
}

console.log('\n[بعد از تکمیل جانمایی: چک‌های موقعیتی دوباره فعال می‌شوند]');
{
  const doc = golden();
  const lay = Placement.autoLayoutRow(doc, { gap_mm: 20, z_mm: 100 });
  const ad = Adapter.toSnapshot(lay.doc);
  assert(ad.snapshot.placement_complete === true, 'کامل شد');
  const res = Rules.run(ad.snapshot);
  assert(!res.findings.some(f => f.rule_id === 'R0_placement_incomplete'),
    'دیگر skip نمی‌شود');
}

console.log('\n[تداخل واقعی هنوز درست تشخیص داده می‌شود — رفع #9 نباید تشخیص واقعی را هم خاموش کند]');
{
  const doc = golden();
  const spaceId = doc.entities.units[0].space_id;
  addUnit(doc, '00000000-0000-4000-8000-0000000000e2', 500, 720, spaceId);
  doc.entities.units[0].placement = { x_mm: 0, y_mm: 0, z_mm: 100, rotation_z_deg: 0 };
  doc.entities.units[1].placement = { x_mm: 200, y_mm: 0, z_mm: 100, rotation_z_deg: 0 }; // واقعاً روی‌هم

  const ad = Adapter.toSnapshot(doc);
  assert(ad.snapshot.placement_complete === true, 'هر دو جانمایی دارند');
  const res = Rules.run(ad.snapshot);
  const real = res.findings.filter(f => f.rule_id === 'R1_overlap');
  assert(real.length === 1, 'تداخل واقعی همچنان تشخیص داده می‌شود', JSON.stringify(real));
}

console.log('\n[R4/R5/R6 ابعادمحورند — نباید تحت‌تأثیر جانمایی ناقص خاموش شوند]');
{
  const doc = golden();
  const spaceId = doc.entities.units[0].space_id;
  // یونیت با عرض خارج از مدول ۵۰ (R5) و بدون هیچ placement (نه این یکی، نه بقیه)
  addUnit(doc, '00000000-0000-4000-8000-0000000000e3', 517, 720, spaceId);
  const ad = Adapter.toSnapshot(doc);
  assert(ad.snapshot.placement_complete === false, 'جانمایی ناقص');
  const res = Rules.run(ad.snapshot);
  assert(res.findings.some(f => f.rule_id === 'R5_module_width'),
    'R5 (ابعادمحور) با وجود جانمایی ناقص همچنان اجرا شد');
}

console.log('\n[سازگاری عقب‌رو: snapshot بدون فیلد placement_complete مثل قبل رفتار می‌کند]');
{
  const doc = golden();
  const ad = Adapter.toSnapshot(doc);
  delete ad.snapshot.placement_complete; // شبیه‌سازی snapshot ساخته‌شده با آداپتور قدیمی‌تر
  const res = Rules.run(ad.snapshot);
  assert(!res.findings.some(f => f.rule_id === 'R0_placement_incomplete'),
    'بدون فیلد، محافظه‌کارانه true فرض و رفتار قبلی حفظ می‌شود');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
