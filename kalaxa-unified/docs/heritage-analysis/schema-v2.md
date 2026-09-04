# Snapshot Schema v2

v2 = v1 + فیلدهای افزودنی (سازگاری کامل رو به عقب):
- `schema_version: 2`
- `stock_offcuts: [{offcut_id, sheet_id, width_mm, height_mm}]` — انبار آفکات
- `scan_stats: {duration_ms, cabinets_found, parts_rows, hidden_skipped}`
- `scan_warnings: []`
- part_uid برای همه قطعات (فایل‌های v1 بدون uid → تولید قطعی `cabinet:key:index` در مهاجرت)

قراردادهای پابرجا از v1: همه ابعاد mm صحیح؛ parts_flat بازنشده (count را nesting باز می‌کند)؛ محور x ورق = width_mm؛ راه چوب ورق در راستای width_mm؛ kerf با ترفند inflate.

مهاجرت: `KalaxaSchema.migrateToV2(snapshot)` — قطعی، تکرارپذیر، ورودی را mutate نمی‌کند.
