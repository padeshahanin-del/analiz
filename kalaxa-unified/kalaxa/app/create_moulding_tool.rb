# encoding: utf-8
#
# Kalaxa::App::CreateMouldingTool — v1.0.0
#
# ابزار «افزودن صفحه/قرنیز» — چون مفهوم کانترتاپ/صفحه در مدل اسکن‌شده وجود
# ندارد (نه schema، نه ProjectScanner قبلی)، تا این نسخه کاربر باید طول/عرض/
# برگشت هر صفحه را دستی در پنل شیت قیمت وارد می‌کرد (v3.17.0). این ابزار آن
# حلقه را می‌بندد: کاربر حین چیدمان در خود اسکچاپ صفحه را با کلیک می‌سازد؛
# attribute dictionary «kalaxa_moulding_board» رویش نوشته می‌شود که
# ProjectScanner (v1.3.0) آن را می‌خواند و به‌صورت خودکار وارد شیت قیمت
# می‌شود — بدون نیاز به ورودی دستی تکراری (فقط برای صفحات اضافه‌ای که در
# مدل نیستند، ورودی دستی هنوز در دسترس است).
#
require 'sketchup.rb'
require 'securerandom'

module Kalaxa
  module App
    module CreateMouldingTool
      module_function

      CM_TO_INCH = 1.0 / 2.54
      BOARD_THICKNESS_MM = 30 # فقط برای نمایش بصری؛ در محاسبات قیمت دخیل نیست

      def prompt_and_activate
        prompts = ['برچسب', 'طول (cm)', 'عرض (cm)', 'تعداد برگشت']
        defaults = ['کانتر/قرنیز جدید', '300', '60', '0']
        result = ::UI.inputbox(prompts, defaults, [], 'افزودن صفحه/قرنیز کالاکسا')
        return unless result

        label_fa, length_cm, width_cm, returns = result
        Sketchup.active_model.select_tool(
          PlaceMouldingTool.new(label_fa, length_cm.to_f, width_cm.to_f, returns.to_i)
        )
      end

      class PlaceMouldingTool
        def initialize(label_fa, length_cm, width_cm, returns_count)
          @label_fa = label_fa
          @length_cm = length_cm
          @width_cm = width_cm
          @returns_count = returns_count
          @ip = Sketchup::InputPoint.new
        end

        def activate
          ::Sketchup.set_status_text('محل قرارگیری صفحه/قرنیز را کلیک کنید — Esc برای لغو')
        end

        def onMouseMove(_flags, x, y, view)
          @ip.pick(view, x, y)
          view.invalidate
        end

        def draw(view)
          return unless @ip.valid?
          len = @length_cm * CM_TO_INCH
          wid = @width_cm * CM_TO_INCH
          o = @ip.position
          pts = [
            o, o.offset(Geom::Vector3d.new(len, 0, 0)),
            o.offset(Geom::Vector3d.new(len, wid, 0)), o.offset(Geom::Vector3d.new(0, wid, 0))
          ]
          view.line_stipple = '-'
          view.draw(GL_LINE_LOOP, pts)
        end

        def onLButtonUp(_flags, x, y, view)
          @ip.pick(view, x, y)
          origin = @ip.position
          model = view.model
          model.start_operation('افزودن صفحه/قرنیز کالاکسا', true)
          begin
            group = build_board_group(model, origin)
            attrs = group.attribute_dictionary('kalaxa_moulding_board', true)
            attrs['board_id'] = "kx-mld-#{SecureRandom.hex(6)}"
            attrs['label_fa'] = @label_fa
            attrs['length_mm'] = (@length_cm * 10).round
            attrs['width_mm'] = (@width_cm * 10).round
            attrs['returns'] = @returns_count
            group.name = @label_fa
            model.commit_operation
          rescue => e
            model.abort_operation
            ::UI.messagebox("خطا در ساخت صفحه/قرنیز: #{e.message}")
          end
          model.active_view.invalidate
        end

        def onCancel(_reason, _view)
          ::Sketchup.set_status_text('')
        end

        private

        MM_TO_INCH = 1.0 / 25.4

        # مثل CreateCabinetTool: هندسه در مختصات محلی ساخته و بعد گروه با
        # transformation جابه‌جا می‌شود (نه ساخت مستقیم در مختصات جهانی).
        def build_board_group(model, origin)
          len = @length_cm * CM_TO_INCH
          wid = @width_cm * CM_TO_INCH
          thick = BOARD_THICKNESS_MM * MM_TO_INCH
          group = model.entities.add_group
          face = group.entities.add_face(
            ::ORIGIN, ::ORIGIN.offset(Geom::Vector3d.new(len, 0, 0)),
            ::ORIGIN.offset(Geom::Vector3d.new(len, wid, 0)), ::ORIGIN.offset(Geom::Vector3d.new(0, wid, 0))
          )
          face.reverse! if face.normal.z < 0
          face.pushpull(thick)
          group.transformation = Geom::Transformation.new(origin)
          group
        end
      end
    end
  end
end
