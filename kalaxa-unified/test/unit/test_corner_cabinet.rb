# encoding: utf-8
# frozen_string_literal: true

# کابینت گوشه — اجرا: ruby test/unit/test_corner_cabinet.rb
#
# کاربر گفت همهٔ امکاناتی که آن پلاگین مکس دارد لازم است؛ کابینت گوشه
# مهم‌ترینشان بود: «در هر آشپزخانه‌ای حداقل یکی هست و الان اصلاً نداریم».
#
# یک تمپلیت تازه باید در **چهار جای مستقل** ثبت شود: فهرست تمپلیت‌ها، لیست
# برش، هندسهٔ سه‌بعدی، و برچسب فارسی. جا ماندن هر کدام خطایی نمی‌دهد — فقط
# کابینت در یکی از این چهار جا نیست. تست‌های واحد این را نمی‌گیرند چون هر
# ماژول به‌تنهایی درست است.
require 'minitest/autorun'
require 'tmpdir'
require 'json'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
$LOAD_PATH.unshift(File.expand_path('../stubs', __dir__))
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-corner')
ENV['KALAXA_QUIET'] = '1'

require 'su_double'
require File.join(SRC, 'lib', 'catalog')
require File.join(SRC, 'lib', 'glossary')
require File.join(SRC, 'lib', 'materials')
require File.join(SRC, 'lib', 'door_shapes')
require File.join(SRC, 'lib', 'cabinet_builder')
require File.join(SRC, 'lib', 'cabinet_geometry')

