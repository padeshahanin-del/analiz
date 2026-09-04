# encoding: utf-8
# SettingsService — ماندگاری تنظیمات پروژه در AttributeDictionary مدل (State 5)
# منطق اعتبارسنجی سمت JS است (kalaxa-settings.js)؛ اینجا فقط ذخیره/بازیابی امن.
#
# فضای نام: مستقیم زیر Kalaxa — مثل بقیهٔ ماژول‌های lib/ (ProjectScanner،
# CabinetGeometry، CabinetBuilder، RawGeometry). یک لایهٔ اضافیِ «Analysis» این‌جا
# و در OffcutStoreIO وجود داشت که با هیچ‌کدام از آن‌ها هم‌خوان نبود؛ نتیجه‌اش این شد
# که analysis_panel.rb به‌درستی طبق قاعدهٔ غالب `Kalaxa::SettingsService` نوشت و در
# زمان اجرا NameError گرفت — بی‌صدا در panel_side و پرصدا در کال‌بک‌های دیالوگ.
require 'json'

module Kalaxa
  module SettingsService
    DICT = 'kalaxa_analysis'.freeze
    KEY  = 'settings_json'.freeze
    MAX_BYTES = 200_000

    module_function

    # JSON string تنظیمات یا nil اگر ذخیره نشده/خراب
    def load(model = Sketchup.active_model)
      dict = model.attribute_dictionary(DICT)
      return nil unless dict
      raw = dict[KEY]
      return nil unless raw.is_a?(String) && !raw.empty?
      JSON.parse(raw) # فقط برای اطمینان از سالم‌بودن
      raw
    rescue JSON::ParserError
      App::Log.warn('settings_json خراب — نادیده گرفته شد') if defined?(App::Log)
      nil
    end

    # ذخیره در مدل (با اندو/Undo سازگار). ورودی نامعتبر false برمی‌گرداند.
    def save(json_str, model = Sketchup.active_model)
      return false unless json_str.is_a?(String) && json_str.bytesize <= MAX_BYTES
      JSON.parse(json_str) # اعتبار ساختاری
      model.start_operation('Kalaxa: ذخیره تنظیمات', true)
      model.set_attribute(DICT, KEY, json_str)
      model.commit_operation
      true
    rescue JSON::ParserError
      model.abort_operation rescue nil
      false
    end
  end
end
