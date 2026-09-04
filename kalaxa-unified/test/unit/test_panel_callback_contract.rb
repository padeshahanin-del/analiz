# encoding: utf-8
# frozen_string_literal: true

# قرارداد فراخوانی پنل ↔ روبی — اجرا: ruby test/unit/test_panel_callback_contract.rb
#
# پنل با `window.sketchup.NAME(...)` روبی را صدا می‌زند و روبی با
# `push_json(dialog, 'onNAME', ...)` جواب می‌دهد. هیچ‌کدام از این دو سر، طرف
# مقابل را نمی‌شناسد: اگر نامی یک طرف عوض شود، **هیچ خطایی رخ نمی‌دهد** —
# دکمه فشار داده می‌شود و هیچ اتفاقی نمی‌افتد.
#
# این دقیقاً همان الگویی است که در این پروژه بارها باگ ساخته: نویسنده و
# خواننده هرگز هم را نمی‌بینند و هر دو سبزند. تست‌های واحدِ هر طرف این را
# نمی‌گیرند، چون هر طرف به‌تنهایی درست است.
require 'minitest/autorun'

ROOT = File.expand_path('../..', __dir__) unless defined?(ROOT)
PANEL_RB = File.read(File.join(ROOT, 'kalaxa', 'analysis_panel.rb'), encoding: 'utf-8')
PANEL_JS = File.read(File.join(ROOT, 'kalaxa', 'ui', 'analysis_panel.html'), encoding: 'utf-8')

