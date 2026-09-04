# encoding: utf-8
# frozen_string_literal: true

# تشخیص کار ماشین (شیار/فرز/CNC) — اجرا: ruby test/unit/test_machining_detection.rb
#
# کاربر گزارش داد: «دو قطعه CNC داشت، باید می‌گفت» و «باید از تمام جهت‌ها آنالیز
# می‌کرد». هر دو یک ریشه داشتند: `RawGeometry` فقط **جعبهٔ محیطی** هر قطعه را
# می‌خواند، پس یک تختهٔ شیارخورده و یک تختهٔ ساده کاملاً یکسان دیده می‌شدند و کار
# ماشین هرگز گزارش نمی‌شد.
#
# از هندسه نمی‌شود فهمید **چه** کاری روی قطعه انجام شده — ولی می‌شود فهمید کاری
# انجام شده: حجم واقعی کمتر از حجم جعبهٔ محیطی است، یا جسم بیش از شش وجه دارد.
# همین برای «به کاربر بگو این را دستی بررسی کن» کافی است و صادقانه‌تر از سکوت.
require 'minitest/autorun'
require 'tmpdir'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
$LOAD_PATH.unshift(File.expand_path('../stubs', __dir__))
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-cnc')
ENV['KALAXA_QUIET'] = '1'

require 'su_double'
require File.join(SRC, 'lib', 'raw_geometry')

# جسمی که حجم و شمار وجه واقعی گزارش می‌کند — همان چیزی که اسکچاپ می‌دهد.
class Solid < Sketchup::Group
  INCH3 = 25.4**3

  # وجه‌ها روی **definition** می‌نشینند، نه روی خودِ گروه: در اسکچاپ واقعی
  # `Sketchup::Group` زیرکلاس `ComponentInstance` است و کد از `definition.entities`
  # می‌خواند. نسخهٔ اول این بدل `entities` را روی گروه بازنویسی کرده بود و تست
  # الکی قرمز می‌شد — اشکال از بدل بود، نه از کد.
  def initialize(mm, volume_ratio: 1.0, faces: 6, **kw)
    dx, dy, dz = mm
    super(definition: Sketchup::ComponentDefinition.new(FaceBag.new(faces)),
          bounds: Geom::BoundingBox.new(
            Geom::Point3d.new(0, 0, 0),
            Geom::Point3d.new(dx / 25.4, dy / 25.4, dz / 25.4)
          ), **kw)
    @vol_in3 = (dx * dy * dz * volume_ratio) / INCH3
  end

  def volume = @vol_in3

  # `Entities` واقعی Enumerable است؛ بدلِ اول فقط grep داشت و به‌محض اینکه اسکنر
  # برای یافتن برگ‌ها سراغ select رفت، تست الکی قرمز شد. تخته فرزند گروهی ندارد،
  # پس select باید تهی برگرداند — نه اینکه وجود نداشته باشد.
  class FaceBag
    def initialize(n) = @n = n
    def grep(_klass) = Array.new(@n) { :face }
    def select(&_blk) = []
    def length = @n
  end
end

# RawGeometry با Sketchup::Face کار می‌کند؛ در بدل تعریفش می‌کنیم.
module Sketchup
  class Face; end
end

class TestMachiningDetection < Minitest::Test
  R = Kalaxa::RawGeometry

  def cabinet(kids)
    Sketchup::Group.new(definition: Sketchup::ComponentDefinition.new(kids), name: 'کابینت')
  end

  # ---------- تختهٔ ساده ----------

  def test_plain_panel_is_not_flagged
    box = R.boxes_of(cabinet([Solid.new([720, 550, 16], pid: 1)]))['boxes'].first
    refute box['machined'], 'تختهٔ ساده نباید کار ماشین علامت بخورد'
    assert_in_delta 1.0, box['solid_ratio'], 0.001
  end

  # ---------- شیار ----------

  def test_grooved_panel_is_flagged
    # پشت‌بند در شیار: حدود ۳٪ حجم برداشته می‌شود
    box = R.boxes_of(cabinet([Solid.new([720, 550, 16], volume_ratio: 0.97, faces: 12, pid: 2)]))['boxes'].first
    assert box['machined'], 'تختهٔ شیارخورده باید علامت بخورد'
    assert box['solid_ratio'] < 1.0
  end

  def test_ratio_reports_how_much_was_removed
    box = R.boxes_of(cabinet([Solid.new([1000, 500, 20], volume_ratio: 0.85, pid: 3)]))['boxes'].first
    assert_in_delta 0.85, box['solid_ratio'], 0.001,
                    'نسبت باید بگوید چقدر ماده برداشته شده'
  end

  # ---------- وجه اضافه بدون کاهش حجم ----------

  def test_extra_faces_alone_flag_machining
    # فرزکاری سطحی می‌تواند حجم را تقریباً دست‌نخورده بگذارد ولی وجه اضافه کند
    box = R.boxes_of(cabinet([Solid.new([720, 550, 16], volume_ratio: 1.0, faces: 14, pid: 4)]))['boxes'].first
    assert box['machined'], 'وجه بیش از شش هم نشانهٔ کار ماشین است'
    assert_equal 14, box['face_count']
  end

  # ---------- گزارش سطح کابینت ----------

  def test_cabinet_reports_how_many_parts_are_machined
    res = R.boxes_of(cabinet([
      Solid.new([720, 550, 16], pid: 1),
      Solid.new([720, 550, 16], volume_ratio: 0.97, faces: 12, pid: 2),
      Solid.new([700, 500, 16], volume_ratio: 0.9, faces: 10, pid: 3)
    ]))
    assert_equal 2, res['machined_count'], 'دو قطعه کار ماشین دارند'
    assert_includes res['note'], '۲'.tr('۰۱۲۳۴۵۶۷۸۹', '0123456789') == '2' ? '2' : '2'
    refute_empty res['note'], 'باید صریح به کاربر گفته شود، نه سکوت'
  end

  def test_clean_cabinet_says_nothing
    res = R.boxes_of(cabinet([Solid.new([720, 550, 16], pid: 1)]))
    assert_equal 0, res['machined_count']
    assert_empty res['note'], 'کابینت بدون کار ماشین نباید هشدار الکی بدهد'
  end

  # ---------- مقاومت ----------

  def test_non_manifold_solid_does_not_crash
    # جسمی که اسکچاپ نمی‌تواند حجمش را بدهد (منفی/صفر) — نباید اسکن را بشکند
    weird = Solid.new([100, 100, 10], volume_ratio: 0, faces: 8, pid: 9)
    box = R.boxes_of(cabinet([weird]))['boxes'].first
    assert_nil box['solid_ratio'], 'حجم نامعلوم یعنی نسبت نامعلوم، نه صفر'
    assert box['machined'], 'ولی وجه اضافه همچنان نشانه است'
  end

  def test_dimensions_still_correct_alongside_machining_info
    box = R.boxes_of(cabinet([Solid.new([720, 550, 16], volume_ratio: 0.9, pid: 1)]))['boxes'].first
    assert_in_delta 720, box['dx'], 0.1, 'افزودن اطلاعات ماشین نباید ابعاد را خراب کند'
    assert_in_delta 550, box['dy'], 0.1
    assert_in_delta 16, box['dz'], 0.1
  end
end
