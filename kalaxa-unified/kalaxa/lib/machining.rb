# encoding: utf-8
#
# Kalaxa::Machining — خواندن سوراخ و جیب از هندسهٔ داخلی یک قطعه
#
# تا این نسخه فقط می‌فهمیدیم «کار ماشین دارد» (حجم واقعی کمتر از جعبهٔ محیطی).
# برای برگهٔ CNC همین کافی بود که بگوییم «دستی بررسی کن»، ولی نقشهٔ واقعی
# نمی‌شد ساخت. کاربر نقشهٔ CNC خواست؛ نقشه بدون **جای سوراخ** نقشه نیست.
#
# چطور کار می‌کند: یک سوراخ در اسکچاپ یعنی یک **حلقهٔ داخلی** روی یک وجه. اگر
# لبه‌های آن حلقه به یک `ArcCurve` تعلق داشته باشند، دایره است — یعنی سوراخ.
# حلقهٔ داخلیِ غیردایره‌ای، جیب/شیار است.
#
# چیزی که این ماژول **نمی‌گوید** و نباید وانمود کند: نوع ابزار، ترتیب کار، و
# عمق سوراخِ کور وقتی کف آن پیدا نشود. عدد نامعلوم را nil برمی‌گرداند تا نقشه
# بتواند «نامعلوم» بنویسد. نقشه‌ای که عمق را حدس بزند، قطعه را خراب می‌کند.
require 'sketchup.rb'

