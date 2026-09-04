# encoding: utf-8
# frozen_string_literal: true

# واژگان کارگاه روی لایهٔ ترجمه — اجرا: ruby test/unit/test_glossary.rb
#
# دو نیاز جدا که این تست هر دو را قفل می‌کند:
#   «کلمات و اصطلاحات قابل تغییر باشه» → بازنویسی کاربر روی هر کلید.
#   «قسمت زبان فایل جداگانه قابل ترجمه داشته باشه» → هر زبان یک فایل، و
#   بازنویسی‌های یک زبان نباید به زبان دیگر نشت کند.
require 'minitest/autorun'
require 'json'
require 'tmpdir'
require 'fileutils'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-glossary')
ENV['KALAXA_QUIET'] = '1'

require File.join(SRC, 'lib', 'glossary')

class TestGlossary < Minitest::Test
  G = Kalaxa::Glossary
  I = Kalaxa::I18n

  def setup
    FileUtils.rm_f(G.user_path)
    G.reset!
  end
  alias teardown setup

  # ---------- لایهٔ ترجمه: هر زبان یک فایل ----------

  def test_every_locale_file_has_the_same_keys
    missing = I.missing_keys
    assert_empty missing['fa'], "کلیدهای غایب در fa: #{missing['fa'].join(', ')}"
    assert_empty missing['en'], "کلیدهای غایب در en: #{missing['en'].join(', ')}"
  end

  def test_adding_a_language_needs_no_code_change
    # قرارداد: بستهٔ هر زبان فقط از i18n/<locale>.json می‌آید.
    I::LOCALES.each do |loc|
      assert File.exist?(File.join(SRC, 'i18n', "#{loc}.json")),
             "زبان #{loc} فایل ترجمه ندارد"
      refute_empty I.bundle(loc)
    end
  end

  def test_domain_terms_are_translated_not_just_ui
    assert_equal 'دیواره', I.bundle('fa')['part.side']
    assert_equal 'Side panel', I.bundle('en')['part.side']
    assert_equal 'بادخور', I.bundle('fa')['term.reveal']
    assert_equal 'Reveal', I.bundle('en')['term.reveal']
  end

  # ---------- واژگان کارگاه: بازنویسی کاربر ----------

  def test_default_comes_from_the_active_locale
    assert_equal 'بادخور', G.t('term.reveal', 'fa')
    assert_equal 'قید بالا', G.t('part.rail_top', 'fa')
  end

  def test_user_override_wins
    assert G.save_overrides({ 'term.reveal' => 'عاصف' }, 'fa')
    assert_equal 'عاصف', G.t('term.reveal', 'fa')
    assert G.overridden?('term.reveal', 'fa')
    refute G.overridden?('part.side', 'fa'), 'کلید دست‌نخورده نباید «تغییر داده شده» باشد'
  end

  def test_override_of_one_locale_does_not_leak_to_another
    G.save_overrides({ 'term.reveal' => 'عاصف' }, 'fa')
    assert_equal 'عاصف', G.t('term.reveal', 'fa')
    assert_equal 'Reveal', G.t('term.reveal', 'en'),
                 'واژهٔ کارگاهِ فارسی نباید روی خروجی انگلیسی بنشیند'
  end

  def test_saving_one_locale_keeps_the_other
    G.save_overrides({ 'term.reveal' => 'عاصف' }, 'fa')
    G.save_overrides({ 'term.reveal' => 'Gap' }, 'en')
    G.reset!
    assert_equal 'عاصف', G.t('term.reveal', 'fa')
    assert_equal 'Gap', G.t('term.reveal', 'en')
  end

  def test_value_equal_to_default_is_not_stored_as_override
    G.save_overrides({ 'part.side' => 'دیواره' }, 'fa')
    refute G.overridden?('part.side', 'fa'), 'برابر پیش‌فرض یعنی بازنویسی لازم نیست'
    assert_equal 'دیواره', G.t('part.side', 'fa')
  end

  def test_empty_value_reverts_to_default
    G.save_overrides({ 'part.side' => 'بغل' }, 'fa')
    assert_equal 'بغل', G.t('part.side', 'fa')
    G.save_overrides({ 'part.side' => '   ' }, 'fa')
    assert_equal 'دیواره', G.t('part.side', 'fa')
  end

  # ---------- مقاومت ----------

  def test_unknown_key_returns_the_key_not_an_exception
    assert_equal 'part.nonexistent', G.t('part.nonexistent', 'fa')
  end

  def test_unknown_key_in_user_file_is_ignored
    File.write(G.user_path,
               JSON.generate('locales' => { 'fa' => { 'part.bogus' => 'جعلی',
                                                      'part.side' => 'بغل' } }))
    G.reset!
    assert_equal 'بغل', G.t('part.side', 'fa')
    assert_equal 'part.bogus', G.t('part.bogus', 'fa'),
                 'کلید ناشناخته در فایل کاربر نباید وارد واژه‌نامه شود'
  end

  def test_corrupt_user_file_falls_back_to_defaults
    File.write(G.user_path, '{ این JSON نیست')
    G.reset!
    assert_equal 'دیواره', G.t('part.side', 'fa'), 'فایل خراب نباید واژه‌نامه را بشکند'
  end

  def test_non_string_override_is_ignored
    File.write(G.user_path, JSON.generate('locales' => { 'fa' => { 'part.side' => 42 } }))
    G.reset!
    assert_equal 'دیواره', G.t('part.side', 'fa')
  end

  # ---------- دامنهٔ ویرایش ----------

  def test_editable_keys_cover_workshop_vocabulary
    keys = G.editable_keys('fa')
    %w[part.side hw.hinge unit.piece template.base_single_door
       category.base slide.ball handle.bar term.reveal].each do |k|
      assert_includes keys, k
    end
  end

  def test_ui_chrome_is_not_workshop_vocabulary
    keys = G.editable_keys('fa')
    %w[app.title panel.language about.version error.reload].each do |k|
      refute_includes keys, k, "#{k} متن رابط است و کارِ مترجم، نه واژگان کارگاه"
    end
  end

  def test_suggestions_offer_synonyms_for_the_same_concept
    assert_includes G.suggestions('term.reveal', 'fa'), 'عاصف'
    assert_includes G.suggestions('term.reveal', 'fa'), 'درز'
    assert_empty G.suggestions('part.nonexistent', 'fa')
  end

  def test_missing_alternatives_file_is_fine
    assert_empty G.suggestions('part.side', 'en'),
                 'زبانی که هنوز فایل پیشنهاد ندارد نباید خطا بدهد'
  end

  # ---------- بستهٔ خروجی برای پنل/JS ----------

  def test_payload_carries_everything_the_panel_needs
    G.save_overrides({ 'part.side' => 'بغل' }, 'fa')
    p = G.payload('fa')
    assert_equal 'fa', p['locale']
    assert_equal 'rtl', p['direction']
    assert_equal 'بغل', p['terms']['part.side']
    assert_includes p['overridden'], 'part.side'
    assert_includes p['editable'], 'term.reveal'
    assert p['alternatives'].key?('term.reveal')
    assert JSON.parse(G.to_json_payload('fa')).is_a?(Hash)
  end
end
