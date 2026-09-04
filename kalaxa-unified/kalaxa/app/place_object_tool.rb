# encoding: utf-8
#
# Kalaxa::App::PlaceObjectTool — گذاشتن لوازم در مدل
#
# کاتالوگ لوازم (۳.۶۳) موتور داشت ولی **راه ورودی نداشت**: نه منویی برای
# گذاشتن سینک، نه جایی که در اسنپ‌شات بیاید. همان الگویی که یک بار با
# «قطعات دستی» تجربه شد — فرمی که کار نمی‌کند از نبودش بدتر است.
#
# این فایل حلقه را می‌بندد: کاربر از منو لوازم را انتخاب می‌کند، در صحنه
# کلیک می‌کند، و یک گروه با dictionary «kalaxa_object» ساخته می‌شود. اسکنر
# همان را می‌خواند و پنل بریدگی و فهرست کالا را می‌سازد.
#
# **جعبه، نه مدل واقعی.** ابعاد درست است ولی ظاهر ساده. اگر کاربر کامپوننت
# خودش را در تنظیمات به همان id وصل کند، همین گروه با کامپوننت او جایگزین
# می‌شود و ابعاد و بریدگی دست‌نخورده می‌ماند.
require 'sketchup.rb'
require_relative '../lib/catalog'
require_relative '../lib/settings_service'
require 'json'

module Kalaxa
  module App
    module PlaceObjectTool
      module_function

      DICT_NAME = 'kalaxa_object'.freeze
      MM_TO_INCH = 1.0 / 25.4

      # لوازم کاتالوگ + آنچه کارگاه در تنظیمات اضافه کرده.
      def objects
        base = Kalaxa::Catalog.object_defs.dup
        custom.each do |o|
          id = o['id'].to_s
          next if id.empty?

          base[id] = (base[id] || {}).merge(o)
        end
        base
      end

      def custom
        raw = Kalaxa::SettingsService.load
        return [] unless raw

        cfg = JSON.parse(raw)
        list = cfg.dig('project', 'objects', 'custom_objects')
        list.is_a?(Array) ? list : []
      rescue StandardError
        []
      end

      def prompt_and_activate
        defs = objects
        ids = defs.keys
        if ids.empty?
          ::UI.messagebox('کاتالوگ لوازم خالی است')
          return
        end

        labels = ids.map { |id| defs[id]['label_fa'] || id }
        result = ::UI.inputbox(['لوازم'], [labels.first], [labels.join('|')],
                               'افزودن لوازم')
        return unless result

        id = ids[labels.index(result[0]) || 0]
        Sketchup.active_model.select_tool(Tool.new(id, defs[id]))
      end

      # Tool ساده: یک کلیک = یک آبجکت در همان نقطه.
      class Tool
        MM_TO_INCH = 1.0 / 25.4

        def initialize(object_id, spec)
          @object_id = object_id
          @spec = spec || {}
          @ip = Sketchup::InputPoint.new
        end

        def activate
          ::Sketchup.set_status_text(
            "محل «#{@spec['label_fa'] || @object_id}» را کلیک کنید — Esc برای لغو"
          )
        end

        def onMouseMove(_flags, x, y, view)
          @ip.pick(view, x, y)
          view.invalidate
        end

        def onLButtonUp(_flags, _x, _y, _view)
          return unless @ip.valid?

          place(@ip.position)
          Sketchup.active_model.select_tool(nil)
        end

        def place(origin)
          model = Sketchup.active_model
          model.start_operation('افزودن لوازم کالاکسا', true)
          begin
            group = model.active_entities.add_group
            build_box(group, origin)
            group.name = @spec['label_fa'] || @object_id
            write_dict(group)
            model.commit_operation
          rescue StandardError => e
            # نیمه‌ساخته در مدل نمی‌ماند: یا کامل، یا هیچ.
            model.abort_operation
            ::UI.messagebox("خطای افزودن لوازم: #{e.message}")
          end
        end

        def build_box(group, origin)
          w = num(@spec['w']) * MM_TO_INCH
          d = num(@spec['d']) * MM_TO_INCH
          h = num(@spec['h']) * MM_TO_INCH
          face = group.entities.add_face(
            origin,
            origin.offset(Geom::Vector3d.new(w, 0, 0)),
            origin.offset(Geom::Vector3d.new(w, d, 0)),
            origin.offset(Geom::Vector3d.new(0, d, 0))
          )
          face.reverse! if face.normal.z < 0
          face.pushpull(h)
        end

        # dictionary همان چیزی است که اسکنر می‌خواند. بریدگی هم این‌جا نوشته
        # می‌شود تا اگر کاربر بعداً ابعاد کاتالوگ را عوض کرد، آبجکتِ **ساخته‌شده**
        # همان عددی را نگه دارد که با آن ساخته شده.
        def write_dict(group)
          d = group.attribute_dictionary(DICT_NAME, true)
          d['object_id'] = @object_id
          d['label_fa'] = @spec['label_fa'].to_s
          d['group'] = @spec['group'].to_s
          d['unit'] = (@spec['unit'] || 'عدد').to_s
          d['w_mm'] = num(@spec['w'])
          d['d_mm'] = num(@spec['d'])
          d['h_mm'] = num(@spec['h'])
          d['mount'] = (@spec['mount'] || '').to_s
          d['min_cabinet_w'] = num(@spec['min_cabinet_w'])
          cut = @spec['cutout']
          d['cutout_json'] = cut.is_a?(Hash) ? JSON.generate(cut) : ''
        end

        def num(v)
          v.to_f
        end
      end
    end
  end
end
