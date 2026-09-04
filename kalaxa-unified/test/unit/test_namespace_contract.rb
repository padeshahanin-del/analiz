# encoding: utf-8
# frozen_string_literal: true

# قرارداد فضای نام ماژول‌های lib/ — اجرا: ruby test/unit/test_namespace_contract.rb
#
# چرا: `SettingsService` و `OffcutStoreIO` زیر یک لایهٔ اضافیِ `Analysis` تعریف شده
# بودند، در حالی که چهار ماژول دیگر lib/ مستقیم زیر `Kalaxa` بودند. analysis_panel.rb
# طبق قاعدهٔ غالب `Kalaxa::SettingsService` نوشت و در زمان اجرا NameError گرفت — که در
# panel_side پشت یک `rescue StandardError` بی‌صدا بلعیده می‌شد و در کال‌بک‌های
# load_settings/save_settings/load_offcut_inventory/save_offcut_inventory کال‌بک را
# می‌کشت. هیچ تستی این را نمی‌دید چون فقط داخل اسکچاپ اجرا می‌شد.
#
# این تست به‌جای قفل‌کردن چند نام مشخص، خودِ قاعده را قفل می‌کند: هر ماژول lib/ دقیقاً
# `Kalaxa::<Name>` است، و هر ارجاعی در مخزن به آن باید همان مسیر را بنویسد.
require 'minitest/autorun'

ROOT = File.expand_path('../..', __dir__) unless defined?(ROOT)
LIB  = File.join(ROOT, 'kalaxa', 'lib')

class TestNamespaceContract < Minitest::Test
  # مسیر ماژولِ تعریف‌شده در یک فایل: زنجیرهٔ پیوستهٔ `module X` در سر فایل.
  # عمداً به تورفتگی تکیه نمی‌کند — نسخهٔ اول همین تست این کار را می‌کرد و یک
  # بازآرایی با تورفتگی غلط را از دست داد.
  def module_path(file)
    path = []
    File.readlines(file, encoding: 'UTF-8').each do |line|
      s = line.strip
      next if s.empty? || s.start_with?('#') || s.start_with?('require')

      m = s.match(/\Amodule\s+([A-Z]\w*)\z/)
      break unless m # اولین خطی که ماژول نیست، انتهای زنجیره است

      path << m[1]
    end
    path
  end

  def lib_files = Dir[File.join(LIB, '*.rb')].sort

  # همهٔ فایل‌های روبی مخزن، به‌جز خروجی build و خود تست‌ها.
  def source_files
    Dir[File.join(ROOT, '**', '*.rb')].reject do |f|
      f.include?("#{File::SEPARATOR}dist#{File::SEPARATOR}") ||
        f.include?("#{File::SEPARATOR}test#{File::SEPARATOR}")
    end.sort
  end

  def test_lib_files_are_scanned
    refute_empty lib_files, 'هیچ فایلی در kalaxa/lib پیدا نشد — مسیر تست خراب است'
  end

  # قاعده: ماژول‌های lib/ دقیقاً دو سطح‌اند — Kalaxa::<Name>.
  def test_every_lib_module_sits_directly_under_kalaxa
    lib_files.each do |f|
      path = module_path(f)
      refute_empty path, "#{File.basename(f)}: هیچ ماژولی تعریف نشده"
      assert_equal 'Kalaxa', path.first, "#{File.basename(f)}: باید زیر Kalaxa باشد"
      assert_equal 2, path.length,
                   "#{File.basename(f)}: فضای نام #{path.join('::')} با بقیهٔ lib/ " \
                   'هم‌خوان نیست — لایهٔ میانی اضافه، دقیقاً همان تلهٔ SettingsService'
    end
  end

  # قاعده: هر ارجاع به یک ماژول lib/ باید همان مسیرِ تعریف‌شده را بنویسد.
  def test_every_reference_matches_the_defined_path
    defined_paths = lib_files.to_h { |f| [module_path(f).last, module_path(f).join('::')] }
    problems = []

    source_files.each do |f|
      File.read(f, encoding: 'UTF-8').each_line.with_index(1) do |line, no|
        next if line.strip.start_with?('#')

        defined_paths.each do |leaf, want|
          line.scan(/Kalaxa::(?:[A-Z]\w*::)*#{leaf}\b/) do |_|
            got = Regexp.last_match(0)
            next if got == want

            problems << "#{f.sub(ROOT + File::SEPARATOR, '')}:#{no} → #{got} " \
                        "(تعریف‌شده: #{want})"
          end
        end
      end
    end

    assert_empty problems,
                 "ارجاع به ماژولی با مسیری غیر از جای تعریفش (NameError در زمان اجرا):\n" +
                 problems.join("\n")
  end

  # مهار مستقیم روی دو ماژولی که این باگ را داشتند — بدون نیاز به اسکچاپ بارگذاری می‌شوند.
  def test_settings_and_offcut_modules_resolve_at_the_referenced_path
    require File.join(LIB, 'settings_service')
    require File.join(LIB, 'offcut_store_io')

    assert Kalaxa.const_defined?(:SettingsService, false),
           'Kalaxa::SettingsService باید مستقیم زیر Kalaxa باشد (analysis_panel.rb همین را صدا می‌زند)'
    assert Kalaxa.const_defined?(:OffcutStoreIO, false),
           'Kalaxa::OffcutStoreIO باید مستقیم زیر Kalaxa باشد'
    assert_respond_to Kalaxa::SettingsService, :load
    assert_respond_to Kalaxa::SettingsService, :save
    assert_respond_to Kalaxa::OffcutStoreIO, :load
    assert_respond_to Kalaxa::OffcutStoreIO, :save
  end
end
