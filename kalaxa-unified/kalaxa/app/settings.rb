# frozen_string_literal: true

require 'json'
require_relative 'paths'
require_relative 'errors'

module Kalaxa
  module App
    # تنظیمات محلی کاربر با نوشتن اتمیک (فایل موقت + rename).
    module Settings
      DEFAULTS = { 'locale' => 'fa', 'log_level' => 'info' }.freeze
      VALID_LOCALES = %w[fa en].freeze

      module_function

      def all
        data =
          if File.exist?(Paths.settings_file)
            JSON.parse(File.read(Paths.settings_file, encoding: 'UTF-8'))
          else
            {}
          end
        DEFAULTS.merge(data)
      rescue JSON::ParserError
        DEFAULTS.dup # فایل خراب ⇒ بازگشت امن به پیش‌فرض بدون کرش
      end

      def get(key)
        all[key]
      end

      def set(key, value)
        data = all.merge(key => value)
        tmp = "#{Paths.settings_file}.tmp"
        File.write(tmp, JSON.pretty_generate(data), encoding: 'UTF-8')
        File.rename(tmp, Paths.settings_file)
        data
      end

      def locale
        value = get('locale')
        VALID_LOCALES.include?(value) ? value : 'fa'
      end

      def locale=(value)
        unless VALID_LOCALES.include?(value)
          raise Kalaxa::ValidationError, "unsupported locale: #{value}"
        end

        set('locale', value)
      end
    end
  end
end
