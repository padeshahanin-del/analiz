/**
 * kalaxa-cabinet-view.js — v1.0.0
 * فهرست کابینت‌ها + نمای روبه‌روی SVG هر کابینت + تفکیک متریال/درب/کشو به ازای کابینت.
 * ورودی همان snapshot (schema v2)؛ ابعاد کابینت در params به سانتی‌متر است (میراث دامنه)،
 * ابعاد قطعات به میلی‌متر. JS خالص، UMD، بدون وابستگی — تست‌پذیر در Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaCabinetView = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  function esc(x) {
    return String(x == null ? '' : x)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** طول به رشتهٔ واحد نمایش. unit: 'cm' (پیش‌فرض) | 'mm' — cm حداکثر یک رقم اعشار. */
  function fmtLen(mm, unit) {
    if (typeof mm !== 'number' || !isFinite(mm)) return '—';
    if (unit === 'mm') return String(Math.round(mm));
    var cm = Math.round(mm / 10 * 10) / 10; // یک رقم اعشار
    return (cm % 1 === 0 ? String(Math.round(cm)) : String(cm));
  }

  var CATEGORY_FA = { base: 'زمینی', wall: 'هوایی', tall: 'قدی' };

  /**
   * خلاصهٔ کابینت‌ها از snapshot.
   * @returns { cabinets: [{ id, label_fa, category, category_fa, template_id,
   *   w_mm, h_mm, d_mm, door_type, door_swing, shelf_count,
   *   doors, drawer_fronts, parts_rows, parts_qty,
   *   materials: [{sheet_id, qty, area_m2}] }], warnings: [fa] }
   */
  function summarize(snapshot) {
    var warnings = [];
    var partsByCab = {};
    ((snapshot && snapshot.parts_flat) || []).forEach(function (p) {
      (partsByCab[p.cabinet_id] = partsByCab[p.cabinet_id] || []).push(p);
    });

    var cabinets = ((snapshot && snapshot.cabinets) || []).map(function (c) {
      var params = c.params || {};
      var parts = partsByCab[c.kalaxa_id] || [];
      if (!parts.length) warnings.push('کابینت «' + (c.label_fa || c.kalaxa_id) + '» هیچ قطعه‌ای ندارد');

      var doors = 0, drawers = 0, shelves = 0, qty = 0;
      var mat = {};
      parts.forEach(function (p) {
        var n = p.count || 0;
        qty += n;
        if (p.key === 'door') doors += n;
        if (p.key === 'drawer_front') drawers += n;
        if (p.key === 'shelf') shelves += n;
        var m = mat[p.sheet_id] = mat[p.sheet_id] || { sheet_id: p.sheet_id, qty: 0, area_m2: 0 };
        m.qty += n;
        m.area_m2 += (p.cut_length_mm * p.cut_width_mm * n) / 1e6;
      });

      var materials = Object.keys(mat).sort().map(function (k) {
        var m = mat[k];
        return { sheet_id: m.sheet_id, qty: m.qty, area_m2: Math.round(m.area_m2 * 100) / 100 };
      });

      return {
        id: c.kalaxa_id,
        label_fa: c.label_fa || c.kalaxa_id,
        category: c.category || '',
        category_fa: CATEGORY_FA[c.category] || c.category || '—',
        template_id: c.template_id || '',
        w_mm: (params.cabinet_width || 0) * 10,
        h_mm: (params.cabinet_height || 0) * 10,
        d_mm: (params.cabinet_depth || 0) * 10,
        door_type: params.door_type || null,
        door_swing: params.door_swing || null,
        shelf_count: typeof params.shelf_count === 'number' ? params.shelf_count : shelves,
        doors: doors,
        drawer_fronts: drawers,
        parts_rows: parts.length,
        parts_qty: qty,
        materials: materials
      };
    });

    return { cabinets: cabinets, warnings: warnings };
  }

  /**
   * نمای روبه‌روی یک کابینت (خروجی summarize) به SVG.
   * قرارداد رسم نقشهٔ کابینت: خط اریب درب از سمت لولا باز می‌شود؛ کشوها بالای درب؛
   * طبقه‌ها خط‌چین. opts: { unit: 'cm'|'mm', width_px }
   */
  function frontSVG(cab, opts) {
    opts = opts || {};
    var unit = opts.unit === 'mm' ? 'mm' : 'cm';
    var W = cab.w_mm || 600, H = cab.h_mm || 720;
    var boxW = opts.width_px || 150;
    var scale = boxW / W;
    var boxH = Math.max(40, Math.round(H * scale));
    var pad = 6, labelH = 30;
    var svgW = boxW + pad * 2, svgH = boxH + pad * 2 + labelH;

    var s = [];
    s.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + svgW + ' ' + svgH +
      '" width="' + svgW + '" height="' + svgH + '" font-family="inherit">');
    // بدنه
    s.push('<rect x="' + pad + '" y="' + pad + '" width="' + boxW + '" height="' + boxH +
      '" fill="#faf7f2" stroke="#7a6a53" stroke-width="1.5"/>');

    var innerX = pad + 2, innerW = boxW - 4;
    var y = pad + 2;

    // کشوها — نوارهای افقی از بالا
    var drawers = cab.drawer_fronts || 0;
    var drawerZoneH = 0;
    if (drawers > 0) {
      var dh = (cab.doors > 0)
        ? Math.min(Math.round(boxH * 0.18), Math.round((boxH - 8) / (drawers + 1)))
        : Math.round((boxH - 4) / drawers);
      for (var i = 0; i < drawers; i++) {
        s.push('<rect x="' + innerX + '" y="' + y + '" width="' + innerW + '" height="' + (dh - 2) +
          '" fill="#f1e8da" stroke="#9c8a6e" stroke-width="1"/>');
        var hy = y + (dh - 2) / 2;
        s.push('<line x1="' + (innerX + innerW * 0.35) + '" y1="' + hy + '" x2="' +
          (innerX + innerW * 0.65) + '" y2="' + hy + '" stroke="#5f5142" stroke-width="2"/>');
        y += dh;
      }
      drawerZoneH = y - (pad + 2);
    }

    // درب‌ها — لنگه‌های عمودی؛ خط اریب از سمت لولا
    var doors = cab.doors || 0;
    var doorZoneY = y, doorZoneH = boxH - 4 - drawerZoneH;
    if (doors > 0 && doorZoneH > 8) {
      var leafW = innerW / doors;
      for (var d = 0; d < doors; d++) {
        var lx = innerX + d * leafW;
        s.push('<rect x="' + lx + '" y="' + doorZoneY + '" width="' + (leafW - 2) + '" height="' + doorZoneH +
          '" fill="#efe4d0" stroke="#9c8a6e" stroke-width="1"/>');
        // لولا: تک‌لنگه از door_swing؛ دولنگه: چپ‌لولا-چپ، راست‌لولا-راست (نمای RTL همان هندسه)
        var hingeLeft = doors === 1 ? (cab.door_swing === 'left') : (d === 0);
        var hx = hingeLeft ? lx : lx + leafW - 2;          // لبهٔ لولا
        var ox = hingeLeft ? lx + leafW - 2 : lx;          // لبهٔ بازشو
        var midY = doorZoneY + doorZoneH / 2;
        s.push('<polyline points="' + hx + ',' + doorZoneY + ' ' + ox + ',' + midY + ' ' +
          hx + ',' + (doorZoneY + doorZoneH) + '" fill="none" stroke="#b3a284" stroke-width="1"/>');
        // دستگیره کنار لبهٔ بازشو
        var gx = hingeLeft ? lx + leafW - 8 : lx + 6;
        s.push('<circle cx="' + gx + '" cy="' + midY + '" r="2.2" fill="#5f5142"/>');
      }
    }

    // طبقه‌ها — خط‌چین در ناحیهٔ بدنه (پشت درب)
    var shelves = cab.shelf_count || 0;
    if (shelves > 0 && doorZoneH > 12) {
      for (var sh = 1; sh <= shelves; sh++) {
        var sy = doorZoneY + (doorZoneH * sh) / (shelves + 1);
        s.push('<line x1="' + innerX + '" y1="' + sy + '" x2="' + (innerX + innerW) + '" y2="' + sy +
          '" stroke="#a89673" stroke-width="1" stroke-dasharray="4 3"/>');
      }
    }

    // برچسب نام + ابعاد
    var unitFa = unit === 'mm' ? 'mm' : 'cm';
    var dims = fmtLen(W, unit) + '×' + fmtLen(H, unit) + '×' + fmtLen(cab.d_mm, unit) + ' ' + unitFa;
    s.push('<text x="' + (svgW / 2) + '" y="' + (boxH + pad * 2 + 11) + '" text-anchor="middle" ' +
      'font-size="11" fill="#333">' + esc(cab.label_fa) + '</text>');
    s.push('<text x="' + (svgW / 2) + '" y="' + (boxH + pad * 2 + 25) + '" text-anchor="middle" ' +
      'font-size="10" fill="#777" direction="ltr">' + esc(dims) + '</text>');
    s.push('</svg>');
    return s.join('');
  }

  return { VERSION: VERSION, fmtLen: fmtLen, summarize: summarize,
           frontSVG: frontSVG, CATEGORY_FA: CATEGORY_FA };
}));
