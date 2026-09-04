#!/usr/bin/env python3
"""چک سازگاری Ruby 2.7 — نگهبان دائمی علیه syntax مخصوص Ruby 3.x.

چرا وجود دارد: در v3.19.1 پشتیبانی SketchUp 2023 اعلام شد با این استدلال که «چیزی
مخصوص Ruby 3.x در کد نیست» — ولی آن بررسی ناقص بود و ۱۷ endless method را ندید.
نتیجه: افزونه روی SketchUp 2023 اصلاً لود نمی‌شد (SyntaxError در paths.rb).
این اسکریپت همان بررسی را ماشینی و تکرارپذیر می‌کند تا دوباره رخ ندهد.

SketchUp 2023 → Ruby 2.7 | SketchUp 2024+ → Ruby 3.2
پس تا وقتی ۲۰۲۳ در TARGET_SKETCHUP هست، کل کد باید Ruby 2.7 معتبر بماند.

اجرا:  python kalaxa/dev/check_ruby27_compat.py [root ...]
خروج ۱ = ناسازگاری پیدا شد (برای شکست دادن بیلد).
"""
import re
import sys
import pathlib

# کنسول ویندوز پیش‌فرض cp1252 است و روی متن فارسی UnicodeEncodeError می‌دهد
# (همان مشکلی که check_engines.py مخزن sync هم دارد). این‌جا صریح UTF-8 می‌کنیم
# تا خروجی ابزار در هیچ محیطی باعث کرش نشود.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):  # پایتون خیلی قدیمی یا stdout غیرقابل تنظیم
    pass

# (نام قابلیت، نسخهٔ Ruby که آن را آورده، الگو، توضیح فارسی)
RULES = [
    ("endless method", "3.0",
     re.compile(r"^\s*def\s+[a-zA-Z_][a-zA-Z0-9_?!]*(\([^)]*\))?\s+=\s+\S"),
     "def name = expr  →  به def/end عادی تبدیل شود"),
    ("Data.define", "3.2", re.compile(r"\bData\.define\b"),
     "Struct.new یا کلاس ساده استفاده شود"),
    ("Hash#except", "3.0", re.compile(r"\.except\("),
     "reject/select دستی استفاده شود"),
    ("Array#intersect?", "3.1", re.compile(r"\.intersect\?"),
     "(a & b).any? استفاده شود"),
    ("Integer#ceildiv", "3.2", re.compile(r"\.ceildiv\b"),
     "(a + b - 1) / b استفاده شود"),
    # hash shorthand فقط داخل آکولاد معنا دارد. بدون این قید، keyword argument
    # اجباری (`def f(a:, b:)` — از Ruby 2.1 معتبر) اشتباهاً علامت می‌خورد.
    ("hash shorthand", "3.1", re.compile(r"\{[^{}]*[,{]\s*[a-z_][a-zA-Z0-9_]*:\s*[,}]"),
     "{x:} → {x: x} نوشته شود"),
    ("anonymous block forwarding", "3.1", re.compile(r"def\s+[a-zA-Z_][\w?!]*\([^)]*&\s*\)"),
     "بلاک نام‌دار (&blk) استفاده شود"),
    ("pattern matching (case/in)", "3.0", re.compile(r"^\s*in\s+[\[{A-Z:\"']"),
     "case/when استفاده شود"),
    ("argument forwarding **nil", "3.0", re.compile(r"\*\*nil\b"),
     "حذف شود"),
]

# فایل‌هایی که عمداً بررسی نمی‌شوند (اسکریپت خودِ چکر، تست‌های موقت و ...)
SKIP_PARTS = {"node_modules", ".git", "dist"}


BLOCK_OPEN = re.compile(r"(?:\bdo\b|\{)\s*\|")


def check_block_params(lines):
    """لیست پارامتر بلاک (`do |a, b|`) حتماً باید با `|` بسته شود.

    باگ واقعی v3.20–v3.23.2: در cabinet_builder.rb لیست پارامتر روی دو خط نوشته شد
    ولی `|` پایانی جا افتاد → SyntaxError و کل افزونه لود نمی‌شد (روی هر نسخهٔ Ruby).
    قاعده: اگر `|` بسته روی همان خط نبود، خط باید با `,` تمام شود (ادامهٔ لیست).
    """
    problems = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.strip().startswith("#"):
            i += 1
            continue
        m = BLOCK_OPEN.search(line)
        if not m:
            i += 1
            continue
        rest = line[m.end():]
        j = i
        while True:
            # `||` (یا منطقی) پارامتر نیست
            closing = re.search(r"\|", rest.replace("||", "  "))
            if closing:
                break
            if rest.rstrip().endswith(","):
                j += 1
                if j >= len(lines):
                    problems.append((i + 1, "لیست پارامتر بلاک تا انتهای فایل بسته نشد"))
                    break
                rest = lines[j]
                continue
            problems.append((i + 1, "لیست پارامتر بلاک با `|` بسته نشده"))
            break
        i += 1
    return problems


def scan(roots):
    findings = []
    scanned = 0
    for root in roots:
        base = pathlib.Path(root)
        if not base.exists():
            print(f"[warn] مسیر یافت نشد: {root}")
            continue
        for path in sorted(base.rglob("*.rb")):
            if SKIP_PARTS & set(path.parts):
                continue
            scanned += 1
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                findings.append((path, 0, "encoding", "-", "فایل UTF-8 نیست"))
                continue
            all_lines = text.split("\n")
            for lineno, msg in check_block_params(all_lines):
                findings.append((path, lineno, "block params", "any", msg))
            for lineno, line in enumerate(all_lines, 1):
                stripped = line.strip()
                if stripped.startswith("#"):
                    continue
                for name, ver, pat, hint in RULES:
                    if not pat.search(line):
                        continue
                    # امضای متد (def ...) هرگز hash shorthand نیست — keyword arg است
                    if name == "hash shorthand" and stripped.startswith("def "):
                        continue
                    findings.append((path, lineno, name, ver, hint))
    return findings, scanned


def main():
    roots = sys.argv[1:] or [str(pathlib.Path(__file__).resolve().parents[2])]
    findings, scanned = scan(roots)
    print(f"بررسی‌شده: {scanned} فایل Ruby")
    if not findings:
        print("نتیجه: سازگار با Ruby 2.7 (SketchUp 2023) - OK")
        return 0
    print(f"نتیجه: {len(findings)} ناسازگاری\n")
    for path, lineno, name, ver, hint in findings:
        print(f"  {path}:{lineno}\n    [{name} — Ruby {ver}+] {hint}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
