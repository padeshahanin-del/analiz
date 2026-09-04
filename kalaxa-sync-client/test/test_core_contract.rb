# frozen_string_literal: true

# تست قرارداد با هستهٔ پلاگین Kalaxa — اجرا: ruby test/test_core_contract.rb
#
# چرا این فایل وجود دارد: این مخزن عمداً از هسته جداست، ولی در زمان اجرا مستقیماً
# به نمادهای آن تکیه می‌کند (App::Paths، App::Log، Adapter::Store، Persistence::*).
# هیچ‌چیز این تکیه را تأیید نمی‌کرد، و دقیقاً همین‌جا دو بار باگ خورده‌ایم:
#   - `UI` که به Kalaxa::UI رزولو می‌شد به‌جای ::UI (ثبت‌شده در README)
#   - `App::Paths.data_dir` که هرگز وجود نداشت (نام واقعی: user_data_dir) —
#     چون config_path پشتِ حافظهٔ config است و config اولین چیزی است که
#     configured? لمس می‌کند، هر چهار فرمان منو پیش از رسیدن به guarded می‌مردند.
# هر دو فقط در «سناریوی واقعیِ نصب‌بودنِ هسته» خودشان را نشان می‌دادند — یعنی جایی
# که هیچ تستی نگاه نمی‌کرد. این فایل همان‌جا را نگاه می‌کند.
require 'minitest/autorun'
require 'json'
require 'tmpdir'

CORE = File.expand_path('../../kalaxa-unified/kalaxa', __dir__)

unless File.directory?(CORE)
  warn "رد شد: هستهٔ Kalaxa کنار این مخزن نیست (#{CORE})"
  # بدون هسته این تست بی‌معناست؛ سوئیت را قرمز نمی‌کنیم.
  Minitest.autorun if false
end

if File.directory?(CORE)
  ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-client-test')
  ENV['KALAXA_QUIET'] = '1'

  require File.join(CORE, 'app', 'paths')
  require File.join(CORE, 'app', 'logging')
  require File.join(CORE, 'domain', 'entities')
  require File.join(CORE, 'persistence', 'canonical')
  require File.join(CORE, 'persistence', 'serializer')
  require File.join(CORE, 'adapter', 'store')
  require File.join(CORE, 'adapter', 'sync_port')

  require_relative '../kalaxa_sync_client/client'
  require_relative '../kalaxa_sync_client/http_sync_port'

  class TestCoreContract < Minitest::Test
    C = Kalaxa::SyncClient::Client

    def setup
      C.instance_variable_set(:@config, nil) # حافظهٔ config بین تست‌ها نشت نکند
      FileUtils.rm_f(C.config_path)
    end

    # ---------- نمادهایی که کلاینت از هسته صدا می‌زند ----------
    # هر کدام از این‌ها که در هسته تغییر نام بدهد، اینجا قرمز می‌شود — نه در دست کاربر.

    def test_paths_api_used_by_config_path
      assert_respond_to Kalaxa::App::Paths, :user_data_dir
    end

    def test_log_api_used_by_guarded_and_flows
      assert_respond_to Kalaxa::App::Log, :error
      assert_respond_to Kalaxa::App::Log, :info
    end

    def test_store_api_used_by_pull_and_current_state
      assert_respond_to Kalaxa::Adapter::Store, :load_document
      assert_respond_to Kalaxa::Adapter::Store, :with_operation
      assert Kalaxa::Adapter::Store.const_defined?(:DICT)
      assert Kalaxa::Adapter::Store.const_defined?(:KEY_DOC)
    end

    def test_persistence_api_used_by_checksum_and_push
      assert_respond_to Kalaxa::Persistence::Canonical, :checksum
      assert_respond_to Kalaxa::Persistence::Serializer, :safe_load
      assert_respond_to Kalaxa::Persistence::Serializer, :dump
    end

    # پاکت push دقیقاً همین سه کلید را می‌فرستد؛ هسته نباید آن‌ها را رد کند.
    def test_sync_keys_accepted_by_dump
      assert_equal %w[revision updated_at device_id],
                   Kalaxa::Persistence::Serializer::SYNC_KEYS
    end

    def test_http_port_conforms_to_core_sync_port
      port = Kalaxa::SyncClient::HttpSyncPort.new(
        base_url: 'https://example.test', username: 'u', app_password: 'p'
      )
      assert Kalaxa::Adapter::SyncPort.conforming?(port),
             'HttpSyncPort باید قرارداد Adapter::SyncPort را برآورده کند'
    end

    # ---------- پیکربندی محلی ----------

    def test_config_path_resolves_under_injected_data_dir
      assert_equal File.join(ENV['KALAXA_DATA_DIR'], 'Kalaxa', 'sync_client.json'),
                   C.config_path
    end

    def test_config_round_trips_and_generates_device_id
      C.config['base_url'] = 'https://kalaxa.ir'
      C.config['username'] = 'user'
      C.config['app_password'] = 'secret'
      C.save_config

      assert C.configured?
      on_disk = JSON.parse(File.read(C.config_path))
      assert_match(/\Asketchup-/, on_disk['device_id'], 'device_id باید ساخته و ذخیره شود')
      assert_equal 'https://kalaxa.ir', on_disk['base_url']
    end

    def test_not_configured_when_fields_blank
      C.config['base_url'] = 'https://kalaxa.ir'
      C.config['username'] = '   '
      C.config['app_password'] = 'secret'
      refute C.configured?, 'فیلد فقط-فاصله نباید «پیکربندی‌شده» حساب شود'
    end

    def test_corrupt_config_does_not_raise
      File.write(C.config_path, '{ this is not json')
      C.instance_variable_set(:@config, nil)
      assert_kind_of Hash, C.config
      refute C.configured?
    end

    # اپ‌پسورد متن ساده است؛ فایل نباید برای کاربران دیگر همان دستگاه خواندنی باشد.
    def test_config_file_is_owner_only
      skip 'مجوز POSIX روی ویندوز معنا ندارد' if Gem.win_platform?
      C.config['base_url'] = 'https://kalaxa.ir'
      C.save_config
      assert_equal '600', format('%o', File.stat(C.config_path).mode & 0o777)
    end

    def test_remember_synced_persists_revision_and_checksum
      C.remember_synced('proj-1', 4, 'ck-abc')
      C.instance_variable_set(:@config, nil)
      assert_equal 4, C.last_synced('proj-1')
      assert_equal 'ck-abc', C.last_synced_checksum('proj-1')
    end

    def test_last_synced_is_nil_for_unknown_project
      assert_nil C.last_synced('never-seen')
      assert_nil C.last_synced_checksum('never-seen')
    end
  end
end
