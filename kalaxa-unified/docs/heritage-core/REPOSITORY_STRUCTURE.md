# ساختار مخزن

```
kalaxa/                        ← ریشهٔ مخزن
├── src/
│   ├── kalaxa.rb              ← لودر ثبت‌شده در Plugins (فقط bootstrap)
│   └── kalaxa/
│       ├── domain/                ← Ruby خالص (entities, params, rules, calc)
│       ├── persistence/           ← json, schema, migrations/
│       ├── adapter/               ← sketchup_adapter, operations, observers, attrs
│       ├── app/                   ← commands, controller, errors, logging
│       ├── ui/                    ← dialog.rb, bridge.rb
│       ├── export/                ← bom, cutlist, pdf, dxf (از مرحلهٔ 07)
│       ├── recognition/           ← مرحلهٔ 05
│       ├── nesting/               ← مرحلهٔ 08
│       ├── cnc/                   ← posts/ (مرحلهٔ 10)
│       └── i18n/                  ← fa.yml, en.yml
├── ui/                            ← سورس TypeScript (Vite) → build به src/kalaxa/ui/dist
├── test/
│   ├── unit/                      ← Minitest رینگ A
│   ├── testup/                    ← سوئیت TestUp رینگ B
│   ├── golden/                    ← فایل‌های طلایی خروجی‌ها
│   └── fixtures/                  ← اسناد JSON و مدل‌های SKP نمونه
├── tools/                         ← اسکریپت build_rbz، بستهٔ تست محلی
├── docs/                          ← همین مستندات + ARCHITECTURE، DATA_MODEL (مرحلهٔ 02)، TEST_MATRIX (مرحلهٔ 01)
├── PROJECT_STATE.md
├── CHANGELOG.md
└── RELEASE_CHECKLIST.md
```

قواعد:
- هیچ فایلی خارج از فضای نام `kalaxa` در Plugins نصب نمی‌شود (فقط `kalaxa.rb` و پوشهٔ `kalaxa/`).
- خروجی build رابط (dist) در RBZ قرار می‌گیرد؛ سورس ts در RBZ نمی‌آید.
- هر مرحله فقط پوشه‌های مجاز خودش را اضافه می‌کند؛ تغییر فایل‌های مراحل قبلی فقط با ثبت در CHANGELOG.
