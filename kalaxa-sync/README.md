# Kalaxa Sync — افزونهٔ وردپرس (v0.4.0)

> 📘 راهنمای مصور: `docs/guide-fa-kalaxa-sync-wp.pdf`

نقطهٔ همگام‌سازی پاکت‌های `kalaxa-doc` روی kalaxa.ir — فاز اول معماری اتصال‌پذیری
(D-SYNC-4 در docs/SYNC_ARCHITECTURE.md مخزن پلاگین): سرور «نگه‌دارندهٔ امین» پاکت است،
بدنهٔ سند را تفسیر نمی‌کند؛ کلاینت‌ها read-only شروع می‌کنند.

## نصب
پوشهٔ `kalaxa-sync/` را در `wp-content/plugins/` بگذارید و فعال کنید (جدول
`wp_kalaxa_projects` ساخته می‌شود). احراز هویت: **Application Passwords** وردپرس
(پروفایل کاربر ← Application Passwords) با Basic Auth روی HTTPS.

توانایی‌ها: `kalaxa_sync_write` (push) و `kalaxa_sync_read` (pull/status) — ادمین هر دو را
می‌گیرد؛ برای دستگاه‌های read-only کاربری با نقش محدود بسازید و فقط cap خواندن بدهید.

## API (namespace: `kalaxa-sync/v1`)
```
GET  /wp-json/kalaxa-sync/v1/projects                 فهرست (متادیتا)
GET  /wp-json/kalaxa-sync/v1/projects/{uuid}/status   {ok, revision, checksum, schema_version, ...}
GET  /wp-json/kalaxa-sync/v1/projects/{uuid}          pull — envelope خام
POST /wp-json/kalaxa-sync/v1/projects/{uuid}          push — بدنه = envelope خام
```
- push: چک‌سام سرور مستقلاً بازتولید و با پاکت سنجیده می‌شود؛ schema جدیدتر از v3 رد.
- واگرایی (D-SYNC-2): پاسخ **409** با `error.code=KX_SYNC_CONFLICT` + وضعیت سرور در `server`
  — انتخاب نسخه با کاربر (LWW دستی)، سرور merge نمی‌کند. محتوای تکراری → `idempotent:true`.
- `{uuid}` باید با `doc.project.id` داخل پاکت یکی باشد.

نمونه:
```
curl -u user:app-pass https://kalaxa.ir/wp-json/kalaxa-sync/v1/projects/<uuid>/status
curl -u user:app-pass -H 'Content-Type: application/json' \
     --data-binary @envelope.json \
     https://kalaxa.ir/wp-json/kalaxa-sync/v1/projects/<uuid>
```

## راستی‌آزمایی (سهم شما — این محیط ساخت PHP ندارد؛ Unverified تا اجرای شما)
```
php bin/selftest.php
```
۲۰ چک: بازتولید چک‌سام طلایی مخزن پلاگین در PHP (پیاده‌سازی سوم مستقل پس از Ruby/Python)،
استقلال از ترتیب کلید، تمایز `{}`/`[]`، رد float/دستکاری/schema جدیدتر/qty و revision نامعتبر،
پذیرش پاکت میراثی v1، و ماتریس کامل سیاست push. سپس یک push/pull واقعی با curl روی
استیجینگ. نکتهٔ فنی مهم (در کد مستند): چک‌سام از دیکد **شیءمحور** محاسبه می‌شود چون
`json_decode(..., true)` آبجکت خالی `{}` را به `[]` فرومی‌کاهد و چک‌سام را می‌شکند.

## نمایشگر وب read-only (v0.4.0)
پیشخوان ← **Kalaxa Viewer** (توانایی `kalaxa_sync_read` کافی است): فهرست پروژه‌ها،
انتخاب، و رندر کامل سمت مرورگر با همان موتورهای UMD پلاگین — خلاصه، نقشه برش
(پشت دروازهٔ اعتبارسنج مستقل)، نقشه نصب (فقط با جانمایی کامل + هشدار هم‌پوشانی)،
گزارش متریال/نوار لبه، BOM یراق با ادغام صریح. هم-مبدأ با REST → بدون CORS و بدون
اپ‌پسورد در مرورگر (سشن + nonce). هستهٔ رندر (`assets/viewer-core.js`) در Node
تست شده: `node tests/test_viewer_core.js` (۲۲ چک، این‌جا اجراشده و سبز).
موتورها کپی از پلاگین v3.2.0 هستند (`tools/check_engines.py` هم‌نسخگی را چک می‌کند) —
هنگام ارتقای پلاگین، پوشهٔ `assets/engines/` را هم به‌روز کنید.

## لینک اشتراک عمومی (v0.4.0)
از صفحهٔ Viewer برای هر پروژه لینک ۳۰روزه بسازید (`?kalaxa_share=<token>`): توکن ۲۵۶بیتی،
فقط hash در DB، مقایسهٔ زمان-ثابت، قابل ابطال، noindex — مشتری بدون لاگین فقط همان یک
پروژه را می‌بیند. مسیرهای REST: `POST/GET projects/{id}/shares`، `DELETE shares/{hash}`،
`GET share/{token}/envelope` (عمومی). ۷ چک منطق توکن به `bin/selftest.php` اضافه شد (جمعاً ۲۷).

## رفع باگ در v0.4.0 (ممیزی دوروندهٔ کد)
- **(#۲ متوسط-جدی، رِیس شرط):** `push()` قبلاً با `REPLACE INTO` بدون‌قید می‌نوشت — دو Push
  تقریباً هم‌زمان می‌توانستند هر دو از دروازهٔ تعارض عبور کنند و دومی بی‌صدا اولی را پاک
  کند. `Kalaxa_Store::save()` حالا compare-and-swap واقعی دارد (UPDATE فقط با تطبیق
  revisionِ خوانده‌شده، یا INSERT محافظت‌شده با کلید اصلی)؛ شکست CAS حالا ۴۰۹ واقعی
  می‌دهد، نه پاک‌شدن خاموش. **این تغییر DB-محور است و در `bin/selftest.php` (که $wpdb
  ندارد) قابل تست نیست** — فقط با اجرای واقعی وردپرس قابل تأیید است.
- **(#۷ کم):** `Kalaxa_Share::create()` حالا شکست `$wpdb->insert()` را چک می‌کند؛ به‌جای
  لینک مرده (۴۰۴ در اولین استفاده)، خطای ۵۰۰ صریح برمی‌گردد.
- موتورهای `assets/engines/` با پلاگین v3.2.0 هم‌نسخه شدند (`tools/check_engines.py --sync`).

## نقشه بعد
- پیاده‌سازی `HttpSyncPort` سمت پلاگین اسکچاپ (بیرون از هستهٔ آفلاین، طبق D-SYNC-3).
- صفحهٔ نمایش read-only نقشه‌ها/گزارش‌ها با همان موتورهای UMD (کلاینت وب).
