# encoding: utf-8
#
# Kalaxa::UnitSections — موتور بخش‌بندی یونیت (کمد، کتابخانه، کابینت)
#
# کاربر موتور ساخت **کمد و کتابخانه** خواست، مثل نمونهٔ اسکریپت مکس.
#
# راه ساده این بود که دو تمپلیت دیگر دستی اضافه شود. ولی کمد و کتابخانه با
# کابینت آشپزخانه فرق ماهوی ندارند — همه یک بدنه‌اند با تقسیمات داخلی. چیزی
# که واقعاً کم داریم **تقسیم‌بندی** است:
#
#   - بدنه به چند **دهانه** (بای) عمودی تقسیم می‌شود، با جداکنندهٔ میانی.
#   - هر دهانه پُر می‌شود: طبقه، میلهٔ رگال، کشو، یا خالی.
#
# با همین دو مفهوم، کمد دو‌درب با رگال و کتابخانهٔ باز و کابینت قدی، همه یک
# چیزند با پارامتر متفاوت. اضافه‌کردن نوع تازه یعنی یک ردیف داده، نه یک شاخهٔ
# `case` تازه در دو فایل.
#
# **چرا این ماژول جداست:** جای این محاسبه یک‌جاست و هم `CabinetBuilder` (لیست
# برش) و هم `CabinetGeometry` (مدل سه‌بعدی) از همین می‌خوانند. تاریخ این پروژه
# پر از باگ‌هایی است که از دو محاسبهٔ موازی درآمده‌اند: قید بالا، جعبهٔ کشو،
# کلید قطعات گوشه. این‌بار واگرایی **ممکن** نیست، نه اینکه فقط تست بگیردش.
require_relative 'catalog'

