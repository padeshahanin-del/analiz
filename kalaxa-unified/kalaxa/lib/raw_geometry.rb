# encoding: utf-8
#
# Kalaxa::RawGeometry — v1.0.0
#
# استخراج هندسهٔ خامِ یک گروه/کامپوننتِ **ساخته‌شده توسط خود کاربر** (مورد ۱۰).
# تا این نسخه کالاکسا فقط کابینت‌هایی را می‌دید که ابزار خودش ساخته بود (dictionary
# «kalaxa_cabinet»)؛ یعنی مدل‌های واقعی کارگاه اصلاً قابل آنالیز نبودند. این فایل
# مرز نازکِ SketchUp→آنالیز است: فقط جعبهٔ محیطی هر زیرقطعه را به mm بیرون می‌دهد
# و **هیچ تصمیمی دربارهٔ نقش قطعه نمی‌گیرد** — آن کار موتور JS
# (kalaxa-part-classifier.js) است که قابل تست و قابل تنظیم است.
#
# قرارداد محورها با CabinetGeometry یکی است: x=عرض، y=عمق (جلو y=0)، z=ارتفاع.
# مختصات نسبت به گوشهٔ کمینهٔ خودِ کابینت محاسبه می‌شود (محلی، نه جهانی) تا تشخیص
# «چسبیده به لبه» مستقل از جای کابینت در صحنه کار کند.
#
require 'sketchup.rb'
# جای سوراخ‌ها. بدون این require، `defined?(Kalaxa::Machining)` در اسکچاپ
# واقعی تهی می‌ماند و نقشهٔ CNC همیشه خالی می‌آمد — بی‌آنکه هیچ خطایی بدهد.
require_relative 'machining'

