# قرارداد میان ماژول‌ها

## قاعدهٔ کلی
تنها زبان مشترک بین لایه‌ها «سند دامنه» (JSON قابل سریال‌سازی) و «پیام» است. هیچ لایه‌ای اشیای Sketchup::* را از Adapter بیرون نمی‌فرستد و هیچ لایه‌ای DOM/UI را به داخل نمی‌فرستد.

## قرارداد UI ⇄ App (پل HtmlDialog)
- کانال: add_action_callback با یک نقطهٔ ورود واحد `ky_message` + پاسخ با execute_script روی تابع واحد `KY.receive`.
- قالب پیام: `{ "id": string, "type": string, "payload": object }`؛ پاسخ: `{ "id": هم‌ارز, "ok": bool, "payload"|"error" }`.
- UI هرگز منطق دامنه (محاسبهٔ ابعاد، قواعد) را تکرار نمی‌کند؛ فقط نمایش و فرم.
- همهٔ رشته‌های نمایشی از i18n؛ payload بدون متن ترجمه‌شده.

## قرارداد App ⇄ Domain
- ورودی: سند فعلی + فرمان (نام + پارامترهای اعتبارسنجی‌شده). خروجی: سند جدید + فهرست رخدادها/هشدارها.
- Domain تابعی و قطعی است: سند برابر + فرمان برابر ⇒ خروجی برابر (لازمهٔ تست و بازتولید).
- Domain استثنای دامنه‌ای typed پرتاب می‌کند (Kalaxa::Domain::Error و زیرکلاس‌ها)؛ هرگز خطای خام Ruby به بالا نشت نمی‌کند.

## قرارداد App ⇄ Adapter
- Adapter فقط این سرویس‌ها را عرضه می‌کند: `materialize(doc, model)`، `read_document(model)`، `write_document(doc, model)`، `scan_raw(selection)`، `with_operation(name) { }`.
- هر نوشتنِ مدل فقط داخل `with_operation`؛ Adapter در صورت استثنا، abort می‌کند و استثنا را بازپرتاب می‌کند.
- Adapter هندسه را همیشه «حذف و بازتولید کنترل‌شده» یا «به‌روزرسانی درجا» می‌کند اما هرگز Entity غیرمتعلق به کالاکسا (بدون کلید uuid) را حذف/تغییر نمی‌دهد.

## قرارداد Persistence
- `dump(doc) -> json_string` و `load(json_string) -> doc` با round-trip بدون اتلاف (تست الزامی).
- `migrate(json, from_version) -> json(current_version)`؛ شکست مهاجرت = خطای ERROR با پیام دقیق، بدون تغییر داده روی مدل.

## قرارداد Export
- ورودی فقط «مدل مدیریت‌شده»؛ اگر سند نامعتبر یا ساختاریافتهٔ تأییدنشده باشد، خروجی با ERROR رد می‌شود.
- هر Exporter اینترفیس `export(doc, options) -> file_path` + `preview(doc, options) -> preview_model` دارد؛ تولید فایل ماشین بدون preview ممنوع.

## قرارداد Recognition
- ورودی: انتخاب کاربر (فقط‌خواندنی). خروجی: `StructuredProposal { items: [{ raw_ref, role, params, confidence: 0..1 }] }`.
- Recognition حق نوشتن روی مدل ندارد؛ تبدیل نهایی را App از طریق Domain+Adapter انجام می‌دهد.

## قرارداد تست‌پذیری هر ماژول
- Domain/Persistence/Nesting/Export(محاسبات): تست واحد Minitest خارج از اسکچاپ، بدون mock از SketchUp.
- Adapter/UI-bridge/Observer: تست TestUp داخل اسکچاپ + سناریوهای دستی مستند.
- UI: تست Vitest برای state و قالب پیام.
