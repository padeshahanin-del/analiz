/** تست شیت قیمت کامل — node test_price_sheet.js */
'use strict';
const path = require('path');
const fs = require('fs');
const UI = path.join(__dirname, '..', '..', 'ui');
const PS = require(path.join(UI, 'kalaxa-price-sheet.js'));
const Nesting = require(path.join(UI, 'kalaxa-nesting.js'));
const Hardware = require(path.join(UI, 'kalaxa-hardware.js'));
const Settings = require(path.join(UI, 'kalaxa-settings.js'));
const LinearNesting = require(path.join(UI, 'kalaxa-linear-nesting.js'));
const DoorProfile = require(path.join(UI, 'kalaxa-door-profile.js'));
const WallRail = require(path.join(UI, 'kalaxa-wall-rail.js'));
const Moulding = require(path.join(UI, 'kalaxa-moulding.js'));
const EdgeRoll = require(path.join(UI, 'kalaxa-edge-roll.js'));
const TrimRules = require(path.join(UI, 'kalaxa-trim-rules.js'));

const snapshot = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'golden_kitchen_snapshot.json'), 'utf8'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

const nesting = Nesting.run(snapshot);
const hwBom = Hardware.bom(snapshot);

console.log('\n[trimMeters — تاج/لب‌چراغ/پاخور از عرض کابینت‌ها]');
{
  const tm = PS.trimMeters(snapshot);
  // wall: cab-004 (80cm=800mm) → crown/light_rail = 0.8m
  assert(tm.crown_m === 0.8 && tm.light_rail_m === 0.8, 'کابینت هوایی ۸۰cm → تاج/لب‌چراغ ۰٫۸ متر', JSON.stringify(tm));
  // base+tall: 80+60+100+60 = 300cm = 3m
  assert(tm.kick_m === 3, 'زمینی+قدی جمعاً ۳۰۰cm → پاخور ۳ متر', JSON.stringify(tm));
}

console.log('\n[edgeMetersByRole — تفکیک نوار بدنه/درب]');
{
  const em = PS.edgeMetersByRole(snapshot);
  assert(em.body_m > 0, 'نوار بدنه بیشتر از صفر');
  assert(em.door_m > 0, 'نوار درب بیشتر از صفر');
  const bodyDoorParts = snapshot.parts_flat.filter(p => p.key === 'door' || p.key === 'drawer_front');
  assert(bodyDoorParts.some(p => p.edge && Object.values(p.edge).some(Boolean)),
    'واقعاً قطعهٔ درب‌دار با لبه در fixture هست (پیش‌شرط تست)');
}

console.log('\n[doorAreaBySheet — اطلاعاتی]');
{
  const areas = PS.doorAreaBySheet(snapshot);
  assert(areas.length > 0, 'حداقل یک ردیف مساحت درب');
  assert(areas.every(a => a.area_m2 > 0), 'همهٔ مساحت‌ها مثبت');
}

console.log('\n[assemblyKey — کلید پایدار به‌ازای تمپلیت]');
{
  assert(PS.assemblyKey({ template_id: 'base_single_door' }) === 'base_single_door', 'تمپلیت دارد → خودش کلید است');
  assert(PS.assemblyKey({ category: 'wall' }).indexOf('هوایی') !== -1, 'بدون تمپلیت → بر اساس دسته');
}

console.log('\n[build — بدون priceCfg: qty درست، cost صفر]');
{
  const r = PS.build(snapshot, nesting, hwBom, null);
  const sheetGroup = r.groups.find(g => g.key === 'sheet');
  assert(sheetGroup.rows.length === snapshot.sheets.length,
    'تعداد ردیف ورق = تعداد ورق‌های تعریف‌شده در تنظیمات (نه فقط استفاده‌شده در nesting)');
  assert(sheetGroup.rows.every(row => row.cost === 0), 'بدون قیمت → هزینه صفر (نه null)');
  const asmGroup = r.groups.find(g => g.key === 'assembly');
  assert(asmGroup.rows.length === 5, '۵ کابینت طلایی → ۵ ردیف مونتاژ (همه تمپلیت‌های متفاوت)',
    String(asmGroup.rows.length));
  assert(asmGroup.rows.every(row => row.qty === 1), 'هر تمپلیت یک‌بار آمده → qty=1');
  assert(r.new_assembly_keys.length === 5, 'همهٔ ۵ کلید مونتاژ به‌عنوان «تازه» گزارش شدند (چون priceCfg خالی بود)');
  assert(r.total === 0, 'جمع کل صفر بدون قیمت');
}

