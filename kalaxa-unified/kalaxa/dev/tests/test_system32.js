/**
 * تست سیستم ۳۲.
 *
 * هدف: قفل‌کردن چیزهایی که اگر بشکنند تخته دور ریخته می‌شود — نه شمردن
 * سوراخ. هر تست باید با یک تغییرِ معنادار در ماژول بیفتد.
 */
var path = require('path');
var S = require(path.join(__dirname, '..', '..', 'ui', 'kalaxa-system32.js'));

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}

var SIDE = function (L, W, th) {
  return { role: 'side', name: 'دیواره', cut_length_mm: L, cut_width_mm: W,
           thickness_mm: th == null ? 18 : th };
};

// ── جهت ───────────────────────────────────────────────────────────────
(function () {
  // دیوارهٔ قدی: طول = ارتفاع
  var r = S.orient(SIDE(2000, 550), 2000, 550);
  ok('جهت: طول=ارتفاع شناخته شد', r.ok && r.uIsHeight === true, r.reason);

  // همان دیواره چرخیده روی برگهٔ برش: طول = عمق
  var r2 = S.orient(SIDE(550, 2000), 2000, 550);
  ok('جهت: طول=عمق شناخته شد', r2.ok && r2.uIsHeight === false, r2.reason);

  // ابعادی که به هیچ‌کدام نمی‌خورد باید **رد** شود نه حدس
  var r3 = S.orient(SIDE(2000, 550), 720, 550);
  ok('جهت: ناهم‌خوان رد شد', !r3.ok, 'باید رد می‌شد');
  ok('جهت: دلیلِ رد گفته شد', /نمی‌خوان/.test(r3.reason), r3.reason);

  // دیوارهٔ مربع: هر دو تفسیر ممکن است → نباید یکی را بی‌دلیل بردارد
  var r4 = S.orient(SIDE(600, 600), 600, 600);
  ok('جهت: مربع مبهم اعلام شد', !r4.ok && /مربع/.test(r4.reason), r4.reason);
}());

// ── ترازها: مبدأ مشترک ─────────────────────────────────────────────────
(function () {
  var p = S.params();
  var a = S.levels(2000, p);
  var b = S.levels(1800, p);
  ok('تراز: همه مضرب گام‌اند',
     a.every(function (z) { return Math.abs(z % p.pitch_mm) < 1e-6; }));

  // دو دیوارهٔ هم‌پروژه با ارتفاع متفاوت باید سوراخ‌های هم‌ترازِ مشترک بدهند.
  // اگر مبدأ از «فاصلهٔ آزاد» هر تخته شروع شود، این می‌شکند.
  var common = a.filter(function (z) { return b.indexOf(z) >= 0; });
  ok('تراز: مبدأ بین دو ارتفاع مشترک است',
     common.length > 40, 'مشترک=' + common.length);

  // با پیش‌فرض، فاصلهٔ آزاد (۳۲) خودش مضرب گام است، پس تستِ بالا تهی است:
  // «شروع از فاصلهٔ آزاد» و «شروع از مضرب گام» یک جواب می‌دهند. با فاصلهٔ
  // آزادِ غیرمضرب، این دو از هم جدا می‌شوند.
  var q = S.params({ end_clearance_mm: 20 });
  var c = S.levels(2000, q);
  ok('تراز: مبدأ گام است نه فاصلهٔ آزاد',
     c[0] === q.pitch_mm, 'اولین=' + c[0]);
  ok('تراز: با فاصلهٔ آزادِ غیرمضرب هم همه مضرب گام‌اند',
     c.every(function (z) { return Math.abs(z % q.pitch_mm) < 1e-6; }));

  // و دو ارتفاعِ متفاوت با همان تنظیمات باید هم‌تراز بمانند
  var c2 = S.levels(1450, q);
  ok('تراز: هم‌ترازی مستقل از ارتفاع است',
     c2.every(function (z) { return c.indexOf(z) >= 0; }));

  ok('تراز: از سر و ته فاصله دارد',
     a[0] >= p.end_clearance_mm && a[a.length - 1] <= 2000 - p.end_clearance_mm,
     a[0] + '..' + a[a.length - 1]);
}());

