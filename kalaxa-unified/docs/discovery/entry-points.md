# entry-points.md — نقاط ورود سه مخزن (Discovery Phase)

## kalaxa-unified

1. **بارگذاری افزونه در اسکچاپ**: `kalaxa.rb` (ریشهٔ مخزن) → `Sketchup.register_extension` با `SketchupExtension` که `kalaxa/main.rb` را به‌عنوان فایل بوت معرفی می‌کند.
2. **بوت اصلی**: `kalaxa/main.rb` → `Kalaxa::Main.boot` → `require_relative` زنجیرهٔ کامل هستهٔ Ruby (`version, app/paths, app/logging, app/errors, app/settings, i18n/i18n, domain/entities, domain/document, persistence/serializer, adapter/store, adapter/sync_port, ui/dialog, analysis_panel`) → `register_menu` (اگر `::UI` در دسترس باشد؛ منوی «Kalaxa | کالاکسا» با ۴ آیتم).
3. **پنل اصلی (نقطهٔ ورود واقعی کاربر)**: منو «آنالیز برش و بهینه‌سازی ورق» → `Kalaxa::AnalysisPanel.show_dialog` (`kalaxa/analysis_panel.rb`) → `::UI::HtmlDialog.new` با `set_file(kalaxa/ui/analysis_panel.html)`.
4. **پل Ruby↔JS**: ۹ کال‌بک ثبت‌شده در `register_callbacks`: `scan_model, load_settings, save_settings, load_offcut_inventory, save_offcut_inventory, save_snapshot, load_doc, save_placements, export_print, export_labels, close_dialog`. هر کال‌بک با `push_json(dialog, event_name, payload)` جواب می‌دهد که در JS به `window.onXxx` نگاشت می‌شود.
5. **نقطهٔ ورود مستقل توسعه (بدون اسکچاپ)**: `analysis_panel.html` قابل باز شدن مستقیم در مرورگر است (بدون `window.sketchup`)؛ حالت "dev-loader" با آپلود فایل JSON جایگزین اسکن مدل می‌شود. **این مسیر جایگزین در این نشست کشف/استفاده شد، در سند اصلی مستند رسمی محصول نیست** (اما در کد وجود دارد و عمداً پشتیبانی می‌شود — `var inSketchUp = !!(window.sketchup)`).
6. **موتور دیگر (بدون UI)**: `kalaxa/lib/project_scanner.rb` → `ProjectScanner.build_snapshot`/`export_snapshot` — نقطهٔ واقعی خواندن مدل سه‌بعدی اسکچاپ، صدا زده‌شده از `analysis_panel.rb#scan_model` callback.

## kalaxa-sync (وردپرس)

- `kalaxa-sync.php` → `register_activation_hook`/فراخوانی کلاس‌های `includes/class-kalaxa-*.php` (admin, canonical, envelope, push-policy, rest, share, store).
- REST API: `class-kalaxa-rest.php` (namespace `kalaxa-sync/v1`، مسیرهایی مثل `/projects/{id}`, `/projects/{id}/status`).
- نمایشگر عمومی: `assets/viewer.js`/`viewer-core.js`/`viewer-public.js` (مصرف‌کنندهٔ کپی موتورهای بخش قبل).

## kalaxa-sync-client (اکستنشن اسکچاپ)

- `kalaxa_sync_client.rb` → `SketchupExtension` → `kalaxa_sync_client/main.rb` → منوی «Kalaxa Sync» با ۴ آیتم (وضعیت سرور/Push/Pull/تنظیمات) — **فقط وقتی هستهٔ `kalaxa-unified` بارشده باشد** (`core_loaded?` چک می‌کند `Kalaxa::Adapter::Store`, `Kalaxa::Persistence::Serializer`, `Kalaxa::App::Paths` تعریف‌شده باشند).
- منطق: `kalaxa_sync_client/client.rb` (هماهنگ‌کننده) + `sync_flow.rb` (منطق تصمیم Push/Pull، بدون شبکه) + `http_sync_port.rb` (پیاده‌سازی HTTP قرارداد `Adapter::SyncPort`).

## وضعیت شناخته‌شده حساس در نقاط ورود

باگ #۱۲ (رفع‌شده در v3.9.0 این مخزن، پیش از این نشست) دقیقاً در همین لایهٔ بوت رخ می‌داد: سایه‌اندازی `Kalaxa::UI` (تعریف‌شده در `kalaxa/ui/dialog.rb` و `kalaxa/ui/bridge.rb`) بر `::UI` اسکچاپ، در نقاط ۳ و بالا (بوت `kalaxa-sync-client`). **این خودِ نمونهٔ دقیقی است که سند قرارداد جدید («از `<ProductNamespace>::UI` استفاده نکن») می‌خواهد جلویش گرفته شود** — یعنی محدودیت سند دقیقاً یک باگ واقعی قبلاً کشف‌شده در همین کد را پیش‌گیری می‌کرد.
