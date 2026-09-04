# frozen_string_literal: true

require_relative '../app/errors'
require_relative '../domain/entities'

module Kalaxa
  module Persistence
    # چارچوب مهاجرت: زنجیرهٔ فقط-رو-به-جلو v(n) → v(n+1).
    # هر مهاجرت یک تابع خالص است: سندِ کپی‌شده می‌گیرد، سند نسخهٔ بعد برمی‌گرداند.
    module Migrations
      CURRENT_VERSION = 3

      REGISTRY = {
        # v1 → v2 (مهاجرت واقعی، نه نمایشی):
        # - part.thickness (عدد) → part.thickness_mm (Integer، گرد به نزدیک‌ترین)
        # - material.thickness → material.thickness_mm
        # - افزودن part.edgebanding با پیش‌فرض چهار لبهٔ خالی در نبودِ آن
        # - افزودن project.settings.unit_system = "mm" در نبودِ آن
        1 => lambda do |doc|
          (doc.dig('entities', 'parts') || []).each do |p|
            if p.key?('thickness') && !p.key?('thickness_mm')
              p['thickness_mm'] = p.delete('thickness').round
            end
            p['edgebanding'] ||= Domain::Entities.default_edgebanding
          end
          (doc.dig('entities', 'materials') || []).each do |m|
            if m.key?('thickness') && !m.key?('thickness_mm')
              m['thickness_mm'] = m.delete('thickness').round
            end
          end
          doc['project'] ||= {}
          doc['project']['settings'] ||= {}
          doc['project']['settings']['unit_system'] ||= 'mm'
          doc
        end,
        # v2 → v3: افزودن قابلیت placement اختیاری روی unit.
        # عمداً no-op روی بدنهٔ سند — هیچ کلیدی تزریق نمی‌شود تا چک‌سام سندهای
        # v2 پس از مهاجرت تغییر نکند (goldens و پاکت‌های موجود معتبر می‌مانند).
        # «نبودِ placement» یعنی جانمایی‌نشده؛ اعتبارسنجی آن در Validator#placements.
        2 => lambda { |doc| doc }
      }.freeze

      module_function

      # doc را از نسخهٔ from تا CURRENT_VERSION جلو می‌برد؛ روی کپی کار می‌کند.
      def migrate(doc, from_version)
        unless from_version.is_a?(Integer) && from_version.positive?
          raise SchemaVersionError, "invalid schema_version: #{from_version.inspect}"
        end
        if from_version > CURRENT_VERSION
          raise SchemaVersionError,
                "document schema v#{from_version} is newer than supported v#{CURRENT_VERSION}; " \
                'read-only mode required (سند با نسخهٔ جدیدتر پلاگین ساخته شده است)'
        end

        require 'json'
        result = JSON.parse(JSON.generate(doc)) # کپی عمیق؛ ورودی دست‌نخورده می‌ماند
        (from_version...CURRENT_VERSION).each do |v|
          step = REGISTRY[v]
          raise SchemaVersionError, "missing migration step v#{v} → v#{v + 1}" unless step

          result = step.call(result)
        end
        result
      end
    end
  end
end
