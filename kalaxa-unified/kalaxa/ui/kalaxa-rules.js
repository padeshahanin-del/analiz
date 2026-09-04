/**
 * kalaxa-rules.js — v1.0.0
 * موتور چک استاندارد سه‌سطحی (error / warn / info) روی kitchen_snapshot.
 * قوانین به‌صورت داده تعریف شده‌اند و قابل‌جایگزینی با فایل JSON کاربر هستند.
 * JS خالص، UMD، بدون وابستگی.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaRules = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.1.0';

  // شناسهٔ چک‌هایی که به موقعیت واقعی (world_transform) نیاز دارند — نه فقط ابعاد فیزیکی.
  // وقتی placement کامل نیست، آداپتور world_transform همهٔ کابینت‌ها را {0,0,0} می‌کند
  // (سیاست همه‌یا-هیچ)؛ این چک‌ها بدون آگاهی از این نکته، همان صفرِ مشترک را تداخل/خطای
  // ارتفاع واقعی تعبیر می‌کردند (باگ #9). R4/R5/R6 فقط ابعاد فیزیکی می‌سنجند و از این
  // مشکل مصون‌اند — عمداً در این فهرست نیستند.
  var PLACEMENT_DEPENDENT = ['R1_overlap', 'R2_wall_mount_height', 'R3_counter_gap', 'R7_filler_gap'];

  function fa(n) {
    return String(n).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
  }

  // آستانه‌های پیش‌فرض (میلی‌متر) — قابل override با options.limits
  var DEFAULT_LIMITS = {
    wall_bottom_min: 1350,     // حداقل ارتفاع کف هوایی از زمین
    wall_bottom_max: 1550,     // حداکثر
    counter_gap_min: 450,      // حداقل فاصله کانتر تا زیر هوایی
    counter_gap_max: 750,
    module_step: 50,           // مدول عرض استاندارد
    counter_top_mm: 40         // ضخامت صفحه برای محاسبه خط کانتر
  };

  /* --------------------------------------------------- کمکی: هندسه دیوار */

  function wallGeometry(cabinets) {
    // از ماژول نصب همان منطق، به‌صورت محلی و سبک
    var items = (cabinets || []).map(function (cab) {
      var wt = cab.world_transform || {};
      var o = wt.origin_cm || [0, 0, 0];
      var rot = ((Math.round(wt.rotation_z_deg || 0) % 360) + 360) % 360;
      var rad = rot * Math.PI / 180;
      var s = (o[0] * 10) * Math.cos(rad) + (o[1] * 10) * Math.sin(rad);
      var c = -(o[0] * 10) * Math.sin(rad) + (o[1] * 10) * Math.cos(rad);
      var p = cab.params || {};
      return {
        cab: cab, rot: rot, c: c, s: s, z: o[2] * 10,
        w: (p.cabinet_width || 0) * 10,
        h: (p.cabinet_height || 0) * 10,
        d: (p.cabinet_depth || 0) * 10
      };
    });
    return items;
  }

  function sameWall(a, b) {
    return a.rot === b.rot && Math.abs(a.c - b.c) <= 100;
  }

  /* --------------------------------------------------------------- قوانین */

  var RULES = [

    {
      id: 'R1_overlap',
      severity: 'error',
      title_fa: 'تداخل کابینت‌ها',
      check: function (snapshot, limits, geo) {
        var out = [];
        for (var i = 0; i < geo.length; i++) {
          for (var j = i + 1; j < geo.length; j++) {
            var a = geo[i], b = geo[j];
            if (!sameWall(a, b)) continue;
            var overS = Math.min(a.s + a.w, b.s + b.w) - Math.max(a.s, b.s);
            var overZ = Math.min(a.z + a.h, b.z + b.h) - Math.max(a.z, b.z);
            if (overS > 2 && overZ > 2) {
              out.push({
                cabinet_ids: [a.cab.kalaxa_id, b.cab.kalaxa_id],
                message_fa: 'تداخل «' + a.cab.label_fa + '» با «' + b.cab.label_fa +
                  '» به میزان ' + fa(Math.round(overS)) + '×' + fa(Math.round(overZ)) + ' میلی‌متر'
              });
            }
          }
        }
        return out;
      }
    },

    {
      id: 'R2_wall_mount_height',
      severity: 'warn',
      title_fa: 'ارتفاع نصب کابینت هوایی',
      check: function (snapshot, limits, geo) {
        var out = [];
        geo.forEach(function (g) {
          if ((g.cab.category || '') !== 'wall') return;
          if (g.z < limits.wall_bottom_min || g.z > limits.wall_bottom_max) {
            out.push({
              cabinet_ids: [g.cab.kalaxa_id],
              message_fa: 'کف «' + g.cab.label_fa + '» در ارتفاع ' + fa(Math.round(g.z)) +
                ' — محدوده استاندارد ' + fa(limits.wall_bottom_min) + ' تا ' +
                fa(limits.wall_bottom_max) + ' میلی‌متر'
            });
          }
        });
        return out;
      }
    },

    {
      id: 'R3_counter_gap',
      severity: 'warn',
      title_fa: 'فاصله کانتر تا زیر هوایی',
      check: function (snapshot, limits, geo) {
        var out = [];
        var baseTops = geo.filter(function (g) { return g.cab.category === 'base'; })
          .map(function (g) { return g.z + g.h; });
        if (!baseTops.length) return out;
        var counter = Math.max.apply(null, baseTops) + limits.counter_top_mm;
        geo.forEach(function (g) {
          if (g.cab.category !== 'wall') return;
          var gap = g.z - counter;
          if (gap < limits.counter_gap_min || gap > limits.counter_gap_max) {
            out.push({
              cabinet_ids: [g.cab.kalaxa_id],
              message_fa: 'فاصله کانتر تا زیر «' + g.cab.label_fa + '»: ' +
                fa(Math.round(gap)) + ' — محدوده استاندارد ' +
                fa(limits.counter_gap_min) + ' تا ' + fa(limits.counter_gap_max) + ' میلی‌متر'
            });
          }
        });
        return out;
      }
    },

    {
      id: 'R4_wall_deeper_than_base',
      severity: 'error',
      title_fa: 'عمق هوایی نسبت به زمینی',
      check: function (snapshot, limits, geo) {
        var out = [];
        var baseD = geo.filter(function (g) { return g.cab.category === 'base'; })
          .map(function (g) { return g.d; });
        if (!baseD.length) return out;
        var minBase = Math.min.apply(null, baseD);
        geo.forEach(function (g) {
          if (g.cab.category !== 'wall') return;
          if (g.d >= minBase) {
            out.push({
              cabinet_ids: [g.cab.kalaxa_id],
              message_fa: 'عمق «' + g.cab.label_fa + '» (' + fa(g.d) +
                ') از عمق کابینت زمینی (' + fa(minBase) + ') کمتر نیست — برخورد سر هنگام کار'
            });
          }
        });
        return out;
      }
    },

    {
      id: 'R5_module_width',
      severity: 'info',
      title_fa: 'مدول عرض استاندارد',
      check: function (snapshot, limits, geo) {
        var out = [];
        geo.forEach(function (g) {
          if (g.w > 0 && g.w % limits.module_step !== 0) {
            out.push({
              cabinet_ids: [g.cab.kalaxa_id],
              message_fa: 'عرض «' + g.cab.label_fa + '» (' + fa(g.w) +
                ') خارج از مدول ' + fa(limits.module_step) +
                ' میلی‌متر — یراق و کشو استاندارد ممکن است نخورد'
            });
          }
        });
        return out;
      }
    },

    {
      id: 'R7_filler_gap',
      severity: 'info',
      title_fa: 'گپ نیازمند فیلر',
      check: function (snapshot, limits, geo) {
        var out = [];
        for (var i = 0; i < geo.length; i++) {
          for (var j = 0; j < geo.length; j++) {
            if (i === j) continue;
            var a = geo[i], b = geo[j];
            if (!sameWall(a, b)) continue;
            // هم‌تراز عمودی و b بلافاصله بعد از a
            var overZ = Math.min(a.z + a.h, b.z + b.h) - Math.max(a.z, b.z);
            if (overZ <= 2) continue;
            var gap = b.s - (a.s + a.w);
            if (gap > 5 && gap < 60) {
              out.push({
                cabinet_ids: [a.cab.kalaxa_id, b.cab.kalaxa_id],
                message_fa: 'گپ ' + fa(Math.round(gap)) + ' میلی‌متری بین «' +
                  a.cab.label_fa + '» و «' + b.cab.label_fa + '» — فیلر پیش‌بینی شود'
              });
            }
          }
        }
        return out;
      }
    },

    {
      id: 'R6_empty_cabinet',
      severity: 'warn',
      title_fa: 'کابینت بدون قطعه',
      check: function (snapshot) {
        var counts = {};
        (snapshot.parts_flat || []).forEach(function (p) {
          counts[p.cabinet_id] = (counts[p.cabinet_id] || 0) + 1;
        });
        var out = [];
        (snapshot.cabinets || []).forEach(function (c) {
          if (!counts[c.kalaxa_id]) {
            out.push({
              cabinet_ids: [c.kalaxa_id],
              message_fa: '«' + c.label_fa + '» هیچ قطعه‌ای در parts_flat ندارد — اسکن ناقص؟'
            });
          }
        });
        return out;
      }
    }
  ];

  /* ------------------------------------------------------------------ run */

  /**
   * @param {object} snapshot
   * @param {object} [options] - { limits: {...}, disabled: ['R5_module_width'] }
   * @returns {ok, counts:{error,warn,info}, findings:[{rule_id,severity,title_fa,message_fa,cabinet_ids}]}
   */
  function run(snapshot, options) {
    options = options || {};
    var limits = Object.assign({}, DEFAULT_LIMITS, options.limits || {});
    var disabled = options.disabled || [];
    var geo = wallGeometry(snapshot.cabinets);

    // placement_complete ممکن است در snapshotهای قدیمی‌تر (پیش از این نسخه) اصلاً نباشد؛
    // در آن صورت محافظه‌کارانه true فرض می‌شود تا رفتار قبلی حفظ شود (نه false، که چک‌های
    // معتبر را هم بی‌جهت خاموش می‌کرد).
    var placementComplete = snapshot.placement_complete !== false;
    var skippedPlacementRules = false;

    var findings = [];
    RULES.forEach(function (rule) {
      if (disabled.indexOf(rule.id) !== -1) return;
      if (!placementComplete && PLACEMENT_DEPENDENT.indexOf(rule.id) !== -1) {
        skippedPlacementRules = true;
        return;
      }
      rule.check(snapshot, limits, geo).forEach(function (f) {
        findings.push({
          rule_id: rule.id,
          severity: rule.severity,
          title_fa: rule.title_fa,
          message_fa: f.message_fa,
          cabinet_ids: f.cabinet_ids || []
        });
      });
    });
    if (skippedPlacementRules) {
      findings.push({
        rule_id: 'R0_placement_incomplete',
        severity: 'info',
        title_fa: 'چک‌های وابسته به موقعیت رد شدند',
        message_fa: 'جانمایی هنوز کامل نیست — تداخل، ارتفاع نصب، فاصلهٔ کانتر و گپ فیلر ' +
          'قابل بررسی نیستند (موقعیت واقعی کابینت‌ها هنوز مشخص نشده). ابتدا در تب «جانمایی» ' +
          'همهٔ یونیت‌ها را جای‌گذاری کنید.',
        cabinet_ids: []
      });
    }

    var counts = { error: 0, warn: 0, info: 0 };
    findings.forEach(function (f) { counts[f.severity]++; });

    return { ok: counts.error === 0, counts: counts, findings: findings, limits_used: limits };
  }

  return { VERSION: VERSION, run: run, DEFAULT_LIMITS: DEFAULT_LIMITS };
}));
