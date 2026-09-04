# encoding: utf-8
# frozen_string_literal: true

# قرارداد پل پنل ↔ Ruby — اجرا: ruby test/unit/test_panel_bridge.rb
#
# چرا این فایل وجود دارد: واژه‌نامه ساخته شد، هر دو طرفش تست داشت، و **هیچ‌جا به
# پنل وصل نبود** — `kalaxa-glossary.js` را هیچ‌کس بارگذاری نمی‌کرد و موتور یراق
# هرگز واژه‌نامه را نمی‌دید. همان طبقه باگی که این جلسه سه بار دیده شد: نویسنده و
# خواننده‌ای که هرگز به هم نمی‌رسند، و چون هر کدام جدا سبزند، هیچ تستی نمی‌بیندشان.
#
# این تست دو جهت پل را می‌سنجد:
#   JS → Ruby : هر `sketchup.X()` باید `add_action_callback('X')` داشته باشد.
#   Ruby → JS : هر `push_json(dialog, 'onX')` باید `window.onX =` داشته باشد.
# و اینکه هر موتور UMD که مصرف می‌شود واقعاً در HTML بارگذاری شده باشد.
require 'minitest/autorun'

ROOT = File.expand_path('../..', __dir__) unless defined?(ROOT)

class TestPanelBridge < Minitest::Test
  PANEL_RB   = File.join(ROOT, 'kalaxa', 'analysis_panel.rb')
  PANEL_HTML = File.join(ROOT, 'kalaxa', 'ui', 'analysis_panel.html')

  def rb   = @rb ||= File.read(PANEL_RB, encoding: 'UTF-8')
  def html = @html ||= File.read(PANEL_HTML, encoding: 'UTF-8')

  # فقط بدنهٔ اسکریپت درون‌خطی — تا نام‌های داخل متن/کامنت HTML شمرده نشوند.
  def script = @script ||= html.scan(%r{<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>}m).flatten.join("\n")

  def ruby_callbacks = rb.scan(/add_action_callback\('([a-z_]+)'/).flatten.uniq
  def js_calls       = script.scan(/sketchup\.([a-z_]+)\s*\(/).flatten.uniq
  def ruby_pushes    = rb.scan(/push_json\(\s*dialog,\s*'(on[A-Za-z]+)'/).flatten.uniq
  def js_handlers    = script.scan(/window\.(on[A-Za-z]+)\s*=/).flatten.uniq
  def loaded_engines = html.scan(/<script src="(kalaxa-[a-z-]+)\.js"/).flatten.uniq

  def test_files_are_readable
    refute_empty ruby_callbacks, 'هیچ کال‌بکی در analysis_panel.rb پیدا نشد — الگوی تست خراب است'
    refute_empty js_calls, 'هیچ فراخوانی sketchup.* در پنل پیدا نشد'
  end

  # --- JS → Ruby ---
  def test_every_panel_call_has_a_ruby_callback
    missing = js_calls - ruby_callbacks
    assert_empty missing,
                 "پنل این‌ها را صدا می‌زند ولی Ruby ندارد (در اسکچاپ بی‌صدا هیچ کاری نمی‌کنند): " \
                 "#{missing.join(', ')}"
  end

  def test_no_dead_ruby_callbacks
    unused = ruby_callbacks - js_calls
    assert_empty unused,
                 "این کال‌بک‌های Ruby را هیچ‌کس صدا نمی‌زند (کد مرده): #{unused.join(', ')}"
  end

  # --- Ruby → JS ---
  def test_every_ruby_push_has_a_js_handler
    missing = ruby_pushes - js_handlers
    assert_empty missing,
                 "Ruby این‌ها را می‌فرستد ولی پنل گوش نمی‌دهد (پیام گم می‌شود): #{missing.join(', ')}"
  end

  # --- موتورها واقعاً بارگذاری شده‌اند ---
  def test_every_used_engine_is_loaded_in_the_html
    used = script.scan(/\b(Kalaxa[A-Z][A-Za-z]*)\b/).flatten.uniq
    # UMD → نام سراسری: KalaxaDoorProfile ⇒ kalaxa-door-profile
    expected = used.map do |g|
      'kalaxa-' + g.sub(/\AKalaxa/, '').gsub(/([a-z0-9])([A-Z])/, '\1-\2').downcase
    end
    missing = expected.reject { |f| loaded_engines.include?(f) }
    assert_empty missing,
                 "پنل از این موتورها استفاده می‌کند ولی <script> ندارند — در اسکچاپ " \
                 "ReferenceError می‌دهند: #{missing.join(', ')}"
  end

  # فرم گرافیکی درب کلیدهای `project.doors` را می‌نویسد. اگر نام کلیدی در schema
  # عوض شود و فرم عقب بماند، کاربر عددی وارد می‌کند که هیچ‌جا خوانده نمی‌شود —
  # بی‌صدا، چون هیچ خطایی رخ نمی‌دهد.
  DOORS_SCHEMA_KEYS = %w[shape thickness_mm frame_width_mm panel_thickness_mm groove_depth_mm].freeze

  def settings_js = @settings_js ||= File.read(
    File.join(ROOT, 'kalaxa', 'ui', 'kalaxa-settings.js'), encoding: 'UTF-8'
  )

  # نام فیلدها رشتهٔ ثابت در HTML نیستند — از DOOR_NUM_FIELDS ساخته می‌شوند،
  # پس همان آرایه را می‌خوانیم (نسخهٔ اول این تست به دنبال data-door="..." گشت و
  # چون چیزی نیافت، توخالی سبز بود).
  def door_form_keys
    block = script[/var DOOR_NUM_FIELDS = \[(.*?)\];/m, 1].to_s
    keys = block.scan(/\['([a-z_]+)'/).flatten
    keys << 'shape' if script.include?('id="door-shape"')
    keys << 'thickness_mm' if script.include?('id="door-thick"')
    keys.uniq
  end

  def test_door_form_writes_only_keys_the_schema_knows
    written = door_form_keys
    assert_operator written.length, :>=, 4, 'فیلدهای فرم درب پیدا نشد — الگوی تست خراب است'

    unknown = written - DOORS_SCHEMA_KEYS
    assert_empty unknown,
                 "فرم درب این کلیدها را می‌نویسد ولی در project.doors نیستند: #{unknown.join(', ')}"
  end

  def test_door_form_covers_every_schema_key
    missing = DOORS_SCHEMA_KEYS - door_form_keys
    assert_empty missing,
                 "این کلیدهای project.doors فیلد گرافیکی ندارند (فقط از راه JSON): #{missing.join(', ')}"
  end

  def test_doors_schema_keys_match_the_settings_defaults
    block = settings_js[/doors:\s*\{(.*?)\}/m, 1]
    refute_nil block, 'بخش doors در پیش‌فرض‌های تنظیمات پیدا نشد'
    defined_keys = block.scan(/^\s*([a-z_]+):/).flatten.uniq
    assert_equal DOORS_SCHEMA_KEYS.sort, defined_keys.sort,
                 'کلیدهای project.doors با آنچه تست و فرم می‌شناسند نمی‌خواند'
  end

  def test_door_form_is_rendered_on_settings_sync
    assert_match(/function syncSettingsUI\(\)[^\n]*renderDoorForm\(\)/, script,
                 'فرم درب باید هنگام هماهنگی تنظیمات رسم شود، وگرنه خالی می‌ماند')
    assert_match(/function renderDoorForm/, script)
  end

  # فهرست شکل‌ها نباید در پنل دوباره نوشته شود — باید از موتور تنظیمات بیاید.
  # نسخهٔ اول این تست فقط یک آرایهٔ خاص را رد می‌کرد و با یک شیء literal دور می‌خورد؛
  # حالا خودِ قاعده سنجیده می‌شود: هیچ شناسهٔ شکلی به‌صورت رشتهٔ ثابت در پنل نیست.
  SHAPE_IDS = %w[flat routed framed_panel glass_aluminum mdf_aluminum glass_full].freeze

  def test_door_shapes_are_not_hardcoded_in_the_panel
    assert_match(/var shapes = KalaxaSettings\.DOOR_SHAPES;/, script,
                 'فرم باید فهرست شکل را از KalaxaSettings بگیرد، نه کپی دستی')

    leaked = SHAPE_IDS.select { |id| script.match?(/['"]#{Regexp.escape(id)}['"]/) }
    assert_empty leaked,
                 "شناسهٔ شکل به‌صورت رشتهٔ ثابت در پنل آمده — با افزودن شکل تازه واگرا " \
                 "می‌شود: #{leaked.join(', ')}"
  end

  def test_glossary_is_actually_wired_end_to_end
    # مهار مشخص روی همان چیزی که شکسته بود.
    assert_includes loaded_engines, 'kalaxa-glossary', 'موتور واژه‌نامه باید بارگذاری شود'
    assert_includes ruby_callbacks, 'load_glossary'
    assert_includes ruby_callbacks, 'save_glossary'
    assert_includes js_handlers, 'onGlossary'
    assert_match(/glossary:\s*state\.glossary/, script,
                 'واژه‌نامه باید واقعاً به موتور یراق پاس داده شود، نه فقط دریافت شود')
    assert_match(/sketchup\.load_glossary\(\)/, script,
                 'پنل باید هنگام بالا آمدن واژه‌نامه را بخواهد')
  end
end
