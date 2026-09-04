/**
 * تست واژگان کارگاه سمت JS — اجرا: node test_glossary.js
 *
 * آینهٔ lib/glossary.rb. دو نیاز جدا:
 *   «کلمات و اصطلاحات قابل تغییر باشه» — بازنویسی کاربر روی هر کلید.
 *   «قسمت زبان فایل جداگانه قابل ترجمه داشته باشه» — هر زبان یک فایل.
 * این‌جا اضافه بر آن، تضمین می‌شود که موتور یراق واقعاً از واژه‌نامه بخواند و
 * item_id (که جدول قیمت رویش کلید می‌خورد) از تغییر واژه در امان بماند.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const UI = path.join(__dirname, '..', '..', 'ui');
const I18N = path.join(__dirname, '..', '..', 'i18n');
const Glossary = require(path.join(UI, 'kalaxa-glossary.js'));
const Hardware = require(path.join(UI, 'kalaxa-hardware.js'));

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
}

function bundle(locale) {
  return JSON.parse(fs.readFileSync(path.join(I18N, locale + '.json'), 'utf8'));
}

function make(locale, overrides) {
  const terms = Object.assign({}, bundle(locale), overrides || {});
  return Glossary.create({
    locale: locale, terms: terms,
    overridden: Object.keys(overrides || {}),
    alternatives: JSON.parse(fs.readFileSync(path.join(I18N, 'alternatives.fa.json'), 'utf8'))
  });
}

/* ------------------------------------------------- لایهٔ ترجمه: فایل هر زبان */
console.log('\n[ترجمه] هر زبان یک فایل مستقل');
{
  const fa = bundle('fa'), en = bundle('en');
  const faKeys = Object.keys(fa).sort(), enKeys = Object.keys(en).sort();
  assert(JSON.stringify(faKeys) === JSON.stringify(enKeys),
    'fa و en دقیقاً یک مجموعه کلید دارند',
    'اختلاف: ' + faKeys.filter(k => enKeys.indexOf(k) === -1).join(', '));
  assert(fa['part.side'] === 'دیواره' && en['part.side'] === 'Side panel',
    'اصطلاحات دامنه هم ترجمه‌شده‌اند، نه فقط متن رابط');
  assert(fa['term.reveal'] === 'بادخور',
    'واژهٔ پیش‌فرض کارگاه کاربر برای reveal «بادخور» است');
}

/* ------------------------------------------------------- بازنویسی کارگاه */
console.log('\n[واژگان] بازنویسی کاربر');
{
  const g = make('fa', { 'term.reveal': 'عاصف' });
  assert(g.t('term.reveal') === 'عاصف', 'بازنویسی بر پیش‌فرض غالب است');
  assert(g.isOverridden('term.reveal'), 'کلید بازنویسی‌شده علامت می‌خورد');
  assert(!g.isOverridden('part.side'), 'کلید دست‌نخورده علامت نمی‌خورد');
  assert(make('fa', {}).t('term.reveal') === 'بادخور', 'بدون بازنویسی، پیش‌فرض');
}

console.log('\n[واژگان] زبان‌ها از هم جدا می‌مانند');
{
  assert(make('en', {}).t('term.reveal') === 'Reveal',
    'بازنویسی فارسی روی خروجی انگلیسی نمی‌نشیند');
}

console.log('\n[واژگان] مقاومت');
{
  const g = make('fa', {});
  assert(g.t('part.nonexistent') === 'part.nonexistent',
    'کلید ناشناخته خودش را برمی‌گرداند، نه استثنا');
  assert(g.t('part.nonexistent', 'جایگزین') === 'جایگزین', 'fallback صریح محترم است');
  const empty = Glossary.create({});
  assert(empty.t('part.side') === 'part.side',
    'واژه‌نامهٔ تهی هیچ موتوری را نمی‌شکند');
}

