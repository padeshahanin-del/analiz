# encoding: utf-8
# frozen_string_literal: true

# اجرای همهٔ تست‌ها — اجرا: ruby tools/run_all_tests.rb
#
# تا امروز این کار با حلقهٔ دستی در شل انجام می‌شد، و همان حلقه یک‌بار
# سبزها را قرمز نشان داد چون تست‌های جاوااسکریپت واژهٔ دیگری برای «ناموفق»
# دارند. تشخیصِ موفقیت **نباید** به تطبیق متن فارسی وابسته باشد؛ این‌جا
# فقط به کدِ خروج نگاه می‌شود، که هر دو طرف درست برمی‌گردانند.
require 'open3'

ROOT = File.expand_path('..', __dir__)
only = ARGV.first   # مثلاً: ruby tools/run_all_tests.rb system32

def run(cmd, file)
  out, status = Open3.capture2e(*cmd, chdir: ROOT)
  [status.success?, out]
end

groups = {
  'روبی' => Dir[File.join(ROOT, 'test', 'unit', 'test_*.rb')].sort
                .map { |f| [f, ['ruby', f]] },
  'جاوااسکریپت' => Dir[File.join(ROOT, 'kalaxa', 'dev', 'tests', 'test_*.js')].sort
                .map { |f| [f, ['node', f]] }
}

failed = []
total = 0

groups.each do |label, items|
  items = items.select { |f, _| File.basename(f).include?(only) } if only
  next if items.empty?

  puts "\n#{label} (#{items.length})"
  items.each do |file, cmd|
    total += 1
    ok, out = run(cmd, file)
    name = File.basename(file)
    if ok
      print '.'
    else
      puts "\n✗ #{name}"
      puts out.lines.last(25).join
      failed << name
    end
  end
  puts
end

puts '-' * 60
if failed.empty?
  puts "همهٔ #{total} فایل تست سبز."
  exit 0
else
  puts "#{failed.length} از #{total} افتاد:"
  failed.each { |f| puts "  - #{f}" }
  exit 1
end
