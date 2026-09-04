# frozen_string_literal: true

# tools/build_rbz.rb — ساخت بستهٔ نصب RBZ (زیپ استاندارد با پسوند rbz)
#
#   ruby tools/build_rbz.rb            # ساخت release
#   ruby tools/build_rbz.rb --dev      # ساخت development (لاگ سطح debug)
#
# خروجی: dist/kalaxa-<version>-<build>.rbz
# ساختار داخل RBZ (ریشهٔ Plugins): kalaxa.rb + kalaxa/
# روی ویندوز اگر فرمان zip موجود نباشد از PowerShell Compress-Archive استفاده می‌شود.

require 'json'
require 'fileutils'
require 'tmpdir'

ROOT = File.expand_path('..', __dir__)
require File.join(ROOT, 'kalaxa', 'version')

build_type = ARGV.include?('--dev') ? 'dev' : 'release'
dist_dir = File.join(ROOT, 'dist')
FileUtils.mkdir_p(dist_dir)
out = File.join(dist_dir, "kalaxa-#{Kalaxa::VERSION}-#{build_type}.rbz")
FileUtils.rm_f(out)

Dir.mktmpdir('kalaxa-build') do |stage|
  FileUtils.cp(File.join(ROOT, 'kalaxa.rb'), stage)
  FileUtils.cp_r(File.join(ROOT, 'kalaxa'), stage)

  # گارد بهداشت بسته (بازبینی فاز ۰۲): فقط پوشه‌های شناخته‌شده وارد RBZ می‌شوند.
  #
  # هشدار برای آینده: این فهرست **allow-list** است. پوشهٔ تازه‌ای که این‌جا اضافه
  # نشود بی‌صدا از بسته حذف می‌شود و پلاگین نصب‌شده می‌ترکد — دقیقاً همین برای
  # `data/` رخ داد (کاتالوگ دامنه) و فقط با ساخت واقعی بسته دیده شد، نه با تست‌ها.
  # `test_package.rb` حالا این را می‌گیرد.
  ALLOWED_DIRS = %w[adapter app data domain i18n persistence ui lib].freeze
  Dir.children(File.join(stage, 'kalaxa')).each do |entry|
    full = File.join(stage, 'kalaxa', entry)
    next unless File.directory?(full)
    unless ALLOWED_DIRS.include?(entry) # dev/ و هر پوشه ناشناخته حذف می‌شود
      warn "BUILD GUARD: removing unexpected directory from package: kalaxa/#{entry}"
      FileUtils.rm_rf(full)
    end
  end

  build_info = {
    'type' => build_type,
    'built_at' => Time.now.utc.strftime('%Y-%m-%dT%H:%M:%SZ'),
    'version' => Kalaxa::VERSION
  }
  File.write(File.join(stage, 'kalaxa', 'build_info.json'),
             JSON.pretty_generate(build_info), encoding: 'UTF-8')

  if build_type == 'dev'
    # نسخهٔ توسعه: سطح لاگ پیش‌فرض debug از طریق فایل نشانگر
    File.write(File.join(stage, 'kalaxa', 'DEV_BUILD'), "debug\n")
  end

  ok =
    if system('zip -v > /dev/null 2>&1')
      Dir.chdir(stage) { system('zip', '-qr', out, '.') }
    else
      zip_tmp = "#{out}.zip"
      ps = format(
        'Compress-Archive -Path %s -DestinationPath %s -Force',
        "'#{File.join(stage, '*')}'", "'#{zip_tmp}'"
      )
      system('powershell', '-NoProfile', '-Command', ps) &&
        (File.rename(zip_tmp, out) || true)
    end

  abort('BUILD FAILED: could not create archive') unless ok && File.exist?(out)
end

puts "BUILD OK: #{out} (#{File.size(out)} bytes, #{build_type})"
