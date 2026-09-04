# encoding: utf-8
# frozen_string_literal: true

# Kalaxa::Catalog — دادهٔ دامنه، یک منبع، هر دو زبان.
#
# چرا این فایل هست: شکل درب، ورق‌ها، متریال و قید هر کدام در Ruby و JS **جدا**
# نوشته شده بودند و فقط تست‌های «آینه‌سنجی» جلوی واگراییشان را می‌گرفتند. آن تست‌ها
# واگرایی را می‌گرفتند ولی جلویش را نمی‌گرفتند: هر افزودن شکل یا ورق تازه یعنی دو
# ویرایش در دو زبان، و فراموشیِ یکی یعنی قطعه‌ای که در یکی هست و در دیگری نیست
# (دقیقاً چیزی که با ورق `glass_4` رخ داد).
#
# حالا کاتالوگ‌ها JSON‌اند و هر دو طرف همان بایت‌ها را می‌خوانند:
#   Ruby → همین فایل
#   JS   → ui/kalaxa-catalog.js (در Node از دیسک، در پنل از همین Ruby تزریق می‌شود)
#
# این همان چیزی است که پورت به میزبان تازه را ممکن می‌کند: میزبان جدید فقط باید
# «مدل را بخواند و snapshot بسازد»؛ کاتالوگ‌ها و موتورها بدون تغییر می‌آیند.
require 'json'

module Kalaxa
  module Catalog
    DIR = File.join(__dir__, '..', 'data')
    FILES = %w[door_shapes materials sheets rails edges countertops templates objects snapshot system32].freeze

    class MissingCatalogError < StandardError; end

    module_function

    def path(name) = File.join(DIR, "#{name}.json")

    # کاتالوگ نبود یا خراب بود = خطای مرگبار، نه بازگشت خاموش به پیش‌فرض.
    # نیمی از دامنه بدون کاتالوگ یعنی لیست برشِ غلط — و لیست برشِ غلط بدتر از
    # نبودِ لیست برش است.
    def load(name)
      @cache ||= {}
      @cache[name.to_s] ||= begin
        p = path(name)
        raise MissingCatalogError, "کاتالوگ پیدا نشد: #{p}" unless File.exist?(p)

        JSON.parse(File.read(p, encoding: 'UTF-8')).reject { |k, _| k.start_with?('_') }
      rescue JSON::ParserError => e
        raise MissingCatalogError, "کاتالوگ خراب است (#{name}): #{e.message}"
      end
    end

    def reset! = @cache = nil

    # ---------------- دسترسی‌های نام‌دار ----------------

    def door_shapes = load('door_shapes')['shapes']
    def door_shape_ids = door_shapes.keys
    def default_door_shape = load('door_shapes')['default_shape']
    def door_type_to_shape = load('door_shapes')['type_to_shape']

    def materials = load('materials')['materials']
    def material_ids = materials.keys
    def default_material = load('materials')['default_material']
    def glass_sheet_prefix = load('materials')['glass_sheet_prefix']
    def sheet_material_map = load('materials')['sheet_material']
    def non_sheet_key_material = load('materials')['non_sheet_key_material']
    def key_sheet_map = load('materials')['key_sheet']

    # لوازم و آبجکت‌های آشپزخانه — خریدنی‌اند، نه بریدنی.
    def object_defs = load('objects')['objects']
    def object_groups = load('objects')['groups']
    def object_spec(id) = object_defs[id]

    # سیستم ۳۲ — پارامتر سوراخ پین. همان فایلی که KalaxaSystem32 در جاوااسکریپت
    # می‌خواند، تا شبکهٔ سوراخِ نقشه و ترازِ طبقهٔ مدل نتوانند واگرا شوند.
    def pin_system = load('system32')

    # دسته‌بندی تمپلیت‌ها و اندازه‌های رایج هرکدام.
    def template_groups = load('templates')['groups']
    def template_defs = load('templates')['templates']
    def template_category(id) = (template_defs[id] || {})['category']
    def template_group(id) = (template_defs[id] || {})['group']
    def template_presets(id) = (template_defs[id] || {})['presets'] || []
    def template_label(id) = (template_defs[id] || {})['label_fa']

    # انواع صفحهٔ کار — طول شاخهٔ هرکدام از کارگاه آمده، نه از استاندارد کاغذی.
    def countertop_types = load('countertops')['types']
    def default_countertop_type = load('countertops')['default_type']

    def sheets = load('sheets')['sheets']
    def sheet_ids = sheets.map { |s| s['sheet_id'] }
    def cutting = load('sheets')['cutting']

    # ---------------- قرارداد snapshot ----------------
    # نسخه از این‌جا می‌آید، نه از ثابتِ داخل ProjectScanner — تولیدکننده و
    # مصرف‌کننده (kalaxa-schema.js) باید همیشه یک عدد ببینند.
    def snapshot = load('snapshot')
    def snapshot_version = snapshot['current_version']
    def snapshot_supported = snapshot['supported_versions']
    def snapshot_required_top_level = snapshot['required_top_level']
    def snapshot_required_part_fields = snapshot['required_part_fields']

    def rails = load('rails')
    def rail_horizontal_mm = rails['horizontal_depth_mm']
    def rail_vertical_mm = rails['vertical_height_mm']
    def railed_templates = rails['railed_templates']
    def rail_front_forced_horizontal = rails['front_forced_horizontal_templates']
    def rail_back_forced_none = rails['back_forced_none_templates'] || []
    def rail_default_front = rails['default_front_style']
    def rail_default_back = rails['default_back_style']

    # بستهٔ آماده برای تزریق به پنل — همان چیزی که JS می‌خواند.
    def payload
      FILES.each_with_object({}) { |n, h| h[n] = load(n) }
    end

    def to_json_payload = JSON.generate(payload)
  end
end