console.log('\n[build — با priceCfg کامل: محاسبهٔ هزینه]');
{
  const cfg = {
    currency: 'تومان',
    sheets: { mdf_white_16: 1000000, mdf_door_16: 1500000 },
    hardware: { hinge: 50000, slide_500: 120000 },
    edge_body_per_m: 20000, edge_door_per_m: 30000,
    assembly: { base_single_door: 300000, base_three_drawer: 350000 },
    trim: { crown_per_m: 200000, light_rail_per_m: 100000, kick_per_m: 80000 }
  };
  const r = PS.build(snapshot, nesting, hwBom, cfg);
  const sheetRow = r.groups.find(g => g.key === 'sheet').rows.find(x => x.code === 'mdf_white_16');
  assert(sheetRow.cost === sheetRow.qty * 1000000, 'هزینهٔ ورق = تعداد × قیمت واحد');

  const asmGroup = r.groups.find(g => g.key === 'assembly');
  const asmBase = asmGroup.rows.find(x => x.code === 'assembly:base_single_door');
  assert(asmBase.cost === 300000, 'هزینهٔ مونتاژ تمپلیت قیمت‌گذاری‌شده درست');
  const asmUnknown = asmGroup.rows.find(x => x.code === 'assembly:base_sink_double_door');
  assert(asmUnknown.cost === 0, 'تمپلیت بی‌قیمت → هزینه صفر (نه خطا)');
  assert(r.new_assembly_keys.indexOf('base_sink_double_door') !== -1,
    'تمپلیت بی‌قیمت در new_assembly_keys گزارش می‌شود تا کاربر پر کند');
  assert(r.new_assembly_keys.indexOf('base_single_door') === -1,
    'تمپلیت قبلاً قیمت‌گذاری‌شده دیگر «تازه» نیست — یک‌بار می‌پرسد، نه هربار');

  const trimGroup = r.groups.find(g => g.key === 'trim');
  const crown = trimGroup.rows.find(x => x.code === 'crown');
  assert(crown.cost === 0.8 * 200000, 'هزینهٔ تاج = متراژ × قیمت متر');

  assert(r.total > 0, 'جمع کل مثبت است');
  const manualSum = PS.priceableRows(r).reduce((s, x) => s + (x.cost || 0), 0);
  assert(Math.abs(manualSum - r.total) < 0.01, 'جمع کل = مجموع تک‌تک ردیف‌های قیمت‌گذاری‌شده', manualSum + ' vs ' + r.total);
}

console.log('\n[ورق تازه‌اضافه‌شده بدون هیچ قطعه — باید در شیت قیمت باشد با qty=0]');
{
  // شبیه‌سازی «+ افزودن ورق» در تب تنظیمات: ورق تازه، هنوز به هیچ نقشی (بدنه/درب/...) وصل نیست
  const s2 = JSON.parse(JSON.stringify(snapshot));
  s2.sheets.push({ sheet_id: 'رنگی_جدید', material: 'رنگی_جدید', color_code: '', thickness_mm: 16,
    width_mm: 3660, height_mm: 1830, has_grain: false, price_per_sheet: 0, trim_margin_mm: 10 });
  const r = PS.build(s2, nesting, hwBom, null); // nesting قدیمی — این ورق در آن نیست (دقیقاً سناریوی واقعی)
  const sheetGroup = r.groups.find(g => g.key === 'sheet');
  const newRow = sheetGroup.rows.find(x => x.code === 'رنگی_جدید');
  assert(!!newRow, 'ورق تازه در لیست «ورق‌ها» ظاهر می‌شود', sheetGroup.rows.map(x => x.code).join(','));
  assert(newRow.qty === 0, 'تعداد آن صفر است (هنوز استفاده نشده)');
  assert(newRow.cost === 0 && newRow.unit_price === 0, 'قیمت‌پذیر است (نه اطلاعاتی) — می‌شود از حالا برایش قیمت گذاشت');
  assert(sheetGroup.rows.length === s2.sheets.length, 'تعداد ردیف با تعداد ورق‌های تعریف‌شدهٔ جدید هماهنگ شد');

  // بعد از این‌که کاربر برایش قیمت می‌گذارد، باید در جمع کل هم لحاظ شود حتی با qty=0? نه —
  // qty=0 یعنی هزینهٔ صفر (هنوز خریداری نمی‌شود)، ولی قیمت واحد ذخیره و در دفعهٔ بعد که استفاده شود اعمال می‌شود
  const cfg = { sheets: { 'رنگی_جدید': 500000 } };
  const r2 = PS.build(s2, nesting, hwBom, cfg);
  const row2 = r2.groups.find(g => g.key === 'sheet').rows.find(x => x.code === 'رنگی_جدید');
  assert(row2.unit_price === 500000 && row2.cost === 0, 'قیمت واحد ثبت می‌شود؛ هزینه هنوز صفر چون qty=0');
}

