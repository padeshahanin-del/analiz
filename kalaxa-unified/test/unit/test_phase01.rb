# frozen_string_literal: true

# رینگ A — تست‌های واحد خارج از اسکچاپ.
# اجرا:  ruby test/unit/test_phase01.rb
require 'minitest/autorun'
require 'json'
require 'tmpdir'
require 'fileutils'

SRC = File.expand_path('../../kalaxa', __dir__)

# دایرکتوری دادهٔ ایزوله برای هر اجرای تست + خاموشی خروجی لاگ در کنسول
ENV['KALAXA_DATA_DIR'] = Dir.mktmpdir('ky-test')
ENV['KALAXA_QUIET'] = '1'

require File.join(SRC, 'version')
require File.join(SRC, 'app', 'paths')
require File.join(SRC, 'app', 'logging')
require File.join(SRC, 'app', 'errors')
require File.join(SRC, 'app', 'settings')
require File.join(SRC, 'i18n', 'i18n')
require File.join(SRC, 'ui', 'bridge')

KY = Kalaxa

class TestVersion < Minitest::Test
  def test_version_semver
    assert_match(/\A\d+\.\d+\.\d+\z/, KY::VERSION)
  end

  def test_targets_locked_to_manifest
    assert_equal %w[2023 2024 2025 2026], KY::TARGET_SKETCHUP
  end
end

class TestSettings < Minitest::Test
  def setup
    FileUtils.rm_f(KY::App::Paths.settings_file)
  end

  def test_defaults_when_no_file
    assert_equal 'fa', KY::App::Settings.locale
    assert_equal 'info', KY::App::Settings.get('log_level')
  end

  def test_set_persists_atomically
    KY::App::Settings.locale = 'en'
    assert_equal 'en', JSON.parse(File.read(KY::App::Paths.settings_file))['locale']
    refute File.exist?("#{KY::App::Paths.settings_file}.tmp")
  end

  def test_invalid_locale_raises_validation_error
    err = assert_raises(KY::ValidationError) { KY::App::Settings.locale = 'xx' }
    assert_equal 'KY_VALIDATION', err.code
  end

  def test_corrupt_settings_file_falls_back_to_defaults
    File.write(KY::App::Paths.settings_file, '{not json', encoding: 'UTF-8')
    assert_equal 'fa', KY::App::Settings.locale
  end
end

class TestI18n < Minitest::Test
  def test_fa_and_en_have_identical_keys
    missing = KY::I18n.missing_keys
    assert_empty missing['fa'], "کلیدهای غایب در fa: #{missing['fa']}"
    assert_empty missing['en'], "کلیدهای غایب در en: #{missing['en']}"
  end

  def test_lookup_and_fallback_to_key
    assert_equal 'کالاکسا', KY::I18n.t('app.title', 'fa')
    assert_equal 'no.such.key', KY::I18n.t('no.such.key', 'fa')
  end

  def test_direction
    assert_equal 'rtl', KY::I18n.direction('fa')
    assert_equal 'ltr', KY::I18n.direction('en')
  end

  def test_unknown_locale_raises
    assert_raises(KY::ValidationError) { KY::I18n.bundle('de') }
  end
end

class TestLog < Minitest::Test
  def test_writes_line_to_file_and_respects_level
    KY::App::Log.level = :info
    assert_nil KY::App::Log.debug('hidden')
    line = KY::App::Log.info('visible', a: 1)
    assert_includes line, '[INFO] visible'
    assert_includes File.read(KY::App::Paths.log_file), 'visible'
  end
end

class TestBridge < Minitest::Test
  def call(type, payload = {}, id: 'id1')
    KY::UI::Bridge.handle_raw(JSON.generate('id' => id, 'type' => type, 'payload' => payload))
  end

  def setup
    FileUtils.rm_f(KY::App::Paths.settings_file)
  end

  def test_get_state_shape
    res = call('app/get_state')
    assert res['ok']
    p = res['payload']
    assert_equal KY::VERSION, p['version']
    assert_equal 'fa', p['locale']
    assert_equal 'rtl', p['direction']
    assert_equal 'کالاکسا', p['strings']['app.title']
    assert_equal %w[fa en], p['locales']
  end

  def test_ping_roundtrip_echo
    res = call('app/ping', { 'n' => 42 })
    assert res['ok']
    assert_equal 42, res['payload']['echo']['n']
  end

  def test_set_locale_switches_strings_and_direction_and_persists
    res = call('app/set_locale', { 'locale' => 'en' })
    assert res['ok']
    assert_equal 'ltr', res['payload']['direction']
    assert_equal 'Kalaxa', res['payload']['strings']['app.title']
    assert_equal 'en', KY::App::Settings.locale
  end

  def test_set_invalid_locale_returns_controlled_error_envelope
    res = call('app/set_locale', { 'locale' => 'xx' })
    refute res['ok']
    assert_equal 'KY_VALIDATION', res['error']['code']
    assert_equal 'id1', res['id']
  end

  def test_raise_test_error_is_controlled
    res = call('app/raise_test_error')
    refute res['ok']
    assert_equal 'KY_VALIDATION', res['error']['code']
  end

  def test_ui_error_gets_logged
    res = call('ui/error', { 'message' => 'boom', 'source' => 'app.js', 'line' => 7 })
    assert res['ok']
    assert res['payload']['logged']
    assert_includes File.read(KY::App::Paths.log_file), 'ui error boundary'
  end

  def test_unknown_type_is_controlled_error
    res = call('app/nope')
    refute res['ok']
    assert_equal 'KY_VALIDATION', res['error']['code']
  end

  def test_malformed_json_does_not_raise
    res = KY::UI::Bridge.handle_raw('{{{')
    refute res['ok']
    assert_equal 'KY_BAD_MESSAGE', res['error']['code']
  end
end
