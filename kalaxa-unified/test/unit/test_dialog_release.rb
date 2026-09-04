# encoding: utf-8
# frozen_string_literal: true

# آزادسازی پنجره — اجرا: ruby test/unit/test_dialog_release.rb
#
# چرا این تست هست: کاربر گزارش داد اسکچاپ **بعد از حذف افزونه** بسته
# می‌شود. پنجرهٔ کالاکسا یک مرورگر تعبیه‌شده است که فایل‌های `ui/` را از
# پوشهٔ پلاگین باز نگه می‌دارد. `AnalysisPanel` مرجع پنجره را در `@dialog`
# نگه می‌داشت و **هیچ‌وقت** آزاد نمی‌کرد — نه `set_on_closed` داشت نه جایی
# nil می‌شد. یعنی حتی بعد از اینکه کاربر پنجره را می‌بست، فایل‌ها همچنان
# در دست بودند تا پایان جلسه. حذف پوشه زیر پای یک پروسهٔ زنده روی ویندوز
# دقیقاً همین نشانه را می‌دهد.
#
# این تست خودِ کرش را بازتولید نمی‌کند (اسکچاپ این‌جا نیست)؛ چیزی را قفل
# می‌کند که **می‌شود** اثباتش کرد: بعد از بسته شدن، مرجعی نمی‌ماند.
require 'minitest/autorun'
$LOAD_PATH.unshift(File.expand_path('../stubs', __dir__))
ENV['KALAXA_QUIET'] = '1'
require 'tmpdir'
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir
require 'su_double'

ROOT2 = File.expand_path('../..', __dir__)
require File.join(ROOT2, 'kalaxa', 'main')

class TestDialogRelease < Minitest::Test
  def setup
    Kalaxa::AnalysisPanel.close_dialog
  end

  def teardown
    Kalaxa::AnalysisPanel.close_dialog
  end

  def test_panel_reference_is_released_when_the_user_closes_it
    Kalaxa::AnalysisPanel.show_dialog
    assert Kalaxa::AnalysisPanel.dialog_open?, 'پنل باز نشد'

    dlg = Kalaxa::AnalysisPanel.instance_variable_get(:@dialog)
    dlg.simulate_close   # همان کاری که کاربر با ضربدر پنجره می‌کند

    refute Kalaxa::AnalysisPanel.dialog_open?,
           'پنجره بسته شد ولی مرجعش ماند — فایل‌های پوشهٔ پلاگین در دست می‌مانند'
  end

  def test_explicit_close_releases_it_too
    Kalaxa::AnalysisPanel.show_dialog
    Kalaxa::AnalysisPanel.close_dialog
    refute Kalaxa::AnalysisPanel.dialog_open?, 'بستن صریح مرجع را آزاد نکرد'
  end

  def test_closing_twice_is_safe
    Kalaxa::AnalysisPanel.show_dialog
    Kalaxa::AnalysisPanel.close_dialog
    Kalaxa::AnalysisPanel.close_dialog   # نباید بترکد
    refute Kalaxa::AnalysisPanel.dialog_open?
  end

  def test_closing_when_never_opened_is_safe
    Kalaxa::AnalysisPanel.close_dialog
    refute Kalaxa::AnalysisPanel.dialog_open?
  end

  def test_reopening_after_close_builds_a_fresh_window
    Kalaxa::AnalysisPanel.show_dialog
    first = Kalaxa::AnalysisPanel.instance_variable_get(:@dialog)
    first.simulate_close
    Kalaxa::AnalysisPanel.show_dialog
    second = Kalaxa::AnalysisPanel.instance_variable_get(:@dialog)

    refute_same first, second, 'پنجرهٔ بسته‌شده دوباره استفاده شد'
    assert second.visible?, 'پنجرهٔ تازه باز نشد'
  end

  def test_base_panel_releases_its_reference_too
    # `ui/dialog.rb` هم همین نشتی را داشت: `set_on_closed` فقط لاگ می‌کرد.
    Kalaxa::UI::Dialog.show
    dlg = Kalaxa::UI::Dialog.instance_variable_get(:@dialog)
    refute_nil dlg, 'پنل پایه باز نشد'

    dlg.simulate_close
    assert_nil Kalaxa::UI::Dialog.instance_variable_get(:@dialog),
               'پنل پایه بسته شد ولی مرجعش ماند'
  end

  def test_menu_offers_a_way_to_close_before_uninstalling
    # بدون این آیتم، کاربر هیچ راهی ندارد پیش از حذف پنجره‌ها را ببندد جز
    # بستن کل اسکچاپ.
    src = File.read(File.join(ROOT2, 'kalaxa', 'main.rb'), encoding: 'utf-8')
    assert_includes src, 'Kalaxa::AnalysisPanel.close_dialog',
                    'منو باید پنل آنالیز را ببندد'
    assert_includes src, 'Kalaxa::UI::Dialog.close',
                    'منو باید پنل پایه را هم ببندد'
  end
end
