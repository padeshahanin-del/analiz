/** تست ویرایشگر جانمایی — اجرا: node test_placement.js */
'use strict';
const path = require('path');
const fs = require('fs');
const UI = path.join(__dirname, '..', '..', 'ui');
const Pl = require(path.join(UI, 'kalaxa-placement.js'));
const Adapter = require(path.join(UI, 'kalaxa-doc-adapter.js'));

const doc = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'kalaxa_doc_v2_golden.json'), 'utf8'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

console.log('\n[اعتبارسنجی placement]');
{
  assert(Pl.valid({ x_mm: 0, y_mm: 0, z_mm: 0, rotation_z_deg: 359 }), 'مرز بالای چرخش');
  assert(!Pl.valid({ x_mm: 0, y_mm: 0, z_mm: 0, rotation_z_deg: 360 }), '۳۶۰ رد');
  assert(!Pl.valid({ x_mm: 0.5, y_mm: 0, z_mm: 0, rotation_z_deg: 0 }), 'float رد');
  assert(!Pl.valid({ x_mm: 0, y_mm: 0, z_mm: 0 }), 'کلید کم رد');
  assert(!Pl.valid({ x_mm: 0, y_mm: 0, z_mm: 0, rotation_z_deg: 0, extra: 1 }), 'کلید اضافه رد');
  assert(!Pl.valid([0, 0, 0, 0]) && !Pl.valid(null), 'آرایه/null رد');
}

console.log('\n[setPlacement / clearPlacement]');
{
  const uid = doc.entities.units[0].id;
  const r = Pl.setPlacement(doc, uid, { x_mm: 1200, y_mm: 0, z_mm: 100, rotation_z_deg: 90 });
  assert(r.ok, 'ثبت موفق');
  assert(!doc.entities.units[0].placement, 'ورودی دست‌نخورده (خلوص)');
  assert(r.doc.entities.units[0].placement.x_mm === 1200, 'مقدار نشست');

  const bad = Pl.setPlacement(doc, uid, { x_mm: 1, y_mm: 2, z_mm: 3, rotation_z_deg: 400 });
  assert(!bad.ok && bad.errors.length === 1, 'نامعتبر رد شد');

  const miss = Pl.setPlacement(doc, 'no-such-id', { x_mm: 0, y_mm: 0, z_mm: 0, rotation_z_deg: 0 });
  assert(!miss.ok && /یافت نشد/.test(miss.errors[0]), 'یونیت ناموجود');

  const cleared = Pl.clearPlacement(r.doc, uid);
  assert(cleared.ok && !('placement' in cleared.doc.entities.units[0]),
    'حذف = حذف کلید (نه null) — سازگار با قاعده «نبودِ کلید»');
}

console.log('\n[autoLayoutRow]');
{
  // سند با دو یونیت برای چیدمان
  const d2 = JSON.parse(JSON.stringify(doc));
  const u0 = d2.entities.units[0];
  d2.entities.units.push({ id: '00000000-0000-4000-8000-0000000000a2',
    space_id: u0.space_id, name: 'زمینی ۸۰', kind: 'base',
    width_mm: 800, depth_mm: 560, height_mm: 720, params: {} });

  const r = Pl.autoLayoutRow(d2, { gap_mm: 20, z_mm: 100 });
  assert(r.ok && r.changed === 2, 'هر دو چیده شدند');
  const [a, b] = r.doc.entities.units.map(u => u.placement);
  assert(a.x_mm === 0 && b.x_mm === (u0.width_mm + 20), 'x دومی = عرض اولی + gap');
  assert(a.z_mm === 100 && b.z_mm === 100 && a.rotation_z_deg === 0, 'z و چرخش مشترک');

  // only_unplaced: جانمایی موجود حفظ، بقیه از انتهای ردیف
  const d3 = JSON.parse(JSON.stringify(r.doc));
  d3.entities.units.push({ id: '00000000-0000-4000-8000-0000000000a3',
    space_id: u0.space_id, name: 'زمینی ۴۵', kind: 'base',
    width_mm: 450, depth_mm: 560, height_mm: 720, params: {} });
  const r2 = Pl.autoLayoutRow(d3, { gap_mm: 20, z_mm: 100, only_unplaced: true });
  assert(r2.changed === 1, 'فقط جانمایی‌نشده');
  const c = r2.doc.entities.units[2].placement;
  assert(c.x_mm === b.x_mm + 800 + 20, 'ادامه از انتهای ردیف موجود');
  assert(JSON.stringify(r2.doc.entities.units[0].placement) === JSON.stringify(a),
    'جانمایی موجود دست‌نخورده');

  // یونیت بدون عرض معتبر جانمایی نمی‌شود
  const d4 = JSON.parse(JSON.stringify(doc));
  d4.entities.units[0].width_mm = 0;
  const r3 = Pl.autoLayoutRow(d4, {});
  assert(r3.changed === 0 && !('placement' in r3.doc.entities.units[0]), 'عرض صفر → رد');
}

