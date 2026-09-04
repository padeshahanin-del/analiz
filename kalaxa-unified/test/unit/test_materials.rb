# encoding: utf-8
# frozen_string_literal: true

# متریال: تفکیک‌پذیر و مدل‌سازی‌شدنی — اجرا: ruby test/unit/test_materials.rb
#
# کاربر: «متریال هم قابل تفکیک و قابل مدل‌سازی باشه».
# تا این نسخه متریال فقط یک رشتهٔ فرعی داخل تعریف ورق بود: در صحنه همهٔ قطعات
# یک‌رنگ بودند (شیشه از MDF قابل تشخیص نبود) و خودِ متریال جای مستقلی نداشت.
require 'minitest/autorun'
require 'tmpdir'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-materials')
ENV['KALAXA_QUIET'] = '1'

require File.join(SRC, 'lib', 'materials')
require File.join(SRC, 'lib', 'cabinet_builder')
require File.join(SRC, 'lib', 'cabinet_geometry')
require File.join(SRC, 'lib', 'project_scanner')

class TestMaterials < Minitest::Test
  M = Kalaxa::Materials
  B = Kalaxa::CabinetBuilder
  G = Kalaxa::CabinetGeometry

  def boxes(opts = {}) = G.boxes_for('base_single_door', 80, 72, 55, opts)

  # ---------- کاتالوگ ----------

  def test_every_material_is_drawable
    M::IDS.each do |id|
      assert_equal 3, M.rgb(id).length, "#{id}: رنگ باید RGB باشد"
      M.rgb(id).each { |c| assert (0..255).cover?(c), "#{id}: مؤلفهٔ رنگ خارج از بازه" }
      assert (0.0..1.0).cover?(M.alpha(id)), "#{id}: شفافیت خارج از بازه"
    end
  end

  def test_glass_is_the_only_transparent_one
    assert M.transparent?('glass'), 'شیشه باید شفاف باشد تا داخل کابینت دیده شود'
    (M::IDS - ['glass']).each { |id| refute M.transparent?(id), "#{id} نباید شفاف باشد" }
  end

  def test_non_sheet_materials_are_marked
    refute M.sheet_goods?('aluminum'), 'پروفیل آلومینیوم متری است، نه ورقی'
    refute M.sheet_goods?('hardware'), 'یراق عددی است'
    assert M.sheet_goods?('mdf')
    assert M.sheet_goods?('glass'), 'شیشه ورقی بریده می‌شود'
  end

  def test_names_come_from_the_glossary
    assert_equal 'شیشه', M.label('glass')
    assert_equal 'MDF هایگلاس', M.label('mdf_hg')
    M::IDS.each { |id| refute_match(/\Amaterial\./, M.label(id), "#{id}: برچسب خام ماند") }
  end

  def test_sketchup_names_are_namespaced
    M::IDS.each do |id|
      assert M.sketchup_name(id).start_with?('Kalaxa '),
             'نام متریال باید پیشوند داشته باشد تا با متریال‌های خود کاربر قاطی نشود'
    end
    assert_equal M::IDS.length, M::IDS.map { |id| M.sketchup_name(id) }.uniq.length,
                 'نام متریال‌ها نباید تکراری باشند'
  end

  # ---------- نگاشت ورق → متریال ----------

  def test_sheet_maps_to_material
    assert_equal 'mdf', M.sheet_material('mdf_white_16')
    assert_equal 'mdf_hg', M.sheet_material('mdf_door_16')
    assert_equal 'hdf', M.sheet_material('hdf_3')
  end

  def test_any_glass_thickness_maps_to_glass
    %w[glass_4 glass_6 glass_10].each do |sheet|
      assert_equal 'glass', M.sheet_material(sheet),
                   'افزودن ضخامت تازهٔ شیشه نباید نیاز به تغییر کد داشته باشد'
    end
  end

  def test_unknown_sheet_falls_back_not_crashes
    assert_equal M::DEFAULT, M.sheet_material('یک‌ورق‌ناشناخته')
    assert_equal M::DEFAULT, M.sheet_material(nil)
  end

  # ---------- هر ورقِ ارجاع‌شده باید واقعاً وجود داشته باشد ----------

  def test_every_sheet_used_by_the_cut_list_exists_in_the_catalog
    known = Kalaxa::ProjectScanner::DEFAULT_SHEETS.map { |s| s['sheet_id'] }
    missing = []
    B::TEMPLATES.each do |t|
      Kalaxa::DoorShapes::IDS.each do |shape|
        # عرضِ آزمون باید برای همان تمپلیت معتبر باشد: کابینت گوشه با عمق ۵۵
        # دست‌کم بال ۸۴ می‌خواهد، وگرنه نمای اریب باز نمی‌شود.
        w = t == 'base_corner_diagonal' ? 90 : 80
        B.build_parts(t, w, 72, 55, door_shape: shape).each do |p|
          missing << "#{t}/#{shape} → #{p['sheet_id']}" unless known.include?(p['sheet_id'])
        end
      end
    end
    assert_empty missing.uniq,
                 'قطعه‌ای به ورقی ارجاع می‌دهد که در کاتالوگ نیست — نستینگ جایی برایش ندارد'
  end

  def test_glass_sheets_are_in_the_catalog
    ids = Kalaxa::ProjectScanner::DEFAULT_SHEETS.map { |s| s['sheet_id'] }
    assert_includes ids, 'glass_4', 'درب شیشه‌ای بدون ورق شیشه یعنی قطعهٔ بی‌جا'
    glass = Kalaxa::ProjectScanner::DEFAULT_SHEETS.select { |s| s['material'] == 'glass' }
    refute_empty glass
    glass.each { |s| refute s['has_grain'], 'شیشه راه چوب ندارد' }
  end

  # ---------- مدل‌سازی: هر جعبه متریال دارد ----------

  def test_every_box_carries_a_material
    Kalaxa::DoorShapes::IDS.each do |shape|
      boxes(door_shape: shape).each do |b|
        refute_nil b['material'], "#{shape}/#{b['key']}: بدون متریال یعنی بی‌رنگ در صحنه"
        assert_includes M::IDS, b['material'], "#{shape}/#{b['key']}: متریال ناشناخته"
      end
    end
  end

  def test_materials_actually_separate_in_the_scene
    b = boxes(door_shape: 'glass_aluminum')
    by_key = b.each_with_object({}) { |x, h| h[x['key']] = x['material'] }
    assert_equal 'glass', by_key['door_glass']
    assert_equal 'aluminum', by_key['door_frame']
    assert_equal 'mdf', by_key['side']
    assert_equal 'hardware', by_key['leg']
    assert_operator b.map { |x| x['material'] }.uniq.length, :>=, 4,
                    'یک کابینت شیشه‌ای باید چند متریال قابل تفکیک داشته باشد'
  end

  def test_door_material_follows_the_shape
    assert_equal 'mdf_hg', boxes(door_shape: 'flat').find { |b| b['key'] == 'door' }['material']
    assert_equal 'glass', boxes(door_shape: 'glass_full').find { |b| b['key'] == 'door' }['material'],
                 'درب شیشهٔ تمام باید شیشه باشد، نه MDF'
  end

  def test_framed_door_panel_differs_from_its_frame
    b = boxes(door_shape: 'framed_panel')
    stile = b.find { |x| x['key'] == 'door_stile' }['material']
    panel = b.find { |x| x['key'] == 'door_panel' }['material']
    refute_equal stile, panel, 'تنپوش ورق دیگری دارد، پس متریال دیگری هم'
  end

  # ---------- سازگاری ----------

  def test_material_is_additive_and_breaks_nothing
    b = boxes
    b.each do |x|
      %w[key x y z dx dy dz].each { |k| assert x.key?(k), "کلید #{k} باید بماند" }
    end
  end
end
