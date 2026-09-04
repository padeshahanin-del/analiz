# encoding: utf-8
#
# Kalaxa::App::ImportSelection — v1.0.0
#
# «خواندن کابینتِ ساخته‌شدهٔ خودم» (مورد ۱۰ کاربر).
# کاربر کابینتی را که با روش خودش در اسکچاپ ساخته انتخاب می‌کند؛ کالاکسا هندسهٔ خام
# زیرقطعات را می‌خواند (RawGeometry)، در dictionary «kalaxa_raw_scan» روی همان گروه
# ذخیره می‌کند، و پنل آنالیز آن را با موتور تشخیص (kalaxa-part-classifier.js) نقش‌گذاری
# کرده و در یک **جدول قابل‌ویرایش** نشان می‌دهد تا کاربر چک/اصلاح کند.
#
# چرا تشخیص این‌جا انجام نمی‌شود: منطق تشخیص باید قابل تست و قابل تنظیم باشد؛ در JS
# با تست واحد و آستانه‌های داخل تنظیمات زندگی می‌کند، نه در Ruby بدون تست.
#
require 'sketchup.rb'
require 'json'
require_relative '../lib/raw_geometry'
require_relative '../lib/project_scanner'

module Kalaxa
  module App
    module ImportSelection
      # نامِ dictionary یک قرارداد بین نویسنده (همین‌جا) و خواننده (ProjectScanner) است؛
      # اسکنر صاحب schema است، پس همان ثابت را وام می‌گیریم. نسخهٔ کپی‌شدهٔ قبلی یعنی
      # تغییر نام در یک طرف، طرف دیگر را بی‌صدا کور می‌کرد.
      RAW_DICT = Kalaxa::ProjectScanner::RAW_DICT_NAME

      module_function

      def run
        model = Sketchup.active_model
        sel = model.selection.to_a.select do |e|
          e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)
        end

        if sel.empty?
          ::UI.messagebox('اول کابینت (گروه یا کامپوننت) را در صحنه انتخاب کنید، بعد این را بزنید.')
          return
        end

        imported = 0
        skipped = []
        model.start_operation('خواندن کابینت‌های انتخاب‌شده', true)
        begin
          sel.each do |ent|
            res = Kalaxa::RawGeometry.boxes_of(ent)
            if res['boxes'].empty?
              skipped << "#{display_name(ent)}: #{res['note']}"
              next
            end
            attrs = ent.attribute_dictionary(RAW_DICT, true)
            attrs['boxes_json'] = JSON.generate(res['boxes'])
            attrs['child_count'] = res['child_count']
            attrs['label_fa'] = display_name(ent)
            imported += 1
          end
          model.commit_operation
        rescue => e
          model.abort_operation
          ::UI.messagebox("خطا در خواندن هندسه: #{e.message}")
          return
        end

        msg = "#{imported} کابینت خوانده شد."
        msg += "\n\nنادیده گرفته شد:\n" + skipped.join("\n") unless skipped.empty?
        # ترتیب مهم است و کاربر واقعی رویش گیر کرد: پنل قطعات خوانده‌شده را فقط
        # پس از اسکن می‌بیند. پیام قبلی فقط می‌گفت «تب را ببینید» و کاربر تب خالی
        # می‌دید. حالا صریح می‌گوید اول اسکن.
        msg += "\n\nحالا در پنل «آنالیز برش و بهینه‌سازی ورق»:\n" \
               "۱) دکمهٔ «اسکن مدل و آنالیز» را بزنید\n" \
               '۲) بعد تب «قطعات خوانده‌شده» را باز کنید تا نقش هر قطعه را تأیید/اصلاح کنید.' if imported > 0
        ::UI.messagebox(msg)
      end

      def display_name(ent)
        n = ent.respond_to?(:name) ? ent.name.to_s : ''
        return n unless n.empty?
        if ent.is_a?(Sketchup::ComponentInstance)
          ent.definition.name.to_s
        else
          '(بدون نام)'
        end
      end
    end
  end
end