console.log('\n[نستینگ یک‌بعدی واقعی برای تاج/پاخور — وقتی bar_length_mm تنظیم شود]');
{
  const cfgNaive = { trim: { crown_per_m: 200000 } }; // بدون bar_length_mm → قدیمی
  const rNaive = PS.build(snapshot, nesting, hwBom, cfgNaive, LinearNesting);
  const crownNaive = rNaive.groups.find(g => g.key === 'trim').rows.find(x => x.code === 'crown');
  assert(crownNaive.unit === 'متر', 'بدون bar_length_mm همچنان متراژ خام (سازگاری عقب‌رو)');

  const cfgBar = { trim: { crown_bar_length_mm: 2500, crown_price_per_bar: 300000, crown_kerf_mm: 3 } };
  const rBar = PS.build(snapshot, nesting, hwBom, cfgBar, LinearNesting);
  const crownBar = rBar.groups.find(g => g.key === 'trim').rows.find(x => x.code === 'crown');
  assert(crownBar.unit === 'شاخه', 'با bar_length_mm → واحد شاخه (نستینگ واقعی)');
  assert(crownBar.qty === 1, 'یک کابینت هوایی (۸۰cm) در یک شاخه ۲٫۵ متری جا می‌شود', String(crownBar.qty));
  assert(crownBar.cost === 300000, 'هزینه = تعداد شاخه × قیمت هر شاخه');

  const withoutLinearModule = PS.build(snapshot, nesting, hwBom, cfgBar); // linearNesting تزریق نشده
  const crownFallback = withoutLinearModule.groups.find(g => g.key === 'trim').rows.find(x => x.code === 'crown');
  assert(crownFallback.unit === 'متر', 'بدون تزریق ماژول نستینگ، به متراژ خام برمی‌گردد (نه خطا)');

  assert(Array.isArray(rBar.warnings), 'خروجی warnings (فیلد تازه) وجود دارد');
  assert(rBar.warnings.length === 0, 'بدون قطعهٔ oversized، هشداری نیست');
}

console.log('\n[هشدار کابینت بلندتر از شاخهٔ استاندارد]');
{
  const wide = JSON.parse(JSON.stringify(snapshot));
  wide.cabinets.find(c => c.category === 'wall').params.cabinet_width = 500; // 5000mm، بزرگ‌تر از هر شاخهٔ معمول
  const r = PS.build(wide, nesting, hwBom,
    { trim: { crown_bar_length_mm: 2500, crown_price_per_bar: 100000 } }, LinearNesting);
  assert(r.warnings.some(w => /بلندتر از شاخه/.test(w)), 'هشدار قطعهٔ بیش‌ازحد بلند ثبت شد', r.warnings.join('|'));
}

console.log('\n[پروفیل درب آلومینیومی — یکپارچگی در شیت قیمت]');
{
  const alu = JSON.parse(JSON.stringify(snapshot));
  alu.cabinets[3].params.door_type = 'glass_aluminum';
  alu.cabinets[3].params.door_swing = 'right';

  const rNoModule = PS.build(alu, nesting, hwBom, {}, LinearNesting); // بدون doorProfile تزریق‌شده
  const dpGroupEmpty = rNoModule.groups.find(g => g.key === 'door_profile');
  assert(dpGroupEmpty.rows.length === 0, 'بدون ماژول doorProfile، گروه خالی می‌ماند (نه خطا)');

  const rNoBar = PS.build(alu, nesting, hwBom, {}, LinearNesting, DoorProfile);
  const dpGroup = rNoBar.groups.find(g => g.key === 'door_profile');
  assert(dpGroup.rows.length === 2, 'با درب آلومینیومی، ۲ ردیف (ساده + دستگیره)', String(dpGroup.rows.length));
  assert(dpGroup.rows.every(r => r.cost === null), 'بدون bar_length_mm پیکربندی‌شده، هزینه اطلاعاتی (نه صفر ساختگی)');

  const cfg = { door_profile: { plain_bar_length_mm: 6000, plain_price_per_bar: 800000,
    handle_bar_length_mm: 3000, handle_price_per_bar: 500000 } };
  const rBar = PS.build(alu, nesting, hwBom, cfg, LinearNesting, DoorProfile);
  const dpBar = rBar.groups.find(g => g.key === 'door_profile');
  const plainRow = dpBar.rows.find(r => r.code === 'door_profile_plain');
  const handleRow = dpBar.rows.find(r => r.code === 'door_profile_handle');
  assert(plainRow.unit === 'شاخه' && plainRow.cost === plainRow.qty * 800000, 'ردیف ساده با bar_length محاسبه شد');
  assert(handleRow.unit === 'شاخه' && handleRow.cost === handleRow.qty * 500000, 'ردیف دستگیره‌دار هم محاسبه شد');
  assert(rBar.total >= plainRow.cost + handleRow.cost, 'هزینهٔ پروفیل در جمع کل لحاظ شد');

  const rPlain = PS.build(snapshot, nesting, hwBom, {}, LinearNesting, DoorProfile); // بدون درب آلومینیومی
  assert(rPlain.groups.find(g => g.key === 'door_profile').rows.length === 0,
    'بدون درب آلومینیومی در پروژه، گروه خالی می‌ماند');
}

