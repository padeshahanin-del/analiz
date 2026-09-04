/** تست یکپارچگی آداپتور کالاکسا — اجرا: node test_doc_adapter.js */
'use strict';
const path = require('path');
const fs = require('fs');
const UI = path.join(__dirname, '..', '..', 'ui');
const Adapter = require(path.join(UI, 'kalaxa-doc-adapter.js'));
const Schema = require(path.join(UI, 'kalaxa-schema.js'));
const Nesting = require(path.join(UI, 'kalaxa-nesting.js'));
const Validator = require(path.join(UI, 'kalaxa-nesting-validator.js'));
const Report = require(path.join(UI, 'kalaxa-report.js'));

// سند طلایی واقعی کالاکسا (کپی‌شده از test/golden فاز ۰۲)
const doc = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'kalaxa_doc_v2_golden.json'), 'utf8'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

console.log('\n[آداپتور] نگاشت سند طلایی کالاکسا');
{
  const r = Adapter.toSnapshot(doc);
  assert(r.ok, 'نگاشت بدون خطا', (r.errors || []).join('|'));
  const s = r.snapshot;
  assert(s.schema_version === 2, 'snapshot v2');
  assert(s.sheets.length === 1, 'فقط متریال sheet → ورق (نوار PVC نه)', 'got ' + s.sheets.length);
  const sh = s.sheets[0];
  assert(sh.width_mm === 3660 && sh.height_mm === 1830, 'محور بلند = width کالاکسا');
  assert(sh.thickness_mm === 16, 'ضخامت منتقل شد');
  assert(s.cabinets.length === 1 && s.cabinets[0].category === 'base', 'unit → cabinet با category یکسان');
  assert(s.cabinets[0].params.cabinet_width === 60, 'ابعاد mm→cm');
  assert(s.parts_flat.length === 2, 'دو قطعه');
  const side = s.parts_flat.find(p => p.key === 'side');
  assert(!!side && side.count === 1 && side.cabinet_id === s.cabinets[0].kalaxa_id, 'قطعه با ارجاع درست');
  assert(r.limitations.some(l => /نقشه نصب/.test(l)), 'محدودیت placement اعلام شد');
  assert(!r.limitations.some(l => /یراق/.test(l)), 'محدودیت یراق حذف شد (v1.2 عبور می‌دهد)');
  assert(Array.isArray(r.explicit_hardware) && r.explicit_hardware.length === 1 &&
         r.explicit_hardware[0].kind === 'hinge' && r.explicit_hardware[0].qty === 2 &&
         r.explicit_hardware[0].sku === 'H-110', 'یراق صریح عبور داده شد');
}

console.log('\n[زنجیره کامل] doc طلایی → schema → nesting → اعتبارسنج مستقل');
{
  const r = Adapter.toSnapshot(doc);
  const sv = Schema.validateSnapshot(r.snapshot);
  assert(sv.ok, 'خروجی آداپتور از schema کالاکسا پاس می‌شود', sv.errors.join('|'));
  const nest = Nesting.run(r.snapshot);
  assert(nest.ok, 'nesting روی سند کالاکسا', JSON.stringify(nest.errors) + JSON.stringify(nest.unplaced));
  assert(nest.total_sheets === 1, 'دو قطعه در یک ورق', 'got ' + nest.total_sheets);
  const v = Validator.validate(r.snapshot, nest);
  assert(v.ok, 'اعتبارسنج مستقل پاس', v.problems.join('|'));
  assert(v.stats.placed_instances === 2, '۲/۲ نمونه');
}

