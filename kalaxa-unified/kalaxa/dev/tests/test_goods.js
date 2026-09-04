/** فهرست کالا (برگهٔ سفارش) — node test_goods.js
 *
 * کاربر: «کالا هم باشه». گزارش متریال از قبل بود ولی به درد سفارش نمی‌خورد:
 * **نمی‌شود ۴٫۷ متر مربع MDF خرید.** این برگه همان تبدیل است — برگ، متر، عدد.
 *
 * تست روی snapshot **واقعی** (فیکسچر طلایی) اجرا می‌شود نه داده‌ی دست‌ساز، تا
 * اگر قرارداد ماژول‌های بالادست عوض شد این‌جا قرمز شود. نسخهٔ اول همین کد نام
 * فیلدهای BOM را حدس زده بود (`lines` به‌جای `items`) و بی‌صدا هیچ یراقی
 * نمی‌آورد — دقیقاً همان «تستی که همه‌چیز را غایب می‌بیند».
 */
'use strict';
const fs = require('fs');
const path = require('path');
const UI = path.join(__dirname, '..', '..', 'ui');
const N = require(path.join(UI, 'kalaxa-nesting.js'));
const R = require(path.join(UI, 'kalaxa-report.js'));
const H = require(path.join(UI, 'kalaxa-hardware.js'));
const G = require(path.join(UI, 'kalaxa-goods.js'));

const SNAP = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'golden_kitchen_snapshot.json'), 'utf8'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

const NEST = N.run(SNAP);
const EB = R.edgeBanding(SNAP);
const BOM = H.bom(SNAP, {});
const goods = G.build(SNAP, NEST, EB, BOM);

console.log('هر سه گروه واقعاً پر می‌شوند');
{
  // این سه ادعا نگهبانِ همان باگ حدسِ نام فیلد است.
  assert(goods.groups.sheet.length > 0, 'ورق دارد', String(goods.groups.sheet.length));
  assert(goods.groups.edge.length > 0, 'نوار دارد', String(goods.groups.edge.length));
  assert(goods.groups.hardware.length > 0, 'یراق دارد', String(goods.groups.hardware.length));
  assert(goods.rows.length ===
         goods.groups.sheet.length + goods.groups.edge.length + goods.groups.hardware.length,
         'همهٔ سطرها در گروه‌ها جا می‌شوند');
}

console.log('ورق برگی سفارش می‌شود، نه متری');
{
  const sheets = goods.groups.sheet;
  assert(sheets.every(r => r.unit === 'برگ'), 'واحد ورق «برگ» است');
  assert(sheets.every(r => Number.isInteger(r.qty) && r.qty > 0),
         'تعداد برگ عدد صحیح مثبت است', JSON.stringify(sheets.map(r => r.qty)));

  // مهم‌ترین ادعا: تعداد از **نستینگ** می‌آید نه از مساحت. مساحت قابل سفارش
  // نیست — بسته به چیدمان، ۴٫۷ متر مربع ممکن است ۲ برگ باشد یا ۳ تا.
  const nestBy = {};
  NEST.by_sheet_type.forEach(g => { nestBy[g.sheet_id] = Math.ceil(g.sheets_used); });
  const mismatched = sheets.filter(r => {
    const id = Object.keys(nestBy).find(k => r.code === 'SH-' + k.toUpperCase().replace(/[^A-Z0-9]+/g, '-'));
    return id && r.qty !== nestBy[id];
  });
  assert(mismatched.length === 0, 'تعداد برگ دقیقاً همان نستینگ است',
         JSON.stringify(mismatched.map(r => r.code)));
}

console.log('نستینگ نزده = اعتراف، نه عدد ساختگی');
{
  const g = G.build(SNAP, null, EB, BOM);
  assert(g.groups.sheet.length === 0, 'بدون نستینگ ورقی گزارش نمی‌شود');
  assert(g.warnings.some(w => w.indexOf('نستینگ') !== -1),
         'و صریح گفته می‌شود چرا', JSON.stringify(g.warnings));
}

console.log('نوار تخمینی است و پنهان نمی‌شود');
{
  const edges = goods.groups.edge;
  assert(edges.every(r => r.unit === 'متر'), 'واحد نوار «متر» است');
  assert(edges.every(r => r.exact === false),
         'نوار قطعی اعلام نمی‌شود — پرت هر کارگاه فرق دارد');
  assert(goods.estimated === true, 'برگه می‌گوید بعضی اعداد تخمینی‌اند');
  assert(edges.every(r => r.qty >= r.qty_base),
         'گرد کردن هرگز کمتر از متراژ خالص نمی‌دهد');
  assert(edges.every(r => Number.isInteger(r.qty)), 'متراژ سفارش گرد شده است');
}

console.log('کد کالا پایدار است');
{
  // نام یراق از واژه‌نامهٔ کارگاه می‌آید و عوض می‌شود؛ کد نباید عوض شود وگرنه
  // سفارش دفعهٔ بعد با سفارش قبلی نمی‌خواند.
  const renamed = H.bom(SNAP, { glossary: { t: (k, f) => f, hardware: () => 'یک اسم کاملاً دیگر' } });
  const g2 = G.build(SNAP, NEST, EB, renamed);
  const codes = s => s.groups.hardware.map(r => r.code).sort().join(',');
  assert(codes(goods) === codes(g2), 'تغییر نام یراق کد را عوض نمی‌کند',
         codes(goods) + ' vs ' + codes(g2));
  assert(g2.groups.hardware.some(r => r.name === 'یک اسم کاملاً دیگر'),
         'ولی نام نمایشی واقعاً از واژه‌نامه می‌آید');
}

console.log('سطرهای هم‌کالا ادغام می‌شوند');
{
  assert(new Set(goods.rows.map(r => r.group + '|' + r.code + '|' + r.unit)).size === goods.rows.length,
         'هیچ کد کالایی دو بار سفارش نمی‌رود');
}

console.log('ذخیرهٔ اضافه از تنظیمات');
{
  const withSpare = G.build(SNAP, NEST, EB, BOM, { sheet_spare_pct: 100 });
  const base = goods.groups.sheet.reduce((s, r) => s + r.qty, 0);
  const more = withSpare.groups.sheet.reduce((s, r) => s + r.qty, 0);
  assert(more > base, 'ذخیره واقعاً به تعداد اضافه می‌کند', base + ' → ' + more);
  assert(withSpare.groups.sheet.every(r => r.qty === r.qty_base + r.qty_spare),
         'و تفکیکش معلوم است — کارگاه باید بداند چقدرش ذخیره است');
  assert(goods.groups.sheet.every(r => r.qty_spare === 0),
         'پیش‌فرض بدون ذخیره است، نه اینکه بی‌خبر اضافه کند');
}

console.log('یراق قابل حذف است');
{
  const noHw = G.build(SNAP, NEST, EB, BOM, { include_hardware: false });
  assert(noHw.groups.hardware.length === 0, 'کارگاهی که یراق خودش را دارد می‌تواند حذفش کند');
  assert(noHw.groups.sheet.length > 0, 'ولی بقیه سر جایشان می‌مانند');
}

console.log('حالت‌های خالی');
{
  const empty = G.build({}, null, null, null);
  assert(empty.rows.length === 0 && empty.warnings.length > 0,
         'snapshot خالی پیام می‌دهد، نه برگهٔ سفارشِ خالیِ گمراه‌کننده');
  assert(G.build(null, null, null, null).rows.length === 0, 'null نباید بشکند');
}

console.log('\n' + passed + ' گذشت، ' + failed + ' افتاد');
process.exit(failed ? 1 : 0);
