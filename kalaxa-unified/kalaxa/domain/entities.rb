# frozen_string_literal: true

require 'securerandom'
require_relative '../app/errors'

module Kalaxa
  module Domain
    # موجودیت‌ها عمداً هش‌های سادهٔ Ruby هستند (نه کلاس‌های سنگین) تا:
    # ۱) رفت‌وبرگشت JSON بدون اتلاف تضمین شود؛ ۲) سطح خطای زمان اجرا حداقل باشد.
    # همهٔ طول‌ها Integer برحسب میلی‌متر (تصمیم D-002).
    module Entities
      TYPES = %w[spaces materials units parts hardware operations issues].freeze

      UNIT_KINDS     = %w[base wall tall].freeze
      MATERIAL_KINDS = %w[sheet edgeband solid].freeze
      PART_ROLES     = %w[side top bottom shelf back door drawer_front stretcher].freeze
      HARDWARE_KINDS = %w[hinge slide handle connector leg].freeze
      OPERATION_KINDS = %w[drill groove cut].freeze
      GRAINS         = %w[length width none].freeze
      SEVERITIES     = %w[FATAL ERROR WARNING INFO].freeze

      module_function

      def new_id
        SecureRandom.uuid
      end

      def uuid?(value)
        value.is_a?(String) &&
          value.match?(/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/)
      end

      def space(name:, width_mm:, depth_mm:, height_mm:, id: new_id)
        { 'id' => id, 'name' => name,
          'width_mm' => width_mm, 'depth_mm' => depth_mm, 'height_mm' => height_mm }
      end

      def material(name:, kind:, thickness_mm:, sheet_width_mm: nil, sheet_length_mm: nil, id: new_id)
        { 'id' => id, 'name' => name, 'kind' => kind, 'thickness_mm' => thickness_mm,
          'sheet_width_mm' => sheet_width_mm, 'sheet_length_mm' => sheet_length_mm }
      end

      def unit(space_id:, name:, kind:, width_mm:, depth_mm:, height_mm:, params: {},
               placement: nil, id: new_id)
        h = { 'id' => id, 'space_id' => space_id, 'name' => name, 'kind' => kind,
              'width_mm' => width_mm, 'depth_mm' => depth_mm, 'height_mm' => height_mm,
              'params' => params }
        h['placement'] = placement unless placement.nil? # نبودِ کلید = جانمایی‌نشده (v3)
        h
      end

      # جانمایی یونیت در مختصات جهانی مدل (schema v3) — همه Integer و mm (D-002)؛
      # چرخش فقط حول Z در بازهٔ ۰..۳۵۹ (مصرف‌کننده: نقشه نصب).
      PLACEMENT_KEYS = %w[x_mm y_mm z_mm rotation_z_deg].freeze

      def placement(x_mm:, y_mm:, z_mm: 0, rotation_z_deg: 0)
        { 'x_mm' => x_mm, 'y_mm' => y_mm, 'z_mm' => z_mm,
          'rotation_z_deg' => rotation_z_deg }
      end

      def valid_placement?(pl)
        pl.is_a?(Hash) &&
          pl.keys.sort == PLACEMENT_KEYS.sort &&
          PLACEMENT_KEYS.all? { |k| pl[k].is_a?(Integer) } &&
          (0..359).cover?(pl['rotation_z_deg'])
      end

      def part(unit_id:, material_id:, name:, role:, length_mm:, width_mm:, thickness_mm:,
               grain: 'length', edgebanding: default_edgebanding, id: new_id)
        { 'id' => id, 'unit_id' => unit_id, 'material_id' => material_id,
          'name' => name, 'role' => role,
          'length_mm' => length_mm, 'width_mm' => width_mm, 'thickness_mm' => thickness_mm,
          'grain' => grain, 'edgebanding' => edgebanding }
      end

      def default_edgebanding
        { 'l1' => nil, 'l2' => nil, 'w1' => nil, 'w2' => nil }
      end

      def hardware(unit_id:, name:, kind:, qty:, sku: nil, id: new_id)
        { 'id' => id, 'unit_id' => unit_id, 'name' => name, 'kind' => kind,
          'qty' => qty, 'sku' => sku }
      end

      def operation(part_id:, kind:, params: {}, id: new_id)
        { 'id' => id, 'part_id' => part_id, 'kind' => kind, 'params' => params }
      end

      def issue(severity:, code:, message:, entity_id: nil, id: new_id)
        { 'id' => id, 'severity' => severity, 'code' => code,
          'message' => message, 'entity_id' => entity_id }
      end
    end
  end
end
