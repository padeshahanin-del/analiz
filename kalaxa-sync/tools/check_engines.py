#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""check_engines.py — نگهبان هم‌نسخگی موتورها

خطر مستند در README: موتورهای رندر Viewer «کپی» از مخزن پلاگین‌اند و پس از هر
ارتقای پلاگین باید به‌روز شوند؛ فراموشی = نمایش با منطق قدیمی.

استفاده:
    python3 tools/check_engines.py --plugin <مسیر مخزن پلاگین>          ← فقط گزارش
    python3 tools/check_engines.py --plugin <مسیر مخزن پلاگین> --sync   ← کپی نسخهٔ تازه

exit code: 0 = هم‌نسخه، 1 = واگرایی/فایل گم‌شده، 2 = خطای مسیر.
"""
import argparse
import hashlib
import pathlib
import shutil
import sys

HERE = pathlib.Path(__file__).resolve().parent.parent
ENGINES_DIR = HERE / 'assets' / 'engines'


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--plugin', required=True,
                    help='ریشهٔ مخزن پلاگین اسکچاپ (شامل kalaxa/ui/)')
    ap.add_argument('--sync', action='store_true',
                    help='به‌جای گزارش، نسخهٔ تازه را از پلاگین کپی کن')
    args = ap.parse_args()

    src_dir = pathlib.Path(args.plugin).expanduser() / 'kalaxa' / 'ui'
    if not src_dir.is_dir():
        print(f'ERROR  مسیر پلاگین نامعتبر است: {src_dir}')
        return 2
    if not ENGINES_DIR.is_dir():
        print(f'ERROR  پوشهٔ موتورها یافت نشد: {ENGINES_DIR}')
        return 2

    drift = 0
    for local in sorted(ENGINES_DIR.glob('*.js')):
        src = src_dir / local.name
        if not src.is_file():
            print(f'MISSING  {local.name} — در پلاگین وجود ندارد (حذف/تغییرنام شده؟)')
            drift += 1
            continue
        if sha256(local) == sha256(src):
            print(f'OK       {local.name}')
        else:
            drift += 1
            if args.sync:
                shutil.copy2(src, local)
                print(f'SYNCED   {local.name} ← نسخهٔ تازه از پلاگین کپی شد')
            else:
                print(f'DRIFT    {local.name} — با پلاگین فرق دارد (اجرا با --sync برای به‌روزرسانی)')

    print('-' * 40)
    if drift == 0:
        print('RESULT: هم‌نسخه ✔')
        return 0
    if args.sync:
        print(f'RESULT: {drift} فایل به‌روز شد — تست را دوباره اجرا کنید: node tests/test_viewer_core.js')
        return 0
    print(f'RESULT: {drift} مورد واگرایی — پیش از استقرار، --sync بزنید و تست Node را اجرا کنید')
    return 1


if __name__ == '__main__':
    sys.exit(main())
