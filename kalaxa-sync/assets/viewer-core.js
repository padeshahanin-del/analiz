/**
 * viewer-core.js — v1.0.0
 * هستهٔ خالص «کلاینت وب فقط-خواندنی»: پاکت kalaxa-doc → بخش‌های نمایشی
 * (خلاصه، نقشه برش، نقشه نصب، متریال/لبه، BOM یراق) — بدون DOM/شبکه؛
 * صفحهٔ وب فقط چسب DOM است. همان موتورهای UMD پلاگین، بدون تغییر.
 *
 * ورودی: رشتهٔ خام envelope (خروجی pull یا فایل محلی).
 * خروجی: { ok, meta:{project_name, revision, schema_version, updated_at},
 *          sections:[{id, title_fa, html}], errors[fa], limitations[fa] }
 * قواعد HTML: فقط از esc() برای متن کاربر؛ SVG ها خروجی موتورهای خودی‌اند.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./engines/kalaxa-doc-adapter.js'),
      require('./engines/kalaxa-nesting.js'),
      require('./engines/kalaxa-nesting-validator.js'),
      require('./engines/kalaxa-cutmap-svg.js'),
      require('./engines/kalaxa-install-map.js'),
      require('./engines/kalaxa-report.js'),
      require('./engines/kalaxa-hardware.js'),
      require('./engines/kalaxa-placement.js')
    );
  } else {
    root.KalaxaViewerCore = factory(
      root.KalaxaDocAdapter, root.KalaxaNesting, root.KalaxaNestingValidator,
      root.KalaxaCutmapSVG, root.KalaxaInstallMap, root.KalaxaReport,
      root.KalaxaHardware, root.KalaxaPlacement
    );
  }
}(typeof self !== 'undefined' ? self : this,
  function (Adapter, Nesting, NestValidator, Cutmap, InstallMap, Report, Hardware, Placement) {
    'use strict';

    var VERSION = '1.0.0';
    var MAX_SCHEMA = 3; // هم‌گام با Migrations::CURRENT_VERSION

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function fa(n) {
      return String(n).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
    }
    function fail(errors) {
      return { ok: false, meta: null, sections: [], errors: errors, limitations: [] };
    }

    /** اعتبارسنجی سبک پاکت (آینهٔ سرور؛ چک‌سام این‌جا محاسبه نمی‌شود — سرور امین است). */
    function parseEnvelope(raw) {
      var env;
      try { env = JSON.parse(raw); } catch (e) {
        return { ok: false, error: 'JSON پاکت خراب است: ' + e.message };
      }
      if (!env || typeof env !== 'object') return { ok: false, error: 'پاکت معتبر نیست' };
      if (env.format !== 'kalaxa-doc' && env.format !== 'kabinetyar-doc') {
        return { ok: false, error: 'قالب پاکت ناشناخته است' };
      }
      var v = env.schema_version;
      if (typeof v !== 'number' || v < 1) return { ok: false, error: 'schema_version نامعتبر است' };
      if (v > MAX_SCHEMA) {
        return { ok: false, error: 'پاکت با schema جدیدتر از نمایشگر است (v' + v + ')' };
      }
      if (!env.doc || typeof env.doc !== 'object') return { ok: false, error: 'بخش doc موجود نیست' };
      return { ok: true, env: env };
    }

    function tableHtml(headers, rows) {
      var h = ['<table><tr>'];
      headers.forEach(function (x) { h.push('<th>' + esc(x) + '</th>'); });
      h.push('</tr>');
      rows.forEach(function (r) {
        h.push('<tr>');
        r.forEach(function (c) { h.push('<td>' + c + '</td>'); }); // سلول‌ها از قبل امن/فرمت‌شده
        h.push('</tr>');
      });
      h.push('</table>');
      return h.join('');
    }

    /**
     * @param {string} rawEnvelope
     * @param {object} [options] - { price_table }
     */
    function render(rawEnvelope, options) {
      options = options || {};
      var p = parseEnvelope(rawEnvelope);
      if (!p.ok) return fail([p.error]);
      var env = p.env;
      var doc = env.doc;

      var ad = Adapter.toSnapshot(doc, { project_label: (doc.project && doc.project.name) || '' });
      if (!ad.ok) return fail(['نگاشت سند شکست خورد:'].concat(ad.errors));
      var snapshot = ad.snapshot;
      var limitations = (ad.limitations || []).slice();
      var errors = [];

      var nest = Nesting.run(snapshot);
      if (!nest.ok) return fail(['بهینه‌سازی برش شکست خورد:'].concat(nest.errors || []));
      var gate = NestValidator.validate(snapshot, nest);
      if (!gate.ok) {
        errors.push('اعتبارسنج مستقل چیدمان را رد کرد — نقشه برش نمایش داده نمی‌شود');
      }

      var sections = [];

      // ۱) خلاصه
      var st = Placement.status(doc);
      sections.push({
        id: 'summary', title_fa: 'خلاصه',
        html: tableHtml(['شاخص', 'مقدار'], [
          ['قطعات', fa(snapshot.parts_flat.length)],
          ['یونیت‌ها', fa(snapshot.cabinets.length) +
            ' (جانمایی ' + fa(st.placed) + '/' + fa(st.total) + ')'],
          ['ورق نو موردنیاز', fa(nest.total_sheets)],
          ['schema پاکت', 'v' + fa(env.schema_version) +
            (env.revision ? ' — revision ' + fa(env.revision) : '')]
        ])
      });

      // ۲) نقشه برش (فقط با تأیید دروازهٔ اعتبارسنج)
      if (gate.ok) {
        var cutHtml = Cutmap.renderAll(nest, snapshot.sheets, { show_cuts: true, show_offcuts: true })
          .map(function (m) {
          return '<div class="map-wrap">' + m.svg + '</div>';
        }).join('');
        sections.push({ id: 'cutmap', title_fa: 'نقشه برش', html: cutHtml });
      }

      // ۳) نقشه نصب — فقط وقتی جانمایی کامل است (سیاست همه-یا-هیچ آداپتور)
      var placementIncomplete = limitations.some(function (l) { return /نقشه نصب/.test(l); });
      if (!placementIncomplete && snapshot.cabinets.length) {
        var instHtml = InstallMap.renderAll(snapshot).map(function (m) {
          return '<div class="map-wrap">' + m.svg + '</div>';
        }).join('');
        var overlaps = Placement.checkOverlaps(doc);
        if (overlaps.length) {
          instHtml = '<div class="msg warn">هم‌پوشانی جانمایی: ' + overlaps.map(function (o) {
            return esc(o.a_name) + ' ↔ ' + esc(o.b_name) + ' (' + fa(o.overlap_mm) + ' mm)';
          }).join('؛ ') + '</div>' + instHtml;
        }
        sections.push({ id: 'install', title_fa: 'نقشه نصب', html: instHtml });
      }

      // ۴) متریال و نوار لبه
      var mat = Report.materialSummary(snapshot, nest);
      var edge = Report.edgeBanding(snapshot);
      var edgeRows = (edge.by_sheet || []).map(function (r) {
        return [esc(r.name || r.edgeband || r.sheet_id || ''), fa(r.length_m != null ? r.length_m : r.total_m || 0)];
      });
      if (!edgeRows.length) {
        edgeRows = [['—', fa(edge.total_m || 0)]];
      }
      sections.push({
        id: 'material', title_fa: 'گزارش متریال',
        html: tableHtml(['متریال', 'ضخامت', 'مساحت قطعات (m²)', 'ورق مصرفی', 'بازدهی ٪', 'وزن (kg)'],
          (mat.rows || []).map(function (r) {
            return [esc(r.material), fa(r.thickness_mm), fa(r.parts_area_m2),
                    fa(r.sheets_used), fa(r.utilization_pct), fa(r.weight_kg)];
          })) +
          '<div class="meta">جمع: ' + fa(mat.total_area_m2) + ' m² — ' +
          fa(mat.total_weight_kg) + ' kg (چگالی فرضی ' + fa(mat.density_assumed_kg_m3) + ')</div>' +
          '<h4>نوار لبه</h4>' +
          tableHtml(['ردیف', 'طول (m)'], edgeRows) +
          '<div class="meta">جمع با پرت: ' + fa(edge.total_m_with_waste || 0) + ' m</div>'
      });

      // ۵) BOM یراق (قاعده + صریح — D-HW-1)
      var bom = Hardware.bom(snapshot, { explicit: ad.explicit_hardware });
      sections.push({
        id: 'hardware', title_fa: 'یراق',
        html: tableHtml(['قلم', 'تعداد', 'واحد', 'توضیح'], bom.items.map(function (it) {
          return [esc(it.name_fa), fa(it.qty), esc(it.unit), esc(it.detail_fa)];
        }))
      });

      return {
        ok: errors.length === 0,
        meta: {
          project_name: (doc.project && doc.project.name) || '',
          revision: env.revision || null,
          schema_version: env.schema_version,
          updated_at: env.updated_at || null
        },
        sections: sections,
        errors: errors,
        limitations: limitations
      };
    }

    return { VERSION: VERSION, render: render, parseEnvelope: parseEnvelope, _esc: esc };
  }));
