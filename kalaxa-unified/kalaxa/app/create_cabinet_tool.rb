# encoding: utf-8
#
# Kalaxa::App::CreateCabinetTool — v1.0.0
#
# اولین ابزار «چیدمان» واقعی داخل اسکچاپ. کاربر از منو نوع/ابعاد کابینت را
# در یک دیالوگ ساده وارد می‌کند (UI.inputbox)، سپس با یک Tool در صحنه کلیک
# می‌کند — یک گروه کابینت با ساب‌گروه‌های جدا برای هر قطعهٔ منطقی
# (دیواره/کف/قید بالا/طبقه/پشت‌بند/درب/کشو) در موقعیت واقعی ساخته می‌شود
# (Kalaxa::CabinetGeometry)، و attribute dictionary «kalaxa_cabinet» (طبق
# فرمول‌های CabinetBuilder) روی گروه بیرونی نوشته می‌شود — یعنی بلافاصله با
# «اسکن مدل و آنالیز» قابل شناسایی است.
# توجه: خودِ محاسبات قیمت/نستینگ از attribute «parts» می‌آید، نه از این
# هندسه — پس حتی اگر جای‌گذاری بصری کامل دقیق نباشد، شیت قیمت درست است.
#
require 'sketchup.rb'
require_relative '../lib/cabinet_builder'
require_relative '../lib/cabinet_geometry'
require_relative '../lib/settings_service'
require_relative '../lib/door_shapes'
require_relative '../lib/materials'
require 'json'

