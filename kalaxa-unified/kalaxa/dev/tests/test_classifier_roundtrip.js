/**
 * دقت موتور تشخیص روی هندسهٔ با نقشِ معلوم — اجرا: node test_classifier_roundtrip.js
 *
 * چرا این تست از تست‌های موجودِ classifier قوی‌تر است: آن‌ها جعبه‌های دست‌ساز
 * می‌دهند و انتظارِ دست‌نویس دارند. این یکی از `CabinetGeometry` — یعنی **همان
 * موتوری که کابینت واقعی را می‌سازد** — هندسه می‌گیرد، `key` هر جعبه را به‌عنوان
 * حقیقت زمینی کنار می‌گذارد، و می‌سنجد موتور تشخیص چند درصد را درست حدس می‌زند.
 *
 * کاربر گزارش داد: «قطعات آورد ولی خیلی دقیق و کامل نبود». اندازه‌گیری نشان داد
 * ۹۳٪ — و **هر پنج خطا یک ریشه داشت**: قید ایستادهٔ آرایش L. قید ایستاده زیر قید
 * خوابیده می‌نشیند، پس بالایش یک ضخامتِ بدنه پایین‌تر از سقف است و شرط مطلقِ
 * «چسبیده به سقف» (رواداری ۵mm) ردش می‌کرد. در کابینت تک‌درب «نامشخص» می‌شد و در
 * کابینت کشویی **با اطمینان ۸۰٪ «پشت کشو»** — که بدتر است، چون کاربر به عدد
 * مطمئن اعتماد می‌کند.
 */
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const C = require(path.join(ROOT, 'kalaxa', 'ui', 'kalaxa-part-classifier.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

// حقیقت زمینی از CabinetGeometry (Ruby) — تنها منبعی که هندسهٔ واقعی را می‌داند.
function truthBoxes(template, w, h, d, opts) {
  const rb = `
    $LOAD_PATH.unshift(${JSON.stringify(path.join(ROOT, 'test', 'stubs'))})
    ENV['KALAXA_QUIET']='1'
    require ${JSON.stringify(path.join(ROOT, 'kalaxa', 'lib', 'cabinet_geometry'))}
    require 'json'
    puts JSON.generate(Kalaxa::CabinetGeometry.boxes_for(
      ${JSON.stringify(template)}, ${w}, ${h}, ${d}, ${opts || '{}'}))
  `;
  return JSON.parse(execFileSync('ruby', ['-e', rb], { encoding: 'utf8' }));
}

// یراق در مدل کشیده می‌شود ولی ورق نیست و موتور تشخیص نقشی برایش ندارد.
const HARDWARE = new Set(['leg', 'handle', 'handle_groove', 'slide']);

// «کف» و «سقف/کف» هر دو ورق افقی بدنه‌اند — تفکیکشان کار کاربر است، نه موتور.
function sameRole(truth, guessed) {
  if (truth === guessed) return true;
  const horiz = new Set(['bottom', 'top_bottom']);
  return horiz.has(truth) && horiz.has(guessed);
}

function evaluate(label, template, w, h, d, opts) {
  const boxes = truthBoxes(template, w, h, d, opts);
  const wood = boxes.filter(b => !HARDWARE.has(b.key));

  // ورودی دقیقاً همان شکلی که RawGeometry می‌دهد — بدون key.
  const input = wood.map((b, i) => ({
    id: 'p' + i, name: '', x: b.x, y: b.y, z: b.z, dx: b.dx, dy: b.dy, dz: b.dz
  }));

  const res = C.classify(input);
  const wrong = [];
  res.parts.forEach((p, i) => {
    if (!sameRole(wood[i].key, p.role)) {
      wrong.push(`${wood[i].key} → ${p.role} (${Math.round(p.confidence * 100)}%)`);
    }
  });

  assert(wrong.length === 0, label + ` — هر ${wood.length} قطعه درست`, wrong.join(' ؛ '));
  return { total: wood.length, wrong: wrong.length, parts: res.parts, wood: wood };
}

/* ------------------------------------------------ دقت روی همهٔ تمپلیت‌ها */
console.log('\n[تشخیص] نقش هر قطعه روی هندسهٔ واقعی');
const CASES = [
  ['زمینی تک‌درب (قید L)', 'base_single_door', 80, 72, 55, null],
  ['زمینی سه‌کشو', 'base_three_drawer', 60, 72, 55, null],
  ['سینک دو‌درب', 'base_sink_double_door', 100, 72, 55, null],
  ['هوایی تک‌درب', 'wall_single_door', 80, 72, 32, null],
  ['قدی دو‌درب', 'tall_double_door', 60, 220, 55, null],
  ['بدون قید', 'base_single_door', 80, 72, 55, "{ rail_front: 'none', rail_back: 'none' }"],
  ['قید افقی', 'base_single_door', 80, 72, 55, "{ rail_front: 'h', rail_back: 'h' }"],
  ['کابینت باریک', 'base_single_door', 30, 72, 55, null],
  ['کابینت پهن', 'base_sink_double_door', 120, 72, 60, null],
  ['چهار کشو', 'base_three_drawer', 60, 72, 55, '{ drawer_count: 4 }']
];

const results = [];
let T = 0, W = 0;
for (const [label, tpl, w, h, d, opts] of CASES) {
  const r = evaluate(label, tpl, w, h, d, opts);
  results.push([label, r]);
  T += r.total; W += r.wrong;
}

/* ------------------------------------------------ رگرسیونِ مشخصِ قید ایستاده */
console.log('\n[تشخیص] قید ایستاده — همان باگی که کاربر دید');
{
  const r = results.find(x => x[0].startsWith('زمینی تک‌درب'))[1];
  const rails = r.parts.filter((p, i) => r.wood[i].key === 'rail_top');
  assert(rails.length === 4, 'کابینت با آرایش L چهار قید دارد', 'یافت: ' + rails.length);
  assert(rails.every(p => p.role === 'rail_top'), 'هر چهار قید درست تشخیص داده شدند',
    rails.map(p => p.role).join(','));

  const standing = rails.filter(p => p.box.dz <= 200 && p.box.dy <= 40);
  assert(standing.length === 2, 'دو تای آن‌ها ایستاده‌اند');
  assert(standing.every(p => p.confidence >= 0.8),
    'قید ایستاده با اطمینان بالا شناخته می‌شود، نه «نامشخص»',
    standing.map(p => p.confidence).join(','));
}

console.log('\n[تشخیص] قید ایستاده در کابینت کشویی «پشت کشو» نمی‌شود');
{
  const r = results.find(x => x[0] === 'زمینی سه‌کشو')[1];
  const rails = r.parts.filter((p, i) => r.wood[i].key === 'rail_top');
  assert(rails.every(p => p.role === 'rail_top'),
    'پاس دومِ جعبهٔ کشو نباید قید را بازنویسی کند',
    rails.map(p => p.role).join(','));
}

/* ------------------------------------------------ اعتماد صادقانه */
console.log('\n[تشخیص] اعتماد باید صادقانه باشد');
{
  results.forEach(([label, r]) => {
    const confidentlyWrong = r.parts.filter((p, i) =>
      !sameRole(r.wood[i].key, p.role) && p.confidence >= 0.8);
    assert(confidentlyWrong.length === 0,
      label + ' — هیچ حدسِ غلطی با اطمینان بالا نیست',
      confidentlyWrong.map(p => p.role).join(','));
  });
}

console.log('\n=================================');
console.log(`دقت کلی: ${T - W}/${T} = ${Math.round(((T - W) / T) * 100)}%`);
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed === 0 ? 0 : 1);
