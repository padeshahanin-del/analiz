/**
 * تست یکپارچگی سیستم ۳۲ — از کابینتِ واقعی تا سوراخ روی نقشه.
 *
 * چرا جدا از `test_system32.js`: آن تست ماژول را با قطعهٔ دست‌ساز می‌آزماید.
 * اشکالی که بارها ما را زده جای دیگری بود — **نویسنده و خواننده هم را
 * نمی‌دیدند** و هرکدام جداگانه سبز بودند. پس این تست هندسه را از خودِ
 * `CabinetGeometry` می‌گیرد (نه از فایل fixture که می‌تواند دروغ بگوید)،
 * از `KalaxaPartClassifier` رد می‌کند، و می‌بیند سوراخ واقعاً به نقشهٔ
 * `KalaxaCncSheet` می‌رسد یا نه.
 */
var path = require('path');
var cp = require('child_process');
var root = path.join(__dirname, '..', '..');
var S = require(path.join(root, 'ui', 'kalaxa-system32.js'));
var C = require(path.join(root, 'ui', 'kalaxa-part-classifier.js'));
var Cnc = require(path.join(root, 'ui', 'kalaxa-cnc-sheet.js'));

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}

/** هندسه را زنده از روبی می‌گیرد تا fixture کهنه نتواند دروغ بگوید. */
function boxesOf(template, w, h, d) {
  var script =
    '$LOAD_PATH.unshift("test/stubs"); ENV["KALAXA_QUIET"]="1";' +
    'require "tmpdir"; ENV["KALAXA_DATA_DIR"]=Dir.mktmpdir;' +
    'require "su_double"; require "json";' +
    'require "./kalaxa/lib/catalog"; require "./kalaxa/lib/cabinet_geometry";' +
    'b=Kalaxa::CabinetGeometry.boxes_for("' + template + '",' +
    w + ',' + h + ',' + d + ',{});' +
    'puts JSON.generate(b.each_with_index.map{|x,i| x.merge("id"=>i,"name"=>x["key"])})';
  var out = cp.execFileSync('ruby', ['-e', script],
    { cwd: path.join(root, '..'), encoding: 'utf8' });
  return JSON.parse(out.trim().split('\n').pop());
}

var boxes;
try {
  boxes = boxesOf('bookcase', 80, 220, 35);
} catch (e) {
  console.log('✗ سیستم ۳۲ (یکپارچه): هندسه از روبی گرفته نشد :: ' + e.message);
  process.exit(1);
}

ok('هندسه: کتابخانه ساخته شد', boxes.length > 5, boxes.length + ' جعبه');

var res = C.classify(boxes);
var sides = res.parts.filter(function (p) { return p.role === 'side'; });
ok('طبقه‌بندی: دیواره پیدا شد', sides.length >= 2, sides.length + ' دیواره');

var shelves = res.parts.filter(function (p) { return p.role === 'shelf'; });
ok('طبقه‌بندی: طبقه پیدا شد', shelves.length >= 1, shelves.length + ' طبقه');

// ── مسیر کامل ─────────────────────────────────────────────────────────
var plan = S.planCabinet(res.parts);
ok('مسیر: ردیف پین ساخته شد', plan.sides.length >= 2, plan.sides.length + '');

var drilled = plan.sides.filter(function (s) { return s.result.holes.length > 0; });
ok('مسیر: دیواره‌ها واقعاً سوراخ خوردند',
   drilled.length === plan.sides.length,
   drilled.length + '/' + plan.sides.length + ' :: ' + JSON.stringify(plan.warnings));

// دقیقاً یکی از دو دیواره باید آینه شود — نه هیچ‌کدام، نه هر دو.
var mirrored = plan.sides.filter(function (s) { return s.mirror; }).length;
ok('مسیر: دقیقاً یک دیواره آینه شد', mirrored === 1, mirrored + ' آینه');

// و آینه باید مختصات را واقعاً عوض کند (با فاصلهٔ نامتقارن قابل اثبات)
(function () {
  var p2 = S.planCabinet(res.parts.map(function (q) {
    var c = {}; Object.keys(q).forEach(function (k) { c[k] = q[k]; });
    delete c.features; return c;
  }), { back_setback_mm: 80 });
  var a = p2.sides.filter(function (s) { return !s.mirror; })[0];
  var b = p2.sides.filter(function (s) { return s.mirror; })[0];
  if (!a || !b) { ok('مسیر: جفت آینه موجود است', false); return; }
  var va = a.result.holes.map(function (h) { return h.v_mm; });
  var vb = b.result.holes.map(function (h) { return h.v_mm; });
  ok('مسیر: آینه مختصات را عوض کرد',
     JSON.stringify(va.slice(0, 4)) !== JSON.stringify(vb.slice(0, 4)),
     va.slice(0, 2) + ' vs ' + vb.slice(0, 2));
}());

