# encoding: utf-8
#
# Kalaxa::CabinetGeometry — v1.0.0
#
# مکمل هندسی CabinetBuilder: به‌جای یک جعبهٔ بیرونی ساده، برای هر قطعهٔ
# منطقی (دیواره/کف/قید بالا/طبقه/پشت‌بند/درب/کشو) یک جعبهٔ سه‌بعدی جدا با
# موقعیت واقعی داخل کابینت برمی‌گرداند — تا در صحنه شبیه یک کابینت واقعی
# دیده شود، نه یک مکعب توپر.
#
# محورهای محلی: x = عرض (چپ→راست)، y = عمق (جلو y=0 → عقب y=depth)،
# z = ارتفاع (کف z=0 → بالا z=height). همهٔ خروجی‌ها به میلی‌متر است.
#
# چون فیلدهای «cut_length_mm/cut_width_mm» در خروجی CabinetBuilder بسته به
# جهت تقسیم درب (عمودی/افقی) معنای محور متفاوتی دارند (ریسک شناخته‌شدهٔ
# R1 در docs/discovery/known-risks.md)، این فایل مستقیماً از ابعاد کابینت
# و منطق تمپلیت هندسه را می‌سازد، نه از پارس دوبارهٔ آرایهٔ parts — تا از
# ابهام محور جلوگیری شود. اگر ساخت واقعی کارگاه فرق دارد، فقط همین فایل
# نیاز به اصلاح دارد.
#
require_relative 'cabinet_builder'
require_relative 'door_shapes'
require_relative 'unit_sections'
require_relative 'materials'

