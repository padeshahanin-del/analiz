/**
 * kalaxa-price-sheet.js — v1.8.0
 * شیت قیمت کامل پروژه: ورق‌ها، یراق (لولا/ریل)، نوار بدنه/درب، مونتاژ (به‌ازای هر
 * تمپلیت کابینت)، تاج/لب‌چراغ/پاخور (متراژ خودکار از عرض کابینت‌ها)، و مساحت ورق درب‌ها
 * (اطلاعاتی). خروجی: ردیف‌های تخت با کد یکتا — مبنای هم UI هم ورودی/خروجی اکسل (TSV).
 * JS خالص، UMD، بدون وابستگی. برای شمارش ورق/یراق روی خروجی nesting/hwBom موجود
 * تکیه می‌کند تا منطق تکراری نشود؛ فقط بخش‌های تازه (مونتاژ/تریم/مساحت درب) را اضافه می‌کند.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalaxaPriceSheet = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.8.0';
  var DOOR_KEYS = { door: 1, drawer_front: 1 };
  var CATEGORY_FA = { base: 'زمینی', wall: 'هوایی', tall: 'قدی' };

  function r2(n) { return Math.round(n * 100) / 100; }

  // سیاست گردکردن پول — پیش‌تر وجود نداشت و فاکتور مقدار کسری نشان می‌داد
  // (مثلاً ۱۴,۹۳۰,۵۵۸.۲۷ تومان) که در ریال/تومان بی‌معناست.
  //
  // دقت مسئله نبود: بدترین حالت واگرایی روی ۵۰۰ ردیف، ۲٫۵ تومان است (۰٫۰۰۰۵٪) —
  // پس «integer برای پول» این‌جا حل مسئلهٔ واقعی نیست. مسئله این است که
  // واحد نمایش تعریف نشده بود.
  //
  // step = کوچک‌ترین واحد معنادار (پیش‌فرض ۱ تومان؛ ۰ یعنی بدون گردکردن).
  // کارگاهی که تا هزار تومان گرد می‌کند، step را ۱۰۰۰ می‌گذارد.
  var DEFAULT_MONEY_STEP = 1;

  function makeMoneyRounder(cfg) {
    var step = (cfg && typeof cfg.money_rounding_step === 'number' &&
                isFinite(cfg.money_rounding_step) && cfg.money_rounding_step >= 0)
      ? cfg.money_rounding_step : DEFAULT_MONEY_STEP;
    if (step <= 0) return function (n) { return r2(n); };
    return function (n) {
      if (typeof n !== 'number' || !isFinite(n)) return n;
      // نیم از صفر دور — همان انتظار انسانی از گردکردن قیمت.
      return n < 0 ? -(Math.round(-n / step) * step) : Math.round(n / step) * step;
    };
  }
  function fa(n) {
    return String(n).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
  }
  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }

  /**
   * متراژ خام تاج/لب‌چراغ/پاخور از جمع عرض کابینت‌ها به‌ازای دسته.
   * فرض ساده‌شده: بدون کسر تداخل گوشه‌ها (هشدار در UI نشان داده می‌شود).
   * تاج/لب‌چراغ: جمع عرض کابینت‌های هوایی؛ پاخور: جمع عرض کابینت‌های زمینی+قدی.
   */
  function trimMeters(snapshot) {
    var wallW = 0, floorW = 0;
    (snapshot.cabinets || []).forEach(function (c) {
      var w = num(c.params && c.params.cabinet_width) * 10; // cm → mm
      if (c.category === 'wall') wallW += w;
      else if (c.category === 'base' || c.category === 'tall') floorW += w;
    });
    return { crown_m: r2(wallW / 1000), light_rail_m: r2(wallW / 1000), kick_m: r2(floorW / 1000) };
  }

  /**
   * تکه‌های واقعی برای نستینگ یک‌بعدی (هر کابینت = یک تکه‌ای که باید از شاخهٔ استاندارد
   * بریده شود) — مبنای محاسبهٔ تعداد شاخهٔ واقعی به‌جای «متراژ خام».
   * تاج/لب‌چراغ از عرض کابینت‌های هوایی، پاخور از عرض کابینت‌های زمینی+قدی.
   */
  function trimSegments(snapshot) {
    var wall = [], floor = [];
    (snapshot.cabinets || []).forEach(function (c) {
      var w = num(c.params && c.params.cabinet_width) * 10;
      if (!w) return;
      var seg = { id: c.kalaxa_id, label_fa: c.label_fa || c.kalaxa_id, length_mm: w, qty: 1 };
      if (c.category === 'wall') wall.push(seg);
      else if (c.category === 'base' || c.category === 'tall') floor.push(seg);
    });
    return { wall: wall, floor: floor };
  }

  /** متراژ نوار به تفکیک نقش (بدنه/درب) — همان ریاضی KalaxaReport.edgeBanding، جدا بر اساس نقش. */
  function edgeMetersByRole(snapshot) {
    var m = { body: 0, door: 0 };
    (snapshot.parts_flat || []).forEach(function (p) {
      var e = p.edge || {};
      var lenEdges = (e.front || 0) + (e.back || 0);
      var widEdges = (e.top || 0) + (e.bottom || 0);
      var mm = p.count * (lenEdges * p.cut_length_mm + widEdges * p.cut_width_mm);
      if (!mm) return;
      var role = DOOR_KEYS[p.key] ? 'door' : 'body';
      m[role] += mm;
    });
    return { body_m: r2(m.body / 1000), door_m: r2(m.door / 1000) };
  }

  /** مساحت خالص ورق درب‌ها به تفکیک sheet_id — اطلاعاتی (بدون قیمت مستقل؛ داخل قیمت ورق است). */
  function doorAreaBySheet(snapshot) {
    var by = {};
    (snapshot.parts_flat || []).forEach(function (p) {
      if (!DOOR_KEYS[p.key]) return;
      var m2 = p.count * p.cut_length_mm * p.cut_width_mm / 1e6;
      by[p.sheet_id] = (by[p.sheet_id] || 0) + m2;
    });
    return Object.keys(by).sort().map(function (id) { return { sheet_id: id, area_m2: r2(by[id]) }; });
  }

  /** کلید گروه‌بندی مونتاژ برای یک کابینت: تمپلیت اگر باشد، وگرنه دسته. */
  function assemblyKey(c) {
    return (c.template_id && String(c.template_id).trim()) || 'دستهٔ ' + (CATEGORY_FA[c.category] || c.category || '—');
  }

  /**
   * ساخت شیت قیمت کامل.
   * @param {object} snapshot
   * @param {object} nesting - خروجی KalaxaNesting.run (برای by_sheet_type)
   * @param {object} hwBom - خروجی KalaxaHardware.bom (برای items)
   * @param {object} priceCfg - { currency, sheets:{sheet_id:p}, hardware:{item_id:p},
   *   edge_body_per_m, edge_door_per_m, assembly:{key:p},
   *   trim:{crown_per_m,light_rail_per_m,kick_per_m,
   *         crown_bar_length_mm,crown_price_per_bar,crown_kerf_mm, ...به همین قرارداد برای light_rail/kick} }
   *   وقتی `<cat>_bar_length_mm` تنظیم باشد، به‌جای «متراژ خام»، نستینگ یک‌بعدی واقعی
   *   (KalaxaLinearNesting، اگر تزریق شده باشد) تعداد شاخهٔ واقعی را حساب می‌کند.
   * @param {object} [linearNesting] - ماژول KalaxaLinearNesting (اختیاری؛ تزریق‌شونده تا این فایل
   *   وابستگی سخت به فایل دیگر نداشته باشد — همان الگوی بدون‌وابستگی بقیهٔ پروژه)
   * @param {object} [doorProfile] - ماژول KalaxaDoorProfile (اختیاری). priceCfg.door_profile:
   *   { door_types:[...], plain_bar_length_mm, plain_price_per_bar, plain_kerf_mm,
   *     handle_bar_length_mm, handle_price_per_bar, handle_kerf_mm }
   * @param {object} [wallRail] - ماژول KalaxaWallRail (اختیاری). priceCfg.wall_rail:
   *   { plain_bar_length_mm, plain_price_per_bar, plain_kerf_mm,
   *     edged_bar_length_mm, edged_price_per_bar, edged_kerf_mm,
   *     kits: {blum:price, fantoni:price, meleni:price} } — کیت برند مثل مونتاژ، به‌ازای هر کمد
   * @param {object} [moulding] - ماژول KalaxaMoulding (اختیاری). priceCfg.moulding:
   *   { boards: [{id,label_fa,length_mm,width_mm,returns}], bar_length_mm, price_per_bar, kerf_mm }
   *   boards ورودی دستی کاربر است؛ اگر ابزار «افزودن صفحه/قرنیز» در اسکچاپ استفاده شده
   *   باشد، snapshot.moulding_boards (کشف‌شده از مدل) هم با همین آرایه ادغام می‌شود.
   * @param {object} [edgeRoll] - ماژول KalaxaEdgeRoll (اختیاری). priceCfg.edge_roll:
   *   { waste_mm, body_price_per_m, door_price_per_m } — مصرف واقعی رول + افت هر برش
   *   (پیش‌فرض ۵۰mm)، جدا از گروه «نوار لبه» متری/برش‌خورده‌ی موجود.
   * @param {object} [trimRules] - ماژول KalaxaTrimRules (اختیاری). priceCfg.trim_rules:
   *   { runs: [{id,category,label_fa,cabinet_ids:[...],corners,deduction_mm}], default_deduction_mm }
   *   قانون طراحی «ران» — طول واقعی تاج/لب‌چراغ/پاخور با کسر گوشه؛ خالی = متراژ خام قدیمی.
   * @returns {{ groups: [{key,label_fa,rows:[{code,label_fa,qty,unit,unit_price,cost}]}],
   *             total, currency, new_assembly_keys: [string], warnings: [string] }}
   */
  function build(snapshot, nesting, hwBom, priceCfg, linearNesting, doorProfile, wallRail, moulding, edgeRoll, trimRules) {
    priceCfg = priceCfg || {};
    var currency = priceCfg.currency || 'تومان';
    var sheetsPrice = priceCfg.sheets || {};
    var hwPrice = priceCfg.hardware || {};
    var assemblyPrice = priceCfg.assembly || {};
    var trimPrice = priceCfg.trim || {};
    var edgeBodyPrice = num(priceCfg.edge_body_per_m);
    var edgeDoorPrice = num(priceCfg.edge_door_per_m);

    var money = makeMoneyRounder(priceCfg);

    var groups = [];
    var total = 0;
    // جمع کل روی **همان مقداری که نمایش داده می‌شود** جمع می‌شود، نه روی مقدار
    // خام. پیش‌تر total خام جمع می‌شد و هر ردیف گردشده نشان داده می‌شد — یعنی
    // فاکتور می‌توانست با جمع ردیف‌های خودش نخواند. حالا مساوات ساختاری است.
    function row(code, label_fa, qty, unit, unitPrice, cost) {
      var shown = cost == null ? null : money(cost);
      if (shown != null) total += shown;
      return { code: code, label_fa: label_fa, qty: qty, unit: unit,
               unit_price: unitPrice, cost: shown };
    }

    // --- ورق‌ها — از فهرست تعریف‌شدهٔ تنظیمات (نه فقط ورق‌های استفاده‌شده در نستینگ)،
    // تا ورق تازه‌اضافه‌شده که هنوز به هیچ قطعه‌ای وصل نیست هم بشود از حالا قیمتش را ثبت کرد.
    var nestBySheet = {};
    ((nesting || {}).by_sheet_type || []).forEach(function (g) { nestBySheet[g.sheet_id] = g; });
    var definedSheets = (snapshot.sheets || []).map(function (s) { return s.sheet_id; });
    // ورقی که در نستینگ آمده ولی به هر دلیل در snapshot.sheets نیست هم از قلم نیفتد
    Object.keys(nestBySheet).forEach(function (id) { if (definedSheets.indexOf(id) === -1) definedSheets.push(id); });
    var sheetRows = definedSheets.map(function (id) {
      var g = nestBySheet[id];
      var qty = g ? g.sheets_used : 0;
      var up = num(sheetsPrice[id]);
      return row(id, 'ورق ' + id, qty, 'ورق', up, up * qty);
    });
    groups.push({ key: 'sheet', label_fa: 'ورق‌ها', rows: sheetRows });

    // --- مساحت ورق درب‌ها (اطلاعاتی) ---
    var doorAreaRows = doorAreaBySheet(snapshot).map(function (d) {
      return row('door_area:' + d.sheet_id, 'مساحت ورق درب — ' + d.sheet_id, d.area_m2, 'm²', null, null);
    });
    groups.push({ key: 'info', label_fa: 'مساحت ورق درب‌ها (اطلاعاتی — داخل قیمت ورق محاسبه شده)', rows: doorAreaRows });

    // --- یراق (لولا/ریل/دستگیره/پایه/...) از BOM موجود ---
    var hwRows = ((hwBom || {}).items || []).map(function (it) {
      var up = num(hwPrice[it.item_id]);
      return row(it.item_id, it.name_fa, it.qty, it.unit, up, up * it.qty);
    });
    groups.push({ key: 'hardware', label_fa: 'یراق', rows: hwRows });

    // --- نوار بدنه/درب ---
    var em = edgeMetersByRole(snapshot);
    var edgeRows = [];
    if (em.body_m > 0) edgeRows.push(row('edge_body', 'نوار بدنه', em.body_m, 'متر', edgeBodyPrice, edgeBodyPrice * em.body_m));
    if (em.door_m > 0) edgeRows.push(row('edge_door', 'نوار درب', em.door_m, 'متر', edgeDoorPrice, edgeDoorPrice * em.door_m));
    groups.push({ key: 'edge', label_fa: 'نوار لبه', rows: edgeRows });

    // --- مونتاژ به‌ازای هر تمپلیت/دستهٔ کابینت — کلید پایدار، قیمت یک‌بار وارد و نگه داشته می‌شود ---
    var asmQty = {}, asmLabel = {};
    var newAssemblyKeys = [];
    (snapshot.cabinets || []).forEach(function (c) {
      var k = assemblyKey(c);
      asmQty[k] = (asmQty[k] || 0) + 1;
      asmLabel[k] = c.template_id ? (c.label_fa || k) : k;
      if (!(k in assemblyPrice)) newAssemblyKeys.push(k);
    });
    var asmRows = Object.keys(asmQty).sort().map(function (k) {
      var up = num(assemblyPrice[k]);
      return row('assembly:' + k, 'مونتاژ — ' + asmLabel[k], asmQty[k], 'یونیت', up, up * asmQty[k]);
    });
    groups.push({ key: 'assembly', label_fa: 'مونتاژ', rows: asmRows });

    // --- تاج / لب‌چراغ / پاخور — نستینگ یک‌بعدی واقعی اگر طول شاخهٔ استاندارد تنظیم شده
    // باشد (تعداد شاخهٔ واقعی + پرت واقعی)، وگرنه متراژ خام قدیمی (سازگاری عقب‌رو) ---
    var warnings = [];
    var tm = trimMeters(snapshot);
    var segs = trimSegments(snapshot);
    var trimRows = [];

    // اگر ران‌های قانون طراحی تعریف شده باشند (priceCfg.trim_rules.runs)، طول واقعی از آن‌ها
    // می‌آید (با کسر گوشه) — وگرنه همان متراژ خام قدیمی (سازگاری عقب‌رو کامل).
    var trimRulesCfg = priceCfg.trim_rules || {};
    var trimRulesRes = null;
    if (trimRules && typeof trimRules.computeRuns === 'function' && (trimRulesCfg.runs || []).length) {
      trimRulesRes = trimRules.computeRuns(snapshot.cabinets, trimRulesCfg.runs, trimRulesCfg.default_deduction_mm);
      (trimRulesRes.warnings || []).forEach(function (w) { warnings.push('ران تاج/لب‌چراغ/پاخور — ' + w); });
    }
    function trimKindData(kind, fallbackMeter, fallbackSegs) {
      if (trimRulesRes && trimRulesRes.segments[kind].length) {
        var segList = trimRulesRes.segments[kind];
        var meterVal = r2(segList.reduce(function (s, x) { return s + x.length_mm; }, 0) / 1000);
        return { meterVal: meterVal, segList: segList };
      }
      return { meterVal: fallbackMeter, segList: fallbackSegs };
    }

    function trimRow(code, label_fa, meterVal, segList) {
      if (meterVal <= 0) return;
      var barLen = num(trimPrice[code + '_bar_length_mm']);
      if (barLen > 0 && linearNesting && typeof linearNesting.run === 'function') {
        var res = linearNesting.run(segList, {
          bar_length_mm: barLen,
          kerf_mm: trimPrice[code + '_kerf_mm'] != null ? num(trimPrice[code + '_kerf_mm']) : undefined
        });
        if (res.ok) {
          var upBar = num(trimPrice[code + '_price_per_bar']);
          trimRows.push(row(code, label_fa, res.total_bars, 'شاخه', upBar, upBar * res.total_bars));
          if (res.oversized.length) {
            warnings.push(label_fa + ': ' + res.oversized.length + ' کابینت بلندتر از شاخهٔ استاندارد (' +
              res.oversized.map(function (o) { return o.label_fa; }).join('، ') + ') — دستی بررسی شود');
          }
          return;
        }
        warnings.push(label_fa + ': نستینگ شاخه ناموفق (' + res.error + ') — به متراژ خام برگشت شد');
      }
      var upM = num(trimPrice[code + '_per_m']);
      trimRows.push(row(code, label_fa, meterVal, 'متر', upM, upM * meterVal));
    }
    var crownData = trimKindData('crown', tm.crown_m, segs.wall);
    var lightRailData = trimKindData('light_rail', tm.light_rail_m, segs.wall);
    var kickData = trimKindData('kick', tm.kick_m, segs.floor);
    trimRow('crown', 'تاج', crownData.meterVal, crownData.segList);
    trimRow('light_rail', 'لب‌چراغ', lightRailData.meterVal, lightRailData.segList);
    trimRow('kick', 'پاخور', kickData.meterVal, kickData.segList);
    var trimGroupLabel = trimRulesRes
      ? 'تاج / لب‌چراغ / پاخور (طول واقعی از ران‌های تعریف‌شده — کسر گوشه اعمال شد)'
      : 'تاج / لب‌چراغ / پاخور (متراژ خام — تداخل گوشه کسر نشده)';
    groups.push({ key: 'trim', label_fa: trimGroupLabel, rows: trimRows });

    // --- پروفیل درب آلومینیومی/شیشه‌ای — ۳ ضلع ساده + ۱ ضلع دستگیره‌دار، دو SKU جدا ---
    var dpCfg = priceCfg.door_profile || {};
    var dpRows = [];
    if (doorProfile && typeof doorProfile.segments === 'function') {
      var dp = doorProfile.segments(snapshot, dpCfg.door_types);
      if (dp.door_count > 0) {
        function doorProfileRow(code, label_fa, segList, barKey, priceKey, kerfKey) {
          if (!segList.length) return;
          var barLen = num(dpCfg[barKey]);
          if (barLen <= 0 || !linearNesting || typeof linearNesting.run !== 'function') {
            dpRows.push(row(code, label_fa, segList.length, 'قطعه', null, null)); // اطلاعاتی تا پیکربندی شود
            return;
          }
          var res = linearNesting.run(segList, { bar_length_mm: barLen,
            kerf_mm: dpCfg[kerfKey] != null ? num(dpCfg[kerfKey]) : undefined });
          if (!res.ok) {
            warnings.push(label_fa + ': نستینگ ناموفق (' + res.error + ')');
            dpRows.push(row(code, label_fa, segList.length, 'قطعه', null, null));
            return;
          }
          var up = num(dpCfg[priceKey]);
          dpRows.push(row(code, label_fa, res.total_bars, 'شاخه', up, up * res.total_bars));
          if (res.oversized.length) {
            warnings.push(label_fa + ': ' + res.oversized.length + ' قطعه بلندتر از شاخهٔ استاندارد — دستی بررسی شود');
          }
        }
        doorProfileRow('door_profile_plain', 'پروفیل درب آلومینیومی — بدون دستگیره', dp.plain,
          'plain_bar_length_mm', 'plain_price_per_bar', 'plain_kerf_mm');
        doorProfileRow('door_profile_handle', 'پروفیل درب آلومینیومی — سمت دستگیره', dp.handle,
          'handle_bar_length_mm', 'handle_price_per_bar', 'handle_kerf_mm');
        if (dp.unknown_swing_count > 0) {
          warnings.push(fa(dp.unknown_swing_count) + ' درب آلومینیومی بدون door_swing — سمت دستگیره ' +
            'نامشخص ماند، همهٔ ستون‌ها «ساده» حساب شد (بررسی دستی لازم است)');
        }
      }
    }
    groups.push({ key: 'door_profile', label_fa: 'پروفیل درب آلومینیومی/شیشه‌ای', rows: dpRows });

    // --- ریل کمد دیواری — ریل عمومی برشی (ساده/لبه‌دار) + کیت مکانیزم برند (قیمت ثابت هر کمد) ---
    var wrCfg = priceCfg.wall_rail || {};
    var wrRows = [];
    if (wallRail && typeof wallRail.collect === 'function') {
      var wr = wallRail.collect(snapshot);
      function railCutRow(code, label_fa, segList, barKey, priceKey, kerfKey) {
        if (!segList.length) return;
        var barLen = num(wrCfg[barKey]);
        if (barLen > 0 && linearNesting && typeof linearNesting.run === 'function') {
          var res = linearNesting.run(segList, { bar_length_mm: barLen,
            kerf_mm: wrCfg[kerfKey] != null ? num(wrCfg[kerfKey]) : undefined });
          if (res.ok) {
            var up = num(wrCfg[priceKey]);
            wrRows.push(row(code, label_fa, res.total_bars, 'شاخه', up, up * res.total_bars));
            if (res.oversized.length) {
              warnings.push(label_fa + ': ' + res.oversized.length + ' کمد بلندتر از شاخهٔ استاندارد — دستی بررسی شود');
            }
            return;
          }
          warnings.push(label_fa + ': نستینگ ناموفق (' + res.error + ')');
        }
        wrRows.push(row(code, label_fa, segList.length, 'قطعه', null, null)); // اطلاعاتی تا پیکربندی شود
      }
      railCutRow('wall_rail_plain', 'ریل کمد دیواری — ساده', wr.cut.plain,
        'plain_bar_length_mm', 'plain_price_per_bar', 'plain_kerf_mm');
      railCutRow('wall_rail_edged', 'ریل کمد دیواری — لبه‌دار', wr.cut.edged,
        'edged_bar_length_mm', 'edged_price_per_bar', 'edged_kerf_mm');

      var kitPrices = wrCfg.kits || {};
      Object.keys(wr.kits).sort().forEach(function (brand) {
        var qty = wr.kits[brand];
        var up = num(kitPrices[brand]);
        var label_fa = 'مکانیزم ' + (wallRail.KIT_BRANDS[brand] || brand);
        wrRows.push(row('wall_rail_kit:' + brand, label_fa, qty, 'کمد', up, up * qty));
      });
    }
    groups.push({ key: 'wall_rail', label_fa: 'ریل کمد دیواری', rows: wrRows });

    // --- قرنیز/مولدینگ مستقل — از صفحات کشف‌شده در مدل (snapshot.moulding_boards، اگر
    // با ابزار «افزودن صفحه/قرنیز» ساخته شده باشند) + صفحات واردشدهٔ دستی کاربر ---
    var mldCfg = priceCfg.moulding || {};
    var mldRows = [];
    if (moulding && typeof moulding.segments === 'function') {
      var mldBoards = (snapshot.moulding_boards || []).concat(mldCfg.boards || []);
      var mldSegs = moulding.segments(mldBoards);
      if (mldSegs.length) {
        var mldBarLen = num(mldCfg.bar_length_mm);
        if (mldBarLen > 0 && linearNesting && typeof linearNesting.run === 'function') {
          var mldRes = linearNesting.run(mldSegs, { bar_length_mm: mldBarLen,
            kerf_mm: mldCfg.kerf_mm != null ? num(mldCfg.kerf_mm) : undefined });
          if (mldRes.ok) {
            var mldUp = num(mldCfg.price_per_bar);
            mldRows.push(row('moulding', 'قرنیز/مولدینگ مستقل', mldRes.total_bars, 'شاخه', mldUp, mldUp * mldRes.total_bars));
            if (mldRes.oversized.length) {
              warnings.push('قرنیز/مولدینگ: ' + mldRes.oversized.length + ' قطعه بلندتر از شاخهٔ استاندارد — دستی بررسی شود');
            }
          } else {
            warnings.push('قرنیز/مولدینگ: نستینگ ناموفق (' + mldRes.error + ')');
            mldRows.push(row('moulding', 'قرنیز/مولدینگ مستقل', mldSegs.length, 'قطعه', null, null));
          }
        } else {
          mldRows.push(row('moulding', 'قرنیز/مولدینگ مستقل', mldSegs.length, 'قطعه', null, null));
        }
      }
    }
    groups.push({ key: 'moulding', label_fa: 'قرنیز/مولدینگ مستقل (از صفحات واردشدهٔ دستی)', rows: mldRows });

    // --- نوار لبهٔ رولی — مصرف واقعی + افت هر برش (طبق گفتهٔ کاربر، پیش‌فرض ۵۰mm) ---
    var erCfg = priceCfg.edge_roll || {};
    var erRows = [];
    if (edgeRoll && typeof edgeRoll.consumption === 'function') {
      var erWaste = erCfg.waste_mm != null ? num(erCfg.waste_mm) : undefined;
      var er = edgeRoll.consumption(snapshot, erWaste);
      var erBodyUp = num(erCfg.body_price_per_m);
      var erDoorUp = num(erCfg.door_price_per_m);
      if (er.body_m > 0) erRows.push(row('edge_roll_body', 'نوار لبهٔ رولی — بدنه', er.body_m, 'متر', erBodyUp, erBodyUp * er.body_m));
      if (er.door_m > 0) erRows.push(row('edge_roll_door', 'نوار لبهٔ رولی — درب', er.door_m, 'متر', erDoorUp, erDoorUp * er.door_m));
    }
    groups.push({ key: 'edge_roll', label_fa: 'نوار لبهٔ رولی (مصرف واقعی + افت هر برش)', rows: erRows });

    return { groups: groups, total: money(total), currency: currency,
             new_assembly_keys: newAssemblyKeys, warnings: warnings };
  }

  /** همهٔ ردیف‌های قابل قیمت‌گذاری (بدون گروه info) — مبنای اکسپورت اکسل. */
  function priceableRows(sheetResult) {
    var out = [];
    sheetResult.groups.forEach(function (g) {
      if (g.key === 'info') return;
      g.rows.forEach(function (r) { out.push(r); });
    });
    return out;
  }

  /** اکسپورت TSV برای کپی به اکسل: کد، عنوان، تعداد، قیمت واحد فعلی. */
  function exportTSV(sheetResult) {
    var lines = ['کد\tعنوان\tتعداد\tقیمت واحد'];
    priceableRows(sheetResult).forEach(function (r) {
      lines.push([r.code, r.label_fa, r.qty, r.unit_price || 0].join('\t'));
    });
    return lines.join('\n');
  }

  /**
   * وارد کردن TSV/CSV چسبانده‌شده از اکسل — ستون اول کد، ستون آخر عدد قیمت.
   * ردیف‌های نامعتبر/کد ناشناخته نادیده گرفته می‌شوند (در unmatched برمی‌گردند، نه throw).
   * @returns {{ prices: {code:number}, unmatched: [string] }}
   */
  function parsePastedTable(text, knownCodes) {
    var known = {};
    (knownCodes || []).forEach(function (c) { known[c] = true; });
    var prices = {}, unmatched = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      var cells = line.indexOf('\t') !== -1 ? line.split('\t') : line.split(',');
      if (cells.length < 2) return;
      var code = cells[0].trim();
      var priceRaw = cells[cells.length - 1].trim().replace(/,/g, '');
      if (code === 'کد' || code.toLowerCase() === 'code') return; // ردیف هدر
      var p = parseFloat(priceRaw);
      if (!isFinite(p)) return;
      if (known[code]) prices[code] = p; else unmatched.push(code);
    });
    return { prices: prices, unmatched: unmatched };
  }

  return { VERSION: VERSION, build: build, priceableRows: priceableRows,
           exportTSV: exportTSV, parsePastedTable: parsePastedTable,
           trimMeters: trimMeters, trimSegments: trimSegments, edgeMetersByRole: edgeMetersByRole,
           doorAreaBySheet: doorAreaBySheet, assemblyKey: assemblyKey };
}));
