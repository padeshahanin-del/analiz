/** نقشهٔ انفجاری — node test_exploded.js
 *
 * چیزی که این نقشه باید ثابت کند: قطعات از هم باز می‌شوند و **در جهت درست**.
 * دیوارهٔ چپ باید به چپ برود، درب به جلو، سقف به بالا. اگر جهت غلط باشد نقشه
 * بدتر از نبودنش است — کارگاه مونتاژ را اشتباه می‌فهمد.
 *
 * جهت عمداً از **موقعیت** قطعه گرفته می‌شود نه از نقشش، تا نقشهٔ انفجاری حتی
 * وقتی طبقه‌بندی مطمئن نیست هم درست دربیاید.
 */
'use strict';
const path = require('path');
const E = require(path.join(__dirname, '..', '..', 'ui', 'kalaxa-exploded.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

function b(name, x, y, z, dx, dy, dz, role) {
  return { name: name, x: x, y: y, z: z, dx: dx, dy: dy, dz: dz, role: role };
}

// کابینت ۹۰۰×۷۲۰×۵۵۰ با محور: x=عرض، y=عمق (جلو y=0)، z=ارتفاع
const CAB = [
  b('دیوارهٔ چپ', 0, 0, 0, 16, 550, 720),
  b('دیوارهٔ راست', 884, 0, 0, 16, 550, 720),
  b('کف', 16, 0, 0, 868, 550, 16),
  b('سقف', 16, 0, 704, 868, 550, 16),
  b('پشت‌بند', 16, 542, 16, 868, 8, 688),
  b('درب', 0, -18, 0, 900, 18, 720)
];

console.log('جهت باز شدن');
{
  const bounds = E.boundsOf(CAB);
  const cfg = E.DEFAULTS;
  const off = n => E.offsetFor(CAB.find(p => p.name === n), bounds, cfg);

  assert(off('دیوارهٔ چپ').axis === 'x' && off('دیوارهٔ چپ').x < 0,
         'دیوارهٔ چپ به چپ می‌رود', JSON.stringify(off('دیوارهٔ چپ')));
  assert(off('دیوارهٔ راست').axis === 'x' && off('دیوارهٔ راست').x > 0,
         'دیوارهٔ راست به راست می‌رود');
  assert(off('سقف').axis === 'z' && off('سقف').z > 0, 'سقف به بالا می‌رود');
  assert(off('کف').axis === 'z' && off('کف').z < 0, 'کف به پایین می‌رود');
  assert(off('پشت‌بند').axis === 'y' && off('پشت‌بند').y > 0, 'پشت‌بند به عقب می‌رود');
  assert(off('درب').axis === 'y' && off('درب').y < 0, 'درب به جلو می‌رود');
}

console.log('فقط یک محور');
{
  const bounds = E.boundsOf(CAB);
  CAB.forEach(p => {
    const o = E.offsetFor(p, bounds, E.DEFAULTS);
    const moved = [o.x, o.y, o.z].filter(v => v !== 0).length;
    assert(moved === 1, p.name + ': فقط روی یک محور جابه‌جا می‌شود',
           JSON.stringify(o));
  });
}

console.log('قطعهٔ وسط هم باز می‌شود');
{
  // یک طبقه دقیقاً وسط کابینت است؛ اگر فقط ضریب فاصله باشد سر جایش می‌ماند و
  // زیر بقیه گم می‌شود.
  const withShelf = CAB.concat([b('طبقه', 16, 10, 352, 868, 530, 16)]);
  const o = E.offsetFor(withShelf[withShelf.length - 1], E.boundsOf(withShelf), E.DEFAULTS);
  const dist = Math.abs(o.x) + Math.abs(o.y) + Math.abs(o.z);
  assert(dist >= E.DEFAULTS.min_offset_mm,
         'قطعهٔ نزدیک مرکز هم حداقل فاصله می‌گیرد', String(dist));
}

console.log('خروجی SVG');
{
  const r = E.render(CAB);
  assert(r.svg.indexOf('<svg') === 0, 'SVG معتبر برمی‌گرداند');
  assert((r.svg.match(/<polygon/g) || []).length === CAB.length * 3,
         'هر قطعه سه وجه دیدنی دارد',
         String((r.svg.match(/<polygon/g) || []).length));
  assert(r.parts.length === CAB.length, 'همهٔ قطعات شماره می‌گیرند');
  assert(r.parts.every((p, i) => p.n === i + 1), 'شماره‌ها پشت‌سرهم‌اند');
  assert(r.svg.indexOf('viewBox') !== -1, 'قابل بزرگ‌نمایی و چاپ است');
}

console.log('نام قطعه در نقشه می‌ماند');
{
  const r = E.render(CAB);
  assert(r.svg.indexOf('دیوارهٔ چپ') !== -1, 'نام روی قطعه (title) هست');
  // نامی که کاراکتر خطرناک دارد نباید SVG را بشکند
  const evil = E.render([b('<script>x</script>', 0, 0, 0, 10, 10, 10)]);
  assert(evil.svg.indexOf('<script>') === -1, 'نام قطعه در SVG تزریق نمی‌شود');
}

console.log('خوانایی نقشه');
{
  // کاربر گفت «انفجاری خیلی جذاب نبود». سه چیز کم بود، و هر سه کارکردی‌اند
  // نه تزئینی: از کجا آمده، چه قطعه‌ای است، و نسبت به کل کجاست.
  const r = E.render(CAB);

  // رنگ **خودِ خط ردیابی** ملاک است، نه stroke-dasharray: شبح هم خط‌چین
  // دارد، پس نسخهٔ اول این تست با خاموش‌بودن ردیابی هم سبز می‌ماند. امتحان
  // کردم — می‌ماند.
  const TRACE = '#8b8577';
  assert(r.svg.indexOf(TRACE) !== -1,
         'خط ردیابی هست — همان چیزی که «کپهٔ قطعه» را نقشهٔ انفجاری می‌کند');
  assert(E.render(CAB, { trace: false }).svg.indexOf(TRACE) === -1,
         'و قابل خاموش کردن است');
  assert(E.render(CAB, { trace: false }).svg.indexOf('stroke-dasharray') !== -1,
         'ولی خاموش‌کردنش شبح را نمی‌کشد');

  // رنگ نقش: دیواره و درب نباید یک رنگ باشند، وگرنه چشم تفکیک نمی‌کند.
  //
  // نسخهٔ اول این تست فقط تعداد رنگ‌های یکتا را می‌شمرد و الکی سبز بود: رنگ
  // پس‌زمینه هم در شمارش می‌آمد و آستانه را پر می‌کرد، حتی وقتی هر دو قطعه
  // دقیقاً یک رنگ داشتند. حالا رنگ **خودِ دو قطعه** با هم مقایسه می‌شود.
  const sideC = E.colorFor({ role: 'side' }, E.DEFAULTS);
  const doorC = E.colorFor({ role: 'door' }, E.DEFAULTS);
  assert(sideC !== doorC, 'دیواره و درب رنگ پایهٔ متفاوت دارند',
         sideC + ' vs ' + doorC);

  const two = E.render([b('د', 0, 0, 0, 16, 550, 720, 'side'),
                        b('ب', 200, 0, 0, 18, 20, 700, 'door')]);
  assert(two.svg.indexOf(sideC) !== -1 && two.svg.indexOf(doorC) !== -1,
         'و هر دو رنگ واقعاً در نقشه می‌آیند');

  const mono = E.render(CAB, { color_by_role: false });
  assert(mono.svg.indexOf(doorC) === -1,
         'حالت تک‌رنگ رنگ نقش را نمی‌کشد (چاپ سیاه‌وسفید)');
}

console.log('چیزی از کادر بیرون نمی‌افتد');
{
  // شماره‌ها بیرون از قطعه می‌نشینند؛ اگر کادر آن‌ها را حساب نکند، نیمی از
  // شماره‌ها بریده دیده می‌شوند — ایرادی که در نگاه اول به چشم نمی‌آید.
  // با حاشیهٔ کمینه می‌سنجیم: حاشیهٔ بزرگ هر خطای محاسبهٔ کادر را می‌پوشاند
  // و تست را الکی سبز می‌کند. نسخهٔ اول با حاشیهٔ ۴۸ می‌سنجید و وقتی نقطهٔ
  // شماره را کلاً از محاسبه برداشتم، باز سبز ماند.
  const r = E.render(CAB, { margin_px: 0 });
  const w = Number(/width="(\d+)"/.exec(r.svg)[1]);
  const h = Number(/height="(\d+)"/.exec(r.svg)[1]);
  const cx = [...r.svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g)];
  assert(cx.length === r.parts.length, 'هر قطعه یک شماره دارد',
         cx.length + ' vs ' + r.parts.length);
  const inside = cx.every(m => {
    const x = Number(m[1]), y = Number(m[2]);
    return x >= E.DEFAULTS.label_radius_px && x <= w - E.DEFAULTS.label_radius_px &&
           y >= E.DEFAULTS.label_radius_px && y <= h - E.DEFAULTS.label_radius_px;
  });
  assert(inside, 'همهٔ شماره‌ها داخل کادرند');

  // با کابینت کامل، کادر آن‌قدر بزرگ است که حذفِ نقطهٔ شماره از محاسبه هم
  // ممکن است بی‌اثر بماند (شمارهٔ یک قطعه داخل محدودهٔ قطعهٔ دیگر می‌افتد).
  // با **یک** قطعه چنین لطفی در کار نیست: اگر نقطهٔ شماره در کادر حساب نشود،
  // شماره حتماً بیرون می‌زند. امتحان کردم — نسخهٔ قبلی این را نمی‌گرفت.
  const one = E.render([b('تک', 0, 0, 0, 400, 20, 400)], { margin_px: 0 });
  const w1 = Number(/width="(\d+)"/.exec(one.svg)[1]);
  const h1 = Number(/height="(\d+)"/.exec(one.svg)[1]);
  const m1 = /<circle cx="([\d.]+)" cy="([\d.]+)"/.exec(one.svg);
  const R = E.DEFAULTS.label_radius_px;
  assert(Number(m1[1]) >= R && Number(m1[1]) <= w1 - R &&
         Number(m1[2]) >= R && Number(m1[2]) <= h1 - R,
         'شمارهٔ تک‌قطعه هم کامل داخل کادر است',
         m1[1] + ',' + m1[2] + ' در ' + w1 + '×' + h1);

  // و شماره باید **بیرون** از خود قطعه بنشیند، وگرنه هندسه را می‌پوشاند و
  // روی قطعات ریز اصلاً خوانده نمی‌شود.
  const poly = /<polygon points="([^"]+)"/g;
  let px = [], py = [], mm2;
  while ((mm2 = poly.exec(one.svg)) !== null) {
    mm2[1].split(' ').forEach(pair => {
      const [a, bb] = pair.split(',').map(Number);
      px.push(a); py.push(bb);
    });
  }
  const bx0 = Math.min(...px), bx1 = Math.max(...px);
  const by0 = Math.min(...py), by1 = Math.max(...py);
  const lx = Number(m1[1]), ly = Number(m1[2]);
  assert(lx < bx0 || lx > bx1 || ly < by0 || ly > by1,
         'شماره روی خودِ قطعه نمی‌افتد',
         lx + ',' + ly + ' داخل ' + bx0 + '..' + bx1 + ' / ' + by0 + '..' + by1);
}

