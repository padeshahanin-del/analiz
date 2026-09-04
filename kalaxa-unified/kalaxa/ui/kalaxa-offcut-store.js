/**
 * kalaxa-offcut-store.js — v1.0.0
 * منطق انبار ماندگار آفکات (State 10 قرارداد). ماندگاری سمت Ruby است
 * (فایل JSON خارج از Plugins)؛ این ماژول فقط منطق خالص و تست‌پذیر است.
 *
 * رکورد انبار:
 * { offcut_id, sheet_id, material, color_code, thickness_mm,
 *   width_mm, height_mm, grain, source_project, created_at,
 *   consumed: bool, consumed_at, consumed_project }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaOffcutStore = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var STORE_VERSION = 1;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function finitePos(n) { return typeof n === 'number' && isFinite(n) && n > 0; }

  function emptyStore() {
    return { store_version: STORE_VERSION, offcuts: [] };
  }

  /** نرمال‌سازی/اعتبارسنجی انبار خوانده‌شده از دیسک — رکوردهای خراب حذف و گزارش می‌شوند */
  function normalize(raw) {
    var warnings = [];
    var store = emptyStore();
    if (!raw || typeof raw !== 'object') {
      if (raw != null) warnings.push('فایل انبار نامعتبر بود — انبار خالی ساخته شد');
      return { store: store, warnings: warnings };
    }
    var list = Array.isArray(raw.offcuts) ? raw.offcuts : (Array.isArray(raw) ? raw : []);
    var ids = {};
    list.forEach(function (o, i) {
      if (!o || typeof o !== 'object' || !finitePos(o.width_mm) || !finitePos(o.height_mm) ||
          !o.sheet_id || !o.offcut_id) {
        warnings.push('رکورد آفکات #' + (i + 1) + ' خراب بود و حذف شد');
        return;
      }
      if (ids[o.offcut_id]) { warnings.push('آفکات تکراری حذف شد: ' + o.offcut_id); return; }
      ids[o.offcut_id] = true;
      store.offcuts.push({
        offcut_id: String(o.offcut_id),
        sheet_id: String(o.sheet_id),
        material: o.material || '',
        color_code: o.color_code || '',
        thickness_mm: o.thickness_mm || 0,
        width_mm: Math.round(o.width_mm),
        height_mm: Math.round(o.height_mm),
        grain: o.grain || 'none',
        source_project: o.source_project || '',
        created_at: o.created_at || '',
        consumed: !!o.consumed,
        consumed_at: o.consumed_at || '',
        consumed_project: o.consumed_project || ''
      });
    });
    return { store: store, warnings: warnings };
  }

  /** آفکات‌های مصرف‌نشده → ورودی stock_offcuts موتور nesting */
  function toStockOffcuts(store) {
    return (store.offcuts || [])
      .filter(function (o) { return !o.consumed; })
      .map(function (o) {
        return { offcut_id: o.offcut_id, sheet_id: o.sheet_id,
                 width_mm: o.width_mm, height_mm: o.height_mm };
      });
  }

  /**
   * برداشت آفکات‌های قابل‌استفاده از نتیجه nesting به انبار.
   * فقط از ورق‌های نو (آفکات باقیمانده روی آفکات انبار، رکورد جدید نمی‌سازد؛
   * رکورد مادرش با markConsumed مصرف می‌شود).
   * شناسه قطعی: project:sheet_id:sheetIndex:offcutIndex
   */
  function harvest(store, nestingResult, snapshot, opts) {
    opts = opts || {};
    var minMm = opts.min_mm || 150;
    var project = opts.project || (snapshot.source && snapshot.source.model_name) || 'project';
    var now = opts.now || '';
    var s = clone(store);
    var existing = {};
    s.offcuts.forEach(function (o) { existing[o.offcut_id] = true; });

    var sheetMap = {};
    (snapshot.sheets || []).forEach(function (sh) { sheetMap[sh.sheet_id] = sh; });

    var added = 0;
    (nestingResult.by_sheet_type || []).forEach(function (g) {
      var sheet = sheetMap[g.sheet_id] || {};
      (g.layouts || []).forEach(function (l) {
        (l.offcuts || []).forEach(function (o, oi) {
          if (o.w_mm < minMm || o.h_mm < minMm) return;
          var id = project + ':' + g.sheet_id + ':' + l.sheet_index + ':' + (oi + 1);
          if (existing[id]) return; // برداشت تکراری همان پروژه
          existing[id] = true;
          s.offcuts.push({
            offcut_id: id, sheet_id: g.sheet_id,
            material: sheet.material || '', color_code: sheet.color_code || '',
            thickness_mm: sheet.thickness_mm || 0,
            width_mm: o.w_mm, height_mm: o.h_mm,
            grain: sheet.has_grain ? 'length' : 'none',
            source_project: project, created_at: now,
            consumed: false, consumed_at: '', consumed_project: ''
          });
          added++;
        });
      });
    });
    return { store: s, added: added };
  }

  /** علامت‌گذاری آفکات‌های مصرف‌شده در این نتیجه (stock_layouts) */
  function markConsumed(store, nestingResult, opts) {
    opts = opts || {};
    var s = clone(store);
    var usedIds = {};
    (nestingResult.by_sheet_type || []).forEach(function (g) {
      (g.stock_layouts || []).forEach(function (l) {
        if (l.offcut_id && (l.placements || []).length) usedIds[l.offcut_id] = true;
      });
    });
    var marked = 0;
    s.offcuts.forEach(function (o) {
      if (usedIds[o.offcut_id] && !o.consumed) {
        o.consumed = true;
        o.consumed_at = opts.now || '';
        o.consumed_project = opts.project || '';
        marked++;
      }
    });
    return { store: s, marked: marked };
  }

  /** آمار انبار برای UI */
  function stats(store) {
    var live = store.offcuts.filter(function (o) { return !o.consumed; });
    return {
      total: store.offcuts.length,
      available: live.length,
      consumed: store.offcuts.length - live.length,
      available_area_m2: Math.round(live.reduce(function (s, o) {
        return s + o.width_mm * o.height_mm / 1e6;
      }, 0) * 100) / 100
    };
  }

  return {
    VERSION: VERSION, STORE_VERSION: STORE_VERSION,
    emptyStore: emptyStore, normalize: normalize, toStockOffcuts: toStockOffcuts,
    harvest: harvest, markConsumed: markConsumed, stats: stats
  };
}));
