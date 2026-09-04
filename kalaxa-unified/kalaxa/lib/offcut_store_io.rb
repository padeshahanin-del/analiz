# encoding: utf-8
# OffcutStoreIO — ماندگاری انبار آفکات در فایل JSON خارج از Plugins (State 10)
# منطق (نرمال‌سازی، برداشت، مصرف) سمت JS است (kalaxa-offcut-store.js)؛ اینجا فقط I/O امن.
#
# فضای نام: مستقیم زیر Kalaxa — دلیلش در settings_service.rb توضیح داده شده.
require 'json'
require 'fileutils'

module Kalaxa
  module OffcutStoreIO
    MAX_BYTES = 2_000_000
    EMPTY = '{"store_version":1,"offcuts":[]}'

    module_function

    def path
      File.join(App::Paths.user_data_dir, 'offcut_inventory.json')
    end

    # محتوای فایل یا JSON انبار خالی
    def load
      return EMPTY unless File.exist?(path)
      raw = File.read(path)
      return EMPTY if raw.bytesize > MAX_BYTES
      raw
    rescue StandardError => e
      App::Log.error('offcut load failed', message: e.message) if defined?(App::Log)
      EMPTY
    end

    # نوشتن اتمیک: tmp سپس rename
    def save(json_str)
      return false unless json_str.is_a?(String) && json_str.bytesize <= MAX_BYTES
      JSON.parse(json_str)
      tmp = path + '.tmp'
      File.write(tmp, json_str)
      FileUtils.mv(tmp, path)
      true
    rescue StandardError => e
      App::Log.error('offcut save failed', message: e.message) if defined?(App::Log)
      false
    end
  end
end
