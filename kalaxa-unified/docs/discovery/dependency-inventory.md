# dependency-inventory.md

## وابستگی‌های خارجی — نتیجه: **صفر**

بازرسی مستقیم: هیچ `Gemfile`, `package.json`, `composer.json` در هیچ‌کدام از سه مخزن وجود ندارد. هیچ `require 'گوهر-غیر-استاندارد'` در Ruby دیده نشد (فقط کتابخانهٔ استاندارد: `json`, `securerandom`, `time`, `net/http`, `uri`, `fileutils`, `tmpdir`, `minitest`). هیچ `import`/`require(...)` بین فایل‌های JS در مرورگر نیست — همه با `<script src>` ترتیبی لود می‌شوند و از `window.KalaxaX` استفاده می‌کنند (الگوی UMD).

**پیامد برای SBOM سند جدید:** SBOM این پروژه عملاً خالی از وابستگی شخص‌ثالث است — کل ریسک زنجیرهٔ تأمین (`dependency compromise`, `update-channel compromise`) که سند نگران آن است، **در وضعیت فعلی صفر است چون هیچ وابستگی‌ای وجود ندارد.** این نکته مثبت است، نه نقص گزارش.

## ترتیب بارگذاری اسکریپت‌ها در `kalaxa/ui/analysis_panel.html` (وابستگی ضمنی ترتیبی، نه import صریح)

```
kalaxa-settings.js
kalaxa-offcut-store.js
kalaxa-schema.js
kalaxa-nesting.js
kalaxa-nesting-validator.js
kalaxa-cutmap-svg.js
kalaxa-install-map.js
kalaxa-cabinet-view.js
kalaxa-report.js
kalaxa-rules.js
kalaxa-hardware.js
kalaxa-price-sheet.js
kalaxa-placement.js
kalaxa-scenarios.js
```
هیچ فایلی در این لیست به فایل دیگری با `require`/`import` وابسته نیست به‌جز از طریق `window.KalaxaX` گلوبال — یعنی **ترتیب فوق تنها به این دلیل مهم است که در Node.js (تست‌ها) هرکدام مستقیم `require()` می‌شوند** (بدون وابستگی به ترتیب)، ولی در مرورگر HtmlDialog باید قبل از استفاده لود شده باشند.

## ابزار توسعه/بیلد (نه وابستگی رانتایم)

- `tools/build_rbz.rb` — بستهٔ RBZ را می‌سازد؛ به دستور خط فرمان سیستم `zip` یا PowerShell `Compress-Archive` وابسته است (نه گوهر Ruby).
- `kalaxa-sync/tools/check_engines.py` — نگهبان هم‌نسخگی موتورها بین دو مخزن؛ فقط کتابخانهٔ استاندارد پایتون.
- `kalaxa-unified/tools/verify_data_spec.py` — بازرسی نشد در این فاز.

## در این نشست (خارج از سورس محصول، فقط برای تأیید توسعه)

Ruby 3.2.9 پرتابل (RubyInstaller) در پوشهٔ scratchpad برای اجرای Ruby unit tests — **بخشی از محصول نیست**، فقط ابزار تأیید محیط توسعه که اسکچاپ ندارد.