console.log('\n[ریل کمد دیواری — یکپارچگی در شیت قیمت]');
{
  const wall = JSON.parse(JSON.stringify(snapshot));
  wall.cabinets[3].params.wall_rail_type = 'plain'; // wall_single_door → کمد دیواری فرضی
  const c2 = JSON.parse(JSON.stringify(wall.cabinets[3]));
  c2.kalaxa_id = 'cab-blum'; c2.params.wall_rail_type = 'blum';
  wall.cabinets.push(c2);

  const rNoModule = PS.build(wall, nesting, hwBom, {}, LinearNesting, DoorProfile);
  assert(rNoModule.groups.find(g => g.key === 'wall_rail').rows.length === 0,
    'بدون ماژول wallRail، گروه خالی می‌ماند (نه خطا)');

  const r = PS.build(wall, nesting, hwBom, {}, LinearNesting, DoorProfile, WallRail);
  const wrGroup = r.groups.find(g => g.key === 'wall_rail');
  const plainRow = wrGroup.rows.find(x => x.code === 'wall_rail_plain');
  const kitRow = wrGroup.rows.find(x => x.code === 'wall_rail_kit:blum');
  assert(plainRow && plainRow.unit === 'قطعه' && plainRow.cost === null,
    'ریل ساده بدون bar_length → اطلاعاتی');
  assert(kitRow && kitRow.unit === 'کمد' && kitRow.qty === 1,
    'کیت بلوم همیشه به‌ازای هر کمد قیمت‌گذاری می‌شود، نه نیازمند bar_length');

  const cfg = { wall_rail: { plain_bar_length_mm: 2500, plain_price_per_bar: 400000,
    kits: { blum: 1200000 } } };
  const r2 = PS.build(wall, nesting, hwBom, cfg, LinearNesting, DoorProfile, WallRail);
  const wrGroup2 = r2.groups.find(g => g.key === 'wall_rail');
  const plainRow2 = wrGroup2.rows.find(x => x.code === 'wall_rail_plain');
  const kitRow2 = wrGroup2.rows.find(x => x.code === 'wall_rail_kit:blum');
  assert(plainRow2.unit === 'شاخه' && plainRow2.cost === plainRow2.qty * 400000, 'با bar_length → نستینگ واقعی');
  assert(kitRow2.cost === 1200000, 'هزینهٔ کیت = تعداد کمد × قیمت کیت (۱×۱٫۲میلیون)');
  assert(r2.total >= plainRow2.cost + kitRow2.cost, 'هزینهٔ ریل در جمع کل لحاظ شد');
}

console.log('\n[قرنیز/مولدینگ مستقل — یکپارچگی در شیت قیمت]');
{
  const rNoBoards = PS.build(snapshot, nesting, hwBom, {}, LinearNesting, DoorProfile, WallRail, Moulding);
  assert(rNoBoards.groups.find(g => g.key === 'moulding').rows.length === 0,
    'بدون صفحهٔ واردشده، گروه خالی می‌ماند');

  const cfgBoards = { moulding: { boards: [{ id: 'b1', label_fa: 'کانتر', length_mm: 3000, width_mm: 600, returns: 2 }] } };
  const rNoModule = PS.build(snapshot, nesting, hwBom, cfgBoards, LinearNesting, DoorProfile, WallRail);
  assert(rNoModule.groups.find(g => g.key === 'moulding').rows.length === 0,
    'بدون ماژول moulding تزریق‌شده، گروه خالی می‌ماند (نه خطا)');

  const rInfo = PS.build(snapshot, nesting, hwBom, cfgBoards, LinearNesting, DoorProfile, WallRail, Moulding);
  const mldRow = rInfo.groups.find(g => g.key === 'moulding').rows[0];
  assert(mldRow.unit === 'قطعه' && mldRow.cost === null, 'بدون bar_length_mm → اطلاعاتی');

  const cfgFull = { moulding: { boards: cfgBoards.moulding.boards, bar_length_mm: 2500,
    price_per_bar: 350000, kerf_mm: 3 } };
  const rFull = PS.build(snapshot, nesting, hwBom, cfgFull, LinearNesting, DoorProfile, WallRail, Moulding);
  const mldRow2 = rFull.groups.find(g => g.key === 'moulding').rows[0];
  assert(mldRow2.unit === 'شاخه' && mldRow2.cost === mldRow2.qty * 350000, 'با bar_length_mm → نستینگ واقعی');
  assert(rFull.warnings.some(w => /قرنیز.*بلندتر/.test(w)), 'قطعهٔ ۳متری با شاخهٔ ۲٫۵متری → هشدار oversized');
  assert(rFull.total >= mldRow2.cost, 'هزینهٔ قرنیز در جمع کل لحاظ شد');

  const snapWithModelBoards = Object.assign({}, snapshot, {
    moulding_boards: [{ id: 'model-b1', label_fa: 'کانتر مدل', length_mm: 2000, width_mm: 600, returns: 1 }]
  });
  const rModelOnly = PS.build(snapWithModelBoards, nesting, hwBom, {}, LinearNesting, DoorProfile, WallRail, Moulding);
  assert(rModelOnly.groups.find(g => g.key === 'moulding').rows.length > 0,
    'صفحهٔ کشف‌شده از مدل (moulding_boards) بدون هیچ ورودی دستی هم لحاظ می‌شود');

  const rBoth = PS.build(snapWithModelBoards, nesting, hwBom, cfgBoards, LinearNesting, DoorProfile, WallRail, Moulding);
  const mldRowBoth = rBoth.groups.find(g => g.key === 'moulding').rows[0];
  // ۲ صفحه (مدل + دستی) => جلو + برگشت هرکدام؛ بدون bar_length هنوز اطلاعاتی، پس qty=تعداد قطعه
  assert(mldRowBoth.qty === 4, 'صفحهٔ مدل + صفحهٔ دستی هر دو ادغام می‌شوند (۲ صفحه × جلو+برگشت = ۴ قطعه)',
    String(mldRowBoth.qty));
}