console.log('\n[نوار لبه] نگاشت edgebanding');
{
  // واقعیت سند طلایی: همه لبه‌چسب‌ها null → edge باید خالی بماند (نگاشت وفادار)
  const r0 = Adapter.toSnapshot(doc);
  const allEmpty = r0.snapshot.parts_flat.every(p => Object.keys(p.edge).length === 0);
  assert(allEmpty, 'لبه‌چسب null → edge خالی (بدون اختراع داده)');
  assert(Report.edgeBanding(r0.snapshot).total_m === 0, 'متراژ نوار = صفر');

  // کیس جهش‌یافته: نوار PVC روی l1 و w1 بدنه چپ
  const g = JSON.parse(JSON.stringify(doc));
  const pvc = g.entities.materials.find(m => m.kind === 'edgeband').id;
  g.entities.parts[0].edgebanding = { l1: pvc, l2: null, w1: pvc, w2: null };
  const r = Adapter.toSnapshot(g);
  assert(r.ok, 'نگاشت با لبه‌چسب معتبر');
  const side = r.snapshot.parts_flat[0];
  assert(side.edge.front === 1 && side.edge.top === 1 && !side.edge.back && !side.edge.bottom,
    'l1→front و w1→top', JSON.stringify(side.edge));
  const eb = Report.edgeBanding(r.snapshot);
  const expect = Math.round((side.cut_length_mm + side.cut_width_mm) / 10) / 100;
  assert(eb.total_m === expect, 'متراژ = طول+عرض یک‌بار (' + expect + 'm)', 'got ' + eb.total_m);
}

console.log('\n[خطاها] ورودی‌های بد');
{
  assert(Adapter.toSnapshot(null).ok === false, 'null رد شد');
  assert(Adapter.toSnapshot({}).ok === false, 'بدون entities رد شد');

  const bad = JSON.parse(JSON.stringify(doc));
  bad.entities.parts[0].material_id = bad.entities.materials.find(m => m.kind === 'edgeband').id;
  const r1 = Adapter.toSnapshot(bad);
  assert(r1.ok === false && r1.errors.some(e => /غیرورق|ناموجود/.test(e)),
    'قطعه روی متریال edgeband رد شد');

  const bad2 = JSON.parse(JSON.stringify(doc));
  bad2.entities.materials[0].sheet_length_mm = null;
  const r2 = Adapter.toSnapshot(bad2);
  assert(r2.ok === false && r2.errors.some(e => /ابعاد ورق/.test(e)), 'ورق بدون ابعاد رد شد');
}

console.log('\n[هیوریستیک grain + override]');
{
  const g = JSON.parse(JSON.stringify(doc));
  g.entities.parts[0].grain = 'length';
  const r1 = Adapter.toSnapshot(g);
  assert(r1.snapshot.sheets[0].has_grain === true, 'grain قطعه → has_grain ورق');
  const p0 = r1.snapshot.parts_flat.find(p => p.part_uid === g.entities.parts[0].id);
  assert(p0.allow_rotation === false, 'grain=length → چرخش ممنوع');
  const r2 = Adapter.toSnapshot(g, { sheet_overrides: {} });
  const ovKey = g.entities.materials[0].id;
  const ov = {}; ov[ovKey] = { has_grain: false, trim_margin_mm: 20 };
  const r3 = Adapter.toSnapshot(g, { sheet_overrides: ov });
  assert(r3.snapshot.sheets[0].has_grain === false && r3.snapshot.sheets[0].trim_margin_mm === 20,
    'override صریح بر هیوریستیک غالب است');
  // nesting هنوز باید سالم باشد
  const nest = Nesting.run(r3.snapshot);
  assert(nest.ok && Validator.validate(r3.snapshot, nest).ok, 'زنجیره با override پاس');
}


