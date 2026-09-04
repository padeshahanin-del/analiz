# encoding: utf-8
#
# Kalaxa::CabinetBuilder — v1.0.0
#
# اولین ابزار «ساخت» کابینت کالاکسا. تا این نسخه، کالاکسا فقط کابینت‌های
# از‌قبل‌دارای dictionary «kalaxa_cabinet» را اسکن می‌کرد (ProjectScanner)؛
# هیچ ابزاری برای ساختن آن dictionary روی یک گروه در مدل وجود نداشت — یعنی
# مدل‌های واقعی کاربر (ساخته‌شده با گروه‌های معمولی SketchUp) اصلاً قابل
# اسکن نبودند. این فایل آن حلقهٔ گمشده را می‌سازد: از ۵ رده‌ای که در باقی
# پروژه (assemblyKey، CATEGORY_FA، fixture طلایی) از قبل شناخته‌شده‌اند
# (base_single_door، base_three_drawer، base_sink_double_door،
# wall_single_door، tall_double_door)، لیست قطعات را با فرمول‌های قطعی
# می‌سازد و به‌صورت JSON برای نوشتن روی attribute dictionary گروه برمی‌گرداند.
#
# فرمول‌های زیر با مهندسی معکوس از خودِ fixture طلایی
# (kalaxa/dev/fixtures/golden_kitchen_snapshot.json) استخراج شده‌اند — یعنی
# روی ۵ کابینت آن fixture عدد‌به‌عدد صحت‌سنجی شده‌اند (نه فقط حدس معماری) تا
# با تمام موتورهای دیگر (نستینگ، شیت قیمت، نقشه برش) که روی همان fixture
# تست شده‌اند سازگار بمانند. اگر عملکرد واقعی کارگاه فرق دارد، فقط همین
# فایل نیاز به اصلاح دارد.
#
require 'json'
require 'securerandom'
require_relative 'glossary'
require_relative 'door_shapes'
require_relative 'unit_sections'
require_relative 'materials'
require_relative 'catalog'