console.log('\n[status + زنجیره تا آداپتور]');
{
  assert(Pl.status(doc).complete === false, 'سند طلایی ناقص');
  const r = Pl.autoLayoutRow(doc, { gap_mm: 0, z_mm: 100 });
  const st = Pl.status(r.doc);
  assert(st.complete && st.placed === st.total, 'پس از چیدمان کامل');
  const snap = Adapter.toSnapshot(r.doc);
  assert(snap.ok, 'آداپتور سند چیده‌شده را می‌پذیرد', (snap.errors || []).join('|'));
  assert(!snap.limitations.some(l => /نقشه نصب/.test(l)), 'limitation نقشه نصب رفع شد');
  assert(snap.snapshot.cabinets[0].world_transform.origin_cm[2] === 10, 'z=100mm → 10cm');
}

console.log('\n[checkOverlaps]');
{
  const d = JSON.parse(JSON.stringify(doc));
  const u0 = d.entities.units[0]; // width 600, height 720 فرضی سند طلایی
  function addUnit(id, w, h) {
    d.entities.units.push({ id, space_id: u0.space_id, name: 'u' + id.slice(-2),
      kind: 'base', width_mm: w, depth_mm: 560, height_mm: h, params: {} });
  }
  addUnit('00000000-0000-4000-8000-0000000000b1', 600, 720);
  addUnit('00000000-0000-4000-8000-0000000000b2', 600, 720);
  addUnit('00000000-0000-4000-8000-0000000000b3', 600, 600);
  const set = (i, pl) => { d.entities.units[i].placement = pl; };
  set(0, { x_mm: 0,    y_mm: 0, z_mm: 100, rotation_z_deg: 0 });   // 0..w0
  const w0 = d.entities.units[0].width_mm;
  set(1, { x_mm: w0,   y_mm: 0, z_mm: 100, rotation_z_deg: 0 });   // لبه‌به‌لبه
  set(2, { x_mm: w0 + 400, y_mm: 0, z_mm: 100, rotation_z_deg: 0 }); // ۲۰۰mm روی قبلی
  set(3, { x_mm: 0,    y_mm: 0, z_mm: 900, rotation_z_deg: 0 });   // دیواری بالای اولی (z جدا)

  const ovs = Pl.checkOverlaps(d);
  assert(ovs.length === 1, 'دقیقاً یک هم‌پوشانی', JSON.stringify(ovs));
  assert(ovs[0].overlap_mm === 200, 'مقدار هم‌پوشانی ۲۰۰mm', ovs[0] && ovs[0].overlap_mm);

  // لبه‌به‌لبه مجاز
  d.entities.units[2].placement.x_mm = w0 + 600; // حالا بعد از دومی
  assert(Pl.checkOverlaps(d).length === 0, 'تماس لبه و z جدا مجاز');

  // چرخش متفاوت = دیوار دیگر
  d.entities.units[2].placement = { x_mm: 0, y_mm: 0, z_mm: 100, rotation_z_deg: 90 };
  assert(Pl.checkOverlaps(d).length === 0, 'دیوار عمود جدا حساب شد');

  // خط موازی دورتر از رواداری
  d.entities.units[2].placement = { x_mm: 0, y_mm: 3000, z_mm: 100, rotation_z_deg: 0 };
  assert(Pl.checkOverlaps(d).length === 0, 'خط موازی دور (y=3000) هم‌پوشان نیست');
  d.entities.units[2].placement = { x_mm: 0, y_mm: 50, z_mm: 100, rotation_z_deg: 0 };
  assert(Pl.checkOverlaps(d).length >= 1, 'داخل رواداری خط (y=50) هم‌پوشان است');

  // رفع #8: ۳۵۹° و ۰° باید همان دیوار حساب شوند (رواداری زاویه‌ای، پیش‌تر false negative بود)
  set(0, { x_mm: 0,  y_mm: 0, z_mm: 100, rotation_z_deg: 0 });
  set(1, { x_mm: 200, y_mm: 0, z_mm: 100, rotation_z_deg: 359 }); // عملاً همان دیوار
  d.entities.units[2].placement = { x_mm: 0, y_mm: 0, z_mm: 900, rotation_z_deg: 0 }; // z جدا، بی‌اثر
  const wrapOvs = Pl.checkOverlaps(d);
  assert(wrapOvs.some(o => (o.a_id === d.entities.units[0].id || o.b_id === d.entities.units[0].id)),
    '۰° و ۳۵۹° یک دیوار حساب شدند — تداخل واقعی گرفته شد', JSON.stringify(wrapOvs));

  // اما دیوارهای واقعاً عمود (۹۰° فاصله) نباید به‌اشتباه یکی حساب شوند
  set(1, { x_mm: 200, y_mm: 0, z_mm: 100, rotation_z_deg: 90 });
  assert(!Pl.checkOverlaps(d).some(o => o.a_id === d.entities.units[0].id || o.b_id === d.entities.units[0].id),
    'رواداری زاویه دیوارهای عمود را قاطی نمی‌کند');
}

console.log('\n[سرتاسری: سند → آداپتور → SVG نقشه نصب]');
{
  const IM = require(path.join(UI, 'kalaxa-install-map.js'));
  const r = Pl.autoLayoutRow(doc, { gap_mm: 0, z_mm: 100 });
  const snap = Adapter.toSnapshot(r.doc).snapshot;
  const maps = IM.renderAll(snap);
  assert(Array.isArray(maps) && maps.length === 1, 'یک دیوار رندر شد');
  assert(/<svg/.test(maps[0].svg) && /دیوار/.test(maps[0].svg), 'خروجی SVG معتبر با برچسب فارسی');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