module Kalaxa
  module UnitSections
    VERSION = '1.0.0'.freeze

    # فاصلهٔ جمع‌شدن طبقه از عمق و طول — همان اعداد CabinetBuilder.
    SHELF_SHRINK_LEN_MM = 2
    SHELF_SHRINK_DEP_MM = 20

    # میلهٔ رگال کمد: قطر و فاصله از سقف دهانه.
    # کمینهٔ عرض دهانهٔ قابل استفاده. کمتر از این، نه طبقه جا می‌شود نه دست.
    MIN_BAY_MM = 150

    # درب ریلی: دو لنگه روی هم می‌لغزند، پس هرکدام از نصفِ عرض **پهن‌تر**
    # است — وگرنه وسط کمد شکاف می‌ماند. این عدد همان هم‌پوشانی است.
    SLIDING_OVERLAP_MM = 30
    # فضای ریل بالا و پایین. درب ریلی تمام‌ارتفاع نیست.
    SLIDING_TRACK_MM = 40

    RAIL_DIA_MM = 25
    RAIL_DROP_MM = 60

    module_function

    # مرزهای دهانه‌ها روی محور عرض.
    #
    # @param width_mm [Numeric] عرض بیرونی یونیت
    # @param body_mm [Numeric] ضخامت بدنه
    # @param bays [Integer] تعداد دهانه (۱ = بدون جداکنندهٔ میانی)
    # @return [Array<Hash>] هر دهانه: { x:, w: } — مختصات داخلی، بدون بدنه
    def bay_spans(width_mm, body_mm, bays)
      n = bays.to_i
      n = 1 if n < 1
      inner = width_mm - 2 * body_mm
      # هر جداکننده یک ضخامت بدنه می‌خورد.
      dividers = n - 1
      usable = inner - dividers * body_mm
      # دهانهٔ منفی یعنی عرض برای این تعداد تقسیم کافی نیست — سکوت این‌جا
      # قطعاتی با ابعاد منفی می‌سازد.
      return [] if usable <= 0

      each = usable.to_f / n
      # دهانهٔ ۵ میلی‌متری «مثبت» است ولی دهانه نیست: نه طبقه‌ای در آن جا
      # می‌شود نه دستی داخلش می‌رود. همان درسِ کابینت گوشه — عددِ مثبت کافی
      # نیست، باید **قابل استفاده** باشد.
      return [] if each < MIN_BAY_MM

      (0...n).map do |i|
        { 'index' => i, 'x' => body_mm + i * (each + body_mm), 'w' => each }
      end
    end

    # تعداد جداکنندهٔ میانی
    def divider_count(bays)
      n = bays.to_i
      n < 2 ? 0 : n - 1
    end

    # ترازِ طبقه‌ها در یک دهانه.
    #
    # طبقه‌ها **بین** کف و سقف پخش می‌شوند، نه از صفر: طبقه‌ای که روی کف
    # بنشیند طبقه نیست، کف است.
    #
    # اگر `custom` داده شود، همان ارتفاع‌ها استفاده می‌شوند — کارگاه گاهی
    # ارتفاع آزاد می‌خواهد (طبقهٔ کفش پایین کوتاه، طبقهٔ چمدان بالا بلند).
    # ارتفاع بیرون از بدنه بی‌صدا رد نمی‌شود؛ نادیده گرفتنش یعنی طبقه‌ای
    # بریده شود که جایی برایش نیست.
    #
    # @return [Array<Numeric>] ارتفاع مرکز هر طبقه از کف یونیت
    def shelf_levels(height_mm, body_mm, count, custom = nil)
      inner = height_mm - 2 * body_mm
      return [] if inner <= 0

      if custom && !Array(custom).empty?
        return Array(custom).map(&:to_f)
                            .select { |z| z > body_mm && z < height_mm - body_mm }
                            .sort
      end

      n = count.to_i
      return [] if n < 1

      even = (1..n).map { |i| body_mm + i * inner.to_f / (n + 1) }
      snap_to_pin_grid(even, height_mm, body_mm)
    end

    # طبقهٔ متحرک را روی شبکهٔ سوراخِ پین می‌نشاند (سیستم ۳۲).
    #
    # بدون این، تقسیم مساوی ارتفاع تقریباً هرگز مضرب گام درنمی‌آید — طبقهٔ
    # کتابخانهٔ ۲۲۰ در ۴۴۱٫۶ می‌افتد و نزدیک‌ترین سوراخ ۴۴۸ است. یعنی یا
    # طبقه لق روی پین می‌نشیند یا کارگاه سوراخ اضافه می‌زند. جابه‌جایی
    # حداکثر نصفِ گام (۱۶ میلی‌متر) است — چشم نمی‌بیند، ولی طبقه سفت
    # می‌نشیند.
    #
    # **پینِ زیرِ طبقه** ملاک است نه مرکزش: طبقه روی پین می‌نشیند، پس
    # `z - body/2` باید مضرب گام باشد، نه خودِ z.
    #
    # ارتفاع دستیِ کاربر هرگز جابه‌جا نمی‌شود؛ آن تصمیم اوست نه ما.
    def snap_to_pin_grid(levels, height_mm, body_mm)
      p = pin_params
      pitch = p['pitch_mm'].to_f
      return levels unless pitch > 0 && p['snap_shelves'] != false

      lo = p['end_clearance_mm'].to_f
      hi = height_mm - body_mm - p['end_clearance_mm'].to_f
      used = []
      levels.map do |z|
        bottom = z - body_mm / 2.0
        snapped = (bottom / pitch).round * pitch
        snapped = (lo / pitch).ceil * pitch if snapped < lo
        snapped = (hi / pitch).floor * pitch if snapped > hi
        # دو طبقه روی یک سوراخ یعنی یکی‌شان ناپدید شود.
        snapped += pitch while used.include?(snapped) && snapped + pitch <= hi
        snapped -= pitch while used.include?(snapped) && snapped - pitch >= lo
        return levels if used.include?(snapped) # جا نشد؛ دست نمی‌زنیم

        used << snapped
        snapped + body_mm / 2.0
      end
    end

    # عمداً هیچ rescue ندارد. نسخهٔ اول این‌جا `rescue StandardError` داشت و
    # وقتی متدِ کاتالوگ را اشتباه صدا زدم، خطا را بی‌صدا خورد و چسبیدن به
    # شبکه **خاموش** ماند در حالی که همهٔ تست‌ها سبز بودند. اگر کاتالوگ
    # نباشد باید سر و صدا کند.
    def pin_params
      Kalaxa::Catalog.pin_system
    end

    # ابعاد لنگهٔ درب.
    #
    # لولایی: لنگه‌ها کنار هم، با درز بینشان.
    # ریلی: لنگه‌ها **روی هم** می‌لغزند، پس هرکدام پهن‌تر از نصف است و
    # ارتفاعش کمتر (ریل بالا و پایین جا می‌گیرد).
    #
    # @return [Hash] { w:, h:, mode: }
    def door_leaf(width_mm, height_mm, doors, gap_mm, mode = 'hinged')
      n = doors.to_i
      return nil if n < 1

      if mode.to_s == 'sliding'
        # دو لنگه: هرکدام نصف + هم‌پوشانی. سه لنگه هم همین منطق.
        w = (width_mm + (n - 1) * SLIDING_OVERLAP_MM) / n.to_f
        { 'w' => w, 'h' => height_mm - SLIDING_TRACK_MM, 'mode' => 'sliding' }
      else
        total = width_mm - gap_mm - (n - 1) * gap_mm
        { 'w' => total / n.to_f, 'h' => height_mm - gap_mm, 'mode' => 'hinged' }
      end
    end

    # ابعاد یک طبقه در دهانه‌ای به عرض `bay_w`
    def shelf_size(bay_w, depth_mm)
      { 'len' => bay_w - SHELF_SHRINK_LEN_MM, 'dep' => depth_mm - SHELF_SHRINK_DEP_MM }
    end

    # میلهٔ رگال: فقط در دهانه‌هایی که `hanging` دارند.
    # @return [Hash, nil] { x:, y:, z:, len: } — nil یعنی این دهانه رگال ندارد
    def rail_of(bay, height_mm, depth_mm, body_mm, hanging)
      return nil unless hanging

      { 'x' => bay['x'], 'len' => bay['w'],
        'y' => depth_mm / 2.0,
        'z' => height_mm - body_mm - RAIL_DROP_MM,
        'dia' => RAIL_DIA_MM }
    end

    # ---------------------------------------------------------------
    # نقشهٔ کامل یک یونیت: همان چیزی که هر دو مصرف‌کننده می‌خوانند.
    #
    # @param spec [Hash] { bays:, shelves_per_bay:, hanging_bays: [index...],
    #                      doors:, has_back: }
    # @return [Hash] { bays:, dividers:, shelves: [...], rails: [...] }
    def layout(width_mm, height_mm, depth_mm, body_mm, spec = {})
      bays = bay_spans(width_mm, body_mm, spec['bays'] || spec[:bays] || 1)
      if bays.empty?
        return { 'bays' => [], 'dividers' => 0, 'shelves' => [], 'rails' => [], 'drawers' => [] }
      end

      per_bay = (spec['shelves_per_bay'] || spec[:shelves_per_bay] || 0).to_i
      hanging = Array(spec['hanging_bays'] || spec[:hanging_bays] || [])

      # پُرکردنِ هر دهانه می‌تواند جداگانه داده شود. اگر نه، همان قاعدهٔ کلی.
      fills = Array(spec['bay_fills'] || spec[:bay_fills] || [])
      custom_z = spec['shelf_heights_mm'] || spec[:shelf_heights_mm]
      drawers_per_bay = (spec['drawers_per_bay'] || spec[:drawers_per_bay] || 0).to_i

      shelves = []
      rails = []
      drawers = []
      bays.each do |bay|
        fill = fills[bay['index']] || {}
        kind = (fill['type'] || fill[:type] ||
                (hanging.include?(bay['index']) ? 'hanging' : 'shelves')).to_s
        n_shelf = (fill['shelves'] || fill[:shelves] || per_bay).to_i
        n_drawer = (fill['drawers'] || fill[:drawers] || drawers_per_bay).to_i

        if kind == 'drawers' && n_drawer.positive?
          # دهانهٔ کشویی: ارتفاع داخلی بین کشوها تقسیم می‌شود.
          inner_h = height_mm - 2 * body_mm
          each_h = inner_h / n_drawer.to_f
          n_drawer.times do |i|
            drawers << { 'bay' => bay['index'], 'x' => bay['x'],
                         'z' => body_mm + i * each_h,
                         'w' => bay['w'], 'h' => each_h }
          end
          next
        end

        is_hanging = kind == 'hanging'
        # دهانهٔ رگال‌دار طبقهٔ کمتری می‌گیرد: لباس آویزان جا لازم دارد.
        # اگر همان تعداد طبقه بخورد، رگال بی‌فایده می‌شود.
        count = is_hanging ? [n_shelf - 1, 0].max : n_shelf
        size = shelf_size(bay['w'], depth_mm)
        shelf_levels(height_mm, body_mm, count, custom_z).each do |z|
          shelves << { 'bay' => bay['index'], 'x' => bay['x'], 'z' => z,
                       'len' => size['len'], 'dep' => size['dep'] }
        end
        r = rail_of(bay, height_mm, depth_mm, body_mm, is_hanging)
        rails << r if r
      end

      { 'bays' => bays, 'dividers' => divider_count(bays.length),
        'shelves' => shelves, 'rails' => rails, 'drawers' => drawers }
    end
  end
end