module Kalaxa
  module CabinetBuilder
    VERSION = '1.0.0'.freeze

    # ابعاد و آرایش قید از data/rails.json — همان فایلی که هر مصرف‌کنندهٔ دیگری
    # (و هر میزبان تازه) می‌خواند.
    def self.const_missing(name)
      case name
      when :RAIL_WIDTH_MM then Kalaxa::Catalog.rail_horizontal_mm
      when :RAIL_VERTICAL_HEIGHT_MM then Kalaxa::Catalog.rail_vertical_mm
      when :RAILED_TEMPLATES then Kalaxa::Catalog.railed_templates
      else super
      end
    end
    DOOR_GAP_MM         = 4   # فاصلهٔ درز بین درب و بدنه (یک طرف)؛ برای درهای مجاور همین مقدار بین دو درب هم لحاظ می‌شود
    DRAWER_SIDE_GAP_MM  = 50  # پرت طول بدنهٔ کشو نسبت به عمق کابینت (وقتی عمق کشو تنظیم نشده)
    DRAWER_SLIDE_MM     = 32  # مقدار قدیمی — فقط برای سازگاری عقب‌رو نگه داشته شده

    # لقی جانبی جعبهٔ کشو — **مجموع هر دو طرف**، اعداد واقعی کارگاه کاربر.
    # عرض بیرونی جعبهٔ کشو = فضای داخلی کابینت − این عدد.
    # این‌ها فقط پیش‌فرض‌اند؛ مقدار واقعی از تنظیمات پروژه می‌آید (project.drawer).
    SLIDE_CLEARANCE_MM = { 'ball' => 25, 'bottom' => 11 }.freeze
    SLIDE_KINDS = SLIDE_CLEARANCE_MM.keys.freeze
    SLIDE_LABELS_FA = { 'ball' => 'ساچمه‌ای (ریل+بادخور)', 'bottom' => 'کف ریل' }.freeze

    DRAWER_SIDE_W_MM    = 150 # ارتفاع بدنهٔ کشو (ثابت، صرف‌نظر از ارتفاع کابینت)
    SHELF_SHRINK_LEN_MM = 2
    SHELF_SHRINK_DEP_MM = 20

    TEMPLATES = %w[base_single_door base_three_drawer base_sink_double_door
                   wall_single_door tall_double_door base_corner_diagonal
                   wardrobe bookcase
                   base_open wall_open wall_double_door tall_pantry
                   wardrobe_sliding].freeze

    # مشخصات یونیت‌های بخش‌بندی‌شده. اضافه‌کردن نوع تازه = یک ردیف داده،
    # نه یک شاخهٔ `case` تازه در دو فایل.
    #   bays            = تعداد دهانهٔ عمودی
    #   shelves_per_bay = طبقه در هر دهانه
    #   hanging_bays    = کدام دهانه‌ها میلهٔ رگال دارند
    #   doors           = تعداد لنگه (۰ = باز، مثل کتابخانه)
    SECTIONED = {
      'wardrobe' => { 'bays' => 2, 'shelves_per_bay' => 3, 'hanging_bays' => [0],
                      'doors' => 2, 'has_back' => true },
      'bookcase' => { 'bays' => 1, 'shelves_per_bay' => 4, 'hanging_bays' => [],
                      'doors' => 0, 'has_back' => true },
      # قفسهٔ باز زمینی — انتهای ران کابینت، جای ادویه یا کتاب آشپزی.
      'base_open' => { 'bays' => 1, 'shelves_per_bay' => 1, 'hanging_bays' => [],
                       'doors' => 0, 'has_back' => true },
      # قفسهٔ باز هوایی — همان، ولی روی دیوار.
      'wall_open' => { 'bays' => 1, 'shelves_per_bay' => 2, 'hanging_bays' => [],
                       'doors' => 0, 'has_back' => true },
      # هوایی دولنگه — عرض بیشتر از ۶۰ که یک لنگه سنگین می‌شود.
      'wall_double_door' => { 'bays' => 1, 'shelves_per_bay' => 2, 'hanging_bays' => [],
                              'doors' => 2, 'has_back' => true },
      # قدی آذوقه — طبقهٔ بیشتر از قدی معمولی، بدون رگال.
      'tall_pantry' => { 'bays' => 1, 'shelves_per_bay' => 5, 'hanging_bays' => [],
                         'doors' => 2, 'has_back' => true },
      # کمد درب‌ریلی — همان کمد، با لنگه‌هایی که روی هم می‌لغزند.
      'wardrobe_sliding' => { 'bays' => 2, 'shelves_per_bay' => 3, 'hanging_bays' => [0],
                              'doors' => 2, 'has_back' => true, 'door_mode' => 'sliding' }
    }.freeze

    # کابینت گوشهٔ قطری: دو بال روی دو دیوار، با نمای اریب در گوشه.
    #
    # عرض ورودی = طول هر بال روی دیوار (از گوشه). عمق = عمق استاندارد کابینت.
    # نمای اریب وتر مثلثی است که از دو بال ساخته می‌شود.
    # کمینهٔ پهنای نمای اریب. کمتر از این، درب باز نمی‌شود و دست به داخل
    # نمی‌رسد — کابینت نیست، یک جعبهٔ بسته است.
    CORNER_MIN_FACE_MM = 400

    module_function

    # پهنای نمای اریبِ کابینت گوشه — و ردکردنِ ابعاد غیرممکن.
    #
    # **یک** جا حساب می‌شود و هم لیست برش و هم هندسه از همین می‌خوانند. اگر هر
    # کدام قاعدهٔ خودش را داشت، یکی ابعادی را می‌پذیرفت که دیگری رد می‌کند —
    # و تست تطبیق دقیقاً همین را گرفت.
    def corner_diagonal_mm!(arm_mm, depth_mm)
      diagonal = Math.sqrt(2) * (arm_mm - depth_mm)
      return diagonal if diagonal >= CORNER_MIN_FACE_MM

      need = (depth_mm + CORNER_MIN_FACE_MM / Math.sqrt(2)) / 10.0
      raise ArgumentError,
            "کابینت گوشه: با عمق #{(depth_mm / 10).round} cm، بال باید دست‌کم "             "#{need.ceil} cm باشد تا نمای اریب #{CORNER_MIN_FACE_MM} میلی‌متر بشود "             "(الان #{diagonal.round} میلی‌متر است — درب باز نمی‌شود)"
    end

    # ---------------- قید بالا: تنها منبع حقیقت ----------------
    # لیست برش (build_parts) و مدل سه‌بعدی (CabinetGeometry.boxes_for) هر دو باید از
    # همین دو متد بخوانند. پیش‌تر هرکدام قاعدهٔ خودش را داشت: مدل آرایش L را با
    # پیش‌فرض جلو+عقب می‌کشید (۴ تکه) ولی لیست برش همیشه ثابت ۲ تکه می‌داد — یعنی دو
    # تختهٔ قید ایستاده در نستینگ/نقشه برش/BOM/شیت قیمت **اصلاً نبودند** و کارگاه کم
    # متریال سفارش می‌داد. کامنت بالای create_cabinet_tool.rb هم دقیقاً همین را
    # تضمین می‌کرد («شیت قیمت درست است») که درست نبود.
    #
    # @return [Array(String, String)] سبک قید جلو و عقب: 'L' | 'h' | 'none'
    def rail_styles(template_id, opts = {})
      return %w[none none] unless Kalaxa::Catalog.railed_templates.include?(template_id)

      front = opts[:rail_front] || Kalaxa::Catalog.rail_default_front
      back  = opts[:rail_back]  || Kalaxa::Catalog.rail_default_back
      # قید عمودیِ جلو با جعبهٔ کشو برخورد فیزیکی دارد (کشو بیرون نمی‌آید)، پس روی
      # یونیت کشویی همیشه به افقی تنزل می‌کند — هرچه در تنظیمات باشد.
      front = 'h' if Kalaxa::Catalog.rail_front_forced_horizontal.include?(template_id) && front != 'none'
      # کابینت گوشه پشتش به دو دیوار است و دو پشت‌بند دارد — قید عقب ندارد.
      # بدون این، لیست برش دو قید می‌داد که در مدل نبودند.
      back = 'none' if Kalaxa::Catalog.rail_back_forced_none.include?(template_id)
      [front, back]
    end

    # عرض تختهٔ قید برحسب جهتش (همان عددی که در لیست برش cut_width_mm می‌شود).
    def rail_dims(opts = {})
      { horizontal_mm: (opts[:rail_horizontal_depth_mm] || Kalaxa::Catalog.rail_horizontal_mm).to_f,
        vertical_mm:   (opts[:rail_vertical_height_mm]  || Kalaxa::Catalog.rail_vertical_mm).to_f }
    end

    # تعداد تختهٔ قید به تفکیک عرض — {عرض_mm => تعداد}. اگر عرض افقی و عمودی یکی
    # باشد عمداً در یک ردیف جمع می‌شوند (همان قطعه است).
    def rail_counts(template_id, opts = {})
      dims = rail_dims(opts)
      counts = Hash.new(0)
      rail_styles(template_id, opts).each do |style|
        next if style == 'none'

        counts[dims[:horizontal_mm]] += 1
        counts[dims[:vertical_mm]] += 1 if style == 'L'
      end
      counts
    end

    # لقی مؤثر بر اساس نوع ریل و بازنویسی‌های تنظیمات.
    def slide_clearance_mm(opts = {})
      return opts[:slide_clearance_mm].to_f if opts[:slide_clearance_mm]
      kind = opts[:slide_kind] || 'ball'
      SLIDE_CLEARANCE_MM[kind] || SLIDE_CLEARANCE_MM['ball']
    end

    # ارتفاع بدنهٔ جعبهٔ کشو — با سقفِ فضای واقعیِ هر کشو.
    #
    # پیش‌تر عدد تنظیمات (پیش‌فرض ۱۵۰) بی‌قید استفاده می‌شد. در کابینتی با کشوی
    # زیاد، ارتفاع هر نما کوچک‌تر از ۱۵۰ می‌شود و جعبهٔ کشو **از سقف کابینت بیرون
    # می‌زد** — مثلاً ۶ کشو در کابینت ۹۰۰: هر نما ۱۴۶، ولی جعبه ۱۵۰ و بالاترین
    # جعبه تا ۹۱۶ می‌رفت. چنین کابینتی ساخته نمی‌شود.
    #
    # حالا بدنهٔ کشو حداکثر به اندازهٔ نمای همان کشو منهای یک درز است.
    # body_mm لازم است چون جعبهٔ کشو **روی کف کابینت** می‌نشیند نه هم‌تراز نما:
    # نما از z = درز شروع می‌شود ولی جعبه از z = ضخامت بدنه. پس فضای واقعی
    # به اندازهٔ (ضخامت بدنه − درز) کمتر از ارتفاع نماست. نسخهٔ اول این را حساب
    # نکرده بود و جعبه هنوز ۸ میلی از سقف بیرون می‌زد.
    def drawer_side_height_mm(front_h_mm, body_mm = 16, opts = {})
      wanted = opts[:drawer_side_height_mm] ? opts[:drawer_side_height_mm].to_f : DRAWER_SIDE_W_MM
      room = front_h_mm + DOOR_GAP_MM - body_mm
      room.positive? ? [wanted, room].min : wanted
    end

    # عمق جعبهٔ کشو: اگر در تنظیمات عدد داده شده همان، وگرنه از عمق کابینت.
    def drawer_depth_mm(cabinet_depth_mm, opts = {})
      d = opts[:drawer_depth_mm].to_f
      d > 0 ? d : cabinet_depth_mm - DRAWER_SIDE_GAP_MM
    end

    def cm_to_mm(cm)
      (cm.to_f * 10).round
    end


    # قطعات یک نما (درب) طبق شکل ساختش — از DoorShapes، همان منبعی که
    # CabinetGeometry هم می‌خواند. تعداد لنگه در تعداد قطعات هر لنگه ضرب می‌شود.
    def add_door_pieces(add, shape, leaves, leaf_w, leaf_h, opts, note: '')
      DoorShapes.pieces(shape, leaf_w, leaf_h, opts).each do |pc|
        add.call(pc[:key], pc[:count] * leaves, pc[:length_mm], pc[:width_mm],
                 pc[:thickness_mm], pc[:sheet],
                 edge: pc[:key] == 'door' || pc[:key] == 'drawer_front' ?
                       { 'front' => 1, 'back' => 1, 'top' => 1, 'bottom' => 1 } : {},
                 grain: pc[:grain], allow_rotation: pc[:grain] == 'none',
                 note: [pc[:note], note].reject { |x| x.to_s.empty? }.join(' — '))
      end
    end

    # @param template_id [String] یکی از TEMPLATES
    # @param width_cm [Numeric] عرض کابینت (سانتی‌متر)
    # @param height_cm [Numeric]
    # @param depth_cm [Numeric]
    # @param opts [Hash] :body_thickness_mm(16) :back_thickness_mm(8) :shelf_count(1) :door_swing('right')
    # @return [Array<Hash>] لیست قطعات، همان schema که ProjectScanner#extract_parts می‌خواند
    # قطعات جعبهٔ کشو — بدنه، پشت، کف.
    #
    # کابینت کشویی و دهانهٔ کشوییِ کمد **یک** جعبه دارند. اگر هرکدام فرمول
    # خودش را داشت، دو کشوی هم‌اندازه در دو یونیت دو اندازه درمی‌آمد.
    #
    # @param opening_w عرض داخلی دهانه‌ای که کشو در آن می‌نشیند
    # @param front_h ارتفاع نمای کشو
    def add_drawer_box_pieces(add, count, opening_w, front_h, depth_mm, body_mm, opts = {})
      return if count.to_i <= 0

      clearance = slide_clearance_mm(opts)
      ddepth = drawer_depth_mm(depth_mm, opts)
      side_h = drawer_side_height_mm(front_h, body_mm, opts)
      box_outer = opening_w - clearance
      back_bottom_len = box_outer - 2 * body_mm
      return if back_bottom_len <= 0 || ddepth <= 0

      add.call('drawer_side', count * 2, ddepth, side_h, body_mm,
               'mdf_white_16', edge: { 'top' => 1 })
      add.call('drawer_back', count, back_bottom_len, side_h, body_mm,
               'mdf_white_16', edge: { 'top' => 1 })
      add.call('drawer_bottom', count, back_bottom_len, ddepth, 3, 'hdf_3')
    end

    # مشخصات یونیت = پیش‌فرض تمپلیت + آنچه کاربر در دیالوگ داده.
    #
    # کاربر خواست تعداد دهانه، جای رگال، کشوی داخل دهانه، ارتفاع آزاد طبقه و
    # درب ریلی همه قابل تغییر باشند. اگر این‌ها در کد ثابت بمانند، «موتور»
    # نیست — دو تمپلیت ثابت است با نام تازه.
    def section_spec(template_id, opts = {})
      base = SECTIONED[template_id]
      return base unless base

      out = base.dup
      out['bays'] = opts[:bays].to_i if opts[:bays].to_i.positive?
      out['shelves_per_bay'] = opts[:shelf_count].to_i if opts[:shelf_count]
      out['hanging_bays'] = Array(opts[:hanging_bays]) if opts[:hanging_bays]
      out['bay_fills'] = opts[:bay_fills] if opts[:bay_fills]
      out['shelf_heights_mm'] = opts[:shelf_heights_mm] if opts[:shelf_heights_mm]
      out['drawers_per_bay'] = opts[:drawers_per_bay].to_i if opts[:drawers_per_bay]
      out['doors'] = opts[:doors].to_i if opts[:doors]
      out['door_mode'] = opts[:door_mode].to_s if opts[:door_mode]
      out
    end

    def build_parts(template_id, width_cm, height_cm, depth_cm, opts = {})
      raise ArgumentError, "قالب ناشناخته: #{template_id}" unless TEMPLATES.include?(template_id)

      w = cm_to_mm(width_cm); h = cm_to_mm(height_cm); d = cm_to_mm(depth_cm)
      body = opts[:body_thickness_mm] || 16
      backT = opts[:back_thickness_mm] || 8
      shelfCount = opts[:shelf_count] || 1

      # واژه‌نامه یک بار برای همین ساخت حل می‌شود (locale پشت فایل تنظیمات است؛
      # صداکردنش به‌ازای هر قطعه یعنی ده‌ها خواندن بیهودهٔ فایل).
      names = Glossary.all

      parts = []
      add = lambda do |key, count, len, wid, thick, sheet, edge: {}, groove: {},
                       grain: 'none', allow_rotation: true, note: ''|
        next if count.to_i <= 0
        # name_fa فقط برای خوانایی و مصرف‌کنندهٔ قدیمی است؛ مرجع همیشه key است و
        # پنل نام را در زمان **نمایش** از واژه‌نامه حل می‌کند — برای همین تغییر یک
        # واژه روی کابینت‌های از قبل ساخته‌شده هم اثر می‌کند.
        parts << { 'key' => key, 'name_fa' => names["part.#{key}"] || key, 'count' => count.to_i,
                   'cut_length_mm' => len.round, 'cut_width_mm' => wid.round, 'thickness_mm' => thick,
                   'sheet_id' => sheet, 'grain' => grain, 'allow_rotation' => allow_rotation,
                   'edge' => edge, 'groove' => groove, 'note' => note }
      end

      case template_id
      when 'base_single_door', 'base_sink_double_door'
        doors = template_id == 'base_sink_double_door' ? 2 : 1
        bottom_len = w - 2 * body
        add.call('side', 2, h, d, body, 'mdf_white_16', edge: { 'front' => 1 }, groove: { 'back' => backT })
        add.call('bottom', 1, bottom_len, d, body, 'mdf_white_16', edge: { 'front' => 1 }, groove: { 'back' => backT })
        rail_counts(template_id, opts).each do |rail_w, rail_n|
          add.call('rail_top', rail_n, bottom_len, rail_w, body, 'mdf_white_16')
        end
        add.call('shelf', template_id == 'base_single_door' ? shelfCount : 0,
                  bottom_len - SHELF_SHRINK_LEN_MM, d - SHELF_SHRINK_DEP_MM, body, 'mdf_white_16', edge: { 'front' => 1 })
        add.call('back', 1, w - body, h - body, backT, 'mdf_white_8', note: 'داخل شیار')
        door_total_w = w - DOOR_GAP_MM - (doors - 1) * DOOR_GAP_MM
        add_door_pieces(add, DoorShapes.shape_id(opts), doors,
                        door_total_w / doors.to_f, h - DOOR_GAP_MM, opts,
                        note: doors > 1 ? 'راه چوب عمودی' : '')

      when 'base_corner_diagonal'
        # هندسه: دو بال به طول `w` روی دو دیوار عمود بر هم. نمای اریب وتر
        # مثلثی است که ضلع‌هایش (w − عمقِ بال مقابل) اند.
        arm = w
        # بالِ کوتاه‌تر از عمق، کابینت گوشه نیست — وتر منفی می‌شود و قطعات
        # با ابعاد منفی ساخته می‌شوند. سکوت این‌جا یعنی کارگاه تخته‌ای با عدد
        # منفی در لیست ببیند.
        face_run = arm - d                      # ضلع مثلثِ گوشه روی هر دیوار
        diagonal = corner_diagonal_mm!(arm, d)  # وتر = پهنای نمای اریب
        inner_h = h - body                      # ارتفاع داخلی روی کف

        # دو دیوارهٔ بیرونی (روی دیوارها) — طولشان کامل است.
        add.call('side', 2, h, d, body, 'mdf_white_16',
                 edge: { 'front' => 1 }, groove: { 'back' => backT })
        # دو دیوارهٔ کوتاهِ کنارِ نمای اریب.
        add.call('side_corner', 2, inner_h, d, body, 'mdf_white_16',
                 edge: { 'front' => 1 },
                 note: 'کنار نمای اریب')

        # کف و طبقه **پنج‌ضلعی**‌اند: مستطیلی که یک گوشه‌اش با زاویهٔ ۴۵ بریده
        # شده. جدول برش ما فقط مستطیل می‌فهمد، پس ابعادِ **مستطیل محیطی** را
        # می‌دهیم و برشِ اریب را در یادداشت می‌گوییم.
        #
        # این عمدی و صریح است: عدد ورقی که سفارش می‌رود درست است (کارگاه هم
        # همین‌قدر ورق می‌برد و گوشه را دور می‌ریزد)، ولی **پرتِ گوشه در
        # آمار پرت دیده نمی‌شود**. عددِ پرتِ خوش‌بینانه از نبودِ کابینت گوشه
        # بدتر نیست، ولی باید بدانید.
        corner_note = "پنج‌ضلعی — گوشه با زاویهٔ ۴۵° به طول #{face_run.round} برش بخورد"
        add.call('bottom_corner', 1, arm - body, arm - body, body, 'mdf_white_16',
                 edge: { 'front' => 1 }, groove: { 'back' => backT },
                 allow_rotation: false, note: corner_note)
        add.call('shelf_corner', shelfCount,
                 arm - body - SHELF_SHRINK_LEN_MM, arm - body - SHELF_SHRINK_LEN_MM,
                 body, 'mdf_white_16', edge: { 'front' => 1 },
                 allow_rotation: false, note: corner_note)

        rail_counts(template_id, opts).each do |rail_w, rail_n|
          add.call('rail_top', rail_n, arm - body, rail_w, body, 'mdf_white_16')
        end

        # دو پشت‌بند، یکی روی هر دیوار.
        add.call('back', 2, arm - body, h - body, backT, 'mdf_white_8', note: 'داخل شیار')

        # نمای اریب: یک درب به پهنای وتر.
        add_door_pieces(add, DoorShapes.shape_id(opts), 1,
                        diagonal - DOOR_GAP_MM, h - DOOR_GAP_MM, opts,
                        note: 'نمای اریب گوشه')

      when 'base_three_drawer'
        drawers = opts[:drawer_count] || 3
        clearance = slide_clearance_mm(opts)
        ddepth = drawer_depth_mm(d, opts)
        bottom_len = w - 2 * body
        add.call('side', 2, h, d, body, 'mdf_white_16', edge: { 'front' => 1 }, groove: { 'back' => backT })
        add.call('bottom', 1, bottom_len, d, body, 'mdf_white_16', edge: { 'front' => 1 }, groove: { 'back' => backT })
        rail_counts(template_id, opts).each do |rail_w, rail_n|
          add.call('rail_top', rail_n, bottom_len, rail_w, body, 'mdf_white_16')
        end
        add.call('back', 1, w - body, h - body, backT, 'mdf_white_8')
        front_h = (h - DOOR_GAP_MM - (drawers - 1) * DOOR_GAP_MM) / drawers.to_f
        side_h = drawer_side_height_mm(front_h, body, opts)
        add.call('drawer_front', drawers, front_h, w - DOOR_GAP_MM, body, 'mdf_door_16',
                  edge: { 'front' => 1, 'back' => 1, 'top' => 1, 'bottom' => 1 }, grain: 'length', allow_rotation: false,
                  note: 'راه چوب عمودی')
        # عرض بیرونی جعبهٔ کشو = فضای داخلی − لقی (مجموع دو طرف)؛ پشت/کف بین
        # دو بدنه می‌نشیند. همان تابعی که دهانهٔ کشوییِ کمد هم از آن می‌خواند.
        add_drawer_box_pieces(add, drawers, bottom_len, front_h, d, body, opts)

      when *SECTIONED.keys
        spec = section_spec(template_id, opts)
        lay = Kalaxa::UnitSections.layout(w, h, d, body, spec)
        if lay['bays'].empty?
          raise ArgumentError,
                "#{template_id}: عرض #{(w / 10).round} cm برای #{spec['bays']} دهانه کافی نیست"
        end

        tb_len = w - 2 * body
        add.call('side', 2, h, d, body, 'mdf_white_16',
                 edge: { 'front' => 1 }, groove: spec['has_back'] ? { 'back' => backT } : {})
        add.call('top_bottom', 2, tb_len, d, body, 'mdf_white_16',
                 edge: { 'front' => 1 }, groove: spec['has_back'] ? { 'back' => backT } : {})

        # جداکنندهٔ میانی — همان چیزی که یک بدنهٔ ساده را به کمد دو‌دهانه
        # تبدیل می‌کند. ارتفاعش داخلی است، چون بین کف و سقف می‌نشیند.
        add.call('divider', lay['dividers'], h - 2 * body, d, body, 'mdf_white_16',
                 edge: { 'front' => 1 })

        # طبقه‌ها از موتور می‌آیند، نه از شمارش دستی: دهانهٔ رگال‌دار عمداً
        # یک طبقه کمتر می‌گیرد چون لباس آویزان جا لازم دارد.
        lay['shelves'].group_by { |sh| [sh['len'].round, sh['dep'].round] }
                      .each do |(len, dep), group|
          add.call('shelf', group.length, len, dep, body, 'mdf_white_16',
                   edge: { 'front' => 1 })
        end

        add.call('back', 1, w - body, h - body, backT, 'mdf_white_8') if spec['has_back']

        # کشوهای داخل دهانه — همان قطعاتی که کشوی کابینت دارد.
        lay['drawers'].group_by { |dr| [dr['w'].round, dr['h'].round] }
                      .each do |(bw, bh), group|
          add_drawer_box_pieces(add, group.length, bw, bh, d, body, opts)
        end

        doors = spec['doors'].to_i
        if doors.positive?
          leaf = Kalaxa::UnitSections.door_leaf(w, h, doors, DOOR_GAP_MM, spec['door_mode'])
          add_door_pieces(add, DoorShapes.shape_id(opts), doors,
                          leaf['w'], leaf['h'], opts,
                          note: leaf['mode'] == 'sliding' ? 'درب ریلی — روی هم می‌لغزد' :
                                (doors > 1 ? 'راه چوب عمودی' : ''))
        end

      when 'wall_single_door', 'tall_double_door'
        doors = template_id == 'tall_double_door' ? 2 : 1
        tb_len = w - 2 * body
        add.call('side', 2, h, d, body, 'mdf_white_16', edge: { 'front' => 1 }, groove: { 'back' => backT })
        add.call('top_bottom', 2, tb_len, d, body, 'mdf_white_16', edge: { 'front' => 1 }, groove: { 'back' => backT })
        add.call('shelf', shelfCount, tb_len - SHELF_SHRINK_LEN_MM, d - SHELF_SHRINK_DEP_MM, body,
                  'mdf_white_16', edge: { 'front' => 1 })
        add.call('back', 1, w - body, h - body, backT, 'mdf_white_8')
        shape = DoorShapes.shape_id(opts)
        if doors > 1
          door_total_h = h - DOOR_GAP_MM - (doors - 1) * DOOR_GAP_MM
          add_door_pieces(add, shape, doors, w - DOOR_GAP_MM, door_total_h / doors.to_f, opts,
                          note: 'درب بالا و پایین')
        else
          add_door_pieces(add, shape, 1, w - DOOR_GAP_MM, h - DOOR_GAP_MM, opts)
        end
      end

      parts
    end

    # کدام پارامتر برای کدام تمپلیت اصلاً معنا دارد — تا params با دادهٔ بی‌ربط آلوده نشود
    # (مثلاً drawer_count روی کابینت تک‌درب). شکل خروجی با fixture طلایی هم‌خوان است.
    HAS_SHELVES  = %w[base_single_door wall_single_door tall_double_door].freeze
    HAS_DRAWERS  = %w[base_three_drawer].freeze
    HAS_HINGED_DOORS = %w[base_single_door base_sink_double_door
                          wall_single_door tall_double_door].freeze

    # @param raw [Hash] ورودی خام کاربر (ممکن است کلیدهای بی‌ربط داشته باشد)
    # @return [Hash] فقط کلیدهای معنادار برای این تمپلیت
    def relevant_params(template_id, raw)
      out = {}
      out[:shelf_count]  = raw[:shelf_count]  if HAS_SHELVES.include?(template_id) && raw[:shelf_count]
      out[:drawer_count] = raw[:drawer_count] if HAS_DRAWERS.include?(template_id) && raw[:drawer_count]
      out[:door_swing]   = raw[:door_swing]   if HAS_HINGED_DOORS.include?(template_id) && raw[:door_swing]
      # نوع درب/نما، ریل کمد و نوع دستگیره به تمپلیت وابسته نیستند
      out[:door_type]      = raw[:door_type]      if raw[:door_type]
      # شکل ساخت درب و ابعادش — هر دو مصرف‌کننده (لیست برش و مدل) از
      # همین کلیدها می‌خوانند. ضخامت از تنظیمات می‌آید، هیچ‌جا در کد ثابت نیست.
      %i[door_shape door_thickness_mm door_frame_width_mm door_panel_thickness_mm
         door_groove_depth_mm].each do |k|
        out[k] = raw[k] if raw[k]
      end
      # پارامترهای کشو فقط برای تمپلیت کشویی معنا دارند
      if HAS_DRAWERS.include?(template_id)
        %i[slide_kind slide_clearance_mm drawer_depth_mm drawer_side_height_mm].each do |k|
          out[k] = raw[k] if raw[k]
        end
      end
      # آرایش/ابعاد قید فقط روی تمپلیت‌های زمینی معنا دارد؛ هر دو مصرف‌کننده
      # (لیست برش و هندسه) از همین کلیدها می‌خوانند.
      # پارامترهای یونیت بخش‌بندی‌شده (کمد/کتابخانه): تعداد دهانه، جای رگال،
      # کشوی داخل دهانه، ارتفاع آزاد طبقه، و درب ریلی.
      if SECTIONED.key?(template_id)
        %i[bays hanging_bays bay_fills shelf_heights_mm drawers_per_bay
           doors door_mode].each do |k|
          out[k] = raw[k] unless raw[k].nil?
        end
      end
      if Kalaxa::Catalog.railed_templates.include?(template_id)
        %i[rail_front rail_back rail_vertical_height_mm rail_horizontal_depth_mm].each do |k|
          out[k] = raw[k] if raw[k]
        end
      end
      out[:wall_rail_type] = raw[:wall_rail_type] if raw[:wall_rail_type]
      out[:handle_kind]    = raw[:handle_kind]    if raw[:handle_kind]
      out
    end

    # دستهٔ هر تمپلیت از کاتالوگ مشترک می‌آید، نه از جدول دستی این‌جا.
    #
    # جدول قبلی دستی بود و سه تمپلیت تازه (گوشه، کمد، کتابخانه) در آن نبودند،
    # پس همه 'base' حساب می‌شدند: کمد ۲۴۰ سانتی در نقشهٔ نصب مثل کابینت زمینی
    # کشیده می‌شد و صفحهٔ کار هم می‌گرفت. جدولی که با هر تمپلیت تازه باید دستی
    # به‌روز شود، دیر یا زود عقب می‌ماند.
    def category_of(template_id)
      Kalaxa::Catalog.template_category(template_id) || 'base'
    end

    # مقادیر آماده برای نوشتن مستقیم روی attribute dictionary «kalaxa_cabinet» یک گروه.
    # @return [Hash] {kalaxa_id, template_id, category, label_fa, params(JSON string), parts(JSON string)}
    def build_dict(template_id, label_fa, width_cm, height_cm, depth_cm, opts = {})
      parts = build_parts(template_id, width_cm, height_cm, depth_cm, opts)
      params = { 'cabinet_width' => width_cm.to_f, 'cabinet_height' => height_cm.to_f,
                 'cabinet_depth' => depth_cm.to_f }.merge(
                   opts.each_with_object({}) { |(k, v), h| h[k.to_s] = v unless %i[body_thickness_mm back_thickness_mm].include?(k) }
                 )
      {
        'kalaxa_id' => "kx-#{SecureRandom.hex(6)}",
        'template_id' => template_id,
        'category' => category_of(template_id),
        'label_fa' => label_fa,
        'params' => JSON.generate(params),
        'parts' => JSON.generate(parts)
      }
    end
  end
end
