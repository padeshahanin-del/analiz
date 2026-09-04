# encoding: utf-8
# frozen_string_literal: true

# Kalaxa::Materials — متریال به‌عنوان یک مفهوم درجه‌یک: تفکیک‌پذیر و مدل‌سازی‌شدنی.
#
# تا این نسخه «متریال» فقط یک رشتهٔ فرعی داخل تعریف ورق بود. دو نتیجه داشت:
#   ۱) تفکیک — گزارش‌ها و نستینگ بر اساس ورق گروه می‌شدند، ولی خودِ متریال
#      (MDF ساده در برابر هایگلاس در برابر شیشه) جای مستقلی نداشت.
#   ۲) مدل‌سازی — همهٔ قطعات در صحنه یک‌رنگ بودند؛ شیشه از MDF قابل تشخیص نبود.
#
# این فایل هر دو را حل می‌کند: کاتالوگ متریال با رنگ و شفافیت (برای اسکچاپ) و
# نگاشت «کلید قطعه → ورق → متریال» به‌عنوان تنها منبع حقیقت — همان الگویی که برای
# قید و شکل درب جواب داد.
#
# رنگ‌ها عمداً کم‌اشباع‌اند: مدل باید خوانا باشد، نه رنگارنگ. شیشه شفاف است تا
# داخل کابینت پشتش دیده شود.
require_relative 'glossary'
require_relative 'catalog'

module Kalaxa
  module Materials
    # کاتالوگ از data/materials.json می‌آید — همان فایلی که JS هم می‌خواند.
    # پیش از این، رنگ‌ها و نگاشت‌ها فقط در Ruby بودند و JS راهی به آن‌ها نداشت.
    module_function

    def catalog = Catalog.materials
    def ids = Catalog.material_ids
    def default_id = Catalog.default_material
    def sheet_material_map = Catalog.sheet_material_map
    def non_sheet_key_material = Catalog.non_sheet_key_material
    def key_sheet_map = Catalog.key_sheet_map
    def glass_prefix = Catalog.glass_sheet_prefix

    # سازگاری عقب‌رو با کدی که ثابت‌ها را مستقیم می‌خواند.
    def self.const_missing(name)
      case name
      when :CATALOG then catalog
      when :IDS then ids
      when :DEFAULT then default_id
      when :SHEET_MATERIAL then sheet_material_map
      when :NON_SHEET_KEY_MATERIAL then non_sheet_key_material
      when :KEY_SHEET then key_sheet_map
      else super
      end
    end


    def spec(id) = catalog[id] || catalog[default_id]

    def sheet_material(sheet_id)
      s = sheet_id.to_s
      return 'glass' if s.start_with?(glass_prefix)

      sheet_material_map[s] || default_id
    end

    def key_sheet(key) = key_sheet_map[key.to_s]

    # متریال یک قطعه در مدل: اول قطعات غیرورقی، بعد از راه ورق.
    def for_key(key, sheet_id = nil)
      direct = non_sheet_key_material[key.to_s]
      return direct if direct

      sheet_material(sheet_id || key_sheet(key) || '')
    end

    def sheet_goods?(id) = spec(id)['sheet_goods']

    # نام نمایشی از واژه‌نامه — پس مثل بقیهٔ واژگان قابل تغییر است.
    def label(id) = Glossary.t(spec(id)['glossary'])

    # نام متریال در اسکچاپ. پیشوند دارد تا با متریال‌های خود کاربر قاطی نشود و
    # بشود همه را یک‌جا پیدا/عوض کرد.
    def sketchup_name(id) = "Kalaxa #{label(id)}"

    def rgb(id) = spec(id)['rgb']
    def alpha(id) = spec(id)['alpha']
    def transparent?(id) = spec(id)['alpha'] < 1.0
  end
end