console.log('\n[نوار لبهٔ رولی — یکپارچگی در شیت قیمت]');
{
  const rNoModule = PS.build(snapshot, nesting, hwBom, {}, LinearNesting, DoorProfile, WallRail, Moulding);
  assert(rNoModule.groups.find(g => g.key === 'edge_roll').rows.length === 0,
    'بدون ماژول edgeRoll تزریق‌شده، گروه خالی می‌ماند (نه خطا)');

  const rNoPrice = PS.build(snapshot, nesting, hwBom, {}, LinearNesting, DoorProfile, WallRail, Moulding, EdgeRoll);
  const erGroup = rNoPrice.groups.find(g => g.key === 'edge_roll');
  assert(erGroup.rows.length > 0, 'با ماژول تزریق‌شده، ردیف بدنه/درب ساخته شد (fixture نوار دارد)');
  const bodyRow0 = erGroup.rows.find(x => x.code === 'edge_roll_body');
  assert(bodyRow0 && bodyRow0.cost === 0, 'بدون قیمت پیکربندی‌شده → هزینه صفر (نه اطلاعاتی — واحد متر مشخص است)');

  const direct = EdgeRoll.consumption(snapshot); // مبنای مقایسه با افت پیش‌فرض ۵۰mm
  assert(bodyRow0.qty === direct.body_m, 'مصرف بدنه با موتور مستقیم یکی است', bodyRow0.qty + '≠' + direct.body_m);

  const cfgPriced = { edge_roll: { waste_mm: 50, body_price_per_m: 60000, door_price_per_m: 90000 } };
  const rPriced = PS.build(snapshot, nesting, hwBom, cfgPriced, LinearNesting, DoorProfile, WallRail, Moulding, EdgeRoll);
  const erGroup2 = rPriced.groups.find(g => g.key === 'edge_roll');
  const bodyRow = erGroup2.rows.find(x => x.code === 'edge_roll_body');
  const doorRow = erGroup2.rows.find(x => x.code === 'edge_roll_door');
  assert(bodyRow.cost === Math.round(bodyRow.qty * 60000 * 100) / 100, 'هزینهٔ بدنه = مصرف × قیمت هر متر');
  assert(doorRow.cost === Math.round(doorRow.qty * 90000 * 100) / 100, 'هزینهٔ درب = مصرف × قیمت هر متر');
  assert(rPriced.total >= bodyRow.cost + doorRow.cost, 'هزینهٔ نوار رولی در جمع کل لحاظ شد');

  const cfgWaste = { edge_roll: { waste_mm: 0, body_price_per_m: 0, door_price_per_m: 0 } };
  const rNoWaste = PS.build(snapshot, nesting, hwBom, cfgWaste, LinearNesting, DoorProfile, WallRail, Moulding, EdgeRoll);
  const bodyRowNoWaste = rNoWaste.groups.find(g => g.key === 'edge_roll').rows.find(x => x.code === 'edge_roll_body');
  assert(bodyRowNoWaste.qty < bodyRow0.qty, 'افت صفر → مصرف کمتر از حالت افت پیش‌فرض');
}

