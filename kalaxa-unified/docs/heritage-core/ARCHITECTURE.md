# معماری — کالاکسا

## نمای لایه‌ای
UI (HtmlDialog، TypeScript) ⇄ پل پیام (JSON RPC داخلی) ⇄ Application Layer (Ruby) ⇄ Domain Core (Ruby خالص) ⇄ SketchUp Adapter (تنها نقطهٔ تماس با Sketchup::* API)

قاعدهٔ وابستگی: وابستگی فقط از بیرون به داخل. Domain Core هیچ require از SketchUp و هیچ ارجاعی به UI ندارد و خارج از اسکچاپ اجرا و تست می‌شود.

## ماژول‌ها (فضای نام Kalaxa)
- Kalaxa::Domain — موجودیت‌ها (Project, Cabinet, Part, Panel, Edgeband, Hardware, Joint)، پارامترها، موتور بازتولید، موتور قوانین، محاسبات BOM/برش. Ruby خالص.
- Kalaxa::Persistence — سریال‌سازی JSON، schema_version، مهاجرت‌ها. Ruby خالص.
- Kalaxa::Adapter — ساخت/به‌روزرسانی هندسه از سند دامنه، خواندن هندسه برای تحلیل، AttributeDictionary، تراکنش‌ها (model.start_operation/commit)، Observerها.
- Kalaxa::App — orchestration، فرمان‌ها (Command pattern)، مدیریت انتخاب، خطاها.
- Kalaxa::UI — HtmlDialog، bridge، رویدادها.
- Kalaxa::Export — BOM، CSV/XLSX، PDF، DXF (مراحل 07 به بعد).
- Kalaxa::Recognition — تحلیل مدل خارجی و Confidence (مرحلهٔ 05).
- Kalaxa::Nesting و Kalaxa::CNC — مراحل 08 و 10.

## جریان دادهٔ اصلی (پارامتر → تولید)
1. UI تغییر پارامتر را به‌صورت پیام JSON می‌فرستد.
2. App فرمان می‌سازد؛ Domain سند جدید تولید می‌کند (immutable نسبت به سند قبلی).
3. Adapter داخل یک start_operation هندسه را از روی سند بازتولید و سند را در AttributeDictionary ذخیره می‌کند؛ commit یک واحد Undo می‌سازد.
4. خروجی‌های تولید همیشه از سند دامنه محاسبه می‌شوند، نه از اندازه‌گیری هندسه. هندسه فقط نمایش است.

## سیاست Undo/Redo
- هر فرمان کاربر = دقیقاً یک start_operation/commit (پارامتر transparent فقط برای عملیات چسبیدهٔ سیستمی).
- سند JSON داخل همان operation نوشته می‌شود تا Undo، داده و هندسه را با هم برگرداند.
- هیچ نوشتنی روی مدل خارج از operation مجاز نیست (در تست‌ها بررسی می‌شود).

## سیاست Observer
- فقط ModelObserver (onTransactionUndo/Redo برای همگام‌سازی UI) و SelectionObserver (نمایش پنل ویژگی).
- بدنهٔ Observerها فقط صف‌گذاری رویداد؛ پردازش با UI.start_timer(0) برای پرهیز از reentrancy و کرش.
- در حین عملیات خود پلاگین، Observerها با پرچم داخلی خاموش می‌شوند.

## سیاست شناسهٔ پایدار
- UUID v4 در سند دامنه برای Project/Cabinet/Part/Hardware.
- روی هر ComponentInstance کلید `kalaxa:uuid` آینه می‌شود؛ در بارگذاری، تطبیق سند⇄هندسه از روی UUID، و ناسازگاری‌ها گزارش می‌شود (نه اصلاح خاموش).

## مدل خطا و سطوح شدت
- FATAL: توقف عملیات + rollback (abort_operation) + پیام کاربر + لاگ.
- ERROR: عملیات ناقص انجام نمی‌شود؛ مدل دست‌نخورده می‌ماند.
- WARNING: عملیات انجام می‌شود، در پنل اعتبارسنجی ثبت می‌شود.
- INFO: فقط لاگ.
قاعدهٔ طلایی: هیچ خطایی نباید مدل کاربر را در وضعیت نیمه‌ساخته رها کند؛ همهٔ نوشتن‌ها تراکنشی‌اند.

## سیاست تحلیل مدل خارجی
فقط‌خواندنی → پیشنهاد ساختار با Confidence per-part → نمایش به کاربر → تبدیل فقط برای آیتم‌های تأییدشده → نسخهٔ اصلی هندسه تا پایان تراکنش دست‌نخورده و Undo کامل ممکن.

## سیاست نسخه‌بندی داده
- `schema_version` عدد صحیح؛ مهاجرت‌های فقط-رو-به-جلو، زنجیره‌ای و تست‌دار (مرحلهٔ 02).
- باز کردن سند با نسخهٔ جدیدتر از پلاگین: حالت فقط‌خواندنی + پیام به‌روزرسانی؛ هرگز downgrade خاموش انجام نمی‌شود.

## سیاست امنیت و حریم خصوصی
- Offline-first: هیچ درخواست شبکه در هستهٔ طراحی/تولید.
- شبکه فقط در ماژول Update/OnlineLibrary/AI (مرحلهٔ 11)، فقط با رضایت صریح و قابل لغو؛ هیچ دادهٔ مدل بدون تأیید ارسال نمی‌شود.
- به‌روزرسانی: دانلود از HTTPS + بررسی امضا/چک‌سام قبل از نصب؛ هیچ eval روی محتوای دانلودی.
- HtmlDialog: فقط فایل‌های محلی باندل‌شده بارگذاری می‌شوند؛ CSP سخت‌گیرانه.
