# data-flow.md — جریان داده (اثبات‌شده از کد، بدون فرض)

```
اسکچاپ (مدل سه‌بعدی، واحد داخلی inch)
   │  ProjectScanner.build_snapshot (Ruby)  — مرز تبدیل واحد؛ خروجی JSON با ابعاد کابینت به cm
   ▼
snapshot (JSON) ──window.onSnapshot──▶ JS state.snapshot خام
   │
   ├─▶ KalaxaSchema.migrateToV2            (اعتبارسنجی/مهاجرت ساختار)
   ├─▶ KalaxaSettings.applyToSnapshot       (نگاشت ورق نقش‌محور + کسر نوار IN-PLACE + تزریق project.*)
   ├─▶ KalaxaNesting.run                    (چیدمان قطعات روی ورق‌ها)
   ├─▶ KalaxaNestingValidator.validate      (دروازهٔ کیفیت مستقل — رد=قفل چاپ)
   │
   ├──▶ رندر تب‌ها (خالص UI، بدون تغییر داده):
   │      kalaxa-cutmap-svg / kalaxa-install-map / kalaxa-cabinet-view /
   │      kalaxa-report / kalaxa-hardware / kalaxa-price-sheet / kalaxa-rules
   │
   └─▶ (اختیاری) window.sketchup.save_snapshot(json) ──▶ Ruby: File.write کنار مدل یا در Dir.tmpdir
                                                          (نه در AttributeDictionary — مسیر جدا از persistence سند دامنه)
```

## دو مسیر ذخیره‌سازی کاملاً جدا (شواهد مستقیم — نکتهٔ حیاتی برای Data Ownership Matrix)

1. **«سند دامنه»** (schema v3، جانمایی/placement): `Adapter::Store` → `AttributeDictionary` مدل اسکچاپ. این مسیر «منبع حقیقت» طراحی/جانمایی است.
2. **«اسنپ‌شات تحلیلی»** (خروجی `scan_model`، شامل nesting/BOM/قیمت): در حافظهٔ JS پنل زندگی می‌کند؛ فقط با کلیک صریح «ذخیره snapshot» به فایل روی دیسک نوشته می‌شود (نه در مدل).
3. **«تنظیمات پروژه»** (`project.*` — ورق‌ها/نوار/علائم/قیمت): با کلیک «ذخیره در مدل» → از طریق `window.sketchup.save_settings` → مسیر ذخیرهٔ آن **در این فاز کشف رهگیری کامل نشد** (فایل Ruby سمت‌ گیرندهٔ `save_settings` بازرسی نشد؛ فرض محتمل بر اساس الگوی مشابه `save_offcut_inventory`: یک JSON کنار مدل یا در پوشهٔ دادهٔ کاربر، **نه در AttributeDictionary** — `unresolved`، نیاز به بازرسی مستقیم Ruby).

**پیامد برای Data Ownership Matrix خواستهٔ سند:** همین حالا **سه مالک دادهٔ متفاوت** برای سه دسته داده در حالت آفلاین وجود دارد (مدل اسکچاپ / فایل کناری / حافظهٔ گذرای JS) — دقیقاً همان چندگانگی که سند جدید می‌خواهد صریح مستند شود، نه با عبارت کلی «یک منبع حقیقت».

## مرز تبدیل واحد (شواهد مستقیم)

- اسکچاپ → snapshot: تبدیل inch→mm/cm در Ruby (`project_scanner.rb`، بازرسی سطحی، نه کامل).
- `snapshot.cabinets[].params.cabinet_width/height/depth` = **cm** (قرارداد میراثی، در چند فایل صریح کامنت شده: «cm×۱۰ → mm»).
- `snapshot.parts_flat[].cut_length_mm/cut_width_mm/thickness_mm` = **mm عدد صحیح**.
- نمایش کاربر (`display.unit`) = فقط لایهٔ نمایشی در `analysis_panel.html`؛ تبدیل mm→cm در لحظهٔ رندر (`toUnit`/`fromUnit` در `kalaxa-settings.js`)، **هرگز روی دادهٔ ذخیره‌شده اثر نمی‌گذارد** (شواهد: تست‌های رفت‌وبرگشت واحد در `test_project_settings.js`).

این یعنی سه واحد متفاوت (inch اسکچاپ، cm کابینت، mm قطعه) در سه لایهٔ مختلف — **دقیقاً همان الگویی که سند جدید می‌خواهد با یک قرارداد واحد داخلی (میکرومتر صحیح یا دهدهی کنترل‌شده + ADR) یکدست شود.**