/* ------------------------------------------------------ کمکی‌های کلیددار */
console.log('\n[واژگان] حل نام از روی کلید قطعه');
{
  const g = make('fa', { 'part.side': 'بغل' });
  assert(g.part('side') === 'بغل',
    'نام قطعه از key حل می‌شود — پس تغییر واژه روی کابینت‌های قدیمی هم اثر می‌کند');
  assert(g.part('drawer_front') === 'نمای کشو', 'قطعهٔ دست‌نخورده پیش‌فرض می‌ماند');
  assert(g.hardware('hinge') === 'لولا آرام‌بند', 'نام یراق از کلید');
  assert(g.hardware('slide_450') === 'ریل کشو 450', 'ریل با سایزش ترکیب می‌شود');
  assert(g.unit('pair') === 'جفت' && g.template('base_single_door').indexOf('زمینی') !== -1,
    'واحد و نوع کابینت هم از واژه‌نامه');
}

console.log('\n[واژگان] دامنهٔ ویرایش');
{
  const g = make('fa', {});
  assert(g.isEditable('part.side') && g.isEditable('term.reveal') && g.isEditable('hw.hinge'),
    'واژگان کارگاه قابل ویرایش است');
  assert(!g.isEditable('app.title') && !g.isEditable('panel.language') && !g.isEditable('error.reload'),
    'متن رابط کارِ مترجم است، نه واژگان کارگاه');
  const keys = g.editableKeys();
  assert(keys.indexOf('app.title') === -1 && keys.indexOf('part.side') !== -1,
    'editableKeys همان مرز را رعایت می‌کند');
}

console.log('\n[واژگان] پیشنهاد هم‌معنی');
{
  const g = make('fa', {});
  assert(g.suggestions('term.reveal').indexOf('عاصف') !== -1,
    '«عاصف» به‌عنوان هم‌معنیِ بادخور پیشنهاد می‌شود');
  assert(g.suggestions('part.nonexistent').length === 0, 'کلید بی‌پیشنهاد آرایهٔ خالی');
}

/* ------------------------------------------------ اتصال به موتور یراق */
console.log('\n[یراق] BOM از واژه‌نامه می‌خواند');
{
  const snap = {
    cabinets: [{ kalaxa_id: 'c1', category: 'base', label_fa: 'کابینت',
                 params: { cabinet_width: 80, cabinet_depth: 55 } }],
    parts_flat: [{ cabinet_id: 'c1', key: 'door', count: 1, cut_length_mm: 716, cut_width_mm: 796 }]
  };

  const plain = Hardware.bom(snap);
  const hingeDefault = plain.items.find(i => i.item_id === 'hinge');
  assert(hingeDefault.name_fa === 'لولا آرام‌بند' && hingeDefault.unit === 'عدد',
    'بدون واژه‌نامه، همان رشتهٔ پیش‌فرض قبلی — snapshot قدیمی دست‌نخورده');

  const g = make('fa', { 'hw.hinge': 'لولا فشاری', 'unit.piece': 'دانه' });
  const custom = Hardware.bom(snap, { glossary: g });
  const hinge = custom.items.find(i => i.item_id === 'hinge');
  assert(hinge.name_fa === 'لولا فشاری', 'نام یراق از واژه‌نامهٔ کارگاه می‌آید');
  assert(hinge.unit === 'دانه', 'واحد هم قابل تغییر است');
  assert(hinge.item_id === 'hinge',
    'item_id هرگز تغییر نمی‌کند — جدول قیمت رویش کلید می‌خورد، نه روی نام');
  assert(hinge.qty === plain.items.find(i => i.item_id === 'hinge').qty,
    'تغییر واژه هیچ عددی را جابه‌جا نمی‌کند');

  const en = Hardware.bom(snap, { glossary: make('en', {}) });
  assert(en.items.find(i => i.item_id === 'hinge').name_fa === 'Soft-close hinge',
    'با زبان انگلیسی، BOM انگلیسی می‌شود');
}

console.log('\n=================================');
console.log('نتیجه: ' + passed + ' موفق، ' + failed + ' ناموفق');
process.exit(failed === 0 ? 0 : 1);
