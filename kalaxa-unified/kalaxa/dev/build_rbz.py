#!/usr/bin/env python3
"""ساخت بستهٔ rbz کالاکسا — با گیت سازگاری Ruby 2.7 قبل از بسته‌بندی.

چرا گیت دارد: نسخهٔ ۳.۱۹.۱ با ادعای «سازگار با SketchUp 2023» منتشر شد ولی کد
۱۷ endless method داشت و افزونه روی ۲۰۲۳ اصلاً لود نمی‌شد. تا وقتی «2023» در
TARGET_SKETCHUP هست، این اسکریپت اجازه نمی‌دهد بستهٔ ناسازگار ساخته شود.

اجرا:  python kalaxa/dev/build_rbz.py            # نسخه از version.rb خوانده می‌شود
"""
import os
import re
import json
import shutil
import zipfile
import pathlib
import subprocess
import sys

for _stream in (sys.stdout, sys.stderr):  # پیام شکست بیلد هم باید خوانا باشد
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

DEV_DIR = pathlib.Path(__file__).resolve().parent
ROOT = DEV_DIR.parents[1]                 # kalaxa-unified/
STAGE = pathlib.Path(os.environ.get("TEMP", "/tmp")) / "kalaxa-build-stage"
# فقط این پوشه‌ها به rbz می‌روند (dev/ و docs/ عمداً بیرون می‌مانند)
ALLOWED_DIRS = {"adapter", "app", "domain", "i18n", "persistence", "ui", "lib"}


def read_version():
    text = (ROOT / "kalaxa" / "version.rb").read_text(encoding="utf-8")
    m = re.search(r"VERSION\s*=\s*'([^']+)'", text)
    if not m:
        raise SystemExit("نسخه در version.rb پیدا نشد")
    return m.group(1)


def targets_ruby27():
    """آیا SketchUp 2023 (Ruby 2.7) هنوز هدف است؟"""
    text = (ROOT / "kalaxa" / "version.rb").read_text(encoding="utf-8")
    return "'2023'" in text or '"2023"' in text


def gate_ruby27():
    if not targets_ruby27():
        print("[skip] SketchUp 2023 هدف نیست — گیت Ruby 2.7 لازم نشد")
        return
    print("[gate] بررسی سازگاری Ruby 2.7 ...")
    res = subprocess.run(
        [sys.executable, str(DEV_DIR / "check_ruby27_compat.py"), str(ROOT)],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    print(res.stdout.strip())
    if res.returncode != 0:
        print(res.stderr.strip())
        raise SystemExit("بیلد متوقف شد: کد با Ruby 2.7 (SketchUp 2023) سازگار نیست")


def find_ruby():
    """مفسر Ruby را پیدا می‌کند (PATH یا نصب پیش‌فرض RubyInstaller روی ویندوز)."""
    exe = shutil.which("ruby")
    if exe:
        return exe
    for cand in pathlib.Path("C:/").glob("Ruby*/bin/ruby.exe"):
        return str(cand)
    return None


def gate_ruby_syntax():
    """اعتبارسنجی نحوی واقعی با `ruby -c` روی همهٔ فایل‌های بسته‌شونده.

    چرا حیاتی است: چکرهای الگویی فقط اشتباهاتی را می‌گیرند که از قبل به آن‌ها فکر
    شده باشد. v3.20.0–v3.23.2 یک `|` جامانده در لیست پارامتر بلاک داشتند و کل افزونه
    لود نمی‌شد — هیچ چک الگویی آن را نگرفت. `ruby -c` می‌گیرد.
    """
    ruby = find_ruby()
    if not ruby:
        print("[warn] مفسر Ruby پیدا نشد — اعتبارسنجی نحوی انجام نشد (شدیداً توصیه نمی‌شود)")
        return
    print(f"[gate] اعتبارسنجی نحوی با {ruby} ...")
    bad = []
    for rb in sorted((ROOT / "kalaxa").rglob("*.rb")):
        res = subprocess.run([ruby, "-c", str(rb)], capture_output=True, text=True,
                             encoding="utf-8", errors="replace")
        if res.returncode != 0:
            bad.append((rb, (res.stderr or res.stdout).strip().splitlines()[:3]))
    if bad:
        for rb, msg in bad:
            print(f"  {rb}")
            for m in msg:
                print(f"    {m}")
        raise SystemExit("بیلد متوقف شد: خطای نحوی Ruby")
    print("[gate] همهٔ فایل‌های Ruby نحو معتبر دارند")


def stage_files(version):
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True)
    shutil.copy(ROOT / "kalaxa.rb", STAGE / "kalaxa.rb")
    dst = STAGE / "kalaxa"
    dst.mkdir()
    src = ROOT / "kalaxa"
    for entry in sorted(os.listdir(src)):
        s = src / entry
        if s.is_dir():
            if entry in ALLOWED_DIRS:
                shutil.copytree(s, dst / entry)
        else:
            shutil.copy(s, dst / entry)
    (dst / "build_info.json").write_text(
        json.dumps({"version": version, "build": "rbz"}, ensure_ascii=False, indent=2),
        encoding="utf-8")


def make_zip(version):
    out = ROOT / "dist" / f"kalaxa-{version}-release.rbz"
    out.parent.mkdir(exist_ok=True)
    if out.exists():
        out.unlink()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for base, _dirs, files in os.walk(STAGE):
            for fn in sorted(files):
                full = pathlib.Path(base) / fn
                rel = str(full.relative_to(STAGE)).replace(os.sep, "/")
                zf.write(full, rel)
    # راستی‌آزمایی: مسیرها باید forward-slash باشند (Compress-Archive ویندوز backslash می‌نویسد)
    with zipfile.ZipFile(out) as zf:
        bad = [n for n in zf.namelist() if "\\" in n]
        if bad:
            raise SystemExit(f"مسیرهای backslash در zip: {bad[:5]}")
        count = len(zf.namelist())
    print(f"[ok] ساخته شد: {out}  ({count} فایل، {out.stat().st_size} بایت)")
    return out


def main():
    version = read_version()
    print(f"نسخه: {version}")
    gate_ruby_syntax()   # نحو واقعی (هر نسخهٔ Ruby)
    gate_ruby27()        # قابلیت‌های مخصوص Ruby 3.x (فقط تا وقتی ۲۰۲۳ هدف است)
    stage_files(version)
    make_zip(version)
    return 0


if __name__ == "__main__":
    sys.exit(main())
