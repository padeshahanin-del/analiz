# frozen_string_literal: true

# test_cabinet_builder.rb — قفل فرمول‌های CabinetBuilder روی اعداد واقعی fixture طلایی.
# اجرا:  ruby test/unit/test_cabinet_builder.rb
require 'minitest/autorun'
require 'json'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
require File.join(SRC, 'lib', 'cabinet_builder')

class TestCabinetBuilder < Minitest::Test
  FIXTURE = JSON.parse(File.read(File.join(SRC, 'dev', 'fixtures', 'golden_kitchen_snapshot.json')))

  # گروه‌بندی به **فهرست**، نه یک ردیف. نسخهٔ قبلی ردیف‌های هم‌کلید را روی هم
  # می‌نوشت — پس قید که دو ردیف دارد (خوابیده ۱۰۰ و ایستاده ۷۰) بی‌صدا یکیشان
  # گم می‌شد. همین باعث شده بود rail_top از مقایسه استثنا شود.
  def parts_by_key(cabinet_id)
    FIXTURE['parts_flat'].select { |p| p['cabinet_id'] == cabinet_id }
                         .group_by { |p| p['key'] }
  end

  # امضای قابل مقایسهٔ یک ردیف: (تعداد، طول، عرض)
  def signature(p)
    [p['count'], p['cut_length_mm'], p['cut_width_mm']]
  end

  # fixture طلایی در ۳.۳۶.۰ بازتولید شد و دیگر دنیای پیش از «قید L» را ندارد،
  # پس استثنای rail_top برداشته شد. استثنای دائمی اعتماد به golden را می‌خورد.
  FIXTURE_PRE_L_RAIL_KEYS = [].freeze

  # مقایسه به‌صورت **multiset** به‌ازای هر کلید — تا چند ردیف هم‌کلید
  # (مثل دو نوع قید) درست سنجیده شوند، نه فقط آخرینی.
  def assert_matches_fixture(built, cabinet_id, skip_keys: [])
    actual = parts_by_key(cabinet_id)
    skip_all = FIXTURE_PRE_L_RAIL_KEYS + skip_keys

    built.reject { |b| skip_all.include?(b['key']) }
         .group_by { |b| b['key'] }
         .each do |key, rows|
      want = actual.fetch(key).map { |p| signature(p) }.sort
      got  = rows.map { |b| signature(b) }.sort
      assert_equal want, got, "ردیف‌های «#{key}» با fixture نمی‌خوانند"
    end

    assert_equal actual.keys.sort, built.map { |b| b['key'] }.uniq.sort,
                 'مجموعهٔ کلیدهای قطعات باید همان بماند'
  end

  def cabinet(id)
    FIXTURE['cabinets'].find { |c| c['kalaxa_id'] == id }
  end

  def assert_part_matches(built, actual)
    assert_equal actual['count'], built['count'], "count mismatch for #{built['key']}"
    assert_equal actual['cut_length_mm'], built['cut_length_mm'], "cut_length_mm mismatch for #{built['key']}"
    assert_equal actual['cut_width_mm'], built['cut_width_mm'], "cut_width_mm mismatch for #{built['key']}"
  end

  def test_base_single_door_matches_fixture_cab_001
    cab = cabinet('cab-001')
    p = cab['params']
    built = Kalaxa::CabinetBuilder.build_parts('base_single_door', p['cabinet_width'], p['cabinet_height'],
                                                p['cabinet_depth'], shelf_count: p['shelf_count'])
    assert_matches_fixture(built, 'cab-001')
  end

  # قطعات جعبهٔ کشو عمداً دیگر با fixture یکی نیستند: fixture مدل قدیمیِ «صفر لقی» را
  # داشت (عرض بیرونی جعبه = دقیقاً فضای داخلی، یعنی هیچ جایی برای ریل)، ولی کاربر عدد
  # واقعی کارگاه را داد — ساچمه‌ای ۲۵mm و کف‌ریل ۱۱mm، **مجموع هر دو طرف**.
  # پس بدنهٔ کابینت با fixture سنجیده می‌شود و قطعات کشو با فرمول جدید.
  DRAWER_BOX_KEYS = %w[drawer_side drawer_back drawer_bottom].freeze

  def test_base_three_drawer_carcass_matches_fixture_cab_002
    cab = cabinet('cab-002')
    p = cab['params']
    built = Kalaxa::CabinetBuilder.build_parts('base_three_drawer', p['cabinet_width'], p['cabinet_height'],
                                                p['cabinet_depth'], drawer_count: p['drawer_count'])
    assert_matches_fixture(built, 'cab-002', skip_keys: DRAWER_BOX_KEYS)
  end

  def test_drawer_box_width_uses_configurable_slide_clearance
    # کابینت ۶۰cm، بدنه ۱۶ → فضای داخلی ۵۶۸
    interior = 600 - 2 * 16
    { 'ball' => 25, 'bottom' => 11 }.each do |kind, clearance|
      built = Kalaxa::CabinetBuilder.build_parts('base_three_drawer', 60, 72, 55,
                                                  drawer_count: 3, slide_kind: kind)
      back = built.find { |b| b['key'] == 'drawer_back' }
      expected = interior - clearance - 2 * 16   # پشت کشو بین دو بدنهٔ ۱۶ می‌نشیند
      assert_equal expected, back['cut_length_mm'],
                   "طول پشت کشو برای ریل #{kind} باید #{expected} باشد"
    end
  end

  def test_slide_clearance_can_be_overridden_directly
    built = Kalaxa::CabinetBuilder.build_parts('base_three_drawer', 60, 72, 55,
                                                drawer_count: 3, slide_clearance_mm: 40)
    back = built.find { |b| b['key'] == 'drawer_back' }
    assert_equal 568 - 40 - 32, back['cut_length_mm'], 'بازنویسی مستقیم لقی باید اثر کند'
  end

  def test_drawer_depth_defaults_to_cabinet_depth_minus_gap
    built = Kalaxa::CabinetBuilder.build_parts('base_three_drawer', 60, 72, 55, drawer_count: 3)
    side = built.find { |b| b['key'] == 'drawer_side' }
    assert_equal 550 - Kalaxa::CabinetBuilder::DRAWER_SIDE_GAP_MM, side['cut_length_mm']
  end

  def test_drawer_depth_from_settings_wins
    built = Kalaxa::CabinetBuilder.build_parts('base_three_drawer', 60, 72, 55,
                                                drawer_count: 3, drawer_depth_mm: 450)
    side = built.find { |b| b['key'] == 'drawer_side' }
    bottom = built.find { |b| b['key'] == 'drawer_bottom' }
    assert_equal 450, side['cut_length_mm'], 'عمق کشو از تنظیمات باید استفاده شود'
    assert_equal 450, bottom['cut_width_mm'], 'کف کشو هم همان عمق را می‌گیرد'
  end

  def test_drawer_side_height_configurable
    built = Kalaxa::CabinetBuilder.build_parts('base_three_drawer', 60, 72, 55,
                                                drawer_count: 3, drawer_side_height_mm: 180)
    side = built.find { |b| b['key'] == 'drawer_side' }
    assert_equal 180, side['cut_width_mm'], 'ارتفاع بدنهٔ کشو از تنظیمات'
  end

  def test_base_sink_double_door_matches_fixture_cab_003
    cab = cabinet('cab-003')
    p = cab['params']
    built = Kalaxa::CabinetBuilder.build_parts('base_sink_double_door', p['cabinet_width'], p['cabinet_height'],
                                                p['cabinet_depth'])
    assert_matches_fixture(built, 'cab-003')
  end

  def test_wall_single_door_matches_fixture_cab_004
    cab = cabinet('cab-004')
    p = cab['params']
    built = Kalaxa::CabinetBuilder.build_parts('wall_single_door', p['cabinet_width'], p['cabinet_height'],
                                                p['cabinet_depth'], shelf_count: p['shelf_count'])
    assert_matches_fixture(built, 'cab-004')
  end

  def test_tall_double_door_matches_fixture_cab_005
    cab = cabinet('cab-005')
    p = cab['params']
    built = Kalaxa::CabinetBuilder.build_parts('tall_double_door', p['cabinet_width'], p['cabinet_height'],
                                                p['cabinet_depth'], shelf_count: p['shelf_count'])
    assert_matches_fixture(built, 'cab-005')
  end

  def test_unknown_template_raises
    assert_raises(ArgumentError) { Kalaxa::CabinetBuilder.build_parts('not_a_template', 80, 72, 55) }
  end

  def test_zero_shelf_count_omits_shelf_row
    built = Kalaxa::CabinetBuilder.build_parts('base_single_door', 80, 72, 55, shelf_count: 0)
    refute built.any? { |p| p['key'] == 'shelf' }
  end

  def test_build_dict_returns_json_strings_and_stable_id
    dict = Kalaxa::CabinetBuilder.build_dict('base_single_door', 'کابینت تست', 80, 72, 55)
    assert_equal 'base_single_door', dict['template_id']
    assert_equal 'base', dict['category']
    assert dict['kalaxa_id'].start_with?('kx-')
    parsed_parts = JSON.parse(dict['parts'])
    assert parsed_parts.is_a?(Array)
    assert parsed_parts.any? { |p| p['key'] == 'door' }
    parsed_params = JSON.parse(dict['params'])
    assert_equal 80.0, parsed_params['cabinet_width']
  end

  # --- فیلتر پارامترهای معنادار (params با دادهٔ بی‌ربط آلوده نشود) ---

  RAW = { shelf_count: 2, drawer_count: 3, door_type: 'mdf',
          door_swing: 'right', wall_rail_type: 'blum' }.freeze

  def test_relevant_params_drops_drawer_count_for_non_drawer_templates
    out = Kalaxa::CabinetBuilder.relevant_params('base_single_door', RAW)
    refute out.key?(:drawer_count), 'کابینت تک‌درب نباید drawer_count بگیرد'
    assert_equal 2, out[:shelf_count]
  end

  def test_relevant_params_drops_shelf_count_for_drawer_template
    out = Kalaxa::CabinetBuilder.relevant_params('base_three_drawer', RAW)
    refute out.key?(:shelf_count), 'کابینت کشویی نباید shelf_count بگیرد'
    refute out.key?(:door_swing), 'کابینت کشویی لولا ندارد'
    assert_equal 3, out[:drawer_count]
  end

  def test_relevant_params_keeps_door_type_and_wall_rail_for_all
    Kalaxa::CabinetBuilder::TEMPLATES.each do |tid|
      out = Kalaxa::CabinetBuilder.relevant_params(tid, RAW)
      assert_equal 'mdf', out[:door_type], "#{tid}: door_type باید بماند"
      assert_equal 'blum', out[:wall_rail_type], "#{tid}: wall_rail_type باید بماند"
    end
  end

  def test_relevant_params_keeps_zero_shelf_count
    out = Kalaxa::CabinetBuilder.relevant_params('base_single_door', shelf_count: 0)
    assert_equal 0, out[:shelf_count], 'صفر معتبر است و نباید حذف شود'
  end

  def test_relevant_params_ignores_missing_keys
    out = Kalaxa::CabinetBuilder.relevant_params('base_single_door', {})
    assert_empty out
  end

  def test_determinism
    a = Kalaxa::CabinetBuilder.build_parts('base_single_door', 80, 72, 55)
    b = Kalaxa::CabinetBuilder.build_parts('base_single_door', 80, 72, 55)
    assert_equal a, b
  end
end
