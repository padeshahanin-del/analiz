# encoding: utf-8
# frozen_string_literal: true

# سلامت بستهٔ نصب (RBZ) — اجرا: ruby test/unit/test_package.rb
#
# چرا: `tools/build_rbz.rb` یک **allow-list** از پوشه‌ها دارد. هر پوشهٔ تازه‌ای که
# در آن فهرست نباشد بی‌صدا از بسته حذف می‌شود. دقیقاً همین برای `kalaxa/data/`
# (کاتالوگ دامنه) رخ داد: همهٔ ۲۵۵ تست سبز بودند، `ruby -c` سبز بود، و بستهٔ نصب
# **کاملاً خراب** بود — چون تست‌ها از پوشهٔ منبع می‌خوانند، نه از بسته.
#
# این تست بسته را واقعاً می‌سازد، بازش می‌کند، و می‌سنجد هرچه کد لازم دارد داخلش
# هست. تنها تستی است که «آنچه کاربر نصب می‌کند» را می‌بیند.
require 'minitest/autorun'
require 'tmpdir'
require 'fileutils'
require 'open3'
require 'json'

ROOT = File.expand_path('../..', __dir__) unless defined?(ROOT)

class TestPackage < Minitest::Test
  # بسته یک بار ساخته و بین تست‌ها به اشتراک گذاشته می‌شود (ساختش کند است).
  def self.package
    @package ||= begin
      dir = Dir.mktmpdir('kx-pkg')
      out, err, status = Open3.capture3('ruby', 'tools/build_rbz.rb', chdir: ROOT)
      raise "ساخت بسته شکست خورد: #{err}#{out}" unless status.success?

      rbz = out[%r{BUILD OK: (\S+\.rbz)}, 1]
      raise "مسیر بسته در خروجی پیدا نشد: #{out}" unless rbz

      # unzip برای «هشدار» کد ۱ برمی‌گرداند، نه فقط برای خطا. روی ویندوز
      # Compress-Archive جداکنندهٔ مسیر را بک‌اسلش می‌گذارد که هشدار می‌دهد ولی
      # استخراج انجام می‌شود. پس به‌جای کد خروجی، **نتیجه** را می‌سنجیم.
      _o, e, _st = Open3.capture3('unzip', '-qo', rbz, '-d', dir)
      unless File.exist?(File.join(dir, 'kalaxa.rb'))
        raise "باز کردن بسته شکست خورد: #{e}"
      end

      { dir: dir, rbz: rbz, log: out }
    end
  end

  def pkg = self.class.package
  def dir = pkg[:dir]
  def inside(*parts) = File.join(dir, *parts)

  # ---------- ساختار ----------

  def test_package_has_the_sketchup_entry_points
    assert File.exist?(inside('kalaxa.rb')), 'فایل ورودی kalaxa.rb در بسته نیست'
    assert File.directory?(inside('kalaxa')), 'پوشهٔ kalaxa در بسته نیست'
  end

  def test_dev_and_test_material_is_not_shipped
    refute File.directory?(inside('kalaxa', 'dev')), 'پوشهٔ dev نباید در بسته باشد'
    refute File.exist?(inside('test')), 'تست‌ها نباید در بسته باشند'
  end

  def test_build_info_is_stamped
    info = JSON.parse(File.read(inside('kalaxa', 'build_info.json'), encoding: 'UTF-8'))
    assert_equal 'release', info['type']
    refute_nil info['built_at']
    refute_nil info['version']
  end

  # ---------- قلب این فایل: هرچه کد لازم دارد باید در بسته باشد ----------

  # هر `require_relative` در فایل‌های بسته باید به فایلی برسد که واقعاً هست.
  def test_every_require_resolves_inside_the_package
    missing = []
    Dir.glob(File.join(dir, '**', '*.rb')).each do |f|
      base = File.dirname(f)
      File.read(f, encoding: 'UTF-8').scan(/require_relative\s+'([^']+)'/).flatten.each do |rel|
        target = File.expand_path(rel, base)
        target += '.rb' unless target.end_with?('.rb')
        next if File.exist?(target)

        missing << "#{f.sub(dir + File::SEPARATOR, '')} → #{rel}"
      end
    end
    assert_empty missing, "این require ها در بسته به جایی نمی‌رسند:\n" + missing.join("\n")
  end

  # فایل‌های داده‌ای که کد در زمان اجرا می‌خواند (کاتالوگ، ترجمه) — همان‌هایی که
  # allow-list بسته‌ساز بی‌صدا حذفشان می‌کرد.
  def test_runtime_data_files_are_shipped
    %w[door_shapes materials sheets rails snapshot].each do |name|
      path = inside('kalaxa', 'data', "#{name}.json")
      assert File.exist?(path), "کاتالوگ «#{name}» در بسته نیست — پلاگین نصب‌شده می‌ترکد"
      assert JSON.parse(File.read(path, encoding: 'UTF-8')).is_a?(Hash)
    end
  end

  def test_locale_files_are_shipped
    %w[fa en].each do |loc|
      assert File.exist?(inside('kalaxa', 'i18n', "#{loc}.json")),
             "فایل زبان #{loc} در بسته نیست"
    end
  end

  def test_panel_and_its_engines_are_shipped
    assert File.exist?(inside('kalaxa', 'ui', 'analysis_panel.html'))
    html = File.read(inside('kalaxa', 'ui', 'analysis_panel.html'), encoding: 'UTF-8')
    missing = html.scan(/<script src="([^"]+\.js)"/).flatten.uniq.reject do |src|
      File.exist?(inside('kalaxa', 'ui', src))
    end
    assert_empty missing, "پنل این موتورها را بارگذاری می‌کند ولی در بسته نیستند: #{missing.join(', ')}"
  end

  def test_base_panel_assets_are_shipped
    # `ui/dialog.rb` پنجرهٔ پایه را از `ui/dist/index.html` باز می‌کند.
    # این سه فایل یک‌بار از بسته غایب شدند — `dist/` در `.gitignore` بدون
    # اسلشِ ابتدا نوشته شده بود و **هر** پوشه‌ای به آن نام را می‌گرفت، از
    # جمله این یکی. بسته ۹۳ فایل شد به‌جای ۹۶ و هیچ خطایی هم نداد؛ فقط
    # پنجره خالی می‌ماند. تستِ ساخت این را نمی‌گرفت، چون بسته «ساخته شد».
    src = File.read(File.join(ROOT, 'kalaxa', 'ui', 'dialog.rb'), encoding: 'UTF-8')
    assert_match(/DIST/, src, 'پنل پایه دیگر از ui/dist نمی‌خواند؟ این تست را به‌روز کنید')

    %w[index.html app.js style.css].each do |f|
      assert File.exist?(inside('kalaxa', 'ui', 'dist', f)),
             "پنجرهٔ پایه بدون kalaxa/ui/dist/#{f} خالی باز می‌شود"
    end
  end

  # ---------- آزمون نهایی: کاتالوگ از داخل بسته بارگذاری می‌شود ----------

  def test_catalog_loads_from_the_packaged_copy
    script = <<~RUBY
      $LOAD_PATH.unshift(#{File.join(ROOT, 'test', 'stubs').inspect})
      require #{File.join(dir, 'kalaxa', 'lib', 'catalog').inspect}
      c = Kalaxa::Catalog
      raise 'شکل درب خالی' if c.door_shapes.empty?
      raise 'ورق خالی' if c.sheets.empty?
      raise 'متریال خالی' if c.materials.empty?
      puts c.snapshot_version
    RUBY
    out, err, status = Open3.capture3('ruby', '-e', script)
    assert status.success?,
           "کاتالوگ از داخل بسته بارگذاری نشد — یعنی پلاگین نصب‌شده کار نمی‌کند:\n#{err}"
    assert_equal Kalaxa::Catalog.snapshot_version.to_s, out.strip
  end
end

# نسخهٔ منبع را برای مقایسه لازم داریم.
$LOAD_PATH.unshift(File.join(ROOT, 'test', 'stubs'))
require File.join(ROOT, 'kalaxa', 'lib', 'catalog')
