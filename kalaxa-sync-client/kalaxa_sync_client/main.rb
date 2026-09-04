# frozen_string_literal: true

require 'sketchup.rb'

module Kalaxa
  module SyncClient
    # وابستگی سخت به هستهٔ Kalaxa؛ در نبودش منو با پیام راهنما جایگزین می‌شود.
    def self.core_loaded?
      defined?(Kalaxa::Adapter::Store) &&
        defined?(Kalaxa::Persistence::Serializer) &&
        defined?(Kalaxa::App::Paths)
    end

    unless file_loaded?(__FILE__)
      menu = ::UI.menu('Extensions').add_submenu('Kalaxa Sync')
      if core_loaded?
        require_relative 'client'
        menu.add_item('وضعیت سرور') { Client.cmd_status }
        menu.add_item('Push به سرور') { Client.cmd_push }
        menu.add_item('Pull از سرور') { Client.cmd_pull }
        menu.add_separator
        menu.add_item('تنظیمات…') { Client.cmd_settings }
      else
        menu.add_item('پلاگین اصلی Kalaxa یافت نشد (v3.1.0+ لازم است)') do
          ::UI.messagebox('Kalaxa Sync Client به پلاگین اصلی Kalaxa نیاز دارد؛ ابتدا آن را نصب/فعال کنید.')
        end
      end
      file_loaded(__FILE__)
    end
  end
end