module Kalaxa
  module CabinetGeometry
    VERSION = '1.0.0'.freeze

    RAIL = Kalaxa::CabinetBuilder::RAIL_WIDTH_MM
    DOOR_GAP = Kalaxa::CabinetBuilder::DOOR_GAP_MM
    DRAWER_SIDE_GAP = Kalaxa::CabinetBuilder::DRAWER_SIDE_GAP_MM
    DRAWER_SLIDE = Kalaxa::CabinetBuilder::DRAWER_SLIDE_MM
    DRAWER_SIDE_H = Kalaxa::CabinetBuilder::DRAWER_SIDE_W_MM
    SHELF_SHRINK_LEN = Kalaxa::CabinetBuilder::SHELF_SHRINK_LEN_MM
    SHELF_SHRINK_DEP = Kalaxa::CabinetBuilder::SHELF_SHRINK_DEP_MM

    # --- یراق (پایه/ریل کشو/دستگیره) ---
    # این‌ها تا v3.23.x فقط در BOM شمرده می‌شدند ولی در مدل کشیده نمی‌شدند؛ کاربر
    # گزارش داد که باید در مدل دیده شوند. اعداد و قواعد عمداً با kalaxa-hardware.js
    # هم‌خوان است تا «آنچه دیده می‌شود» و «آنچه شمرده می‌شود» یکی بماند.
    LEG_HEIGHT_MM      = 100   # ارتفاع استاندارد پایهٔ کابینت زمینی
    LEG_SIZE_MM        = 40    # مقطع مربعی پایه
    LEG_INSET_MM       = 50    # فاصلهٔ پایه از لبه
    LEGS_WIDTH_BREAK_MM = 900  # هم‌تراز با legs_width_break_mm در BOM
    SLIDE_THICK_MM     = 12    # ضخامت ریل روی دیواره
    SLIDE_HEIGHT_MM    = 45
    SLIDE_SIZES_MM     = [250, 300, 350, 400, 450, 500, 550, 600].freeze
    HANDLE_LEN_MM      = 128   # طول پیش‌فرض دستگیرهٔ میله‌ای
    # طول‌های موجود در بازار (فاصلهٔ پیچ استاندارد). دستگیرهٔ ۱۲۸ روی نمای
    # ۶۰ سانتی کوچک به نظر می‌رسد و روی نمای ۳۰ سانتی بزرگ؛ پس از این
    # فهرست نزدیک‌ترینِ متناسب انتخاب می‌شود، نه یک عدد ثابت برای همه.
    HANDLE_SIZES_MM    = [96, 128, 160, 192, 224, 256, 320, 416].freeze
    # نسبت طول دستگیره به عرض نما. یک‌سوم چیزی است که در کابینت واقعی
    # متعارف است — نه آن‌قدر کوتاه که گم شود، نه آن‌قدر بلند که ریلی شود.
    HANDLE_WIDTH_RATIO = 0.34
    HANDLE_PROJ_MM     = 32    # بیرون‌زدگی از سطح درب
    HANDLE_THICK_MM    = 16
    # دستگیرهٔ مخفی (گاولا): لبهٔ بالایی نما عقب‌نشسته می‌شود تا انگشت جا بگیرد.
    # عمق عقب‌نشستگی همیشه کمتر از ضخامت نماست (وگرنه نما سوراخ می‌شد) — در کد کلمپ می‌شود.
    HIDDEN_HANDLE_DEPTH_MM  = 10
    HIDDEN_HANDLE_MIN_LIP_MM = 4  # حداقل ضخامت باقی‌مانده پشت فرورفتگی
    HIDDEN_HANDLE_HEIGHT_MM = 25
    # انواع دستگیره: 'bar' = میله‌ای بیرون‌زده، 'hidden' = مخفی/گاولا، 'none' = بدون دستگیره
    HANDLE_KINDS = %w[bar hidden none].freeze

    module_function

    def cm_to_mm(cm)
      (cm.to_f * 10).round
    end

    # قید بالای کابینت. کاربر: «ال می‌شه یه عمودی و یه افقی»؛ مدل معمولشان ۴ قید
    # (جلو L، عقب L) است ولی گاهی «جلو افقی، عقب L». آرایش و ابعاد از
    # CabinetBuilder.rail_styles/rail_dims می‌آید — همان منبعی که لیست برش می‌خواند.
    #   style: 'L' = افقی + عمودی | 'h' = فقط افقی | 'none' = ندارد
    def add_rail(add, side, style, w, h, d, body, vh, hd)
      return if style == 'none'
      x = body
      len = w - 2 * body
      y_h = side == 'front' ? 0 : d - hd          # تختهٔ خوابیده
      add.call('rail_top', x, y_h, h - body, len, hd, body)
      return unless style == 'L'
      # تختهٔ ایستاده، چسبیده به لبهٔ همان طرف، از زیر سقف به پایین
      y_v = side == 'front' ? 0 : d - body
      add.call('rail_top', x, y_v, h - body - vh, len, body, vh)
    end

    # بزرگ‌ترین ریل استاندارد که در این عمق جا می‌شود — همان منطق slideSizeForDepth
    # در kalaxa-hardware.js. nil یعنی عمق برای هیچ ریل استانداردی کافی نیست.
    # توجه: امروز هیچ‌جا صدا زده نمی‌شود؛ مدل، ریل را به طول عمق جعبهٔ کشو می‌کشد نه
    # به سایز استاندارد. شمارش واقعی ریل در BOM از نسخهٔ JS می‌آید.
    def slide_size_for_depth(depth_mm)
      target = depth_mm - 50
      SLIDE_SIZES_MM.select { |s| s <= target }.max
    end

    # @return [Array<Hash>] هر عضو: {key, x, y, z, dx, dy, dz} به mm (x/y/z = گوشهٔ کمینه، d* = اندازه)
    def boxes_for(template_id, width_cm, height_cm, depth_cm, opts = {})
      w = cm_to_mm(width_cm); h = cm_to_mm(height_cm); d = cm_to_mm(depth_cm)
      body = opts[:body_thickness_mm] || 16
      backT = opts[:back_thickness_mm] || 8
      shelf_count = opts[:shelf_count] || 1

      # آرایش و ابعاد قید از CabinetBuilder می‌آید — همان جایی که لیست برش می‌خواند،
      # تا مدل و لیست برش نتوانند واگرا شوند (تنزل جلو به افقی روی یونیت کشویی هم
      # همان‌جا اعمال می‌شود، نه این‌جا).
      rail_front, rail_back = Kalaxa::CabinetBuilder.rail_styles(template_id, opts)
      rail_dims  = Kalaxa::CabinetBuilder.rail_dims(opts)
      rail_vh    = rail_dims[:vertical_mm]
      rail_hd    = rail_dims[:horizontal_mm]
      handle_kind = opts[:handle_kind] || 'bar'
      handle_kind = 'bar' unless HANDLE_KINDS.include?(handle_kind)
      # پایه فقط زیر کابینت‌هایی که روی زمین می‌ایستند (زمینی/قدی)، نه هوایی
      floor_standing = template_id != 'wall_single_door'

      boxes = []
      # متریال هر جعبه همین‌جا حل می‌شود تا ابزار ساخت بتواند در صحنه رنگش کند —
      # وگرنه همهٔ قطعات یک‌رنگ می‌مانند و شیشه از MDF قابل تشخیص نیست.
      # sheet فقط وقتی صریح است که قطعه ورق غیرمعمول دارد (مثلاً شیشهٔ درب).
      # rot_z: چرخش قطعه حول محور Z، حول گوشهٔ (x, y) خودش.
      #
      # تا این نسخه همهٔ قطعات محوری بودند و همین کافی بود. کابینت گوشه نمای
      # **اریب** دارد که با هیچ جعبهٔ محوری‌ای درست درنمی‌آید — یا باید قرارداد
      # را گسترش داد یا دربی کشید که سر جایش نیست. میدان اختیاری است، پس
      # مصرف‌کننده‌های موجود دست‌نخورده می‌مانند.
      add = lambda do |key, x, y, z, dx, dy, dz, sheet = nil, rout = nil, rot_z = nil|
        next if dx <= 0 || dy <= 0 || dz <= 0
        b = { 'key' => key, 'x' => x.round(2), 'y' => y.round(2), 'z' => z.round(2),
              'dx' => dx.round(2), 'dy' => dy.round(2), 'dz' => dz.round(2),
              'material' => Kalaxa::Materials.for_key(key, sheet) }
        b['rot_z_deg'] = rot_z.round(2) if rot_z && rot_z.abs > 0.01
        # کار ماشینِ روی همین قطعه (فعلاً فقط فرز طرحِ درب). ابزار ساخت آن را
        # روی همان گروه می‌کَنَد؛ قطعه یکی می‌ماند و لیست برش دست‌نخورده.
        b['rout'] = rout if rout
        boxes << b
      end

      bottom_len = w - 2 * body
      # کابینت گوشه دو بال روی دو دیوار دارد؛ دیواره‌هایش جای دیگری می‌نشینند.
      unless template_id == 'base_corner_diagonal'
        add.call('side', 0, 0, 0, body, d, h)
        add.call('side', w - body, 0, 0, body, d, h)
      end

      case template_id
      when 'base_single_door', 'base_sink_double_door'
        doors = template_id == 'base_sink_double_door' ? 2 : 1
        add.call('bottom', body, 0, 0, bottom_len, d, body)
        add_rail(add, 'front', rail_front, w, h, d, body, rail_vh, rail_hd)
        add_rail(add, 'back',  rail_back,  w, h, d, body, rail_vh, rail_hd)
        if template_id == 'base_single_door'
          shelf_len = bottom_len - SHELF_SHRINK_LEN
          shelf_dep = d - SHELF_SHRINK_DEP
          # تراز از همان تک‌منبعی که یونیت‌های دهانه‌دار می‌خوانند — وگرنه
          # طبقهٔ کابینت زمینی روی شبکهٔ پین نمی‌نشیند و کابینت کمد می‌نشیند.
          Kalaxa::UnitSections.shelf_levels(h, body, shelf_count).each do |z|
            add.call('shelf', (w - shelf_len) / 2.0, (d - shelf_dep) / 2.0, z - body / 2.0, shelf_len, shelf_dep, body)
          end
        end
        add.call('back', body / 2.0, d - backT, body / 2.0, w - body, backT, h - body)
        add_doors(add, doors, w, h, body, split: :width, handle_kind: handle_kind, opts: opts)

      when 'base_corner_diagonal'
        # چیدمان در پلان (x به راست، y به عقب؛ گوشهٔ دیوارها در x=0,y=arm):
        #   بال ۱ روی دیوار عقب، بال ۲ روی دیوار چپ، نمای اریب روی وتر.
        arm = w
        face_run = arm - d
        # از همان منبعی که لیست برش می‌خواند — وگرنه یکی ابعادی را می‌پذیرد
        # که دیگری رد می‌کند.
        diagonal = Kalaxa::CabinetBuilder.corner_diagonal_mm!(arm, d)

        # دو دیواره‌ای که به دیوارها می‌چسبند
        add.call('side', 0, 0, 0, body, arm, h)                  # چپ، در راستای عمق
        add.call('side', 0, arm - body, 0, arm, body, h)         # عقب، در راستای عرض

        # کف: مستطیل محیطی. برش اریب گوشه در لیست برش یادداشت شده؛ این‌جا
        # جعبه می‌ماند چون هندسهٔ پنج‌ضلعی از قرارداد جعبه بیرون است.
        #
        # کلید **دقیقاً** همان کلید لیست برش است. اگر این‌جا 'bottom' می‌ماند و
        # آن‌جا 'bottom_corner'، هر گزارشی که قطعه را با کلید پیدا می‌کند
        # (قیمت، متریال، طبقه‌بندی) یکی از دو طرف را گم می‌کرد.
        add.call('bottom_corner', body, 0, 0, arm - body, arm - body, body)

        Kalaxa::UnitSections.shelf_levels(h, body, shelf_count).each do |z|
          add.call('shelf_corner', body, 0, z - body / 2.0,
                   arm - body - SHELF_SHRINK_LEN, arm - body - SHELF_SHRINK_LEN, body)
        end

        # قید بالا و دو پشت‌بند — در نسخهٔ اول این‌جا نبودند، یعنی مدل دو نوع
        # قطعه کمتر از لیست برش داشت. تست تطبیق کلیدها گرفتش.
        add_rail(add, 'front', rail_front, arm, h, d, body, rail_vh, rail_hd)
        add.call('back', body / 2.0, arm - backT, body / 2.0, arm - body, backT, h - body)
        add.call('back', arm - backT, body / 2.0, body / 2.0, backT, arm - body, h - body)

        # دو دیوارهٔ کوتاه کنار نمای اریب — انتهای هر بال
        add.call('side_corner', face_run - body, 0, body, body, d - body, h - body)
        add.call('side_corner', 0, face_run - body, body, d - body, body, h - body)

        # نمای اریب از **همان** تابعی ساخته می‌شود که بقیهٔ دربها — وگرنه درب
        # کلاف‌وتنپوش این‌جا تک‌تکه می‌شد در حالی که لیست برش سه قطعه می‌داد.
        # (تست تطبیق لیست برش و مدل همین را گرفت.)
        #
        # چرخش بعد از ساخت روی همهٔ قطعاتِ همین درب زده می‌شود: هر تکه‌ای که
        # `add_shaped_door` اضافه کرده باشد.
        first_door_box = boxes.length
        add_shaped_door(add, handle_kind, face_run, DOOR_GAP / 2.0,
                        diagonal - DOOR_GAP, h - DOOR_GAP, body, opts)
        boxes[first_door_box..-1].each { |b| b['rot_z_deg'] = 135.0 }

      when 'base_three_drawer'
        drawers = opts[:drawer_count] || 3
        add.call('bottom', body, 0, 0, bottom_len, d, body)
        # تنزل قید جلو به افقی (برخورد با جعبهٔ کشو) در CabinetBuilder.rail_styles
        # اعمال شده است — این‌جا فقط کشیده می‌شود.
        add_rail(add, 'front', rail_front, w, h, d, body, rail_vh, rail_hd)
        add_rail(add, 'back',  rail_back,  w, h, d, body, rail_vh, rail_hd)
        add.call('back', body / 2.0, d - backT, body / 2.0, w - body, backT, h - body)
        front_h = (h - DOOR_GAP - (drawers - 1) * DOOR_GAP) / drawers.to_f
        # لقی جانبی (مجموع دو طرف) از تنظیمات می‌آید — ساچمه‌ای ۲۵، کف‌ریل ۱۱.
        # این همان فضایی است که ریل واقعاً اشغال می‌کند؛ قبلاً صفر بود و ریل جا نمی‌شد.
        clearance = Kalaxa::CabinetBuilder.slide_clearance_mm(opts)
        drawer_dep = Kalaxa::CabinetBuilder.drawer_depth_mm(d, opts)
        # از همان منبعی که لیست برش می‌خواند — وگرنه جعبهٔ کشو در مدل و در برش فرق می‌کرد.
        side_h = Kalaxa::CabinetBuilder.drawer_side_height_mm(front_h, body, opts)
        box_outer = bottom_len - clearance          # عرض بیرونی جعبهٔ کشو
        box_x0 = body + clearance / 2.0             # نصف لقی هر طرف
        drawer_len = box_outer - 2 * body           # پشت/کف، بین دو بدنهٔ کشو
        drawers.times do |i|
          # نمای کشو کل ارتفاع نما را می‌پوشاند (بیرون بدنه، y منفی) — از z نزدیک کف شروع می‌شود.
          z_front = DOOR_GAP + i * (front_h + DOOR_GAP)
          # ولی جعبهٔ کشو (بدنه/پشت/کف) داخل کابینت است و باید **روی** کف کابینت بنشیند،
          # نه داخل آن — وگرنه با قطعهٔ 'bottom' هم‌پوشانی حجمی پیدا می‌کرد.
          z_box = body + i * (front_h + DOOR_GAP)
          add_front(add, 'drawer_front', handle_kind, DOOR_GAP / 2.0, z_front, w - DOOR_GAP, front_h, body)
          # بدنهٔ کشو داخل بدنهٔ کابینت می‌نشیند (نه روی آن) — x از body شروع می‌شود نه از ۰،
          # وگرنه با دیوارهٔ خودِ کابینت هم‌پوشانی می‌کرد. پشت/کف کشو دقیقاً بین این دو
          # بدنه قرار می‌گیرد: طول = w − 4×body = bottom_len − DRAWER_SLIDE ✓
          add.call('drawer_side', box_x0, 0, z_box, body, drawer_dep, side_h)
          add.call('drawer_side', box_x0 + box_outer - body, 0, z_box, body, drawer_dep, side_h)
          add.call('drawer_back', box_x0 + body, drawer_dep - body, z_box, drawer_len, body, side_h)
          add.call('drawer_bottom', box_x0 + body, 0, z_box, drawer_len, drawer_dep, 3)
          # ریل: در همان لقی بین دیوارهٔ کابینت و بدنهٔ کشو — حالا واقعاً جا دارد
          slide_t = [clearance / 2.0, 0.1].max
          add.call('slide', body, 0, z_box, slide_t, drawer_dep, SLIDE_HEIGHT_MM)
          add.call('slide', bottom_len + body - slide_t, 0, z_box, slide_t, drawer_dep, SLIDE_HEIGHT_MM)
        end

      when *Kalaxa::CabinetBuilder::SECTIONED.keys
        # از **همان** موتوری که لیست برش می‌خواند. اگر این‌جا طبقه‌ها را دستی
        # می‌شمردم، دهانهٔ رگال‌دار در مدل یک طبقه بیشتر می‌گرفت و کارگاه
        # طبقه‌ای می‌برید که جایی برایش نیست.
        # **section_spec**، نه SECTIONED خام: پارامترهای کاربر (تعداد دهانه،
        # جای رگال، ارتفاع طبقه، درب ریلی) باید این‌جا هم اعمال شوند. نسخهٔ
        # اول پیش‌فرض ثابت را می‌خواند و مدل، «بدون طبقه»ی کاربر را نادیده
        # می‌گرفت — تست تطبیق گرفتش.
        spec = Kalaxa::CabinetBuilder.section_spec(template_id, opts)
        lay = Kalaxa::UnitSections.layout(w, h, d, body, spec)
        tb_len = w - 2 * body

        add.call('top_bottom', body, 0, 0, tb_len, d, body)
        add.call('top_bottom', body, 0, h - body, tb_len, d, body)

        lay['bays'].each_with_index do |bay, i|
          next if i.zero?   # جداکننده **بین** دهانه‌هاست، نه قبل از اولی
          add.call('divider', bay['x'] - body, 0, body, body, d, h - 2 * body)
        end

        lay['shelves'].each do |sh|
          add.call('shelf', sh['x'] + (bay_pad = (bay_w_of(lay, sh['bay']) - sh['len']) / 2.0),
                   (d - sh['dep']) / 2.0, sh['z'] - body / 2.0,
                   sh['len'], sh['dep'], body)
        end

        # میلهٔ رگال یراق است، نه ورق — در لیست برش نمی‌آید ولی در مدل باید
        # دیده شود، وگرنه کاربر فکر می‌کند کمد رگال ندارد.
        lay['rails'].each do |r|
          add.call('rail_rod', r['x'], r['y'] - r['dia'] / 2.0, r['z'] - r['dia'] / 2.0,
                   r['len'], r['dia'], r['dia'])
        end

        # کشوهای داخل دهانه
        lay['drawers'].each do |dr|
          add_drawer_boxes_at(add, dr, d, body, opts)
        end

        add.call('back', body / 2.0, d - backT, body / 2.0, w - body, backT, h - body) if spec['has_back']
        if spec['doors'].to_i.positive?
          add_doors(add, spec['doors'].to_i, w, h, body, split: :width,
                    handle_kind: handle_kind, opts: opts)
        end

      when 'wall_single_door', 'tall_double_door'
        doors = template_id == 'tall_double_door' ? 2 : 1
        add.call('top_bottom', body, 0, 0, bottom_len, d, body)
        add.call('top_bottom', body, 0, h - body, bottom_len, d, body)
        shelf_len = bottom_len - SHELF_SHRINK_LEN
        shelf_dep = d - SHELF_SHRINK_DEP
        Kalaxa::UnitSections.shelf_levels(h, body, shelf_count).each do |z|
          add.call('shelf', (w - shelf_len) / 2.0, (d - shelf_dep) / 2.0, z - body / 2.0, shelf_len, shelf_dep, body)
        end
        add.call('back', body / 2.0, d - backT, body / 2.0, w - body, backT, h - body)
        add_doors(add, doors, w, h, body, split: doors > 1 ? :height : :width, handle_kind: handle_kind, opts: opts)
      end

      add_legs(add, w, d) if floor_standing

      # پایه روی **کف** بایستد، نه زیر آن.
      #
      # تا ۳.۷۲ بدنه از z=0 شروع می‌شد و پایه‌ها از ۰ تا ۱۰۰- می‌رفتند.
      # گروه در اسکچاپ روی نقطهٔ کلیک می‌نشیند، پس اگر کاربر روی کف کلیک
      # می‌کرد **بدنه روی زمین می‌نشست و پایه‌ها می‌رفتند زیر زمین** — یعنی
      # کابینت انگار پایه ندارد و ۱۰ سانت کوتاه‌تر است.
      #
      # حالا کلِ کابینت به اندازهٔ ارتفاع پایه بالا می‌رود: پایه ۰ تا ۱۰۰،
      # بدنه از ۱۰۰ به بالا. **ابعاد هیچ قطعه‌ای عوض نمی‌شود**، فقط جای
      # کابینت در فضا؛ پس لیست برش و ارتفاع گزارش‌شدهٔ کابینت (که کاربر
      # خواست پایه در آن نباشد) دست‌نخورده می‌مانند.
      boxes.each { |b| b['z'] += LEG_HEIGHT_MM } if floor_standing
      boxes
    end

    # پایه‌های کابینت زمینی/قدی — زیر کف، بیرون از بدنه (z منفی).
    # تعداد طبق همان قاعدهٔ BOM: عرض > ۹۰۰ → ۶ پایه (سه جفت)، وگرنه ۴ پایه.
    # جعبهٔ کشو در یک دهانه — از همان اعداد لیست برش.
    def add_drawer_boxes_at(add, dr, depth_mm, body_mm, opts)
      clearance = Kalaxa::CabinetBuilder.slide_clearance_mm(opts)
      ddepth = Kalaxa::CabinetBuilder.drawer_depth_mm(depth_mm, opts)
      side_h = Kalaxa::CabinetBuilder.drawer_side_height_mm(dr['h'], body_mm, opts)
      box_outer = dr['w'] - clearance
      inner = box_outer - 2 * body_mm
      return if inner <= 0 || ddepth <= 0

      x0 = dr['x'] + clearance / 2.0
      add.call('drawer_side', x0, 0, dr['z'], body_mm, ddepth, side_h)
      add.call('drawer_side', x0 + box_outer - body_mm, 0, dr['z'], body_mm, ddepth, side_h)
      add.call('drawer_back', x0 + body_mm, ddepth - body_mm, dr['z'], inner, body_mm, side_h)
      add.call('drawer_bottom', x0 + body_mm, 0, dr['z'], inner, ddepth, 3)
    end

    # عرض دهانه‌ای که این طبقه در آن است — برای وسط‌چین‌کردن طبقه.
    def bay_w_of(lay, index)
      bay = lay['bays'].find { |b| b['index'] == index }
      bay ? bay['w'] : 0
    end

    def add_legs(add, w, d)
      pairs = w > LEGS_WIDTH_BREAK_MM ? 3 : 2
      xs = if pairs == 2
             [LEG_INSET_MM, w - LEG_INSET_MM - LEG_SIZE_MM]
           else
             [LEG_INSET_MM, (w - LEG_SIZE_MM) / 2.0, w - LEG_INSET_MM - LEG_SIZE_MM]
           end
      ys = [LEG_INSET_MM, d - LEG_INSET_MM - LEG_SIZE_MM]
      xs.each do |x|
        ys.each do |y|
          add.call('leg', x, y, -LEG_HEIGHT_MM, LEG_SIZE_MM, LEG_SIZE_MM, LEG_HEIGHT_MM)
        end
      end
    end

    # یک «نما» (درب یا نمای کشو) را با دستگیره‌اش می‌سازد.
    # نما همیشه بیرون بدنه است: از y = -body تا y = 0 (سطح جلویی = -body).
    #
    #   'bar'    → نمای کامل + میلهٔ بیرون‌زده جلوی آن
    #   'hidden' → دستگیرهٔ مخفی (گاولا): نما از بالا به اندازهٔ ارتفاع دستگیره کوتاه
    #              می‌شود و به‌جایش یک نوار **عقب‌نشسته** می‌نشیند؛ نتیجه یک فرورفتگی
    #              واقعی است، نه یک جعبهٔ هم‌پوشان روی نما (که گمراه‌کننده می‌بود).
    #   'none'   → فقط نما
    # @param key کلید قطعه ('door' یا 'drawer_front')
    # درب (نه نمای کشو) شکل ساخت دارد: تخت، کلاف‌وتنپوش، فریم آلومینیوم…
    # قطعاتش از DoorShapes می‌آید — همان منبعی که لیست برش می‌خواند، پس مدل و
    # لیست برش نمی‌توانند واگرا شوند. دستگیره روی همان نما اضافه می‌شود.
    def add_shaped_door(add, kind, fx, fz, fw, fh, body, opts, side = :right)
      shape = Kalaxa::DoorShapes.shape_id(opts)
      spec  = Kalaxa::DoorShapes.spec(shape)
      # شکل تک‌تخته‌ای دقیقاً مسیر قبلی را می‌رود (فقط ضخامتش دیگر ضخامت
      # بدنه نیست) تا دستگیرهٔ مخفی و میله‌ای همان‌طور کار کند.
      # کاتالوگ از JSON می‌آید → کلیدها رشته‌اند، نه symbol.
      if spec['kind'] == 'panel'
        t = Kalaxa::DoorShapes.thickness_mm(shape, opts)
        # درب فرزخورده تا این نسخه در مدل **دقیقاً مثل درب تخت** درمی‌آمد: کاتالوگ
        # `operation: rout` داشت و لیست برش «فرزکاری طرح» می‌نوشت، ولی کاربر در
        # صحنه هیچ فرقی نمی‌دید. حالا فرورفتگی طرح روی همان قطعه کنده می‌شود.
        #
        # عمداً **یک گروه** می‌ماند، نه چند تکه: از نظر برش یک تختهٔ کامل است.
        # اگر چند گروه می‌شد، اسکن دوباره پنج قطعه می‌دید و لیست برش یکی —
        # همان واگراییِ نویسنده/خواننده که بارها گرفتارش شدیم.
        rout = spec['operation'] == 'rout' ? rout_recess(fw, fh, t, opts) : nil
        return add_front(add, 'door', kind, fx, fz, fw, fh, t, spec['sheet'], rout, side)
      end

      sheets = Kalaxa::DoorShapes.pieces(shape, fw, fh, opts)
                                 .each_with_object({}) { |pc, h| h[pc[:key]] = pc[:sheet] }
      Kalaxa::DoorShapes.boxes(shape, fx, fz, fw, fh, opts).each do |b|
        add.call(b['key'], b['x'], b['y'], b['z'], b['dx'], b['dy'], b['dz'], sheets[b['key']])
      end
      add_handle(add, kind, fx, fz, fw, fh,
                 Kalaxa::DoorShapes.thickness_mm(shape, opts), side)
    end

    # ابعاد فرورفتگیِ فرز روی درب تک‌تخته.
    #
    # هر دو عدد از تنظیمات می‌آید و در کد قفل نیست: هر کارگاه تیغهٔ فرز خودش را
    # دارد. حاشیه از عرض کلاف درب می‌آید (همان عددی که درب کلاف‌وتنپوش استفاده
    # می‌کند) تا دو شکل با هم بخوانند.
    #
    # @return [Hash, nil] nil یعنی روی این اندازه فرز جا نمی‌شود — سکوت بهتر از
    #   کندنِ فرورفتگیِ بی‌معنا یا ابعاد منفی است.
    ROUT_MIN_PANEL_MM = 60 # کمتر از این، وسطِ درب چیزی باقی نمی‌ماند

    def rout_recess(fw, fh, t, opts = {})
      inset = (opts[:door_frame_width_mm] || opts['door_frame_width_mm']).to_f
      inset = Kalaxa::DoorShapes.frame_width_mm('framed_panel', opts).to_f if inset <= 0
      depth = (opts[:door_groove_depth_mm] || opts['door_groove_depth_mm']).to_f
      depth = [t / 3.0, 6.0].min if depth <= 0

      return nil if fw - 2 * inset < ROUT_MIN_PANEL_MM || fh - 2 * inset < ROUT_MIN_PANEL_MM
      # عمق هرگز از ضخامت رد نشود، وگرنه درب سوراخ می‌شود.
      depth = [depth, t - 3.0].min
      return nil if depth <= 0

      { 'inset_mm' => inset.round(2), 'depth_mm' => depth.round(2) }
    end

    def add_front(add, key, kind, fx, fz, fw, fh, body, sheet = nil, rout = nil, side = :right)
      if kind == 'hidden' && fh > HIDDEN_HANDLE_HEIGHT_MM * 2
        # عمق فرورفتگی هرگز نباید از ضخامت نما بیشتر شود، وگرنه ابعاد منفی می‌شد و
        # قطعه بی‌صدا حذف می‌گشت (باگ واقعی v1: عمق ۲۰ روی نمای ۱۶میلی).
        recess = [HIDDEN_HANDLE_DEPTH_MM, body - HIDDEN_HANDLE_MIN_LIP_MM].min
        panel_h = fh - HIDDEN_HANDLE_HEIGHT_MM
        add.call(key, fx, -body, fz, fw, body, panel_h, sheet)
        # نوار عقب‌نشسته در لبهٔ بالا = خودِ فرورفتگی دستگیره
        add.call('handle_groove', fx, -body + recess, fz + panel_h,
                 fw, body - recess, HIDDEN_HANDLE_HEIGHT_MM)
        return
      end

      add.call(key, fx, -body, fz, fw, body, fh, sheet, rout)
      add_handle(add, kind, fx, fz, fw, fh, body, side)
    end

    # دستگیرهٔ میله‌ای روی یک نما — افقی روی نماهای پهن‌تر از بلند (نمای کشو)،
    # وگرنه عمودی (درب). جدا شد تا درب‌های چندقطعه‌ای هم بتوانند صدایش بزنند.
    # فاصلهٔ مرکز دستگیره از لبهٔ لنگه
    HANDLE_EDGE_MM = 60

    # @param side [Symbol] :right یا :left — دستگیره روی کدام لبهٔ همین لنگه
    #
    # کاربر: «تو کابینت‌ها و کمدهای دو درب، جهت دستگیره پیش هم نیست».
    #
    # علتش این بود که دستگیره **همیشه** لبهٔ راستِ لنگه گذاشته می‌شد. روی
    # دولنگه یعنی لنگهٔ چپ دستگیره‌اش وسط بود و لنگهٔ راست گوشهٔ دور — در حالی
    # که در کابینت واقعی هر دو دستگیره کنار درزِ وسط‌اند، چون لولا بیرون است
    # و دست از وسط باز می‌کند.
    # طول دستگیرهٔ متناسب با بعدی که در امتدادش می‌نشیند.
    #
    # از فهرست طول‌های موجود در بازار انتخاب می‌شود، نه هر عددی: دستگیرهٔ
    # ۱۷۳ میلی‌متری خریدنی نیست. اگر نما آن‌قدر کوچک باشد که کوتاه‌ترین
    # طول هم جا نشود، همان کوتاه‌ترین برمی‌گردد و بعد در محل کلمپ می‌شود.
    def handle_len_for(span_mm)
      want = span_mm * HANDLE_WIDTH_RATIO
      HANDLE_SIZES_MM.min_by { |s| (s - want).abs }
    end

    def add_handle(add, kind, fx, fz, fw, fh, body, side = :right)
      return unless kind == 'bar'

      if fw >= fh
        # نمای پهن (کشو): دستگیره افقی، **وسطِ** نما.
        #
        # تا ۳.۷۲ همین‌جا نوشته بود «وسط» ولی کد `fz + fh - HANDLE_EDGE_MM`
        # می‌گذاشت — یعنی ۶۰ میلی از **بالا**. روی نمای کشوی ۲۳۶ میلی‌متری
        # این آشکارا بالاتر از وسط می‌افتاد. کامنت درست بود و کد غلط.
        len = [handle_len_for(fw), fw - 2 * HANDLE_EDGE_MM].min
        len = HANDLE_SIZES_MM.first if len < HANDLE_SIZES_MM.first
        add.call('handle', fx + (fw - len) / 2.0, -body - HANDLE_PROJ_MM,
                 fz + (fh - HANDLE_THICK_MM) / 2.0, len, HANDLE_PROJ_MM, HANDLE_THICK_MM)
      else
        # نمای بلند (درب): دستگیرهٔ عمودی کنار لبهٔ بازشو، وسطِ ارتفاع.
        len = [handle_len_for(fh), fh - 2 * HANDLE_EDGE_MM].min
        len = HANDLE_SIZES_MM.first if len < HANDLE_SIZES_MM.first
        x = side == :left ? fx + HANDLE_EDGE_MM - HANDLE_THICK_MM
                          : fx + fw - HANDLE_EDGE_MM
        add.call('handle', x, -body - HANDLE_PROJ_MM,
                 fz + (fh - len) / 2.0, HANDLE_THICK_MM, HANDLE_PROJ_MM, len)
      end
    end

    # درها را اضافه می‌کند؛ split: :width => کنار هم (مثل سینک دو‌درب)، :height => روی هم (مثل کابینت قدی)
    # دستگیره روی کدام لبهٔ لنگه بنشیند.
    #
    # قاعده از کابینت واقعی می‌آید: لولا یک طرف است و دست از طرف **مقابل**
    # باز می‌کند. پس در دولنگه هر دو دستگیره کنار درزِ وسط‌اند — «پیش هم».
    #
    # تک‌لنگه از جهت لولا تصمیم می‌گیرد: لولای راست → دستگیرهٔ چپ.
    def handle_side_for(index, doors, opts)
      return :left if doors > 1 && index == doors - 1   # لنگهٔ راست: دستگیره چپ
      return :right if doors > 1                        # بقیه: دستگیره راست

      opts[:door_swing].to_s == 'left' ? :right : :left
    end

    def add_doors(add, doors, w, h, body, split:, handle_kind: 'bar', opts: {})
      if doors <= 1
        add_shaped_door(add, handle_kind, DOOR_GAP / 2.0, DOOR_GAP / 2.0,
                        w - DOOR_GAP, h - DOOR_GAP, body, opts,
                        handle_side_for(0, 1, opts))
      elsif split == :width
        door_w = (w - DOOR_GAP - (doors - 1) * DOOR_GAP) / doors.to_f
        doors.times do |i|
          x0 = DOOR_GAP / 2.0 + i * (door_w + DOOR_GAP)
          add_shaped_door(add, handle_kind, x0, DOOR_GAP / 2.0, door_w, h - DOOR_GAP, body, opts,
                          handle_side_for(i, doors, opts))
        end
      else
        door_h = (h - DOOR_GAP - (doors - 1) * DOOR_GAP) / doors.to_f
        doors.times do |i|
          z0 = DOOR_GAP / 2.0 + i * (door_h + DOOR_GAP)
          add_shaped_door(add, handle_kind, DOOR_GAP / 2.0, z0, w - DOOR_GAP, door_h, body, opts)
        end
      end
    end
  end
end