class TestCornerCabinet < Minitest::Test
  B = Kalaxa::CabinetBuilder
  G = Kalaxa::CabinetGeometry
  ID = 'base_corner_diagonal'

  def parts(w = 90, h = 72, d = 55, opts = {})
    B.build_parts(ID, w, h, d, opts)
  end

  def boxes(w = 90, h = 72, d = 55, opts = {})
    G.boxes_for(ID, w, h, d, opts)
  end

  def by_key(list, key)
    list.select { |p| p['key'] == key }
  end

  # ---------- ثبت در هر چهار جا ----------

  def test_template_is_registered
    assert_includes B::TEMPLATES, ID, 'در فهرست تمپلیت‌ها نیست'
  end

  def test_cut_list_knows_it
    refute_empty parts, 'لیست برش برای این تمپلیت چیزی نمی‌دهد'
  end

  def test_geometry_knows_it
    refute_empty boxes, 'هندسهٔ سه‌بعدی برای این تمپلیت چیزی نمی‌دهد'
  end

  def test_it_has_a_persian_label
    require File.join(SRC, 'app', 'create_cabinet_tool')
    label = Kalaxa::App::CreateCabinetTool::TEMPLATE_LABELS_FA[ID]
    refute_nil label, 'برچسب فارسی ندارد — در دیالوگ ساخت با نام انگلیسی می‌آید'
    refute_equal ID, label
  end

  # ---------- مدل و لیست برش هم‌نظرند ----------

  # این همان واگرایی‌ای است که در «قید بالا» رخ داد: مدل چهار تکه می‌کشید و
  # لیست برش دو تا می‌داد، پس کارگاه کم متریال سفارش می‌داد.
  def test_model_and_cut_list_have_the_same_part_kinds
    cut_keys = parts.map { |p| p['key'] }.uniq.sort
    model_keys = boxes.map { |b| b['key'] }.uniq.sort

    # یراق/پایه فقط در مدل‌اند و ورق نیستند
    model_keys -= %w[leg handle]
    # قطعات دربِ چندتکه در هر دو با کلید خودشان می‌آیند
    assert_equal cut_keys, model_keys,
                 "مدل و لیست برش قطعات متفاوتی دارند:\n" \
                 "  برش: #{cut_keys.join(', ')}\n  مدل: #{model_keys.join(', ')}"
  end

  def test_side_counts_match
    assert_equal 2, by_key(parts, 'side').first['count'], 'دو دیواره روی دو دیوار'
    assert_equal 2, by_key(boxes, 'side').length
    assert_equal 2, by_key(parts, 'side_corner').first['count'], 'دو دیوارهٔ کنار نما'
    assert_equal 2, by_key(boxes, 'side_corner').length
  end

  def test_two_backs_one_per_wall
    assert_equal 2, by_key(parts, 'back').first['count'],
                 'کابینت گوشه دو پشت‌بند دارد، یکی روی هر دیوار'
  end

  # ---------- هندسهٔ نمای اریب ----------

  def test_diagonal_front_is_rotated
    door = by_key(boxes, 'door').first
    refute_nil door, 'نمای اریب در مدل نیست'
    assert door['rot_z_deg'], 'نمای اریب باید چرخیده باشد، وگرنه درب صاف و سر جای غلط است'
    assert_in_delta 135, door['rot_z_deg'], 0.1
  end

  def test_diagonal_width_is_the_hypotenuse
    # بال ۹۰۰، عمق ۵۵۰ → ضلع مثلث ۳۵۰ → وتر = ۳۵۰√۲ ≈ ۴۹۵
    door = by_key(parts, 'door').first
    expected = Math.sqrt(2) * (900 - 550) - B::DOOR_GAP_MM
    assert_in_delta expected, door['cut_width_mm'], 1.5,
                    'پهنای نما باید وتر باشد، نه ضلع'
  end

  def test_other_templates_have_no_rotation
    # میدان اختیاری است؛ اگر روی تمپلیت‌های محوری هم ظاهر شود یعنی نشتی داریم.
    G.boxes_for('base_single_door', 80, 72, 55).each do |b|
      refute b['rot_z_deg'], "قطعهٔ #{b['key']} در کابینت معمولی نباید چرخش داشته باشد"
    end
  end

  # ---------- قطعهٔ پنج‌ضلعی: صادق بودن ----------

  # کف و طبقهٔ گوشه پنج‌ضلعی‌اند ولی جدول برش فقط مستطیل می‌فهمد. ابعادِ
  # مستطیل محیطی داده می‌شود — عددِ ورق درست است، ولی کارگاه باید بداند که
  # باید گوشه را اریب ببُرد. سکوت این‌جا یعنی قطعهٔ مربعی بریده شود.
  def test_pentagon_parts_say_they_need_an_angled_cut
    %w[bottom_corner shelf_corner].each do |key|
      row = by_key(parts, key).first
      refute_nil row, "#{key} در لیست برش نیست"
      assert_includes row['note'], '۴۵',
                      "#{key} باید بگوید گوشه‌اش اریب بریده می‌شود"
      refute row['allow_rotation'],
             "#{key} پنج‌ضلعی است — چرخاندنش در نستینگ برش را غلط می‌کند"
    end
  end

  def test_angled_cut_length_is_stated
    note = by_key(parts, 'bottom_corner').first['note']
    assert_match(/\d+/, note, 'طول برش اریب باید عدد داشته باشد، نه توضیح کلی')
  end

  # ---------- ابعاد ----------

  def test_arm_length_drives_the_footprint
    # با عمق ۵۵، کمینهٔ بال ۸۴ سانت است (نمای اریب ۴۰۰ میلی).
    small = parts(90, 72, 55)
    big   = parts(110, 72, 55)
    assert_operator by_key(big, 'bottom_corner').first['cut_length_mm'], :>,
                    by_key(small, 'bottom_corner').first['cut_length_mm'],
                    'بال بلندتر → کف بزرگ‌تر'
  end

  def test_shelf_count_is_respected
    rows = by_key(parts(90, 72, 55, shelf_count: 2), 'shelf_corner')
    assert_equal 2, rows.first['count']
    # کلید مدل هم همان 'shelf_corner' است — همان چیزی که تست تطبیق کلیدها
    # اجبارش کرد.
    assert_equal 2, by_key(boxes(90, 72, 55, shelf_count: 2), 'shelf_corner').length
  end

  def test_zero_shelves_produces_none
    assert_empty by_key(parts(90, 72, 55, shelf_count: 0), 'shelf_corner')
  end

  # ---------- مقاومت ----------

  def test_narrow_arm_is_refused_not_silently_negative
    # بالِ کوتاه‌تر از عمق یعنی وتر منفی. نسخهٔ اول قطعاتی با ابعاد **منفی**
    # می‌ساخت و لیست برش «−۷۵» نشان می‌داد. رد کردنِ صریح بهتر از عددِ بی‌معناست.
    err = assert_raises(ArgumentError) { parts(50, 72, 55) }
    assert_match(/بال|عمق/, err.message, 'پیام باید بگوید مشکل کجاست')
    assert_match(/\d+ cm/, err.message, 'و بگوید چه عددی لازم است، نه فقط اینکه غلط است')

    # هندسه هم باید همان را رد کند — قاعده یک‌جاست.
    assert_raises(ArgumentError) { boxes(50, 72, 55) }
  end

  def test_valid_arm_makes_only_positive_parts
    parts(90, 72, 55).each do |p|
      assert_operator p['cut_length_mm'], :>, 0, "#{p['key']} طول نامعتبر دارد"
      assert_operator p['cut_width_mm'], :>, 0, "#{p['key']} عرض نامعتبر دارد"
    end
  end
end
