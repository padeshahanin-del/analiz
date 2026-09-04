# encoding: utf-8
# Kalaxa::Main — بوت پلاگین یکپارچه.
# هسته (دامنه/ذخیره‌سازی/i18n/پل — میراث کابینت‌یار) + لایه آنالیز (میراث کالاکسا آنالیز)
require 'sketchup.rb'
require_relative 'version'
require_relative 'app/paths'
require_relative 'app/logging'
require_relative 'app/errors'
require_relative 'app/settings'
require_relative 'i18n/i18n'
require_relative 'domain/entities'
require_relative 'domain/document'
require_relative 'persistence/serializer'
require_relative 'adapter/store'
require_relative 'adapter/sync_port'
require_relative 'ui/dialog'
require_relative 'analysis_panel'
require_relative 'app/create_cabinet_tool'
require_relative 'app/place_object_tool'
require_relative 'app/create_moulding_tool'
require_relative 'app/import_selection'
require_relative 'app/adopt_cabinet'

module Kalaxa
  module Main
    module_function

    # ترتیب عمدی: ثبت منو **اول** انجام می‌شود. منو تنها راه ورود کاربر به افزونه است،
    # پس نباید به موفقیت لاگ‌گیری (که به فایل‌سیستم و APPDATA دست می‌زند) وابسته باشد.
    # اگر ثبت منو شکست بخورد، صریح گزارش می‌شود — حالت «نه منو، نه خطا» بدترین حالت است.
    def boot
      return if @booted
      @booted = true

      if defined?(::UI) && ::UI.respond_to?(:menu)
        begin
          register_menu
        rescue StandardError => e
          ::UI.messagebox("خطا در ساخت منوی کالاکسا:\n#{e.class}: #{e.message}")
          raise
        end
      end

      begin
        App::Log.level = :debug if File.exist?(File.join(__dir__, 'DEV_BUILD'))
        App::Log.info('Kalaxa booted', version: Kalaxa::VERSION,
                                       sketchup: (defined?(Sketchup) ? Sketchup.version : 'n/a'))
      rescue StandardError
        nil # خرابی لاگ هرگز نباید افزونه را بی‌منو کند
      end
    end

    def register_menu
      menu = ::UI.menu('Extensions').add_submenu('Kalaxa | کالاکسا')
      menu.add_item('افزودن کابینت کالاکسا...') { Kalaxa::App::CreateCabinetTool.prompt_and_activate }
      menu.add_item('افزودن صفحه/قرنیز کالاکسا...') { Kalaxa::App::CreateMouldingTool.prompt_and_activate }
      menu.add_item('افزودن لوازم (سینک، اجاق، فر…)') { Kalaxa::App::PlaceObjectTool.prompt_and_activate }
      menu.add_item('خواندن کابینت انتخاب‌شده (ساختهٔ خودم)') { Kalaxa::App::ImportSelection.run }
      menu.add_separator
      menu.add_item('آنالیز برش و بهینه‌سازی ورق') { Kalaxa::AnalysisPanel.show_dialog }
      menu.add_item('خروجی kitchen_snapshot.json') do
        begin
          path = Kalaxa::ProjectScanner.export_snapshot
          ::UI.messagebox("snapshot ذخیره شد:\n#{path}")
        rescue => e
          App::Log.error('snapshot export failed', message: e.message)
          ::UI.messagebox("خطا: #{e.message}")
        end
      end
      menu.add_separator
      menu.add_item('پنل پایه (تست پل و زبان)') { Kalaxa::UI::Dialog.show }
      # پیش از حذف افزونه باید پنجره‌ها بسته شوند: پنجرهٔ باز یک مرورگر
      # تعبیه‌شده است که فایل‌های پوشهٔ پلاگین را در دست دارد، و حذف آن
      # پوشه زیر پای پروسهٔ زنده روی ویندوز اسکچاپ را می‌بندد.
      menu.add_item('بستن پنجره‌های کالاکسا (پیش از حذف افزونه)') do
        Kalaxa::AnalysisPanel.close_dialog
        Kalaxa::UI::Dialog.close
        ::UI.messagebox('پنجره‌های کالاکسا بسته شد. حالا می‌توانید افزونه را حذف کنید.')
      end
      menu.add_item('About') do
        ::UI.messagebox("Kalaxa v#{Kalaxa::VERSION}\nSketchUp #{Kalaxa::TARGET_SKETCHUP.join(' / ')}")
      end
    end
  end
end

Kalaxa::Main.boot
