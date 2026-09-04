/** لوازم و آبجکت‌ها — node test_objects.js
 *
 * کاربر «قابلیت اضافه کردن آبجکت‌ها … که واقعی‌تر باشه» خواست.
 *
 * سه چیز که باید درست باشد و هر سه در کارگاه پول‌اند:
 *   ۱. لوازم **بریدنی نیستند** — نباید در برش‌خور بیایند، ولی باید در فاکتور
 *      باشند.
 *   ۲. بریدگی صفحه **کوچک‌تر** از خودِ دستگاه است. اگر اندازهٔ بیرونی بریده
 *      شود، دستگاه توی سوراخ می‌افتد و یک صفحهٔ کامل از بین می‌رود.
 *   ۳. فرِ ۶۰ در کابینت ۵۰ نمی‌رود. سکوت یعنی مشتری موقع نصب بفهمد.
 */
'use strict';
const path = require('path');
const UI = path.join(__dirname, '..', '..', 'ui');
const O = require(path.join(UI, 'kalaxa-objects.js'));
const C = require(path.join(UI, 'kalaxa-catalog.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

const CABS = [
  { kalaxa_id: 'c1', label_fa: 'زیر سینک', category: 'base',
    params: { cabinet_width: 80, cabinet_height: 72, cabinet_depth: 55 } },
  { kalaxa_id: 'c2', label_fa: 'زیر گاز', category: 'base',
    params: { cabinet_width: 90, cabinet_height: 72, cabinet_depth: 55 } },
  { kalaxa_id: 'c3', label_fa: 'کوچک', category: 'base',
    params: { cabinet_width: 50, cabinet_height: 72, cabinet_depth: 55 } }
];

console.log('کاتالوگ');
{
  const gs = O.grouped({});
  assert(gs.length >= 2, 'دسته‌بندی دارد', String(gs.length));
  const all = O.all({});
  assert(all.sink_single && all.hob_gas_5 && all.oven_built_in,
         'لوازم اصلی هستند', Object.keys(all).join(','));
  Object.keys(all).forEach(id => {
    const o = all[id];
    assert(o.w > 0 && o.d > 0 && o.h > 0, id + ' ابعاد معتبر دارد');
    assert(!!o.label_fa, id + ' نام فارسی دارد');
  });
}

console.log('بریدگی کوچک‌تر از دستگاه است');
{
  // اگر برعکس باشد، دستگاه توی سوراخ می‌افتد.
  const all = O.all({});
  Object.keys(all).forEach(id => {
    const o = all[id];
    if (!o.cutout) return;
    assert(o.cutout.w < o.w && o.cutout.d < o.d,
           id + ': بریدگی از دستگاه کوچک‌تر است',
           o.cutout.w + '×' + o.cutout.d + ' vs ' + o.w + '×' + o.d);
  });
}

console.log('فهرست کالا');
{
  const r = O.plan([
    { object_id: 'sink_single', cabinet_id: 'c1' },
    { object_id: 'hob_gas_5', cabinet_id: 'c2' },
    { object_id: 'hob_gas_5', cabinet_id: 'c2' }
  ], CABS, {});

  assert(r.items.length === 2, 'دو نوع کالا', String(r.items.length));
  const hob = r.items.find(i => i.object_id === 'hob_gas_5');
  assert(hob.qty === 2, 'تکراری‌ها جمع می‌شوند', String(hob.qty));
  assert(hob.unit === 'عدد', 'واحد دارد');
  assert(hob.group_fa, 'زیرگروه دارد — در فهرست کالا کنار هم‌گروهش می‌نشیند');
}

console.log('بریدگی صفحه گزارش می‌شود');
{
  const r = O.plan([
    { object_id: 'sink_single', cabinet_id: 'c1' },
    { object_id: 'hob_gas_5', cabinet_id: 'c2' },
    { object_id: 'oven_built_in', cabinet_id: 'c2' }
  ], CABS, {});

  assert(r.cutouts.length === 2, 'فقط سینک و اجاق بریدگی دارند — فر ندارد',
         String(r.cutouts.length));
  const sink = r.cutouts.find(c => c.object_id === 'sink_single');
  assert(sink.w_mm === 780 && sink.d_mm === 480, 'اندازهٔ بریدگی، نه دستگاه',
         sink.w_mm + '×' + sink.d_mm);
  assert(sink.outer_w_mm === 800, 'ابعاد بیرونی هم می‌آید — برای مقایسه');
  assert(sink.radius_mm > 0, 'شعاع گوشه دارد');

  const html = O.cutoutTableHtml(r);
  assert(html.indexOf('کوچک‌تر') !== -1,
         'و در برگه صریح توضیح داده می‌شود چرا کوچک‌تر است');

  // بریدگی فقط برای چیزی که **روی صفحه** می‌نشیند معنا دارد. دستگاهی که
  // داخل کابینت است ممکن است بریدگیِ خودش را داشته باشد (سوراخ پشت برای
  // کابل) ولی آن کارِ صفحه‌بُر نیست و نباید در این برگه بیاید.
  const inCab = O.plan([{ object_id: 'x', cabinet_id: 'c2' }], CABS, {
    custom_objects: [{ id: 'x', group: 'appliance', label_fa: 'دستگاه داخلی',
                       w: 500, d: 400, h: 300, mount: 'in_cabinet',
                       cutout: { w: 100, d: 100, radius_mm: 5 }, unit: 'عدد' }]
  });
  assert(inCab.cutouts.length === 0,
         'بریدگیِ دستگاهِ داخل کابینت در برگهٔ صفحه‌بُر نمی‌آید',
         JSON.stringify(inCab.cutouts));
}

console.log('جا شدن در کابینت');
{
  const ok = O.plan([{ object_id: 'hob_gas_5', cabinet_id: 'c2' }], CABS, {});
  assert(ok.warnings.length === 0, 'اجاق ۹۰ در کابینت ۹۰ جا می‌شود',
         JSON.stringify(ok.warnings));

  const bad = O.plan([{ object_id: 'oven_built_in', cabinet_id: 'c3' }], CABS, {});
  assert(bad.warnings.length > 0, 'فر ۶۰ در کابینت ۵۰ جا نمی‌شود');
  // `|| ''` عمدی است: بدون آن، جهشی که هشدار را حذف کند به‌جای **شکست**
  // باعث **کرش** تست می‌شد و از بیرون شبیه «تست اجرا نشد» به‌نظر می‌رسید —
  // یعنی نمی‌شد فهمید نگهبان کار کرده یا خودش شکسته.
  const w0 = bad.warnings[0] || '';
  assert(w0.indexOf('جا نمی‌شود') !== -1, 'و صریح گفته می‌شود', w0);
  assert(w0.indexOf('۵۰') !== -1 || w0.indexOf('50') !== -1,
         'با عدد واقعی کابینت، نه پیام کلی', w0);

  // ولی همچنان در فاکتور می‌آید: کاربر تصمیم می‌گیرد، نه برنامه.
  assert(bad.items.length === 1, 'هشدار ردیف را حذف نمی‌کند');
}

console.log('آبجکت ناشناخته');
{
  const r = O.plan([{ object_id: 'چیزی_نیست', cabinet_id: 'c1' }], CABS, {});
  assert(r.items.length === 0, 'ردیف جعلی ساخته نمی‌شود');
  assert(r.warnings.length > 0, 'و سکوت نمی‌شود', JSON.stringify(r.warnings));
}

console.log('کابینت ناشناخته');
{
  const r = O.plan([{ object_id: 'sink_single', cabinet_id: 'نیست' }], CABS, {});
  assert(r.warnings.some(w => w.indexOf('پیدا نشد') !== -1),
         'کابینتِ نبوده گزارش می‌شود', JSON.stringify(r.warnings));
  assert(r.items.length === 1, 'ولی کالا شمرده می‌شود — سینک خریده می‌شود');
}

console.log('کارگاه می‌تواند آبجکت اضافه کند');
{
  const cfg = { custom_objects: [
    { id: 'sink_corner', group: 'plumbing', label_fa: 'سینک گوشه',
      w: 900, d: 900, h: 200, mount: 'counter_top', built_in: true,
      cutout: { w: 870, d: 870, radius_mm: 30 }, min_cabinet_w: 900, unit: 'عدد' }
  ] };
  const all = O.all(cfg);
  assert(all.sink_corner, 'آبجکت تازه اضافه می‌شود');
  assert(Object.keys(all).length === Object.keys(O.all({})).length + 1,
         'و چیزی را حذف نمی‌کند');

  const r = O.plan([{ object_id: 'sink_corner', cabinet_id: 'c2' }], CABS, cfg);
  assert(r.cutouts.length === 1 && r.cutouts[0].w_mm === 870,
         'و بریدگی‌اش هم کار می‌کند');
}

console.log('بازنویسی ابعاد کاتالوگ');
{
  // تأمین‌کننده‌ای که سینکش ۸۲۰ است نه ۸۰۰.
  const cfg = { custom_objects: [{ id: 'sink_single', w: 820,
                                   cutout: { w: 800, d: 480, radius_mm: 25 } }] };
  const all = O.all(cfg);
  assert(all.sink_single.w === 820, 'ابعاد بازنویسی می‌شود', String(all.sink_single.w));
  assert(all.sink_single.label_fa === 'سینک تک‌لگن',
         'ولی نام از کاتالوگ می‌ماند — بازنویسی جزئی است');
}

console.log('حالت‌های خالی');
{
  assert(O.plan([], CABS, {}).items.length === 0, 'هیچ آبجکتی، هیچ ردیفی');
  assert(O.plan(null, null, null).warnings.length === 0, 'null نمی‌شکند');
  assert(O.cutoutTableHtml({ cutouts: [] }) === '', 'بدون بریدگی، برگه ساخته نمی‌شود');
}

console.log('وصل‌شدن آبجکت به کابینتِ زیرش');
{
  // بدون این، `cabinet_id` خالی می‌ماند و هشدار «فر ۶۰ در کابینت ۵۰ جا
  // نمی‌شود» هرگز فعال نمی‌شود — یعنی همان چیزی که برای آن ساخته شد.
  const cabs = [
    { kalaxa_id: 'c1', label_fa: 'زیرسینک', params: { cabinet_width: 80, cabinet_depth: 55 },
      world_transform: { origin_cm: [0, 0, 0], rotation_z_deg: 0 } },
    { kalaxa_id: 'c2', label_fa: 'زیرگاز', params: { cabinet_width: 90, cabinet_depth: 55 },
      world_transform: { origin_cm: [80, 0, 0], rotation_z_deg: 0 } }
  ];
  const objs = [
    { object_id: 'sink_single', label_fa: 'سینک', w_mm: 800, d_mm: 500,
      world_transform: { origin_cm: [0, 0, 72], rotation_z_deg: 0 } },
    { object_id: 'hob_gas_5', label_fa: 'اجاق', w_mm: 900, d_mm: 520,
      world_transform: { origin_cm: [80, 0, 72], rotation_z_deg: 0 } }
  ];

  const r = O.attach(objs, cabs);
  assert(r.objects[0].cabinet_id === 'c1', 'سینک به کابینت زیرش وصل شد',
         String(r.objects[0].cabinet_id));
  assert(r.objects[1].cabinet_id === 'c2', 'اجاق به کابینت خودش',
         String(r.objects[1].cabinet_id));
  assert(r.warnings.length === 0, 'بدون هشدار', JSON.stringify(r.warnings));
}

console.log('چرخش ۹۰ درجه');
{
  // ران دوم آشپزخانه معمولاً ۹۰ درجه چرخیده است. اگر ردپا نچرخد، آبجکت
  // به هیچ کابینتی وصل نمی‌شود یا بدتر، به کابینت اشتباه.
  const f0 = O.footprint([0, 0], 0, 800, 550);
  const f90 = O.footprint([0, 0], 90, 800, 550);
  assert(f0.x1 - f0.x0 === 800, 'بدون چرخش: عرض روی x');
  assert(f90.y1 - f90.y0 === 800, 'با ۹۰ درجه: عرض روی y می‌رود',
         String(f90.y1 - f90.y0));

  const cabs = [{ kalaxa_id: 'c9', params: { cabinet_width: 60, cabinet_depth: 55 },
                  world_transform: { origin_cm: [0, 100, 0], rotation_z_deg: 90 } }];
  const objs = [{ object_id: 'oven_built_in', label_fa: 'فر', w_mm: 595, d_mm: 570,
                  world_transform: { origin_cm: [0, 100, 0], rotation_z_deg: 90 } }];
  assert(O.attach(objs, cabs).objects[0].cabinet_id === 'c9',
         'روی ران چرخیده هم وصل می‌شود');
}

console.log('مرکز ملاک است، نه گوشه');
{
  // سینکی که کمی از کابینت بیرون زده باز هم متعلق به همان کابینت است.
  const cabs = [{ kalaxa_id: 'c1', params: { cabinet_width: 80, cabinet_depth: 55 },
                  world_transform: { origin_cm: [0, 0, 0], rotation_z_deg: 0 } }];
  const objs = [{ object_id: 'sink_single', label_fa: 'س', w_mm: 900, d_mm: 500,
                  world_transform: { origin_cm: [-5, 0, 72], rotation_z_deg: 0 } }];
  assert(O.attach(objs, cabs).objects[0].cabinet_id === 'c1',
         'کمی بیرون‌زدگی وصل را خراب نمی‌کند');
}

console.log('ابهام: حدس زده نمی‌شود');
{
  // دو کابینت روی هم افتاده‌اند. حدس‌زدن یعنی هشدارِ جا شدن روی کابینت غلط
  // بیفتد — بدتر از نگفتن.
  const cabs = [
    { kalaxa_id: 'a', params: { cabinet_width: 80, cabinet_depth: 55 },
      world_transform: { origin_cm: [0, 0, 0], rotation_z_deg: 0 } },
    { kalaxa_id: 'b', params: { cabinet_width: 80, cabinet_depth: 55 },
      world_transform: { origin_cm: [0, 0, 0], rotation_z_deg: 0 } }
  ];
  const objs = [{ object_id: 'sink_single', label_fa: 'سینک', w_mm: 800, d_mm: 500,
                  world_transform: { origin_cm: [0, 0, 72], rotation_z_deg: 0 } }];
  const r = O.attach(objs, cabs);
  assert(!r.objects[0].cabinet_id, 'به هیچ‌کدام وصل نمی‌شود');
  assert(r.warnings.some(w => w.indexOf('مرز') !== -1),
         'و از کاربر پرسیده می‌شود', JSON.stringify(r.warnings));
}

console.log('زاویهٔ غیرمعمول: اعتراف');
{
  const f = O.footprint([0, 0], 37, 800, 550);
  assert(f.approx, 'زاویهٔ ۳۷ درجه تقریبی علامت می‌خورد');
  assert(!O.footprint([0, 0], 90, 800, 550).approx, 'ولی ۹۰ درجه دقیق است');

  const cabs = [{ kalaxa_id: 'c1', params: { cabinet_width: 80, cabinet_depth: 55 },
                  world_transform: { origin_cm: [0, 0, 0], rotation_z_deg: 37 } }];
  const objs = [{ object_id: 'sink_single', label_fa: 'سینک', w_mm: 800, d_mm: 500,
                  world_transform: { origin_cm: [0, 0, 72], rotation_z_deg: 37 } }];
  const r = O.attach(objs, cabs);
  if (r.objects[0].cabinet_id) {
    assert(r.warnings.some(w => w.indexOf('تقریبی') !== -1),
           'اگر وصل شد، تقریبی بودنش گفته می‌شود', JSON.stringify(r.warnings));
  } else {
    assert(true, 'یا اصلاً وصل نمی‌شود — هر دو صادقانه‌اند');
  }
}

console.log('وصلِ از قبل تعیین‌شده دست نمی‌خورد');
{
  const cabs = [{ kalaxa_id: 'c1', params: { cabinet_width: 80, cabinet_depth: 55 },
                  world_transform: { origin_cm: [0, 0, 0], rotation_z_deg: 0 } }];
  const objs = [{ object_id: 'sink_single', cabinet_id: 'دستی', w_mm: 800, d_mm: 500,
                  world_transform: { origin_cm: [0, 0, 72], rotation_z_deg: 0 } }];
  assert(O.attach(objs, cabs).objects[0].cabinet_id === 'دستی',
         'تصمیم کاربر بر تشخیص خودکار مقدم است');
}

console.log('و هشدار جا نشدن حالا واقعاً فعال می‌شود');
{
  // این نقطهٔ اصلی کار است: پیش از وصل‌شدن، این هشدار هرگز نمی‌آمد.
  const cabs = [{ kalaxa_id: 'small', label_fa: 'کوچک',
                  params: { cabinet_width: 50, cabinet_depth: 55 },
                  world_transform: { origin_cm: [0, 0, 0], rotation_z_deg: 0 } }];
  const objs = [{ object_id: 'oven_built_in', label_fa: 'فر', w_mm: 595, d_mm: 570,
                  world_transform: { origin_cm: [0, 0, 0], rotation_z_deg: 0 } }];
  const att = O.attach(objs, cabs);
  const r = O.plan(att.objects.map(o => ({ object_id: o.object_id, cabinet_id: o.cabinet_id })),
                   cabs, {});
  assert(r.warnings.some(w => w.indexOf('جا نمی‌شود') !== -1),
         'فر ۶۰ در کابینت ۵۰ — هشدار می‌آید', JSON.stringify(r.warnings));
}

console.log('\n' + passed + ' گذشت، ' + failed + ' افتاد');
process.exit(failed ? 1 : 0);
