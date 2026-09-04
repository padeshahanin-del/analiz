# frozen_string_literal: true

require 'json'
require_relative 'bridge'
require_relative '../app/logging'

module Kalaxa
  module UI
    # مدیریت پنجرهٔ HtmlDialog. این فایل تنها جای اتصال Bridge به ::UI::HtmlDialog است.
    module Dialog
      DIST = File.join(__dir__, 'dist')

      module_function

      def show
        if @dialog&.visible?
          @dialog.bring_to_front
          return @dialog
        end
        @dialog = build
        @dialog.show
        App::Log.info('panel opened')
        @dialog
      end

      def close
        @dialog&.close
        @dialog = nil
      end

      def build
        dialog = ::UI::HtmlDialog.new(
          dialog_title: 'Kalaxa | کالاکسا',
          preferences_key: 'com.kalaxa.panel',
          style: ::UI::HtmlDialog::STYLE_DIALOG,
          width: 420, height: 520, min_width: 360, min_height: 420,
          resizable: true
        )
        dialog.set_file(File.join(DIST, 'index.html'))
        dialog.add_action_callback('ky_message') do |_ctx, raw|
          response = Bridge.handle_raw(raw)
          push(dialog, response)
        end
        # `@dialog = nil` لازم است نه فقط لاگ: پنجرهٔ بسته‌شده‌ای که مرجعش
        # باقی می‌ماند، فایل‌های پوشهٔ پلاگین را در دست نگه می‌دارد و حذف
        # افزونه را روی ویندوز خطرناک می‌کند.
        dialog.set_on_closed do
          @dialog = nil
          App::Log.info('panel closed')
        end
        dialog
      end

      # ارسال امن JSON به رابط: دوبار encode تا هر کاراکتری (از جمله U+2028/2029)
      # به‌صورت رشتهٔ جاوااسکریپتی معتبر منتقل شود و در رابط JSON.parse شود.
      def push(dialog, hash)
        js_string = JSON.generate(JSON.generate(hash))
                        .gsub("\u2028", '\u2028').gsub("\u2029", '\u2029')
        dialog.execute_script("KY.receive(#{js_string})")
      end

      def about_text
        state = Bridge.state_payload
        t = ->(k) { I18n.t(k, state['locale']) }
        [
          "#{t.call('app.title')} — #{t.call('app.subtitle')}",
          "#{t.call('about.version')}: #{state['version']}",
          "#{t.call('about.targets')}: #{state['targets'].join(', ')}",
          "#{t.call('about.build')}: #{state['build']['type']}"
        ].join("\n")
      end

      def show_about
        ::UI.messagebox(about_text)
      end
    end
  end
end
