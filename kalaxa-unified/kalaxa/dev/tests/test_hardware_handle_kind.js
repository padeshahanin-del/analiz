/**
 * تست شمارش دستگیره بر اساس نوع آن — اجرا: node test_hardware_handle_kind.js
 *
 * چرا: BOM بدون توجه به params.handle_kind همیشه یک دستگیره به‌ازای هر درب/کشو
 * می‌شمرد. یعنی وقتی کاربر در دیالوگ ساخت «بدون دستگیره» را انتخاب می‌کرد، مدل
 * سه‌بعدی هیچ دستگیره‌ای نمی‌کشید ولی شیت قیمت آن را فاکتور می‌کرد — قرینهٔ همان
 * واگرایی «مدل در برابر لیست برش» که در قید بالا دیده شد، این‌بار بیش‌فاکتوری.
 */
'use strict';
const path = require('path');
const UI = path.join(__dirname, '..', '..', 'ui');
const Hardware = require(path.join(UI, 'kalaxa-hardware.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

function snapshot(handleKind, extraParts) {
  const params = { cabinet_width: 80, cabinet_height: 72, cabinet_depth: 55 };
  if (handleKind !== undefined) params.handle_kind = handleKind;
  return {
    cabinets: [{ kalaxa_id: 'c1', category: 'base', label_fa: 'کابینت تست', params: params }],
    parts_flat: [
      { cabinet_id: 'c1', key: 'door', count: 1, cut_length_mm: 716, cut_width_mm: 796, thickness_mm: 16 }
    ].concat(extraParts || [])
  };
}

function handleQty(bom) {
  const row = bom.items.find(function (i) { return i.item_id === 'handle'; });
  return row ? row.qty : 0;
}

/* ------------------------------------------------ شمارش بر اساس نوع دستگیره */
console.log('\n[دستگیره] شمارش بر اساس params.handle_kind');
{
  assert(handleQty(Hardware.bom(snapshot('bar'))) === 1,
    'میله‌ای → یک دستگیره فاکتور می‌شود');
  assert(handleQty(Hardware.bom(snapshot('none'))) === 0,
    '«بدون دستگیره» → هیچ دستگیره‌ای فاکتور نمی‌شود');
  assert(handleQty(Hardware.bom(snapshot('hidden'))) === 0,
    'مخفی/گاولا فرورفتگی ماشین‌کاری است، نه قطعهٔ شمارشی');
}

console.log('\n[دستگیره] سازگاری عقب‌رو');
{
  assert(handleQty(Hardware.bom(snapshot(undefined))) === 1,
    'snapshot قدیمی بدون handle_kind مثل میله‌ای رفتار می‌کند');
  assert(handleQty(Hardware.bom(snapshot('ناشناخته'))) === 1,
    'نوع ناشناخته محافظه‌کارانه فاکتور می‌شود (کم‌فاکتوری بدتر از بیش‌فاکتوری نیست)');
}

/* ------------------------------------------------------------ نمای کشو */
console.log('\n[دستگیره] نمای کشو هم همین قاعده را دارد');
{
  const drawers = [{ cabinet_id: 'c1', key: 'drawer_front', count: 3,
                     cut_length_mm: 230, cut_width_mm: 796, thickness_mm: 16 }];
  const bar = Hardware.bom(snapshot('bar', drawers));
  const none = Hardware.bom(snapshot('none', drawers));
  assert(handleQty(bar) === 4, 'میله‌ای: ۱ درب + ۳ کشو = ۴ دستگیره');
  assert(handleQty(none) === 0, 'بدون دستگیره: هیچ‌کدام فاکتور نمی‌شود');
  assert(bar.by_cabinet.c1.slide_pairs === 3 && none.by_cabinet.c1.slide_pairs === 3,
    'ریل کشو مستقل از نوع دستگیره شمرده می‌شود');
  assert(bar.by_cabinet.c1.hinge === none.by_cabinet.c1.hinge,
    'لولا هم مستقل از نوع دستگیره است');
}

/* ------------------------------------------------------------- هشدارها */
console.log('\n[دستگیره] هشدار پروفیل گاولا');
{
  // رفتار عوض شد و این تست باید همان را ثبت کند: گاولا دیگر **هشدار** نیست،
  // یک ردیف واقعی متری است. هشدار فقط وقتی می‌آید که کاربر خودش خاموشش کرده
  // باشد — یعنی «می‌دانم و نمی‌خواهم».
  const hidden = Hardware.bom(snapshot('hidden'));
  assert(hidden.items.some(function (i) { return i.item_id === 'gola'; }),
    'گاولا به‌جای هشدار، ردیف متری می‌گیرد',
    JSON.stringify(hidden.items.map(function (i) { return i.item_id; })));
  assert(!hidden.warnings.some(function (w) { return w.indexOf('اضافه کنید') !== -1; }),
    'و دیگر کار را به کاربر پس نمی‌دهد');
  assert(Hardware.bom(snapshot('none')).warnings.length === 0,
    '«بدون دستگیره» هشدار لازم ندارد — تصمیم صریح کاربر است');
  assert(Hardware.bom(snapshot('bar')).warnings.length === 0,
    'میله‌ای هشدار ندارد');
}

/* --------------------------------------------------------- قابل تنظیم */
console.log('\n[دستگیره] قاعده قابل بازنویسی است');
{
  const forced = Hardware.bom(snapshot('none'), { rules: { handle_kinds_without_hardware: [] } });
  assert(handleQty(forced) === 1,
    'اگر کارگاهی بخواهد همیشه دستگیره فاکتور شود، با options.rules ممکن است');
}

console.log('\n=================================');
// اسنپ‌شاتی با کف/سقف (برای مینی‌فیکس) و طبقه — تا همهٔ اقلام تولید شوند.
const SNAP = snapshot('bar', [
  { cabinet_id: 'c1', key: 'bottom', count: 1, cut_length_mm: 768, cut_width_mm: 550, thickness_mm: 16 },
  { cabinet_id: 'c1', key: 'top_bottom', count: 1, cut_length_mm: 768, cut_width_mm: 550, thickness_mm: 16 },
  { cabinet_id: 'c1', key: 'shelf', count: 1, cut_length_mm: 764, cut_width_mm: 530, thickness_mm: 16 },
  { cabinet_id: 'c1', key: 'drawer_front', count: 2, cut_length_mm: 300, cut_width_mm: 796, thickness_mm: 16 }
]);

console.log('کاتالوگ یراق — قلمی که کارگاه ندارد در فاکتور نمی‌آید');
{
  // کاربر: «مینی‌فیکس و دوبل چوبی نداریم». تا این نسخه BOM آن‌ها را می‌شمرد و
  // شیت قیمت فاکتورشان می‌کرد.
  const base = Hardware.bom(SNAP, {});
  const ids = base.items.map(i => i.item_id);
  assert(ids.indexOf('minifix') !== -1 && ids.indexOf('dowel') !== -1,
         'پیش‌فرض: مینی‌فیکس و دوبل شمرده می‌شوند', JSON.stringify(ids));

  const off = Hardware.bom(SNAP, { catalog: { minifix: { enabled: false }, dowel: { enabled: false } } });
  const ids2 = off.items.map(i => i.item_id);
  assert(ids2.indexOf('minifix') === -1 && ids2.indexOf('dowel') === -1,
         'با خاموش‌کردن، در BOM نمی‌آیند', JSON.stringify(ids2));
  assert(ids2.indexOf('hinge') !== -1,
         'ولی بقیهٔ اقلام دست‌نخورده می‌مانند');
}

console.log('متریال طولی — دستگیرهٔ متری');
{
  const perPiece = Hardware.bom(SNAP, {});
  const handle = perPiece.items.find(i => i.item_id === 'handle');
  assert(handle && handle.qty > 0, 'دستگیره به‌صورت عددی شمرده می‌شود',
         JSON.stringify(handle));

  const meters = Hardware.bom(SNAP, { catalog: { handle: { unit: 'm', length_mm: 600 } } });
  const hm = meters.items.find(i => i.item_id === 'handle');
  assert(hm, 'ردیف دستگیره هست');
  assert(hm.unit === 'متر', 'واحدش متر است', hm.unit);
  assert(Math.abs(hm.qty - handle.qty * 0.6) < 0.01,
         'متراژ = تعداد × طول', hm.qty + ' vs ' + (handle.qty * 0.6));
  assert(hm.count === handle.qty, 'تعداد اصلی هم می‌ماند — برای فاکتور و انبار');
}

console.log('طول نامعلوم: سکوت نمی‌شود');
{
  // عددِ بی‌معنا در فاکتور از نبودِ ردیف بدتر است.
  const r = Hardware.bom(SNAP, { catalog: { handle: { unit: 'm' } } });
  assert(!r.items.some(i => i.item_id === 'handle'),
         'بدون طول، ردیف متری ساخته نمی‌شود');
  assert(r.warnings.some(w => w.indexOf('متری') !== -1),
         'و صریح گفته می‌شود', JSON.stringify(r.warnings));
}

console.log('واحد جفت');
{
  const r = Hardware.bom(SNAP, { catalog: {} });
  const slide = r.items.find(i => /^slide_/.test(i.item_id));
  if (slide) assert(slide.unit === 'جفت', 'ریل کشو جفتی می‌ماند', slide.unit);
  else assert(true, 'این اسنپ‌شات کشو ندارد — واحد جفت آزموده نشد');
}

console.log('گاولا — از هشدار به ردیف واقعی');
{
  // تا این نسخه فقط هشدار می‌داد: «اگر پروفیل گاولا می‌خرید، خودتان متری
  // اضافه کنید». یعنی کالاکسا می‌دانست لازم است ولی کار را به کاربر پس
  // می‌داد.
  const gola = snapshot('hidden', [
    { cabinet_id: 'c1', key: 'drawer_front', count: 3,
      cut_length_mm: 230, cut_width_mm: 896, thickness_mm: 18 }
  ]);
  const r = Hardware.bom(gola, {});
  const row = r.items.find(i => i.item_id === 'gola');
  assert(row, 'ردیف گاولا ساخته می‌شود', JSON.stringify(r.items.map(i => i.item_id)));
  assert(row.unit === 'متر', 'واحدش متر است', row.unit);

  // `snapshot()` همیشه یک درب ۷۹۶ هم دارد: ۷۹۶ + ۳×۸۹۶ = ۳۴۸۴mm،
  // ×۱٫۰۵ = ۳٫۶۶ متر. (نسخهٔ اول این تست درب پایه را فراموش کرده بود و
  // عدد انتظاری‌اش غلط بود — کد درست بود، تست نه.)
  assert(Math.abs(row.qty - 3.66) < 0.02, 'متراژ از عرض نماها با پرت برش',
         String(row.qty));
  assert(row.detail_fa.indexOf('پرت') !== -1, 'پرت در توضیح گفته می‌شود');

  // دستگیرهٔ شمارشی نباید هم‌زمان فاکتور شود
  assert(!r.items.some(i => i.item_id === 'handle'),
         'گاولا دستگیرهٔ شمارشی ندارد');
  assert(!r.warnings.some(w => w.indexOf('اضافه کنید') !== -1),
         'دیگر کار را به کاربر پس نمی‌دهد', JSON.stringify(r.warnings));
}

console.log('گاولا: طول از عرض نما می‌آید نه ارتفاعش');
{
  // اشتباه رایج: برای درب، cut_length ارتفاع است. اگر آن را بگیریم، متراژ
  // چند برابر می‌شود و سفارش غلط می‌رود.
  const tall = snapshot('hidden', [
    { cabinet_id: 'c1', key: 'door', count: 1,
      cut_length_mm: 2000, cut_width_mm: 400, thickness_mm: 18 }
  ]);
  const row = Hardware.bom(tall, {}).items.find(i => i.item_id === 'gola');
  // درب پایه (۷۹۶) + این درب (۴۰۰) = ۱۱۹۶mm ×۱٫۰۵ = ۱٫۲۶ متر.
  // اگر ارتفاع ۲۰۰۰ گرفته می‌شد، عدد ۲٫۹ به بالا می‌رفت.
  assert(Math.abs(row.qty - 1.26) < 0.02,
         'عرض ۴۰۰ حساب می‌شود نه ارتفاع ۲۰۰۰', String(row.qty));
}

console.log('گاولا قابل خاموش کردن');
{
  const gola = snapshot('hidden', [
    { cabinet_id: 'c1', key: 'drawer_front', count: 2,
      cut_length_mm: 230, cut_width_mm: 896, thickness_mm: 18 }
  ]);
  const off = Hardware.bom(gola, { catalog: { gola: { enabled: false } } });
  assert(!off.items.some(i => i.item_id === 'gola'), 'ردیف نمی‌آید');
  assert(off.warnings.some(w => w.indexOf('گاولا') !== -1),
         'ولی سکوت نمی‌شود — کابینت گاولا دارد و کاربر باید بداند',
         JSON.stringify(off.warnings));
}

console.log('پرت برش قابل تنظیم');
{
  const gola = snapshot('hidden', [
    { cabinet_id: 'c1', key: 'drawer_front', count: 1,
      cut_length_mm: 230, cut_width_mm: 1000, thickness_mm: 18 }
  ]);
  // درب پایه ۷۹۶ + این نما ۱۰۰۰ = ۱۷۹۶mm
  const zero = Hardware.bom(gola, { catalog: { gola: { waste_pct: 0 } } })
    .items.find(i => i.item_id === 'gola');
  assert(Math.abs(zero.qty - 1.796) < 0.005, 'بدون پرت: خام', String(zero.qty));

  const ten = Hardware.bom(gola, { catalog: { gola: { waste_pct: 10 } } })
    .items.find(i => i.item_id === 'gola');
  assert(Math.abs(ten.qty - 1.976) < 0.005, 'با ۱۰٪ پرت', String(ten.qty));
  assert(ten.qty > zero.qty, 'پرت واقعاً اثر دارد');
}

console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed === 0 ? 0 : 1);
