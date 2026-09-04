# frozen_string_literal: true

require 'json'
require_relative 'canonical'
require_relative 'migrations'
require_relative 'validator'
require_relative '../app/logging'

module Kalaxa
  module Persistence
    # پاکت ذخیره‌سازی:
    # { "format": "kalaxa-doc", "schema_version": N, "checksum": sha256(canonical(doc)), "doc": {...} }
    module Serializer
      FORMAT = 'kalaxa-doc'
      LEGACY_FORMATS = ['kabinetyar-doc'].freeze  # پاکت‌های ساخته‌شده پیش از یکپارچه‌سازی

      # متادیتای همگام‌سازی (D-SYNC-1): در سطح «پاکت» نگه داشته می‌شود، نه سند —
      # بنابراین چک‌سام سند و goldenها هرگز تحت‌تأثیر sync قرار نمی‌گیرند.
      # همه اختیاری‌اند تا پاکت‌های محلی/قدیمی بدون آن معتبر بمانند.
      #   revision   : Integer صعودی؛ هر dump موفق سمت مبدأ +1
      #   updated_at : ISO 8601 UTC
      #   device_id  : شناسهٔ پایدار مبدأ (پلاگین/وب/موبایل)
      SYNC_KEYS = %w[revision updated_at device_id].freeze

      module_function

      def dump(doc, sync: nil)
        findings = Validator.validate(doc)
        unless findings.empty?
          raise Kalaxa::ValidationError,
                "سند نامعتبر است و ذخیره نمی‌شود (#{findings.size} یافته؛ اولی: #{findings.first['message']})"
        end

        envelope = {
          'format' => FORMAT,
          'schema_version' => Migrations::CURRENT_VERSION,
          'checksum' => Canonical.checksum(doc),
          'doc' => doc
        }
        envelope.merge!(validated_sync(sync)) if sync
        JSON.generate(envelope)
      end

      def validated_sync(sync)
        raise Kalaxa::ValidationError, 'sync باید Hash باشد' unless sync.is_a?(Hash)

        unknown = sync.keys - SYNC_KEYS
        raise Kalaxa::ValidationError, "کلید sync ناشناخته: #{unknown.join(', ')}" unless unknown.empty?

        if sync.key?('revision') && !(sync['revision'].is_a?(Integer) && sync['revision'].positive?)
          raise Kalaxa::ValidationError, 'revision باید Integer مثبت باشد'
        end
        if sync.key?('updated_at') && !sync['updated_at'].is_a?(String)
          raise Kalaxa::ValidationError, 'updated_at باید رشتهٔ ISO 8601 باشد'
        end
        if sync.key?('device_id') && !(sync['device_id'].is_a?(String) && !sync['device_id'].empty?)
          raise Kalaxa::ValidationError, 'device_id باید رشتهٔ ناتهی باشد'
        end
        sync
      end

      # خروجی: [doc, meta]؛ meta شامل migrated?: آیا مهاجرت انجام شد.
      # خطاها همگی کنترل‌شده (CorruptDataError / SchemaVersionError) هستند.
      def load(raw)
        envelope = parse(raw)
        version = envelope['schema_version']
        doc = envelope['doc']
        raise CorruptDataError, 'بخش doc موجود نیست' unless doc.is_a?(Hash)

        verify_checksum(doc, envelope['checksum'], version)

        migrated = version != Migrations::CURRENT_VERSION
        doc = Migrations.migrate(doc, version) if migrated

        findings = Validator.validate(doc)
        unless findings.empty?
          raise CorruptDataError,
                "دادهٔ بازیابی‌شده نامعتبر است (#{findings.size} یافته؛ اولی: #{findings.first['message']})"
        end

        App::Log.info('document loaded', schema: version, migrated: migrated)
        meta = { 'migrated' => migrated, 'from_version' => version }
        sync = envelope.slice(*SYNC_KEYS)
        meta['sync'] = sync unless sync.empty?
        [doc, meta]
      end

      def parse(raw)
        raise CorruptDataError, 'دادهٔ ذخیره‌شده خالی است' if raw.nil? || raw.to_s.empty?

        envelope = JSON.parse(raw.to_s)
        raise CorruptDataError, 'قالب پاکت ناشناخته است' unless envelope.is_a?(Hash) &&
                                                                ([FORMAT] + LEGACY_FORMATS).include?(envelope['format'])

        envelope
      rescue JSON::ParserError => e
        raise CorruptDataError, "JSON خراب است: #{e.message}"
      end

      def verify_checksum(doc, stored, version)
        # پاکت‌های میراثی v1 چک‌سام ندارند (قاعدهٔ متعارف از v2 اجباری شد — D-016)
        return if stored.nil? && version.to_i < 2

        actual = Canonical.checksum(doc)
        return if stored == actual

        raise CorruptDataError,
              "چک‌سام نامعتبر (schema v#{version}): داده پس از ذخیره تغییر کرده یا آسیب دیده است"
      end

      # بازیابی امن: بدون پرتاب استثنا، وضعیت را گزارش می‌دهد تا UI تصمیم بگیرد.
      # خروجی: { 'ok' =>, 'doc' =>, 'meta' =>, 'error' => {code,message}, 'raw' => }
      # raw همیشه برگردانده می‌شود تا کاربر بتواند از دادهٔ خراب پشتیبان بگیرد؛ چیزی حذف نمی‌شود.
      def safe_load(raw)
        doc, meta = load(raw)
        { 'ok' => true, 'doc' => doc, 'meta' => meta, 'raw' => raw }
      rescue Kalaxa::Error => e
        App::Log.error('document recovery failed', code: e.code, message: e.message)
        { 'ok' => false, 'error' => { 'code' => e.code, 'message' => e.message }, 'raw' => raw }
      end
    end
  end
end
