# runtime-flow.md — جریان اجرای واقعی (رهگیری بدون تغییر کد)

## model scan
`AnalysisPanel#scan_model` callback → `Kalaxa::ProjectScanner.build_snapshot` (Ruby، خواندن مستقیم مدل با `Sketchup.active_model`) → JSON برمی‌گرداند → `push_json(dialog, 'onSnapshot', snapshot)` → JS: `window.onSnapshot(jsonString)`.
**شواهد:** `kalaxa/analysis_panel.rb:55-65`، `kalaxa/lib/project_scanner.rb`.
**اثبات نشده در این نشست:** آیا `build_snapshot` مدل را در حین اسکن تغییر می‌دهد (سند جدید این را صراحتاً منع می‌کند) — چون `project_scanner.rb` به‌طور کامل خط‌به‌خط در این فاز بازرسی نشد؛ فقط رفتار خروجی (JSON snapshot) در این نشست مصرف شد.

## entity classification / local frame creation
**وضعیت: عمدتاً استنتاجی، نه شواهد کامل کد Ruby.** از رفتار observable در JS: هر کابینت `category` (base/wall/tall) و `params.cabinet_width/height/depth` (به **cm**) دارد. **هیچ `local_frame` (origin+axes) مشابه قرارداد جدید در snapshot دیده نشد.** جهت قطعه (`rotated: boolean`) در سطح placement (`kalaxa-placement.js`)، نه در سطح part، ذخیره می‌شود.
**دلیل اهمیت:** این دقیقاً محل تلاقی با محدودیت جدید («استنتاج فریم از اندازه ممنوع») است — نیاز به بازرسی مستقیم کد Ruby دامنه (`kalaxa/domain/entities.rb`, `kalaxa/domain/document.rb`) دارد که در این فاز فقط سطحی دیده شده، نه کامل.

## edge labeling / dimension extraction / edge-band calculation
مسیر کاملاً در JS رهگیری شد (شواهد مستقیم، نه استنتاج):
1. `KalaxaSchema.migrateToV2(snapshot)` — مهاجرت schema v1→v2.
2. `KalaxaSettings.applyToSnapshot(snapshot, settings)`:
   - نگاشت نقش‌محور ورق (`ROLE_KEYS`) روی `parts_flat[].sheet_id`/`thickness_mm`.
   - **کسر نوار لبه از اندازهٔ برش** (`cut_length_mm`/`cut_width_mm` کم می‌شود مستقیماً — نه یک فیلد `blank_*` جدا از `finished_*`؛ این خودِ فیلد `cut_length_mm` تغییر داده می‌شود in-place).
   - تزریق `project.marks`, `project.edge_band`, پیش‌فرض `miter: {}`/`bevel: {}` روی هر قطعه.
3. `KalaxaNesting.run(snapshot)` — چیدمان.
4. `KalaxaNestingValidator.validate(snapshot, nest)` — اعتبارسنجی مستقل (اگر رد کند، دکمهٔ چاپ/برچسب غیرفعال می‌شود).

**نکتهٔ حیاتی که سند جدید به آن اشاره دارد و این‌جا واقعاً هست:** کسر نوار **یک‌بار، در `applyToSnapshot`، مستقیماً روی همان فیلد** انجام می‌شود — یعنی «ابعاد نهایی» و «ابعاد بلانک» **یک فیلد مشترک** هستند، نه دو فیلد جدا. اگر `applyToSnapshot` دوباره روی همان snapshot صدا زده شود (که در تست `test_cutmap_marks.js` بررسی شده)، idempotent است چون `applyToSnapshot` روی یک کلون تازه از snapshot اصلی عمل می‌کند، نه روی خروجی قبلی خودش — ولی این وابسته به این است که caller همیشه از snapshot خام شروع کند، نه از خروجی قبلی `applyToSnapshot`. **این یک فرض ضمنی خطرناک است** (مستند در `known-risks.md`).

## fold extraction
**شواهد: هیچ.** نه در Ruby نه در JS، مفهوم «fold» (خط تا) وجود ندارد. سند جدید یک موجودیت کامل `Fold` با `fold_id, angle_deg, bend_radius_mm, ...` می‌خواهد — این کاملاً غایب است.

## make-or-buy classification
**شواهد: هیچ.** فیلد `make_or_buy` در هیچ‌جای مدل داده وجود ندارد. تلویحاً همهٔ قطعات «تولید داخل» فرض می‌شوند.

## persistence / reload
`Kalaxa::Adapter::Store` (`kalaxa/adapter/store.rb`) → `model.set_attribute` روی `AttributeDictionary` مدل اسکچاپ (کلید `Adapter::Store::DICT`/`KEY_DOC`). سند دامنهٔ کامل (نه snapshot تحلیلی) این‌طور ذخیره می‌شود. **این خودش یکی از گزینه‌های محل ذخیره‌سازی است که سند جدید می‌خواهد "بدون فرض" بررسی شود — این‌جا با شواهد مستقیم تأیید شد: `SketchUp attribute dictionaries` گزینهٔ واقعی استفاده‌شده است، نه فرضی.**

## transform (Translation/Rotation/Mirroring/Scale/...)
**آزمون نشده در این نشست.** سند جدید صریحاً می‌خواهد این ۱۰ عملیات (Translation, Rotation, Nested Transform, Uniform/Non-uniform Scale, Mirroring, Component Reuse, Make Unique, Copy, Explode, Undo/Redo) روی مدل واقعی اسکچاپ تست شوند. **این محیط توسعه اسکچاپ نصب ندارد** — پس این آزمون‌ها اصلاً قابل‌اجرا نبوده‌اند تا امروز.

## nesting
کاملاً رهگیری‌شده (`kalaxa-nesting.js`) — الگوریتم bin-packing قطعی، تست‌شده با ۳۶ assert در `test_nesting.js`. معیار چرخش/رگه/کرف رعایت می‌شود (شواهد مستقیم از کد + تست).

## report generation
`kalaxa-report.js` + `kalaxa-price-sheet.js` (جدید این نشست) — کاملاً رهگیری‌شده.

## sync
**خارج از دامنهٔ این فاز کشف** (مخازن `kalaxa-sync`/`kalaxa-sync-client` این نشست دست‌نخورده ماندند؛ آخرین بار در نشست‌های قبلی رفع‌باگ شدند، نه بازرسی معماری کامل طبق قرارداد جدید).

## license checks
**شواهد: هیچ.** هیچ مفهوم لایسنس/اشتراک/دستگاه در کد وجود ندارد.
