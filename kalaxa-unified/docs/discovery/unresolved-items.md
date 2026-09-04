# unresolved-items.md

طبق قالب خواسته‌شدهٔ سند جدید برای فیلدهای قدیمی مبهم.

## فیلد: `cut_length_mm` (و متقارنش `cut_width_mm`)

| ویژگی | مقدار |
|---|---|
| field | `cut_length_mm` |
| written_by | `KalaxaSettings.applyToSnapshot` (کسر نوار، in-place)، `kalaxa-doc-adapter.js` (مقدار اولیه از `p.length_mm` سند دامنه) |
| read_by | `kalaxa-nesting.js`, `kalaxa-cutmap-svg.js`, `kalaxa-report.js`, `kalaxa-hardware.js`, `kalaxa-price-sheet.js` — عملاً همهٔ موتورها |
| unit | میلی‌متر، عدد صحیح (شواهد: مقادیر همیشه صحیح در fixtureها) |
| semantic meaning | **دوپهلو، اثبات‌شده در کد**: قبل از `applyToSnapshot` = اندازهٔ نهایی (finished)؛ بعد از `applyToSnapshot` با نوار روشن = اندازهٔ بلانک (blank). **هیچ نشانه‌ای در نام فیلد این تفاوت را نشان نمی‌دهد.** |
| calculation | `finished - Σ(ضخامت نوار در راستای طول)` وقتی `edge_band.body.subtract=true`؛ در غیر این صورت بدون تغییر |
| default | مقدار اولیهٔ سند دامنه (`p.length_mm`)، بدون پیش‌فرض جداگانه |
| null behavior | اگر `null`/`undefined` باشد، عملیات ریاضی بعدی (نستینگ) با `NaN` یا خطای صامت مواجه می‌شود — **آزمون explicit برای این حالت پیدا نشد** |
| migration target | `finished_length_mm` (قبل از کسر) + `blank_length_mm` (بعد از کسر) — دو فیلد جدا طبق سند |
| evidence | مستقیم از کد (`kalaxa-settings.js:applyToSnapshot`, خط کسر نوار) |
| confidence | بالا برای «چه اتفاقی می‌افتد»؛ **پایین برای «آیا caller همیشه از snapshot خام صدا می‌زند» (ریسک R... در known-risks.md مربوط به idempotency)** |

## فیلد: `groove[side]` (مقدار عددی، نه فقط بولین)

| ویژگی | مقدار |
|---|---|
| field | `groove.front`/`back`/`top`/`bottom` |
| written_by | فقط در fixture دستی (`golden_kitchen_snapshot.json`)؛ **`kalaxa-doc-adapter.js` همیشه `groove: {}` تولید می‌کند** — یعنی مسیر واقعی نوشتن از سند دامنهٔ اسکچاپ اصلاً وجود ندارد |
| read_by | `kalaxa-cutmap-svg.js` (رسم علامت + آفست تصویری)، `kalaxa-report.js` (کد شیار در برچسب) |
| unit | مقدار عددی = آفست از لبه به میلی‌متر (استنتاج از کد رسم: `Math.min(Math.max((p.groove[name]||8)*scale, 5), ...)`) — **این تفسیر از کد رندر استنتاج شده، در هیچ کامنتی صریح تعریف نشده؛ `confidence: متوسط`** |
| semantic meaning | حضور شیار روی آن ضلع + عمق/فاصلهٔ آن از لبه (مبهم بین «عمق شیار» و «فاصلهٔ شیار از لبه» — کد رندر آن را به‌عنوان فاصلهٔ تصویری از لبه استفاده می‌کند، نه عمق برش) |
| calculation | — (فقط نمایشی، در محاسبات نستینگ/برش اثر ندارد) |
| default | `{}` (بدون شیار) |
| null behavior | امن — چک `if (!p.groove[name]) return` همه‌جا |
| migration target | باید مشخص شود آیا `groove` هم مثل `miter`/`bevel` باید fold-entity شود یا واقعاً یک ویژگی per-edge ساده است (شیار برخلاف فارسی‌بر، **واقعاً per-edge معنا دارد** — شیار روی یک ضلع برای جاگیری پشت‌بند، نه محل برخورد دو قطعه؛ این با miter/bevel فرق دارد) |
| evidence | مستقیم از کد رندر + عدم وجود نویسندهٔ واقعی در آداپتور سند |
| confidence | بالا برای «structurally چطور کار می‌کند»، پایین برای «معنای دقیق عدد» |

## فیلد: `project.price_sheet` (کاملاً جدید این نشست — یادداشت شفافیت، نه ابهام قدیمی)

بدون ابهام میراثی؛ مستقیماً طراحی این نشست است. مسیر ماندگاری‌اش («ذخیره در مدل») تأیید نشده که واقعاً کجا می‌رود (ر.ک. `data-flow.md`، بند تنظیمات پروژه) — **این خودش یک آیتم `unresolved` جدید است، نه میراثی.**

## نام محصول: Kabinetyar در برابر Kalaxa

**حل‌شده توسط کاربر در این نشست:** نام واقعی محصول **Kalaxa** است (تأیید صریح). سند جدید («Kabinetyar») یا از نسخهٔ اولیه‌تر نام‌گذاری کپی شده یا نام‌گذاری داخلی/غیررسمی بوده. **اقدام:** در اسناد بعدی این فاز، نام «Kalaxa» به‌عنوان `TARGET_PRODUCT_NAME` استفاده می‌شود؛ عنوان سند مرجع دست‌نخورده می‌ماند (تغییرش وظیفهٔ این فاز نیست).
