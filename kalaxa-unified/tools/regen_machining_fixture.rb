# encoding: utf-8
# frozen_string_literal: true

# فیکسچر نقشهٔ CNC را از اجرای **واقعی** Kalaxa::Machining می‌سازد.
# اجرا: ruby tools/regen_machining_fixture.rb
#
# چرا دست‌نویس نه: تست JS باید همان چیزی را بخواند که روبی واقعاً می‌نویسد.
# فیکسچر دست‌نویس یعنی دو طرف هرگز هم را نمی‌بینند و هر دو سبز می‌مانند —
# همان الگویی که در این پروژه بارها باگ ساخته.
require 'json'
require 'tmpdir'

ROOT = File.expand_path('..', __dir__)
$LOAD_PATH.unshift(File.join(ROOT, 'test', 'stubs'))
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-fix')
ENV['KALAXA_QUIET'] = '1'

require 'su_double'
require File.join(ROOT, 'kalaxa', 'lib', 'machining')

# بدل‌های هندسه — عین همان‌هایی که test_machining_features.rb استفاده می‌کند.
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

MM = 25.4

def pt(x, y, z) = Geom::Point3d.new(x / MM, y / MM, z / MM)

def circle_loop(center, dia, outer: false, full: true)
  arc = Sketchup::ArcCurve.new(center, (dia / 2.0) / MM, full: full)
  Sketchup::Loop.new(edges: Array.new(12) { Sketchup::Edge.new(arc) }, outer: outer)
end

def rect_loop(pts, outer: false)
  Sketchup::Loop.new(edges: Array.new(4) { Sketchup::Edge.new(nil) }, outer: outer,
                     vertices: pts.map { |p| Sketchup::Vertex.new(p) })
end

def part(faces) = Sketchup::Group.new(definition: Sketchup::ComponentDefinition.new(faces))

# خطِ دور قطعه — در اسکچاپ واقعی همیشه هست، و مرزهای محلی قطعه از روی رئوس
# همین وجه خوانده می‌شود. بدون آن، فیکسچر قطعه‌ای می‌ساخت که در مدل وجود ندارد.
def outline(x, y, z, dx, dy, dz)
  Sketchup::Face.new([rect_loop(
    [pt(x, y, z), pt(x + dx, y + dy, z),
     pt(x + dx, y + dy, z + dz), pt(x, y, z + dz)], outer: true
  )])
end

def box(x, y, z, dx, dy, dz)
  { 'x' => x, 'y' => y, 'z' => z, 'dx' => dx, 'dy' => dy, 'dz' => dz }
end

# جعبه‌ای که RawGeometry می‌سازد + features واقعی از Machining
def scanned(name, bx, faces, extra = {})
  f = Kalaxa::Machining.features_of(part(faces), bx)
  bx.merge('id' => name, 'name' => name, 'machined' => true,
           'solid_ratio' => 0.97, 'face_count' => faces.length + 6,
           'features' => f).merge(extra)
end

out = {}

# ---- دیوارهٔ چپ: دو کاسهٔ لولای ۳۵ (کور، عمق ۱۲) + یک سوراخ سرتاسری ۸ ----
out['side_with_hinges'] = scanned('دیواره چپ [side]', box(0, 0, 0, 16, 550, 720), [
  outline(0, 0, 0, 16, 550, 720),
  Sketchup::Face.new([circle_loop(pt(0, 100, 100), 35)]),
  Sketchup::Face.new([circle_loop(pt(12, 100, 100), 35, outer: true)]),
  Sketchup::Face.new([circle_loop(pt(0, 100, 620), 35)]),
  Sketchup::Face.new([circle_loop(pt(12, 100, 620), 35, outer: true)]),
  Sketchup::Face.new([circle_loop(pt(0, 300, 360), 8)]),
  Sketchup::Face.new([circle_loop(pt(16, 300, 360), 8)])
])

# ---- دیوارهٔ راست: **همان تعریفِ چپ** با ماتریس آینه ----
#
# این همان چیزی است که در مدل واقعی رخ می‌دهد و باگ «سوراخ از سمت غلط» را
# ساخت: هندسه یکی است، تفاوت فقط در ماتریس نمونه. فیکسچر قبلی دو هندسهٔ جدا
# می‌ساخت و همین حالت را اصلاً نمی‌آزمود.
mirror = Geom::Transformation.mirror(:y, 275 / MM)
out['side_mirrored'] = begin
  faces = [outline(0, 0, 0, 16, 550, 720),
           Sketchup::Face.new([circle_loop(pt(0, 100, 100), 35)]),
           Sketchup::Face.new([circle_loop(pt(12, 100, 100), 35, outer: true)])]
  bx = box(884, 0, 0, 16, 550, 720)
  f = Kalaxa::Machining.features_of(part(faces), bx, mirror)
  bx.merge('id' => 'دیواره راست [side]', 'name' => 'دیواره راست [side]',
           'machined' => true, 'solid_ratio' => 0.97, 'face_count' => 9, 'features' => f)
end

# ---- سوراخ کور بدون کف: عمق نامعلوم ----
out['unknown_depth'] = scanned('طبقه [shelf]', box(0, 0, 0, 868, 550, 16), [
  outline(0, 0, 0, 868, 550, 16),
  Sketchup::Face.new([circle_loop(pt(50, 30, 16), 5)])
])

# ---- شیار پشت‌بند ----
out['grooved_back'] = scanned('پشت‌بند [back]', box(0, 0, 0, 868, 16, 688), [
  outline(0, 0, 0, 868, 16, 688),
  Sketchup::Face.new([rect_loop([pt(30, 0, 30), pt(830, 0, 30),
                                 pt(830, 0, 42), pt(30, 0, 42)])])
])

# ---- قطعه‌ای که کار ماشین دارد ولی هندسه‌اش خوانده نشد (حالت واقعی) ----
out['machined_no_features'] = box(0, 0, 0, 700, 500, 16).merge(
  'id' => 'بی‌هندسه', 'name' => 'قطعه فرزخورده', 'machined' => true,
  'solid_ratio' => 0.9, 'face_count' => 20
)

path = File.join(ROOT, 'kalaxa', 'dev', 'fixtures', 'machining_features.json')
File.binwrite(path, JSON.pretty_generate(out) + "\n")
puts "نوشته شد: #{path}"
out.each do |k, v|
  f = v['features'] || {}
  puts "  #{k}: #{(f['holes'] || []).length} سوراخ، #{(f['pockets'] || []).length} شیار"
end
