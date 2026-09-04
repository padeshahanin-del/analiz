/** بنچمارک واقعی — اجرا: node bench_nesting.js  (نتیجه در benchmark_report.md ثبت می‌شود) */
'use strict';
const fs = require('fs'), path = require('path');
const UI = path.join(__dirname, '..', '..', 'ui');
const Nesting = require(path.join(UI, 'kalaxa-nesting.js'));
const Validator = require(path.join(UI, 'kalaxa-nesting-validator.js'));
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'golden_kitchen_snapshot.json'), 'utf8'));

function gen(n) {
  const parts = [];
  for (let i = 0; i < n; i++) parts.push({
    part_uid: 'p' + i, cabinet_id: 'c' + (i % 20), key: 'k', name_fa: 'ق' + i, count: 1,
    cut_length_mm: 150 + (i * 137) % 1200, cut_width_mm: 120 + (i * 211) % 700,
    thickness_mm: 16, sheet_id: 's1', grain: 'none', allow_rotation: true, edge: {}, groove: {}
  });
  return { schema_version: 2, snapshot_id: 'bench', stock_offcuts: [],
    sheets: [{ sheet_id: 's1', material: 'mdf', color_code: 'W', thickness_mm: 16,
      width_mm: 3660, height_mm: 1830, has_grain: false, trim_margin_mm: 10 }],
    cutting: { kerf_mm: 4, allow_rotation_default: true, min_offcut_mm: 100 },
    cabinets: [], parts_flat: parts };
}
function bench(label, snap, runs) {
  const times = [];
  let r;
  for (let i = 0; i < runs; i++) {
    const t0 = process.hrtime.bigint();
    r = Nesting.run(snap);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  const tv0 = process.hrtime.bigint();
  const v = Validator.validate(snap, r);
  const tv = Number(process.hrtime.bigint() - tv0) / 1e6;
  times.sort((a, b) => a - b);
  return { label, n: snap.parts_flat.reduce((s, p) => s + p.count, 0),
    median_ms: times[Math.floor(times.length / 2)].toFixed(1),
    min_ms: times[0].toFixed(1), max_ms: times[times.length - 1].toFixed(1),
    sheets: r.total_sheets, valid: v.ok, validate_ms: tv.toFixed(1) };
}
const rows = [
  bench('S — fixture طلایی (۵۳ قطعه، ۴ ورق‌نوع)', fx, 20),
  bench('M — ۳۰۰ قطعه', gen(300), 10),
  bench('L — ۱۰۰۰ قطعه', gen(1000), 5),
  bench('XL — ۳۰۰۰ قطعه', gen(3000), 3)
];
const env = 'Node ' + process.version + ' — ' + new Date().toISOString();
let md = '# گزارش بنچمارک nesting — v1.2.0\n\nمحیط: ' + env + '\n';
md += 'هر عدد median چند اجرا؛ ۶ استراتژی هم‌زمان در هر اجرا.\n\n';
md += '| مورد | نمونه | median (ms) | min | max | ورق | اعتبارسنج مستقل | زمان اعتبارسنجی (ms) |\n|---|---|---|---|---|---|---|---|\n';
rows.forEach(r => md += `| ${r.label} | ${r.n} | ${r.median_ms} | ${r.min_ms} | ${r.max_ms} | ${r.sheets} | ${r.valid ? '✓' : '✗'} | ${r.validate_ms} |\n`);
md += '\nنکته صداقت: بنچمارک مقایسه‌ای «قبل» برای v1.1.0 ثبت نشده بود؛ این جدول Baseline رسمی v1.2.0 است و ادعای بهبود سرعت نسبت به نسخه قبل نمی‌شود.\n';
fs.writeFileSync(path.join(__dirname, 'benchmark_report.md'), md);
console.log(md);
