# frozen_string_literal: true

require 'json'
require 'digest'
require_relative '../app/errors'

module Kalaxa
  module Persistence
    # فرم متعارف (Canonical JSON) برای چک‌سام پایدار:
    # کلیدهای هش مرتب، بدون فاصله، UTF-8 خام.
    # قاعدهٔ سخت: Float در سند ممنوع است (تصمیم D-002: همهٔ اندازه‌ها Integer میلی‌متر)
    # تا نمایش متعارف بین زبان‌ها/نسخه‌ها یکتا بماند.
    module Canonical
      module_function

      def generate(value)
        case value
        when Hash
          value.each_key do |k|
            unless k.is_a?(String)
              raise Kalaxa::ValidationError, "document keys must be String, got: #{k.class}"
            end
          end
          inner = value.keys.sort.map { |k| "#{JSON.generate(k)}:#{generate(value[k])}" }
          "{#{inner.join(',')}}"
        when Array
          "[#{value.map { |v| generate(v) }.join(',')}]"
        when Float
          raise Kalaxa::ValidationError,
                "float is forbidden in document (use Integer mm): #{value}"
        when Integer, String, true, false, nil
          JSON.generate(value)
        else
          raise Kalaxa::ValidationError,
                "non-serializable value in document: #{value.class}"
        end
      end

      def checksum(value)
        Digest::SHA256.hexdigest(generate(value))
      end
    end
  end
end
