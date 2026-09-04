/** تست هستهٔ نمایشگر وب — اجرا: node tests/test_viewer_core.js */
'use strict';
const path = require('path');
const fs = require('fs');
const V = require(path.join(__dirname, '..', 'assets', 'viewer-core.js'));
const Pl = require(path.join(__dirname, '..', 'assets', 'engines', 'kalaxa-placement.js'));

const goldenRaw = fs.readFileSync(path.join(__dirname, 'fixtures', 'doc_v2_expected.json'), 'utf8');
const golden = () => JSON.parse(goldenRaw);

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}
function mkEnv(doc, extra) {
  return JSON.stringify(Object.assign(
    { format: 'kalaxa-doc', schema_version: 3, checksum: '0'.repeat(64), doc: doc }, extra || {}));
}

console.log('\n[parseEnvelope]');
{
  assert(!V.parseEnvelope('{bad').ok, 'JSON خراب رد');
  assert(!V.parseEnvelope(JSON.stringify({ format: 'x', schema_version: 1, doc: {} })).ok, 'format ناشناخته رد');
  assert(!V.parseEnvelope(mkEnv(golden(), { schema_version: 4 })).ok, 'schema جدیدتر رد');
  assert(V.parseEnvelope(mkEnv(golden())).ok, 'پاکت سالم پذیرفته');
  const legacy = JSON.stringify({ format: 'kabinetyar-doc', schema_version: 1, doc: golden() });
  assert(V.parseEnvelope(legacy).ok, 'پاکت میراثی v1 پذیرفته');
}

console.log('\n[render — سند جانمایی‌نشده]');
{
  const r = V.render(mkEnv(golden(), { revision: 4, updated_at: '2026-07-23T09:00:00Z' }));
  assert(r.ok, 'رندر موفق', (r.errors || []).join('|'));
  const ids = r.sections.map(s => s.id);
  assert(ids.join(',') === 'summary,cutmap,material,hardware',
    'بدون جانمایی: نقشه نصب حذف، بقیه حاضر', ids.join(','));
  assert(r.meta.revision === 4 && r.meta.schema_version === 3, 'متادیتای پاکت منتقل شد');
  assert(/<svg/.test(r.sections[1].html), 'نقشه برش SVG دارد');
  assert(r.limitations.some(l => /نقشه نصب/.test(l)), 'محدودیت جانمایی گزارش شد');
  const hw = r.sections.find(s => s.id === 'hardware');
  assert(/صریح از سند/.test(hw.html) && /H-110/.test(hw.html), 'یراق صریح در BOM آمد');
  const mat = r.sections.find(s => s.id === 'material');
  assert(/MDF/.test(mat.html) && /۰٫۷|0\.7|۰\.۷/.test(mat.html.replace('٬', '٫')) || /0\.7/.test(mat.html),
    'ردیف متریال با مساحت', mat.html.slice(0, 120));
}

console.log('\n[render — سند جانمایی‌شده کامل]');
{
  const lay = Pl.autoLayoutRow(golden(), { gap_mm: 0, z_mm: 100 });
  const r = V.render(mkEnv(lay.doc));
  assert(r.ok, 'رندر موفق');
  const ids = r.sections.map(s => s.id);
  assert(ids.includes('install'), 'نقشه نصب حاضر شد', ids.join(','));
  assert(/<svg/.test(r.sections.find(s => s.id === 'install').html), 'SVG نصب');
  assert(!r.limitations.some(l => /نقشه نصب/.test(l)), 'محدودیت جانمایی رفع شد');
}

console.log('\n[render — هشدار هم‌پوشانی در نقشه نصب]');
{
  const d = golden();
  const u0 = d.entities.units[0];
  d.entities.units.push({ id: '00000000-0000-4000-8000-0000000000c1',
    space_id: u0.space_id, name: 'روی‌هم', kind: 'base',
    width_mm: 600, depth_mm: 560, height_mm: 720, params: {} });
  u0.placement = { x_mm: 0, y_mm: 0, z_mm: 100, rotation_z_deg: 0 };
  d.entities.units[1].placement = { x_mm: 200, y_mm: 0, z_mm: 100, rotation_z_deg: 0 };
  const r = V.render(mkEnv(d));
  const inst = r.sections.find(s => s.id === 'install');
  assert(!!inst && /هم‌پوشانی جانمایی/.test(inst.html), 'هشدار هم‌پوشانی نمایش داده شد');
}

console.log('\n[render — خطاهای سند]');
{
  const d = golden();
  d.entities.materials = d.entities.materials.filter(m => m.kind !== 'sheet');
  const r = V.render(mkEnv(d));
  assert(!r.ok && r.errors.some(e => /نگاشت سند شکست/.test(e)), 'سند بدون ورق → خطای تمیز');
  assert(r.sections.length === 0, 'بدون بخش نمایشی');
}

console.log('\n[امنیت — escape نام کاربر]');
{
  const d = golden();
  d.entities.units[0].name = '<img src=x onerror=1>';
  d.entities.units[0].placement = { x_mm: 0, y_mm: 0, z_mm: 100, rotation_z_deg: 0 };
  const r = V.render(mkEnv(d));
  const all = r.sections.map(s => s.html).join('');
  assert(!/onerror=1>/.test(all.replace(/&lt;img[^&]*&gt;/g, '')) &&
         /&lt;img/.test(JSON.stringify(all)) || !/<img src=x/.test(all),
    'نام مخرب escape شد (به‌جز داخل SVG موتورها که خودشان esc دارند)',
    /<img src=x/.test(all) ? 'RAW FOUND' : '');
  assert(!/<img src=x onerror=1>/.test(all), 'رشتهٔ خام تزریق نشد');
}

console.log('\n[جبرگرایی]');
{
  const e = mkEnv(golden(), { revision: 2 });
  assert(JSON.stringify(V.render(e)) === JSON.stringify(V.render(e)), 'دو رندر یکسان');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
