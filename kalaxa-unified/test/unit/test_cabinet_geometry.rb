# frozen_string_literal: true

# test_cabinet_geometry.rb — سلامت هندسی جعبه‌های هر قطعه (بدون تداخل با
# مرزهای بیرونی کابینت، بدون بعد صفر/منفی).
# اجرا:  ruby test/unit/test_cabinet_geometry.rb
require 'minitest/autorun'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
require File.join(SRC, 'lib', 'cabinet_geometry')

class TestCabinetGeometry < Minitest::Test
  # از خودِ ماژول خوانده می‌شود، نه عدد ثابت در تست: اگر ارتفاع پایه عوض
  # شود، تست باید همچنان قاعده را بسنجد نه یک عدد کهنه را.
  L = Kalaxa::CabinetGeometry

  TEMPLATES = {
    'base_single_door'      => [80, 72, 55, { shelf_count: 1 }],
    'base_three_drawer'     => [60, 72, 55, { drawer_count: 3 }],
    'base_sink_double_door' => [100, 72, 55, {}],
    'wall_single_door'      => [80, 72, 32, { shelf_count: 1 }],
    'tall_double_door'      => [60, 220, 55, { shelf_count: 2 }]
  }.freeze

  # یراق عمداً بیرون از حجم بدنه است: پایه **زیر** بدنه، دستگیره جلوی نما.
  # پس قید «داخل بدنه بودن» فقط برای قطعات چوبی معنا دارد.
  HARDWARE_KEYS = %w[leg handle].freeze

  def test_no_degenerate_or_out_of_bounds_boxes
    TEMPLATES.each do |tid, (w_cm, h_cm, d_cm, opts)|
      w_mm = w_cm * 10; h_mm = h_cm * 10; d_mm = d_cm * 10
      boxes = Kalaxa::CabinetGeometry.boxes_for(tid, w_cm, h_cm, d_cm, opts)
      assert boxes.length.positive?, "#{tid}: هیچ جعبه‌ای ساخته نشد"
      boxes.each do |b|
        assert b['dx'] > 0, "#{tid}/#{b['key']}: dx باید مثبت باشد"
        assert b['dy'] > 0, "#{tid}/#{b['key']}: dy باید مثبت باشد"
        assert b['dz'] > 0, "#{tid}/#{b['key']}: dz باید مثبت باشد"
        # عرض و عمق برای همه (حتی یراق) باید داخل ردپای کابینت بماند
        assert (b['x'] + b['dx']) <= w_mm + 0.01, "#{tid}/#{b['key']}: از عرض کابینت بیرون زد"
        assert (b['y'] + b['dy']) <= d_mm + 0.01, "#{tid}/#{b['key']}: از عمق کابینت بیرون زد"
        assert b['x'] >= -0.01, "#{tid}/#{b['key']}: x منفی"
        next if HARDWARE_KEYS.include?(b['key'])

        # کابینت زمینی روی پایه می‌ایستد، پس بدنه از ارتفاع پایه شروع
        # می‌شود نه از صفر. ارتفاع **خودِ بدنه** همان h است؛ فقط از کف
        # فاصله دارد.
        base_z = boxes.any? { |x| x['key'] == 'leg' } ? L::LEG_HEIGHT_MM : 0
        assert (b['z'] + b['dz']) <= base_z + h_mm + 0.01,
               "#{tid}/#{b['key']}: از ارتفاع کابینت بیرون زد"
        assert b['z'] >= base_z - 0.01, "#{tid}/#{b['key']}: زیر کفِ بدنه افتاد"
      end
    end
  end

  def test_legs_only_under_floor_standing_cabinets
    wall = Kalaxa::CabinetGeometry.boxes_for('wall_single_door', 80, 72, 32, shelf_count: 1)
    refute wall.any? { |b| b['key'] == 'leg' }, 'کابینت هوایی نباید پایه داشته باشد'

    base = Kalaxa::CabinetGeometry.boxes_for('base_single_door', 80, 72, 55, shelf_count: 1)
    legs = base.select { |b| b['key'] == 'leg' }
    assert_equal 4, legs.length, 'کابینت زمینی ≤۹۰۰mm باید ۴ پایه داشته باشد (هم‌تراز BOM)'
    # پایه روی **کف** می‌ایستد، نه زیر آن.
    #
    # تا ۳.۷۲ پایه‌ها از ۰ تا ۱۰۰- بودند و بدنه از صفر. گروه در اسکچاپ روی
    # نقطهٔ کلیک می‌نشیند، پس کلیک روی کف یعنی **بدنه روی زمین و پایه‌ها زیر
    # زمین** — کابینت انگار پایه ندارد. کاربر همین را گزارش داد.
    legs.each do |l|
      assert_in_delta 0, l['z'], 0.01, 'پایه باید از کف شروع شود'
      assert_in_delta L::LEG_HEIGHT_MM, l['dz'], 0.01, 'به ارتفاع استاندارد پایه'
    end

    # و بدنه دقیقاً روی پایه بنشیند — نه شناور، نه فرورفته.
    bottom = base.find { |x| x['key'] == 'bottom' }
    refute_nil bottom, 'کف کابینت پیدا نشد'
    assert_in_delta L::LEG_HEIGHT_MM, bottom['z'], 0.01,
                    'کف بدنه باید دقیقاً روی پایه بنشیند'

    # کابینت هوایی پایه ندارد، پس نباید بالا برود.
    assert wall.all? { |x| x['z'] >= -0.01 }, 'کابینت هوایی نباید جابه‌جا شود'
    assert wall.any? { |x| x['z'].abs < 0.01 }, 'و باید از صفر شروع شود'

    wide = Kalaxa::CabinetGeometry.boxes_for('base_sink_double_door', 100, 72, 55)
    assert_equal 6, wide.select { |b| b['key'] == 'leg' }.length,
                 'کابینت زمینی >۹۰۰mm باید ۶ پایه داشته باشد (هم‌تراز BOM)'
  end

  # هیچ تستی جای دستگیره را نمی‌سنجید — فقط وجودش را. کاربر گزارش داد
  # «دستگیره خوب نبود» و دو ایراد واقعی بود: روی نمای کشو بالاتر از وسط
  # می‌افتاد (کامنت کد می‌گفت «وسط» ولی کد ۶۰ میلی از بالا می‌گذاشت)، و
  # طولش ثابت ۱۲۸ بود روی هر عرضی.
  def test_drawer_handle_sits_in_the_middle_of_its_front
    boxes = Kalaxa::CabinetGeometry.boxes_for('base_three_drawer', 60, 72, 55)
    fronts = boxes.select { |b| b['key'] == 'drawer_front' }.sort_by { |b| b['z'] }
    handles = boxes.select { |b| b['key'] == 'handle' }.sort_by { |b| b['z'] }
    assert_equal fronts.length, handles.length, 'هر نما یک دستگیره'
    refute_empty fronts

    fronts.zip(handles).each do |f, hb|
      assert_in_delta f['z'] + (f['dz'] - hb['dz']) / 2.0, hb['z'], 0.01,
                      'دستگیرهٔ کشو باید وسطِ ارتفاع نما باشد'
      assert_in_delta f['x'] + (f['dx'] - hb['dx']) / 2.0, hb['x'], 0.01,
                      'و وسطِ عرض نما'
      assert hb['dx'] <= f['dx'], 'دستگیره از نما پهن‌تر نشود'
      assert hb['y'] < f['y'] + 0.01, 'و جلوی نما بایستد'
    end
  end

  def test_handle_length_follows_the_front_and_is_a_real_size
    sizes = Kalaxa::CabinetGeometry::HANDLE_SIZES_MM

    lens = [30, 45, 60, 80].map do |w_cm|
      b = Kalaxa::CabinetGeometry.boxes_for('base_three_drawer', w_cm, 72, 55)
      b.find { |x| x['key'] == 'handle' }['dx']
    end

    lens.each do |l|
      assert_includes sizes, l, 'طول باید از فهرست موجود بازار باشد، نه هر عددی'
    end
    # نمای پهن‌تر دستگیرهٔ بلندتر (یا دست‌کم نه کوتاه‌تر) می‌گیرد.
    assert_equal lens.sort, lens, "طول با عرض نما بالا نرفت: #{lens.inspect}"
    assert lens.last > lens.first,
           "نمای ۸۰ و ۳۰ نباید دستگیرهٔ هم‌اندازه بگیرند: #{lens.inspect}"
  end

  def test_door_handle_stays_on_the_opening_edge
    boxes = Kalaxa::CabinetGeometry.boxes_for('base_single_door', 45, 72, 55,
                                              door_swing: 'right')
    door = boxes.find { |b| b['key'] == 'door' }
    hb = boxes.find { |b| b['key'] == 'handle' }
    assert hb['dz'] > hb['dx'], 'دستگیرهٔ درب عمودی است'
    assert_in_delta door['z'] + (door['dz'] - hb['dz']) / 2.0, hb['z'], 0.01,
                    'وسطِ ارتفاع درب'
    # کنار یکی از دو لبه، نه وسطِ عرض
    near_edge = [hb['x'] - door['x'], (door['x'] + door['dx']) - (hb['x'] + hb['dx'])].min
    assert near_edge < door['dx'] / 4.0, 'دستگیرهٔ درب باید کنار لبه باشد'
  end

  def test_handle_kinds
    bar = Kalaxa::CabinetGeometry.boxes_for('base_single_door', 80, 72, 55, handle_kind: 'bar')
    assert bar.any? { |b| b['key'] == 'handle' }, 'دستگیرهٔ میله‌ای باید ساخته شود'
    bar.select { |b| b['key'] == 'handle' }.each do |hb|
      assert hb['y'] < 0, 'دستگیرهٔ میله‌ای باید جلوی نما (y منفی) باشد'
    end

    none = Kalaxa::CabinetGeometry.boxes_for('base_single_door', 80, 72, 55, handle_kind: 'none')
    refute none.any? { |b| %w[handle handle_groove].include?(b['key']) }, 'بدون دستگیره یعنی هیچ‌کدام'

    hid = Kalaxa::CabinetGeometry.boxes_for('base_single_door', 80, 72, 55, handle_kind: 'hidden')
    refute hid.any? { |b| b['key'] == 'handle' }, 'دستگیرهٔ مخفی میلهٔ بیرون‌زده ندارد'
    groove = hid.find { |b| b['key'] == 'handle_groove' }
    assert groove, 'دستگیرهٔ مخفی باید فرورفتگی داشته باشد'
    door = hid.find { |b| b['key'] == 'door' }
    # فرورفتگی دقیقاً بالای نمای کوتاه‌شده می‌نشیند و عقب‌تر از سطح نماست
    assert_in_delta door['z'] + door['dz'], groove['z'], 0.01, 'فرورفتگی باید درست بالای نما باشد'
    assert groove['y'] > door['y'], 'فرورفتگی باید عقب‌تر از سطح جلویی نما باشد'
  end

  def test_two_side_panels_at_opposite_edges
    boxes = Kalaxa::CabinetGeometry.boxes_for('base_single_door', 80, 72, 55, shelf_count: 1)
    sides = boxes.select { |b| b['key'] == 'side' }
    assert_equal 2, sides.length
    xs = sides.map { |b| b['x'] }.sort
    assert_equal 0, xs.first
    assert_equal 800 - 16, xs.last
  end

  def test_drawer_count_matches_part_multiplicity
    boxes = Kalaxa::CabinetGeometry.boxes_for('base_three_drawer', 60, 72, 55, drawer_count: 3)
    assert_equal 3, boxes.count { |b| b['key'] == 'drawer_front' }
    assert_equal 6, boxes.count { |b| b['key'] == 'drawer_side' }
  end

  def test_double_door_width_split_side_by_side
    boxes = Kalaxa::CabinetGeometry.boxes_for('base_sink_double_door', 100, 72, 55)
    doors = boxes.select { |b| b['key'] == 'door' }
    assert_equal 2, doors.length
    doors_sorted = doors.sort_by { |b| b['x'] }
    assert doors_sorted[0]['x'] < doors_sorted[1]['x']
    assert_equal doors_sorted[0]['z'], doors_sorted[1]['z'], 'درهای کنارهم باید هم‌ارتفاع باشند'
  end

  def test_double_door_height_split_stacked
    boxes = Kalaxa::CabinetGeometry.boxes_for('tall_double_door', 60, 220, 55, shelf_count: 2)
    doors = boxes.select { |b| b['key'] == 'door' }
    assert_equal 2, doors.length
    doors_sorted = doors.sort_by { |b| b['z'] }
    assert doors_sorted[0]['z'] < doors_sorted[1]['z']
    assert_equal doors_sorted[0]['x'], doors_sorted[1]['x'], 'درهای روی‌هم باید هم‌عرض باشند'
  end

  def test_zero_shelf_count_produces_no_shelf_boxes
    boxes = Kalaxa::CabinetGeometry.boxes_for('base_single_door', 80, 72, 55, shelf_count: 0)
    refute boxes.any? { |b| b['key'] == 'shelf' }
  end

  # --- هم‌پوشانی حجمی: قطعات نباید داخل هم فرو بروند، جز اتصالات عمدی ---

  GROOVE_DEPTH = 8
  # اتصالات عمدی: پشت‌بند داخل شیار بدنه/کف/قید؛ کف کشو روی بدنه/پشت کشو.
  ALLOWED_JOINTS = [
    %w[back side], %w[back bottom], %w[back top_bottom], %w[back rail_top],
    %w[drawer_bottom drawer_back], %w[drawer_bottom drawer_side]
  ].map(&:sort).freeze

  def overlap_on(a, b, axis)
    [0, [a[axis] + a['d' + axis], b[axis] + b['d' + axis]].min - [a[axis], b[axis]].max].max
  end

  def overlap_volume(a, b)
    %w[x y z].inject(1) { |vol, ax| vol * overlap_on(a, b, ax) }
  end

  def test_no_unintended_volume_overlap_between_parts
    TEMPLATES.each do |tid, (w_cm, h_cm, d_cm, opts)|
      boxes = Kalaxa::CabinetGeometry.boxes_for(tid, w_cm, h_cm, d_cm, opts)
      boxes.combination(2) do |a, b|
        vol = overlap_volume(a, b)
        next if vol <= 1 # نویز گرد کردن
        pair = [a['key'], b['key']].sort
        assert ALLOWED_JOINTS.include?(pair),
               "#{tid}: هم‌پوشانی ناخواسته بین #{a['key']} و #{b['key']} (حجم #{vol.round}mm³)"
        next unless pair.include?('back')

        # اتصال شیار: نفوذ در محور نازکِ قطعهٔ مقابل باید دقیقاً عمق شیار باشد
        mate = b['key'] == 'back' ? a : b
        thin = %w[x y z].min_by { |ax| mate['d' + ax] }
        pen = overlap_on(a, b, thin)
        assert_in_delta GROOVE_DEPTH, pen, 0.01,
                        "#{tid}: نفوذ پشت‌بند در #{mate['key']} باید = عمق شیار باشد"
      end
    end
  end

  def test_drawer_box_sits_above_carcass_bottom
    boxes = Kalaxa::CabinetGeometry.boxes_for('base_three_drawer', 60, 72, 55, drawer_count: 3)
    bottom = boxes.find { |b| b['key'] == 'bottom' }
    bottom_top = bottom['z'] + bottom['dz']
    %w[drawer_side drawer_back drawer_bottom].each do |key|
      boxes.select { |b| b['key'] == key }.each do |b|
        assert b['z'] >= bottom_top - 0.01,
               "#{key} باید روی کف کابینت بنشیند (z=#{b['z']} < #{bottom_top})"
      end
    end
  end

  # جعبهٔ کشو باید نصف لقی از هر دیواره فاصله بگیرد تا ریل واقعاً جا شود.
  # (تا v3.25 لقی صفر بود و بدنهٔ کشو دقیقاً چسبیده به دیواره می‌نشست — ریل جا نداشت.)
  def test_drawer_box_leaves_room_for_slide_on_both_sides
    body = 16
    { 'ball' => 25, 'bottom' => 11 }.each do |kind, clearance|
      boxes = Kalaxa::CabinetGeometry.boxes_for('base_three_drawer', 60, 72, 55,
                                                 drawer_count: 3, slide_kind: kind)
      sides = boxes.select { |b| b['key'] == 'drawer_side' }.map { |b| b['x'] }.uniq.sort
      box_x0 = body + clearance / 2.0
      box_outer = (600 - 2 * body) - clearance
      assert_equal [box_x0, box_x0 + box_outer - body].sort, sides,
                   "ریل #{kind}: بدنهٔ کشو باید نصف لقی از دیواره فاصله بگیرد"
      # فاصلهٔ چپ بین دیوارهٔ کابینت و بدنهٔ کشو باید دقیقاً نصف لقی باشد
      assert_in_delta clearance / 2.0, sides.first - body, 0.01
    end
  end

  def test_slide_is_drawn_and_fits_the_gap
    boxes = Kalaxa::CabinetGeometry.boxes_for('base_three_drawer', 60, 72, 55,
                                               drawer_count: 3, slide_kind: 'ball')
    slides = boxes.select { |b| b['key'] == 'slide' }
    assert_equal 6, slides.length, 'هر کشو دو ریل → ۳ کشو = ۶ ریل'
    slides.each do |s|
      assert_in_delta 12.5, s['dx'], 0.01, 'ضخامت ریل = نصف لقی'
    end
  end

  def test_determinism
    a = Kalaxa::CabinetGeometry.boxes_for('base_single_door', 80, 72, 55, shelf_count: 1)
    b = Kalaxa::CabinetGeometry.boxes_for('base_single_door', 80, 72, 55, shelf_count: 1)
    assert_equal a, b
  end
end
