/**
 * Kalaxa Template Pack — وارد/صادر کردن بستهٔ تمپلیت
 *
 * کاربر گفت «تمپلیت‌ها را از نت ایمپورت کن و دسته‌بندی کن».
 *
 * دربارهٔ «از نت» باید صریح بود: **کتابخانهٔ آمادهٔ تمپلیت کابینت به شکل
 * ماشین‌خوان در اینترنت وجود ندارد.** آنچه هست یا فایلِ بستهٔ نرم‌افزار
 * تجاری است (رمزگذاری‌شده و لایسنس‌دار) یا PDF کاتالوگ که داده نیست. کپی
 * کردن اولی کار درستی نیست و دومی ماشین‌خوان نیست.
 *
 * کاری که **می‌شود** کرد و دوام دارد: یک قالب مستند برای بستهٔ تمپلیت، تا
 * هر کسی — خود کارگاه، تأمین‌کننده، یا ما — بتواند بسته بسازد و رد و بدل
 * کند. اندازه‌های استانداردِ داخل `data/templates.json` هم از دانش عمومی
 * کارگاهی آمده (مدول‌های رایج آشپزخانه)، نه از کاتالوگ کسی.
 *
 * قید اصلی: تمپلیتی که **موتور نمی‌شناسد** وارد نمی‌شود. وگرنه ردیفی در
 * فهرست می‌آمد که انتخابش خطا می‌داد — و کاربر فکر می‌کرد برنامه خراب است.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KalaxaTemplatePack = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }

  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

  /**
   * اعتبارسنجی یک بسته.
   *
   * @param pack {object} { groups?: {...}, templates: {...} }
   * @param knownTemplates {Array<string>} تمپلیت‌هایی که موتور می‌سازد
   * @returns {{ok, groups, templates, errors, warnings, skipped}}
   */
  function validate(pack, knownTemplates) {
    var errors = [];
    var warnings = [];
    var skipped = [];
    var known = {};
    (knownTemplates || []).forEach(function (t) { known[t] = true; });

    if (!isObj(pack)) {
      return { ok: false, groups: {}, templates: {},
               errors: ['بسته باید یک شیء JSON باشد'], warnings: [], skipped: [] };
    }
    if (!isObj(pack.templates)) {
      return { ok: false, groups: {}, templates: {},
               errors: ['بسته میدان `templates` ندارد'], warnings: [], skipped: [] };
    }

    var groups = {};
    Object.keys(pack.groups || {}).forEach(function (g) {
      var v = pack.groups[g];
      if (!isObj(v) || !v.label_fa) {
        warnings.push('گروه «' + g + '» برچسب فارسی ندارد و نادیده گرفته شد');
        return;
      }
      groups[g] = { label_fa: String(v.label_fa), order: num(v.order) || 99 };
    });

    var templates = {};
    Object.keys(pack.templates).forEach(function (id) {
      var t = pack.templates[id];
      if (!isObj(t)) { skipped.push(id); return; }

      // **قید اصلی**: موتور باید این تمپلیت را بسازد. ردیفی که انتخابش خطا
      // می‌دهد از نبودنش بدتر است.
      if (knownTemplates && !known[id]) {
        skipped.push(id);
        warnings.push('تمپلیت «' + id + '» را این نسخهٔ کالاکسا نمی‌سازد — رد شد');
        return;
      }

      var presets = [];
      (t.presets || []).forEach(function (p, i) {
        var w = num(p.w), h = num(p.h), d = num(p.d);
        if (!(w > 0 && h > 0 && d > 0)) {
          warnings.push('اندازهٔ ' + (i + 1) + ' در «' + id + '» ابعاد معتبر ندارد');
          return;
        }
        presets.push({
          label_fa: String(p.label_fa || (w + '×' + h + '×' + d)),
          w: w, h: h, d: d,
          opts: isObj(p.opts) ? p.opts : undefined
        });
      });

      templates[id] = {
        group: t.group ? String(t.group) : null,
        category: t.category ? String(t.category) : null,
        label_fa: t.label_fa ? String(t.label_fa) : null,
        presets: presets
      };
    });

    if (!Object.keys(templates).length) {
      errors.push('هیچ تمپلیت قابل‌استفاده‌ای در بسته نبود');
    }
    return { ok: !errors.length, groups: groups, templates: templates,
             errors: errors, warnings: warnings, skipped: skipped };
  }

  /**
   * ادغام بسته روی کاتالوگ پایه.
   *
   * بسته **جای** کاتالوگ را نمی‌گیرد؛ رویش می‌نشیند. تمپلیتی که در بسته
   * نیست دست‌نخورده می‌ماند — وگرنه وارد کردن یک بستهٔ کوچک، بقیهٔ فهرست را
   * پاک می‌کرد.
   */
  function merge(base, pack) {
    var out = { groups: {}, templates: {} };
    Object.keys((base || {}).groups || {}).forEach(function (g) {
      out.groups[g] = Object.assign({}, base.groups[g]);
    });
    Object.keys((base || {}).templates || {}).forEach(function (t) {
      out.templates[t] = Object.assign({}, base.templates[t]);
    });

    Object.keys((pack || {}).groups || {}).forEach(function (g) {
      out.groups[g] = Object.assign({}, out.groups[g] || {}, pack.groups[g]);
    });
    Object.keys((pack || {}).templates || {}).forEach(function (t) {
      var incoming = {};
      Object.keys(pack.templates[t]).forEach(function (k) {
        // میدان تهی نباید مقدار موجود را پاک کند: بسته‌ای که فقط اندازه
        // می‌آورد نباید برچسب فارسی را از بین ببرد.
        if (pack.templates[t][k] != null) incoming[k] = pack.templates[t][k];
      });
      out.templates[t] = Object.assign({}, out.templates[t] || {}, incoming);
    });
    return out;
  }

  /** دسته‌بندی برای نمایش: گروه‌ها به ترتیب، هرکدام با تمپلیت‌هایش. */
  function grouped(catalog) {
    var groups = (catalog || {}).groups || {};
    var templates = (catalog || {}).templates || {};
    var byGroup = {};

    Object.keys(templates).forEach(function (id) {
      var g = templates[id].group || 'other';
      (byGroup[g] = byGroup[g] || []).push(Object.assign({ id: id }, templates[id]));
    });

    return Object.keys(byGroup).sort(function (a, b) {
      var oa = (groups[a] || {}).order || 99;
      var ob = (groups[b] || {}).order || 99;
      return oa - ob || (a < b ? -1 : 1);
    }).map(function (g) {
      return {
        id: g,
        label_fa: (groups[g] || {}).label_fa || 'دسته‌بندی‌نشده',
        templates: byGroup[g].sort(function (x, y) {
          return (x.label_fa || x.id) < (y.label_fa || y.id) ? -1 : 1;
        })
      };
    });
  }

  /** خروجی بسته برای رد و بدل کردن. */
  function toPack(catalog) {
    return JSON.stringify({
      kalaxa_template_pack: 1,
      groups: (catalog || {}).groups || {},
      templates: (catalog || {}).templates || {}
    }, null, 2);
  }

  return { VERSION: VERSION, validate: validate, merge: merge,
           grouped: grouped, toPack: toPack };
}));