module Kalaxa
  module App
    module CreateCabinetTool
      module_function

      TEMPLATE_LABELS_FA = {
        'base_single_door'      => 'کابینت زمینی تک‌درب',
        'base_three_drawer'     => 'کابینت زمینی سه‌کشو',
        'base_sink_double_door' => 'کابینت سینک دو‌درب',
        'base_corner_diagonal' => 'کابینت گوشه (نمای اریب)',
        'wall_single_door'      => 'کابینت هوایی تک‌درب',
        'tall_double_door'      => 'کابینت قدی دو‌درب',
        'wardrobe'              => 'کمد لباس (رگال + طبقه)',
        'bookcase'              => 'کتابخانه (باز)',
        'base_open'             => 'قفسهٔ باز زمینی',
        'wall_open'             => 'قفسهٔ باز هوایی',
        'wall_double_door'      => 'کابینت هوایی دو‌درب',
        'tall_pantry'           => 'کابینت قدی آذوقه',
        'wardrobe_sliding'      => 'کمد درب‌ریلی'
      }.freeze

      CM_TO_INCH = 1.0 / 2.54

      # نوع درب — روی موتور «پروفیل درب آلومینیومی» اثر مستقیم دارد: فقط دو نوع
      # ۲۰میلی (شیشه‌ای/آلومینیومی و MDF فریم آلومینیوم) فریم آلومینیوم می‌گیرند.
      DOOR_TYPES = %w[mdf laminate highgloss membrane paint glass_aluminum mdf_aluminum_frame].freeze
      # ریل کمد دیواری — 'none' یعنی این کابینت اصلاً ریل ندارد.
      WALL_RAIL_TYPES = %w[none plain edged blum fantoni meleni].freeze
      DOOR_SWINGS = %w[right left].freeze

      # اعداد کشو/ریل از تنظیمات پروژه (همان JSON که پنل ذخیره می‌کند) خوانده می‌شود،
      # نه ثابت در کد — خواستهٔ صریح کاربر: «قابل تغییر و تنظیم باشد».
      # اگر تنظیماتی ذخیره نشده باشد، پیش‌فرض‌های CabinetBuilder استفاده می‌شوند.
      def drawer_settings
        raw = Kalaxa::SettingsService.load
        return {} unless raw
        cfg = JSON.parse(raw)
        d = cfg['project'] && cfg['project']['drawer']
        d.is_a?(Hash) ? d : {}
      rescue StandardError
        {}
      end

      # opts مربوط به کشو بر اساس نوع ریل انتخابی + تنظیمات پروژه
      def drawer_opts(slide_kind)
        d = drawer_settings
        key = slide_kind == 'bottom' ? 'bottom_total_clearance_mm' : 'ball_total_clearance_mm'
        out = { slide_kind: slide_kind }
        out[:slide_clearance_mm] = d[key].to_f if d[key]
        out[:drawer_depth_mm] = d['depth_mm'].to_f if d['depth_mm'].to_f > 0
        out[:drawer_side_height_mm] = d['side_height_mm'].to_f if d['side_height_mm'].to_f > 0
        out
      end
      # اعداد درب از تنظیمات پروژه (project.doors) — هیچ ضخامتی در کد ثابت نیست.
      # ۰ یعنی «چیزی نگفته‌ام» → پیش‌فرض همان شکل در DoorShapes.
      def door_settings
        raw = Kalaxa::SettingsService.load
        return {} unless raw

        cfg = JSON.parse(raw)
        d = cfg['project'] && cfg['project']['doors']
        d.is_a?(Hash) ? d : {}
      rescue StandardError
        {}
      end

      # opts مربوط به درب: شکل از دیالوگ، ابعاد از تنظیمات.
      def door_opts(shape)
        d = door_settings
        out = { door_shape: shape }
        { door_thickness_mm: 'thickness_mm', door_frame_width_mm: 'frame_width_mm',
          door_panel_thickness_mm: 'panel_thickness_mm',
          door_groove_depth_mm: 'groove_depth_mm' }.each do |opt_key, cfg_key|
          v = d[cfg_key].to_f
          out[opt_key] = v if v.positive?
        end
        out
      end

      # نوع دستگیره — هم در مدل کشیده می‌شود هم در params ثبت می‌شود.
      # bar = میله‌ای بیرون‌زده | hidden = مخفی/گاولا (فرورفتگی لبهٔ بالا) | none = بدون دستگیره
      HANDLE_KINDS = %w[bar hidden none].freeze

      # مرحلهٔ اول: نوع + اندازهٔ آماده.
      #
      # اندازه‌های آماده از کاتالوگ می‌آیند (data/templates.json) — همان
      # مدول‌هایی که کارگاه واقعاً می‌سازد.
      def pick_template_and_size(labels)
        result = ::UI.inputbox(['نوع یونیت'], [labels.first], [labels.join('|')],
                               'افزودن یونیت کالاکسا — مرحلهٔ ۱ از ۲')
        return nil unless result

        template_id = Kalaxa::CabinetBuilder::TEMPLATES[labels.index(result[0]) || 0]
        presets = begin
          Kalaxa::Catalog.template_presets(template_id)
        rescue StandardError
          []
        end
        return { template_id: template_id, w: 80, h: 72, d: 55 } if presets.empty?

        names = presets.map { |p| p['label_fa'] }
        pick = ::UI.inputbox(['اندازه'], [names.first], [names.join('|')],
                             'افزودن یونیت کالاکسا — اندازه')
        return nil unless pick

        chosen = presets[names.index(pick[0]) || 0]
        { template_id: template_id, w: chosen['w'], h: chosen['h'], d: chosen['d'],
          opts: symbolize(chosen['opts']) }
      end

      # کلیدهای کاتالوگ رشته‌اند ولی opts سیمبل می‌خواهد؛ بدون این، پیش‌تنظیمِ
      # «۲۰۰ سه‌دهانه» بی‌صدا نادیده گرفته می‌شد.
      def symbolize(hash)
        return {} unless hash.is_a?(Hash)

        hash.each_with_object({}) { |(k, v), out| out[k.to_sym] = v }
      end

      # مرحلهٔ دوم: فقط فیلدهای مربوط به همین تمپلیت.
      #
      # `reader` مقادیر را به opts تبدیل می‌کند — نگاشت در همان جایی که
      # فیلدها تعریف شده‌اند، وگرنه ترتیبشان روزی جابه‌جا می‌شود و مقدارِ
      # «تعداد دهانه» در «تعداد کشو» می‌نشیند، بی‌آنکه خطایی بدهد.
      def template_prompts(template_id)
        b = Kalaxa::CabinetBuilder
        if b::SECTIONED.key?(template_id)
          sectioned_prompts(template_id)
        elsif b::HAS_DRAWERS.include?(template_id)
          { prompts: ['تعداد کشو', 'نوع ریل کشو'],
            defaults: ['3', 'ball'],
            lists: ['', b::SLIDE_KINDS.join('|')],
            reader: ->(v) { { drawer_count: [v[0].to_i, 1].max, slide_kind: v[1] } } }
        else
          { prompts: ['تعداد طبقه', 'جهت لولا', 'ریل کمد دیواری'],
            defaults: ['1', 'right', 'none'],
            lists: ['', DOOR_SWINGS.join('|'), WALL_RAIL_TYPES.join('|')],
            reader: lambda { |v|
              out = { shelf_count: v[0].to_i, door_swing: v[1] }
              out[:wall_rail_type] = v[2] unless v[2] == 'none'
              out
            } }
        end
      end

      def sectioned_prompts(template_id)
        spec = Kalaxa::CabinetBuilder::SECTIONED[template_id]
        has_doors = spec['doors'].to_i.positive?
        prompts = ['تعداد دهانه', 'طبقه در هر دهانه',
                   'دهانه‌های رگال‌دار (شماره، با کاما — خالی یعنی ندارد)',
                   'کشو در دهانهٔ اول (۰ یعنی ندارد)']
        defaults = [spec['bays'].to_s, spec['shelves_per_bay'].to_s,
                    Array(spec['hanging_bays']).map { |i| i + 1 }.join(','), '0']
        lists = ['', '', '', '']
        if has_doors
          prompts += ['نوع درب']
          defaults += ['hinged']
          lists += ['hinged|sliding']
        end

        { prompts: prompts, defaults: defaults, lists: lists,
          reader: lambda { |v|
            out = { bays: v[0].to_i, shelf_count: v[1].to_i }
            # شمارهٔ دهانه از **یک** شروع می‌شود چون کاربر این‌طور می‌شمرد؛
            # داخل موتور از صفر است.
            hang = v[2].to_s.split(/[,،]/).map { |x| x.strip.to_i - 1 }.select { |i| i >= 0 }
            out[:hanging_bays] = hang
            drawers = v[3].to_i
            if drawers.positive?
              fills = Array.new(out[:bays]) do |i|
                { 'type' => hang.include?(i) ? 'hanging' : 'shelves' }
              end
              fills[0] = { 'type' => 'drawers', 'drawers' => drawers }
              out[:bay_fills] = fills
            end
            out[:door_mode] = v[4] if v[4]
            out
          } }
      end

      # از منو صدا زده می‌شود: مشخصات را می‌پرسد و Tool چیدمان را فعال می‌کند.
      # همهٔ پارامترهایی که موتورهای بعدی (پروفیل درب، ریل کمد، نمای کابینت) می‌خوانند
      # این‌جا پرسیده می‌شوند — وگرنه آن موتورها روی کابینت‌های ساخته‌شده با این ابزار
      # هرگز فعال نمی‌شدند (params.door_type / door_swing / wall_rail_type).
      def prompt_and_activate
        labels = Kalaxa::CabinetBuilder::TEMPLATES.map { |t| TEMPLATE_LABELS_FA[t] || t }
        # شکل ساخت درب با برچسب فارسی از واژه‌نامه (پس قابل تغییر است)؛
        # پیش‌فرضش از تنظیمات پروژه می‌آید، نه ثابت در کد.
        shape_ids = Kalaxa::DoorShapes::IDS
        shape_labels = Kalaxa::DoorShapes.labels
        saved_shape = door_settings['shape']
        default_shape_label = shape_labels[shape_ids.index(saved_shape) || 0]

        # **دو مرحله**، عمداً.
        #
        # یک دیالوگ صاف با همهٔ فیلدها یعنی کاربرِ کتابخانه هم «نوع ریل کشو»
        # را ببیند و کاربرِ کمد «جهت لولا»ی بی‌ربط را. با اضافه‌شدن پارامترهای
        # کمد (دهانه، رگال، کشو، درب ریلی) این فهرست غیرقابل‌استفاده می‌شد.
        #
        # مرحلهٔ اول فقط نوع و اندازهٔ آماده را می‌پرسد؛ مرحلهٔ دوم فقط آنچه
        # به همان تمپلیت مربوط است.
        picked = pick_template_and_size(labels)
        return unless picked

        template_id = picked[:template_id]
        prompts  = ['برچسب', 'عرض (cm)', 'ارتفاع (cm)', 'عمق (cm)',
                    'شکل درب', 'نوع درب (رویه)', 'نوع دستگیره']
        defaults = ['کابینت جدید', picked[:w].to_s, picked[:h].to_s, picked[:d].to_s,
                    default_shape_label, 'mdf', 'bar']
        lists    = ['', '', '', '',
                    shape_labels.join('|'), DOOR_TYPES.join('|'), HANDLE_KINDS.join('|')]

        extra = template_prompts(template_id)
        prompts += extra[:prompts]
        defaults += extra[:defaults]
        lists += extra[:lists]

        result = ::UI.inputbox(prompts, defaults, lists,
                               "افزودن #{TEMPLATE_LABELS_FA[template_id] || template_id}")
        return unless result

        label_fa, width_cm, height_cm, depth_cm,
          shape_choice, door_type, handle_kind = result[0, 7]
        values = result[7..-1] || []

        door_shape = shape_ids[shape_labels.index(shape_choice) || 0]
        raw_opts = { door_type: door_type, handle_kind: handle_kind }
        raw_opts.merge!(picked[:opts] || {})
        raw_opts.merge!(extra[:reader].call(values))
        raw_opts.merge!(door_opts(door_shape))
        raw_opts.merge!(drawer_opts(raw_opts.delete(:slide_kind) || 'ball'))
        # فقط پارامترهای معنادار برای این تمپلیت (مثلاً drawer_count روی تک‌درب نرود)
        opts = Kalaxa::CabinetBuilder.relevant_params(template_id, raw_opts)
        Sketchup.active_model.select_tool(
          PlaceCabinetTool.new(template_id, label_fa, width_cm.to_f, height_cm.to_f, depth_cm.to_f, opts)
        )
      end

      # Tool ساده: یک کلیک در صحنه = ساخت کابینت در همان نقطه (گوشهٔ جلو-چپ-پایین).
      class PlaceCabinetTool
        MM_TO_INCH = 1.0 / 25.4

        def initialize(template_id, label_fa, width_cm, height_cm, depth_cm, opts = {})
          @template_id = template_id
          @label_fa = label_fa
          @width_cm = width_cm
          @height_cm = height_cm
          @depth_cm = depth_cm
          @opts = opts || {}
          @ip = Sketchup::InputPoint.new
        end

        def activate
          ::Sketchup.set_status_text('محل قرارگیری کابینت را کلیک کنید — Esc برای لغو')
        end

        def onMouseMove(_flags, x, y, view)
          @ip.pick(view, x, y)
          view.invalidate
        end

        def draw(view)
          return unless @ip.valid?
          w = @width_cm * CM_TO_INCH
          d = @depth_cm * CM_TO_INCH
          h = @height_cm * CM_TO_INCH
          o = @ip.position
          pts = [
            o, o.offset(Geom::Vector3d.new(w, 0, 0)),
            o.offset(Geom::Vector3d.new(w, d, 0)), o.offset(Geom::Vector3d.new(0, d, 0))
          ]
          view.line_stipple = '-'
          view.draw(GL_LINE_LOOP, pts)
          top = pts.map { |p| p.offset(Geom::Vector3d.new(0, 0, h)) }
          view.draw(GL_LINE_LOOP, top)
        end

        def onLButtonUp(_flags, x, y, view)
          @ip.pick(view, x, y)
          origin = @ip.position
          model = view.model
          model.start_operation('افزودن کابینت کالاکسا', true)
          begin
            # همان مسیرِ `build_at` — نه کپی‌اش. تا ۳.۷۳ این شش خط این‌جا
            # تکرار شده بود، در حالی که کامنت `build_at` ادعا می‌کرد «مسیر
            # دومی نمی‌سازد». هندسه مشترک بود ولی نوشتن دیکشنری و نام‌گذاری
            # دو نسخه داشت؛ یعنی هر میدان تازه‌ای در dict باید در دو جا
            # اضافه می‌شد و کلیکِ کاربر می‌توانست بی‌صدا از تبدیل عقب بماند.
            group = self.class.build_at(model, origin, @template_id, @label_fa,
                                        @width_cm, @height_cm, @depth_cm, @opts)
            model.commit_operation
          rescue => e
            model.abort_operation
            ::UI.messagebox("خطا در ساخت کابینت: #{e.message}")
          end
          model.active_view.invalidate
        end

        def onCancel(_reason, _view)
          ::Sketchup.set_status_text('')
        end

        # ساختِ کابینت **بدون کلیک کاربر** — برای تبدیل کابینت خوانده‌شده به
        # پارامتریک (AdoptCabinet) لازم شد.
        #
        # عمداً همان مسیرِ ساختِ کلیک را می‌رود و مسیر دومی نمی‌سازد: اگر تبدیل
        # کپیِ خودش را از منطق ساخت داشت، هر اصلاحی در یکی باید در دیگری هم
        # تکرار می‌شد و یکی‌شان عقب می‌ماند.
        def self.build_at(model, origin, template_id, label_fa, w_cm, h_cm, d_cm, opts = {})
          tool = new(template_id, label_fa, w_cm, h_cm, d_cm, opts)
          group = tool.send(:build_cabinet_group, model, origin)
          dict = Kalaxa::CabinetBuilder.build_dict(template_id, label_fa, w_cm, h_cm, d_cm, opts)
          attrs = group.attribute_dictionary('kalaxa_cabinet', true)
          dict.each { |k, v| attrs[k] = v }
          group.name = label_fa
          group
        end

        private

        # کابینت را می‌سازد: یک گروه بیرونی حاوی یک ساب‌گروه جدا برای هر قطعهٔ
        # منطقی (دیواره/کف/درب/...) در موقعیت واقعی‌اش — Kalaxa::CabinetGeometry.
        #
        # مهم: هندسه در مختصات **محلی** (نسبت به ORIGIN) ساخته می‌شود و بعد کل گروه
        # با transformation به نقطهٔ کلیک منتقل می‌شود. اگر مستقیم در مختصات جهانی
        # ساخته می‌شد، transformation گروه identity می‌ماند و ProjectScanner برای
        # همهٔ کابینت‌ها origin_cm = [0,0,0] گزارش می‌کرد — یعنی «نقشه نصب» و
        # چک‌های وابسته به موقعیت (kalaxa-rules) همهٔ کابینت‌ها را روی هم می‌دیدند.
        def build_cabinet_group(model, origin)
          cabinet_group = model.entities.add_group
          boxes = Kalaxa::CabinetGeometry.boxes_for(@template_id, @width_cm, @height_cm, @depth_cm, @opts)
          boxes.each do |b|
            add_part_box(cabinet_group, ::ORIGIN, b)
          end
          cabinet_group.transformation = Geom::Transformation.new(origin)
          cabinet_group
        end

        def add_part_box(parent_group, origin, b)
          x0 = origin.offset(Geom::Vector3d.new(b['x'] * MM_TO_INCH, b['y'] * MM_TO_INCH, b['z'] * MM_TO_INCH))
          dx = b['dx'] * MM_TO_INCH
          dy = b['dy'] * MM_TO_INCH
          dz = b['dz'] * MM_TO_INCH
          part_group = parent_group.entities.add_group
          face = part_group.entities.add_face(
            x0, x0.offset(Geom::Vector3d.new(dx, 0, 0)),
            x0.offset(Geom::Vector3d.new(dx, dy, 0)), x0.offset(Geom::Vector3d.new(0, dy, 0))
          )
          face.reverse! if face.normal.z < 0
          face.pushpull(dz)
          part_group.name = part_name(b)
          carve_rout(part_group, x0, b) if b['rout']
          # چرخش حول Z، حول گوشهٔ خودِ قطعه.
          #
          # نمای اریبِ کابینت گوشه با هیچ جعبهٔ محوری‌ای درست درنمی‌آید. اگر
          # این‌جا اعمال نشود، هندسه یک درب صاف می‌کشد که سر جایش نیست —
          # و چون خطایی نمی‌دهد، فقط در مدل دیده می‌شود.
          rotate_part(part_group, x0, b['rot_z_deg']) if b['rot_z_deg']
          apply_material(part_group, b['material'])
          part_group
        end

        def rotate_part(part_group, corner, deg)
          angle = deg.to_f * Math::PI / 180.0
          tr = Geom::Transformation.rotation(corner, Geom::Vector3d.new(0, 0, 1), angle)
          part_group.transform!(tr)
        rescue StandardError
          # چرخش تزئینی نیست، ولی نبودش نباید جلوی ساخت کابینت را بگیرد.
          nil
        end

        # فرورفتگی طرحِ درب فرزخورده را روی همان قطعه می‌کَنَد.
        #
        # جلوی درب y کمینه است (نما به بیرون، y منفی)، پس فرورفتگی از همان وجه
        # به داخل می‌رود. یک گروه می‌ماند — فقط وجه‌هایش بیشتر می‌شود، که خودش
        # همان نشانه‌ای است که اسکنر «کار ماشین» می‌خواند.
        #
        # خرابی فرز نباید جلوی ساخت کابینت را بگیرد: بدون فرورفتگی هم درب درست
        # است، ولی بدون درب کابینت نیست.
        def carve_rout(part_group, x0, b)
          inset = b['rout']['inset_mm'] * MM_TO_INCH
          depth = b['rout']['depth_mm'] * MM_TO_INCH
          dx = b['dx'] * MM_TO_INCH
          dz = b['dz'] * MM_TO_INCH
          return if dx - 2 * inset <= 0 || dz - 2 * inset <= 0

          p0 = x0.offset(Geom::Vector3d.new(inset, 0, inset))
          face = part_group.entities.add_face(
            p0,
            p0.offset(Geom::Vector3d.new(dx - 2 * inset, 0, 0)),
            p0.offset(Geom::Vector3d.new(dx - 2 * inset, 0, dz - 2 * inset)),
            p0.offset(Geom::Vector3d.new(0, 0, dz - 2 * inset))
          )
          return unless face

          # به داخل قطعه (به سمت +y) — از وجه جلویی شروع می‌کنیم، پس این ماده
          # برمی‌دارد نه اینکه بیرون بزند.
          face.pushpull(depth)
        rescue StandardError => e
          Kalaxa::App::Log.warn("فرز طرح درب کنده نشد: #{e.message}") if defined?(Kalaxa::App::Log)
        end

        # نام گروه در مدل = واژهٔ خودِ کارگاه، نه کلید انگلیسی.
        #
        # تا این نسخه گروه‌ها `side`، `shelf`، `drawer_side` نام می‌گرفتند. سه
        # ایراد داشت: در Outliner اسکچاپ برای کارگاه فارسی‌زبان بی‌معنا بود؛ اگر
        # کاربر واژهٔ دیگری به کار می‌برد («بادخور» به‌جای «درز») جایی منعکس
        # نمی‌شد؛ و مهم‌تر — از نسخهٔ ۳.۳۹ خودِ کلاسیفایر **نام** را می‌خواند، پس
        # کابینتی که کالاکسا ساخته بود موقع اسکنِ دوباره از نام خودش کمکی
        # نمی‌گرفت.
        #
        # کلید انگلیسی در انتهای نام می‌ماند تا هم ماشین بتواند دقیق تطبیق دهد و
        # هم قطعات هم‌نقش در Outliner کنار هم مرتب شوند.
        def part_name(b)
          key = b['key'].to_s
          # از همان واژه‌نامه‌ای می‌خواند که کاربر در تب تنظیمات ویرایش می‌کند —
          # اگر کارگاه «بادخور» بگوید، نام گروه در مدل هم همان می‌شود.
          fa = begin
            Kalaxa::Glossary.t("part.#{key}")
          rescue StandardError
            nil
          end
          fa = nil if fa.nil? || fa.empty? || fa == "part.#{key}"
          fa ? "#{fa} [#{key}]" : key
        end

        # متریال را روی گروه قطعه می‌نشاند تا در صحنه قابل تفکیک باشد (شیشه از MDF،
        # هایگلاس از ساده). خرابی متریال هرگز نباید جلوی ساخت کابینت را بگیرد —
        # هندسه مهم است، رنگ تزئینی.
        def apply_material(part_group, material_id)
          return if material_id.nil?

          mat = find_or_create_material(part_group.model, material_id)
          part_group.material = mat if mat
        rescue StandardError => e
          Kalaxa::App::Log.warn('material apply failed', message: e.message) if defined?(Kalaxa::App::Log)
          nil
        end

        # متریال‌ها یک‌بار ساخته و بعد دوباره استفاده می‌شوند — وگرنه هر کابینت تازه
        # یک مشت متریال تکراری به مدل اضافه می‌کرد. کاربر می‌تواند رنگشان را در خود
        # اسکچاپ عوض کند و دفعهٔ بعد همان را می‌گیرد (ما فقط وقتی نباشد می‌سازیم).
        def find_or_create_material(model, material_id)
          name = Kalaxa::Materials.sketchup_name(material_id)
          existing = model.materials[name]
          return existing if existing

          mat = model.materials.add(name)
          mat.color = Sketchup::Color.new(*Kalaxa::Materials.rgb(material_id))
          alpha = Kalaxa::Materials.alpha(material_id)
          mat.alpha = alpha if alpha < 1.0
          mat
        end
      end
    end
  end
end