console.log('ترتیب رسم');
{
  // قطعهٔ جلویی باید **آخر** رسم شود وگرنه زیر عقبی می‌رود
  const r = E.render([b('عقب', 0, 500, 0, 100, 10, 100), b('جلو', 0, 0, 0, 100, 10, 100)]);
  assert(r.parts[r.parts.length - 1].name === 'جلو',
         'جلویی آخر رسم می‌شود', JSON.stringify(r.parts.map(p => p.name)));

  // ریشهٔ باگ ۳.۴۶: تصویر از **پشت** کابینت رندر می‌شد ولی `faceGroup` وجهِ
  // جلو (y0) را می‌کشید — وجهی که از آن زاویه اصلاً دیده نمی‌شود. مرتب‌سازیِ
  // عمق هم بردار دید سوم داشت. سه جای مستقل که باید هم‌نظر باشند.
  //
  // نسخهٔ اول این تست الکی سبز بود: فقط ترتیب را می‌سنجید، و ترتیب از
  // depthToViewer می‌آمد نه از project — پس برگرداندن project به حالت غلط
  // قرمزش نمی‌کرد. امتحانش کردم و نشد.
  //
  // حالا بردار دید را **از خودِ project** بیرون می‌کشیم (جهتی که تصویرش صفر
  // است) و می‌خواهیم با depthToViewer و با وجه‌های کشیده‌شده بخواند.
  const cfg = E.DEFAULTS;
  const o = E.project(0, 0, 0, cfg);
  const col = (x, y, z) => {
    const q = E.project(x, y, z, cfg);
    return [q.px - o.px, q.py - o.py];
  };
  const [ax, ay] = col(1, 0, 0), [bx, by] = col(0, 1, 0), [cx2, cy2] = col(0, 0, 1);
  // v را طوری می‌یابیم که تصویرش صفر شود: v = (1, t, u)
  //   ax + t·bx + u·cx = 0  و  ay + t·by + u·cy = 0
  const det = bx * cy2 - cx2 * by;
  const t = (-ax * cy2 + cx2 * ay) / det;
  const u = (-bx * ay + ax * by) / det;
  const v = [1, t, u];

  assert(Math.abs(v[1] + 1) < 1e-9 && Math.abs(v[2] - 1) < 1e-9,
         'ناظر از (۱، −۱، ۱) نگاه می‌کند — یعنی از جلو، نه از پشت',
         JSON.stringify(v.map(n => Math.round(n * 1e6) / 1e6)));

  // مرتب‌سازی عمق باید **همان** بردار را داشته باشد، وگرنه روزی یکی عوض
  // می‌شود و دیگری نه.
  assert(Math.abs(E.depthToViewer(v[0], v[1], v[2]) - (v[0] * v[0] + v[1] * v[1] + v[2] * v[2])) < 1e-9,
         'depthToViewer با همان بردار دیدِ project می‌خواند',
         String(E.depthToViewer(v[0], v[1], v[2])));

  // و وجه‌هایی که faceGroup می‌کشد باید از همین زاویه دیدنی باشند:
  // بالا (+z)، جلو (−y)، کنار (+x).
  [[0, 0, 1], [0, -1, 0], [1, 0, 0]].forEach(function (n, i) {
    const dot = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
    assert(dot > 0, 'وجه ' + ['بالا', 'جلو', 'کنار'][i] + ' از این زاویه دیدنی است',
           String(dot));
  });

  const near = E.render([b('نزدیک', 0, 0, 0, 100, 10, 100),
                         b('دور', 0, 500, 0, 100, 10, 100)]);
  assert(near.parts[near.parts.length - 1].name === 'نزدیک',
         'قطعهٔ نزدیک‌تر به ناظر آخر می‌آید — با هر ترتیبی که ورودی بدهیم',
         JSON.stringify(near.parts.map(p => p.name)));
}

console.log('حالت‌های خالی');
{
  assert(E.render([]).warnings.length > 0, 'ورودی خالی پیام می‌دهد، نه SVG خراب');
  assert(E.render([b('صفر', 0, 0, 0, 0, 10, 10)]).warnings.length > 0,
         'قطعهٔ با بعد صفر کنار گذاشته می‌شود');
  assert(E.render(null).svg === '', 'null نباید بشکند');
}

console.log('\n' + passed + ' گذشت، ' + failed + ' افتاد');
process.exit(failed ? 1 : 0);
