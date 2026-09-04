/** تست علائم کاربرتعریف (کد حرفی) نوار/شیار/فارسی‌بر در نقشه برش + مدل نوار — node test_cutmap_marks.js */
'use strict';
const path = require('path');
const fs = require('fs');
const UI = path.join(__dirname, '..', '..', 'ui');
const Cut = require(path.join(UI, 'kalaxa-cutmap-svg.js'));
const S = require(path.join(UI, 'kalaxa-settings.js'));
const Report = require(path.join(UI, 'kalaxa-report.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

const sheet = { sheet_id: 's', width_mm: 3660, height_mm: 1830, trim_margin_mm: 10 };
function layoutWith(pl) {
  return { sheet_index: 1, utilization_pct: 90, placements: pl, offcuts: [], cuts: [] };
}
const MARKS = { band_body: { code: '#', label_fa: 'نوار بدنه' },
                band_door: { code: 'P', label_fa: 'نوار درب' },
                groove:    { code: 'W', label_fa: 'شیار' },
                miter:     { code: 'F', label_fa: 'فارسی‌بر (۴۵°)' },
                bevel:     { code: 'Z', label_fa: 'کج‌بری با زاویه' } };

console.log('\n[علامت نوار بدنه — کد کاربرتعریف، نه رنگ/خط]');
{
  const body = [{ key: 'side', name_fa: 'دیواره', instance: 1, x_mm: 100, y_mm: 100,
    w_mm: 600, h_mm: 720, rotated: false, edge: { front: 1, back: 0, top: 0, bottom: 0 },
    groove: null, miter: null }];
  const svg = Cut.renderSheet(layoutWith(body), sheet, { role_of: () => 'body', marks: MARKS });
  assert(!/stroke="#[0-9a-fA-F]{6}"/.test(svg.replace(/#fafafa|#333|#bbb|#c9c9c9|#aaa|#444|#888|#d33|#fff/g, '')),
    'رنگ سفارشی وجود ندارد');
  assert(/>#<\/text>/.test(svg), 'کد # کنار لبهٔ نوار بدنه نوشته شد');
  assert(svg.indexOf('# = نوار بدنه') !== -1, 'راهنما: «# = نوار بدنه»');
}

console.log('\n[کد نوار درب متفاوت از بدنه]');
{
  const door = [{ key: 'door', name_fa: 'درب', instance: 1, x_mm: 0, y_mm: 0,
    w_mm: 400, h_mm: 700, rotated: false, edge: { front: 1, back: 1, top: 1, bottom: 1 },
    groove: null, miter: null }];
  const svg = Cut.renderSheet(layoutWith(door), sheet, { role_of: (k) => k === 'door' ? 'door' : 'body', marks: MARKS });
  assert((svg.match(/>P<\/text>/g) || []).length === 4, 'کد P روی هر ۴ لبهٔ درب');
  assert(svg.indexOf('P = نوار درب') !== -1, 'راهنما: «P = نوار درب»');
}

console.log('\n[شیار، فارسی‌بر، کج‌بری زاویه‌دار — سه کد مستقل]');
{
  const pl = [{ key: 'side', name_fa: 'دیواره', instance: 1, x_mm: 0, y_mm: 0,
    w_mm: 600, h_mm: 400, rotated: false, edge: null,
    groove: { back: 1 }, miter: { front: 1 }, bevel: { top: true } }];
  const svg = Cut.renderSheet(layoutWith(pl), sheet, { marks: MARKS });
  assert(svg.indexOf('>W</text>') !== -1, 'کد شیار W روی صفحه');
  assert(svg.indexOf('>F</text>') !== -1, 'کد فارسی‌بر F روی صفحه');
  assert(svg.indexOf('>Z</text>') !== -1, 'کد کج‌بری زاویه‌دار Z روی صفحه');
  assert(svg.indexOf('W = شیار') !== -1 && svg.indexOf('F = فارسی‌بر') !== -1 &&
    svg.indexOf('Z = کج‌بری با زاویه') !== -1, 'راهنمای هر سه کد');
  const off = Cut.renderSheet(layoutWith(pl), sheet, { marks: MARKS, show_grooves: false });
  assert(off.indexOf('>W</text>') === -1, 'با show_grooves=false کد شیار نمی‌آید');
  assert(off.indexOf('>F</text>') !== -1 && off.indexOf('>Z</text>') !== -1,
    'فارسی‌بر و کج‌بری زاویه‌دار مستقل از show_grooves باقی می‌مانند (زیر show_edges‌اند)');
}

console.log('\n[ADR-0001 — bevel با زاویهٔ عددی، نه فقط بولین]');
{
  const withAngle = [{ key: 'side', name_fa: 'دیواره', instance: 1, x_mm: 0, y_mm: 0,
    w_mm: 600, h_mm: 400, rotated: false, edge: null, groove: null, miter: null, bevel: { top: 30 } }];
  const svg = Cut.renderSheet(layoutWith(withAngle), sheet, { marks: MARKS });
  assert(svg.indexOf('>Z۳۰°</text>') !== -1, 'زاویهٔ عددی کنار کد نوشته می‌شود (Z۳۰°)', svg.match(/>Z[^<]*</)?.[0]);

  const boolOnly = [{ key: 'side', name_fa: 'دیواره', instance: 1, x_mm: 0, y_mm: 0,
    w_mm: 600, h_mm: 400, rotated: false, edge: null, groove: null, miter: null, bevel: { top: true } }];
  const svgBool = Cut.renderSheet(layoutWith(boolOnly), sheet, { marks: MARKS });
  assert(svgBool.indexOf('>Z</text>') !== -1, 'bevel بولین ساده (بدون زاویه) همچنان کار می‌کند — سازگاری عقب‌رو');

  // bevel:1 هم‌تراز edge/groove/miter («۱ = هست») خوانده می‌شود، نه «۱ درجه» — قرارداد ADR-0001
  const oneAsFlag = [{ key: 'side', name_fa: 'دیواره', instance: 1, x_mm: 0, y_mm: 0,
    w_mm: 600, h_mm: 400, rotated: false, edge: null, groove: null, miter: null, bevel: { top: 1 } }];
  const svgOne = Cut.renderSheet(layoutWith(oneAsFlag), sheet, { marks: MARKS });
  assert(svgOne.indexOf('>Z</text>') !== -1, 'bevel:1 → کد بدون زاویه (نه «Z۱°»)، هم‌قرارداد edge/groove/miter');

  const miterUnaffected = [{ key: 'side', name_fa: 'دیواره', instance: 1, x_mm: 0, y_mm: 0,
    w_mm: 600, h_mm: 400, rotated: false, edge: null, groove: null, bevel: null, miter: { front: 1 } }];
  const svgMiter = Cut.renderSheet(layoutWith(miterUnaffected), sheet, { marks: MARKS });
  assert(svgMiter.indexOf('>F</text>') !== -1 && !/>F[0-9۰-۹]/.test(svgMiter),
    'فارسی‌بر (miter) زاویهٔ نمایشی ندارد — همیشه ۴۵ ثابت است، طبق ADR-0001');
}

console.log('\n[بدون marks — پیش‌فرض داخلی موتور]');
{
  const pl = [{ key: 'side', name_fa: 's', instance: 1, x_mm: 0, y_mm: 0, w_mm: 600, h_mm: 400,
    rotated: false, edge: { front: 1, back: 0, top: 0, bottom: 0 }, groove: null, miter: null }];
  const svg = Cut.renderSheet(layoutWith(pl), sheet, {}); // marks داده نشده
  assert(svg.indexOf('>#<') !== -1, 'کد پیش‌فرض # وقتی marks پاس نشده');
}

console.log('\n[راهنما فقط برای علائم واقعاً رسم‌شده]');
{
  const pl = [{ key: 'side', name_fa: 's', instance: 1, x_mm: 0, y_mm: 0, w_mm: 600, h_mm: 400,
    rotated: false, edge: { front: 1, back: 0, top: 0, bottom: 0 }, groove: null, miter: null }];
  const svg = Cut.renderSheet(layoutWith(pl), sheet, { marks: MARKS });
  assert(svg.indexOf('نوار بدنه') !== -1, 'راهنمای بدنه هست');
  assert(svg.indexOf('= شیار') === -1 && svg.indexOf('= فارسی‌بر') === -1 && svg.indexOf('نوار درب') === -1,
    'راهنمای علائم استفاده‌نشده نمی‌آید');
}

console.log('\n[مدل نوار — پیش‌فرض و اعتبارسنجی (بدون تغییر نسبت به دور قبل)]');
{
  const d = S.defaults();
  assert(d.project.edge_band.body.thickness_mm === 1 && d.project.edge_band.body.subtract === true,
    'پیش‌فرض بدنه: ۱ میل + کسر روشن');
  assert(d.project.edge_band.door.thickness_mm === 2, 'پیش‌فرض درب: ۲ میل');
  assert(S.validate(d).ok, 'پیش‌فرض معتبر', S.validate(d).errors.join('|'));
  const badTh = S.defaults(); badTh.project.edge_band.body.thickness_mm = 3;
  assert(!S.validate(badTh).ok, 'ضخامت غیرمجاز (۳) رد می‌شود');
}

console.log('\n[کدهای علامت — پیش‌فرض و اعتبارسنجی]');
{
  const d = S.defaults();
  assert(d.project.marks.band_body.code === '#' && d.project.marks.band_door.code === 'P' &&
    d.project.marks.groove.code === 'W' && d.project.marks.miter.code === 'F',
    'پیش‌فرض‌های کد: #, P, W, F');
  assert(S.validate(d).ok, 'پیش‌فرض‌های کد معتبرند');

  const empty = S.defaults(); empty.project.marks.groove.code = '';
  assert(!S.validate(empty).ok, 'کد خالی رد می‌شود');

  const long = S.defaults(); long.project.marks.groove.code = 'WWWW';
  assert(!S.validate(long).ok, 'کد بلندتر از ۳ نویسه رد می‌شود');

  const dup = S.defaults(); dup.project.marks.groove.code = '#'; // برخورد با band_body
  const vDup = S.validate(dup);
  assert(!vDup.ok && /تکراری/.test(vDup.errors.join('|')), 'کد تکراری رد می‌شود', vDup.errors.join('|'));

  assert(S.defaults().project.marks.bevel.code === 'Z' &&
    S.defaults().project.marks.miter.code === 'F', 'فارسی‌بر (F) و کج‌بری زاویه‌دار (Z) کد جدا دارند');
  const dupBevelMiter = S.defaults(); dupBevelMiter.project.marks.bevel.code = 'F';
  assert(!S.validate(dupBevelMiter).ok, 'برخورد کد فارسی‌بر و کج‌بری زاویه‌دار هم رد می‌شود');

  const dupCI = S.defaults(); dupCI.project.marks.groove.code = 'p'; // برخورد حروف‌کوچک با P
  assert(!S.validate(dupCI).ok, 'برخورد کد بدون حساسیت به بزرگ/کوچک هم رد می‌شود');

  const custom = S.defaults(); custom.project.marks.groove.code = 'ش';
  assert(S.validate(custom).ok, 'کد فارسی یک‌حرفی هم مجاز است (کاربر خودش تعیین می‌کند)');

  const noMarks = S.defaults(); delete noMarks.project.marks;
  assert(S.validate(noMarks).ok, 'نبود marks معتبر (سازگاری عقب‌رو)');
}

console.log('\n[applyToSnapshot — کدها به snapshot.project.marks می‌رسند]');
{
  const g = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'fixtures', 'golden_kitchen_snapshot.json'), 'utf8'));
  const st = S.defaults();
  st.project.marks.groove.code = 'ش';
  const r = S.applyToSnapshot(g, st);
  assert(r.snapshot.project.marks.groove.code === 'ش', 'کد سفارشی در snapshot اعمال‌شده منعکس شد');
  assert(r.snapshot.project.marks.band_body.code === '#', 'کدهای دست‌نخورده هم حاضرند');
  assert(r.snapshot.parts_flat.every(p => p.miter && typeof p.miter === 'object'),
    'همهٔ قطعات فیلد miter (پیش‌فرض {}) دارند');
  assert(r.snapshot.parts_flat.every(p => p.bevel && typeof p.bevel === 'object'),
    'همهٔ قطعات فیلد bevel (پیش‌فرض {}) هم دارند — جدا از miter');
}

console.log('\n[لیست قطعات — کد علائم کاربرتعریف در برچسب]');
{
  assert(Report._internal.markCodes({ key: 'side', edge: { front: 1 } },
    { band_body: { code: '#' } }) === '#:جلو', 'کد نوار بدنه با نام ضلع');
  assert(Report._internal.markCodes({ key: 'door', edge: { back: 1 } },
    { band_door: { code: 'P' } }) === 'P:پشت', 'نقش درب کد نوار درب می‌گیرد');
  assert(Report._internal.markCodes({ key: 'side', groove: { top: 1 } },
    { groove: { code: 'W' } }) === 'W:بالا', 'کد شیار');
  assert(Report._internal.markCodes({ key: 'side', miter: { bottom: 1 } },
    { miter: { code: 'F' } }) === 'F:پایین', 'کد فارسی‌بر');
  assert(Report._internal.markCodes({ key: 'side', bevel: { bottom: true } },
    { bevel: { code: 'Z' } }) === 'Z:پایین', 'کد کج‌بری زاویه‌دار — مستقل از فارسی‌بر (بدون زاویهٔ عددی)');
  assert(Report._internal.markCodes({ key: 'side', bevel: { bottom: 30 } },
    { bevel: { code: 'Z' } }) === 'Z۳۰°:پایین', 'کج‌بری با زاویهٔ عددی در لیست قطعات هم دیده می‌شود (ADR-0001)');
  assert(Report._internal.markCodes({ key: 'side' }, null) === '', 'بدون marks → خالی (fallback به گروو قدیمی)');

  const g = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'fixtures', 'golden_kitchen_snapshot.json'), 'utf8'));
  const st = S.defaults();
  const r = S.applyToSnapshot(g, st);
  const html = Report.labelsHtml(r.snapshot, 'x');
  assert(html.indexOf('W:') !== -1 || html.indexOf('#:') !== -1, 'کد علائم در برچسب‌های واقعی دیده می‌شود');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed ? 1 : 0);
