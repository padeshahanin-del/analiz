/** صفحهٔ کار چندتکه — node test_countertop.js
 *
 * `kalaxa-moulding.js` موجود فقط طول‌های دستی را به قطعهٔ برش تبدیل می‌کرد و
 * چیزی دربارهٔ **اتصال‌ها** نمی‌دانست. سه چیز کم بود و هر سه در کارگاه
 * خودشان را نشان می‌دهند:
 *
 *   ۱. رانِ ۴٫۲ متری از ورقِ ۳٫۶ متری یک‌تکه درنمی‌آید.
 *   ۲. هر سرِ هر تکه کار متفاوتی می‌خواهد (اتصال/گوشه/لبهٔ آزاد/دیوار).
 *   ۳. صفحه از بدنه جلوتر می‌ایستد؛ عمقِ سفارش با عمق کابینت یکی نیست.
 */
'use strict';
const path = require('path');
const UI = path.join(__dirname, '..', '..', 'ui');
const T = require(path.join(UI, 'kalaxa-countertop.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

const RUN = { id: 'w1', label_fa: 'دیوار ۱', length_mm: 3000, depth_mm: 550,
              starts_at_wall: true, ends_at_corner: false };

console.log('ران کوتاه‌تر از شاخه، یک تکه');
{
  const r = T.plan([RUN]);
  assert(r.pieces.length === 1, 'یک تکه', String(r.pieces.length));
  assert(r.pieces[0].length_mm === 3000, 'طول دست‌نخورده');
  assert(r.totals.joints === 0, 'درز ندارد');
}

console.log('بیرون‌زدگی جلو به عمق اضافه می‌شود');
{
  const r = T.plan([RUN]);
  assert(r.pieces[0].depth_mm === 570,
         'عمق ۵۵۰ کابینت + ۲۰ بیرون‌زدگی = ۵۷۰ سفارش',
         String(r.pieces[0].depth_mm));

  const none = T.plan([RUN], { overhang_front_mm: 0 });
  assert(none.pieces[0].depth_mm === 550, 'و قابل صفر کردن است');
}

console.log('ران بلندتر از شاخه شکسته می‌شود');
{
  // ۴۲۰۰ از شاخهٔ ۳۶۰۰ بلندتر است
  const r = T.plan([{ id: 'w', label_fa: 'دیوار بلند', length_mm: 4200, depth_mm: 550,
                      starts_at_wall: true }]);
  assert(r.pieces.length === 2, 'دو تکه', String(r.pieces.length));

  // تقسیم **مساوی**، نه «تا جا می‌شود بعد ته‌مانده»: تکهٔ ۶۰۰ هم بدقواره
  // است هم موقع نصب می‌لرزد.
  assert(r.pieces[0].length_mm === r.pieces[1].length_mm,
         'تقسیم مساوی است، نه ۳۶۰۰ و ۶۰۰',
         r.pieces.map(p => p.length_mm).join(' + '));
  assert(Math.abs(r.pieces[0].length_mm + r.pieces[1].length_mm - 4200) < 1,
         'مجموع همان طول ران است');

  assert(r.totals.joints === 1, 'یک درز اتصال', String(r.totals.joints));
  assert(r.pieces[0].end === 'joint' && r.pieces[1].start === 'joint',
         'درز بین دو تکه علامت می‌خورد');
  assert(r.warnings.some(w => w.indexOf('درز') !== -1),
         'و به کاربر گفته می‌شود جای درز را با سینک چک کند',
         JSON.stringify(r.warnings));
}

console.log('سرِ هر تکه کار خودش را دارد');
{
  const r = T.plan([{ id: 'w', length_mm: 2000, depth_mm: 550,
                      starts_at_wall: true, ends_at_corner: true }]);
  assert(r.pieces[0].start === 'wall', 'سر اول به دیوار');
  assert(r.pieces[0].end === 'corner', 'سر دوم گوشه');
  assert(r.pieces[0].corner_joint === 'miter', 'گوشه پیش‌فرض فارسی ۴۵');

  const butt = T.plan([{ id: 'w', length_mm: 2000, depth_mm: 550, ends_at_corner: true }],
                      { corner_joint: 'butt' });
  assert(butt.pieces[0].corner_joint === 'butt',
         'ولی کارگاهی که اتصال مستقیم می‌زند هم هست');
  assert(butt.pieces[0].start === 'open',
         'رانی که به دیوار نمی‌رسد، سرِ آزاد دارد');
}

console.log('لبهٔ آزاد بیرون‌زدگی جانبی می‌گیرد');
{
  const r = T.plan([{ id: 'w', length_mm: 2000, depth_mm: 550 }],
                   { overhang_side_mm: 30 });
  // دو سرِ آزاد → ۲×۳۰ به طول اضافه می‌شود
  assert(r.pieces[0].length_mm === 2060, 'دو سرِ آزاد، ۶۰ اضافه',
         String(r.pieces[0].length_mm));
  assert(r.totals.open_ends === 2, 'دو لبهٔ آزاد شمرده می‌شود — پروفیل می‌خورد');

  const walled = T.plan([{ id: 'w', length_mm: 2000, depth_mm: 550,
                           starts_at_wall: true, ends_at_corner: true }],
                        { overhang_side_mm: 30 });
  assert(walled.pieces[0].length_mm === 2000,
         'سرِ دیوار و گوشه بیرون‌زدگی ندارند',
         String(walled.pieces[0].length_mm));
}

console.log('شاخهٔ نامحدود');
{
  const r = T.plan([{ id: 'w', length_mm: 6000, depth_mm: 550 }], { bar_length_mm: 0 });
  assert(r.pieces.length === 1, 'ماده‌ای که محدودیت طول ندارد یک‌تکه می‌ماند');
}

console.log('شاخهٔ خیلی کوتاه: سکوت نمی‌شود');
{
  // شاخهٔ ۲۰۰ برای رانِ ۲۰۰۰ یعنی ۱۰ تکهٔ ۲۰۰ — بدقواره. به‌جای ساختن
  // چنین چیزی، یک‌تکه می‌ماند و صریح هشدار می‌دهد.
  const r = T.plan([{ id: 'w', length_mm: 2000, depth_mm: 550 }],
                   { bar_length_mm: 200, min_piece_mm: 300 });
  assert(r.pieces.length === 1, 'تکه‌های بدقواره ساخته نمی‌شوند');
  assert(r.warnings.some(w => w.indexOf('بازبینی') !== -1),
         'و صریح گفته می‌شود ماده مناسب نیست', JSON.stringify(r.warnings));
}

console.log('جمع‌بندی سفارش');
{
  const r = T.plan([
    { id: 'a', length_mm: 4200, depth_mm: 550, starts_at_wall: true, ends_at_corner: true },
    { id: 'b', length_mm: 2000, depth_mm: 550, starts_at_wall: true }
  ]);
  assert(r.totals.piece_count === 3, 'سه تکه', String(r.totals.piece_count));
  assert(r.totals.corners === 1, 'یک گوشه');
  assert(r.totals.joints === 1, 'یک درز');
  assert(r.totals.area_m2 > 3 && r.totals.area_m2 < 4,
         'مساحت برای سفارش سنگ/کورین', String(r.totals.area_m2));
  assert(Math.abs(r.totals.total_length_m - 6.2) < 0.05,
         'متراژ کل', String(r.totals.total_length_m));
}

console.log('فقط کابینت زمینی صفحه می‌گیرد');
{
  // بدون این فیلتر، کابینت هوایی هم صفحه می‌گرفت و متراژ دو برابر می‌شد.
  const walls = [{
    wall_id: 'w1', label_fa: 'دیوار ۱',
    items: [
      { s_mm: 0, w_mm: 900, d_mm: 550, cab: { category: 'base' } },
      { s_mm: 900, w_mm: 800, d_mm: 550, cab: { category: 'base' } },
      { s_mm: 0, w_mm: 900, d_mm: 350, cab: { category: 'wall' } }
    ]
  }];
  const runs = T.runsFromWalls(walls);
  assert(runs.length === 1, 'یک ران');
  assert(runs[0].length_mm === 1700, 'طول فقط از زمینی‌ها', String(runs[0].length_mm));
  assert(runs[0].depth_mm === 550, 'عمق از زمینی، نه هوایی', String(runs[0].depth_mm));

  const onlyWall = T.runsFromWalls([{ wall_id: 'w2', items: [
    { s_mm: 0, w_mm: 900, d_mm: 350, cab: { category: 'wall' } }
  ] }]);
  assert(onlyWall.length === 0, 'دیوارِ فقط‌هوایی اصلاً ران نمی‌سازد');
}

console.log('حالت‌های خالی و خراب');
{
  assert(T.plan([]).pieces.length === 0, 'ورودی خالی نمی‌شکند');
  assert(T.plan(null).pieces.length === 0, 'null نمی‌شکند');
  const bad = T.plan([{ id: 'x', length_mm: 0, depth_mm: 550 }]);
  assert(bad.pieces.length === 0, 'ران با طول صفر تکه نمی‌سازد');
  assert(bad.warnings.length > 0, 'و بی‌صدا حذف نمی‌شود', JSON.stringify(bad.warnings));
  assert(T.runsFromWalls(null).length === 0, 'دیوار null نمی‌شکند');
}

console.log('جدول');
{
  const html = T.tableHtml(T.plan([RUN]));
  assert(html.indexOf('<table') !== -1, 'جدول ساخته می‌شود');
  assert(html.indexOf('به دیوار') !== -1, 'نوع سر به فارسی');
  assert(T.tableHtml({ pieces: [], totals: {}, warnings: [] }).indexOf('msg info') !== -1,
         'حالت خالی خودش را توضیح می‌دهد');
}

console.log('نوع صفحه از کاتالوگ مشترک');
{
  // اعداد از کارگاه کاربر آمده‌اند، نه از استاندارد کاغذی:
  // شرکتی ۴۱۰، کورین/مارمونایت ۳۶۰، SPL ۴۲۰ سانتی‌متر.
  const list = T.types({});
  const byId = {};
  list.forEach(t => { byId[t.id] = t; });

  assert(byId.company && byId.company.bar_length_mm === 4100,
         'صفحهٔ شرکتی ۴۱۰ سانت', JSON.stringify(byId.company));
  assert(byId.corian && byId.corian.bar_length_mm === 3600,
         'کورین و مارمونایت ۳۶۰');
  assert(byId.spl && byId.spl.bar_length_mm === 4200, 'SPL ۴۲۰');
}

console.log('طول شاخه از نوع می‌آید، نه از عدد ثابت');
{
  // رانِ ۴۳۰۰: با SPL (۴۲۰۰) دو تکه، با شرکتی (۴۱۰۰) هم دو تکه، ولی با
  // نوعی که شاخهٔ بلندتر داشته باشد یک‌تکه.
  const run = [{ id: 'a', length_mm: 4300, depth_mm: 550, starts_at_wall: true }];

  const spl = T.plan(run, { type_id: 'spl' });
  assert(spl.pieces.length === 2, 'SPL ۴۲۰۰ → دو تکه', String(spl.pieces.length));
  assert(spl.type && spl.type.bar_length_mm === 4200,
         'نوع انتخاب‌شده در خروجی می‌آید — گزارش باید بگوید با چه ماده‌ای');

  const long = T.plan(run, { type_id: 'x', custom_types: [
    { id: 'x', label_fa: 'شاخهٔ بلند', bar_length_mm: 5000, sold_by: 'bar' }
  ] });
  assert(long.pieces.length === 1, 'شاخهٔ ۵۰۰۰ → یک‌تکه', String(long.pieces.length));
}

console.log('کارگاه می‌تواند نوع اضافه کند');
{
  const cfg = { type_id: 'granite', custom_types: [
    { id: 'granite', label_fa: 'گرانیت', bar_length_mm: 2400, sold_by: 'area' }
  ] };
  const list = T.types(cfg);
  assert(list.some(t => t.id === 'granite'), 'نوع تازه کنار کاتالوگ می‌نشیند');
  assert(list.length === T.types({}).length + 1, 'و چیزی را حذف نمی‌کند');

  const r = T.plan([{ id: 'a', length_mm: 5000, depth_mm: 550 }], cfg);
  assert(r.type.label_fa === 'گرانیت', 'و واقعاً استفاده می‌شود');
  assert(r.pieces.length === 3, '۵۰۰۰ از شاخهٔ ۲۴۰۰ → سه تکه', String(r.pieces.length));
}

console.log('نوع افزوده می‌تواند کاتالوگ را بازنویسی کند');
{
  // کارگاهی که تأمین‌کننده‌اش SPL را ۴۰۰ می‌دهد نه ۴۲۰.
  const cfg = { type_id: 'spl', custom_types: [{ id: 'spl', bar_length_mm: 4000 }] };
  assert(T.typeOf(cfg).bar_length_mm === 4000,
         'همان id با طول کارگاه بازنویسی می‌شود',
         String(T.typeOf(cfg).bar_length_mm));
  assert(T.typeOf(cfg).label_fa === 'SPL',
         'ولی بقیهٔ فیلدها از کاتالوگ می‌مانند — بازنویسی جزئی است');
  assert(T.types(cfg).length === T.types({}).length,
         'و ردیف تکراری نمی‌سازد');
}

console.log('نوع ناشناخته: سکوت نمی‌شود');
{
  // عددِ پیش‌فرض ممکن است با ماده‌ای که واقعاً می‌خرند فرق داشته باشد و
  // درز جای غلط بیفتد.
  const r = T.plan([{ id: 'a', length_mm: 2000, depth_mm: 550 }], { type_id: 'نیست' });
  assert(r.warnings.some(w => w.indexOf('کاتالوگ') !== -1),
         'صریح گفته می‌شود که نوع پیدا نشد', JSON.stringify(r.warnings));
  assert(r.type === null, 'و نوعی جعل نمی‌شود');
}

console.log('بدون نوع، رفتار قبلی می‌ماند');
{
  const r = T.plan([{ id: 'a', length_mm: 4300, depth_mm: 550 }], { bar_length_mm: 3600 });
  assert(r.pieces.length === 2, 'عدد مستقیم همچنان کار می‌کند');
  assert(r.warnings.every(w => w.indexOf('کاتالوگ') === -1), 'و هشدار الکی نمی‌دهد');
}


// ── عرض شاخه و مشخصات سفارش ──────────────────────────────────────────
//
// تا ۳.۷۰ کاتالوگ فقط **طول** داشت. یعنی صفحهٔ جزیرهٔ ۹۰ سانتی از ورقی
// که ۷۶ است بی‌صدا «ممکن» شمرده می‌شد و کارگاه موقع سفارش می‌فهمید.
console.log('');
console.log('عرض شاخه');
(function () {
  const deep = { id: 'i', label_fa: 'جزیره', length_mm: 2400, depth_mm: 900 };
  const r = T.plan([deep], { type_id: 'company' });
  assert(r.warnings.some(w => w.indexOf('عرض') >= 0),
         'عمق بیشتر از عرض شاخه هشدار می‌دهد', JSON.stringify(r.warnings));
  // باید **عدد ندهد**، نه عددِ مطمئنِ غلط: معلوم نیست هر تکه از چند نوار
  // درمی‌آید.
  assert(r.order.qty === null, 'تعداد شاخه حدس زده نمی‌شود', String(r.order.qty));
  assert(r.order.over_wide === 1, 'تعداد تکه‌های پهن گزارش می‌شود');

  const ok = T.plan([{ id: 'r', label_fa: 'ران', length_mm: 2400, depth_mm: 550,
                       starts_at_wall: true }], { type_id: 'company' });
  assert(!ok.warnings.some(w => w.indexOf('عرض') >= 0),
         'عمق عادی هشدار عرض نمی‌دهد', JSON.stringify(ok.warnings));
  assert(ok.order.qty === 1, 'ران عادی یک شاخه می‌خواهد', String(ok.order.qty));
}());

console.log('');
console.log('عرض نامعلوم: حدس زده نمی‌شود');
(function () {
  const r = T.plan([{ id: 'i', label_fa: 'جزیره', length_mm: 2400, depth_mm: 900 }],
                   { type_id: 'x', custom_types: [
                     { id: 'x', label_fa: 'ناشناخته', bar_length_mm: 3600,
                       bar_width_mm: null, sold_by: 'bar' }] });
  assert(!r.warnings.some(w => w.indexOf('عرض') >= 0),
         'با عرض نامعلوم هشدار الکی نمی‌دهد', JSON.stringify(r.warnings));
  assert(r.order.qty === 1, 'و شمارش را انجام می‌دهد');
}());

console.log('');
console.log('واحد خرید با واحد برش یکی نیست');
(function () {
  const long = { id: 'w', label_fa: 'دیوار', length_mm: 5200, depth_mm: 560,
                 starts_at_wall: true };

  const bar = T.plan([long], { type_id: 'company' });
  assert(bar.order.sold_by === 'bar', 'شرکتی با شاخه سفارش می‌رود');
  assert(bar.order.qty === 2, 'دو تکهٔ ۲۶۰۰ در دو شاخهٔ ۴۱۰۰ جا می‌شوند',
         String(bar.order.qty));
  assert(bar.order.sheet_size_fa.indexOf('4100') >= 0 &&
         bar.order.sheet_size_fa.indexOf('600') >= 0,
         'ابعاد شاخه در مشخصات سفارش هست', bar.order.sheet_size_fa);

  // شمارش شاخه نباید تقسیم متراژ کل باشد؛ حالت افشاکننده سه تکه است.
  const three = T.plan([{ id: 'a', label_fa: 'الف', length_mm: 7500,
                          depth_mm: 560, starts_at_wall: true }],
                       { type_id: 'company' });
  const naive = Math.ceil(three.totals.total_length_mm / 4100);
  assert(three.order.qty >= naive, 'شمارش شاخه از تقسیم متراژ کل کمتر نیست',
         'شاخه=' + three.order.qty + ' ساده=' + naive);
  three.pieces.forEach(function (p) {
    assert(p.length_mm <= 4100, 'هیچ تکه‌ای از شاخه بلندتر نیست', String(p.length_mm));
  });

  const area = T.plan([long], { type_id: 'corian' });
  assert(area.order.sold_by === 'area', 'کورین با متر مربع سفارش می‌رود');
  assert(area.order.unit_fa === 'متر مربع', 'واحدش گفته می‌شود');
  assert(area.order.sheet_size_fa.indexOf('3600') >= 0 &&
         area.order.sheet_size_fa.indexOf('760') >= 0,
         'ابعاد ورق کورین هم گفته می‌شود', area.order.sheet_size_fa);
  assert(Math.abs(area.order.qty - area.totals.area_m2) < 0.02,
         'متراژ سفارش با متراژ محاسبه‌شده می‌خواند',
         area.order.qty + ' vs ' + area.totals.area_m2);
}());

console.log('');
console.log('کورین هم مثل بقیه به ورق تقسیم می‌شود');
(function () {
  // پرسش باز بود: ماده‌ای که با متر مربع خریده می‌شود آیا باید به طول ورق
  // شکسته شود؟ بله — چسبیدن ممکن است ولی ورق ابعاد دارد و درز کار می‌برد.
  const r = T.plan([{ id: 'w', label_fa: 'دیوار', length_mm: 5200,
                      depth_mm: 560, starts_at_wall: true }],
                   { type_id: 'corian' });
  assert(r.pieces.length === 2, 'ران ۵۲۰۰ روی ورق ۳۶۰۰ دو تکه شد',
         String(r.pieces.length));
  assert(r.pieces.every(p => p.length_mm <= 3600), 'هیچ تکه‌ای از ورق بلندتر نیست');
  assert(r.totals.joints >= 1, 'درز اتصال شمرده شد');
}());

console.log('');
console.log('جدول، سفارش را با ابعاد نشان می‌دهد');
(function () {
  const html = T.tableHtml(T.plan([{ id: 'w', label_fa: 'دیوار', length_mm: 5200,
                                     depth_mm: 560, starts_at_wall: true }],
                                  { type_id: 'corian' }));
  assert(html.indexOf('سفارش') >= 0, 'سطر سفارش در خروجی هست');
  assert(html.indexOf('۳۶۰۰') >= 0 && html.indexOf('۷۶۰') >= 0,
         'با ابعاد، به رقم فارسی');
}());

console.log('\n' + passed + ' گذشت، ' + failed + ' افتاد');
process.exit(failed ? 1 : 0);