console.log('\n[قانون طراحی «ران» تاج/لب‌چراغ/پاخور — یکپارچگی در شیت قیمت]');
{
  const rNoRules = PS.build(snapshot, nesting, hwBom, {}, LinearNesting, DoorProfile, WallRail, Moulding, EdgeRoll, TrimRules);
  const trimGroup0 = rNoRules.groups.find(g => g.key === 'trim');
  assert(/متراژ خام/.test(trimGroup0.label_fa), 'بدون trim_rules پیکربندی‌شده → برچسب متراژ خام قدیمی');
  const kickRow0 = trimGroup0.rows.find(x => x.code === 'kick');
  assert(kickRow0 && kickRow0.qty === 3, 'پاخور خام = جمع عرض همهٔ کابینت‌های زمینی+قدی (cab-001/002/003/005) بدون کسر', String(kickRow0.qty));

  const cfgRules = { trim_rules: { default_deduction_mm: 18,
    runs: [{ id: 'r1', category: 'kick', label_fa: 'پاخور آشپزخانه', cabinet_ids: ['cab-001', 'cab-002', 'cab-003'], corners: 1 }] } };
  const rRules = PS.build(snapshot, nesting, hwBom, cfgRules, LinearNesting, DoorProfile, WallRail, Moulding, EdgeRoll, TrimRules);
  const trimGroup = rRules.groups.find(g => g.key === 'trim');
  assert(/ران‌های تعریف‌شده/.test(trimGroup.label_fa), 'با trim_rules → برچسب حالت قانون طراحی');
  const kickRow = trimGroup.rows.find(x => x.code === 'kick');
  // فقط ۳ کابینت در ران (۸۰+۶۰+۱۰۰=۲۴۰cm) نه cab-005 — ۲۴۰۰mm − ۱۸mm = ۲۳۸۲mm → گرد به ۲ رقم اعشار = ۲٫۳۸m
  assert(kickRow.qty === 2.38, 'پاخور با کسر گوشه = ۲٫۴ − ۰٫۰۱۸ = ۲٫۳۸m (گرد شده)', String(kickRow.qty));
  assert(kickRow.qty < kickRow0.qty, 'با قانون ران، مقدار کمتر از حالت خام (کسر گوشه واقعاً اثر کرد)');

  const cfgGhost = { trim_rules: { runs: [{ id: 'r1', category: 'kick', label_fa: 'ران ناقص', cabinet_ids: ['cab-001', 'ghost-id'] }] } };
  const rGhost = PS.build(snapshot, nesting, hwBom, cfgGhost, LinearNesting, DoorProfile, WallRail, Moulding, EdgeRoll, TrimRules);
  assert(rGhost.warnings.some(w => /ران ناقص/.test(w) && /یافت نشد/.test(w)), 'کابینت ناموجود در ران → هشدار در شیت قیمت');

  const rNoModule = PS.build(snapshot, nesting, hwBom, cfgRules, LinearNesting, DoorProfile, WallRail, Moulding, EdgeRoll);
  assert(/متراژ خام/.test(rNoModule.groups.find(g => g.key === 'trim').label_fa),
    'بدون ماژول trimRules تزریق‌شده، به رفتار خام برمی‌گردد (نه خطا)');
}

console.log('\n[priceableRows — گروه info حذف می‌شود]');
{
  const r = PS.build(snapshot, nesting, hwBom, null);
  const rows = PS.priceableRows(r);
  assert(!rows.some(x => x.code.indexOf('door_area:') === 0), 'ردیف‌های مساحت درب (info) در priceableRows نیستند');
}

console.log('\n[exportTSV / parsePastedTable — رفت‌وبرگشت اکسل]');
{
  const r = PS.build(snapshot, nesting, hwBom, null);
  const tsv = PS.exportTSV(r);
  assert(tsv.split('\n')[0].indexOf('کد') !== -1, 'خط اول هدر است');
  assert(tsv.split('\n').length === PS.priceableRows(r).length + 1, 'تعداد خط = ردیف‌های قیمت‌پذیر + هدر');

  const codes = PS.priceableRows(r).map(x => x.code);
  const pasted = 'کد\tعنوان\tتعداد\tقیمت واحد\n' + codes[0] + '\tX\t1\t999,000\nناشناخته\tY\t1\t500';
  const parsed = PS.parsePastedTable(pasted, codes);
  assert(parsed.prices[codes[0]] === 999000, 'کاما در عدد پارس شد', JSON.stringify(parsed.prices));
  assert(parsed.unmatched.indexOf('ناشناخته') !== -1, 'کد ناشناس در unmatched گزارش شد');
  assert(!('ناشناخته' in parsed.prices), 'کد ناشناس prices را آلوده نکرد');

  const tsvPasted = codes.map(c => c + '\t' + '42').join('\n');
  const parsedAll = PS.parsePastedTable(tsvPasted, codes);
  assert(Object.keys(parsedAll.prices).length === codes.length, 'همهٔ کدهای شناخته‌شده پارس شدند');
  assert(codes.every(c => parsedAll.prices[c] === 42), 'مقدار همه ۴۲ خوانده شد');

  const csvLine = codes[0] + ',X,1,777';
  assert(PS.parsePastedTable(csvLine, codes).prices[codes[0]] === 777, 'حالت CSV (کاما) هم پشتیبانی می‌شود');

  assert(Object.keys(PS.parsePastedTable('', codes).prices).length === 0, 'ورودی خالی → بدون خطا، بدون قیمت');
  assert(Object.keys(PS.parsePastedTable('یک ستون فقط', codes).prices).length === 0, 'ردیف بدون ستون کافی نادیده گرفته می‌شود');
}