class TestPanelCallbackContract < Minitest::Test
  # نام‌هایی که JS صدا می‌زند
  def js_calls
    PANEL_JS.scan(/window\.sketchup\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/).flatten.uniq
  end

  # نام‌هایی که روبی ثبت کرده
  def ruby_callbacks
    PANEL_RB.scan(/add_action_callback\(['"]([^'"]+)['"]/).flatten.uniq
  end

  # نام‌هایی که روبی به JS پس می‌فرستد
  def ruby_pushes
    PANEL_RB.scan(/push_json\([^,]+,\s*['"]([^'"]+)['"]/).flatten.uniq
  end

  # نام‌هایی که JS برای دریافت تعریف کرده
  def js_handlers
    PANEL_JS.scan(/window\.(on[A-Za-z0-9_]*)\s*=/).flatten.uniq
  end

  def test_there_is_something_to_check
    # اگر الگوها به‌خاطر بازنویسی فایل دیگر چیزی پیدا نکنند، این تست بی‌صدا
    # سبز می‌ماند و هیچ‌چیز را نگه نمی‌دارد — بدترین حالت.
    refute_empty js_calls, 'هیچ فراخوانی JS→روبی پیدا نشد؛ الگوی تست کهنه شده'
    refute_empty ruby_callbacks, 'هیچ callback روبی پیدا نشد؛ الگوی تست کهنه شده'
    refute_empty ruby_pushes, 'هیچ push_json پیدا نشد؛ الگوی تست کهنه شده'
    refute_empty js_handlers, 'هیچ گیرندهٔ JS پیدا نشد؛ الگوی تست کهنه شده'
  end

  def test_every_js_call_has_a_ruby_handler
    missing = js_calls - ruby_callbacks
    assert_empty missing,
                 "پنل این‌ها را صدا می‌زند ولی روبی ثبتشان نکرده: #{missing.join(', ')} — " \
                 'دکمه کار می‌کند و هیچ اتفاقی نمی‌افتد، بدون خطا'
  end

  def test_every_ruby_push_has_a_js_receiver
    missing = ruby_pushes - js_handlers
    assert_empty missing,
                 "روبی این‌ها را می‌فرستد ولی JS گیرنده ندارد: #{missing.join(', ')} — " \
                 'جواب می‌آید و در هوا گم می‌شود'
  end

  def test_no_ruby_callback_is_dead_code
    # عکسِ قضیه هم مهم است: callbackی که هیچ‌کس صدا نمی‌زند یعنی یا کار
    # نیمه‌تمام مانده یا نامش عوض شده و نسخهٔ قدیمی جا مانده.
    dead = ruby_callbacks - js_calls
    assert_empty dead,
                 "روبی این‌ها را ثبت کرده ولی پنل هرگز صدایشان نمی‌زند: #{dead.join(', ')}"
  end

  # ---------- خروجی اکسل ----------

  def test_excel_callbacks_are_wired_both_ways
    assert_includes ruby_callbacks, 'export_csv', 'خروجی اکسل باید در روبی ثبت باشد'
    assert_includes ruby_callbacks, 'import_csv', 'ورودی اکسل باید در روبی ثبت باشد'
    assert_includes js_calls, 'export_csv'
    assert_includes js_calls, 'import_csv'
    assert_includes js_handlers, 'onCsvImported',
                    'جواب ورودی اکسل باید گیرنده داشته باشد'
  end

  def test_csv_is_written_as_binary
    # `File.write` روی ویندوز LF را CRLF می‌کند. CSV از قبل CRLF دارد، پس هر
    # سطر یک خط خالی می‌گیرد و اکسل فایل را دوبرابر و خراب نشان می‌دهد.
    # BOM هم باید بایت‌به‌بایت برود وگرنه فارسی خراب می‌شود.
    csv_block = PANEL_RB[/add_action_callback\('export_csv'\).*?\n        end/m]
    refute_nil csv_block, 'بلوک export_csv پیدا نشد'
    assert_includes csv_block, 'File.binwrite',
                    'CSV باید باینری نوشته شود، وگرنه اکسل خرابش می‌بیند'
  end

  # ---------- بستهٔ تمپلیت ----------

  def test_template_pack_import_is_wired_both_ways
    assert_includes ruby_callbacks, 'import_template_pack'
    assert_includes js_calls, 'import_template_pack'
    assert_includes js_handlers, 'onTemplatePack',
                    'جواب باید گیرنده داشته باشد، وگرنه فایل خوانده می‌شود و در هوا گم'
  end

  def test_template_pack_is_read_as_binary_too
    block = PANEL_RB[/add_action_callback\('import_template_pack'\).*?
        end/m]
    refute_nil block, 'بلوک import_template_pack پیدا نشد'
    assert_includes block, 'openpanel', 'فایل را کاربر انتخاب می‌کند'
    assert_includes block, 'binread', 'خواندن باینری تا فارسی خراب نشود'
  end

  # خروجی بسته از همان مسیر CSV می‌رود ولی پسوندش json است. اگر پسوند
  # نادیده گرفته شود، فایل JSON با نام .csv ذخیره می‌شود و کاربر فکر می‌کند
  # خروجی خراب است.
  def test_export_honours_the_requested_extension
    block = PANEL_RB[/add_action_callback\('export_csv'\).*?
        end/m]
    refute_nil block
    assert_includes block, "payload['ext']",
                    'پسوند از فراخوان خوانده می‌شود، نه ثابتِ csv'
    assert_match(/gsub|tr/, block, 'و پاک‌سازی می‌شود تا مسیر ساختگی نسازد')
  end

  # ---------- ترتیب پردازش در پنل ----------

  # این باگ در **ترتیب** بود، نه در هیچ ماژولی. هر دو طرف درست بودند:
  # `withImported` قطعات را می‌ساخت و `applyToSnapshot` کسر نوار را اعمال
  # می‌کرد. ولی پل بعد از تنظیمات اجرا می‌شد، پس قطعات خوانده‌شده کسر نوار
  # نمی‌گرفتند — یک تختهٔ یکسان در کابینت ساختهٔ کالاکسا ۷۱۸ و در کابینت
  # خوانده‌شده ۷۲۰. تست‌های واحدِ هر ماژول این را نمی‌گیرند.
  def test_imported_cabinets_enter_before_settings_are_applied
    bridge = PANEL_JS.index('snapshot = withImported(snapshot);')
    settings = PANEL_JS.index('KalaxaSettings.applyToSnapshot(snapshot')

    refute_nil bridge, 'فراخوانی پل پیدا نشد؛ الگوی تست کهنه شده'
    refute_nil settings, 'فراخوانی applyToSnapshot پیدا نشد؛ الگوی تست کهنه شده'
    assert bridge < settings,
           'پل باید **قبل** از اعمال تنظیمات اجرا شود، وگرنه قطعات خوانده‌شده '            'کسر ضخامت نوار و پیش‌فرض‌های دیگر را نمی‌گیرند'
  end

  def test_nesting_runs_after_both
    settings = PANEL_JS.index('KalaxaSettings.applyToSnapshot(snapshot')
    nesting  = PANEL_JS.index('KalaxaNesting.run(snapshot)')
    refute_nil nesting, 'فراخوانی نستینگ پیدا نشد؛ الگوی تست کهنه شده'
    assert settings < nesting,
           'نستینگ باید آخر باشد — روی ابعادی که تنظیمات نهایی کرده'
  end

  def test_import_reads_a_user_chosen_file
    block = PANEL_RB[/add_action_callback\('import_csv'\).*?\n        end/m]
    refute_nil block
    assert_includes block, 'openpanel', 'فایل را کاربر انتخاب می‌کند، نه برنامه'
    assert_includes block, 'binread', 'خواندن باید باینری باشد تا BOM سالم بماند'
  end
end
