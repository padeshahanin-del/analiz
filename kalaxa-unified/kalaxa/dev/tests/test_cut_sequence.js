/** ترتیب برش گیلوتینی — node test_cut_sequence.js
 *
 * کاربر گفت مهم‌ترین چیز برایش **برش سراسری (گیلوتینی)** است.
 *
 * موتور نستینگ از قبل گیلوتینی بود (با ۲۰۰ چیدمان تصادفی سنجیده شد). شکاف
 * این بود که نقشه می‌گوید قطعه **کجاست** ولی نمی‌گوید **به چه ترتیبی** ببُری.
 * اپراتور پانل‌بر با «کجا» کار نمی‌کند: یک برش سراسری می‌زند، ورق دو تکه
 * می‌شود، بعد هر تکه را جدا می‌بَرد.
 *
 * سخت‌ترین بخش این تست: ثابت کردن اینکه ترتیب **واقعاً اجراشدنی** است، نه
 * اینکه فقط عددی برگشته باشد. برای همین هر برش را شبیه‌سازی می‌کنیم.
 */
'use strict';
const path = require('path');
const UI = path.join(__dirname, '..', '..', 'ui');
const S = require(path.join(UI, 'kalaxa-cut-sequence.js'));
const N = require(path.join(UI, 'kalaxa-nesting.js'));
const V = require(path.join(UI, 'kalaxa-nesting-validator.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

const SHEET = { sheet_id: 's', material: 'mdf', color_code: 'W', thickness_mm: 16,
                width_mm: 2800, height_mm: 2100, has_grain: false,
                price_per_sheet: 0, trim_margin_mm: 10 };

function pl(uid, x, y, w, h) {
  return { part_uid: uid, instance: 1, x_mm: x, y_mm: y, w_mm: w, h_mm: h };
}

/**
 * شبیه‌سازی اجرای واقعی: هر برش باید ناحیه‌ای را که در آن اجرا می‌شود دقیقاً
 * دو تکه کند و **از داخل هیچ قطعه‌ای نگذرد**. اگر ترتیب غلط باشد این‌جا
 * می‌شکند، حتی اگر خروجی «معتبر» به‌نظر برسد.
 */
function executable(placements, cuts, sheet) {
  const trim = sheet.trim_margin_mm || 0;
  let regions = [{ x: trim, y: trim, w: sheet.width_mm - 2 * trim, h: sheet.height_mm - 2 * trim }];
  for (const c of cuts) {
    const idx = regions.findIndex(r =>
      c.axis === 'x' ? (c.pos_mm > r.x + 0.01 && c.pos_mm < r.x + r.w - 0.01 &&
                        Math.abs(c.from_mm - r.y) < 0.5 && Math.abs(c.to_mm - (r.y + r.h)) < 0.5)
                     : (c.pos_mm > r.y + 0.01 && c.pos_mm < r.y + r.h - 0.01 &&
                        Math.abs(c.from_mm - r.x) < 0.5 && Math.abs(c.to_mm - (r.x + r.w)) < 0.5));
    if (idx === -1) return 'برش ' + c.n + ' به هیچ ناحیهٔ موجودی نمی‌خورد';

    const r = regions[idx];
    // خط نباید از داخل قطعه‌ای که در این ناحیه است بگذرد
    for (const p of placements) {
      const inRegion = p.x_mm >= r.x - 0.01 && p.y_mm >= r.y - 0.01 &&
                       p.x_mm + p.w_mm <= r.x + r.w + 0.01 && p.y_mm + p.h_mm <= r.y + r.h + 0.01;
      if (!inRegion) continue;
      const a = c.axis === 'x' ? p.x_mm : p.y_mm;
      const b = a + (c.axis === 'x' ? p.w_mm : p.h_mm);
      if (c.pos_mm > a + 0.01 && c.pos_mm < b - 0.01) {
        return 'برش ' + c.n + ' از داخل قطعهٔ ' + p.part_uid + ' می‌گذرد';
      }
    }

    const two = c.axis === 'x'
      ? [{ x: r.x, y: r.y, w: c.pos_mm - r.x, h: r.h },
         { x: c.pos_mm, y: r.y, w: r.x + r.w - c.pos_mm, h: r.h }]
      : [{ x: r.x, y: r.y, w: r.w, h: c.pos_mm - r.y },
         { x: r.x, y: c.pos_mm, w: r.w, h: r.y + r.h - c.pos_mm }];
    regions.splice(idx, 1, two[0], two[1]);
  }
  return null;
}

console.log('چیدمان ساده');
{
  // دو قطعه کنار هم: یک برش عمودی کافی است
  const layout = { placements: [pl('a', 10, 10, 1000, 2080), pl('b', 1014, 10, 800, 2080)] };
  const r = S.forLayout(layout, SHEET);
  assert(r.ok, 'ترتیب پیدا می‌شود');
  assert(r.cuts.length === 1, 'یک برش کافی است', String(r.cuts.length));
  assert(r.cuts[0].axis === 'x' && Math.abs(r.cuts[0].pos_mm - 1010) < 1,
         'برش عمودی در انتهای قطعهٔ اول', JSON.stringify(r.cuts[0]));
  assert(executable(layout.placements, r.cuts, SHEET) === null, 'و اجراشدنی است');
}

console.log('چیدمان دومرحله‌ای');
{
  // یک نوار عمودی، که خودش افقی به دو قطعه تقسیم می‌شود
  const layout = { placements: [
    pl('a', 10, 10, 1000, 1000), pl('b', 10, 1014, 1000, 1066),
    pl('c', 1014, 10, 800, 2080)
  ] };
  const r = S.forLayout(layout, SHEET);
  assert(r.ok && r.cuts.length === 2, 'دو برش', JSON.stringify(r.cuts.map(c => c.axis)));
  assert(r.cuts[0].stage === 1 && r.cuts[1].stage === 2,
         'مرحله‌بندی درست است — اول سراسری، بعد داخل تکه',
         r.cuts.map(c => c.stage).join(','));
  assert(executable(layout.placements, r.cuts, SHEET) === null, 'و اجراشدنی است');
}

console.log('برش اول در راستای بلندتر است');
{
  // ورق ۲۸۰۰×۲۱۰۰ → پهن‌تر از بلند، پس برش اول باید عمودی باشد
  const layout = { placements: [
    pl('a', 10, 10, 1000, 1000), pl('b', 10, 1014, 1000, 1066),
    pl('c', 1014, 10, 800, 1000), pl('d', 1014, 1014, 800, 1066)
  ] };
  const r = S.forLayout(layout, SHEET);
  assert(r.ok, 'ترتیب پیدا می‌شود');
  assert(r.cuts[0].axis === 'x',
         'اپراتور اول ورق را در راستای بلند رِپ می‌کند تا تکه روی میز جا شود',
         r.cuts[0].axis);
  assert(executable(layout.placements, r.cuts, SHEET) === null, 'و اجراشدنی است');
}

console.log('چیدمان ناگیلوتینی: ترتیب جعل نمی‌شود');
{
  // **بادبادکی** (pinwheel): چهار قطعه دور یک مرکز با تقارن چرخشی. نمونهٔ
  // کلاسیک چیدمانی که هیچ برش سراسری‌ای آن را دو تکه نمی‌کند.
  //
  // نسخهٔ اول این تست یک چیدمان «پلکانی» داشت که در عمل **گیلوتینی از آب
  // درآمد** — یعنی شاخهٔ رد کردن هرگز اجرا نمی‌شد و تست الکی سبز بود.
  const layout = { placements: [
    pl('a', 10, 10, 1200, 600),
    pl('b', 1210, 10, 600, 1200),
    pl('c', 610, 1210, 1200, 600),
    pl('d', 10, 610, 600, 1200)
  ] };
  const r = S.forLayout(layout, SHEET);
  assert(!r.ok, 'چیدمان بادبادکی رد می‌شود، نه اینکه ترتیب جعلی بگیرد');
  assert(r.reason.indexOf('گیلوتین') !== -1 || r.reason.indexOf('پانل‌بر') !== -1,
         'و صریح می‌گوید با پانل‌بر بریده نمی‌شود', r.reason);
  assert(r.cuts.length === 0, 'هیچ برشی برنمی‌گرداند');
}

console.log('روی خروجی واقعی نستینگ — ۱۵۰ چیدمان تصادفی');
{
  let seed = 987654321;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let layouts = 0, notOk = 0, notExecutable = 0, firstBad = null;

  for (let t = 0; t < 150; t++) {
    const n = 3 + Math.floor(rnd() * 20);
    const parts = [];
    for (let i = 0; i < n; i++) {
      parts.push({ key: 'p' + i, name_fa: 'ق', count: 1 + Math.floor(rnd() * 3),
        cut_length_mm: 150 + Math.floor(rnd() * 1200),
        cut_width_mm: 100 + Math.floor(rnd() * 900),
        thickness_mm: 16, sheet_id: 's', grain: 'none',
        allow_rotation: rnd() > 0.4, edge: {}, groove: {},
        part_uid: 'u' + t + '_' + i, cabinet_id: 'c' });
    }
    const snap = { schema_version: 2, sheets: [SHEET],
      cabinets: [{ kalaxa_id: 'c', label_fa: 'x', params: {} }],
      parts_flat: parts, cutting: { kerf_mm: 4, trim_margin_mm: 10 }, stock_offcuts: [] };
    const nest = N.run(snap);
    if ((nest.errors || []).length) continue;

    (nest.by_sheet_type || []).forEach(g => (g.layouts || []).forEach(l => {
      layouts++;
      const r = S.forLayout(l, SHEET);
      if (!r.ok) { notOk++; if (!firstBad) firstBad = { t, reason: r.reason }; return; }
      const bad = executable(l.placements, r.cuts, SHEET);
      if (bad) { notExecutable++; if (!firstBad) firstBad = { t, bad }; }
    }));
  }

  assert(layouts > 100, 'چیدمان کافی آزموده شد', String(layouts));
  assert(notOk === 0,
         'موتور نستینگ ما واقعاً گیلوتینی است — برای هر چیدمان ترتیب پیدا شد',
         notOk + '/' + layouts + ' ' + JSON.stringify(firstBad));
  assert(notExecutable === 0,
         'و هر ترتیب در شبیه‌سازی اجرای واقعی درست کار می‌کند',
         notExecutable + '/' + layouts + ' ' + JSON.stringify(firstBad));
}

console.log('هر برش سراسری است، نه تکه‌ای');
{
  const layout = { placements: [
    pl('a', 10, 10, 1000, 1000), pl('b', 10, 1014, 1000, 1066),
    pl('c', 1014, 10, 800, 2080)
  ] };
  const r = S.forLayout(layout, SHEET);
  r.cuts.forEach(c => {
    assert(c.to_mm > c.from_mm, 'برش ' + c.n + ' طول دارد',
           c.from_mm + '→' + c.to_mm);
  });
  // برش مرحلهٔ ۱ باید کل ارتفاع ورق (منهای trim) را بگیرد
  const first = r.cuts.find(c => c.stage === 1);
  assert(Math.abs((first.to_mm - first.from_mm) - (SHEET.height_mm - 20)) < 1,
         'برش مرحلهٔ ۱ سراسریِ کل ورق است',
         (first.to_mm - first.from_mm) + ' vs ' + (SHEET.height_mm - 20));
}

console.log('دستور کار');
{
  const layout = { placements: [pl('a', 10, 10, 1000, 2080), pl('b', 1014, 10, 800, 2080)] };
  const html = S.tableHtml(S.forLayout(layout, SHEET));
  assert(html.indexOf('<table') !== -1, 'جدول دستور کار ساخته می‌شود');
  assert(html.indexOf('عمودی') !== -1, 'جهت برش به فارسی');
  assert(html.indexOf('مرحله') !== -1, 'مرحله‌بندی توضیح داده می‌شود');

  const bad = S.tableHtml({ ok: false, cuts: [], reason: 'با پانل‌بر بریده نمی‌شود' });
  assert(bad.indexOf('msg err') !== -1, 'چیدمان ناگیلوتینی هشدار قرمز می‌گیرد');
}

console.log('حالت‌های خالی');
{
  assert(S.forLayout({ placements: [] }, SHEET).ok, 'ورق خالی خطا نیست');
  assert(S.forLayout({ placements: [pl('a', 10, 10, 100, 100)] }, SHEET).cuts.length === 0,
         'یک قطعه برش تقسیمی لازم ندارد');
  assert(S.forLayout(null, SHEET).ok, 'null نمی‌شکند');
}

console.log('خطوط برش روی خودِ نقشه');
{
  // جدول به‌تنهایی کافی نیست: اپراتور کنار دستگاه نمی‌تواند عدد جدول را با
  // تصویر تطبیق بدهد. خط باید روی همان نقشه‌ای باشد که جلویش است.
  const M = require(path.join(UI, 'kalaxa-cutmap-svg.js'));
  const layout = { sheet_index: 1, utilization_pct: 50, placements: [
    pl('a', 10, 10, 1000, 1000), pl('b', 10, 1014, 1000, 1066),
    pl('c', 1014, 10, 800, 2080)
  ], offcuts: [] };
  const nest = { by_sheet_type: [{ sheet_id: 's', layouts: [layout] }] };

  const withCuts = M.renderAll(nest, [SHEET], { cuts_for: (l, sh) => S.forLayout(l, sh) });
  const plain = M.renderAll(nest, [SHEET], {});

  assert(withCuts[0].svg.indexOf('id="cuts') !== -1, 'گروه خطوط برش در SVG هست');
  assert(plain[0].svg.indexOf('id="cuts') === -1,
         'و بدون cuts_for کشیده نمی‌شود — ماژول نقشه به ماژول برش وابسته نیست');

  // تعداد خط‌ها باید **دقیقاً** با جدول یکی باشد، وگرنه اپراتور شمارهٔ ۳ را
  // روی نقشه پیدا نمی‌کند.
  const seq = S.forLayout(layout, SHEET);
  const circles = (withCuts[0].svg.match(/<circle[^>]*r="9"/g) || []).length;
  assert(circles === seq.cuts.length,
         'شمارهٔ هر برش روی نقشه هست — به تعداد سطرهای جدول',
         circles + ' vs ' + seq.cuts.length);

  // مرحلهٔ ۱ باید پررنگ‌تر باشد: همان برشی که ورق کامل را تکه می‌کند
  assert(withCuts[0].svg.indexOf('stroke-dasharray="10,5"') !== -1,
         'برش مرحلهٔ ۱ پررنگ‌تر کشیده می‌شود');
}

console.log('چیدمان اجرانشدنی خط جعلی نمی‌کشد');
{
  const M = require(path.join(UI, 'kalaxa-cutmap-svg.js'));
  const pin = { sheet_index: 1, utilization_pct: 40, placements: [
    pl('a', 10, 10, 1200, 600), pl('b', 1210, 10, 600, 1200),
    pl('c', 610, 1210, 1200, 600), pl('d', 10, 610, 600, 1200)
  ], offcuts: [] };
  const nest = { by_sheet_type: [{ sheet_id: 's', layouts: [pin] }] };
  const svg = M.renderAll(nest, [SHEET], { cuts_for: (l, sh) => S.forLayout(l, sh) })[0].svg;
  assert(svg.indexOf('id="cuts') === -1,
         'روی چیدمان بادبادکی هیچ خطی کشیده نمی‌شود — خط جعلی بدتر از نبودنش است');
}

console.log('\n' + passed + ' گذشت، ' + failed + ' افتاد');
process.exit(failed ? 1 : 0);