console.log('\n[تنظیمات: price_sheet در KalaxaSettings]');
{
  const d = Settings.defaults();
  assert(d.project.price_sheet && typeof d.project.price_sheet === 'object', 'پیش‌فرض price_sheet وجود دارد');
  assert(Settings.validate(d).ok, 'پیش‌فرض کامل معتبر است', Settings.validate(d).errors.join('|'));

  const bad = Settings.defaults(); bad.project.price_sheet.sheets = { x: -5 };
  assert(!Settings.validate(bad).ok, 'قیمت منفی ورق رد می‌شود');

  const bad2 = Settings.defaults(); bad2.project.price_sheet.assembly = { k: 'رایگان' };
  assert(!Settings.validate(bad2).ok, 'قیمت غیرعددی مونتاژ رد می‌شود');

  const bad3 = Settings.defaults(); bad3.project.price_sheet.trim.crown_per_m = -1;
  assert(!Settings.validate(bad3).ok, 'قیمت منفی تاج رد می‌شود');

  const bad4 = Settings.defaults(); bad4.project.price_sheet.trim.crown_bar_length_mm = -100;
  assert(!Settings.validate(bad4).ok, 'طول شاخهٔ منفی رد می‌شود');
  const ok4 = Settings.defaults();
  ok4.project.price_sheet.trim.crown_bar_length_mm = 2500;
  ok4.project.price_sheet.trim.crown_price_per_bar = 300000;
  ok4.project.price_sheet.trim.crown_kerf_mm = 3;
  assert(Settings.validate(ok4).ok, 'کلیدهای نستینگ یک‌بعدی معتبر پذیرفته می‌شوند',
    Settings.validate(ok4).errors.join('|'));

  const d5 = Settings.defaults();
  assert(d5.project.price_sheet.door_profile && typeof d5.project.price_sheet.door_profile === 'object',
    'پیش‌فرض door_profile وجود دارد');
  const bad5 = Settings.defaults(); bad5.project.price_sheet.door_profile.plain_bar_length_mm = -1;
  assert(!Settings.validate(bad5).ok, 'طول شاخهٔ منفی پروفیل درب رد می‌شود');
  const bad6 = Settings.defaults(); bad6.project.price_sheet.door_profile.door_types = 'not-array';
  assert(!Settings.validate(bad6).ok, 'door_types غیرآرایه رد می‌شود');
  const ok5 = Settings.defaults();
  ok5.project.price_sheet.door_profile = { door_types: ['glass_aluminum'],
    plain_bar_length_mm: 6000, plain_price_per_bar: 800000, plain_kerf_mm: 3,
    handle_bar_length_mm: 3000, handle_price_per_bar: 500000, handle_kerf_mm: 3 };
  assert(Settings.validate(ok5).ok, 'پیکربندی کامل پروفیل درب معتبر است', Settings.validate(ok5).errors.join('|'));

  const d6 = Settings.defaults();
  assert(d6.project.price_sheet.wall_rail && typeof d6.project.price_sheet.wall_rail === 'object',
    'پیش‌فرض wall_rail وجود دارد');
  const bad7 = Settings.defaults(); bad7.project.price_sheet.wall_rail.plain_bar_length_mm = -5;
  assert(!Settings.validate(bad7).ok, 'طول شاخهٔ منفی ریل رد می‌شود');
  const bad8 = Settings.defaults(); bad8.project.price_sheet.wall_rail.kits = { blum: -100 };
  assert(!Settings.validate(bad8).ok, 'قیمت منفی کیت رد می‌شود');
  const bad9 = Settings.defaults(); bad9.project.price_sheet.wall_rail.kits = 'not-object';
  assert(!Settings.validate(bad9).ok, 'kits غیرشیء رد می‌شود');
  const ok6 = Settings.defaults();
  ok6.project.price_sheet.wall_rail = { plain_bar_length_mm: 2500, plain_price_per_bar: 400000,
    plain_kerf_mm: 3, kits: { blum: 1200000, fantoni: 1100000 } };
  assert(Settings.validate(ok6).ok, 'پیکربندی کامل ریل کمد معتبر است', Settings.validate(ok6).errors.join('|'));

  const d7 = Settings.defaults();
  assert(d7.project.price_sheet.moulding && typeof d7.project.price_sheet.moulding === 'object',
    'پیش‌فرض moulding وجود دارد');
  const bad10 = Settings.defaults(); bad10.project.price_sheet.moulding.bar_length_mm = -5;
  assert(!Settings.validate(bad10).ok, 'طول شاخهٔ منفی قرنیز رد می‌شود');
  const bad11 = Settings.defaults(); bad11.project.price_sheet.moulding.boards = 'not-array';
  assert(!Settings.validate(bad11).ok, 'boards غیرآرایه رد می‌شود');
  const bad12 = Settings.defaults();
  bad12.project.price_sheet.moulding.boards = [{ length_mm: -100, width_mm: 600, returns: 2 }];
  assert(!Settings.validate(bad12).ok, 'length_mm منفی در board رد می‌شود');
  const bad13 = Settings.defaults();
  bad13.project.price_sheet.moulding.boards = [{ label_fa: 123 }];
  assert(!Settings.validate(bad13).ok, 'label_fa غیرمتن در board رد می‌شود');
  const ok7 = Settings.defaults();
  ok7.project.price_sheet.moulding = { boards: [{ id: 'b1', label_fa: 'کانتر', length_mm: 3000, width_mm: 600, returns: 2 }],
    bar_length_mm: 2500, price_per_bar: 400000, kerf_mm: 3 };
  assert(Settings.validate(ok7).ok, 'پیکربندی کامل قرنیز معتبر است', Settings.validate(ok7).errors.join('|'));

  const d8 = Settings.defaults();
  assert(d8.project.price_sheet.edge_roll && typeof d8.project.price_sheet.edge_roll === 'object',
    'پیش‌فرض edge_roll وجود دارد (waste_mm=50)');
  assert(d8.project.price_sheet.edge_roll.waste_mm === 50, 'افت پیش‌فرض ۵۰mm');
  const bad14 = Settings.defaults(); bad14.project.price_sheet.edge_roll.waste_mm = -5;
  assert(!Settings.validate(bad14).ok, 'افت منفی نوار رولی رد می‌شود');
  const bad15 = Settings.defaults(); bad15.project.price_sheet.edge_roll.body_price_per_m = -1;
  assert(!Settings.validate(bad15).ok, 'قیمت منفی نوار رولی رد می‌شود');
  const ok8 = Settings.defaults();
  ok8.project.price_sheet.edge_roll = { waste_mm: 30, body_price_per_m: 50000, door_price_per_m: 70000 };
  assert(Settings.validate(ok8).ok, 'پیکربندی کامل نوار رولی معتبر است', Settings.validate(ok8).errors.join('|'));

  const d9 = Settings.defaults();
  assert(d9.project.price_sheet.trim_rules && typeof d9.project.price_sheet.trim_rules === 'object',
    'پیش‌فرض trim_rules وجود دارد');
  const bad16 = Settings.defaults(); bad16.project.price_sheet.trim_rules.default_deduction_mm = -5;
  assert(!Settings.validate(bad16).ok, 'کسر پیش‌فرض منفی رد می‌شود');
  const bad17 = Settings.defaults(); bad17.project.price_sheet.trim_rules.runs = 'not-array';
  assert(!Settings.validate(bad17).ok, 'runs غیرآرایه رد می‌شود');
  const bad18 = Settings.defaults();
  bad18.project.price_sheet.trim_rules.runs = [{ category: 'invalid_kind', cabinet_ids: ['c1'] }];
  assert(!Settings.validate(bad18).ok, 'category نامعتبر رد می‌شود');
  const bad19 = Settings.defaults();
  bad19.project.price_sheet.trim_rules.runs = [{ category: 'crown', cabinet_ids: 'not-array' }];
  assert(!Settings.validate(bad19).ok, 'cabinet_ids غیرآرایه رد می‌شود');
  const bad20 = Settings.defaults();
  bad20.project.price_sheet.trim_rules.runs = [{ category: 'crown', cabinet_ids: ['c1'], corners: -1 }];
  assert(!Settings.validate(bad20).ok, 'corners منفی رد می‌شود');
  const ok9 = Settings.defaults();
  ok9.project.price_sheet.trim_rules = { default_deduction_mm: 18,
    runs: [{ id: 'r1', category: 'crown', label_fa: 'دیوار شمالی', cabinet_ids: ['cab-001'], corners: 1, deduction_mm: 18 }] };
  assert(Settings.validate(ok9).ok, 'پیکربندی کامل قانون ران معتبر است', Settings.validate(ok9).errors.join('|'));

  const ok = Settings.defaults();
  ok.project.price_sheet.assembly = { base_single_door: 300000 };
  ok.project.price_sheet.sheets = { mdf_white_16: 1000000 };
  assert(Settings.validate(ok).ok, 'مقادیر معتبر پذیرفته می‌شوند');

  const noPriceSheet = Settings.defaults(); delete noPriceSheet.project.price_sheet;
  assert(Settings.validate(noPriceSheet).ok, 'نبود price_sheet هم معتبر (سازگاری عقب‌رو)');
}

console.log('\n[جبرگرایی]');
{
  const a = JSON.stringify(PS.build(snapshot, nesting, hwBom, { sheets: { mdf_white_16: 1 } }));
  const b = JSON.stringify(PS.build(snapshot, nesting, hwBom, { sheets: { mdf_white_16: 1 } }));
  assert(a === b, 'دو اجرای یکسان → خروجی یکسان');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
