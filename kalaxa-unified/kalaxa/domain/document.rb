# frozen_string_literal: true

require 'json'
require_relative 'entities'

module Kalaxa
  module Domain
    # سند دامنه: یک هش ریشه که کل وضعیت پروژه را مستقل از هندسه نگه می‌دارد.
    # ساختار:
    # { "project" => {...}, "entities" => { "spaces"=>[], "materials"=>[], ... } }
    module Document
      module_function

      def blank(project_name: 'پروژهٔ بدون نام')
        {
          'project' => {
            'id' => Entities.new_id,
            'name' => project_name,
            'created_at' => Time.now.utc.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'settings' => { 'unit_system' => 'mm' }
          },
          'entities' => Entities::TYPES.to_h { |t| [t, []] }
        }
      end

      def add(doc, type, entity)
        list(doc, type) << entity
        entity
      end

      def list(doc, type)
        unless Entities::TYPES.include?(type)
          raise Kalaxa::ValidationError, "unknown entity type: #{type}"
        end

        doc['entities'][type]
      end

      def find(doc, id)
        Entities::TYPES.each do |t|
          found = doc['entities'][t].find { |e| e['id'] == id }
          return [t, found] if found
        end
        nil
      end

      def remove(doc, id)
        Entities::TYPES.each do |t|
          before = doc['entities'][t].size
          doc['entities'][t].reject! { |e| e['id'] == id }
          return true if doc['entities'][t].size < before
        end
        false
      end

      def all_ids(doc)
        ids = [doc.dig('project', 'id')].compact
        Entities::TYPES.each { |t| doc['entities'][t].each { |e| ids << e['id'] } }
        ids
      end

      # کپی عمیق مستقل (پایهٔ Snapshot و مقایسهٔ Undo)؛ JSON چون سند صرفاً دادهٔ JSONپذیر است.
      def deep_dup(doc)
        JSON.parse(JSON.generate(doc))
      end

      def semantically_equal?(doc_a, doc_b)
        require_relative '../persistence/canonical'
        Persistence::Canonical.checksum(doc_a) == Persistence::Canonical.checksum(doc_b)
      end
    end
  end
end
