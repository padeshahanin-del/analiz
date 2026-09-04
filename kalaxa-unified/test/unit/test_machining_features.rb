# encoding: utf-8
# frozen_string_literal: true

# خواندن جای سوراخ‌ها — اجرا: ruby test/unit/test_machining_features.rb
#
# تا نسخهٔ ۳.۴۱ فقط می‌فهمیدیم «کار ماشین دارد». برای گفتنِ «دستی بررسی کن»
# کافی بود، ولی کاربر **نقشهٔ CNC** خواست و نقشه بدون جای سوراخ نقشه نیست.
#
# قید اخلاقی این ماژول: عددی که واقعاً معلوم نیست باید تهی بماند. نقشه‌ای که
# عمق سوراخ را حدس بزند، قطعه را خراب می‌کند — بدتر از نبودِ نقشه.
require 'minitest/autorun'
require 'tmpdir'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
$LOAD_PATH.unshift(File.expand_path('../stubs', __dir__))
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-mach')
ENV['KALAXA_QUIET'] = '1'

require 'su_double'
require File.join(SRC, 'lib', 'machining')

# --- بدل‌های هندسهٔ اسکچاپ ---
# در اسکچاپ واقعی یک دایره چند **لبهٔ مستقیم** است که همه به یک ArcCurve تعلق
# دارند؛ «دایره» موجودیت مستقلی نیست. اگر بدل این را ساده می‌کرد، تست چیزی را
# می‌سنجید که در اسکچاپ وجود ندارد.
module Sketchup
  class Face
    attr_reader :loops
    def initialize(loops) = @loops = loops
  end

  class ArcCurve
    attr_reader :center, :radius, :start_angle, :end_angle
    def initialize(center, radius_in, full: true)
      @center = center
      @radius = radius_in
      @start_angle = 0.0
      @end_angle = full ? 2 * Math::PI : Math::PI / 2
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

