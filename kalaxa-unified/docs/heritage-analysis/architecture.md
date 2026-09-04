# معماری v1.2.0

```
SketchUp Model → ProjectScanner (Ruby) → kitchen_snapshot.json (schema v2)
   → [پل HtmlDialog: push_json با escape امن]
   → KalaxaSchema.migrateToV2 + validateSnapshot        (دروازه ورودی)
   → KalaxaNesting.run (گیوتینی، ۶ استراتژی، انبار آفکات، قطعی)
   → KalaxaNestingValidator.validate                    (دروازه خروجی — چاپ فقط با ✓)
   → CutmapSVG / InstallMap / Report / Hardware / Rules / Scenarios
   → Export (فایل HTML/JSON کنار مدل، باز شدن در مرورگر خارجی)
```

اصول: UI هیچ منطق هندسه/فایل ندارد؛ همه ماژول‌های JS خالص UMD و بدون DOM هستند و همان فایل‌ها در Node تست می‌شوند؛ مرز Ruby↔JS فقط JSON نسخه‌دار است.

انحراف مستند از نقشه فایل پیشنهادی سند ساخت: تفکیک Ruby به ۱۲+ فایل (config/, core/, scanner/×4, …) انجام نشد، چون در نبود runtime روبی قابل راستی‌آزمایی نیست و ریسک regression بدون تست، از سود ساختاری بیشتر است. لایه‌بندی خواسته‌شده (validation مستقل، schema/migration، جداسازی مسئولیت) در سمت JS — که تست‌پذیر بود — به‌طور کامل اجرا شد. تفکیک Ruby به فاز بعدی با دسترسی SketchUp موکول شد (ADR-01).
