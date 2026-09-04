# encoding: utf-8
# frozen_string_literal: true

# همگام‌سازی موتورهای مشترک با مخزن وردپرس (kalaxa-sync)
#
#   ruby tools/sync_engines.rb            # فقط گزارش می‌دهد (پیش‌فرض)
#   ruby tools/sync_engines.rb --apply    # کپی می‌کند
#
# چرا لازم است: چند ماژول جاوااسکریپت هم در افزونهٔ اسکچاپ اجرا می‌شوند و
# هم در نمایشگر وردپرس. دو نسخه از یک فایل یعنی همان اشکالی که تاریخ این
# پروژه پر از آن است — **دو طرف جداگانه سبزند و هیچ‌کس واگرایی را
# نمی‌بیند**.
#
# وقتی این ابزار نوشته شد، سه ماژول واگرا بودند و هر سه **شمارهٔ نسخهٔ
# یکسان** داشتند با بیش از صد خط اختلاف؛ یعنی شماره‌ها هم دروغ می‌گفتند:
#
#   kalaxa-hardware.js   — نسخهٔ وردپرس دستگیره‌ای را فاکتور می‌کرد که
#                          کاربر «بدون دستگیره» انتخاب کرده بود
#   kalaxa-schema.js     — نسخهٔ قرارداد را دستی نوشته بود نه از کاتالوگ
#   kalaxa-cutmap-svg.js — خطوط برش گیلوتینی را نداشت
#
# **جهت یک‌طرفه است:** kalaxa-unified منبع است. مخزن وردپرس مصرف‌کننده
# است و هرگز نباید مبدأ تغییر باشد؛ اگر شد، این‌جا گزارش می‌شود.
require 'digest'
require 'fileutils'

ROOT = File.expand_path('..', __dir__)
SRC  = File.join(ROOT, 'kalaxa', 'ui')

# مخزن وردپرس بیرون این مخزن است. نبودنش خطا نیست — کسی که فقط افزونهٔ
# اسکچاپ را کلون کرده، کاری با آن ندارد.
DEST = ENV['KALAXA_SYNC_DIR'] ||
       File.expand_path(File.join(ROOT, '..', 'kalaxa-sync', 'assets', 'engines'))

apply = ARGV.include?('--apply')

unless File.directory?(DEST)
  puts "مخزن وردپرس پیدا نشد: #{DEST}"
  puts 'اگر جای دیگری است:  KALAXA_SYNC_DIR=<مسیر> ruby tools/sync_engines.rb'
  exit 0
end

# فایل‌هایی که هر دو طرف دارند — همین‌ها قرارداد مشترک‌اند.
shared = Dir[File.join(DEST, '*.js')].map { |f| File.basename(f) }.sort

same = []
diff = []
missing = []

shared.each do |name|
  src = File.join(SRC, name)
  dst = File.join(DEST, name)
  unless File.exist?(src)
    missing << name
    next
  end
  a = File.binread(src)
  b = File.binread(dst)
  a == b ? same << name : diff << [name, a, b, dst]
end

puts "منبع : #{SRC}"
puts "مقصد : #{DEST}"
puts '-' * 60
same.each { |n| puts "  یکسان    #{n}" }

missing.each do |n|
  puts "  ! فقط در وردپرس  #{n} — در افزونه نیست؛ دستی بررسی کنید"
end

diff.each do |name, a, b, _dst|
  va = a[/VERSION\s*=\s*'([^']*)'/, 1]
  vb = b[/VERSION\s*=\s*'([^']*)'/, 1]
  note = if va && vb && va == vb
           "  ← هر دو #{va} ولی محتوا فرق دارد (شمارهٔ نسخه دروغ می‌گوید)"
         else
           "  ← افزونه #{va || '؟'} / وردپرس #{vb || '؟'}"
         end
  puts "  واگرا    #{name}#{note}"
  puts "           #{a.lines.length} خط ← #{b.lines.length} خط"
end

puts '-' * 60

if diff.empty?
  puts "هر #{same.length} موتور مشترک یکسان است."
  exit 0
end

unless apply
  puts "#{diff.length} موتور واگراست. برای کپی:  ruby tools/sync_engines.rb --apply"
  exit 1
end

diff.each do |name, a, _b, dst|
  File.binwrite(dst, a)
  puts "کپی شد: #{name}"
end
puts "\n#{diff.length} موتور به‌روز شد. تست‌های مخزن وردپرس را اجرا کنید:"
puts "  node #{File.expand_path(File.join(DEST, '..', '..', 'tests', 'test_viewer_core.js'))}"