console.log('\n[placement — schema v3]');
{
  // ۱) همه یونیت‌ها جانمایی‌شده → world_transform نگاشت می‌شود و limitation حذف
  const placed = JSON.parse(JSON.stringify(doc));
  placed.entities.units.forEach(function (u, i) {
    u.placement = { x_mm: 1200 + i * 700, y_mm: 50, z_mm: 100, rotation_z_deg: 90 };
  });
  const r1 = Adapter.toSnapshot(placed);
  assert(r1.ok, 'نگاشت سند جانمایی‌شده بدون خطا', (r1.errors || []).join('|'));
  const c0 = r1.snapshot.cabinets[0];
  assert(c0.world_transform.origin_cm[0] === 120 &&
         c0.world_transform.origin_cm[1] === 5 &&
         c0.world_transform.origin_cm[2] === 10, 'placement mm → origin_cm');
  assert(c0.world_transform.rotation_z_deg === 90, 'چرخش منتقل شد');
  assert(!r1.limitations.some(l => /نقشه نصب/.test(l)), 'limitation نقشه نصب حذف شد');
  // زنجیره تا نقشه نصب
  const nest1 = Nesting.run(r1.snapshot);
  assert(nest1.ok, 'nesting سند جانمایی‌شده پاس');

  // ۲) جانمایی جزئی → همه-یا-هیچ: transform صفر + limitation با شمارنده
  const partial = JSON.parse(JSON.stringify(placed));
  delete partial.entities.units[0].placement;
  const r2 = Adapter.toSnapshot(partial);
  assert(r2.ok, 'جانمایی جزئی خطا نیست');
  assert(r2.snapshot.cabinets[0].world_transform.origin_cm[0] === 0 &&
         r2.snapshot.cabinets[0].world_transform.rotation_z_deg === 0,
         'جزئی → transform صفر (همه-یا-هیچ)');
  assert(r2.limitations.some(l => /نقشه نصب/.test(l)), 'limitation جزئی اعلام شد');

  // ۳) placement نامعتبر → خطای صریح، نه سکوت
  const bad = JSON.parse(JSON.stringify(placed));
  bad.entities.units[0].placement.rotation_z_deg = 400;
  const r3 = Adapter.toSnapshot(bad);
  assert(r3.errors.some(e => /placement نامعتبر/.test(e)), 'چرخش خارج بازه رد شد');
  const bad2 = JSON.parse(JSON.stringify(placed));
  bad2.entities.units[0].placement.x_mm = 12.5;
  const r4 = Adapter.toSnapshot(bad2);
  assert(r4.errors.some(e => /placement نامعتبر/.test(e)), 'x_mm غیر Integer رد شد');

  // ۴) سند بدون placement (طلایی) رفتار قبلی دارد — جبرگرایی حفظ شود
  const a = Adapter.toSnapshot(placed), b = Adapter.toSnapshot(placed);
  assert(JSON.stringify(a) === JSON.stringify(b), 'نگاشت جانمایی‌شده قطعی است');
}


console.log('\n[ادغام یراق صریح — D-HW-1]');
{
  const Hardware = require(path.join(UI, 'kalaxa-hardware.js'));
  const r = Adapter.toSnapshot(doc);
  const base = Hardware.bom(r.snapshot);

  // ۱) بدون explicit → خروجی مثل v1.0 (فقط پایه و پین در سند طلایی)
  assert(base.items.length === 2 && base.explicit_count === 0, 'بدون explicit مثل قبل');

  // ۲) با explicit عبوری از آداپتور → ردیف صریح افزوده می‌شود
  const merged = Hardware.bom(r.snapshot, { explicit: r.explicit_hardware });
  const exp = merged.items.find(i => /صریح از سند/.test(i.detail_fa));
  assert(!!exp && exp.qty === 2 && /H-110/.test(exp.detail_fa), 'ردیف صریح با sku آمد');

  // ۳) غالب‌بودن صریح بر قاعده، به تفکیک (کابینت، نوع): سند با درب → لولای قاعده‌محور
  const d2 = JSON.parse(JSON.stringify(doc));
  const u = d2.entities.units[0];
  d2.entities.parts.push({ id: '00000000-0000-4000-8000-00000000d001',
    unit_id: u.id, material_id: d2.entities.materials.find(m => m.kind === 'sheet').id,
    name: 'درب', role: 'door', length_mm: 700, width_mm: 400, thickness_mm: 16,
    grain: 'length', edgebanding: { l1: null, l2: null, w1: null, w2: null } });
  const r2 = Adapter.toSnapshot(d2);
  assert(r2.ok, 'سند با درب نگاشت شد', (r2.errors || []).join('|'));
  const ruleOnly = Hardware.bom(r2.snapshot);
  const hingeRule = ruleOnly.items.find(i => i.item_id === 'hinge');
  assert(!!hingeRule && hingeRule.qty === 2, 'قاعده: درب ۷۰۰ → ۲ لولا');
  const withExp = Hardware.bom(r2.snapshot, { explicit: r2.explicit_hardware });
  assert(!withExp.items.find(i => i.item_id === 'hinge'),
    'لولای قاعده‌محور همان کابینت حذف شد (صریح غالب)');
  const expHinge = withExp.items.find(i => /صریح از سند/.test(i.detail_fa));
  assert(!!expHinge && expHinge.qty === 2, 'فقط لولای صریح ماند');
  // دستگیرهٔ قاعده‌محور درب باید بماند (نوع دیگری است)
  assert(withExp.items.find(i => i.item_id === 'handle'), 'نوع‌های دیگر با قاعده پر شدند');

  // ۴) qty نامعتبر در سند → خطای صریح آداپتور
  const bad = JSON.parse(JSON.stringify(doc));
  bad.entities.hardware[0].qty = 0;
  const r3 = Adapter.toSnapshot(bad);
  assert(r3.errors.some(e => /qty نامعتبر/.test(e)), 'qty صفر رد شد');

  // ۵) by_cabinet قرارداد v1.0 را حفظ می‌کند (بدون فیلدهای داخلی)
  const anyCab = Object.values(merged.by_cabinet)[0] || {};
  assert(!('_slides' in anyCab) && !('_dowel' in anyCab), 'فیلد داخلی نشت نکرد');
}