class TestMachiningFeatures < Minitest::Test
  M = Kalaxa::Machining
  MM = 25.4

  def pt(x_mm, y_mm, z_mm)
    Geom::Point3d.new(x_mm / MM, y_mm / MM, z_mm / MM)
  end

  # حلقهٔ دایره‌ای: چند لبه که همه یک ArcCurve مشترک دارند
  def circle_loop(center, dia_mm, outer: false, full: true)
    arc = Sketchup::ArcCurve.new(center, (dia_mm / 2.0) / MM, full: full)
    Sketchup::Loop.new(edges: Array.new(12) { Sketchup::Edge.new(arc) }, outer: outer)
  end

  def rect_loop(pts, outer: false)
    Sketchup::Loop.new(edges: Array.new(4) { Sketchup::Edge.new(nil) }, outer: outer,
                       vertices: pts.map { |p| Sketchup::Vertex.new(p) })
  end

  # خطِ دور قطعه — همان چیزی که در اسکچاپ واقعی همیشه هست و مرزهای محلی قطعه
  # از روی آن خوانده می‌شود.
  def outline(x, y, z, dx, dy, dz)
    Sketchup::Face.new([rect_loop(
      [pt(x, y, z), pt(x + dx, y + dy, z),
       pt(x + dx, y + dy, z + dz), pt(x, y, z + dz)], outer: true
    )])
  end

  def part(faces)
    Sketchup::Group.new(definition: Sketchup::ComponentDefinition.new(faces))
  end

  # دیوارهٔ ۷۲۰×۵۵۰ با ضخامت ۱۶ در محور x
  def side_box = { 'x' => 0, 'y' => 0, 'z' => 0, 'dx' => 16, 'dy' => 550, 'dz' => 720 }

  # ---------- سوراخ سرتاسری ----------

  def test_through_hole_is_found_once_not_twice
    # دو دهانه در دو طرف قطعه = **یک** سوراخ. اگر دو تا شمرده شود، اپراتور
    # دو بار سوراخ می‌کند.
    faces = [
      Sketchup::Face.new([circle_loop(pt(0, 100, 200), 8, outer: false)]),
      Sketchup::Face.new([circle_loop(pt(16, 100, 200), 8, outer: false)])
    ]
    holes = M.features_of(part(faces), side_box)['holes']

    assert_equal 1, holes.length, 'دو دهانهٔ یک سوراخ نباید دو ردیف شود'
    assert holes.first['through'], 'باید سرتاسری علامت بخورد'
    assert_in_delta 16, holes.first['depth_mm'], 0.01, 'عمق = ضخامت قطعه'
  end

  # u = در راستای **طول** قطعه، v = در راستای **عرض** — دقیقاً همان قرارداد
  # جدول برش، که طول را بزرگ‌ترین بُعد می‌گیرد.
  #
  # نسخهٔ اول u را روی یک محور ثابت گذاشته بود. روی دیواره (۷۲۰ ارتفاع × ۵۵۰
  # عمق) این یعنی طول و عرض جا‌به‌جا، و سوراخ در نقشه بیرون از قطعه می‌افتاد.
  # تست قرارداد JS همین را گرفت.
  def test_hole_position_follows_the_cut_list_convention
    faces = [Sketchup::Face.new([circle_loop(pt(0, 100, 200), 8)])]
    h = M.features_of(part(faces), side_box)['holes'].first

    assert_in_delta 200, h['u_mm'], 0.01, 'u روی محور بلندتر (ارتفاع ۷۲۰)'
    assert_in_delta 100, h['v_mm'], 0.01, 'v روی محور کوتاه‌تر (عمق ۵۵۰)'
    assert_in_delta 8, h['dia_mm'], 0.01
  end

  def test_uv_axes_pick_the_longer_side_as_length
    # کف کابینت: ۸۶۸ طول × ۵۵۰ عمق، نازک در z
    assert_equal %i[x y], M.uv_axes(:z, { 'dx' => 868, 'dy' => 550, 'dz' => 16 })
    # ولی اگر عمق بیشتر از عرض باشد، جای‌شان عوض می‌شود
    assert_equal %i[y x], M.uv_axes(:z, { 'dx' => 400, 'dy' => 900, 'dz' => 16 })
  end

  def test_offset_part_still_reports_local_coordinates
    # قطعه‌ای که در کابینت جابه‌جا شده؛ نقشهٔ CNC باید از گوشهٔ **خودِ قطعه**
    # اندازه بدهد، نه از گوشهٔ کابینت.
    box = { 'x' => 884, 'y' => 0, 'z' => 0, 'dx' => 16, 'dy' => 550, 'dz' => 720 }
    faces = [outline(884, 0, 0, 16, 550, 720),
             Sketchup::Face.new([circle_loop(pt(884, 100, 200), 8)])]
    h = M.features_of(part(faces), box)['holes'].first

    assert_in_delta 200, h['u_mm'], 0.01
    assert_in_delta 100, h['v_mm'], 0.01
  end

  # این باگ واقعی بود و فیکسچرِ دست‌ساز پنهانش کرده بود: من هر دو طرف را
  # هم‌دستگاه ساخته بودم، پس تست سبز بود.
  #
  # در اسکچاپ واقعی وجه‌های داخل `definition.entities` در دستگاه **محلیِ خودِ
  # قطعه** و به اینچ‌اند، ولی `box` در RawGeometry نسبت به گوشهٔ **کابینت**
  # نرمال شده و به میلی‌متر است. تفریق این دو بی‌معناست و سوراخ جای پرت
  # می‌افتد — بدون هیچ خطایی.
  def test_hole_position_ignores_the_cabinet_frame_entirely
    # هندسهٔ قطعه از مبدأ محلی شروع می‌شود...
    faces = [outline(0, 0, 0, 16, 550, 720),
             Sketchup::Face.new([circle_loop(pt(0, 100, 200), 8)])]

    # ...ولی جعبه می‌گوید قطعه در x=884 کابینت است. نقشه نباید تکان بخورد.
    far = M.features_of(part(faces), { 'x' => 884, 'y' => 300, 'z' => 500,
                                       'dx' => 16, 'dy' => 550, 'dz' => 720 })
    near = M.features_of(part(faces), { 'x' => 0, 'y' => 0, 'z' => 0,
                                        'dx' => 16, 'dy' => 550, 'dz' => 720 })

    assert_equal near['holes'], far['holes'],
                 'جای قطعه در کابینت نباید نقشهٔ CNC آن را عوض کند'
    assert_in_delta 200, far['holes'].first['u_mm'], 0.01
    assert_in_delta 100, far['holes'].first['v_mm'], 0.01
  end

  def test_local_bounds_come_from_the_faces_not_from_the_caller
    faces = [outline(0, 0, 0, 16, 550, 720)]
    b = M.local_bounds(faces)

    assert_in_delta 16, b['dx'], 0.01
    assert_in_delta 550, b['dy'], 0.01
    assert_in_delta 720, b['dz'], 0.01
  end

  # ---------- کاسهٔ لولا (سوراخ کور) ----------

  def test_blind_hole_depth_comes_from_its_floor
    # کاسهٔ لولای ۳۵ میلی با عمق ۱۲ — رایج‌ترین کار CNC کابینت.
    faces = [
      Sketchup::Face.new([circle_loop(pt(0, 100, 200), 35)]),          # دهانه
      Sketchup::Face.new([circle_loop(pt(12, 100, 200), 35, outer: true)]) # کف
    ]
    h = M.features_of(part(faces), side_box)['holes'].first

    refute h['through'], 'کاسهٔ لولا سرتاسری نیست'
    assert_in_delta 12, h['depth_mm'], 0.01, 'عمق از کفِ سوراخ درمی‌آید'
    assert_in_delta 35, h['dia_mm'], 0.01
  end

  def test_blind_hole_without_a_visible_floor_reports_unknown_depth
    faces = [Sketchup::Face.new([circle_loop(pt(0, 100, 200), 35)])]
    h = M.features_of(part(faces), side_box)['holes'].first

    assert_nil h['depth_mm'],
               'عمق نامعلوم باید تهی بماند — عددِ حدسی قطعه را خراب می‌کند'
    assert_in_delta 35, h['dia_mm'], 0.01, 'ولی قطر که معلوم است گفته می‌شود'
  end

  # ---------- چه چیزی سوراخ نیست ----------

  def test_rounded_corner_is_not_a_hole
    # قوسِ ناقص = گوشهٔ گرد یا فرز لبه، نه سوراخ
    faces = [Sketchup::Face.new([circle_loop(pt(0, 10, 10), 20, full: false)])]
    assert_empty M.features_of(part(faces), side_box)['holes']
  end

  def test_outer_outline_of_the_panel_is_not_a_hole
    outline = rect_loop([pt(0, 0, 0), pt(0, 550, 0), pt(0, 550, 720), pt(0, 0, 720)], outer: true)
    faces = [Sketchup::Face.new([outline])]
    f = M.features_of(part(faces), side_box)
    assert_empty f['holes']
    assert_empty f['pockets'], 'خطِ دور قطعه جیب نیست'
  end

  def test_two_different_holes_are_both_reported
    faces = [Sketchup::Face.new([circle_loop(pt(0, 100, 200), 8),
                                 circle_loop(pt(0, 100, 500), 8)])]
    assert_equal 2, M.features_of(part(faces), side_box)['holes'].length,
                 'دو سوراخ در دو جا دو ردیف‌اند'
  end

  def test_same_position_different_diameter_are_different_holes
    faces = [Sketchup::Face.new([circle_loop(pt(0, 100, 200), 8),
                                 circle_loop(pt(16, 100, 200), 35)])]
    assert_equal 2, M.features_of(part(faces), side_box)['holes'].length,
                 'قطر متفاوت یعنی دو کار متفاوت، حتی روی یک محور'
  end

  # ---------- جیب/شیار ----------

  def test_rectangular_pocket_is_reported_with_its_size
    pocket = rect_loop([pt(0, 50, 60), pt(0, 250, 60), pt(0, 250, 120), pt(0, 50, 120)])
    # خطِ دور قطعه لازم است: مرزهای محلی از روی رئوس خوانده می‌شود، و بدون آن
    # مبدأ روی گوشهٔ خودِ شیار می‌افتد نه گوشهٔ تخته.
    faces = [outline(0, 0, 0, 16, 550, 720), Sketchup::Face.new([pocket])]
    p = M.features_of(part(faces), side_box)['pockets'].first

    # روی دیواره طول = ارتفاع (۷۲۰)، پس u از z می‌آید و v از y.
    assert_in_delta 60, p['u_mm'], 0.01
    assert_in_delta 50, p['v_mm'], 0.01
    assert_in_delta 60, p['du_mm'], 0.01
    assert_in_delta 200, p['dv_mm'], 0.01
  end

  # ---------- مقاومت ----------

  def test_broken_geometry_returns_empty_instead_of_crashing
    broken = Object.new
    assert_equal M.empty, M.features_of(broken, side_box),
                 'قطعهٔ عجیب نباید کل اسکن را بشکند'
  end

  def test_part_with_no_faces_is_not_an_error
    assert_equal M.empty, M.features_of(part([]), side_box)
  end

  # ---------- محور نازک ----------

  # ---------- ماتریس نمونه: قطعهٔ قرینه ----------

  # **باگی که کاربر دید: «سوراخ‌ها جای غلط می‌افتند».**
  #
  # وجه‌ها در فضای *تعریفِ* قطعه‌اند. در مدل‌های واقعی دیوارهٔ چپ و راست یک
  # تعریف مشترک دارند و تفاوتشان فقط ماتریس آینه است. نسخهٔ قبلی ماتریس را
  # نادیده می‌گرفت، پس هر دو **یک** مختصات می‌گرفتند و دیوارهٔ راست از سمت
  # غلط سوراخ می‌شد — بدون هیچ خطایی.
  def test_mirrored_instance_gets_mirrored_hole_position
    faces = [outline(0, 0, 0, 16, 550, 720),
             Sketchup::Face.new([circle_loop(pt(0, 100, 200), 8)])]

    plain = M.features_of(part(faces), side_box).dig('holes', 0)
    # آینه حول صفحهٔ y=275 (وسط عمق قطعه)
    mirrored = M.features_of(part(faces), side_box,
                             Geom::Transformation.mirror(:y, 275 / MM)).dig('holes', 0)

    assert_in_delta 100, plain['v_mm'], 0.01, 'قطعهٔ عادی: ۱۰۰ از لبه'
    assert_in_delta 450, mirrored['v_mm'], 0.01,
                    'قطعهٔ قرینه: ۴۵۰ از همان لبه — نه همان ۱۰۰'
    refute_in_delta plain['v_mm'], mirrored['v_mm'], 0.5,
                    'دو نقشه باید فرق کنند، وگرنه یکی از دو قطعه خراب می‌شود'
  end

  def test_translated_instance_keeps_local_coordinates
    # جابه‌جایی ساده نباید نقشه را تکان دهد: اندازه از گوشهٔ **خودِ قطعه** است.
    faces = [outline(0, 0, 0, 16, 550, 720),
             Sketchup::Face.new([circle_loop(pt(0, 100, 200), 8)])]
    moved = M.features_of(part(faces), side_box,
                          Geom::Transformation.new(884 / MM, 0, 0)).dig('holes', 0)
    plain = M.features_of(part(faces), side_box).dig('holes', 0)

    assert_in_delta plain['u_mm'], moved['u_mm'], 0.01
    assert_in_delta plain['v_mm'], moved['v_mm'], 0.01
  end

  def test_thin_axis_matches_the_cut_list_convention
    assert_equal :x, M.thin_axis(16, 550, 720)
    assert_equal :y, M.thin_axis(900, 18, 720)
    assert_equal :z, M.thin_axis(868, 550, 16)
  end
end
