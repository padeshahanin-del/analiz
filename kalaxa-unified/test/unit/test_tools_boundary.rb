# encoding: utf-8
# frozen_string_literal: true

# ابزارهای ساخت و «خواندن کابینت انتخاب‌شده» — اجرا:
#   ruby test/unit/test_tools_boundary.rb
#
# این سه فایل (`import_selection`، `create_moulding_tool`، بخش خالصِ
# `create_cabinet_tool`) تا امروز **هرگز در هیچ تستی بارگذاری نمی‌شدند**، چون
# `require 'sketchup.rb'` بیرون از اسکچاپ می‌ترکید. با stub، همان مسیرهایی که
# کاربر واقعاً لمس می‌کند قابل سنجش شدند.
#
# تمرکز روی **قراردادهای بین‌مرزی**: آنچه ابزار می‌نویسد باید دقیقاً همان چیزی
# باشد که ProjectScanner می‌خواند. یک تغییر نام در هر طرف، بی‌صدا می‌شکند — همان
# طبقه باگی که این جلسه چند بار دیده شد.
require 'minitest/autorun'
require 'json'
require 'tmpdir'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
$LOAD_PATH.unshift(File.expand_path('../stubs', __dir__))
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-tools')
ENV['KALAXA_QUIET'] = '1'

require 'su_double'
require File.join(SRC, 'lib', 'project_scanner')
require File.join(SRC, 'app', 'import_selection')
require File.join(SRC, 'app', 'create_moulding_tool')