console.log('\n[جبرگرایی] دو نگاشت یکسان');
{
  const a = Adapter.toSnapshot(doc), b = Adapter.toSnapshot(doc);
  assert(JSON.stringify(a) === JSON.stringify(b), 'آداپتور قطعی است');
}

// ── عملیات سند → قطعهٔ snapshot ───────────────────────────────────────
//
// تا ۳.۷۱ آداپتور می‌گفت «عملیات CNC در snapshot جایی ندارد». آن حرف وقتی
// نوشته شد درست بود ولی از ۳.۴۱ به بعد دیگر نبود — قطعه هم `groove` دارد
// هم `features.holes`. یعنی اعترافِ صادقانه به مرور تبدیل به دروغ شده بود
// و سندی که می‌گفت «این قطعه شیار دارد»، بعد از تبدیل شیارش گم می‌شد.
console.log('\n[عملیات] از سند به قطعه');
{
  // کوچک‌ترین سند معتبری که بشود عملیات را رویش آزمود، از روی همان سند
  // طلایی ساخته می‌شود تا با تغییر طرحواره کهنه نشود.
  const withOps = (ops) => {
    const d = JSON.parse(JSON.stringify(doc));
    d.entities.operations = ops;
    return d;
  };
  const firstPartId = doc.entities.parts[0].id;

  // --- شیار ---
  {
    const r = Adapter.toSnapshot(withOps([
      { id: 'op1', part_id: firstPartId, kind: 'groove',
        params: { side: 'back', width_mm: 8 } }
    ]));
    const p = r.snapshot.parts_flat.filter(x => x.part_uid === firstPartId)[0];
    assert(r.ok, 'شیار معتبر خطا نمی‌دهد', (r.errors || []).join('|'));
    assert(p && p.groove.back === 8, 'شیار به قطعه رسید',
           JSON.stringify(p && p.groove));
    assert(r.limitations.some(l => l.indexOf('شیار') >= 0),
           'انتقال گزارش می‌شود');
  }

  // --- شیار بی‌سمت: نباید جای دلخواه بنشیند ---
  {
    const r = Adapter.toSnapshot(withOps([
      { id: 'op1', part_id: firstPartId, kind: 'groove', params: { width_mm: 8 } }
    ]));
    assert(!r.ok, 'شیار بدون سمت رد می‌شود');
    assert(r.errors.some(e => e.indexOf('سمت') >= 0), 'و دلیلش گفته می‌شود',
           r.errors.join('|'));
    const p = r.snapshot.parts_flat.filter(x => x.part_uid === firstPartId)[0];
    assert(p && Object.keys(p.groove).length === 0,
           'و روی هیچ سمتی ننشست', JSON.stringify(p && p.groove));
  }

  // --- شیار بی‌عرض ---
  {
    const r = Adapter.toSnapshot(withOps([
      { id: 'op1', part_id: firstPartId, kind: 'groove', params: { side: 'back' } }
    ]));
    assert(!r.ok && r.errors.some(e => e.indexOf('عرض') >= 0),
           'شیار بدون عرض رد می‌شود', r.errors.join('|'));
  }

  // --- سوراخ ---
  {
    const r = Adapter.toSnapshot(withOps([
      { id: 'op1', part_id: firstPartId, kind: 'drill',
        params: { d_mm: 35, x_mm: 22, y_mm: 100, depth_mm: 13 } }
    ]));
    const p = r.snapshot.parts_flat.filter(x => x.part_uid === firstPartId)[0];
    assert(r.ok, 'سوراخ معتبر خطا نمی‌دهد', (r.errors || []).join('|'));
    assert(p && p.features && p.features.holes.length === 1, 'سوراخ به قطعه رسید');
    const h = p.features.holes[0];
    assert(h.u_mm === 22 && h.v_mm === 100 && h.dia_mm === 35,
           'مختصات و قطر درست منتقل شدند', JSON.stringify(h));
    assert(h.depth_mm === 13, 'عمق منتقل شد');
    assert(p.machined === true, 'قطعه «کار ماشین» علامت خورد');
  }

  // --- عمق نامعلوم: حدس زده نمی‌شود ---
  {
    const r = Adapter.toSnapshot(withOps([
      { id: 'op1', part_id: firstPartId, kind: 'drill',
        params: { d_mm: 35, x_mm: 22, y_mm: 100 } }
    ]));
    const p = r.snapshot.parts_flat.filter(x => x.part_uid === firstPartId)[0];
    assert(p.features.holes[0].depth_mm === null,
           'عمقِ نداده‌شده null می‌ماند نه عددِ ساختگی',
           String(p.features.holes[0].depth_mm));
    assert(p.features.holes[0].through === false,
           'و سرتاسری هم فرض نمی‌شود');
  }

  // --- سوراخ ناقص ---
  {
    const r = Adapter.toSnapshot(withOps([
      { id: 'op1', part_id: firstPartId, kind: 'drill', params: { d_mm: 35 } }
    ]));
    assert(!r.ok && r.errors.some(e => e.indexOf('مختصات') >= 0),
           'سوراخ بدون مختصات رد می‌شود', r.errors.join('|'));
    const p = r.snapshot.parts_flat.filter(x => x.part_uid === firstPartId)[0];
    assert(!p.features || !(p.features.holes || []).length,
           'و سوراخِ بی‌جا ساخته نمی‌شود');
  }

  // --- cut: جا ندارد، ولی سکوت هم نمی‌شود ---
  {
    const r = Adapter.toSnapshot(withOps([
      { id: 'op1', part_id: firstPartId, kind: 'cut', params: {} }
    ]));
    assert(r.ok, 'cut خطا نیست');
    assert(r.limitations.some(l => l.indexOf('cut') >= 0),
           'ولی صریح اعلام می‌شود', r.limitations.join('|'));
  }

  // --- part_id غلط ---
  {
    const r = Adapter.toSnapshot(withOps([
      { id: 'op1', part_id: 'no-such-part', kind: 'groove',
        params: { side: 'back', width_mm: 8 } }
    ]));
    assert(!r.ok && r.errors.some(e => e.indexOf('اشاره') >= 0),
           'عملیات یتیم گزارش می‌شود', r.errors.join('|'));
  }

  // --- نوع ناشناخته ---
  {
    const r = Adapter.toSnapshot(withOps([
      { id: 'op1', part_id: firstPartId, kind: 'engrave', params: {} }
    ]));
    assert(!r.ok && r.errors.some(e => e.indexOf('ناشناخته') >= 0),
           'نوع ناشناخته بی‌صدا دور ریخته نمی‌شود', r.errors.join('|'));
  }

  // --- بدون عملیات: چیزی عوض نمی‌شود ---
  {
    const r = Adapter.toSnapshot(withOps([]));
    assert(r.ok, 'سند بدون عملیات سالم است');
    assert(!r.limitations.some(l => l.indexOf('عملیات') >= 0),
           'و ادعای بی‌مورد نمی‌کند');
    assert(r.snapshot.parts_flat.every(p => !p.features),
           'و features الکی نمی‌سازد');
  }

  // --- تا نقشهٔ CNC می‌رسد؟ ---
  {
    const Cnc = require(path.join(UI, 'kalaxa-cnc-sheet.js'));
    const r = Adapter.toSnapshot(withOps([
      { id: 'op1', part_id: firstPartId, kind: 'drill',
        params: { d_mm: 35, x_mm: 22, y_mm: 100, depth_mm: 13 } }
    ]));
    const p = r.snapshot.parts_flat.filter(x => x.part_uid === firstPartId)[0];
    const sheet = Cnc.render(p);
    assert(sheet.holes.length === 1 && sheet.svg.length > 0,
           'نقشهٔ CNC سوراخِ سند را می‌کشد');
    assert(Cnc.tableHtml(sheet).indexOf('؟') < 0,
           'و عمق را عدد می‌دهد چون سند داده بود');
  }
}


console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
