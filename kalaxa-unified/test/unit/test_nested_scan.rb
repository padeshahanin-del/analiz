# encoding: utf-8
# frozen_string_literal: true

# اسکنِ کابینتِ تودرتو — اجرا: ruby test/unit/test_nested_scan.rb
#
# کاربر یک کابینت واقعی را اسکن کرد و جدول فقط **سه سطر** داد: یکی
# «۹۰۰×۸۶۰ ضخامت ۵۶۶» و دو تا «لولا». یعنی کالاکسا خودِ بدنه را به‌جای قطعاتش
# دیده بود. علت: اسکنر فقط **یک لایه** پایین می‌رفت، پس گروه بدنه — که خودش
# ظرفِ قطعات بود — به چشمش یک قطعهٔ ۵۶۶ میلی‌متری آمد. هشدار «هیچ دیواره‌ای
# تشخیص داده نشد» هم گمراه می‌کرد: مشکل محورها نبود، اصلاً به قطعات نرسیده بود.
#
# پیشنهاد «اول منفجر کن بعد آنالیز کن» را عمداً پیاده نکردیم: خودِ گروه‌بندی
# همان چیزی است که مرز یک قطعه را تعریف می‌کند؛ با explode به‌جای قطعات، وجه و
# لبهٔ بی‌نام می‌ماند و کار پارامتریک کاربر هم نابود می‌شود. راه درست، پایین‌رفتن
# تا برگ‌های درخت است — همان نتیجه، بدون دست‌زدن به مدل.
require 'minitest/autorun'
require 'tmpdir'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
$LOAD_PATH.unshift(File.expand_path('../stubs', __dir__))
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-nest')
ENV['KALAXA_QUIET'] = '1'

require 'su_double'
require File.join(SRC, 'lib', 'raw_geometry')

module Sketchup
  class Face
    attr_reader :loops
    def initialize(loops = []) = @loops = loops
  end

  class ArcCurve
    attr_reader :center, :radius, :start_angle, :end_angle
    def initialize(center, radius_in)
      @center = center
      @radius = radius_in
      @start_angle = 0.0
      @end_angle = 2 * Math::PI
    end

    def is_polygon? = false
  end

  class Edge
    attr_reader :curve
    def initialize(curve = nil) = @curve = curve
  end

  class Vertex
    attr_reader :position
    def initialize(pos) = @position = pos
  end

  class Loop
    attr_reader :edges, :vertices
    def initialize(edges:, outer:, vertices: [])
      @edges = edges
      @outer = outer
      @vertices = vertices
    end

    def outer? = @outer
  end
end

