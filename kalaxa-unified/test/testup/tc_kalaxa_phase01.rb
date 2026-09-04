# frozen_string_literal: true

# رینگ B — تست‌های داخل SketchUp با TestUp 2.
# اجرا روی سیستم شما:
#  1) افزونهٔ TestUp 2 را از Extension Warehouse نصب کنید.
#  2) کالاکسا (RBZ) را نصب و اسکچاپ را دوباره باز کنید.
#  3) Extensions ▸ TestUp ▸ افزودن مسیر پوشهٔ test/testup این مخزن ▸ اجرای سوئیت TC_Kalaxa_Phase01.
# نتیجه را (تصویر یا لاگ TestUp) در بازبینی مرحله گزارش کنید.

require 'testup/testcase'

class TC_Kalaxa_Phase01 < TestUp::TestCase
  def test_extension_registered_and_loaded
    ext = Sketchup.extensions['Kalaxa | کالاکسا']
    refute_nil ext, 'افزونه ثبت نشده است'
    assert ext.loaded?, 'افزونه بارگذاری نشده است'
    assert_equal Kalaxa::VERSION, ext.version
  end

  def test_no_double_boot
    assert Kalaxa::Main.booted?
    # فراخوانی دوباره نباید منوی تکراری بسازد؛ boot باید false برگرداند
    assert_equal false, Kalaxa::Main.boot
  end

  def test_panel_opens_and_reopens
    d1 = Kalaxa::UI::Dialog.show
    assert d1.visible?, 'پنل باز نشد'
    Kalaxa::UI::Dialog.close
    d2 = Kalaxa::UI::Dialog.show
    assert d2.visible?, 'پنل پس از بستن دوباره باز نشد'
    Kalaxa::UI::Dialog.close
  end

  def test_bridge_roundtrip_inside_sketchup
    res = Kalaxa::UI::Bridge.handle_raw(
      '{"id":"t1","type":"app/ping","payload":{"n":1}}'
    )
    assert res['ok']
    assert_equal 1, res['payload']['echo']['n']
  end

  def test_locale_switch_inside_sketchup
    Kalaxa::App::Settings.locale = 'en'
    state = Kalaxa::UI::Bridge.state_payload
    assert_equal 'ltr', state['direction']
    Kalaxa::App::Settings.locale = 'fa'
    state = Kalaxa::UI::Bridge.state_payload
    assert_equal 'rtl', state['direction']
  end

  def test_controlled_error_logged_not_raised
    res = Kalaxa::UI::Bridge.handle_raw(
      '{"id":"t2","type":"app/raise_test_error","payload":{}}'
    )
    refute res['ok']
    assert_equal 'KY_VALIDATION', res['error']['code']
  end

  def test_about_text_contains_version
    assert_includes Kalaxa::UI::Dialog.about_text, Kalaxa::VERSION
  end
end
