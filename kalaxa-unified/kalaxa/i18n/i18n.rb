# frozen_string_literal: true

require 'json'
require_relative '../app/errors'

module Kalaxa
  # ترجمهٔ دوزبانه با fallback به انگلیسی و سپس خود کلید.
  module I18n
    DIR = __dir__
    LOCALES = %w[fa en].freeze
    RTL_LOCALES = %w[fa].freeze

    module_function

    def bundle(locale)
      unless LOCALES.include?(locale)
        raise Kalaxa::ValidationError, "unsupported locale: #{locale}"
      end

      @cache ||= {}
      @cache[locale] ||= JSON.parse(
        File.read(File.join(DIR, "#{locale}.json"), encoding: 'UTF-8')
      ).freeze
    end

    def t(key, locale)
      bundle(locale)[key] || bundle('en')[key] || key
    end

    def direction(locale)
      RTL_LOCALES.include?(locale) ? 'rtl' : 'ltr'
    end

    # اعتبارسنجی توسعه/تست: هر دو زبان باید کلیدهای یکسان داشته باشند.
    def missing_keys
      fa = bundle('fa').keys
      en = bundle('en').keys
      { 'fa' => (en - fa), 'en' => (fa - en) }
    end
  end
end
