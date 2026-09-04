/**
 * Kalaxa Exploded — نقشهٔ انفجاری کابینت (SVG)
 *
 * کاربر خواست «نقشه‌های انفجاری». چیزی که برای کارگاه مفید است این است: قطعات
 * از هم باز شوند تا معلوم شود چه چیزی کجا می‌نشیند — نه یک تصویر قشنگ.
 *
 * چرا SVG و نه مدل سه‌بعدی: نقشه باید **چاپ‌شدنی** باشد و روی میز کارگاه برود.
 * ضمناً همان مسیر خروجی نقشهٔ برش و برچسب‌ها را می‌رود که از قبل کار می‌کند.
 *
 * ورودی همان جعبه‌هایی است که اسکنر/سازنده می‌دهد ({x,y,z,dx,dy,dz}) — پس هم
 * کابینت ساختهٔ کالاکسا و هم کابینت ساختهٔ خود کاربر نقشهٔ انفجاری می‌گیرند.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KalaxaExploded = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  var DEFAULTS = {
    // ضریب باز شدن: هر قطعه به نسبت فاصله‌اش از مرکز بیرون رانده می‌شود.
    spread: 0.55,
    // حداقل فاصلهٔ باز شدن (mm) — قطعاتی که تقریباً روی مرکزند وگرنه روی هم
    // می‌مانند و نقشه بی‌فایده می‌شود.
    min_offset_mm: 40,
    scale: 0.28,           // mm → px
    margin_px: 48,
    label_size_px: 9,
    label_radius_px: 8,
    label_push_mm: 55,     // فاصلهٔ شماره از لبهٔ قطعه، در امتداد جهت باز شدن
    iso_deg: 30,           // زاویهٔ استاندارد نقشه‌کشی ایزومتریک
    // خط‌چینِ ردیابی از جای مونتاژ تا جای بازشده. این همان چیزی است که یک
    // تصویر را از «کپهٔ قطعه» به **نقشهٔ انفجاری** تبدیل می‌کند: چشم می‌بیند هر
    // قطعه از کجا بیرون آمده. بدون آن، نقشه فقط شلوغ است.
    trace: true,
    ghost: true,           // شبح محوِ کابینتِ مونتاژشده، برای مقیاس و جهت
    color_by_role: true
  };

  // رنگ بر پایهٔ نقش. یکدست‌بودن همه‌چیز باعث می‌شد قطعات از هم تفکیک نشوند و
  // تصویر بی‌جان به‌نظر برسد. رنگ‌ها عمداً کم‌اشباع‌اند تا شبیه نقشه بماند، نه
  // اسباب‌بازی.
  var ROLE_COLORS = {
    side: '#c8a97e', top_bottom: '#d9be93', bottom: '#d9be93',
    shelf: '#e3cfa8', back: '#a9b5a0', rail_top: '#bfa478',
    door: '#8fa8bd', drawer_front: '#7f9bb5',
    drawer_side: '#b9c4cd', drawer_back: '#b9c4cd', drawer_bottom: '#cdd5db',
    hardware: '#9a9a9a', unknown: '#cfcabd'
  };
  var NEUTRAL = '#d5cfc2';

  function colorFor(box, cfg) {
    if (!cfg.color_by_role) return NEUTRAL;
    return ROLE_COLORS[String(box && box.role)] || NEUTRAL;
  }

  /** روشن/تیره کردن یک رنگ hex — برای سایهٔ سه وجه از یک رنگ پایه. */
  function shade(hex, f) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    var ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (c) {
      var v = f >= 0 ? c + (255 - c) * f : c * (1 + f);
      return Math.max(0, Math.min(255, Math.round(v)));
    });
    return '#' + ch.map(function (c) {
      return (c < 16 ? '0' : '') + c.toString(16);
    }).join('');
  }

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }

  function cfgOf(options) {
    var c = {};
    Object.keys(DEFAULTS).forEach(function (k) { c[k] = DEFAULTS[k]; });
    Object.keys(options || {}).forEach(function (k) {
      if (options[k] != null) c[k] = options[k];
    });
    return c;
  }

  function boundsOf(boxes) {
    var r = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
    boxes.forEach(function (b) {
      r.x0 = Math.min(r.x0, num(b.x)); r.y0 = Math.min(r.y0, num(b.y)); r.z0 = Math.min(r.z0, num(b.z));
      r.x1 = Math.max(r.x1, num(b.x) + num(b.dx));
      r.y1 = Math.max(r.y1, num(b.y) + num(b.dy));
      r.z1 = Math.max(r.z1, num(b.z) + num(b.dz));
    });
    return r;
  }

  /**
   * جابه‌جایی انفجاری هر قطعه.
   *
   * جهت را از **موقعیت خودِ قطعه نسبت به مرکز** می‌گیریم، نه از نقشش: دیوارهٔ چپ
   * به چپ می‌رود، درب به جلو، سقف به بالا — بدون اینکه لازم باشد نقش درست
   * تشخیص داده شده باشد. یعنی نقشهٔ انفجاری حتی وقتی طبقه‌بندی مطمئن نیست هم
   * درست درمی‌آید.
   *
   * فقط روی **غالب‌ترین محور** جابه‌جا می‌کنیم. اگر هر سه محور را هم‌زمان باز
   * کنیم قطعات مورب می‌روند و نقشه به‌هم می‌ریزد.
   */
  function offsetFor(b, bounds, cfg) {
    var cx = (bounds.x0 + bounds.x1) / 2;
    var cy = (bounds.y0 + bounds.y1) / 2;
    var cz = (bounds.z0 + bounds.z1) / 2;
    var mx = num(b.x) + num(b.dx) / 2 - cx;
    var my = num(b.y) + num(b.dy) / 2 - cy;
    var mz = num(b.z) + num(b.dz) / 2 - cz;

    var ax = Math.abs(mx), ay = Math.abs(my), az = Math.abs(mz);
    var pick = (ax >= ay && ax >= az) ? 'x' : (ay >= az ? 'y' : 'z');
    var v = pick === 'x' ? mx : (pick === 'y' ? my : mz);
    var sign = v < 0 ? -1 : 1;
    var dist = Math.max(Math.abs(v) * cfg.spread, cfg.min_offset_mm);

    return { x: pick === 'x' ? sign * dist : 0,
             y: pick === 'y' ? sign * dist : 0,
             z: pick === 'z' ? sign * dist : 0,
             axis: pick };
  }

  /**
   * تصویر ایزومتریک یک نقطهٔ سه‌بعدی روی صفحه.
   *
   * ناظر از (۱، −۱، ۱) نگاه می‌کند: از **جلو**، راست و بالا. علامت منفیِ y
   * عمدی است — در قرارداد کالاکسا جلوی کابینت y=۰ است.
   *
   * نسخهٔ اول (x−y) و (x+y) داشت، یعنی ناظر از (۱،۱،۱) — از **پشت** کابینت.
   * ولی `faceGroup` وجهِ y0 (جلو) را می‌کشید. یعنی تصویر وجهی را نشان می‌داد
   * که از آن زاویه اصلاً دیده نمی‌شود. چشم می‌فهمید چیزی غلط است حتی اگر
   * نتواند بگوید چه — و همین «جذاب نبودن» را می‌ساخت.
   */
  function project(x, y, z, cfg) {
    var a = cfg.iso_deg * Math.PI / 180;
    return { px: (x + y) * Math.cos(a), py: (x - y) * Math.sin(a) - z };
  }

  /** فاصله تا ناظر — بزرگ‌تر یعنی نزدیک‌تر. با همان بردار دیدِ project. */
  function depthToViewer(x, y, z) { return x - y + z; }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function corners(p) {
    return [[p.x, p.y, p.z], [p.x + p.dx, p.y, p.z], [p.x, p.y + p.dy, p.z],
            [p.x, p.y, p.z + p.dz], [p.x + p.dx, p.y + p.dy, p.z],
            [p.x + p.dx, p.y, p.z + p.dz], [p.x, p.y + p.dy, p.z + p.dz],
            [p.x + p.dx, p.y + p.dy, p.z + p.dz]];
  }

  // سه وجه دیدنیِ یک جعبه در نمای ایزومتریک، با سه سایهٔ متفاوت تا لبه‌ها بدون
  // خط اضافه از هم جدا دیده شوند.
  function faceGroup(p, n, toPx, cfg) {
    var x = p.x, y = p.y, z = p.z, dx = p.dx, dy = p.dy, dz = p.dz;
    var base = colorFor(p.box, cfg);
    var poly = function (pts3, fill) {
      var d = pts3.map(function (c) {
        var q = toPx(c[0], c[1], c[2]);
        return q.px.toFixed(1) + ',' + q.py.toFixed(1);
      }).join(' ');
      return '<polygon points="' + d + '" fill="' + fill +
             '" stroke="' + shade(base, -0.55) +
             '" stroke-width="0.6" stroke-linejoin="round"/>';
    };

    // سه وجه از **یک** رنگ پایه، با سه روشنایی — انگار نور از بالا می‌تابد.
    // سایهٔ ثابتِ خاکستری (نسخهٔ قبل) رنگ قطعه را می‌کشت و همه‌چیز یک‌شکل
    // می‌شد.
    var top = poly([[x, y, z + dz], [x + dx, y, z + dz],
                    [x + dx, y + dy, z + dz], [x, y + dy, z + dz]], shade(base, 0.28));
    var front = poly([[x, y, z], [x + dx, y, z],
                      [x + dx, y, z + dz], [x, y, z + dz]], base);
    var side = poly([[x + dx, y, z], [x + dx, y + dy, z],
                     [x + dx, y + dy, z + dz], [x + dx, y, z + dz]], shade(base, -0.22));

    return '<g><title>' + esc(p.box.name || p.box.role || '') + '</title>' +
           top + front + side + '</g>';
  }

  // خطِ ردیابی: از مرکز قطعه در جای **مونتاژ** تا مرکزش در جای **بازشده**.
  function traceLine(p, toPx) {
    var a = toPx(num(p.box.x) + p.dx / 2, num(p.box.y) + p.dy / 2, num(p.box.z) + p.dz / 2);
    var b = toPx(p.x + p.dx / 2, p.y + p.dy / 2, p.z + p.dz / 2);
    if (Math.abs(a.px - b.px) < 0.5 && Math.abs(a.py - b.py) < 0.5) return '';
    return '<path d="M' + a.px.toFixed(1) + ' ' + a.py.toFixed(1) +
      ' L' + b.px.toFixed(1) + ' ' + b.py.toFixed(1) +
      '" stroke="#8b8577" stroke-width="0.6" stroke-dasharray="4,3" fill="none"/>';
  }

  // شبح کابینتِ مونتاژشده — مقیاس و جهت را نشان می‌دهد بدون اینکه جلوی
  // قطعات را بگیرد.
  function ghostBox(bounds, toPx) {
    var x = bounds.x0, y = bounds.y0, z = bounds.z0;
    var dx = bounds.x1 - x, dy = bounds.y1 - y, dz = bounds.z1 - z;
    var c = [[x, y, z], [x + dx, y, z], [x + dx, y + dy, z], [x, y + dy, z],
             [x, y, z + dz], [x + dx, y, z + dz], [x + dx, y + dy, z + dz], [x, y + dy, z + dz]];
    var e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4],
             [0, 4], [1, 5], [2, 6], [3, 7]];
    return '<g stroke="#c9c4b8" stroke-width="0.6" stroke-dasharray="2,4" fill="none">' +
      e.map(function (pair) {
        var a = toPx(c[pair[0]][0], c[pair[0]][1], c[pair[0]][2]);
        var b = toPx(c[pair[1]][0], c[pair[1]][1], c[pair[1]][2]);
        return '<path d="M' + a.px.toFixed(1) + ' ' + a.py.toFixed(1) +
               ' L' + b.px.toFixed(1) + ' ' + b.py.toFixed(1) + '"/>';
      }).join('') + '</g>';
  }

  // شماره بیرون از قطعه، در امتداد جهتِ باز شدن — روی خودِ قطعه هندسه را
  // می‌پوشاند و روی قطعات ریز اصلاً خوانا نبود.
  // جای شماره در فضای سه‌بعدی — **تنها منبع حقیقت**.
  //
  // اول دو جا حسابش می‌کردند (اینجا و محاسبهٔ کادر) با دو عدد متفاوت. تست
  // «همهٔ شماره‌ها داخل کادرند» الکی سبز بود چون حاشیه اختلاف را می‌پوشاند.
  // یک منبع یعنی واگرایی ممکن نیست، نه اینکه گیر بیفتد.
  function badgePoint(p, cfg) {
    var ax = p.off.axis;
    var push = cfg.label_push_mm;
    return [
      p.x + p.dx / 2 + (ax === 'x' ? Math.sign(p.off.x) * (p.dx / 2 + push) : 0),
      p.y + p.dy / 2 + (ax === 'y' ? Math.sign(p.off.y) * (p.dy / 2 + push) : 0),
      p.z + p.dz / 2 + (ax === 'z' ? Math.sign(p.off.z) * (p.dz / 2 + push) : 0)
    ];
  }

  function badge(p, n, toPx, cfg) {
    var cx = p.x + p.dx / 2, cy = p.y + p.dy / 2, cz = p.z + p.dz / 2;
    var bp = badgePoint(p, cfg);
    var c = toPx(cx, cy, cz);
    var t = toPx(bp[0], bp[1], bp[2]);
    return '<g><path d="M' + c.px.toFixed(1) + ' ' + c.py.toFixed(1) +
      ' L' + t.px.toFixed(1) + ' ' + t.py.toFixed(1) +
      '" stroke="#666" stroke-width="0.5" fill="none"/>' +
      '<circle cx="' + t.px.toFixed(1) + '" cy="' + t.py.toFixed(1) +
      '" r="' + cfg.label_radius_px + '" fill="#fff" stroke="#444" stroke-width="0.8"/>' +
      '<text x="' + t.px.toFixed(1) + '" y="' + (t.py + 3.2).toFixed(1) +
      '" font-size="' + cfg.label_size_px + '" text-anchor="middle" fill="#222">' +
      n + '</text></g>';
  }

  /**
   * @param {Array} boxes - [{x,y,z,dx,dy,dz,name,role,role_label_fa}]
   * @param {object} [options]
   * @returns {{svg:string, parts:Array, warnings:Array<string>}}
   */
  function render(boxes, options) {
    var cfg = cfgOf(options);
    var list = (boxes || []).filter(function (b) {
      return num(b.dx) > 0 && num(b.dy) > 0 && num(b.dz) > 0;
    });
    if (!list.length) {
      return { svg: '', parts: [], warnings: ['قطعه‌ای برای نقشهٔ انفجاری نیست'] };
    }

    var bounds = boundsOf(list);
    var placed = list.map(function (b, i) {
      var o = offsetFor(b, bounds, cfg);
      return { i: i, box: b, off: o,
               x: num(b.x) + o.x, y: num(b.y) + o.y, z: num(b.z) + o.z,
               dx: num(b.dx), dy: num(b.dy), dz: num(b.dz) };
    });

    // ترتیب رسم: **دورترین اول** (الگوریتم نقاش).
    //
    // معیار عمق **همان بردار دیدِ project** است. جدا نگه‌داشتنشان یعنی روزی
    // یکی عوض شود و دیگری نه — و تصویر بی‌صدا خراب شود.
    //
    // مرکز قطعه ملاک است نه گوشهٔ کمینه‌اش: تختهٔ بلند و تختهٔ کوتاه با یک گوشه
    // عمق یکسان ندارند.
    var depthOf = function (p) {
      return depthToViewer(p.x + p.dx / 2, p.y + p.dy / 2, p.z + p.dz / 2);
    };
    placed.sort(function (p, q) { return depthOf(p) - depthOf(q); });

    var pts = [];
    placed.forEach(function (p) {
      corners(p).forEach(function (c) { pts.push(project(c[0], c[1], c[2], cfg)); });
      // نقطهٔ شماره هم باید در کادر جا شود، وگرنه بیرون از تصویر می‌افتد و
      // نیمی از شماره‌ها بریده دیده می‌شوند. **همان** تابعی که شماره را
      // می‌کشد جایش را می‌دهد — نه یک عدد موازی.
      var bp = badgePoint(p, cfg);
      pts.push(project(bp[0], bp[1], bp[2], cfg));
    });
    // شبحِ کابینت مونتاژشده هم داخل کادر است.
    [[bounds.x0, bounds.y0, bounds.z0], [bounds.x1, bounds.y1, bounds.z1],
     [bounds.x1, bounds.y0, bounds.z0], [bounds.x0, bounds.y1, bounds.z1]]
      .forEach(function (c) { pts.push(project(c[0], c[1], c[2], cfg)); });
    var minX = Math.min.apply(null, pts.map(function (q) { return q.px; }));
    var maxX = Math.max.apply(null, pts.map(function (q) { return q.px; }));
    var minY = Math.min.apply(null, pts.map(function (q) { return q.py; }));
    var maxY = Math.max.apply(null, pts.map(function (q) { return q.py; }));

    // حاشیه هرگز نباید کمتر از شعاع شماره باشد: نقطهٔ مرکز شماره داخل کادر
    // حساب شده، ولی خودِ دایره از آن بیرون می‌زند.
    var s = cfg.scale;
    var m = Math.max(cfg.margin_px, cfg.label_radius_px + 4);
    var w = Math.round((maxX - minX) * s + 2 * m);
    var h = Math.round((maxY - minY) * s + 2 * m);
    var toPx = function (x, y, z) {
      var q = project(x, y, z, cfg);
      return { px: (q.px - minX) * s + m, py: (q.py - minY) * s + m };
    };

    // لایه‌بندی: شبح و خط‌چین **زیر** قطعات، شماره‌ها **روی** همه. اگر خط
    // ردیابی روی قطعه بیفتد، تصویر کثیف می‌شود؛ اگر شماره زیر قطعه برود،
    // خوانده نمی‌شود.
    var under = (cfg.ghost ? ghostBox(bounds, toPx) : '') +
      (cfg.trace ? placed.map(function (p) { return traceLine(p, toPx); }).join('') : '');
    var solids = placed.map(function (p) { return faceGroup(p, 0, toPx, cfg); }).join('');
    var over = placed.map(function (p, order) {
      return badge(p, order + 1, toPx, cfg);
    }).join('');

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h +
      '" viewBox="0 0 ' + w + ' ' + h + '" font-family="Tahoma, sans-serif">' +
      '<rect width="' + w + '" height="' + h + '" fill="#fbfaf7"/>' +
      under + solids + over + '</svg>';

    return {
      svg: svg,
      parts: placed.map(function (p, i) {
        return { n: i + 1, name: p.box.name || '', role: p.box.role || '',
                 role_label_fa: p.box.role_label_fa || '', axis: p.off.axis };
      }),
      warnings: []
    };
  }

  return { VERSION: VERSION, DEFAULTS: DEFAULTS, render: render,
           offsetFor: offsetFor, boundsOf: boundsOf,
           ROLE_COLORS: ROLE_COLORS, colorFor: colorFor, shade: shade,
           project: project, depthToViewer: depthToViewer, badgePoint: badgePoint };
}));
