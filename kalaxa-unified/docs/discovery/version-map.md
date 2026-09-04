# version-map.md — نقشهٔ نسخهٔ سه مخزن (Discovery Phase، Upgrade Mode)

تولید: خودکار + بازرسی دستی. بدون تغییر کد.

## نسخهٔ محصول هر مخزن

| مخزن | فایل نسخه | نسخه | آخرین تغییر معنادار |
|---|---|---|---|
| `kalaxa-unified` | `kalaxa/version.rb` | **3.11.1** | شیت قیمت کامل + رفع باگ ورق تعریف‌شده/استفاده‌نشده |
| `kalaxa-sync` | `kalaxa-sync.php` (`KALAXA_SYNC_VERSION`) | **0.4.0** | بدون تغییر این دور |
| `kalaxa-sync-client` | `kalaxa_sync_client.rb` (`VERSION`) | **0.2.1** | بدون تغییر این دور |

هر سه شمارهٔ نسخه در فایل مستقل خودشان hardcode شده‌اند — **هیچ منبع نسخهٔ مشترک بین سه مخزن وجود ندارد.** (ریسک مستند در `known-risks.md`)

## نسخهٔ ماژول‌های JS داخل kalaxa-unified/kalaxa/ui/

هرکدام UMD مستقل با `VERSION` داخلی خودشان — **بدون ربط منطقی به نسخهٔ کل پلاگین** (نسخه‌گذاری هر فایل جدا و دستی است):

| فایل | نسخه |
|---|---|
| `kalaxa-cabinet-view.js` | 1.0.0 |
| `kalaxa-cutmap-svg.js` | 1.5.0 |
| `kalaxa-doc-adapter.js` | 1.3.0 |
| `kalaxa-hardware.js` | 1.2.0 |
| `kalaxa-install-map.js` | 1.1.0 |
| `kalaxa-nesting.js` | 1.2.0 |
| `kalaxa-nesting-validator.js` | 1.0.0 |
| `kalaxa-offcut-store.js` | 1.0.0 |
| `kalaxa-placement.js` | 1.3.0 |
| `kalaxa-price-sheet.js` | 1.1.0 |
| `kalaxa-report.js` | 1.4.0 |
| `kalaxa-rules.js` | 1.1.0 |
| `kalaxa-scenarios.js` | 1.1.0 |
| `kalaxa-schema.js` | 1.0.0 |
| `kalaxa-settings.js` | 1.8.0 |

فایل‌های بدون هدر VERSION قابل‌استخراج خودکار: `kalaxa-nesting.js` توابع کمکی، `analysis_panel.html` (فایل اصلی UI — بدون نسخهٔ مستقل، فقط تابع `onVersion` نسخهٔ کل پلاگین را از Ruby نمایش می‌دهد).

## کپی موازی موتورها بین دو مخزن (ریسک شناخته‌شده و مستندشده در خود پروژه)

`kalaxa-sync/assets/engines/*.js` نسخهٔ **کپی‌شده** از زیرمجموعه‌ای از موتورهای `kalaxa-unified/kalaxa/ui/*.js` است (برای نمایشگر وب read-only سمت وردپرس). فایل‌های کپی‌شده طبق `kalaxa-sync/tools/check_engines.py`:
```
kalaxa-cutmap-svg.js, kalaxa-doc-adapter.js, kalaxa-hardware.js, kalaxa-install-map.js,
kalaxa-nesting.js, kalaxa-nesting-validator.js, kalaxa-placement.js, kalaxa-report.js, kalaxa-schema.js
```
هم‌نسخگی با `sha256` هر فایل چک می‌شود (نه با شمارهٔ نسخهٔ داخلی). در زمان این snapshot: **هم‌نسخه** (آخرین اجرای `check_engines.py --sync` در نشست قبلی موفق بود).

**توجه مهم:** `kalaxa-settings.js` و `kalaxa-price-sheet.js` در این فهرست کپی نیستند — یعنی منطق تنظیمات پروژه/شیت قیمت فقط در افزونهٔ اسکچاپ است، در نمایشگر وب وردپرس دیده نمی‌شود. این عمداً است (وردپرس فقط نمایشگر است) ولی جایی صریح مستند نشده که «این موتورها عمداً کپی نمی‌شوند» در برابر «این موتورها را فراموش کرده‌ایم کپی کنیم». وضعیت: `unresolved` تا شواهد بیشتر.
