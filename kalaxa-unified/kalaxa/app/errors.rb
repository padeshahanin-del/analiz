# frozen_string_literal: true

require_relative 'logging'

module Kalaxa
  # ریشهٔ همهٔ خطاهای دامنه‌ای کالاکسا.
  class Error < StandardError
    def code
      'KY_ERROR'
    end
  end

  class ValidationError < Error
    def code
      'KY_VALIDATION'
    end
  end

  module App
    module Errors
      module_function

      # اجرای امن: استثنا را می‌گیرد، لاگ می‌کند و پاکت پاسخ استاندارد برمی‌گرداند.
      # قرارداد پاکت مطابق docs/MODULE_CONTRACTS.md است.
      def envelope(id)
        payload = yield
        { 'id' => id, 'ok' => true, 'payload' => payload }
      rescue Kalaxa::Error => e
        Log.warn('controlled error', code: e.code, message: e.message)
        { 'id' => id, 'ok' => false,
          'error' => { 'code' => e.code, 'message' => e.message } }
      rescue StandardError => e
        Log.error('unexpected error',
                  class: e.class.name, message: e.message,
                  backtrace: Array(e.backtrace).first(5))
        { 'id' => id, 'ok' => false,
          'error' => { 'code' => 'KY_INTERNAL', 'message' => e.message } }
      end
    end
  end
end
