# مدل داده — نسخهٔ Schema: 2

## اصول
- مستقل از هندسه؛ منبع حقیقت واحدِ همهٔ خروجی‌های تولید.
- همهٔ طول‌ها Integer میلی‌متر؛ Float در سند ممنوع (Canonical آن را رد می‌کند).
- هر موجودیت UUID v4 دارد؛ کلیدها فقط String.

## ساختار سند
```
{ "project": {id, name, created_at, settings{unit_system}},
  "entities": {
    spaces[]:    {id, name, width_mm, depth_mm, height_mm}
    materials[]: {id, name, kind: sheet|edgeband|solid, thickness_mm, sheet_width_mm?, sheet_length_mm?}
    units[]:     {id, space_id→spaces, name, kind: base|wall|tall, width_mm, depth_mm, height_mm, params{}}
    parts[]:     {id, unit_id→units, material_id→materials, name, role, length_mm, width_mm, thickness_mm,
                  grain: length|width|none, edgebanding{l1,l2,w1,w2 → material(kind=edgeband)|null}}
    hardware[]:  {id, unit_id→units, name, kind: hinge|slide|handle|connector|leg, qty, sku?}
    operations[]:{id, part_id→parts, kind: drill|groove|cut, params{}}
    issues[]:    {id, severity: FATAL|ERROR|WARNING|INFO, code, message, entity_id?} } }
```

## پاکت ذخیره‌سازی (AttributeDictionary `kalaxa`، کلید `doc_envelope`)
`{ format:"kalaxa-doc", schema_version:2, checksum:sha256(canonical(doc)), doc }`
- Canonical: کلیدهای مرتب، بدون فاصله، UTF-8 خام؛ مشخصات در persistence/canonical.rb و پیاده‌سازی مرجع مستقل در tools/verify_data_spec.py.
- پاکت‌های میراثی v1 چک‌سام ندارند (D-016).
- Snapshot: کلیدهای `snapshot:<uuid>` + `snapshot_index`؛ نگاشت هندسه: attr `uuid` روی هر Instance؛ کپی کاربر ⇒ uuid تکراری ⇒ فقط گزارش (scan_instances)، اصلاح خاموش ممنوع.

## مهاجرت
فقط رو-به-جلو، زنجیره‌ای، روی کپی. v1→v2: thickness→thickness_mm با گرد نیم‌بالا؛ افزودن edgebanding و unit_system. سند جدیدتر از پلاگین ⇒ SchemaVersionError با الزام حالت فقط‌خواندنی.

## تشخیص خرابی و بازیابی امن
JSON خراب / پاکت ناشناخته / چک‌سام نامعتبر / سند نامعتبر ⇒ CorruptDataError کنترل‌شده؛ safe_load هرگز استثنا نمی‌دهد و raw را برای پشتیبان‌گیری حفظ می‌کند؛ هیچ اصلاح یا حذف خاموشی وجود ندارد.
