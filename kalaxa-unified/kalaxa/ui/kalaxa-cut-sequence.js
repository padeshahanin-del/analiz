/**
 * Kalaxa Cut Sequence — ترتیب برش گیلوتینی
 *
 * کاربر خواست برش‌خور مثل کات‌مستر و اپتیمایز کار کند، و مهم‌ترین چیزش را هم
 * گفت: **برش گیلوتینی (سراسری)**.
 *
 * موتور نستینگ ما از قبل گیلوتینی است — با ۲۰۰ چیدمان تصادفی سنجیده شد و
 * هیچ‌کدام تخطی نداشت. شکاف جای دیگری بود: نقشه می‌گوید هر قطعه **کجاست**،
 * ولی نمی‌گوید **به چه ترتیبی** ببُری. اپراتور پانل‌بر با «کجا» کار نمی‌کند؛
 * او یک برش سراسری می‌زند، ورق دو تکه می‌شود، بعد هر تکه را جدا می‌بَرد.
 *
 * این ماژول همان درخت برش را از روی چیدمان بیرون می‌کشد و به **دستور کار
 * مرتب** تبدیل می‌کند: «برش ۱: عرضی در ۷۲۴ میلی‌متر» و بعد زیرشاخه‌هایش.
 *
 * چیزی که عمداً نمی‌گوید: اگر چیدمانی گیلوتینی نباشد، ترتیب جعل نمی‌کند.
 * `ok: false` برمی‌گرداند تا نقشه بگوید «این چیدمان با پانل‌بر بریده نمی‌شود»
 * — دستور کارِ نشدنی از نبودِ دستور کار بدتر است.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KalaxaCutSequence = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var EPS = 0.01;

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }

  function rectOf(p) {
    return { x: num(p.x_mm), y: num(p.y_mm), w: num(p.w_mm), h: num(p.h_mm), ref: p };
  }

  /**
   * درخت برش را می‌سازد.
   *
   * در هر مرحله دنبال خطی می‌گردد که **از داخل هیچ قطعه‌ای نگذرد** و مجموعه
   * را دو تکه کند. برش سراسری یعنی همین: خط از این لبه تا آن لبه.
   *
   * ترجیح با برشی است که **کمترین تعداد تکه** را جدا کند؟ نه — با برشی که
   * زودتر پیدا شود در راستای بلندتر. دلیل عملی: اپراتور اول ورق را در راستای
   * بلند رِپ می‌کند تا تکه‌ها روی میز جا شوند. ترتیبِ نظری بهینه به‌درد
   * نمی‌خورد اگر تکه روی میز جا نشود.
   */
  function buildTree(rects, region, depth) {
    if (rects.length <= 1) {
      return { leaf: true, rects: rects, region: region };
    }
    if (depth > 64) return null;   // مهار بازگشت روی داده‌ی خراب

    var attempt = function (axis) {
      var coords = rects.map(function (r) {
        return axis === 'x' ? r.x + r.w : r.y + r.h;
      }).sort(function (a, b) { return a - b; });

      for (var i = 0; i < coords.length; i++) {
        var c = coords[i];
        var lo = [], hi = [];
        var clean = true;
        for (var j = 0; j < rects.length; j++) {
          var r = rects[j];
          var a = axis === 'x' ? r.x : r.y;
          var b = a + (axis === 'x' ? r.w : r.h);
          if (b <= c + EPS) lo.push(r);
          else if (a >= c - EPS) hi.push(r);
          else { clean = false; break; }
        }
        if (!clean || !lo.length || !hi.length) continue;

        var loRegion, hiRegion;
        if (axis === 'x') {
          loRegion = { x: region.x, y: region.y, w: c - region.x, h: region.h };
          hiRegion = { x: c, y: region.y, w: region.x + region.w - c, h: region.h };
        } else {
          loRegion = { x: region.x, y: region.y, w: region.w, h: c - region.y };
          hiRegion = { x: region.x, y: c, w: region.w, h: region.y + region.h - c };
        }
        var l = buildTree(lo, loRegion, depth + 1);
        var h2 = buildTree(hi, hiRegion, depth + 1);
        if (l && h2) {
          return { leaf: false, axis: axis, pos: c, region: region, lo: l, hi: h2 };
        }
      }
      return null;
    };

    // راستای بلندترِ ناحیه اول امتحان می‌شود — همان کاری که اپراتور می‌کند.
    var first = region.w >= region.h ? 'x' : 'y';
    return attempt(first) || attempt(first === 'x' ? 'y' : 'x');
  }

  /** درخت → فهرست مرتب برش‌ها (سطح‌به‌سطح: اول برش‌های سراسری) */
  function flatten(tree) {
    var out = [];
    var queue = [{ node: tree, stage: 1 }];
    while (queue.length) {
      var it = queue.shift();
      var n = it.node;
      if (!n || n.leaf) continue;
      out.push({
        axis: n.axis,
        pos_mm: Math.round(n.pos * 10) / 10,
        from_mm: Math.round((n.axis === 'x' ? n.region.y : n.region.x) * 10) / 10,
        to_mm: Math.round((n.axis === 'x' ? n.region.y + n.region.h
                                          : n.region.x + n.region.w) * 10) / 10,
        stage: it.stage
      });
      queue.push({ node: n.lo, stage: it.stage + 1 });
      queue.push({ node: n.hi, stage: it.stage + 1 });
    }
    out.forEach(function (c, i) { c.n = i + 1; });
    return out;
  }

  /**
   * @param {object} layout - یک چیدمان از خروجی نستینگ ({placements})
   * @param {object} sheet - ورق ({width_mm, height_mm, trim_margin_mm})
   * @returns {{ok:boolean, cuts:Array, reason:string}}
   */
  function forLayout(layout, sheet) {
    var ps = ((layout && layout.placements) || []).map(rectOf);
    if (!ps.length) return { ok: true, cuts: [], reason: '' };

    var trim = num(sheet && sheet.trim_margin_mm);
    var region = {
      x: trim, y: trim,
      w: num(sheet && sheet.width_mm) - 2 * trim,
      h: num(sheet && sheet.height_mm) - 2 * trim
    };

    var tree = buildTree(ps, region, 0);
    if (!tree) {
      // ترتیب جعل نمی‌کنیم. دستور کارِ نشدنی از نبودش بدتر است.
      return { ok: false, cuts: [],
               reason: 'این چیدمان با برش سراسری (گیلوتینی) بریده نمی‌شود — ' +
                       'با پانل‌بر قابل اجرا نیست' };
    }
    return { ok: true, cuts: flatten(tree), reason: '' };
  }

  var AXIS_FA = { x: 'عمودی', y: 'افقی' };

  function fa(n) {
    return String(n).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
  }

  /** دستور کار برای اپراتور — همان چیزی که کنار دستگاه می‌خوانند. */
  function tableHtml(res) {
    if (!res.ok) return '<div class="msg err">' + res.reason + '</div>';
    if (!res.cuts.length) return '';
    return '<table><tr><th>#</th><th>مرحله</th><th>جهت</th><th>موقعیت (mm)</th>' +
      '<th>از</th><th>تا</th></tr>' +
      res.cuts.map(function (c) {
        return '<tr><td class="num">' + fa(c.n) + '</td>' +
          '<td class="num">' + fa(c.stage) + '</td>' +
          '<td>' + (AXIS_FA[c.axis] || c.axis) + '</td>' +
          '<td class="num">' + fa(c.pos_mm) + '</td>' +
          '<td class="num">' + fa(c.from_mm) + '</td>' +
          '<td class="num">' + fa(c.to_mm) + '</td></tr>';
      }).join('') + '</table>' +
      '<div class="meta">مرحلهٔ ۱ برش‌های سراسری روی ورق کامل است؛ مرحلهٔ ۲ روی ' +
      'تکه‌هایی که از مرحلهٔ ۱ درآمده‌اند، و همین‌طور. ترتیب را از بالا به پایین ' +
      'اجرا کنید.</div>';
  }

  return { VERSION: VERSION, forLayout: forLayout, tableHtml: tableHtml,
           _internal: { buildTree: buildTree, flatten: flatten } };
}));
