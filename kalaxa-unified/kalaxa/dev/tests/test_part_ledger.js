/**
 * دفتر قطعات — اجرا: node test_part_ledger.js
 *
 * نامتغیر مالی: **هیچ قطعه‌ای نباید بی‌صدا ناپدید شود.**
 * هر قطعهٔ چوبیِ مدل باید دقیقاً در یکی از این وضعیت‌ها باشد:
 *   ۱) در لیست برش (نستینگ‌شده)
 *   ۲) کنار گذاشته‌شده با دلیل صریح
 * و مقایسه باید بر پایهٔ **هویت و تعداد** باشد، نه تعداد ردیف جدول.
 *
 * چرا این از تست برابری فعلی قوی‌تر است: آن یکی تعداد را بر اساس `key` می‌سنجد
 * (مثلاً «۴ تا rail_top»). این یکی `part_uid` و quantity را می‌سنجد — پس اگر
 * قطعه‌ای با قطعهٔ دیگری از همان نوع جابه‌جا شود، یا نستینگ یکی را بیندازد،
 * این می‌گیرد و آن نمی‌گیرد.
 *
 * همین طبقه خطا قبلاً دو بار پول واقعی برده: قید ایستاده که در لیست برش نبود،
 * و صفحه/قرنیزی که بی‌صدا از فاکتور می‌افتاد.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const UI = path.join(__dirname, '..', '..', 'ui');
const Nesting = require(path.join(UI, 'kalaxa-nesting.js'));
const Schema = require(path.join(UI, 'kalaxa-schema.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

const fx = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'golden_kitchen_snapshot.json'), 'utf8'));

function migrate(s) { return Schema.migrateToV2(JSON.parse(JSON.stringify(s))).snapshot; }

/**
 * دفتر: از snapshot و نتیجهٔ نستینگ، multiset ورودی و خروجی را می‌سازد.
 * کلید = part_uid، مقدار = تعداد نمونه.
 */
function ledger(snapshot, nesting) {
  const expected = new Map();
  (snapshot.parts_flat || []).forEach(p => {
    expected.set(p.part_uid, (expected.get(p.part_uid) || 0) + p.count);
  });

  // ساختار واقعی: by_sheet_type → layouts → placements
  // (نسخهٔ اول این دفتر نام‌های حدسی داشت و هیچ‌چیز پیدا نکرد —
  //  یعنی تستی که همه‌چیز را گم‌شده می‌دید، نه تستی که چیزی را می‌سنجد.)
  const placed = new Map();
  (nesting.by_sheet_type || []).forEach(g => {
    (g.layouts || []).forEach(lay => {
      (lay.placements || []).forEach(pl => {
        placed.set(pl.part_uid, (placed.get(pl.part_uid) || 0) + 1);
      });
    });
  });

  // کنارگذاشته‌شده‌ها **دو بار** گزارش می‌شوند: یک‌بار در nesting.unplaced و
  // یک‌بار در g.unplaced هر ورق. هر مصرف‌کننده‌ای که هر دو را جمع کند (مثل نسخهٔ اول
  // همین دفتر) دوبرابر می‌شمارد. فقط سطح بالا — همان که مجموع است.
  const excluded = new Map();
  (nesting.unplaced || []).forEach(o => {
    const uid = o.part_uid || o.uid || o.id;
    if (!uid) return;
    excluded.set(uid, (excluded.get(uid) || 0) + (o.count || o.qty || 1));
  });

  return { expected, placed, excluded };
}

function reconcile(l) {
  const missing = [], extra = [];
  const keys = new Set([...l.expected.keys(), ...l.placed.keys(), ...l.excluded.keys()]);
  for (const k of keys) {
    const want = l.expected.get(k) || 0;
    const got = (l.placed.get(k) || 0) + (l.excluded.get(k) || 0);
    if (got < want) missing.push(`${k}: انتظار ${want}، یافت ${got}`);
    if (got > want) extra.push(`${k}: انتظار ${want}، یافت ${got}`);
  }
  return { missing, extra };
}

/* ------------------------------------------------ نامتغیر روی fixture واقعی */
console.log('\n[دفتر قطعات] هیچ قطعه‌ای بی‌صدا ناپدید نمی‌شود');
{
  const snap = migrate(fx);
  const nest = Nesting.run(snap);
  assert(nest.ok !== false, 'نستینگ اجرا شد', nest.error);

  const l = ledger(snap, nest);
  const r = reconcile(l);

  assert(l.expected.size > 0, 'قطعاتی برای سنجیدن هست', 'تعداد: ' + l.expected.size);
  assert(r.missing.length === 0,
    'هر قطعهٔ مدل یا جای‌گذاری شده یا صریحاً کنار گذاشته شده',
    r.missing.slice(0, 3).join(' ؛ '));
  assert(r.extra.length === 0,
    'هیچ قطعه‌ای از هوا ساخته نشده',
    r.extra.slice(0, 3).join(' ؛ '));
}

