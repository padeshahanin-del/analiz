# encoding: utf-8
# frozen_string_literal: true

# شکل ساخت درب — اجرا: ruby test/unit/test_door_shapes.rb
#
# کاربر: «انواع درب‌ها با ضخامت‌های مختلف و اشکال مختلف تو طراحی ایجاد بشه» و
# «ضخامت رو تو تنظیمات می‌زنم، بعضی از شکل‌ها چهار ضخامت داره».
# پیش از این هر هفت نوع درب یک جعبهٔ ساده بودند با ضخامت **بدنهٔ کابینت** — درب
# هایگلاس ۱۸ و شیشه‌ای‌آلومینیوم ۲۰ هم ۱۶ بریده می‌شدند، و کلاف‌وتنپوش که واقعاً
# ۵ قطعه است یک تخته شمرده می‌شد.
require 'minitest/autorun'
require 'tmpdir'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-doors')
ENV['KALAXA_QUIET'] = '1'

require File.join(SRC, 'lib', 'cabinet_builder')
require File.join(SRC, 'lib', 'cabinet_geometry')

class TestDoorShapes < Minitest::Test
  D = Kalaxa::DoorShapes
  B = Kalaxa::CabinetBuilder
  G = Kalaxa::CabinetGeometry

  def doors(opts) = B.build_parts('base_single_door', 80, 72, 55, opts).select { |p| p['key'].start_with?('door') }
  def door_boxes(opts) = G.boxes_for('base_single_door', 80, 72, 55, opts).select { |b| b['key'].start_with?('door') }

  # ---------- ضخامت از تنظیمات، نه از بدنه ----------

  def test_thickness_is_no_longer_tied_to_carcass
    thick = doors(door_shape: 'flat', door_thickness_mm: 25).find { |p| p['key'] == 'door' }
    assert_equal 25, thick['thickness_mm'], 'ضخامت درب باید از تنظیمات بیاید'
    box = door_boxes(door_shape: 'flat', door_thickness_mm: 25).find { |b| b['key'] == 'door' }
    assert_equal 25, box['dy'], 'مدل هم باید همان ضخامت را بکشد'
  end

  def test_carcass_thickness_does_not_change_the_door
    a = doors(door_shape: 'flat', door_thickness_mm: 18, body_thickness_mm: 16)
    b = doors(door_shape: 'flat', door_thickness_mm: 18, body_thickness_mm: 25)
    assert_equal a.first['thickness_mm'], b.first['thickness_mm'],
                 'ضخامت بدنه دیگر نباید ضخامت درب را تعیین کند'
  end

  def test_each_shape_offers_its_own_thickness_list
    assert_equal [16, 18, 20, 25], D.thicknesses_mm('flat'), 'بعضی شکل‌ها چهار ضخامت دارند'
    assert_equal [16, 18, 20, 25], D.thicknesses_mm('framed_panel')
    assert_equal [4, 5, 6, 8], D.thicknesses_mm('glass_full'), 'شیشه ضخامت‌های خودش را دارد'
    assert_equal [20], D.thicknesses_mm('glass_aluminum')
  end

  def test_default_thickness_used_when_settings_silent
    D::IDS.each do |shape|
      t = D.thickness_mm(shape, {})
      assert_equal D.spec(shape)['default_mm'], t
      assert t.positive?, "#{shape}: ضخامت پیش‌فرض باید مثبت باشد"
    end
  end

  # کاتالوگ حالا JSON است — کلیدها رشته‌اند، نه symbol.
  def test_spec_comes_from_the_shared_catalog
    assert_equal Kalaxa::Catalog.door_shapes.keys.sort, D::IDS.sort,
                 'DoorShapes باید همان شکل‌های کاتالوگ را بدهد، نه فهرست خودش'
    assert_equal 'framed', D.spec('framed_panel')['kind']
  end

  # ---------- شکل‌ها ----------

  def test_flat_is_a_single_panel
    parts = doors(door_shape: 'flat')
    assert_equal 1, parts.length
    assert_equal 'door', parts.first['key']
  end

  def test_framed_panel_is_five_pieces
    parts = doors(door_shape: 'framed_panel')
    counts = parts.each_with_object(Hash.new(0)) { |p, h| h[p['key']] += p['count'] }
    assert_equal({ 'door_stile' => 2, 'door_rail' => 2, 'door_panel' => 1 }, counts,
                 'کلاف و تنپوش: ۲ قائم + ۲ افقی + ۱ تنپوش')
  end

  def test_framed_panel_center_is_thinner_and_on_its_own_sheet
    parts = doors(door_shape: 'framed_panel')
    stile = parts.find { |p| p['key'] == 'door_stile' }
    panel = parts.find { |p| p['key'] == 'door_panel' }
    assert panel['thickness_mm'] < stile['thickness_mm'], 'تنپوش از کلاف نازک‌تر است'
    refute_equal stile['sheet_id'], panel['sheet_id'], 'تنپوش ورق خودش را دارد'
  end

  def test_framed_rails_fit_between_the_stiles
    fwid = D.frame_width_mm('framed_panel', {})
    rail = doors(door_shape: 'framed_panel').find { |p| p['key'] == 'door_rail' }
    assert_equal (796 - 2 * fwid).round, rail['cut_length_mm'],
                 'افقی دقیقاً بین دو قائم می‌نشیند'
  end

  def test_frame_width_comes_from_settings
    narrow = doors(door_shape: 'framed_panel').find { |p| p['key'] == 'door_rail' }
    wide = doors(door_shape: 'framed_panel', door_frame_width_mm: 90).find { |p| p['key'] == 'door_rail' }
    assert wide['cut_length_mm'] < narrow['cut_length_mm'], 'کلاف پهن‌تر → افقی کوتاه‌تر'
  end

  def test_aluminium_frame_puts_only_the_infill_on_the_cut_list
    parts = doors(door_shape: 'glass_aluminum')
    assert_equal ['door_glass'], parts.map { |p| p['key'] },
                 'پروفیل آلومینیوم متری است و در نستینگ ورق نمی‌آید'
    assert_equal 4, parts.first['thickness_mm']
  end

  def test_glass_never_lands_on_a_wood_sheet
    %w[glass_aluminum glass_full].each do |shape|
      doors(door_shape: shape).each do |p|
        assert_match(/glass/, p['sheet_id'],
                     "#{shape}: شیشه نباید وارد نستینگ MDF شود")
      end
    end
  end

  def test_aluminium_frame_is_drawn_in_the_model
    keys = door_boxes(door_shape: 'glass_aluminum').map { |b| b['key'] }
    assert_equal 4, keys.count('door_frame'), 'چهار ضلع پروفیل در مدل دیده می‌شود'
    assert_equal 1, keys.count('door_glass')
  end

  # ---------- سازگاری عقب‌رو ----------

  def test_missing_shape_falls_back_to_flat
    assert_equal 'flat', D.shape_id({})
    assert_equal 'flat', D.shape_id(door_shape: 'یک‌چیز‌ناشناخته')
  end

  def test_legacy_door_type_maps_to_a_shape
    assert_equal 'glass_aluminum', D.shape_id(door_type: 'glass_aluminum')
    assert_equal 'mdf_aluminum', D.shape_id(door_type: 'mdf_aluminum_frame')
    assert_equal 'flat', D.shape_id(door_type: 'highgloss'),
                 'رویه‌های تخت همان درب تک‌تخته می‌مانند'
  end

  def test_explicit_shape_beats_legacy_type
    assert_equal 'framed_panel', D.shape_id(door_type: 'glass_aluminum', door_shape: 'framed_panel')
  end

  # ---------- نمای کشو دست‌نخورده ----------

  def test_drawer_fronts_are_not_affected_by_door_shape
    plain = B.build_parts('base_three_drawer', 80, 72, 55)
    shaped = B.build_parts('base_three_drawer', 80, 72, 55, door_shape: 'framed_panel')
    assert_equal plain.map { |p| p['key'] }.sort, shaped.map { |p| p['key'] }.sort,
                 'شکل درب به نمای کشو ربطی ندارد'
  end

  # ---------- عبور تنظیمات ----------

  def test_relevant_params_passes_door_keys_through
    raw = { door_shape: 'framed_panel', door_thickness_mm: 20, door_frame_width_mm: 80,
            door_panel_thickness_mm: 10, door_groove_depth_mm: 9 }
    out = B.relevant_params('base_single_door', raw)
    raw.each_key { |k| assert out.key?(k), "#{k} باید به سازنده برسد" }
  end

  # ---------- برچسب از واژه‌نامه ----------

  def test_shape_labels_come_from_the_glossary
    assert_equal 'کلاف و تنپوش', D.label('framed_panel')
    assert_equal D::IDS.length, D.labels.length
    D.labels.each { |l| refute_match(/\Adoor_shape\./, l, "برچسب باید ترجمه شود، نه کلید خام") }
  end
end
