# encoding: utf-8
# frozen_string_literal: true

# منو — تنها راه ورود کاربر به پلاگین. اجرا:
#   ruby test/unit/test_menu_boundary.rb
#
# چرا این مهم‌ترین تستِ مرز است: منو تنها جایی است که کاربر پلاگین را لمس می‌کند،
# و این جلسه **دو بار** NameError خاموش پشت آیتم‌های منو پیدا شد
# (`Kalaxa::SettingsService` که زیر فضای نام دیگری بود، و کال‌بک‌هایی که هرگز به
# پنل وصل نشده بودند). هر دو در `ruby -c` سبز بودند و فقط داخل اسکچاپ می‌ترکیدند.
#
# این تست هر آیتم منو را **واقعاً صدا می‌زند** و می‌سنجد که هیچ ثابت/متد
# تعریف‌نشده‌ای در مسیرش نباشد. main.rb خودش هم تا امروز در هیچ تستی بارگذاری
# نمی‌شد.
require 'minitest/autorun'
require 'tmpdir'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
$LOAD_PATH.unshift(File.expand_path('../stubs', __dir__))
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-menu')
ENV['KALAXA_QUIET'] = '1'

require 'su_double'
require File.join(SRC, 'main')

class TestMenuBoundary < Minitest::Test
  MENU_TITLE = 'Kalaxa | کالاکسا'

  def setup
    ::UI.reset!
    ::UI.reset_menus!
    Sketchup.active_model = Sketchup::Model.new
    Kalaxa::Main.instance_variable_set(:@booted, nil)
    Kalaxa::Main.boot
  end

  def menu = ::UI.root_menu.submenu('Extensions').submenu(MENU_TITLE)

  def test_menu_is_registered
    refute_nil menu, 'منوی کالاکسا زیر Extensions ساخته نشد'
    refute_empty menu.items
  end

  def test_every_expected_entry_point_exists
    titles = menu.items.keys
    %w[افزودن\ کابینت افزودن\ صفحه خواندن\ کابینت آنالیز\ برش خروجی About].each do |frag|
      assert titles.any? { |t| t.include?(frag.tr("\\", '')) },
             "آیتم منوی «#{frag}» پیدا نشد. موجود: #{titles.inspect}"
    end
  end

  # قلب این فایل: هر آیتم را صدا بزن و مطمئن شو هیچ نام تعریف‌نشده‌ای در مسیرش
  # نیست. NameError/NoMethodError یعنی آیتمی که در اسکچاپ برای کاربر کار نمی‌کند.
  def test_every_menu_item_runs_without_undefined_names
    broken = []
    menu.items.each do |title, block|
      ::UI.next_inputbox = nil # دیالوگ‌ها را لغو کن تا فقط مسیر کد سنجیده شود
      begin
        block.call
      rescue NameError, NoMethodError => e
        broken << "#{title} → #{e.class}: #{e.message}"
      rescue StandardError
        # خطای دامنه‌ای (مثلاً مدل خالی) اشکال نیست؛ فقط نامِ تعریف‌نشده مهم است.
        nil
      end
    end

    assert_empty broken,
                 "این آیتم‌های منو به نام تعریف‌نشده می‌خورند — در اسکچاپ برای " \
                 "کاربر هیچ کاری نمی‌کنند:\n" + broken.join("\n")
  end

  # نگهبان دوم: خودِ آیتم‌های منو `rescue` دارند و خطا را به پیام تبدیل می‌کنند،
  # پس استثنا از بیرون دیده نمی‌شود. آنچه کاربر می‌بیند «خطا…» است — پس همان را
  # می‌سنجیم. روی مدل سالم، هیچ آیتمی نباید خطا گزارش کند.
  def test_no_menu_item_reports_an_error_on_a_clean_model
    menu.items.each do |title, block|
      ::UI.reset!
      ::UI.next_inputbox = nil
      begin
        block.call
      rescue StandardError
        nil
      end
      errors = ::UI.messages.select { |m| m.start_with?('خطا') }
      assert_empty errors, "آیتم «#{title}» روی مدل سالم خطا داد: #{errors.inspect}"
    end
  end

  # سومین نگهبان — و همان جایی که باگ ۳.۲۵.۲ زندگی می‌کرد: باز کردن پنل فقط
  # کال‌بک‌ها را **ثبت** می‌کند. تا وقتی صدایشان نزنی، نام تعریف‌نشدهٔ داخلشان
  # دیده نمی‌شود. این تست هر کال‌بکِ بی‌آرگومان را واقعاً اجرا می‌کند.
  NO_ARG_CALLBACKS = %w[load_settings load_catalog load_glossary
                        load_offcut_inventory load_doc scan_model].freeze

  def test_registered_callbacks_run_without_undefined_names
    item = menu.items.keys.find { |t| t.include?('آنالیز برش') }
    menu.items[item].call
    dialog = Kalaxa::AnalysisPanel.instance_variable_get(:@dialog)

    broken = []
    NO_ARG_CALLBACKS.each do |name|
      cb = dialog.callbacks[name]
      next unless cb

      begin
        cb.call(nil)
      rescue NameError, NoMethodError => e
        broken << "#{name} → #{e.class}: #{e.message}"
      rescue StandardError
        nil
      end
    end

    assert_empty broken,
                 "این کال‌بک‌ها به نام تعریف‌نشده می‌خورند — پنل ثبتشان می‌کند ولی " \
                 "در اسکچاپ بی‌صدا می‌میرند:\n" + broken.join("\n")
  end

  def test_cancelling_a_dialog_leaves_no_tool_active
    item = menu.items.keys.find { |t| t.include?('افزودن کابینت') }
    ::UI.next_inputbox = nil
    menu.items[item].call
    assert_nil Sketchup.active_model.selected_tool
  end

  def test_about_tells_the_user_the_version
    item = menu.items.keys.find { |t| t.include?('About') }
    menu.items[item].call
    assert ::UI.said?(Kalaxa::VERSION), "«درباره» باید نسخه را بگوید: #{::UI.messages.inspect}"
  end

  def test_analysis_panel_opens
    item = menu.items.keys.find { |t| t.include?('آنالیز برش') }
    menu.items[item].call
    # پنل نمونهٔ HtmlDialog می‌سازد و نشانش می‌دهد؛ اگر کال‌بکی نام غلط داشت،
    # همین‌جا NameError می‌گرفتیم.
    assert Kalaxa::AnalysisPanel.instance_variable_get(:@dialog),
           'پنل آنالیز باید دیالوگ بسازد'
  end

  # پنل و Ruby باید سر نام کال‌بک‌ها توافق داشته باشند. test_panel_bridge این را
  # از روی متن می‌سنجد؛ این‌جا از روی **ثبت واقعی** سنجیده می‌شود.
  def test_registered_callbacks_match_what_the_panel_calls
    item = menu.items.keys.find { |t| t.include?('آنالیز برش') }
    menu.items[item].call
    dialog = Kalaxa::AnalysisPanel.instance_variable_get(:@dialog)
    registered = dialog.callbacks.keys

    html = File.read(File.join(SRC, 'ui', 'analysis_panel.html'), encoding: 'UTF-8')
    script = html[/<script(?![^>]*\bsrc=)[^>]*>(.*?)<\/script>/m, 1].to_s
    called = script.scan(/sketchup\.([a-z_]+)\s*\(/).flatten.uniq

    missing = called - registered
    assert_empty missing,
                 "پنل این‌ها را صدا می‌زند ولی هنگام اجرا ثبت نشده‌اند: #{missing.join(', ')}"
  end

  def test_boot_is_idempotent
    before = menu.items.length
    Kalaxa::Main.boot
    assert_equal before, menu.items.length, 'بوت دوباره نباید منو را تکرار کند'
  end
end
