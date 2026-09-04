# encoding: utf-8
# frozen_string_literal: true

# Kalaxa::Glossary — واژگان کارگاه، روی لایهٔ ترجمه.
#
# دو مسئلهٔ جدا که عمداً جدا مانده‌اند:
#
#   ۱) ترجمه (I18n) — «این محصول به چه زبانی حرف می‌زند؟»
#      یک فایل برای هر زبان: i18n/fa.json، i18n/en.json. افزودن زبان تازه = افزودن
#      یک فایل، بدون دست‌زدن به کد.
#
#   ۲) واژگان کارگاه (همین فایل) — «در این کارگاه، این مفهوم را چه صدا می‌زنند؟»
#      کاربر گفت: «توی این نوشتی درز بالا، ما می‌گیم بادخور، شاید کسی دیگه بگه
#      عاصف». مفهوم ثابت است، اسمش متغیر. پس بازنویسی‌های کاربر روی ترجمهٔ زبان
#      فعال می‌نشیند — و **به تفکیک زبان** ذخیره می‌شود، وگرنه «بادخورِ» فارسی
#      روی خروجی انگلیسی نشت می‌کرد.
#
# قرارداد کلید: `part.side`، `hw.hinge`، `term.reveal` — پایدار و همیشگی. کد فقط
# کلید را می‌شناسد، پس تغییر واژه هیچ‌چیز را نمی‌شکند. کلید ناشناخته → خودِ کلید
# برگردانده می‌شود، نه استثنا: یک واژهٔ جاافتاده نباید جلوی تولید لیست برش را بگیرد.
#
# آینه‌اش در JS: ui/kalaxa-glossary.js — همان فایل‌ها، همان معناشناسی.
# test_glossary.rb و test_glossary.js تضمین می‌کنند از هم جدا نیفتند.
require 'json'
require_relative '../app/paths'
require_relative '../app/settings'
require_relative '../i18n/i18n'

module Kalaxa
  module Glossary
    USER_FILE = 'glossary.json'
    MAX_BYTES = 200_000

    module_function

    def user_path
      File.join(App::Paths.user_data_dir, USER_FILE)
    end

    def locale
      App::Settings.locale
    rescue StandardError
      'fa'
    end

    # پیشنهادهای هم‌معنی برای همان مفهوم — تا کاربر لازم نباشد از صفر تایپ کند.
    # نبودن فایل برای یک زبان کاملاً عادی است (زبان تازه هنوز پیشنهاد ندارد).
    def alternatives(loc = locale)
      @alternatives ||= {}
      @alternatives[loc] ||= begin
        path = File.join(__dir__, '..', 'i18n', "alternatives.#{loc}.json")
        File.exist?(path) ? JSON.parse(File.read(path, encoding: 'UTF-8')).reject { |k, _| k.start_with?('_') } : {}
      rescue StandardError
        {}
      end
    end

    def suggestions(key, loc = locale)
      Array(alternatives(loc)[key.to_s])
    end

    # بازنویسی‌های کاربر برای یک زبان. فقط کلیدهایی که در بستهٔ همان زبان شناخته
    # شده‌اند و مقدارشان رشتهٔ ناتهی است — یک فایل دستکاری‌شده نباید بتواند کلید
    # جعلی به گزارش‌ها تزریق کند.
    def overrides(loc = locale)
      @overrides ||= {}
      @overrides[loc] ||= begin
        known = I18n.bundle(loc)
        (read_user_file['locales'] || {}).fetch(loc, {}).each_with_object({}) do |(k, v), out|
          out[k] = v if known.key?(k) && v.is_a?(String) && !v.strip.empty?
        end
      rescue StandardError
        {}
      end
    end

    def all(loc = locale)
      @all ||= {}
      @all[loc] ||= I18n.bundle(loc).merge(overrides(loc))
    end

    # واژهٔ این کارگاه برای این کلید.
    def t(key, loc = locale)
      all(loc)[key.to_s] || key.to_s
    end

    def overridden?(key, loc = locale)
      overrides(loc).key?(key.to_s)
    end

    # کلیدهایی که کاربر می‌تواند تغییر دهد، گروه‌بندی‌شده برای نمایش در تنظیمات.
    # `panel.*`/`about.*`/`error.*` عمداً بیرون‌اند: آن‌ها متن رابط‌اند و کارِ
    # مترجم‌اند، نه واژگان کارگاه.
    EDITABLE_PREFIXES = %w[part. hw. unit. template. category. slide. handle. term.].freeze

    def editable_keys(loc = locale)
      I18n.bundle(loc).keys.select { |k| EDITABLE_PREFIXES.any? { |p| k.start_with?(p) } }.sort
    end

    # ذخیرهٔ بازنویسی‌ها برای یک زبان (بقیهٔ زبان‌ها دست‌نخورده می‌مانند).
    # مقدار تهی/nil یعنی «برگرد به پیش‌فرض همان زبان».
    def save_overrides(map, loc = locale)
      return false unless map.is_a?(Hash)

      known = I18n.bundle(loc)
      clean = map.each_with_object({}) do |(k, v), out|
        next unless known.key?(k.to_s)
        next unless v.is_a?(String) && !v.strip.empty?
        next if v.strip == known[k.to_s] # برابر پیش‌فرض = بازنویسی لازم ندارد

        out[k.to_s] = v.strip
      end

      doc = read_user_file
      doc['glossary_version'] = 1
      doc['locales'] ||= {}
      doc['locales'][loc] = clean
      payload = JSON.pretty_generate(doc)
      return false if payload.bytesize > MAX_BYTES

      write_atomic(payload)
      reset!
      true
    rescue StandardError => e
      App::Log.error('glossary save failed', message: e.message) if defined?(App::Log)
      false
    end

    def reset!
      @alternatives = nil
      @overrides = nil
      @all = nil
    end

    # بستهٔ آمادهٔ مصرف برای پنل و موتورهای JS.
    def payload(loc = locale)
      { 'glossary_version' => 1, 'locale' => loc,
        'direction' => I18n.direction(loc),
        'terms' => all(loc),
        'alternatives' => alternatives(loc),
        'editable' => editable_keys(loc),
        'overridden' => overrides(loc).keys }
    end

    def to_json_payload(loc = locale)
      JSON.generate(payload(loc))
    end

    def read_user_file
      path = user_path
      return {} unless File.exist?(path)

      raw = File.read(path, encoding: 'UTF-8')
      return {} if raw.bytesize > MAX_BYTES

      parsed = JSON.parse(raw)
      parsed.is_a?(Hash) ? parsed : {}
    rescue StandardError => e
      App::Log.warn('glossary override unreadable; using defaults', message: e.message) if defined?(App::Log)
      {}
    end

    def write_atomic(payload)
      require 'fileutils'
      tmp = user_path + '.tmp'
      File.write(tmp, payload, encoding: 'UTF-8')
      FileUtils.mv(tmp, user_path)
    end
  end
end
