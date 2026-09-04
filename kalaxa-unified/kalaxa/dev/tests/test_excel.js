/** ورودی و خروجی اکسل — node test_excel.js
 *
 * سه چیز که در CSV فارسی معمولاً فراموش می‌شود و هر سه در اکسل واقعی
 * خودشان را نشان می‌دهند، نه در تست‌های ساده‌انگارانه:
 *   ۱. BOM — بدون آن فارسی «Ø§Ø³Ù…» می‌شود.
 *   ۲. رقم لاتین — «۷۲۰» در اکسل **متن** است، جمع نمی‌شود.
 *   ۳. جداکننده — اکسلِ ویندوز فارسی گاهی «؛» می‌خواهد.
 */
'use strict';
const path = require('path');
const X = require(path.join(__dirname, '..', '..', 'ui', 'kalaxa-excel.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

const SNAP = {
  cabinets: [{ kalaxa_id: 'c1', label_fa: 'کابینت زیر گاز', category: 'base',
               template_id: 'imported',
               params: { cabinet_width: 90, cabinet_height: 72, cabinet_depth: 56.8 } }],
  parts_flat: [
    { key: 'side', name_fa: 'دیواره', count: 2, cut_length_mm: 720, cut_width_mm: 550,
      thickness_mm: 16, sheet_id: 'mdf_white_16', edge: { front: 1 }, groove: { back: 8 },
      part_uid: 'c1:imp:1', cabinet_id: 'c1' },
    { key: 'back', name_fa: 'پشت‌بند', count: 1, cut_length_mm: 868, cut_width_mm: 688,
      thickness_mm: 8, sheet_id: 'mdf_white_8', edge: {}, groove: {},
      part_uid: 'c1:imp:2', cabinet_id: 'c1' }
  ]
};

console.log('اکسل فارسی را درست باز می‌کند');
{
  const csv = X.partsCsv(SNAP);
  assert(csv.charCodeAt(0) === 0xFEFF, 'با BOM شروع می‌شود — وگرنه فارسی خراب است');
  assert(csv.indexOf('کابینت زیر گاز') !== -1, 'نام فارسی در فایل هست');
  assert(csv.indexOf('\r\n') !== -1, 'خط‌ها CRLF‌اند (اکسل ویندوز)');
  assert(csv.indexOf('sep=,') !== -1, 'جداکننده صریح اعلام می‌شود');
}

console.log('عدد، عدد می‌ماند');
{
  const csv = X.partsCsv(SNAP);
  assert(csv.indexOf('720') !== -1, 'ابعاد با رقم لاتین نوشته می‌شود');
  assert(!/[۰-۹]/.test(csv), 'هیچ رقم فارسی در فایل نیست — وگرنه اکسل متن می‌بیند',
         (csv.match(/[۰-۹]/g) || []).join(''));

  // حتی اگر ورودی فارسی باشد
  const fa = X.toCsv(['ا'], [['۷۲۰']]);
  assert(fa.indexOf('720') !== -1 && !/[۰-۹]/.test(fa),
         'رقم فارسیِ ورودی هم به لاتین تبدیل می‌شود');
}

console.log('خانه‌های دردسرساز');
{
  const csv = X.toCsv(['a', 'b'], [['متن, با کاما', 'نقل "قول"'], ['خط\nدوم', 'ساده']]);
  const rows = X.parseCsv(csv);
  assert(rows[1][0] === 'متن, با کاما', 'کاما داخل خانه فایل را نمی‌شکند', rows[1][0]);
  assert(rows[1][1] === 'نقل "قول"', 'نقل قول درست escape می‌شود', rows[1][1]);
  assert(rows[2][0] === 'خط\nدوم', 'خط تازه داخل خانه می‌ماند', JSON.stringify(rows[2][0]));
}

console.log('جداکننده حدس زده می‌شود');
{
  // اکسل فارسی با «؛» ذخیره می‌کند
  assert(X.parseCsv('a;b;c\n1;2;3')[1].length === 3, 'نقطه‌ویرگول');
  // کپی از اکسل → tab
  assert(X.parseCsv('a\tb\tc\n1\t2\t3')[1].length === 3, 'تب');
  assert(X.parseCsv('a,b,c\n1,2,3')[1].length === 3, 'کاما');
  // اجبار به یک جداکننده یعنی نصف فایل‌ها در یک ستون می‌افتند
  assert(X.parseCsv('sep=;\na;b\n1;2')[1].length === 2, 'خط sep= رعایت و حذف می‌شود');
}

console.log('رفت و برگشت');
{
  const rows = X.parseCsv(X.partsCsv(SNAP));
  assert(rows[0][0] === 'کابینت', 'سرستون‌ها برمی‌گردند', rows[0][0]);
  assert(rows.length === 1 + SNAP.parts_flat.length, 'همهٔ ردیف‌ها',
         String(rows.length));
  const uidCol = rows[0].indexOf('کد قطعه');
  assert(rows[1][uidCol] === 'c1:imp:1', 'کد قطعه سالم می‌ماند', rows[1][uidCol]);
}

console.log('ورود اصلاحات');
{
  const csv = X.partsCsv(SNAP);
  // کاربر تعداد دیواره را ۲→۴ و طولش را ۷۲۰→۷۱۸ می‌کند
  const edited = csv.replace('2,720,550', '4,718,550');
  const r = X.importParts(edited);
  assert(r.applied === 2, 'هر دو سطر خوانده می‌شوند', String(r.applied));
  assert(r.updates['c1:imp:1'].count === 4, 'تعداد اصلاح‌شده', JSON.stringify(r.updates['c1:imp:1']));
  assert(r.updates['c1:imp:1'].cut_length_mm === 718, 'طول اصلاح‌شده');

  const ap = X.applyParts(SNAP, r.updates);
  assert(ap.snapshot.parts_flat[0].count === 4, 'روی اسنپ‌شات می‌نشیند');
  assert(SNAP.parts_flat[0].count === 2, 'و نسخهٔ اصلی دست‌نخورده می‌ماند');
  assert(ap.changed >= 2, 'تعداد تغییرها گزارش می‌شود', String(ap.changed));
}

console.log('عدد فارسیِ تایپ‌شده در اکسل');
{
  const csv = 'کد قطعه,تعداد\nc1:imp:1,۵';
  const r = X.importParts(csv);
  assert(r.updates['c1:imp:1'] && r.updates['c1:imp:1'].count === 5,
         'کاربر ممکن است فارسی تایپ کند — NaN نمی‌شود',
         JSON.stringify(r.updates));
}

console.log('اکسل منبع حقیقت نیست');
{
  // کدی که در مدل نیست باید **گفته شود**، نه اینکه بی‌صدا رد شود
  const r = X.importParts('کد قطعه,تعداد\nنیست:۱,3');
  const ap = X.applyParts(SNAP, r.updates);
  assert(ap.missing.length === 1, 'کد ناشناخته گزارش می‌شود',
         JSON.stringify(ap.missing));
  assert(ap.changed === 0, 'و چیزی را عوض نمی‌کند');

  // بدون ستون کد، هیچ اصلاحی پذیرفته نیست
  const noUid = X.importParts('کابینت,تعداد\nفلان,3');
  assert(noUid.applied === 0 && noUid.warnings.length > 0,
         'بدون «کد قطعه» فایل رد می‌شود — وگرنه معلوم نیست هر سطر کدام قطعه است',
         JSON.stringify(noUid.warnings));
}

console.log('مقدار نامعتبر رد می‌شود');
{
  const r = X.importParts('کد قطعه,تعداد,طول (mm)\nc1:imp:1,0,-5');
  assert(!r.updates['c1:imp:1'], 'تعداد صفر و طول منفی اعمال نمی‌شوند',
         JSON.stringify(r.updates));
  assert(r.warnings.length > 0, 'و بی‌صدا نمی‌گذرد', JSON.stringify(r.warnings));
}

console.log('ترتیب ستون‌ها آزاد است');
{
  // کاربر در اکسل ستون‌ها را جابه‌جا می‌کند — این عادی است
  const r = X.importParts('تعداد,کد قطعه\n7,c1:imp:2');
  assert(r.updates['c1:imp:2'] && r.updates['c1:imp:2'].count === 7,
         'ستون با نامش پیدا می‌شود نه با جایش', JSON.stringify(r.updates));
}

console.log('کابینت‌ها و کالا');
{
  const cab = X.parseCsv(X.cabinetsCsv(SNAP));
  assert(cab[1][3] === '90' && cab[1][5] === '56.8',
         'ابعاد به سانتی‌متر و با اعشار', cab[1].join('|'));

  const goods = X.goodsCsv({ rows: [{ group_fa: 'ورق', name_fa: 'ام‌دی‌اف سفید ۱۶',
                                      qty: 3, unit_fa: 'برگ', code: 'mdf_white_16' }] });
  assert(goods.indexOf('ام‌دی‌اف سفید 16') !== -1,
         'نام کالا با رقم لاتین می‌آید', goods.split('\r\n')[2]);
}

console.log('حالت‌های خالی');
{
  assert(X.parseCsv('').length === 0, 'فایل خالی نمی‌شکند');
  assert(X.importParts('').warnings.length > 0, 'و پیام می‌دهد');
  assert(X.partsCsv({}).indexOf('کد قطعه') !== -1, 'اسنپ‌شات خالی سرستون می‌دهد');
}

console.log('\n' + passed + ' گذشت، ' + failed + ' افتاد');
process.exit(failed ? 1 : 0);