class TestToolsBoundary < Minitest::Test
  def setup
    ::UI.reset!
  end

  def solid(x1, y1, z1, name = 'قطعه', pid = 1)
    Sketchup::Group.new(name: name, pid: pid,
                        bounds: Geom::BoundingBox.new(Geom::Point3d.new(0, 0, 0),
                                                      Geom::Point3d.new(x1, y1, z1)))
  end

  def cabinet_with_children(kids, name = 'کابینت من', pid = 100)
    Sketchup::Group.new(definition: Sketchup::ComponentDefinition.new(kids),
                        name: name, pid: pid)
  end

  def activate(model)
    Sketchup.active_model = model
    Kalaxa::App::ImportSelection.run
  end

  # ============================================== خواندن کابینت انتخاب‌شده

  def test_reading_a_selected_cabinet_writes_what_the_scanner_reads
    cab = cabinet_with_children([solid(1, 20, 30, 'چپ', 1), solid(1, 20, 30, 'راست', 2)])
    model = Sketchup::Model.new([cab], [cab])
    activate(model)

    dict = cab.attribute_dictionary(Kalaxa::ProjectScanner::RAW_DICT_NAME)
    refute_nil dict, 'ابزار باید همان dictionary را بنویسد که اسکنر می‌خواند'
    assert_equal 2, dict['child_count']
    assert_equal 'کابینت من', dict['label_fa']

    boxes = JSON.parse(dict['boxes_json'])
    assert_equal 2, boxes.length
    assert boxes.first.key?('dx'), 'جعبه‌ها باید ابعاد داشته باشند'
  end

  # قرارداد واقعی: چیزی که نوشته شد باید در اسکن هم دیده شود.
  def test_written_cabinet_actually_appears_in_a_scan
    cab = cabinet_with_children([solid(1, 20, 30)])
    model = Sketchup::Model.new([cab], [cab])
    activate(model)

    snap = Kalaxa::ProjectScanner.build_snapshot(model)
    assert_equal 1, snap['raw_cabinets'].length,
                 'کابینت خوانده‌شده باید بلافاصله در اسکن ظاهر شود'
    assert_equal 'کابینت من', snap['raw_cabinets'].first['label_fa']
  end

  # همان باگی که ۳.۲۵.۱ رفع شد، این‌بار از سرِ ابزار: ImportSelection انتخاب
  # Component را مجاز می‌کند، پس اسکنر هم باید ببیندش.
  def test_component_cabinet_round_trips_too
    inner = solid(1, 20, 30, 'قطعه', 5)
    comp = Sketchup::ComponentInstance.new(
      definition: Sketchup::ComponentDefinition.new([inner]), name: 'کابینت کامپوننتی', pid: 200
    )
    model = Sketchup::Model.new([comp], [comp])
    activate(model)

    snap = Kalaxa::ProjectScanner.build_snapshot(model)
    assert_equal 1, snap['raw_cabinets'].length,
                 'کابینتِ ساخته‌شده به‌صورت Component هم باید کامل رفت‌وبرگشت کند'
  end

  def test_empty_selection_tells_the_user_what_to_do
    activate(Sketchup::Model.new([], []))
    assert ::UI.said?('انتخاب کنید'), "پیام راهنما لازم است: #{::UI.messages.inspect}"
  end

  def test_cabinet_without_children_is_skipped_with_a_reason
    cab = cabinet_with_children([], 'کابینت توخالی')
    model = Sketchup::Model.new([cab], [cab])
    activate(model)

    assert_nil cab.attribute_dictionary(Kalaxa::ProjectScanner::RAW_DICT_NAME),
               'گروه بدون زیرقطعه نباید dictionary بگیرد'
    assert ::UI.said?('کابینت توخالی'), 'باید بگوید کدام گروه و چرا'
  end

  def test_import_uses_a_single_undo_operation
    cab = cabinet_with_children([solid(1, 20, 30)])
    model = Sketchup::Model.new([cab], [cab])
    activate(model)
    assert_equal 1, model.ops.length, 'کل واردکردن باید یک عملیات undo باشد'
    assert_nil model.open_operation
    assert_empty model.aborted
  end

  def test_non_group_selection_is_ignored
    model = Sketchup::Model.new([], ['یک رشتهٔ بی‌ربط', 42])
    activate(model)
    assert ::UI.said?('انتخاب کنید'), 'انتخاب بی‌ربط = مثل انتخاب خالی'
  end

  # ============================================== صفحه/قرنیز

  # قرارداد نوشتن↔خواندن: کلیدهایی که ابزار می‌نویسد باید همان‌هایی باشند که
  # ProjectScanner#extract_moulding_board می‌خواند. تغییر نام در هر طرف بی‌صدا
  # می‌شکند و صفحه از فاکتور می‌افتد.
  MOULDING_KEYS = %w[board_id label_fa length_mm width_mm returns].freeze

  def test_moulding_tool_and_scanner_agree_on_the_dictionary_keys
    src = File.read(File.join(SRC, 'app', 'create_moulding_tool.rb'), encoding: 'UTF-8')
    written = src.scan(/attrs\['([a-z_]+)'\]\s*=/).flatten.uniq
    assert_equal MOULDING_KEYS.sort, written.sort,
                 'کلیدهای نوشته‌شده با آنچه اسکنر می‌خواند نمی‌خواند'

    scanner = File.read(File.join(SRC, 'lib', 'project_scanner.rb'), encoding: 'UTF-8')
    body = scanner[/def extract_moulding_board.*?\n    end/m]
    refute_nil body
    MOULDING_KEYS.each do |k|
      assert_includes body, "dict['#{k}']",
                      "اسکنر کلید «#{k}» را نمی‌خواند در حالی که ابزار می‌نویسدش"
    end
  end

  def test_moulding_prompt_passes_numbers_through
    Sketchup.active_model = Sketchup::Model.new
    ::UI.next_inputbox = ['کانتر آشپزخانه', '300', '60', '2']
    Kalaxa::App::CreateMouldingTool.prompt_and_activate

    tool = Sketchup.active_model.selected_tool
    refute_nil tool, 'ابزار باید فعال شود'
    assert_equal 'کانتر آشپزخانه', tool.instance_variable_get(:@label_fa)
    assert_equal 300.0, tool.instance_variable_get(:@length_cm)
    assert_equal 2, tool.instance_variable_get(:@returns_count)
  end

  def test_cancelling_the_prompt_activates_nothing
    Sketchup.active_model = Sketchup::Model.new
    ::UI.next_inputbox = nil
    Kalaxa::App::CreateMouldingTool.prompt_and_activate
    assert_nil Sketchup.active_model.selected_tool, 'انصراف نباید ابزاری فعال کند'
  end

  # ورودی غیرعددی → صفر. ابزار جلویش را نمی‌گیرد، ولی اسکنر باید گزارش کند —
  # این تست همان زنجیره را تا انتها می‌سنجد.
  def test_garbage_dimensions_end_up_reported_by_the_scanner
    board = Sketchup::Group.new(
      name: 'صفحه', pid: 7,
      dicts: { 'kalaxa_moulding_board' => { 'label_fa' => 'کانتر',
                                            'length_mm' => 0, 'width_mm' => 600,
                                            'returns' => 0 } }
    )
    snap = Kalaxa::ProjectScanner.build_snapshot(Sketchup::Model.new([board]))
    assert_empty snap['moulding_boards']
    assert snap['scan_errors'].any? { |e| e.include?('طول نامعتبر') },
           'صفحهٔ صفر باید گزارش شود، نه بی‌صدا از فاکتور بیفتد'
  end
end
