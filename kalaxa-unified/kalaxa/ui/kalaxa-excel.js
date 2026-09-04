/**
 * Kalaxa Excel — ورودی و خروجی اکسل (CSV)
 *
 * کاربر خواست «ورودی و خروجی اکسل». چیزی که واقعاً لازم است: فهرست برش و
 * فهرست کالا در اکسل باز شود تا بشود به تأمین‌کننده داد، و قیمت/تعداد از
 * اکسل برگردد بدون اینکه دستی تایپ شود.
 *
 * چرا CSV و نه xlsx: xlsx یک فایل zip با چند XML است و ساختنش در مرورگرِ
 * بدون کتابخانه یعنی نوشتن یک zip encoder — کد زیاد برای چیزی که اکسل از
 * CSV هم می‌خواند. CSV اگر **درست** ساخته شود در اکسل بی‌عیب باز می‌شود.
 * «درست» یعنی سه چیز که معمولاً فراموش می‌شوند:
 *
 * ۱. **BOM**. بدون آن اکسل فارسی را «Ø§Ø³Ù…» نشان می‌دهد.
 * ۲. **رقم لاتین**. عدد فارسی («۷۲۰») در اکسل متن است نه عدد؛ جمع نمی‌شود
 *    و مرتب هم نمی‌شود. رقم فارسی فقط برای نمایش روی صفحه است.
 * ۳. **CRLF**. اکسل ویندوز با LF تنها گاهی سطرها را قاطی می‌کند.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KalaxaExcel = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var BOM = '﻿';

  var DEFAULTS = {
    delimiter: ',',
    // اکسل جداکنندهٔ فهرست را از تنظیمات ویندوز می‌خواند، نه از فایل. روی
    // ویندوز فارسی این گاهی «؛» است و آن‌وقت کل سطر در یک خانه می‌افتد.
    // خط `sep=` این را قطعی می‌کند. واردکنندهٔ خودمان از رویش می‌پرد.
    excel_hint: true
  };

  function cfgOf(o) {
    var c = {};
    Object.keys(DEFAULTS).forEach(function (k) { c[k] = DEFAULTS[k]; });
    Object.keys(o || {}).forEach(function (k) { if (o[k] != null) c[k] = o[k]; });
    return c;
  }

  // ارقام فارسی/عربی → لاتین. عددی که از اکسل برمی‌گردد ممکن است فارسی تایپ
  // شده باشد؛ اگر همان‌طور parse شود NaN می‌دهد و ردیف بی‌صدا صفر می‌شود.
  var FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  var AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  function toLatinDigits(s) {
    return String(s == null ? '' : s).replace(/[۰-۹٠-٩]/g, function (d) {
      var i = FA_DIGITS.indexOf(d);
      return String(i !== -1 ? i : AR_DIGITS.indexOf(d));
    });
  }

  function num(v) {
    var s = toLatinDigits(v).replace(/[,\s٫]/g, function (m) { return m === '٫' ? '.' : ''; });
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  /** یک خانه را برای CSV آماده می‌کند (RFC 4180). */
  function cell(v, delim) {
    var s = v == null ? '' : String(v);
    // عدد را با رقم لاتین می‌نویسیم تا اکسل عدد ببیند، نه متن.
    s = toLatinDigits(s);
    if (s.indexOf('"') !== -1 || s.indexOf(delim) !== -1 ||
        s.indexOf('\n') !== -1 || s.indexOf('\r') !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /**
   * ساخت CSV از سرستون‌ها و سطرها.
   * @param {Array<string>} headers
   * @param {Array<Array>} rows
   */
  function toCsv(headers, rows, options) {
    var cfg = cfgOf(options);
    var d = cfg.delimiter;
    var lines = [];
    if (cfg.excel_hint) lines.push('sep=' + d);
    lines.push((headers || []).map(function (h) { return cell(h, d); }).join(d));
    (rows || []).forEach(function (r) {
      lines.push((r || []).map(function (c) { return cell(c, d); }).join(d));
    });
    return BOM + lines.join('\r\n') + '\r\n';
  }

  /**
   * خواندن CSV/TSV — همان چیزی که از اکسل کپی یا ذخیره می‌شود.
   *
   * جداکننده حدس زده می‌شود چون کاربر ممکن است فایل را با اکسلِ فارسی ذخیره
   * کند (؛) یا از اکسل کپی کند (tab). اجبار به یک جداکننده یعنی نصف
   * فایل‌ها بی‌صدا در یک ستون بیفتند.
   */
  function parseCsv(text) {
    var s = String(text == null ? '' : text);
    if (s.charAt(0) === BOM) s = s.slice(1);
    s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    var hint = /^sep=(.)\n/.exec(s);
    var delim;
    if (hint) { delim = hint[1]; s = s.slice(hint[0].length); }
    else {
      var head = s.split('\n')[0] || '';
      var counts = [['\t', 0], [';', 0], [',', 0]].map(function (p) {
        return [p[0], head.split(p[0]).length - 1];
      });
      counts.sort(function (a, b) { return b[1] - a[1]; });
      delim = counts[0][1] > 0 ? counts[0][0] : ',';
    }

    var rows = [];
    var row = [];
    var field = '';
    var quoted = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (quoted) {
        if (ch === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; }
          else quoted = false;
        } else field += ch;
        continue;
      }
      if (ch === '"') { quoted = true; continue; }
      if (ch === delim) { row.push(field); field = ''; continue; }
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
      field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ''; });
    });
  }

  /* ------------------------------ خروجی‌ها ------------------------------ */

  var PART_HEADERS = ['کابینت', 'قطعه', 'تعداد', 'طول (mm)', 'عرض (mm)',
                      'ضخامت (mm)', 'ورق', 'نوار', 'شیار', 'کد قطعه'];

  function edgeText(e) {
    var names = { front: 'جلو', back: 'عقب', top: 'بالا', bottom: 'پایین' };
    return Object.keys(names).filter(function (k) { return (e || {})[k]; })
      .map(function (k) { return names[k]; }).join('+');
  }

  /** فهرست برش — همان چیزی که به برشکار داده می‌شود. */
  function partsCsv(snapshot, options) {
    var byCab = {};
    (snapshot.cabinets || []).forEach(function (c) { byCab[c.kalaxa_id] = c.label_fa || c.kalaxa_id; });
    var rows = (snapshot.parts_flat || []).map(function (p) {
      return [byCab[p.cabinet_id] || p.cabinet_id || '', p.name_fa || p.key || '',
              p.count, p.cut_length_mm, p.cut_width_mm, p.thickness_mm,
              p.sheet_id || '', edgeText(p.edge),
              (p.groove && p.groove.back) ? p.groove.back : '', p.part_uid || ''];
    });
    return toCsv(PART_HEADERS, rows, options);
  }

  function cabinetsCsv(snapshot, options) {
    var rows = (snapshot.cabinets || []).map(function (c) {
      var p = c.params || {};
      return [c.label_fa || '', c.category || '', c.template_id || '',
              p.cabinet_width, p.cabinet_height, p.cabinet_depth, c.kalaxa_id || ''];
    });
    return toCsv(['کابینت', 'دسته', 'تمپلیت', 'عرض (cm)', 'ارتفاع (cm)', 'عمق (cm)', 'شناسه'],
                 rows, options);
  }

  /** فهرست کالا — همان چیزی که سفارش می‌رود. */
  function goodsCsv(goods, options) {
    var rows = ((goods && goods.rows) || []).map(function (g) {
      return [g.group_fa || '', g.name_fa || g.code || '', g.qty, g.unit_fa || g.unit || '',
              g.note || '', g.code || ''];
    });
    return toCsv(['گروه', 'کالا', 'تعداد', 'واحد', 'توضیح', 'کد'], rows, options);
  }

  /* ------------------------------ ورودی‌ها ------------------------------ */

  /** ستون را با نامش پیدا می‌کند — ترتیب ستون‌ها در اکسل عوض می‌شود. */
  function indexOfHeader(headers, candidates) {
    for (var i = 0; i < headers.length; i++) {
      var h = String(headers[i]).trim();
      for (var j = 0; j < candidates.length; j++) {
        if (h === candidates[j] || h.indexOf(candidates[j]) === 0) return i;
      }
    }
    return -1;
  }

  /**
   * وارد کردن فهرست برشِ ویرایش‌شده.
   *
   * **فقط تعداد و ابعاد** پذیرفته می‌شود، و **فقط برای ردیف‌هایی که کد قطعه
   * دارند**. دلیلش مهم است: اگر اکسل بتواند ردیف بسازد، یک منبع حقیقت سوم
   * کنار مدل و جدول درست می‌شود و هیچ‌کس نمی‌داند کدام درست است. اکسل اینجا
   * ابزار **اصلاح** است، نه منبع.
   *
   * @returns {{updates:Object, applied:number, warnings:Array<string>}}
   *   updates: { part_uid: {count?, cut_length_mm?, cut_width_mm?, thickness_mm?} }
   */
  function importParts(text) {
    var rows = parseCsv(text);
    var warnings = [];
    if (rows.length < 2) return { updates: {}, applied: 0, warnings: ['فایل خالی یا بدون سرستون است'] };

    var head = rows[0];
    var iUid = indexOfHeader(head, ['کد قطعه', 'part_uid', 'uid']);
    var iQty = indexOfHeader(head, ['تعداد', 'count', 'qty']);
    var iLen = indexOfHeader(head, ['طول', 'length']);
    var iWid = indexOfHeader(head, ['عرض', 'width']);
    var iThk = indexOfHeader(head, ['ضخامت', 'thickness']);

    if (iUid === -1) {
      return { updates: {}, applied: 0,
               warnings: ['ستون «کد قطعه» پیدا نشد — بدون آن معلوم نیست هر سطر ' +
                          'کدام قطعه است. فایل را از دکمهٔ خروجی بگیرید و همان را ویرایش کنید.'] };
    }

    var updates = {};
    var applied = 0;
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      var uid = String(row[iUid] == null ? '' : row[iUid]).trim();
      if (!uid) continue;
      var u = {};
      var put = function (idx, key, integer) {
        if (idx === -1) return;
        var v = num(row[idx]);
        if (v == null) return;
        if (v <= 0) {
          warnings.push('سطر ' + (r + 1) + ': مقدار ' + key + ' باید بزرگ‌تر از صفر باشد — نادیده گرفته شد');
          return;
        }
        u[key] = integer ? Math.round(v) : v;
      };
      put(iQty, 'count', true);
      put(iLen, 'cut_length_mm', true);
      put(iWid, 'cut_width_mm', true);
      put(iThk, 'thickness_mm', true);
      if (Object.keys(u).length) { updates[uid] = u; applied++; }
    }

    if (!applied) warnings.push('هیچ سطر قابل‌اعمالی پیدا نشد');
    return { updates: updates, applied: applied, warnings: warnings };
  }

  /**
   * اعمال اصلاحات روی اسنپ‌شات — بدون تغییر نسخهٔ اصلی.
   * @returns {{snapshot:object, changed:number, missing:Array<string>}}
   */
  function applyParts(snapshot, updates) {
    var seen = {};
    var changed = 0;
    var parts = (snapshot.parts_flat || []).map(function (p) {
      var u = updates[p.part_uid];
      if (!u) return p;
      seen[p.part_uid] = true;
      var out = {};
      Object.keys(p).forEach(function (k) { out[k] = p[k]; });
      Object.keys(u).forEach(function (k) {
        if (out[k] !== u[k]) changed++;
        out[k] = u[k];
      });
      return out;
    });
    // کدی که در مدل نیست باید **گفته شود**: کاربر فکر می‌کند اصلاحش اعمال
    // شده، در حالی که ردیفش را از فایل قبلی کپی کرده یا کد را دستی زده.
    var missing = Object.keys(updates).filter(function (k) { return !seen[k]; });
    var out = {};
    Object.keys(snapshot).forEach(function (k) { out[k] = snapshot[k]; });
    out.parts_flat = parts;
    return { snapshot: out, changed: changed, missing: missing };
  }

  return {
    VERSION: VERSION, BOM: BOM, DEFAULTS: DEFAULTS,
    toCsv: toCsv, parseCsv: parseCsv, toLatinDigits: toLatinDigits, num: num,
    partsCsv: partsCsv, cabinetsCsv: cabinetsCsv, goodsCsv: goodsCsv,
    importParts: importParts, applyParts: applyParts,
    PART_HEADERS: PART_HEADERS
  };
}));