module Kalaxa
  module Machining
    VERSION = '1.0.0'.freeze
    INCH_TO_MM = 25.4
    # دو دایره با اختلاف مرکز کمتر از این، یک سوراخ‌اند (دو سرِ یک سوراخ سرتاسری).
    SAME_HOLE_TOL_MM = 0.5

    module_function

    def mm(inch) = (inch.to_f * INCH_TO_MM)

    def entities_of(entity)
      if entity.is_a?(Sketchup::ComponentInstance)
        entity.definition.entities
      elsif entity.respond_to?(:entities)
        entity.entities
      end
    end

    # آیا این حلقه دایره است؟ اگر بله، [مرکز, شعاع] وگرنه nil.
    #
    # یک دایرهٔ کامل در اسکچاپ چند لبهٔ مستقیم است که همه به یک ArcCurve تعلق
    # دارند — نه یک موجودیت «دایره». بررسی خودِ لبه‌ها گمراه‌کننده است؛ باید
    # منحنی‌شان را پرسید.
    def circle_of(loop)
      edges = loop.respond_to?(:edges) ? loop.edges : nil
      return nil if edges.nil? || edges.empty?

      curves = edges.map { |e| e.respond_to?(:curve) ? e.curve : nil }
      first = curves.first
      return nil if first.nil?
      return nil unless curves.all? { |c| c.equal?(first) }
      return nil unless first.is_a?(Sketchup::ArcCurve)
      # قوسِ ناقص سوراخ نیست — گوشهٔ گرد یا فرزِ لبه است.
      return nil if first.respond_to?(:is_polygon?) && !full_circle?(first)

      [first.center, mm(first.radius)]
    rescue StandardError
      nil
    end

    def full_circle?(curve)
      return true unless curve.respond_to?(:start_angle) && curve.respond_to?(:end_angle)

      (curve.end_angle - curve.start_angle).abs > (2 * Math::PI - 0.01)
    rescue StandardError
      true
    end

    # محورِ نازکِ یک قطعه و دو محور دیگر — همان قرارداد جدول برش.
    def thin_axis(dx, dy, dz)
      return :x if dx <= dy && dx <= dz
      return :y if dy <= dx && dy <= dz

      :z
    end

    # جعبهٔ محیطیِ قطعه **در دستگاه مختصات خودش** — از روی رئوس همان وجه‌هایی
    # که سوراخ‌ها را از آن‌ها می‌خوانیم.
    #
    # چرا از `box` ورودی استفاده نمی‌کنیم: مختصات جعبه در RawGeometry نسبت به
    # گوشهٔ **کابینت** نرمال شده و به میلی‌متر است، ولی وجه‌های داخل
    # `definition.entities` در دستگاه **محلیِ خودِ قطعه** و به اینچ‌اند. تفریق
    # این دو بی‌معناست و سوراخ را جای پرت می‌اندازد. اندازه‌گیری از روی خودِ
    # رئوس، هم‌دستگاه بودن را تضمین می‌کند — نه اینکه امیدوار باشد.
    # یک نقطه را با ماتریس نمونه به فضای کابینت می‌برد.
    #
    # **چرا لازم است:** وجه‌ها در فضای *تعریفِ* قطعه‌اند. دیوارهٔ چپ و راست در
    # مدل‌های واقعی معمولاً یک تعریف مشترک دارند و تفاوتشان فقط در ماتریس
    # (آینه) است. اگر ماتریس اعمال نشود، هر دو **یک** مختصات سوراخ می‌گیرند و
    # یکی‌شان از سمت غلط سوراخ می‌شود. قطعهٔ چرخیده هم همین‌طور: طول و عرضش با
    # جدول برش نمی‌خواند.
    def apply_tr(point, tr)
      return point if tr.nil?

      point.transform(tr)
    rescue StandardError
      point
    end

    def each_vertex(faces)
      faces.each do |f|
        loops = f.respond_to?(:loops) ? f.loops : []
        loops.each do |lp|
          next unless lp.respond_to?(:vertices)

          lp.vertices.each { |v| yield v.position }
        end
      end
    end

    # مرزهای قطعه **در فضای کابینت** — از روی همان رئوسی که سوراخ‌ها از آن‌ها
    # درمی‌آیند، پس هم‌دستگاه بودن ساختاری است نه امید.
    def local_bounds(faces, tr = nil)
      xs = []
      ys = []
      zs = []
      each_vertex(faces) do |p0|
        p = apply_tr(p0, tr)
        xs << p.x
        ys << p.y
        zs << p.z
      end
      return nil if xs.empty?

      { 'x' => mm(xs.min), 'y' => mm(ys.min), 'z' => mm(zs.min),
        'dx' => mm(xs.max - xs.min), 'dy' => mm(ys.max - ys.min), 'dz' => mm(zs.max - zs.min) }
    end

    # @param entity [Sketchup::Group|ComponentInstance] یک **برگ** (خودِ قطعه)
    # @param box [Hash] جعبهٔ همان قطعه از RawGeometry — فقط وقتی به کار می‌آید
    #   که رئوس در دسترس نباشند (مثلاً دایرهٔ بدون ضلعِ چندضلعی)
    # @return [Hash] { 'holes' => [...], 'pockets' => [...] }
    #   مختصات سوراخ‌ها **روی سطح قطعه** است: u در راستای طول، v در راستای عرض،
    #   از گوشهٔ کمینهٔ خود قطعه — یعنی همان چیزی که روی میز CNC اندازه می‌گیرند.
    def features_of(entity, box, tr = nil)
      ents = entities_of(entity)
      return empty unless ents

      faces = ents.grep(Sketchup::Face)
      return empty if faces.empty?

      box = local_bounds(faces, tr) || box
      dx = box['dx'].to_f
      dy = box['dy'].to_f
      dz = box['dz'].to_f
      t = thin_axis(dx, dy, dz)

      holes = []
      pockets = []
      bottoms = []
      faces.each do |face|
        loops = face.respond_to?(:loops) ? face.loops : []
        loops.each do |lp|
          outer = lp.respond_to?(:outer?) && lp.outer?
          c = circle_of(lp)

          if outer
            # وجهی که خودش یک دیسک است = **کفِ سوراخ کور**. تنها راه دانستن
            # عمقِ کاسهٔ لولا همین است؛ از دهانه چیزی دربارهٔ عمق درنمی‌آید.
            bottoms << hole_record(apply_tr(c[0], tr), c[1], t, box) if c
            next
          end

          if c
            holes << hole_record(apply_tr(c[0], tr), c[1], t, box)
          else
            pockets << pocket_record(lp, t, box, tr)
          end
        end
      end

      merged = merge_through_holes(holes.compact, dx, dy, dz, t)
      { 'holes' => apply_blind_depth(merged, bottoms.compact),
        'pockets' => pockets.compact }
    rescue StandardError
      empty
    end

    def empty = { 'holes' => [], 'pockets' => [] }

    # کدام محور «طول» است و کدام «عرض».
    #
    # جدول برش طول را **بزرگ‌ترین بُعد** می‌گیرد، نه یک محور ثابت. نسخهٔ اول
    # این ماژول u را همیشه روی محور اول می‌گذاشت؛ روی دیواره (۷۲۰ ارتفاع ×
    # ۵۵۰ عمق) این یعنی طول و عرض جا‌به‌جا و سوراخ بیرون از قطعه. باید همان
    # قرارداد جدول برش را داشته باشد وگرنه نقشه با برچسب قطعه نمی‌خواند.
    def uv_axes(t, box)
      pair = case t
             when :x then [[:y, box['dy'].to_f], [:z, box['dz'].to_f]]
             when :y then [[:x, box['dx'].to_f], [:z, box['dz'].to_f]]
             else [[:x, box['dx'].to_f], [:y, box['dy'].to_f]]
             end
      sorted = pair.sort_by { |(_, size)| -size }
      [sorted[0][0], sorted[1][0]]
    end

    # مختصات یک نقطهٔ سه‌بعدی روی سطح قطعه (u, v) و فاصله‌اش از سطح مرجع (w).
    def surface_uvw(point, t, box, axes = nil)
      local = {
        x: mm(point.x) - box['x'].to_f,
        y: mm(point.y) - box['y'].to_f,
        z: mm(point.z) - box['z'].to_f
      }
      u_ax, v_ax = axes || uv_axes(t, box)
      [local[u_ax], local[v_ax], local[t]]
    end

    def hole_record(center, radius_mm, t, box)
      u, v, w = surface_uvw(center, t, box)
      { 'u_mm' => u.round(2), 'v_mm' => v.round(2), 'w_mm' => w.round(2),
        'dia_mm' => (radius_mm * 2).round(2), 'through' => false, 'depth_mm' => nil }
    end

    def pocket_record(loop, t, box, tr = nil)
      pts = loop.respond_to?(:vertices) ? loop.vertices.map(&:position) : nil
      return nil if pts.nil? || pts.empty?

      uvw = pts.map { |p| surface_uvw(apply_tr(p, tr), t, box) }
      us = uvw.map { |a| a[0] }
      vs = uvw.map { |a| a[1] }
      { 'u_mm' => us.min.round(2), 'v_mm' => vs.min.round(2),
        'du_mm' => (us.max - us.min).round(2), 'dv_mm' => (vs.max - vs.min).round(2),
        'w_mm' => uvw.first[2].round(2) }
    rescue StandardError
      nil
    end

    # دو دایره روی دو سطحِ مقابل = **یک** سوراخ سرتاسری، نه دو تا.
    #
    # بدون این، هر سوراخ سرتاسری دو بار در نقشه می‌آمد و اپراتور دو بار
    # سوراخ می‌کرد. عمقِ سوراخ کور هم از فاصلهٔ کف تا سطح درمی‌آید.
    def merge_through_holes(holes, dx, dy, dz, t)
      thickness = case t
                  when :x then dx
                  when :y then dy
                  else dz
                  end

      out = []
      holes.each do |h|
        twin = out.find do |o|
          (o['u_mm'] - h['u_mm']).abs <= SAME_HOLE_TOL_MM &&
            (o['v_mm'] - h['v_mm']).abs <= SAME_HOLE_TOL_MM &&
            (o['dia_mm'] - h['dia_mm']).abs <= SAME_HOLE_TOL_MM
        end
        if twin
          # دو دهانه در دو تراز مختلف → سرتاسری؛ در یک تراز → همان یکی.
          if (twin['w_mm'] - h['w_mm']).abs > SAME_HOLE_TOL_MM
            twin['through'] = true
            twin['depth_mm'] = thickness.round(2)
            twin['w_mm'] = [twin['w_mm'], h['w_mm']].min.round(2)
          end
          next
        end
        out << h
      end

      out
    end

    # عمق سوراخ کور = فاصلهٔ کفش تا دهانه‌اش.
    #
    # سوراخی که کفش پیدا نشد، `depth_mm` تهی می‌ماند و نقشه «نامعلوم»
    # می‌نویسد — بهتر از عددی که ممکن است قطعه را خراب کند.
    def apply_blind_depth(holes, bottoms)
      holes.each do |h|
        next if h['through']

        floor = bottoms.find do |b|
          (b['u_mm'] - h['u_mm']).abs <= SAME_HOLE_TOL_MM &&
            (b['v_mm'] - h['v_mm']).abs <= SAME_HOLE_TOL_MM &&
            (b['dia_mm'] - h['dia_mm']).abs <= SAME_HOLE_TOL_MM
        end
        next unless floor

        d = (floor['w_mm'] - h['w_mm']).abs
        h['depth_mm'] = d.round(2) if d.positive?
      end
      holes
    end
  end
end
