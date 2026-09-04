# frozen_string_literal: true

require_relative '../domain/entities'
require_relative '../domain/document'
require_relative '../app/errors'

module Kalaxa
  # خطاهای اختصاصی ذخیره‌سازی
  class CorruptDataError < Error
    def code
      'KY_CORRUPT_DATA'
    end
  end

  class SchemaVersionError < Error
    def code
      'KY_SCHEMA_VERSION'
    end
  end

  module Persistence
    # اعتبارسنجی ساختاری سند. خروجی: آرایهٔ یافته‌ها؛ خالی یعنی معتبر.
    # هر یافته: { 'code', 'severity', 'message', 'entity_id' }
    module Validator
      module_function

      def validate(doc)
        findings = []
        findings.concat(structure(doc))
        return findings unless findings.empty? # بدون ساختار سالم، ادامه بی‌معناست

        findings.concat(ids(doc))
        findings.concat(references(doc))
        findings.concat(enums(doc))
        findings.concat(placements(doc))
        findings
      end

      def valid?(doc)
        validate(doc).empty?
      end

      def structure(doc)
        return [finding('KY_V_ROOT', 'سند باید Hash باشد')] unless doc.is_a?(Hash)

        f = []
        f << finding('KY_V_PROJECT', 'بخش project موجود نیست یا Hash نیست') unless doc['project'].is_a?(Hash)
        ents = doc['entities']
        if ents.is_a?(Hash)
          Domain::Entities::TYPES.each do |t|
            f << finding('KY_V_TYPE', "فهرست #{t} موجود نیست یا Array نیست") unless ents[t].is_a?(Array)
          end
        else
          f << finding('KY_V_ENTITIES', 'بخش entities موجود نیست یا Hash نیست')
        end
        f
      end

      def ids(doc)
        f = []
        seen = {}
        Domain::Document.all_ids(doc).each do |id|
          unless Domain::Entities.uuid?(id)
            f << finding('KY_V_ID_FORMAT', "شناسهٔ نامعتبر: #{id.inspect}", id.to_s)
            next
          end
          f << finding('KY_V_ID_DUP', "شناسهٔ تکراری: #{id}", id) if seen[id]
          seen[id] = true
        end
        f
      end

      REFS = {
        'units'      => { 'space_id' => 'spaces' },
        'parts'      => { 'unit_id' => 'units', 'material_id' => 'materials' },
        'hardware'   => { 'unit_id' => 'units' },
        'operations' => { 'part_id' => 'parts' }
      }.freeze

      def references(doc)
        f = []
        index = {}
        Domain::Entities::TYPES.each do |t|
          doc['entities'][t].each { |e| index[e['id']] = t }
        end
        REFS.each do |type, fields|
          doc['entities'][type].each do |e|
            fields.each do |field, expected_type|
              ref = e[field]
              if ref.nil? || index[ref] != expected_type
                f << finding('KY_V_REF_MISSING',
                             "مرجع گمشده: #{type}/#{e['id']} → #{field}=#{ref.inspect}",
                             e['id'])
              end
            end
          end
        end
        # لبه‌چسب‌های Part باید به متریال kind=edgeband اشاره کنند (یا nil باشند)
        edge_ok = doc['entities']['materials']
                  .select { |m| m['kind'] == 'edgeband' }.map { |m| m['id'] }
        doc['entities']['parts'].each do |p|
          (p['edgebanding'] || {}).each_value do |mid|
            next if mid.nil? || edge_ok.include?(mid)

            f << finding('KY_V_EDGE_REF', "لبه‌چسب نامعتبر در قطعهٔ #{p['id']}: #{mid}", p['id'])
          end
        end
        f
      end

      # schema v3: placement روی unit اختیاری است؛ اگر بود باید کامل و معتبر باشد.
      def placements(doc)
        f = []
        doc['entities']['units'].each do |u|
          pl = u['placement']
          next if pl.nil?

          unless Domain::Entities.valid_placement?(pl)
            f << finding('KY_V_PLACEMENT',
                         "#{u['id']}: placement باید Hash با کلیدهای " \
                         "#{Domain::Entities::PLACEMENT_KEYS.join('/')} (Integer, mm) و " \
                         'rotation_z_deg در بازهٔ ۰..۳۵۹ باشد',
                         u['id'])
          end
        end
        f
      end

      ENUMS = {
        'units'      => ['kind', Domain::Entities::UNIT_KINDS],
        'materials'  => ['kind', Domain::Entities::MATERIAL_KINDS],
        'parts'      => ['role', Domain::Entities::PART_ROLES],
        'hardware'   => ['kind', Domain::Entities::HARDWARE_KINDS],
        'operations' => ['kind', Domain::Entities::OPERATION_KINDS],
        'issues'     => ['severity', Domain::Entities::SEVERITIES]
      }.freeze

      def enums(doc)
        f = []
        ENUMS.each do |type, (field, allowed)|
          doc['entities'][type].each do |e|
            next if allowed.include?(e[field])

            f << finding('KY_V_ENUM', "#{type}/#{e['id']}: مقدار نامجاز #{field}=#{e[field].inspect}", e['id'])
          end
        end
        doc['entities']['parts'].each do |p|
          %w[length_mm width_mm thickness_mm].each do |k|
            next if p[k].is_a?(Integer) && p[k].positive?

            f << finding('KY_V_DIM', "#{p['id']}: #{k} باید Integer مثبت باشد", p['id'])
          end
        end
        f
      end

      def finding(code, message, entity_id = nil)
        { 'code' => code, 'severity' => 'ERROR', 'message' => message, 'entity_id' => entity_id }
      end
    end
  end
end
