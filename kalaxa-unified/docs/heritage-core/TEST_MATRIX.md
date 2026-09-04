# ماتریس تست — مرحلهٔ ۰۱

| تست | رینگ | SketchUp لازم؟ | نتیجهٔ واقعی این جلسه |
|---|---|---|---|
| سینتکس app.js (node --check) | A | خیر | PASS (اجرا شد) |
| اعتبار JSON دو زبان + یکسانی ۱۸ کلید | A | خیر | PASS (اجرا شد) |
| پارس HTML و ارجاع همهٔ idها در JS | A | خیر | PASS (اجرا شد) |
| یکپارچگی و چیدمان RBZ (testzip + ساختار ریشه) | A | خیر | PASS (اجرا شد) |
| ۱۸ تست Minitest (نسخه/تنظیمات/i18n/لاگ/پل پیام) | A | خیر (Ruby 3.2 لازم) | NOT_TESTED توسط عامل — مفسر Ruby در محیط عامل موجود نیست؛ دستور اجرای محلی پایین |
| بارگذاری افزونه، منو، جلوگیری از بارگذاری دوباره | B | بله | NOT_TESTED — سوئیت TestUp آماده است |
| باز/بسته/بازشدن مجدد پنل | B | بله | NOT_TESTED |
| رفت‌وبرگشت پیام داخل اسکچاپ | B | بله | NOT_TESTED |
| تغییر زبان fa⇄en و RTL/LTR | B + C | بله | NOT_TESTED |
| خطای کنترل‌شده و Error Boundary رابط | B + C | بله | NOT_TESTED |
| نصب RBZ | C | بله | NOT_TESTED — SketchUp 2024: ☐ / 2025: ☐ / 2026: ☐ |

## اجرای محلی رینگ A (ویندوز، یک بار نصب Ruby)
```
winget install RubyInstallerTeam.Ruby.3.2
ruby test\unit\test_phase01.rb
```
انتظار: `18 runs ... 0 failures, 0 errors`

## اجرای محلی رینگ B
راهنمای بالای فایل `test/testup/tc_kalaxa_phase01.rb` (نصب TestUp 2 و اجرای سوئیت TC_Kalaxa_Phase01).

## سناریوی رینگ C (دستی، ۲ دقیقه)
1. Window ▸ Extension Manager ▸ Install Extension ▸ انتخاب فایل rbz ▸ ری‌استارت اسکچاپ.
2. Extensions ▸ Kalaxa ▸ Panel → پنل فارسی RTL باز شود.
3. دکمهٔ English → متن‌ها انگلیسی و چیدمان LTR شود؛ بستن و بازکردن پنل → زبان انگلیسی حفظ شده باشد.
4. «Round-trip message test» → پیام «Response received in N ms».
5. «Controlled error test» → پیام «Controlled error ... KY_VALIDATION» (بدون کرش).
6. «UI error boundary test» → صفحهٔ خطای قرمز با دکمهٔ Reload؛ Reload → پنل سالم برگردد.
7. Extensions ▸ Kalaxa ▸ About → نسخهٔ 0.1.0 نمایش داده شود.
8. فایل لاگ در `%APPDATA%\Kalaxa\kalaxa.log` رخدادها را داشته باشد.

# ماتریس تست — مرحلهٔ ۰۲

| تست اجباری مرحله | پوشش | نتیجهٔ واقعی این جلسه |
|---|---|---|
| ذخیره و بازیابی پروژه | رینگ A: round-trip سریال‌ساز · رینگ B: test_save_and_load_document_in_model | Python مرجع: PASS اجرا شد · Ruby/TestUp: NOT_TESTED |
| بستن و بازکردن فایل | رینگ B: test_reopen_file_persists_document | NOT_TESTED |
| حذف موجودیت و تشخیص مرجع گمشده | رینگ A + راستی‌آزمای Python | Python: PASS اجرا شد · Ruby: NOT_TESTED |
| مهاجرت دادهٔ قدیمی v1 | فیکسچر v1 → طلایی v2 (دو پیاده‌سازی) | Python: PASS اجرا شد · Ruby: NOT_TESTED |
| دادهٔ ناقص و خراب | رینگ A (tampered/garbage/empty) + Python | Python: PASS اجرا شد · Ruby: NOT_TESTED |
| شناسه‌های تکراری | رینگ A + Python | Python: PASS اجرا شد · Ruby: NOT_TESTED |
| کپی‌کردن یونیت در مدل | رینگ B: test_copied_unit_instance_reports_duplicate_uuid | NOT_TESTED |
| سازگاری با Undo | رینگ B: test_undo_restores_previous_document_and_geometry_together | NOT_TESTED |
| Snapshot | رینگ A (deep_dup) + رینگ B (save/list/restore) | Python-معادل ندارد · NOT_TESTED |
| عدم برخورد با دادهٔ سایر افزونه‌ها | رینگ B: test_other_plugin_dictionaries_untouched | NOT_TESTED |

## اجرای محلی
```
ruby test\unit\test_phase02.rb          ← رینگ A (۱۵ تست)
python3 tools\verify_data_spec.py       ← راستی‌آزمای مستقل (در جلسهٔ عامل PASS شد)
```
رینگ B: سوئیت TC_Kalaxa_Phase02 در TestUp (۶ تست؛ تست reopen فایل جاری را عوض می‌کند — در مدل خالی اجرا کنید).
