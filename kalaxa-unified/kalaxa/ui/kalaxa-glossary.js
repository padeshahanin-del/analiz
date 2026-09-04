/**
 * kalaxa-glossary.js — v1.0.0
 * واژگان کارگاه روی لایهٔ ترجمه. آینهٔ lib/glossary.rb — همان کلیدها، همان معناشناسی.
 * JS خالص، UMD، بدون وابستگی.
 *
 * دو لایهٔ جدا:
 *   ترجمه          — یک فایل برای هر زبان (i18n/fa.json، en.json). زبان تازه = فایل تازه.
 *   واژگان کارگاه  — بازنویسی کاربر روی زبان فعال، به تفکیک زبان.
 *
 * کلیدها پایدارند (`part.side`، `hw.hinge`، `term.reveal`)؛ موتورها فقط کلید را
 * می‌شناسند، پس تغییر واژه هیچ محاسبه‌ای را نمی‌شکند. کلید ناشناخته → خودِ کلید
 * برگردانده می‌شود، نه استثنا.
 *
 * در اسکچاپ، Ruby بستهٔ آماده را با Glossary#payload می‌فرستد و پنل load() می‌کند.
 * در تست/نمایشگر وب هم می‌شود مستقیم یک بسته داد.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaGlossary = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  // کلیدهایی که کاربر می‌تواند تغییر دهد — متن رابط (panel./about./error.) عمداً
  // بیرون است: کارِ مترجم است، نه واژگان کارگاه.
  var EDITABLE_PREFIXES = ['part.', 'hw.', 'unit.', 'template.', 'category.',
                           'slide.', 'handle.', 'term.'];

  function isEditable(key) {
    for (var i = 0; i < EDITABLE_PREFIXES.length; i++) {
      if (String(key).indexOf(EDITABLE_PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  function create(payload) {
    payload = payload || {};
    var terms = payload.terms || {};
    var alternatives = payload.alternatives || {};
    var overridden = payload.overridden || [];
    var locale = payload.locale || 'fa';

    function t(key, fallback) {
      var k = String(key);
      if (Object.prototype.hasOwnProperty.call(terms, k)) return terms[k];
      return fallback !== undefined ? fallback : k;
    }

    // نام قطعه از روی کلید قطعه (`side` → `part.side`). همین باعث می‌شود تغییر
    // واژه فوراً روی کابینت‌های **قبلاً ساخته‌شده** هم اثر کند: موتورها روی
    // p.key کار می‌کنند و نام در زمان نمایش حل می‌شود، نه زمان ساخت.
    function part(partKey, fallback) {
      return t('part.' + partKey, fallback);
    }

    function hardware(itemId, fallback) {
      // ریل کشو با سایز می‌آید: slide_450 → «ریل کشو ۴۵۰ میلی‌متر»
      var m = /^slide_(\d+)$/.exec(String(itemId));
      if (m) return t('hw.slide') + ' ' + m[1];
      return t('hw.' + itemId, fallback);
    }

    function unit(unitId, fallback) { return t('unit.' + unitId, fallback); }
    function template(id, fallback) { return t('template.' + id, fallback); }
    function term(id, fallback) { return t('term.' + id, fallback); }

    function suggestions(key) {
      var list = alternatives[String(key)];
      return Array.isArray(list) ? list.slice() : [];
    }

    function isOverridden(key) { return overridden.indexOf(String(key)) !== -1; }

    function editableKeys() {
      return Object.keys(terms).filter(isEditable).sort();
    }

    return {
      VERSION: VERSION,
      locale: locale,
      direction: payload.direction || (locale === 'fa' ? 'rtl' : 'ltr'),
      t: t,
      part: part,
      hardware: hardware,
      unit: unit,
      template: template,
      term: term,
      suggestions: suggestions,
      isOverridden: isOverridden,
      isEditable: isEditable,
      editableKeys: editableKeys,
      terms: terms
    };
  }

  // نمونهٔ پیش‌فرضِ تهی: تا وقتی بسته نرسیده، هر کلید خودش را برمی‌گرداند —
  // پس هیچ موتوری به‌خاطر نبودِ واژه‌نامه کرش نمی‌کند.
  var active = create({});

  function load(payload) {
    active = create(payload);
    return active;
  }

  function current() { return active; }

  return {
    VERSION: VERSION,
    create: create,
    load: load,
    current: current,
    isEditable: isEditable,
    EDITABLE_PREFIXES: EDITABLE_PREFIXES.slice()
  };
}));
