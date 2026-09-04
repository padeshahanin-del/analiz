# encoding: utf-8
#
# KalaxaCabinet::Analysis — main.rb
# منو + مدیریت HtmlDialog + callback های Ruby↔JS
#
# نکات محیطی رعایت‌شده (از ممیزی پلاگین اصلی):
#   - @dialog در متغیر ماژول نگه داشته می‌شود تا CEF آن را GC نکند
#   - window.print در CEF غیرقابل‌اتکاست → چاپ با ذخیره HTML و باز کردن در مرورگر
#   - هیچ‌چیز داخل پوشه Plugins نوشته نمی‌شود (read-only) — خروجی کنار مدل یا temp
#   - داده به JS با JSON + inspect پاس می‌شود (escape امن؛ فارسی UTF-8 مشکلی ندارد)
#
require 'sketchup.rb'
require 'json'
require 'tmpdir'
require_relative 'version'
require_relative 'app/logging'
require_relative 'app/paths'
require_relative 'lib/project_scanner'
require_relative 'lib/settings_service'
require_relative 'lib/glossary'
require_relative 'lib/catalog'
require_relative 'lib/offcut_store_io'
require_relative 'adapter/store'
require_relative 'domain/entities'

module Kalaxa
  module AnalysisPanel

    PLUGIN_DIR = File.dirname(__FILE__)

    class << self

      def show_dialog
        if @dialog && @dialog.visible?
          @dialog.bring_to_front
          return
        end

        @dialog = ::UI::HtmlDialog.new(
          dialog_title: "آنالیز برش کالاکسا v#{VERSION}",
          preferences_key: 'com.kalaxa.analysis',
          resizable: true,
          width: 1100,
          height: 780,
          style: ::UI::HtmlDialog::STYLE_DIALOG
        )
        @dialog.set_file(File.join(PLUGIN_DIR, 'ui', 'analysis_panel.html'))
        register_callbacks(@dialog)
        # رها کردن پنجره پس از بسته شدن.
        #
        # بدون این، `@dialog` تا پایان جلسهٔ اسکچاپ زنده می‌ماند — و پنجره
        # یعنی یک مرورگر تعبیه‌شده که فایل‌های `ui/` را از پوشهٔ پلاگین باز
        # نگه داشته. اگر همان لحظه افزونه حذف شود، ویندوز پوشه‌ای را پاک
        # می‌کند که فایل‌هایش هنوز در دست یک پروسهٔ زنده‌اند. این تنها
        # چیزی در کل افزونه بود که بعد از بسته‌شدن پنجره هم به دیسک
        # چسبیده می‌ماند.
        @dialog.set_on_closed { @dialog = nil }
        @dialog.show
      end

      # بستن صریح پنل. پیش از حذف افزونه باید صدا زده شود، وگرنه فایل‌های
      # `ui/` در دست پنجره می‌مانند.
      def close_dialog
        @dialog&.close
        @dialog = nil
      end

      def dialog_open? = !@dialog.nil?

      private

      # 'right' (پیش‌فرض) یا 'left' — از همان تنظیماتی که پنل ذخیره می‌کند
      def panel_side
        raw = Kalaxa::SettingsService.load
        return 'right' unless raw
        cfg = JSON.parse(raw)
        pnl = cfg['project'] && cfg['project']['panel']
        side = pnl.is_a?(Hash) ? pnl['side'] : nil
        %w[left right].include?(side) ? side : 'right'
      rescue StandardError
        'right'
      end

      def register_callbacks(dialog)

        # چسباندن پنل به لبهٔ راست/چپ صفحه. اندازهٔ صفحه از خود JS می‌آید چون SketchUp
        # Ruby API متدی برای خواندن ابعاد نمایشگر ندارد. طرفش از تنظیمات پروژه می‌آید
        # (project.panel.side) — خواستهٔ کاربر: «قابل تنظیم چپ یا راست».
        dialog.add_action_callback('dock_panel') do |_ctx, screen_w, screen_h|
          begin
            sw = screen_w.to_i
            sh = screen_h.to_i
            next if sw <= 0

            side = panel_side
            width = [[sw / 3, 420].max, 900].min
            height = [sh - 80, 400].max
            dialog.set_size(width, height)
            x = side == 'left' ? 0 : [sw - width, 0].max
            dialog.set_position(x, 0)
          rescue StandardError => e
            App::Log.warn('dock_panel failed', message: e.message) if defined?(App::Log)
          end
        end

        # اسکن مدل → snapshot → ارسال به JS
        dialog.add_action_callback('scan_model') do |_ctx|
          begin
            t0 = Time.now
            snapshot = Kalaxa::ProjectScanner.build_snapshot
            App::Log.info('scan ok', ms: ((Time.now - t0) * 1000).round, cabinets: snapshot['cabinets'].length)
            push_json(dialog, 'onSnapshot', snapshot)
          rescue => e
            App::Log.error('scan failed', message: e.message)
            push_json(dialog, 'onError', { 'message' => "خطای اسکن: #{e.message}" })
          end
        end

        # --- تنظیمات پروژه (ماندگار در مدل) ---
        dialog.add_action_callback('load_settings') do |_ctx|
          push_json(dialog, 'onVersion', { 'version' => VERSION })
          raw = Kalaxa::SettingsService.load
          push_json(dialog, 'onSettings', { 'settings_json' => raw })
        end
        dialog.add_action_callback('save_settings') do |_ctx, json_str|
          ok = Kalaxa::SettingsService.save(json_str)
          App::Log.info('settings save', ok: ok)
          push_json(dialog, ok ? 'onSaved' : 'onError',
                    ok ? { 'kind' => 'settings' } : { 'message' => 'تنظیمات نامعتبر — ذخیره نشد' })
        end

        # --- کاتالوگ دامنه (شکل درب، ورق، متریال، قید) ---
        # پنل نمی‌تواند فایل محلی را با fetch بخواند، پس Ruby همان JSONهایی را که
        # خودش می‌خواند تزریق می‌کند. بدون این، KalaxaCatalog در پنل بارگذاری‌نشده
        # می‌ماند و هر موتوری که به آن تکیه کند خطا می‌دهد.
        dialog.add_action_callback('load_catalog') do |_ctx|
          push_json(dialog, 'onCatalog', Kalaxa::Catalog.payload)
        end

        # --- واژه‌نامهٔ کارگاه ---
        # بدون این دو کال‌بک، موتورهای JS هرگز واژه‌نامه را نمی‌دیدند و نام یراق و
        # واحدها همیشه رشتهٔ پیش‌فرض می‌ماند — یعنی نیمی از «کلمات قابل تغییر» مرده بود.
        dialog.add_action_callback('load_glossary') do |_ctx|
          push_json(dialog, 'onGlossary', Kalaxa::Glossary.payload)
        end
        dialog.add_action_callback('save_glossary') do |_ctx, json_str|
          ok = begin
            map = JSON.parse(json_str.to_s)
            Kalaxa::Glossary.save_overrides(map.is_a?(Hash) ? map : {})
          rescue JSON::ParserError
            false
          end
          App::Log.info('glossary save', ok: ok)
          if ok
            push_json(dialog, 'onGlossary', Kalaxa::Glossary.payload)
            push_json(dialog, 'onSaved', { 'kind' => 'glossary' })
          else
            push_json(dialog, 'onError', { 'message' => 'واژه‌نامه ذخیره نشد' })
          end
        end

        # --- انبار ماندگار آفکات (فایل خارج از Plugins) ---
        dialog.add_action_callback('load_offcut_inventory') do |_ctx|
          push_json(dialog, 'onOffcutInventory', { 'store_json' => Kalaxa::OffcutStoreIO.load })
        end
        dialog.add_action_callback('save_offcut_inventory') do |_ctx, json_str|
          ok = Kalaxa::OffcutStoreIO.save(json_str)
          App::Log.info('offcut inventory save', ok: ok)
          push_json(dialog, ok ? 'onSaved' : 'onError',
                    ok ? { 'kind' => 'offcuts' } : { 'message' => 'انبار آفکات ذخیره نشد' })
        end

        # ذخیره snapshot روی دیسک
        dialog.add_action_callback('save_snapshot') do |_ctx, json_str|
          begin
            path = choose_out_path('kitchen_snapshot.json')
            if path
              File.write(path, json_str)
              push_json(dialog, 'onSaved', { 'path' => path, 'kind' => 'snapshot' })
            end
          rescue => e
            push_json(dialog, 'onError', { 'message' => "خطای ذخیره: #{e.message}" })
          end
        end

        # خروجی چاپ: HTML کامل از JS می‌آید، در فایل نوشته و در مرورگر باز می‌شود
        # سند دامنه → تب جانمایی (schema v3)
        dialog.add_action_callback('load_doc') do |_ctx|
          begin
            state = Kalaxa::Adapter::Store.load_document(Sketchup.active_model)
            if state.nil?
              push_json(dialog, 'onDoc', { 'doc' => nil })
            elsif state['ok']
              push_json(dialog, 'onDoc', { 'doc' => state['doc'], 'meta' => state['meta'] })
            else
              push_json(dialog, 'onError', { 'message' => state['error']['message'] })
            end
          rescue => e
            App::Log.error('load_doc failed', message: e.message)
            push_json(dialog, 'onError', { 'message' => "خطای بارگیری سند: #{e.message}" })
          end
        end

        # ذخیرهٔ جانمایی‌ها: { unit_id => placement|nil } — روی سند اعمال و در مدل ذخیره می‌شود
        dialog.add_action_callback('save_placements') do |_ctx, json_str|
          begin
            placements = JSON.parse(json_str)
            model = Sketchup.active_model
            state = Kalaxa::Adapter::Store.load_document(model)
            raise Kalaxa::Error, 'مدل سند کالاکسا ندارد' if state.nil? || !state['ok']

            doc = state['doc']
            doc['entities']['units'].each do |u|
              next unless placements.key?(u['id'])

              pl = placements[u['id']]
              if pl.nil?
                u.delete('placement')
              else
                unless Kalaxa::Domain::Entities.valid_placement?(pl)
                  raise Kalaxa::ValidationError, "placement نامعتبر برای یونیت #{u['name'] || u['id']}"
                end
                u['placement'] = pl
              end
            end
            Kalaxa::Adapter::Store.save_document(model, doc)
            App::Log.info('placements saved', count: placements.size)
            push_json(dialog, 'onPlacementsSaved', { 'doc' => doc })
          rescue Kalaxa::Error => e
            push_json(dialog, 'onError', { 'message' => e.message })
          rescue => e
            App::Log.error('save_placements failed', message: e.message)
            push_json(dialog, 'onError', { 'message' => "خطای ذخیرهٔ جانمایی: #{e.message}" })
          end
        end

        # تبدیل کابینت خوانده‌شده به کابینت پارامتریک.
        # ابعاد و تمپلیت را پنل حساب کرده (kalaxa-adopt.js) — این‌جا فقط اجرا
        # می‌شود، تا قواعد تشخیص نقش دو نسخه نداشته باشند.
        dialog.add_action_callback('adopt_cabinet') do |_ctx, json_str|
          begin
            res = Kalaxa::App::AdoptCabinet.run(JSON.parse(json_str))
            App::Log.info('cabinet adopted', label: res['label_fa'])
            push_json(dialog, 'onAdopted', res)
          rescue Kalaxa::Error => e
            push_json(dialog, 'onError', { 'message' => e.message })
          rescue => e
            App::Log.error('adopt failed', message: e.message)
            push_json(dialog, 'onError', { 'message' => "خطای تبدیل: #{e.message}" })
          end
        end

        dialog.add_action_callback('export_print') do |_ctx, html_str|
          begin
            path = File.join(out_dir, "kalaxa_cutmaps_#{Time.now.strftime('%Y%m%d_%H%M%S')}.html")
            File.write(path, html_str)
            ::UI.openURL('file:///' + path.tr('\\', '/'))
            push_json(dialog, 'onSaved', { 'path' => path, 'kind' => 'print' })
          rescue => e
            push_json(dialog, 'onError', { 'message' => "خطای خروجی چاپ: #{e.message}" })
          end
        end

        # برچسب قطعات: HTML از JS، ذخیره و باز شدن در مرورگر برای چاپ
        dialog.add_action_callback('export_labels') do |_ctx, html_str|
          begin
            path = File.join(out_dir, "kalaxa_labels_#{Time.now.strftime('%Y%m%d_%H%M%S')}.html")
            File.write(path, html_str)
            ::UI.openURL('file:///' + path.tr('\\', '/'))
            push_json(dialog, 'onSaved', { 'path' => path, 'kind' => 'labels' })
          rescue => e
            push_json(dialog, 'onError', { 'message' => "خطای خروجی برچسب: #{e.message}" })
          end
        end

        # خروجی اکسل (CSV). محتوا را JS می‌سازد — همان قاعده‌ای که برای چاپ
        # و برچسب هم هست: تولید در یک جا، ذخیره در یک جا.
        #
        # **binwrite** عمدی است: `File.write` روی ویندوز LF را به CRLF تبدیل
        # می‌کند و چون CSV از قبل CRLF دارد، هر سطر یک خط خالی می‌گیرد و اکسل
        # فایل را دوبرابر و خراب نشان می‌دهد. BOM هم باید بایت‌به‌بایت برود.
        dialog.add_action_callback('export_csv') do |_ctx, json_str|
          begin
            payload = JSON.parse(json_str)
            name = payload['name'].to_s.gsub(/[^a-zA-Z0-9_\-]/, '')
            name = 'kalaxa' if name.empty?
            # پسوند از خودِ فراخوان می‌آید (csv یا json)؛ فیلتر می‌شود تا مسیر
            # ساختگی نسازد.
            ext = payload['ext'].to_s.gsub(/[^a-z]/, '')
            ext = 'csv' if ext.empty?
            path = File.join(out_dir, "#{name}_#{Time.now.strftime('%Y%m%d_%H%M%S')}.#{ext}")
            File.binwrite(path, payload['content'].to_s)
            ::UI.openURL('file:///' + path.tr('\\', '/'))
            push_json(dialog, 'onSaved', { 'path' => path, 'kind' => 'csv' })
          rescue => e
            push_json(dialog, 'onError', { 'message' => "خطای خروجی اکسل: #{e.message}" })
          end
        end

        # وارد کردن بستهٔ تمپلیت (JSON). مثل ورودی اکسل: فایل را کاربر
        # انتخاب می‌کند و روبی فقط می‌خواند — اعتبارسنجی و ادغام سمت پنل است،
        # چون قواعدش همان‌جاست و دو نسخه نمی‌شود.
        dialog.add_action_callback('import_template_pack') do |_ctx, _unused|
          begin
            path = ::UI.openpanel('بستهٔ تمپلیت (JSON) را انتخاب کنید', out_dir, 'JSON|*.json||')
            if path.nil? || path.to_s.empty?
              push_json(dialog, 'onTemplatePack', { 'cancelled' => true })
            else
              push_json(dialog, 'onTemplatePack',
                        { 'path' => path, 'content' => File.binread(path).force_encoding('UTF-8') })
            end
          rescue => e
            push_json(dialog, 'onError', { 'message' => "خطای خواندن بسته: #{e.message}" })
          end
        end

        # ورودی اکسل: فایل را کاربر انتخاب می‌کند، روبی فقط می‌خواند.
        dialog.add_action_callback('import_csv') do |_ctx, _unused|
          begin
            path = ::UI.openpanel('فایل اکسل (CSV) را انتخاب کنید', out_dir, 'CSV|*.csv;*.txt||')
            if path.nil? || path.to_s.empty?
              push_json(dialog, 'onCsvImported', { 'cancelled' => true })
            else
              push_json(dialog, 'onCsvImported',
                        { 'path' => path, 'content' => File.binread(path).force_encoding('UTF-8') })
            end
          rescue => e
            push_json(dialog, 'onError', { 'message' => "خطای خواندن فایل: #{e.message}" })
          end
        end
      end

      # ارسال امن داده به JS: JSON دوبار encode می‌شود و سمت JS یک‌بار parse
      def push_json(dialog, fn, obj)
        payload = JSON.generate(obj)
        # جلوگیری از شکستن context اسکریپت با توالی‌های خطرناک
        literal = payload.inspect.gsub('</', '<\/').gsub("\u2028", '\u2028').gsub("\u2029", '\u2029')
        dialog.execute_script("#{fn}(#{literal})")
      end

      def out_dir
        model = Sketchup.active_model
        if model.path && !model.path.empty?
          File.dirname(model.path)
        else
          Dir.tmpdir
        end
      end

      def choose_out_path(default_name)
        ::UI.savepanel('ذخیره فایل', out_dir, default_name)
      end

    end

  end
end