/* ------------------------------------------------ قطعهٔ بزرگ‌تر از ورق */
console.log('\n[دفتر قطعات] قطعهٔ جانشدنی باید با دلیل کنار برود، نه بی‌صدا');
{
  const snap = migrate(fx);
  // قطعه‌ای عمداً بزرگ‌تر از هر ورق
  snap.parts_flat.push({
    part_uid: 'huge:1', cabinet_id: snap.cabinets[0].kalaxa_id, key: 'side',
    name_fa: 'قطعهٔ غول', count: 1,
    cut_length_mm: 99999, cut_width_mm: 99999, thickness_mm: 16,
    sheet_id: snap.sheets[0].sheet_id, grain: 'none', allow_rotation: true,
    edge: {}, groove: {}
  });

  const nest = Nesting.run(snap);
  const l = ledger(snap, nest);
  const r = reconcile(l);

  assert(r.missing.length === 0,
    'قطعهٔ جانشدنی هم در دفتر حساب می‌شود (کنارگذاشته‌شده)',
    r.missing.slice(0, 3).join(' ؛ '));
  assert((l.excluded.get('huge:1') || 0) === 1,
    'قطعهٔ غول دقیقاً یک‌بار در کنارگذاشته‌شده‌ها می‌آید',
    'یافت: ' + (l.excluded.get('huge:1') || 0));
  assert(r.extra.length === 0, 'دوباره‌شماری رخ نمی‌دهد',
    r.extra.slice(0, 3).join(' ؛ '));

  // هر کنارگذاشته‌شده باید **دلیل** داشته باشد — حذف بدون دلیل همان سکوتی
  // است که دو بار پول برده.
  const noReason = (nest.unplaced || []).filter(o => !o.reason);
  assert(noReason.length === 0, 'هر کنارگذاشته‌شده دلیل دارد',
    JSON.stringify(noReason.slice(0, 2)));
  const noMessage = (nest.unplaced || []).filter(o => !o.message_fa);
  assert(noMessage.length === 0, 'و پیامی که کاربر بفهمد',
    JSON.stringify(noMessage.slice(0, 2)));
}

/* ------------------------- گزارش دوگانهٔ کنارگذاشته‌شده‌ها */
console.log('\n[دفتر قطعات] گزارش دوجایه نباید تناقض داشته باشد');
{
  const snap = migrate(fx);
  snap.parts_flat.push({
    part_uid: 'huge:2', cabinet_id: snap.cabinets[0].kalaxa_id, key: 'side',
    name_fa: 'غول ۲', count: 1,
    cut_length_mm: 99999, cut_width_mm: 99999, thickness_mm: 16,
    sheet_id: snap.sheets[0].sheet_id, grain: 'none', allow_rotation: true,
    edge: {}, groove: {}
  });
  const nest = Nesting.run(snap);

  const top = new Set((nest.unplaced || []).map(o => o.part_uid));
  const perSheet = new Set();
  (nest.by_sheet_type || []).forEach(g =>
    (g.unplaced || []).forEach(o => perSheet.add(o.part_uid)));

  // هر دو فهرست باید همان مجموعه باشند — وگرنه مصرف‌کننده نمی‌داند کدام را باور کند.
  const onlyTop = [...top].filter(x => !perSheet.has(x));
  const onlySheet = [...perSheet].filter(x => !top.has(x));
  assert(onlyTop.length === 0 && onlySheet.length === 0,
    'فهرست سطح بالا و فهرست هر ورق یک مجموعه‌اند',
    'فقط بالا: ' + onlyTop.join(',') + ' | فقط ورق: ' + onlySheet.join(','));
}

/* ------------------------------------------------ حذف عمدی = باید گرفته شود */
console.log('\n[دفتر قطعات] نگهبان: حذف یک قطعه باید دیده شود');
{
  const snap = migrate(fx);
  const nest = Nesting.run(snap);
  const l = ledger(snap, nest);

  // شبیه‌سازی باگ: یک قطعه از خروجی نستینگ ناپدید شود
  const victim = [...l.placed.keys()][0];
  l.placed.set(victim, l.placed.get(victim) - 1);
  const r = reconcile(l);

  assert(r.missing.length === 1 && r.missing[0].startsWith(victim),
    'ناپدیدشدن یک نمونه از یک قطعه بلافاصله دیده می‌شود',
    JSON.stringify(r.missing));
}

console.log('\n[دفتر قطعات] نگهبان: قطعهٔ اضافه هم باید دیده شود');
{
  const snap = migrate(fx);
  const nest = Nesting.run(snap);
  const l = ledger(snap, nest);
  l.placed.set('جعلی:1', 1);
  const r = reconcile(l);
  assert(r.extra.length === 1, 'قطعهٔ بی‌ریشه در خروجی دیده می‌شود');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed === 0 ? 0 : 1);