// ── می‌رسد به نقشه؟ ───────────────────────────────────────────────────
(function () {
  var side = drilled[0] && drilled[0].part;
  if (!side) { ok('نقشه: دیوارهٔ سوراخ‌خورده موجود است', false); return; }

  ok('نقشه: سوراخ به features قطعه نشست',
     ((side.features || {}).holes || []).length > 0);

  var sheet = Cnc.render(side);
  ok('نقشه: CNC کشیدش', sheet.svg.length > 0 && sheet.holes.length > 0,
     sheet.holes.length + ' سوراخ');
  ok('نقشه: تعداد سوراخ نقشه با ردیف پین می‌خواند',
     sheet.holes.length === side.features.holes.length);

  // هر سوراخ باید داخل خودِ قطعه باشد. سوراخِ بیرونِ تخته یعنی جهت غلط.
  var outside = sheet.holes.filter(function (h) {
    return h.from_length_mm < 0 || h.from_length_mm > side.cut_length_mm ||
           h.from_width_mm < 0 || h.from_width_mm > side.cut_width_mm;
  });
  ok('نقشه: هیچ سوراخی بیرون قطعه نیست', outside.length === 0,
     JSON.stringify(outside.slice(0, 2)));

  ok('نقشه: جدول عمق را عدد داد', Cnc.tableHtml(sheet).indexOf('؟') < 0);
  ok('نقشه: یادداشت کارگاه ساخته شد',
     S.noteHtml(drilled[0].result).indexOf('۳۲') >= 0);
}());

// ── طبقهٔ واقعی روی سوراخ می‌افتد؟ ─────────────────────────────────────
(function () {
  var s = drilled[0];
  if (!s) return;
  ok('طبقه: ترازها نگاشت شدند',
     s.result.shelf_holes.length === shelves.length,
     s.result.shelf_holes.length + ' vs ' + shelves.length + ' طبقه');
  ok('طبقه: انحراف هیچ‌کدام از نصف گام بیشتر نیست',
     s.result.shelf_holes.every(function (x) { return Math.abs(x.off_mm) <= 16; }),
     JSON.stringify(s.result.shelf_holes));
}());

// ── کابینتی که نباید پین بگیرد ────────────────────────────────────────
(function () {
  var b2 = boxesOf('base_three_drawer', 60, 72, 55);
  var r2 = C.classify(b2);
  var p2 = S.planCabinet(r2.parts);
  // کشودار هم دیواره دارد؛ پین منطقی است. چیزی که باید تضمین شود این است
  // که نمای کشو و پشت‌بند هرگز سوراخ نمی‌خورند.
  var wrong = r2.parts.filter(function (q) {
    return q.role !== 'side' && q.role !== 'divider' &&
           (((q.features || {}).holes) || []).some(function (h) {
             return h.source === 'system32';
           });
  });
  ok('نقش: فقط دیواره سوراخ خورد', wrong.length === 0,
     wrong.map(function (q) { return q.role; }).join(','));
  ok('کشودار: بدون خطای خاموش',
     p2.warnings.every(function (w) { return w.indexOf('نمی‌خوان') < 0; }),
     JSON.stringify(p2.warnings));
}());

// ── طبقه روی سوراخ می‌نشیند؟ (قفلِ چسبیدن به شبکه) ────────────────────
// این تستِ اصلی این نسخه است: سیستم پینی که هیچ طبقه‌اش روی پین نیفتد
// بی‌فایده است. `snap_to_pin_grid` در روبی تراز طبقه را جابه‌جا می‌کند و
// این‌جا از سرِ دیگرِ خط بررسی می‌شود.
[['bookcase', 80, 220, 35], ['tall_double_door', 60, 220, 55],
 ['base_single_door', 60, 72, 55], ['wardrobe', 180, 240, 60],
 ['tall_pantry', 60, 200, 55]].forEach(function (a) {
  var r = C.classify(boxesOf(a[0], a[1], a[2], a[3]));
  var pl = S.planCabinet(r.parts);
  var s = pl.sides.filter(function (x) { return x.result.holes.length; })[0];
  if (!s) { ok(a[0] + ': دیوارهٔ سوراخ‌خورده دارد', false); return; }
  ok(a[0] + ': هر طبقه دقیقاً روی سوراخ نشست',
     s.result.shelf_holes.length > 0 &&
     s.result.shelf_holes.every(function (x) { return x.off_mm === 0; }),
     JSON.stringify(s.result.shelf_holes.map(function (x) { return x.off_mm; })));
  ok(a[0] + ': هیچ هشداری نماند', pl.warnings.length === 0,
     JSON.stringify(pl.warnings));
});

console.log((fail ? '✗' : '✓') + ' سیستم ۳۲ (یکپارچه): ' + pass + ' موفق، ' +
            fail + ' ناموفق');
process.exit(fail ? 1 : 0);
