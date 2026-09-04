# encoding: utf-8
# frozen_string_literal: true

# موتور بخش‌بندی یونیت — اجرا: ruby test/unit/test_unit_sections.rb
#
# کاربر «موتور ساخت کابینت، کمد و کتابخانه» خواست، مثل نمونهٔ اسکریپت مکس.
#
# راه ساده این بود که دو تمپلیت دیگر دستی اضافه شود. ولی کمد و کتابخانه با
# کابینت فرق ماهوی ندارند: همه یک بدنه‌اند با تقسیمات داخلی. آنچه کم داشتیم
# **بخش‌بندی** بود — دهانه و پُرکردنش.
#
# نکتهٔ معماری: این محاسبه یک‌جاست و هم لیست برش هم مدل سه‌بعدی از همین
# می‌خوانند. تاریخ این پروژه پر از باگ‌هایی است که از دو محاسبهٔ موازی درآمده:
# قید بالا، جعبهٔ کشو، کلید قطعات گوشه.
require 'minitest/autorun'
require 'tmpdir'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
$LOAD_PATH.unshift(File.expand_path('../stubs', __dir__))
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-sec')
ENV['KALAXA_QUIET'] = '1'

require 'su_double'
require File.join(SRC, 'lib', 'unit_sections')

class TestUnitSections < Minitest::Test
  U = Kalaxa::UnitSections

  # ---------- دهانه‌ها ----------

  def test_single_bay_uses_the_whole_inside
    bays = U.bay_spans(1200, 16, 1)
    assert_equal 1, bays.length
    assert_in_delta 16, bays[0]['x'], 0.01
    assert_in_delta 1168, bays[0]['w'], 0.01, 'عرض داخلی = عرض − دو بدنه'
  end

  def test_each_divider_eats_one_body_thickness
    bays = U.bay_spans(1200, 16, 2)
    assert_equal 2, bays.length
    total = bays.sum { |b| b['w'] }
    # ۱۲۰۰ − ۲×۱۶ (دیواره) − ۱×۱۶ (جداکننده) = ۱۱۵۲
    assert_in_delta 1152, total, 0.01,
                    'جداکننده جا می‌گیرد؛ نادیده گرفتنش یعنی دهانه‌ها پهن‌تر از واقعیت'
  end

  def test_bays_are_equal_and_do_not_overlap
    bays = U.bay_spans(1500, 18, 3)
    assert_equal 3, bays.length
    widths = bays.map { |b| b['w'].round(2) }.uniq
    assert_equal 1, widths.length, 'دهانه‌ها مساوی‌اند'

    bays.each_cons(2) do |a, b|
      gap = b['x'] - (a['x'] + a['w'])
      assert_in_delta 18, gap, 0.01, 'بین دو دهانه دقیقاً یک جداکننده است'
    end
  end

  def test_too_narrow_for_the_bay_count_returns_nothing
    # چهار دهانه در عرض ۱۰۰: جا نمی‌شود. سکوت این‌جا قطعاتی با ابعاد منفی
    # می‌سازد و لیست برش «−۳۰» نشان می‌دهد.
    assert_empty U.bay_spans(100, 16, 4)
  end

  def test_divider_count
    assert_equal 0, U.divider_count(1)
    assert_equal 1, U.divider_count(2)
    assert_equal 2, U.divider_count(3)
  end

  # ---------- طبقه‌ها ----------

  def test_shelves_are_spread_between_floor_and_ceiling
    # طبقه‌ای که روی کف بنشیند طبقه نیست، کف است.
    levels = U.shelf_levels(2000, 16, 3)
    assert_equal 3, levels.length
    levels.each do |z|
      assert_operator z, :>, 16, 'طبقه روی کف نمی‌نشیند'
      assert_operator z, :<, 1984, 'و به سقف نمی‌چسبد'
    end
    # فاصله‌ها **تقریباً** مساوی‌اند، نه دقیقاً: از ۳.۶۸ طبقه روی شبکهٔ
    # سوراخ پین می‌نشیند (سیستم ۳۲) و این جابه‌جایی حداکثر نصفِ گام است.
    # طبقهٔ دقیقاً مساوی که روی هیچ پینی نیفتد لق می‌ماند — فاصلهٔ کاملاً
    # مساوی ارزشِ آن را ندارد.
    pitch = Kalaxa::Catalog.pin_system['pitch_mm']
    gaps = ([16] + levels + [1984]).each_cons(2).map { |a, b| (b - a).round(1) }
    assert_operator gaps.max - gaps.min, :<=, pitch,
                    'فاصله‌ها بیش از یک گام از هم دور نشوند'
  end

  def test_shelves_land_on_the_pin_grid
    # سیستم پینی که هیچ طبقه‌اش روی پین نیفتد بی‌فایده است.
    p = Kalaxa::Catalog.pin_system
    pitch = p['pitch_mm']
    body = 16
    [[2000, 3], [2200, 4], [720, 1], [2400, 5]].each do |h, n|
      U.shelf_levels(h, body, n).each do |z|
        bottom = z - body / 2.0        # طبقه روی پین می‌نشیند، نه مرکزش
        assert_in_delta 0, bottom % pitch, 0.01,
                        "طبقهٔ #{z} در ارتفاع #{h} روی سوراخ نمی‌افتد"
        assert_operator bottom, :>=, p['end_clearance_mm'],
                        'سوراخ نزدیک کف تخته را می‌شکافد'
      end
    end
  end

  def test_custom_shelf_heights_are_never_moved
    # ارتفاع دستی تصمیم کارگاه است. چسباندن به شبکه حق ندارد جابه‌جایش کند.
    wanted = [500.0, 1000.0, 1500.0]
    assert_equal wanted, U.shelf_levels(2000, 16, 3, wanted)
  end

  # دو نگهبانِ زیر با ارتفاع‌های واقعیِ کابینت هرگز فعال نمی‌شوند — فاصلهٔ
  # طبقه‌ها همیشه از گام بیشتر است و هیچ طبقه‌ای ته تخته نمی‌افتد. پس
  # مستقیم صدا زده می‌شوند؛ وگرنه نگهبانی داریم که هیچ تستی لمسش نمی‌کند.
  def test_snap_pushes_colliding_shelves_apart
    p = Kalaxa::Catalog.pin_system
    pitch = p['pitch_mm']
    body = 16
    # سه تراز نزدیک‌تر از یک گام: هر سه روی یک سوراخ گرد می‌شوند.
    close = [508.0, 514.0, 520.0]
    out = U.snap_to_pin_grid(close, 2000, body)
    assert_equal 3, out.length
    assert_equal out.length, out.uniq.length, 'هر سه روی یک سوراخ افتادند'
    out.each do |z|
      assert_in_delta 0, (z - body / 2.0) % pitch, 0.01, 'روی شبکه نماند'
    end
  end

  def test_snap_resolves_collisions_downward_at_the_top
    # نزدیک سقف، جا برای بالا رفتن نیست؛ باید پایین بیاید. بدون این مسیر،
    # طبقهٔ بالایی بیرونِ تخته می‌رفت یا روی طبقهٔ زیرش می‌افتاد.
    p = Kalaxa::Catalog.pin_system
    body = 16
    h = 1000
    hi = h - body - p['end_clearance_mm']
    top = (hi / p['pitch_mm']).floor * p['pitch_mm']
    out = U.snap_to_pin_grid([top + body / 2.0, top + body / 2.0 + 2], h, body)
    assert_equal out.length, out.uniq.length, 'دو طبقه روی سوراخ بالایی ماندند'
    out.each do |z|
      assert_operator z - body / 2.0, :<=, hi, 'سوراخ از سر تخته زد بیرون'
    end
  end

  def test_snap_never_puts_a_hole_past_the_top
    p = Kalaxa::Catalog.pin_system
    body = 16
    h = 1000
    hi = h - body - p['end_clearance_mm']
    # ترازی بالاتر از حد مجاز — باید کشیده شود پایین، نه اینکه رد شود.
    out = U.snap_to_pin_grid([h - body / 2.0], h, body)
    assert_operator out.first - body / 2.0, :<=, hi,
                    'سوراخ نباید به سر تخته بچسبد'
  end

  def test_snap_keeps_shelves_off_the_board_ends
    p = Kalaxa::Catalog.pin_system
    clr = p['end_clearance_mm']
    body = 16
    # ترازی که بدون محافظ روی صفر گرد می‌شود — پین آن‌جا لب تخته را می‌شکافد.
    out = U.snap_to_pin_grid([body / 2.0 + 4.0], 2000, body)
    assert_operator out.first - body / 2.0, :>=, clr,
                    'سوراخ نباید به کف تخته بچسبد'
  end

  def test_two_shelves_never_share_one_hole
    # اگر دو طبقه روی یک سوراخ بیفتند، یکی‌شان از مدل ناپدید می‌شود.
    (1..6).each do |n|
      levels = U.shelf_levels(1200, 16, n)
      assert_equal n, levels.length, "#{n} طبقه در ۱۲۰۰ گم شد"
      assert_equal levels.length, levels.uniq.length, 'دو طبقه هم‌تراز شدند'
    end
  end

  def test_zero_shelves
    assert_empty U.shelf_levels(2000, 16, 0)
  end

  def test_shelf_shrinks_from_length_and_depth
    s = U.shelf_size(600, 550)
    assert_in_delta 598, s['len'], 0.01, 'طبقه از طول کمی جمع می‌شود'
    assert_in_delta 530, s['dep'], 0.01, 'و از عمق بیشتر — تا دست پشتش برود'
  end

  # ---------- رگال ----------

  def test_hanging_bay_gets_a_rail
    lay = U.layout(1200, 2200, 600, 16,
                   'bays' => 2, 'shelves_per_bay' => 3, 'hanging_bays' => [0])
    assert_equal 1, lay['rails'].length, 'فقط دهانهٔ رگال‌دار میله می‌گیرد'
    assert_equal 0, lay['rails'][0].fetch('bay', 0) if lay['rails'][0].key?('bay')
  end

  # این قاعده از کار واقعی می‌آید، نه از تقارن: لباس آویزان جا لازم دارد.
  # اگر دهانهٔ رگال‌دار همان تعداد طبقه بخورد، رگال بی‌فایده می‌شود.
  def test_hanging_bay_gets_one_shelf_less
    lay = U.layout(1200, 2200, 600, 16,
                   'bays' => 2, 'shelves_per_bay' => 3, 'hanging_bays' => [0])
    by_bay = lay['shelves'].group_by { |s| s['bay'] }
    assert_equal 2, by_bay[0].length, 'دهانهٔ رگال‌دار یک طبقه کمتر'
    assert_equal 3, by_bay[1].length, 'دهانهٔ معمولی کامل'
  end

  def test_rail_hangs_below_the_ceiling
    lay = U.layout(1200, 2200, 600, 16, 'bays' => 1, 'hanging_bays' => [0])
    r = lay['rails'][0]
    assert_in_delta 2200 - 16 - 60, r['z'], 0.01,
                    'میله زیر سقف می‌افتد، نه چسبیده — وگرنه چوب‌لباسی جا نمی‌شود'
  end

  def test_no_hanging_no_rails
    lay = U.layout(1200, 2200, 600, 16, 'bays' => 2, 'shelves_per_bay' => 4)
    assert_empty lay['rails']
    assert_equal 8, lay['shelves'].length, 'بدون رگال، هر دو دهانه کامل'
  end

  # ---------- نقشهٔ کامل ----------

  def test_shelves_belong_to_their_bay
    lay = U.layout(1500, 2000, 600, 16, 'bays' => 3, 'shelves_per_bay' => 2)
    lay['shelves'].each do |sh|
      bay = lay['bays'].find { |b| b['index'] == sh['bay'] }
      refute_nil bay
      assert_operator sh['x'], :>=, bay['x'] - 0.01, 'طبقه داخل دهانهٔ خودش است'
      assert_operator sh['len'], :<=, bay['w'] + 0.01
    end
  end

  def test_layout_of_an_impossible_unit_is_empty_not_negative
    lay = U.layout(100, 2000, 600, 16, 'bays' => 4, 'shelves_per_bay' => 2)
    assert_empty lay['bays']
    assert_empty lay['shelves'], 'بدون دهانه، طبقه‌ای هم نیست'
    assert_empty lay['rails']
  end

  # ---------- تمپلیت‌های واقعی ----------

  def builder
    require File.join(SRC, 'lib', 'catalog')
    require File.join(SRC, 'lib', 'glossary')
    require File.join(SRC, 'lib', 'materials')
    require File.join(SRC, 'lib', 'door_shapes')
    require File.join(SRC, 'lib', 'cabinet_builder')
    Kalaxa::CabinetBuilder
  end

  def geometry
    builder
    require File.join(SRC, 'lib', 'cabinet_geometry')
    Kalaxa::CabinetGeometry
  end

  def test_wardrobe_and_bookcase_are_registered
    assert_includes builder::TEMPLATES, 'wardrobe'
    assert_includes builder::TEMPLATES, 'bookcase'
  end

  def test_wardrobe_has_a_divider_and_a_rail
    parts = builder.build_parts('wardrobe', 120, 220, 60)
    keys = parts.map { |p| p['key'] }
    assert_includes keys, 'divider', 'کمد دو‌دهانه جداکنندهٔ میانی دارد'

    boxes = geometry.boxes_for('wardrobe', 120, 220, 60)
    assert boxes.any? { |b| b['key'] == 'rail_rod' },
           'میلهٔ رگال باید در مدل دیده شود، وگرنه کاربر فکر می‌کند کمد رگال ندارد'
    refute parts.any? { |p| p['key'] == 'rail_rod' },
           'ولی در لیست برش نیست — میله یراق خریدنی است، نه تختهٔ بریدنی'
  end

  def test_bookcase_is_open_and_has_no_divider
    parts = builder.build_parts('bookcase', 120, 220, 60)
    keys = parts.map { |p| p['key'] }
    refute_includes keys, 'door', 'کتابخانه درب ندارد'
    refute_includes keys, 'divider', 'کتابخانهٔ تک‌دهانه جداکننده ندارد'
    assert_includes keys, 'shelf'
  end

  # همان اشتباهی که موتور مشترک جلویش را می‌گیرد: اگر مدل طبقه‌ها را دستی
  # می‌شمرد، دهانهٔ رگال‌دار یکی بیشتر می‌گرفت.
  def test_model_and_cut_list_agree_on_shelf_count
    parts = builder.build_parts('wardrobe', 120, 220, 60)
    cut = parts.select { |p| p['key'] == 'shelf' }.sum { |p| p['count'] }
    model = geometry.boxes_for('wardrobe', 120, 220, 60).count { |b| b['key'] == 'shelf' }
    assert_equal cut, model, 'تعداد طبقه در مدل و لیست برش یکی است'
  end

  def test_dividers_are_between_bays_not_before_the_first
    boxes = geometry.boxes_for('wardrobe', 120, 220, 60)
    dividers = boxes.select { |b| b['key'] == 'divider' }
    assert_equal 1, dividers.length, 'دو دهانه = یک جداکننده'
    assert_operator dividers[0]['x'], :>, 100,
                    'جداکننده وسط است، نه چسبیده به دیوارهٔ چپ'
  end

  def test_too_narrow_unit_is_refused_with_a_useful_message
    err = assert_raises(ArgumentError) { builder.build_parts('wardrobe', 25, 220, 60) }
    assert_match(/دهانه/, err.message)
    assert_match(/\d+ cm/, err.message, 'باید بگوید عرض چقدر است')
  end

  def test_symbol_and_string_keys_both_work
    # spec از JSON (رشته) و از کد (سیمبل) می‌آید؛ هر دو باید کار کنند.
    a = U.layout(1200, 2200, 600, 16, 'bays' => 2, 'shelves_per_bay' => 2)
    b = U.layout(1200, 2200, 600, 16, bays: 2, shelves_per_bay: 2)
    assert_equal a['shelves'].length, b['shelves'].length
    assert_equal a['bays'].length, b['bays'].length
  end

  # ---------- چهار پارامتری که کاربر خواست ----------

  def test_bay_count_is_a_parameter
    three = builder.build_parts('wardrobe', 180, 220, 60, bays: 3)
    assert_equal 2, three.find { |p| p['key'] == 'divider' }['count'],
                 'سه دهانه = دو جداکننده'
    assert_equal 2, geometry.boxes_for('wardrobe', 180, 220, 60, bays: 3)
                            .count { |b| b['key'] == 'divider' },
                 'و مدل همان را می‌کشد'
  end

  def test_hanging_bay_is_a_parameter
    lay = U.layout(1800, 2200, 600, 16,
                   'bays' => 3, 'shelves_per_bay' => 3, 'hanging_bays' => [1, 2])
    assert_equal 2, lay['rails'].length, 'کاربر تعیین می‌کند کدام دهانه رگال دارد'
    by_bay = lay['shelves'].group_by { |sh| sh['bay'] }
    assert_equal 3, by_bay[0].length, 'دهانهٔ بدون رگال کامل'
    assert_equal 2, by_bay[1].length, 'دهانهٔ رگال‌دار یکی کمتر'
  end

  # کارگاه گاهی ارتفاع آزاد می‌خواهد: طبقهٔ کفش پایین کوتاه، طبقهٔ چمدان
  # بالا بلند. پخش مساوی همیشه جواب نمی‌دهد.
  def test_shelf_heights_can_be_explicit
    lay = U.layout(1200, 2200, 600, 16, 'bays' => 1,
                   'shelf_heights_mm' => [400, 900, 1700])
    zs = lay['shelves'].map { |sh| sh['z'] }.sort
    assert_equal [400.0, 900.0, 1700.0], zs
  end

  def test_shelf_heights_outside_the_carcass_are_dropped
    # ارتفاع بیرون از بدنه بی‌صدا رد نمی‌شود؛ نادیده گرفتنش یعنی طبقه‌ای
    # بریده شود که جایی برایش نیست.
    lay = U.layout(1200, 2200, 600, 16, 'bays' => 1,
                   'shelf_heights_mm' => [400, 5000, -100])
    assert_equal [400.0], lay['shelves'].map { |sh| sh['z'] }
  end

  def test_a_bay_can_hold_drawers
    lay = U.layout(1200, 2200, 600, 16, 'bays' => 2,
                   'bay_fills' => [{ 'type' => 'drawers', 'drawers' => 4 },
                                   { 'type' => 'shelves', 'shelves' => 3 }])
    assert_equal 4, lay['drawers'].length, 'دهانهٔ کشویی چهار کشو دارد'
    assert lay['drawers'].all? { |d| d['bay'].zero? }, 'همه در دهانهٔ خودشان'
    assert_equal 3, lay['shelves'].length, 'دهانهٔ دیگر دست‌نخورده'
    assert_empty lay['shelves'].select { |sh| sh['bay'].zero? },
                 'دهانهٔ کشویی طبقه نمی‌گیرد'
  end

  def test_drawer_bay_produces_real_box_parts
    parts = builder.build_parts('wardrobe', 120, 220, 60,
                                bay_fills: [{ 'type' => 'drawers', 'drawers' => 3 },
                                            { 'type' => 'shelves', 'shelves' => 2 }])
    keys = parts.map { |p| p['key'] }
    assert_includes keys, 'drawer_side'
    assert_includes keys, 'drawer_bottom'
    assert_equal 6, parts.find { |p| p['key'] == 'drawer_side' }['count'],
                 'سه کشو = شش بدنه'
  end

  # ---------- درب ریلی ----------

  # لنگه‌های ریلی **روی هم** می‌لغزند، پس هرکدام از نصفِ عرض پهن‌تر است.
  # اگر مثل لولایی حساب شود، وسط کمد شکاف می‌ماند.
  def test_sliding_leaves_overlap_instead_of_leaving_a_gap
    hinged = U.door_leaf(1800, 2200, 2, 3, 'hinged')
    sliding = U.door_leaf(1800, 2200, 2, 3, 'sliding')

    assert_operator sliding['w'], :>, 900, 'لنگهٔ ریلی از نصف پهن‌تر است'
    assert_operator hinged['w'], :<, 900, 'ولی لولایی از نصف باریک‌تر (درز دارد)'
    assert_operator sliding['w'] * 2, :>, 1800, 'دو لنگه روی هم بیشتر از عرض‌اند'
  end

  def test_sliding_doors_are_shorter_because_of_the_track
    sliding = U.door_leaf(1800, 2200, 2, 3, 'sliding')
    hinged = U.door_leaf(1800, 2200, 2, 3, 'hinged')
    assert_operator sliding['h'], :<, hinged['h'],
                    'ریل بالا و پایین جا می‌گیرد — درب ریلی تمام‌ارتفاع نیست'
  end

  def test_sliding_mode_reaches_the_cut_list
    parts = builder.build_parts('wardrobe', 180, 220, 60, door_mode: 'sliding')
    door = parts.find { |p| p['key'] == 'door' }
    refute_nil door
    assert_includes door['note'], 'ریلی', 'کارگاه باید بداند درب ریلی است'
    assert_operator door['cut_width_mm'], :>, 900, 'و پهنایش هم‌پوشانی دارد'
  end

  def test_hinged_is_still_the_default
    parts = builder.build_parts('wardrobe', 180, 220, 60)
    door = parts.find { |p| p['key'] == 'door' }
    refute_includes door['note'].to_s, 'ریلی'
  end
end
