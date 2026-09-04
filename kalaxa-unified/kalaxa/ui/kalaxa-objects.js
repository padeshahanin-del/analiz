/**
 * Kalaxa Objects — لوازم و آبجکت‌های آشپزخانه
 *
 * کاربر «قابلیت اضافه کردن آبجکت‌ها … که واقعی‌تر باشه» خواست.
 *
 * سه چیز که این ماژول باید درست بگیرد، و هر سه در کارگاه پول‌اند:
 *
 * ۱. **لوازم قطعهٔ بریدنی نیستند.** خریده می‌شوند. اگر وارد برش‌خور شوند،
 *    ورق برای سینک سفارش می‌رود. ولی باید در **فهرست کالا** باشند، وگرنه
 *    فاکتور ناقص است.
 * ۲. **بریدگی صفحه.** سینک و اجاق روی صفحهٔ کار سوراخ می‌خواهند، و اندازهٔ
 *    سوراخ **کوچک‌تر** از خودِ دستگاه است (لبه‌اش روی صفحه می‌نشیند). اگر
 *    این گفته نشود، کارگاه اندازهٔ بیرونی را می‌بُرد و دستگاه توی سوراخ
 *    می‌افتد — ضایعاتِ یک صفحهٔ کامل.
 * ۳. **جا شدن در کابینت.** فرِ ۶۰ در کابینت ۵۰ نمی‌رود. سکوت این‌جا یعنی
 *    مشتری موقع نصب بفهمد.
 *
 * دربارهٔ «واقعی‌تر»: هندسه‌ای که این‌جا ساخته می‌شود جعبهٔ ساده با ابعاد
 * **درست** است. مدل فتورئال لازمهٔ فایل کامپوننت (.skp) دارد که نمی‌شود
 * همراه پلاگین فرستاد. راهِ درستش این است که کاربر کامپوننت خودش را به همان
 * id وصل کند — ابعاد و بریدگی دست‌نخورده می‌ماند و فقط ظاهر عوض می‌شود.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KalaxaObjects = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }

  function catalog() {
    try {
      if (typeof KalaxaCatalog !== 'undefined' && KalaxaCatalog.isLoaded()) {
        return KalaxaCatalog.get('objects');
      }
    } catch (e) { /* پایین می‌افتد */ }
    if (typeof require === 'function') {
      try { return require('./kalaxa-catalog.js').get('objects'); }
      catch (e) { /* تهی */ }
    }
    return { groups: {}, objects: {} };
  }

  /** فهرست آبجکت‌ها + آنچه کارگاه اضافه کرده. */
  function all(cfg) {
    var base = catalog().objects || {};
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = Object.assign({}, base[k]); });
    ((cfg || {}).custom_objects || []).forEach(function (o) {
      if (!o || !o.id) return;
      out[o.id] = Object.assign({}, out[o.id] || {}, o);
    });
    return out;
  }

  function grouped(cfg) {
    var groups = catalog().groups || {};
    var objs = all(cfg);
    var byGroup = {};
    Object.keys(objs).forEach(function (id) {
      var g = objs[id].group || 'other';
      (byGroup[g] = byGroup[g] || []).push(Object.assign({ id: id }, objs[id]));
    });
    return Object.keys(byGroup).sort(function (a, b) {
      return ((groups[a] || {}).order || 99) - ((groups[b] || {}).order || 99);
    }).map(function (g) {
      return { id: g, label_fa: (groups[g] || {}).label_fa || 'سایر',
               objects: byGroup[g] };
    });
  }

  /**
   * ردپای یک یونیت روی پلان، در فضای جهانی (میلی‌متر).
   *
   * چرخش فقط برای زوایای اصلی (۰/۹۰/۱۸۰/۲۷۰) دقیق است. زاویهٔ دلخواه —
   * مثل کابینتی که مورب گذاشته شده — با جعبهٔ محیطی تقریب زده می‌شود و
   * **صریح گزارش می‌شود**، چون تطبیقِ تقریبی می‌تواند سینک را به کابینت
   * همسایه نسبت دهد و هشدارِ جا شدن را روی عدد غلط بدهد.
   */
  function footprint(originCm, rotDeg, wMm, dMm) {
    var ox = num((originCm || [])[0]) * 10;
    var oy = num((originCm || [])[1]) * 10;
    var r = ((num(rotDeg) % 360) + 360) % 360;
    var snapped = Math.round(r / 90) * 90 % 360;
    var approx = Math.abs(r - snapped) > 1;

    var w = wMm, d = dMm;
    if (snapped === 90 || snapped === 270) { w = dMm; d = wMm; }

    // چرخش حول مبدأ خودِ یونیت: گوشهٔ کمینه بسته به ربع عوض می‌شود.
    var x0 = ox, y0 = oy;
    if (snapped === 90) { x0 = ox - d; }
    else if (snapped === 180) { x0 = ox - w; y0 = oy - d; }
    else if (snapped === 270) { y0 = oy - w; }

    return { x0: x0, y0: y0, x1: x0 + w, y1: y0 + d, approx: approx };
  }

  function centre(f) { return { x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2 }; }

  function contains(f, pt) {
    return pt.x >= f.x0 - 1 && pt.x <= f.x1 + 1 &&
           pt.y >= f.y0 - 1 && pt.y <= f.y1 + 1;
  }

  /**
   * هر آبجکت را به کابینتی که زیرش است وصل می‌کند.
   *
   * بدون این، `cabinet_id` خالی می‌ماند و هشدار «فر ۶۰ در کابینت ۵۰ جا
   * نمی‌شود» هرگز فعال نمی‌شود — یعنی همان چیزی که برای آن ساخته شد.
   *
   * ملاک **مرکز** آبجکت است نه گوشه‌اش: سینکی که کمی از کابینت بیرون زده
   * باز هم متعلق به همان کابینت است.
   */
  function attach(objects, cabinets) {
    var warnings = [];
    var boxes = (cabinets || []).map(function (c) {
      var p = c.params || {};
      var t = c.world_transform || {};
      return {
        cab: c,
        f: footprint(t.origin_cm, t.rotation_z_deg,
                     num(p.cabinet_width) * 10, num(p.cabinet_depth) * 10)
      };
    }).filter(function (b) { return b.f.x1 > b.f.x0 && b.f.y1 > b.f.y0; });

    var out = (objects || []).map(function (o) {
      var copy = {};
      Object.keys(o).forEach(function (k) { copy[k] = o[k]; });
      if (copy.cabinet_id) return copy;   // اگر از قبل وصل است، دست نمی‌زنیم

      var t = o.world_transform || {};
      var of = footprint(t.origin_cm, t.rotation_z_deg, num(o.w_mm), num(o.d_mm));
      var c = centre(of);
      var hit = boxes.filter(function (b) { return contains(b.f, c); });

      if (hit.length === 1) {
        copy.cabinet_id = hit[0].cab.kalaxa_id;
        if (hit[0].f.approx || of.approx) {
          warnings.push('«' + (o.label_fa || o.object_id) + '» یا کابینتش با زاویهٔ ' +
            'غیرمعمول چرخیده — تطبیق تقریبی است؛ دستی بررسی کنید');
        }
      } else if (hit.length > 1) {
        // دو کابینت روی هم افتاده‌اند یا آبجکت روی مرز است. حدس‌زدن یعنی
        // هشدارِ جا شدن روی کابینت غلط بیفتد.
        warnings.push('«' + (o.label_fa || o.object_id) + '» روی مرز ' +
          hit.length + ' کابینت است — به کدام تعلق دارد؟ دستی مشخص کنید');
      }
      return copy;
    });

    return { objects: out, warnings: warnings };
  }

  /**
   * بررسی یک آبجکت روی یک کابینت.
   *
   * @param placed [{object_id, cabinet_id}]
   * @param cabinets فهرست کابینت‌های اسنپ‌شات
   * @returns {{items, cutouts, warnings}}
   */
  function plan(placed, cabinets, cfg) {
    var objs = all(cfg);
    var byId = {};
    (cabinets || []).forEach(function (c) { byId[c.kalaxa_id] = c; });

    var items = {};
    var cutouts = [];
    var warnings = [];

    (placed || []).forEach(function (p, i) {
      var spec = objs[p.object_id];
      if (!spec) {
        warnings.push('آبجکت «' + p.object_id + '» در کاتالوگ نیست');
        return;
      }

      // شمارش برای فهرست کالا
      if (!items[p.object_id]) {
        items[p.object_id] = { object_id: p.object_id, name_fa: spec.label_fa,
                               qty: 0, unit: spec.unit || 'عدد',
                               group_fa: (catalog().groups[spec.group] || {}).label_fa || '' };
      }
      items[p.object_id].qty += 1;

      var cab = byId[p.cabinet_id];
      if (cab) {
        // جا شدن در کابینت: عرضِ لازم در برابر عرضِ واقعی.
        var cabW = num(cab.params && cab.params.cabinet_width) * 10;
        var need = num(spec.min_cabinet_w);
        if (need > 0 && cabW > 0 && cabW < need) {
          warnings.push('«' + spec.label_fa + '» دست‌کم کابینت ' +
            Math.round(need / 10) + ' سانت می‌خواهد، ولی «' +
            (cab.label_fa || p.cabinet_id) + '» ' + Math.round(cabW / 10) +
            ' سانت است — جا نمی‌شود');
        }
      } else if (p.cabinet_id) {
        warnings.push('کابینت «' + p.cabinet_id + '» برای «' + spec.label_fa + '» پیدا نشد');
      }

      // بریدگی صفحهٔ کار — اندازهٔ سوراخ، نه اندازهٔ دستگاه.
      if (spec.cutout && spec.mount === 'counter_top') {
        cutouts.push({
          n: cutouts.length + 1,
          object_id: p.object_id,
          name_fa: spec.label_fa,
          cabinet_id: p.cabinet_id || null,
          w_mm: num(spec.cutout.w),
          d_mm: num(spec.cutout.d),
          radius_mm: num(spec.cutout.radius_mm),
          outer_w_mm: num(spec.w),
          outer_d_mm: num(spec.d)
        });
      }
    });

    return { items: Object.keys(items).map(function (k) { return items[k]; }),
             cutouts: cutouts, warnings: warnings };
  }

  function fa(n) {
    return String(n).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** برگهٔ بریدگی — همان چیزی که کنار صفحه‌بُر می‌رود. */
  function cutoutTableHtml(res) {
    if (!res.cutouts.length) return '';
    return '<table><tr><th>#</th><th>برای</th><th>بریدگی (mm)</th>' +
      '<th>شعاع گوشه</th><th>ابعاد بیرونی دستگاه</th></tr>' +
      res.cutouts.map(function (c) {
        return '<tr><td class="num">' + fa(c.n) + '</td>' +
          '<td>' + esc(c.name_fa) + '</td>' +
          '<td class="num">' + fa(c.w_mm) + '×' + fa(c.d_mm) + '</td>' +
          '<td class="num">' + (c.radius_mm ? fa(c.radius_mm) : '—') + '</td>' +
          '<td class="num meta">' + fa(c.outer_w_mm) + '×' + fa(c.outer_d_mm) + '</td></tr>';
      }).join('') + '</table>' +
      '<div class="meta">بریدگی عمداً <b>کوچک‌تر</b> از خودِ دستگاه است — لبهٔ ' +
      'دستگاه روی صفحه می‌نشیند. اگر اندازهٔ بیرونی بریده شود، دستگاه توی ' +
      'سوراخ می‌افتد و صفحه از بین می‌رود.</div>';
  }

  return { VERSION: VERSION, all: all, grouped: grouped, plan: plan,
           attach: attach, footprint: footprint,
           cutoutTableHtml: cutoutTableHtml };
}));