// ── قرینه ─────────────────────────────────────────────────────────────
(function () {
  var D = 550;
  var L = S.planPart(SIDE(2000, D), { height_mm: 2000, depth_mm: D });
  var R = S.planPart(SIDE(2000, D), { height_mm: 2000, depth_mm: D, mirror: true });

  ok('قرینه: تعداد سوراخ یکی است', L.holes.length === R.holes.length);

  var vL = L.holes.map(function (h) { return h.v_mm; }).sort(function (a, b) { return a - b; });
  var vR = R.holes.map(function (h) { return h.v_mm; }).sort(function (a, b) { return a - b; });

  // قرینه باید **واقعاً** جابه‌جا کند، نه اینکه همان باشد.
  var same = JSON.stringify(vL) === JSON.stringify(vR);
  var setbacks = S.params();
  var asym = setbacks.front_setback_mm !== setbacks.back_setback_mm;
  if (asym) {
    ok('قرینه: مختصات عوض شد', !same);
  } else {
    // با فاصلهٔ متقارن، آینه از روی خودِ عدد پیدا نیست — با فاصلهٔ نامتقارن
    // آزمایش می‌شود، وگرنه تست تهی است.
    var L2 = S.planPart(SIDE(2000, D), { height_mm: 2000, depth_mm: D },
                        { back_setback_mm: 80 });
    var R2 = S.planPart(SIDE(2000, D), { height_mm: 2000, depth_mm: D, mirror: true },
                        { back_setback_mm: 80 });
    var s1 = L2.holes.map(function (h) { return h.v_mm; }).sort().join();
    var s2 = R2.holes.map(function (h) { return h.v_mm; }).sort().join();
    ok('قرینه: با فاصلهٔ نامتقارن مختصات عوض شد', s1 !== s2, s1 + ' vs ' + s2);
    // و آینه باید دقیقاً D منهای مقدار باشد
    var setL = L2.holes.map(function (h) { return h.v_mm; });
    var setR = R2.holes.map(function (h) { return h.v_mm; });
    ok('قرینه: آینه حول عمق است',
       setL.every(function (v) { return setR.indexOf(D - v) >= 0; }));
  }
}());

// ── سرتاسری نشدن ──────────────────────────────────────────────────────
(function () {
  // تختهٔ ۱۶ با عمق سوراخ ۱۳ و حداقل ۳ باقی‌مانده → دقیقاً مرز
  var thin = S.planPart(SIDE(2000, 550, 12), { height_mm: 2000, depth_mm: 550 });
  ok('عمق: تختهٔ نازک رد شد', thin.holes.length === 0);
  ok('عمق: دلیل گفته شد',
     (thin.warnings[0] || '').indexOf('بیرون') >= 0, thin.warnings[0]);

  var thick = S.planPart(SIDE(2000, 550, 18), { height_mm: 2000, depth_mm: 550 });
  ok('عمق: تختهٔ ۱۸ قبول شد', thick.holes.length > 0);
  ok('عمق: هیچ سوراخی سرتاسری نیست',
     thick.holes.every(function (h) { return h.through === false; }));
}());

// ── نقش ───────────────────────────────────────────────────────────────
(function () {
  ['back', 'door', 'shelf', 'bottom'].forEach(function (role) {
    var part = SIDE(2000, 550); part.role = role;
    var r = S.planPart(part, { height_mm: 2000, depth_mm: 550 });
    ok('نقش: ' + role + ' پین نمی‌گیرد', r.holes.length === 0);
  });
  var d = SIDE(2000, 550); d.role = 'divider';
  ok('نقش: میانی پین می‌گیرد',
     S.planPart(d, { height_mm: 2000, depth_mm: 550 }).holes.length > 0);
}());

