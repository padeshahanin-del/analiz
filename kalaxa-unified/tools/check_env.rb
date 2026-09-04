# encoding: utf-8
# frozen_string_literal: true

# بررسی محیط — اجرا: ruby tools/check_env.rb
#
# اولین چیزی که روی دستگاه تازه اجرا می‌شود. به‌جای اینکه راهنما ادعا کند
# «فقط روبی و نود لازم است»، این‌جا **بررسی می‌شود** — راهنما کهنه می‌شود،
# اجرا نمی‌شود.
#
# چیزی نصب نمی‌کند و چیزی را عوض نمی‌کند؛ فقط گزارش می‌دهد.
require 'json'

ROOT = File.expand_path('..', __dir__)

# روبیِ همراه اسکچاپ ۲۰۲۳+ نسخهٔ ۲.۷ است. کد افزونه باید با آن کار کند،
# ولی ابزار و تست‌ها روی روبیِ خودِ سیستم اجرا می‌شوند.
MIN_RUBY = '2.7.0'
MIN_NODE = 14

$fail = 0
$warn = 0

def say(state, label, detail = nil)
  mark = { ok: '✓', bad: '✗', warn: '!' }[state]
  $fail += 1 if state == :bad
  $warn += 1 if state == :warn
  puts "#{mark} #{label}#{detail ? "  — #{detail}" : ''}"
end

def which(cmd)
  ENV['PATH'].to_s.split(File::PATH_SEPARATOR).each do |dir|
    ['', '.exe', '.cmd', '.bat'].each do |ext|
      p = File.join(dir, cmd + ext)
      return p if File.executable?(p) && !File.directory?(p)
    end
  end
  nil
end

puts "بررسی محیط کالاکسا — #{ROOT}"
puts '-' * 60

# ---------- روبی ----------
if Gem::Version.new(RUBY_VERSION) >= Gem::Version.new(MIN_RUBY)
  say(:ok, "روبی #{RUBY_VERSION}")
else
  say(:bad, "روبی #{RUBY_VERSION}", "دست‌کم #{MIN_RUBY} لازم است")
end

begin
  require 'minitest'
  say(:ok, "minitest #{Minitest::VERSION}")
rescue LoadError
  say(:bad, 'minitest نصب نیست', 'gem install minitest')
end

%w[json fileutils digest securerandom tmpdir open3].each do |lib|
  require lib
rescue LoadError
  say(:bad, "کتابخانهٔ استاندارد «#{lib}» نیست")
end

# ---------- نود ----------
node = which('node')
if node
  v = `"#{node}" -v 2>&1`.strip
  major = v.sub(/^v/, '').split('.').first.to_i
  if major >= MIN_NODE
    say(:ok, "نود #{v}")
  else
    say(:bad, "نود #{v}", "دست‌کم نسخهٔ #{MIN_NODE} لازم است")
  end
else
  say(:bad, 'نود پیدا نشد', 'تست‌های جاوااسکریپت بدون آن اجرا نمی‌شوند')
end

# ---------- فایل‌های خود پروژه ----------
{
  'kalaxa.rb' => 'بارگذارِ افزونه',
  'kalaxa/main.rb' => 'بوت',
  'kalaxa/version.rb' => 'نسخه',
  'tools/build_rbz.rb' => 'سازندهٔ بسته'
}.each do |rel, label|
  File.exist?(File.join(ROOT, rel)) ? say(:ok, "#{label} (#{rel})")
                                    : say(:bad, "#{rel} نیست", label)
end

# کاتالوگ‌ها: قلب دامنه. نبودِ یکی یعنی لیست برشِ غلط، نه خطای واضح.
data = File.join(ROOT, 'kalaxa', 'data')
if File.directory?(data)
  files = Dir[File.join(data, '*.json')]
  bad = files.reject { |f| (JSON.parse(File.read(f, encoding: 'UTF-8')) rescue nil) }
  if bad.empty?
    say(:ok, "#{files.length} کاتالوگ داده، همه سالم")
  else
    say(:bad, 'کاتالوگ خراب', bad.map { |f| File.basename(f) }.join(', '))
  end
else
  say(:bad, 'پوشهٔ kalaxa/data نیست')
end

ruby_tests = Dir[File.join(ROOT, 'test', 'unit', 'test_*.rb')].length
js_tests   = Dir[File.join(ROOT, 'kalaxa', 'dev', 'tests', 'test_*.js')].length
say(ruby_tests.positive? ? :ok : :warn, "#{ruby_tests} تست روبی")
say(js_tests.positive? ? :ok : :warn, "#{js_tests} تست جاوااسکریپت")

# ---------- دادهٔ کاربر ----------
base = ENV['KALAXA_DATA_DIR'] || ENV['APPDATA'] || File.join(Dir.home, '.config')
udir = File.join(base, 'Kalaxa')
if File.directory?(udir)
  # `Dir[...]` این‌جا اشتباه بود: مسیر ویندوزی بک‌اسلش دارد و glob آن را
  # کاراکتر فرار می‌گیرد، پس همیشه «خالی» گزارش می‌شد — حتی وقتی فایل بود.
  have = Dir.children(udir)
  say(:ok, 'دادهٔ کاربر', "#{udir} → #{have.empty? ? 'خالی' : have.join(', ')}")
else
  say(:warn, 'دادهٔ کاربر هنوز ساخته نشده',
      "#{udir} — با اولین اجرا ساخته می‌شود")
end

puts '-' * 60
if $fail.zero?
  puts $warn.zero? ? 'همه‌چیز آماده است.' : "آماده است (#{$warn} یادداشت)."
  puts 'گام بعد:  ruby tools/run_all_tests.rb'
else
  puts "#{$fail} مورد باید رفع شود."
end
exit($fail.zero? ? 0 : 1)