class TestNestedScan < Minitest::Test
  R = Kalaxa::RawGeometry
  MM = 25.4

  # برگ: جعبه‌ای بدون فرزندِ گروهی. مرزهایش — مثل اسکچاپ واقعی — در فضای والدش.
  class Panel < Sketchup::Group
    def initialize(name, at_mm, size_mm, **kw)
      x, y, z = at_mm
      dx, dy, dz = size_mm
      super(name: name,
            definition: Sketchup::ComponentDefinition.new(Leaf.new),
            bounds: Geom::BoundingBox.new(
              Geom::Point3d.new(x / MM, y / MM, z / MM),
              Geom::Point3d.new((x + dx) / MM, (y + dy) / MM, (z + dz) / MM)
            ), **kw)
    end

    class Leaf
      def select(&_blk) = []
      def grep(_k) = Array.new(6) { :face }
    end
  end

  def container(name, kids, shift_mm = [0, 0, 0])
    Sketchup::Group.new(
      name: name,
      definition: Sketchup::ComponentDefinition.new(kids),
      transformation: Geom::Transformation.new(*shift_mm.map { |v| v / MM })
    )
  end

  # ---------- برگ‌ها، نه اولین لایه ----------

  def test_parts_inside_a_nested_body_group_are_found
    body = container('بدنه', [
      Panel.new('دیوارهٔ چپ', [0, 0, 0], [16, 550, 720], pid: 1),
      Panel.new('دیوارهٔ راست', [884, 0, 0], [16, 550, 720], pid: 2)
    ])
    res = R.boxes_of(container('کابینت', [body]))

    assert_equal 2, res['child_count'],
                 'باید به دو قطعهٔ داخل بدنه برسد، نه یک بلوکِ ۵۶۶ میلی‌متری'
    assert_equal ['دیوارهٔ چپ', 'دیوارهٔ راست'].sort, res['boxes'].map { |b| b['name'] }.sort
  end

  def test_the_body_group_itself_is_never_reported_as_a_part
    body = container('بدنه', [Panel.new('کف', [0, 0, 0], [868, 550, 16], pid: 3)])
    names = R.boxes_of(container('کابینت', [body]))['boxes'].map { |b| b['name'] }

    refute_includes names, 'بدنه', 'ظرف قطعه نیست — همین باگ ضخامت ۵۶۶ را ساخت'
  end

  def test_mixed_depths_all_reach_leaves
    # کارگاه همیشه یکدست گروه‌بندی نمی‌کند: یکی تخت، یکی تودرتو.
    flat = Panel.new('پشت‌بند', [0, 545, 0], [868, 5, 720], pid: 4)
    deep = container('بدنه', [container('کناره‌ها', [
      Panel.new('دیوارهٔ چپ', [0, 0, 0], [16, 550, 720], pid: 5)
    ])])
    res = R.boxes_of(container('کابینت', [flat, deep]))

    assert_equal %w[پشت‌بند دیوارهٔ\ چپ].sort, res['boxes'].map { |b| b['name'] }.sort
  end

  # ---------- ماتریسِ نیاکان ----------

  def test_nested_part_coordinates_are_in_cabinet_space
    # اگر ماتریسِ گروهِ والد اعمال نشود، این قطعه در x=0 گزارش می‌شود — یعنی
    # روی دیوارهٔ چپ سوار می‌شود و طبقه‌بندی کاملاً غلط درمی‌آید.
    shelf = Panel.new('طبقه', [0, 0, 300], [852, 540, 16], pid: 6)
    body = container('بدنه', [shelf], [16, 0, 0])
    left = Panel.new('دیوارهٔ چپ', [0, 0, 0], [16, 550, 720], pid: 7)

    boxes = R.boxes_of(container('کابینت', [left, body]))['boxes']
    got = boxes.find { |b| b['name'] == 'طبقه' }

    assert_in_delta 16, got['x'], 0.1, 'جابه‌جایی گروه والد باید روی مختصات بنشیند'
    assert_in_delta 852, got['dx'], 0.1, 'ابعاد نباید تغییر کند — فقط مکان'
  end

  def test_two_levels_of_transform_accumulate
    inner = container('کناره‌ها', [Panel.new('طبقه', [0, 0, 0], [100, 100, 16], pid: 8)], [10, 0, 0])
    outer = container('بدنه', [inner], [20, 0, 5])
    ref   = Panel.new('مرجع', [0, 0, 0], [16, 100, 100], pid: 9)

    got = R.boxes_of(container('کابینت', [ref, outer]))['boxes'].find { |b| b['name'] == 'طبقه' }
    assert_in_delta 30, got['x'], 0.1, 'ماتریس‌ها باید ضرب شوند، نه اینکه آخری برنده باشد'
    assert_in_delta 5,  got['z'], 0.1
  end

  # ---------- مقاومت ----------

  def test_deeply_pathological_nesting_terminates
    node = Panel.new('ته', [0, 0, 0], [10, 10, 10], pid: 99)
    20.times { |i| node = container("لایه#{i}", [node]) }

    res = nil
    assert_silent { res = R.boxes_of(container('کابینت', [node])) }
    assert_equal 0, res['child_count'],
                 'فراتر از MAX_DEPTH باید تهی برگردد، نه اینکه اسکچاپ را قفل کند'
  end

  # این باگ واقعی بود و هیچ تستی نمی‌گرفتش: `Machining` هیچ‌جا require نشده
  # بود. تست‌هایش سبز بودند چون خودشان مستقیم require می‌کردند، ولی در اسکچاپ
  # واقعی `defined?(Kalaxa::Machining)` تهی می‌ماند و نقشهٔ CNC همیشه خالی
  # می‌آمد — بدون هیچ خطایی. سکوت بدترین حالت شکست است.
  def test_scanner_brings_its_own_machining_module
    assert defined?(Kalaxa::Machining),
           'RawGeometry باید Machining را با خودش بیاورد، نه اینکه امید ' \
           'داشته باشد کسی دیگر require کرده باشد'
    assert_respond_to Kalaxa::Machining, :features_of
  end

  # ---------- ماتریس به لایهٔ سوراخ‌ها می‌رسد ----------

  # `Machining` ماتریس را درست اعمال می‌کند و تستش هم دارد — ولی اگر **اسکنر**
  # ماتریس را پاس ندهد، همان باگ برمی‌گردد و هیچ تستی نمی‌گیردش. دو ماژول درست،
  # و اتصالشان غلط: همان الگویی که در این پروژه بارها تکرار شده.
  def test_scanner_passes_the_full_transform_to_machining
    hole = ->(y_mm, z_mm) {
      arc = Sketchup::ArcCurve.new(Geom::Point3d.new(0, y_mm / MM, z_mm / MM), 4 / MM)
      Sketchup::Face.new([Sketchup::Loop.new(
        edges: Array.new(12) { Sketchup::Edge.new(arc) }, outer: false
      )])
    }
    outline = Sketchup::Face.new([Sketchup::Loop.new(
      edges: Array.new(4) { Sketchup::Edge.new(nil) }, outer: true,
      vertices: [[0, 0, 0], [16, 550, 0], [16, 550, 720], [0, 0, 720]].map { |c|
        Sketchup::Vertex.new(Geom::Point3d.new(c[0] / MM, c[1] / MM, c[2] / MM))
      }
    )])

    def_ = Sketchup::ComponentDefinition.new([outline, hole.call(100, 200)])
    make = lambda { |tr|
      leaf = Sketchup::Group.new(
        name: 'دیواره', definition: def_, transformation: tr,
        bounds: Geom::BoundingBox.new(Geom::Point3d.new(0, 0, 0),
                                      Geom::Point3d.new(16 / MM, 550 / MM, 720 / MM))
      )
      # حجم کمتر از جعبهٔ محیطی → machined روشن → سوراخ‌ها خوانده می‌شوند.
      # (volume=0 کافی نبود: آن مسیر به شمار وجه‌ها می‌افتد و این قطعه فقط دو
      # وجه دارد.)
      def leaf.volume = (16 * 550 * 720 * 0.5) / (25.4**3)
      Sketchup::Group.new(name: 'کابینت',
                          definition: Sketchup::ComponentDefinition.new([leaf]))
    }

    plain = R.boxes_of(make.call(Geom::Transformation.new))['boxes'].first
    mirrored = R.boxes_of(make.call(Geom::Transformation.mirror(:y, 275 / MM)))['boxes'].first

    assert plain['features'], 'سوراخ خوانده می‌شود'
    assert mirrored['features'], 'برای قطعهٔ قرینه هم'
    refute_in_delta plain['features']['holes'][0]['v_mm'],
                    mirrored['features']['holes'][0]['v_mm'], 0.5,
                    'اسکنر باید ماتریس را پاس بدهد، وگرنه دو قطعهٔ قرینه '                     'یک نقشه می‌گیرند و یکی‌شان از سمت غلط سوراخ می‌شود'
  end

  def test_empty_group_still_gives_an_honest_message
    res = R.boxes_of(container('کابینت', []))
    assert_equal 0, res['child_count']
    refute_empty res['note']
  end
end
