# تست

```
cd kalaxa_analysis/dev/tests
node test_nesting.js           # هسته موتور + fixture طلایی (۳۶)
node test_analysis_extras.js   # نقشه نصب، متریال، قوانین (۳۲)
node test_v12_features.js      # آفکات، یراق، سناریو، R7 (۳۴)
node test_contract_matrix.js   # ماتریس قرارداد: ورودی خراب، schema/migration، جبرگرایی، اعتبارسنج (۴۳)
cd ../benchmarks && node bench_nesting.js
```
fixture طلایی (`dev/fixtures/golden_kitchen_snapshot.json`) لنگر رگرسیون است؛ اعداد آن دستی تأیید شده‌اند — تغییرش بدون بازتأیید دستی ممنوع.
هر باگ اصلاح‌شده باید یک assert رگرسیون در یکی از suite ها بگیرد.
