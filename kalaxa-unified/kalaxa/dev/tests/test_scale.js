/** تست مقیاس/کارایی — سند ۶۰ یونیت/۶۰۰ قطعه — اجرا: node test_scale.js
 * بودجه‌ها عمداً سخاوتمندانه (×۵ اندازه‌گیری روی Node 22) تا فقط پس‌رفت واقعی را بگیرند. */
'use strict';
const path = require('path');
const fs = require('fs');
const UI = path.join(__dirname, '..', '..', 'ui');
const Pl = require(path.join(UI, 'kalaxa-placement.js'));
const Adapter = require(path.join(UI, 'kalaxa-doc-adapter.js'));
const Nesting = require(path.join(UI, 'kalaxa-nesting.js'));
const Hardware = require(path.join(UI, 'kalaxa-hardware.js'));
const InstallMap = require(path.join(UI, 'kalaxa-install-map.js'));

const base = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'kalaxa_doc_v2_golden.json'), 'utf8'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}
function ms(fn) { const t = Date.now(); const v = fn(); return [Date.now() - t, v]; }
function uuid(i, t) {
  return '00000000-0000-4000-8000-' + String(t).padStart(4, '0') + String(i).padStart(8, '0');
}

// سند بزرگ: ۶۰ یونیت × ۱۰ قطعه + یراق صریح
const doc = JSON.parse(JSON.stringify(base));
const u0 = doc.entities.units[0], p0 = doc.entities.parts[0];
doc.entities.units = []; doc.entities.parts = []; doc.entities.hardware = [];
// عملیات هم باید پاک شود. سند پایه یک سوراخ روی قطعه‌ای دارد که این‌جا
// حذف می‌شود، و عملیاتِ بی‌قطعه سند را **نامعتبر** می‌کند — همان قاعدهٔ
// ارجاعی که `validator.rb` دارد (operations.part_id → parts). تا ۳.۷۱
// آداپتور عملیات را اصلاً نمی‌خواند، پس این ناسازگاری دیده نمی‌شد و
// فیکسچرِ کارایی روی سندی می‌دوید که در واقعیت رد می‌شد.
doc.entities.operations = [];
for (let i = 0; i < 60; i++) {
  const u = JSON.parse(JSON.stringify(u0));
  u.id = uuid(i, 1); u.name = 'unit' + i; u.width_mm = 600;
  doc.entities.units.push(u);
  for (let j = 0; j < 10; j++) {
    const p = JSON.parse(JSON.stringify(p0));
    p.id = uuid(i * 10 + j, 2); p.unit_id = u.id;
    p.length_mm = 400 + (j * 13) % 300; p.width_mm = 300 + (j * 7) % 200;
    doc.entities.parts.push(p);
  }
  doc.entities.hardware.push({ id: uuid(i, 3), unit_id: u.id,
    name: 'لولا', kind: 'hinge', qty: 2, sku: 'H-110' });
}

console.log('\n[بودجه‌های کارایی — ۶۰ یونیت / ۶۰۰ قطعه]');
{
  const [tLay, lay] = ms(() => Pl.autoLayoutRow(doc, { gap_mm: 20 }));
  assert(lay.ok && lay.changed === 60 && tLay < 100, 'autoLayoutRow < 100ms', tLay + 'ms');

  const [tAd, r] = ms(() => Adapter.toSnapshot(lay.doc));
  assert(r.ok && tAd < 100, 'adapter < 100ms', tAd + 'ms');
  assert(r.snapshot.parts_flat.length === 600 && r.explicit_hardware.length === 60,
    'حجم درست منتقل شد');

  const [tN, nest] = ms(() => Nesting.run(r.snapshot));
  assert(nest.ok && tN < 1000, 'nesting < 1000ms', tN + 'ms');

  const [tB, bom] = ms(() => Hardware.bom(r.snapshot, { explicit: r.explicit_hardware }));
  assert(bom.explicit_count === 60 && tB < 100, 'bom+merge < 100ms', tB + 'ms');
  const expRow = bom.items.find(i => /صریح از سند/.test(i.detail_fa));
  assert(!!expRow && expRow.qty === 120, 'گروه‌بندی صریح: ۶۰×۲ = ۱۲۰');

  const [tW, walls] = ms(() => InstallMap.groupWalls(r.snapshot.cabinets));
  assert(Array.isArray(walls) && walls.length === 1 && tW < 200,
    'groupWalls: یک ردیف → یک دیوار، < 200ms', tW + 'ms | walls=' + walls.length);
  assert(walls[0].items.length === 60, 'همه ۶۰ کابینت روی دیوار');

  const [tE] = ms(() => {
    for (let k = 0; k < 100; k++) {
      Pl.setPlacement(lay.doc, doc.entities.units[30].id,
        { x_mm: k, y_mm: 0, z_mm: 0, rotation_z_deg: 0 });
    }
  });
  assert(tE < 50, '۱۰۰ ویرایش placement < 50ms (کپی ساختاری)', tE + 'ms');
}

console.log('\n[کپی ساختاری — خلوص و اشتراک]');
{
  const r = Pl.setPlacement(doc, doc.entities.units[10].id,
    { x_mm: 5, y_mm: 0, z_mm: 0, rotation_z_deg: 0 });
  assert(!('placement' in doc.entities.units[10]), 'ورودی دست‌نخورده');
  assert(r.doc.entities.parts === doc.entities.parts, 'parts با ارجاع مشترک (بدون کپی)');
  assert(r.doc.entities.units[9] === doc.entities.units[9], 'یونیت‌های دیگر مشترک');
  assert(r.doc.entities.units[10] !== doc.entities.units[10], 'فقط یونیت هدف کپی شد');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