module Kalaxa
  module RawGeometry
    VERSION = '1.0.0'.freeze
    INCH_TO_MM = 25.4

    module_function

    def to_mm(inch)
      (inch.to_f * INCH_TO_MM).round(2)
    end

    MAX_DEPTH = 8 # مهار بازگشت — مدل خراب نباید اسکن را قفل کند

    # موجودیت‌های داخلی یک گروه/کامپوننت (یک لایه پایین‌تر).
    def child_containers(entity)
      ents = if entity.is_a?(Sketchup::ComponentInstance)
               entity.definition.entities
             elsif entity.respond_to?(:entities)
               entity.entities
             end
      return [] unless ents

      ents.select do |e|
        (e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)) &&
          !(e.respond_to?(:deleted?) && e.deleted?) &&
          !(e.respond_to?(:hidden?) && e.hidden?)
      end
    end

    # قطعات واقعی = **برگ‌های** درخت، نه اولین لایه.
    #
    # نسخهٔ قبلی فقط یک لایه پایین می‌رفت. در مدل واقعی کاربر، قطعات داخل یک گروه
    # تودرتو بودند و کالاکسا کل آن گروه را **یک قطعهٔ ۵۶۶ میلی‌متری** دید — یعنی
    # خودِ کابینت را به‌جای قطعاتش. پیام «هیچ دیواره‌ای تشخیص داده نشد» هم گمراه
    # می‌کرد: مشکل محورها نبود، اصلاً به قطعات نرسیده بود.
    #
    # تعریف «قطعه»: گروه/کامپوننتی که خودش گروه فرزند ندارد. هر روش چیدمانی که
    # کاربر داشته باشد — تودرتو، تخت، یا ترکیبی — به همان برگ‌ها می‌رسد.
    #
    # **چرا منفجر نمی‌کنیم:** خودِ گروه‌بندی همان چیزی است که مرز یک قطعه را تعریف
    # می‌کند. با explode به‌جای قطعات، وجه و لبهٔ بی‌نام می‌ماند و باید از صفر حدس
    # زد کدام سطح به کدام قطعه تعلق دارد — سخت‌تر، نه ساده‌تر. ضمناً کار پارامتریک
    # کاربر را نابود می‌کند.
    #
    # transformation باید انباشته شود: `bounds` هر موجودیت در فضای مختصات **والدش**
    # بیان می‌شود. برای فرزند مستقیم همان فضای کابینت است، ولی برای قطعهٔ تودرتو
    # باید transformation نیاکانش اعمال شود وگرنه مختصات بی‌معنا می‌شود.
    #
    # @return [Array<Array(entity, Geom::Transformation)>] برگ و ماتریس نیاکانش
    def leaf_solids_with_transform(entity, parent_tr = nil, depth = 0)
      kids = child_containers(entity)
      return [[entity, parent_tr]] if kids.empty? && depth.positive?
      return [] if depth >= MAX_DEPTH

      kids.flat_map do |k|
        # ماتریسِ نیاکانِ فرزند = ماتریس نیاکانِ ما × ماتریس خودمان.
        # (ماتریس خودِ برگ لازم نیست: bounds آن را از قبل در خود دارد.)
        child_parent = if depth.zero?
                         nil
                       elsif parent_tr.nil?
                         entity.transformation
                       else
                         parent_tr * entity.transformation
                       end
        leaf_solids_with_transform(k, child_parent, depth + 1)
      end
    end

    def leaf_solids(entity) = leaf_solids_with_transform(entity).map(&:first)

    # سازگاری عقب‌رو با کدی که نام قبلی را صدا می‌زند.
    def child_solids(entity) = leaf_solids(entity)

    # گوشه‌های جعبهٔ محیطی در فضای کابینت.
    def world_corners(entity, tr)
      bb = entity.bounds
      return [bb.min, bb.max] if tr.nil?

      lo = bb.min
      hi = bb.max
      pts = [
        Geom::Point3d.new(lo.x, lo.y, lo.z), Geom::Point3d.new(hi.x, lo.y, lo.z),
        Geom::Point3d.new(lo.x, hi.y, lo.z), Geom::Point3d.new(lo.x, lo.y, hi.z),
        Geom::Point3d.new(hi.x, hi.y, lo.z), Geom::Point3d.new(hi.x, lo.y, hi.z),
        Geom::Point3d.new(lo.x, hi.y, hi.z), Geom::Point3d.new(hi.x, hi.y, hi.z)
      ].map { |p| p.transform(tr) }
      xs = pts.map(&:x); ys = pts.map(&:y); zs = pts.map(&:z)
      [Geom::Point3d.new(xs.min, ys.min, zs.min), Geom::Point3d.new(xs.max, ys.max, zs.max)]
    end

    # ضخامت/حجمِ برداشته‌شده — نشانهٔ کار ماشین (شیار، فرز، CNC).
    #
    # چرا لازم شد: تا این نسخه فقط **جعبهٔ محیطی** هر قطعه خوانده می‌شد، پس یک
    # تختهٔ شیارخورده و یک تختهٔ ساده از دید کالاکسا کاملاً یکسان بودند و کار ماشین
    # هرگز گزارش نمی‌شد. کاربر گزارش داد «دو قطعه CNC داشت، باید می‌گفت».
    #
    # نمی‌شود از هندسه فهمید **چه** کاری روی قطعه انجام شده — ولی می‌شود فهمید
    # کاری انجام شده: حجم واقعیِ جسم کمتر از حجم جعبهٔ محیطی است. همین برای
    # «به کاربر بگو این قطعه را دستی بررسی کن» کافی است، و صادقانه‌تر از سکوت.
    MACHINED_RATIO = 0.995 # کمتر از این یعنی ماده برداشته شده (رواداری عددی)

    # @return [Hash, nil] { volume_mm3, solid_ratio, face_count, machined }
    #   nil یعنی اسکچاپ نتوانست حجم بدهد (جسم manifold نیست) — که خودش نشانه است.
    def solid_info(entity, bbox_volume_mm3)
      vol_in3 = entity.respond_to?(:volume) ? entity.volume : nil
      faces = if entity.is_a?(Sketchup::ComponentInstance) && entity.definition.respond_to?(:entities)
                entity.definition.entities.grep(Sketchup::Face).length
              elsif entity.respond_to?(:entities)
                entity.entities.grep(Sketchup::Face).length
              end

      return { 'volume_mm3' => nil, 'solid_ratio' => nil, 'face_count' => faces,
               'machined' => faces ? faces > 6 : nil } if vol_in3.nil? || vol_in3 <= 0

      vol_mm3 = vol_in3.to_f * (INCH_TO_MM**3)
      ratio = bbox_volume_mm3.positive? ? vol_mm3 / bbox_volume_mm3 : nil
      { 'volume_mm3' => vol_mm3.round(1),
        'solid_ratio' => ratio&.round(4),
        'face_count' => faces,
        # جعبهٔ ساده ۶ وجه دارد؛ بیشتر یعنی شیار/فرز. حجم کمتر از جعبه هم همین.
        'machined' => (ratio ? ratio < MACHINED_RATIO : false) || (faces ? faces > 6 : false) }
    rescue StandardError
      nil
    end

    # @param cabinet [Sketchup::Group|ComponentInstance] گروهی که کاربر انتخاب کرده
    # @return [Hash] { boxes: [{id,name,x,y,z,dx,dy,dz,...}], child_count:, note: }
    #   مختصات به mm و نسبت به گوشهٔ کمینهٔ همین کابینت.
    def boxes_of(cabinet)
      pairs = leaf_solids_with_transform(cabinet)
      kids = pairs.map(&:first)
      return { 'boxes' => [], 'child_count' => 0,
               'note' => 'این گروه زیرقطعه‌ای ندارد — هر قطعه باید یک گروه/کامپوننت جدا باشد' } if kids.empty?

      # ماتریس **کامل** هر برگ = ماتریس نیاکان × ماتریس خودش. سوراخ‌ها در فضای
      # تعریفِ قطعه‌اند و بدون این، دیوارهٔ چپ و راستِ قرینه (که یک تعریف مشترک
      # دارند) هر دو یک مختصات می‌گیرند.
      full_tr = pairs.map do |(k, tr)|
        own = k.respond_to?(:transformation) ? k.transformation : nil
        next tr if own.nil?
        tr.nil? ? own : tr * own
      end

      raw = pairs.each_with_index.map do |(k, tr), i|
        lo, hi = world_corners(k, tr)
        { 'id' => (k.respond_to?(:persistent_id) ? "pid-#{k.persistent_id}" : "i#{i}"),
          'name' => safe_name(k),
          'x0' => lo.x, 'y0' => lo.y, 'z0' => lo.z,
          'x1' => hi.x, 'y1' => hi.y, 'z1' => hi.z }
      end

      ox = raw.map { |r| r['x0'] }.min
      oy = raw.map { |r| r['y0'] }.min
      oz = raw.map { |r| r['z0'] }.min

      boxes = raw.each_with_index.map do |r, i|
        dx = to_mm(r['x1'] - r['x0'])
        dy = to_mm(r['y1'] - r['y0'])
        dz = to_mm(r['z1'] - r['z0'])
        box = { 'id' => r['id'], 'name' => r['name'],
                'x' => to_mm(r['x0'] - ox), 'y' => to_mm(r['y0'] - oy), 'z' => to_mm(r['z0'] - oz),
                'dx' => dx, 'dy' => dy, 'dz' => dz }
        info = solid_info(kids[i], dx * dy * dz)
        box.merge!(info) if info

        # جای دقیق سوراخ‌ها — همان چیزی که «کار ماشین دارد» را به نقشهٔ
        # قابل‌اجرا تبدیل می‌کند. فقط وقتی خوانده می‌شود که نشانهٔ کار ماشین
        # باشد: روی قطعهٔ ساده هزینهٔ بی‌فایده است.
        if box['machined']
          f = features_safe(kids[i], box, full_tr[i])
          box['features'] = f if f && (f['holes'].any? || f['pockets'].any?)
        end
        box
      end

      machined = boxes.count { |b| b['machined'] }
      note = if machined.positive?
               "#{machined} قطعه کار ماشین دارد (شیار/فرز/CNC) — در جدول علامت خورده‌اند"
             else
               ''
             end
      { 'boxes' => boxes, 'child_count' => kids.length,
        'machined_count' => machined, 'note' => note }
    end

    # خواندن سوراخ‌ها هرگز نباید اسکن را بشکند: قطعه‌ای با هندسهٔ عجیب باید
    # بدون نقشهٔ سوراخ گزارش شود، نه اینکه کل کابینت خوانده نشود.
    def features_safe(entity, box, tr = nil)
      return nil unless defined?(Kalaxa::Machining)

      Kalaxa::Machining.features_of(entity, box, tr)
    rescue StandardError
      nil
    end

    def safe_name(e)
      n = e.respond_to?(:name) ? e.name.to_s : ''
      return n unless n.empty?
      if e.is_a?(Sketchup::ComponentInstance) && e.definition.respond_to?(:name)
        e.definition.name.to_s
      else
        ''
      end
    end
  end
end
