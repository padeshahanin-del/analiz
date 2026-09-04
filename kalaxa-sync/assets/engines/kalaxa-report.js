/**
 * kalaxa-report.js — v1.0.0
 * گزارش متریال: نوار لبه، وزن، برآورد قیمت، برچسب قطعات کارگاه.
 * JS خالص، UMD، بدون وابستگی.
 *
 * قرارداد نوار لبه: front/back در راستای cut_length، top/bottom در راستای cut_width.
 * مقدار هر flag = تعداد لبه (۰ یا ۱؛ عدد بزرگ‌تر هم پشتیبانی می‌شود).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaReport = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.5.0';
  var MDF_DENSITY_KG_M3 = 750;
  var EDGE_WASTE_FACTOR = 1.05; // ۵٪ اضافه‌برش نوار

  function fa(n) {
    return String(n).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function r2(n) { return Math.round(n * 100) / 100; }

  /* ------------------------------------------------------------ نوار لبه */

  /**
   * متراژ نوار لبه به تفکیک sheet_id (رنگ/ضخامت نوار = رنگ ورق قطعه).
   * @returns {by_sheet: [{sheet_id, meters, meters_with_waste}], total_m, total_m_with_waste}
   */
  function edgeBanding(snapshot) {
    var sheetMap = {};
    (snapshot.sheets || []).forEach(function (s) { sheetMap[s.sheet_id] = s; });

    var by = {};
    (snapshot.parts_flat || []).forEach(function (p) {
      var e = p.edge || {};
      var lenEdges = (e.front || 0) + (e.back || 0);   // در راستای طول
      var widEdges = (e.top || 0) + (e.bottom || 0);   // در راستای عرض
      var mm = p.count * (lenEdges * p.cut_length_mm + widEdges * p.cut_width_mm);
      if (!mm) return;
      if (!by[p.sheet_id]) by[p.sheet_id] = 0;
      by[p.sheet_id] += mm;
    });
    var rows = Object.keys(by).map(function (k) {
      var m = by[k] / 1000;
      var sheet = sheetMap[k] || {};
      return { sheet_id: k, material: sheet.material || null,
               meters: r2(m), meters_with_waste: r2(m * EDGE_WASTE_FACTOR) };
    });
    var total = rows.reduce(function (s, r) { return s + r.meters; }, 0);
    return {
      by_sheet: rows,
      total_m: r2(total),
      total_m_with_waste: r2(total * EDGE_WASTE_FACTOR),
      waste_factor: EDGE_WASTE_FACTOR
    };
  }

  /* ---------------------------------------------------------- وزن و سطح */

  /** سطح و وزن تقریبی قطعات (خالص، بدون پرت) به تفکیک ورق */
  function materialSummary(snapshot, nestingResult) {
    var sheetMap = {};
    (snapshot.sheets || []).forEach(function (s) { sheetMap[s.sheet_id] = s; });

    var rows = {};
    (snapshot.parts_flat || []).forEach(function (p) {
      var m2 = p.count * p.cut_length_mm * p.cut_width_mm / 1e6;
      if (!rows[p.sheet_id]) rows[p.sheet_id] = { area_m2: 0, weight_kg: 0 };
      rows[p.sheet_id].area_m2 += m2;
      rows[p.sheet_id].weight_kg += m2 * (p.thickness_mm / 1000) * MDF_DENSITY_KG_M3;
    });

    var nestBy = {};
    ((nestingResult || {}).by_sheet_type || []).forEach(function (g) { nestBy[g.sheet_id] = g; });

    var out = Object.keys(rows).map(function (k) {
      var sheet = sheetMap[k] || {};
      var g = nestBy[k] || {};
      return {
        sheet_id: k,
        material: sheet.material || '',
        color_code: sheet.color_code || '',
        thickness_mm: sheet.thickness_mm || 0,
        parts_area_m2: r2(rows[k].area_m2),
        weight_kg: r2(rows[k].weight_kg),
        sheets_used: g.sheets_used || 0,
        utilization_pct: g.utilization_pct || 0
      };
    });
    return {
      rows: out,
      total_weight_kg: r2(out.reduce(function (s, r) { return s + r.weight_kg; }, 0)),
      total_area_m2: r2(out.reduce(function (s, r) { return s + r.parts_area_m2; }, 0)),
      density_assumed_kg_m3: MDF_DENSITY_KG_M3
    };
  }

  /* ---------------------------------------------------------- برآورد قیمت */

  /**
   * @param {object} priceTable - {sheets: {sheet_id: price}, edge_per_m: {sheet_id: price},
   *                              currency: 'تومان'}
   * قیمت ورق: از priceTable، وگرنه از price_per_sheet خود snapshot.
   */
  function priceEstimate(snapshot, nestingResult, priceTable) {
    priceTable = priceTable || {};
    var sheetPrices = priceTable.sheets || {};
    var edgePrices = priceTable.edge_per_m || {};
    var currency = priceTable.currency || 'تومان';

    var sheetMap = {};
    (snapshot.sheets || []).forEach(function (s) { sheetMap[s.sheet_id] = s; });

    var lines = [];
    var total = 0;

    ((nestingResult || {}).by_sheet_type || []).forEach(function (g) {
      var unit = (sheetPrices[g.sheet_id] != null)
        ? sheetPrices[g.sheet_id]
        : ((sheetMap[g.sheet_id] || {}).price_per_sheet || 0);
      var cost = unit * g.sheets_used;
      total += cost;
      lines.push({
        kind: 'sheet', sheet_id: g.sheet_id,
        qty: g.sheets_used, unit_price: unit, cost: cost,
        label_fa: 'ورق ' + g.sheet_id + ' × ' + g.sheets_used
      });
    });

    var eb = edgeBanding(snapshot);
    eb.by_sheet.forEach(function (row) {
      var unit = edgePrices[row.sheet_id] || 0;
      var cost = r2(unit * row.meters_with_waste);
      total += cost;
      lines.push({
        kind: 'edge', sheet_id: row.sheet_id,
        qty: row.meters_with_waste, unit_price: unit, cost: cost,
        label_fa: 'نوار لبه ' + row.sheet_id + ' — ' + row.meters_with_waste + ' متر'
      });
    });

    return { lines: lines, total: r2(total), currency: currency, complete: hasAnyPrice(lines) };
  }

  function hasAnyPrice(lines) {
    return lines.some(function (l) { return l.unit_price > 0; });
  }

  /* -------------------------------------------------------- برچسب قطعات */

  /** کد لبه فشرده برای برچسب: مثل «ط۲ ع۱» (طول ۲ لبه، عرض ۱ لبه) */
  function edgeCode(p) {
    var e = p.edge || {};
    var L = (e.front || 0) + (e.back || 0);
    var W = (e.top || 0) + (e.bottom || 0);
    var parts = [];
    if (L) parts.push('ط' + fa(L));
    if (W) parts.push('ع' + fa(W));
    return parts.join(' ') || '—';
  }

  /** کد شیار برای لیست قطعات: نام ضلع‌های شیاردار، مثل «شیار: پشت». '' اگر شیار ندارد. */
  function grooveCode(p) {
    var g = p.groove || {};
    var FA = { front: 'جلو', back: 'پشت', top: 'بالا', bottom: 'پایین' };
    var sides = ['front', 'back', 'top', 'bottom'].filter(function (k) { return g[k]; })
      .map(function (k) { return FA[k]; });
    return sides.length ? 'شیار: ' + sides.join('، ') : '';
  }

  var SIDE_FA = { front: 'جلو', back: 'پشت', top: 'بالا', bottom: 'پایین' };
  var DOOR_KEYS_REPORT = { door: 1, drawer_front: 1 };

  /**
   * کد علائم کاربرتعریف‌شده برای برچسب قطعات: «کد:ضلع» برای هر ضلعِ نوار/شیار/فارسی‌بر.
   * مثل «#:جلو  W:پشت  F:بالا». marks از snapshot.project.marks (اگر تنظیمات پروژه اعمال شده باشد).
   * @returns {string} '' اگر marks در دسترس نیست یا قطعه هیچ علامتی ندارد
   */
  function markCodes(p, marks) {
    if (!marks) return '';
    var bandKey = DOOR_KEYS_REPORT[p.key] ? 'band_door' : 'band_body';
    var band = marks[bandKey] || {};
    var groove = marks.groove || {};
    var miter = marks.miter || {};
    var bevel = marks.bevel || {};
    var bits = [];
    ['front', 'back', 'top', 'bottom'].forEach(function (side) {
      if (p.edge && p.edge[side] && band.code) bits.push(band.code + ':' + SIDE_FA[side]);
      if (p.groove && p.groove[side] && groove.code) bits.push(groove.code + ':' + SIDE_FA[side]);
      if (p.miter && p.miter[side] && miter.code) bits.push(miter.code + ':' + SIDE_FA[side]);
      if (p.bevel && p.bevel[side] && bevel.code) {
        // bevel:1 = فقط پرچم (هم‌تراز edge/groove/miter)، نه ۱ درجه — ADR-0001
        var v = p.bevel[side];
        var ang = (typeof v === 'number' && v > 1) ? fa(v) + '°' : '';
        bits.push(bevel.code + ang + ':' + SIDE_FA[side]);
      }
    });
    return bits.join('  ');
  }

  /**
   * HTML برچسب‌های چاپی کارگاه (هر نمونه قطعه یک برچسب).
   * اندازه برچسب ~۷۰×۳۵ میلی‌متر، مناسب برگه A4 برچسب ۲۴تایی.
   */
  function labelsHtml(snapshot, projectName) {
    var cabMap = {};
    (snapshot.cabinets || []).forEach(function (c) { cabMap[c.kalaxa_id] = c; });
    var marks = snapshot.project && snapshot.project.marks; // از تنظیمات پروژه (اگر اعمال شده)

    var cells = [];
    (snapshot.parts_flat || []).forEach(function (p) {
      var cab = cabMap[p.cabinet_id] || {};
      var mcode = markCodes(p, marks);
      for (var i = 1; i <= p.count; i++) {
        cells.push(
          '<div class="lbl">' +
          '<div class="l1">' + esc(p.name_fa || p.key) +
          (p.count > 1 ? ' <span class="inst">' + fa(i) + '/' + fa(p.count) + '</span>' : '') +
          '</div>' +
          '<div class="l2">' + fa(p.cut_length_mm) + ' × ' + fa(p.cut_width_mm) +
          ' × ' + fa(p.thickness_mm) + '</div>' +
          '<div class="l3">' + esc(cab.label_fa || p.cabinet_id) + '</div>' +
          '<div class="l4">' + esc(p.sheet_id) + ' — لبه: ' + edgeCode(p) +
          (p.grain && p.grain !== 'none' ? ' — راه چوب' : '') + '</div>' +
          (mcode ? '<div class="l5">' + esc(mcode) + '</div>' :
            (grooveCode(p) ? '<div class="l5">▭ ' + esc(grooveCode(p)) + '</div>' : '')) +
          '</div>');
      }
    });

    return '<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8">' +
      '<title>برچسب قطعات — ' + esc(projectName || '') + '</title><style>' +
      'body{font-family:Tahoma,sans-serif;margin:0;padding:6mm;}' +
      '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2mm;}' +
      '.lbl{border:1px dashed #999;border-radius:2mm;padding:2mm 3mm;height:32mm;overflow:hidden;}' +
      '.l1{font-weight:bold;font-size:12px;}.inst{color:#888;font-weight:normal;}' +
      '.l2{font-size:16px;font-weight:bold;margin:1mm 0;}' +
      '.l3{font-size:10px;color:#555;}.l4{font-size:10px;color:#777;}' +
      '.l5{font-size:10px;color:#333;font-weight:bold;}' +
      '@media print{.no-print{display:none}}' +
      '</style></head><body>' +
      '<div class="no-print" style="padding:6px;background:#eee;margin-bottom:4mm">' +
      'چاپ روی برگه برچسب A4 — Ctrl+P</div>' +
      '<div class="grid">' + cells.join('') + '</div></body></html>';
  }

  return {
    VERSION: VERSION,
    edgeBanding: edgeBanding,
    materialSummary: materialSummary,
    priceEstimate: priceEstimate,
    labelsHtml: labelsHtml,
    _internal: { edgeCode: edgeCode, grooveCode: grooveCode, markCodes: markCodes }
  };
}));