// ── برخورد با لولا ────────────────────────────────────────────────────
(function () {
  var base = S.planPart(SIDE(2000, 550), { height_mm: 2000, depth_mm: 550 });
  var one = base.holes[10];
  var withAvoid = S.planPart(SIDE(2000, 550), {
    height_mm: 2000, depth_mm: 550,
    avoid: [{ u_mm: one.u_mm, v_mm: one.v_mm, dia_mm: 35 }]
  });
  ok('برخورد: سوراخِ درگیر حذف شد',
     withAvoid.holes.length < base.holes.length,
     base.holes.length + ' → ' + withAvoid.holes.length);
  ok('برخورد: سکوت نشد',
     withAvoid.warnings.some(function (w) { return w.indexOf('لولا') >= 0; }),
     JSON.stringify(withAvoid.warnings));
}());

// ── تراز طبقه ─────────────────────────────────────────────────────────
(function () {
  var r = S.planPart(SIDE(2000, 550), {
    height_mm: 2000, depth_mm: 550, shelf_levels_mm: [640, 1000]
  });
  ok('طبقه: هر دو تراز نگاشت شدند', r.shelf_holes.length === 2);
  ok('طبقه: ۶۴۰ مضرب ۳۲ است و دقیق افتاد',
     r.shelf_holes[0].off_mm === 0, JSON.stringify(r.shelf_holes[0]));
  // ۱۰۰۰ مضرب ۳۲ نیست → باید **بگوید**، نه بی‌صدا گرد کند
  ok('طبقه: انحراف اعلام شد',
     r.shelf_holes[1].off_mm !== 0 &&
     r.warnings.some(function (w) { return w.indexOf('مضرب') >= 0; }),
     JSON.stringify(r.warnings));
  ok('طبقه: انحراف از نصفِ گام بیشتر نیست',
     Math.abs(r.shelf_holes[1].off_mm) <= 16);
}());

// ── چسباندن به features ───────────────────────────────────────────────
(function () {
  var part = SIDE(2000, 550);
  part.features = { holes: [{ u_mm: 5, v_mm: 5, dia_mm: 8, through: true }] };
  var r = S.attach(part, { height_mm: 2000, depth_mm: 550 });
  ok('چسباندن: سوراخ مدل پاک نشد',
     part.features.holes.some(function (h) { return h.dia_mm === 8; }));
  ok('چسباندن: سوراخ پین اضافه شد',
     part.features.holes.length === 1 + r.holes.length);

  // نقشهٔ CNC موجود باید بدون تغییر بکشدش
  var Cnc = require(path.join(__dirname, '..', '..', 'ui', 'kalaxa-cnc-sheet.js'));
  var out = Cnc.render(part);
  ok('چسباندن: نقشهٔ CNC آن را کشید',
     out.holes.length === part.features.holes.length && out.svg.length > 0);
  ok('چسباندن: جدول عمق را عدد داد نه ؟',
     Cnc.tableHtml(out).indexOf('؟') < 0);
}());

// ── کاتالوگ ───────────────────────────────────────────────────────────
(function () {
  var fs = require('fs');
  var file = path.join(__dirname, '..', '..', 'data', 'system32.json');
  var j = JSON.parse(fs.readFileSync(file, 'utf8'));
  Object.keys(S.FALLBACK).forEach(function (k) {
    ok('کاتالوگ: ' + k + ' هست', j[k] != null);
    ok('کاتالوگ: ' + k + ' با پشتیبان یکی است',
       JSON.stringify(j[k]) === JSON.stringify(S.FALLBACK[k]),
       JSON.stringify(j[k]) + ' vs ' + JSON.stringify(S.FALLBACK[k]));
  });
}());

console.log((fail ? '✗' : '✓') + ' سیستم ۳۲: ' + pass + ' موفق، ' + fail + ' ناموفق');
process.exit(fail ? 1 : 0);
