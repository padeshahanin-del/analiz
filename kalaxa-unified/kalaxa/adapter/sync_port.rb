# frozen_string_literal: true

require_relative '../app/errors'

module Kalaxa
  module Adapter
    # مرز اتصال‌پذیری (D-SYNC-3): پلاگین فقط با این پورت حرف می‌زند؛
    # پیاده‌سازی واقعی (HTTP به kalaxa.ir، فایل اشتراکی، ...) بعداً و بیرون از
    # هستهٔ آفلاین تزریق می‌شود. هیچ کد شبکه‌ای در این مخزن مجاز نیست.
    #
    # قرارداد سیم: پاکت کامل kalaxa-doc (خروجی Serializer.dump با sync:) —
    # صحت با checksum، سازگاری با schema_version، واگرایی با revision + checksum.
    #
    # مدل تعارض (D-SYNC-2): last-write-wins با هشدار واگرایی؛ merge خودکار ممنوع.
    # تشخیص واگرایی سمت کلاینت: remote.revision != local.revision و
    # remote.checksum != local.checksum → UI باید از کاربر نسخه را بپرسد.
    module SyncPort
      # پیاده‌سازی باید این سه متد را ارائه کند:
      #   push(project_id, raw_envelope) → { 'ok' =>, 'revision' => }
      #   pull(project_id)               → { 'ok' =>, 'raw' => }  (پاکت کامل)
      #   status(project_id)             → { 'ok' =>, 'revision' =>, 'checksum' => }
      REQUIRED_METHODS = %i[push pull status].freeze

      module_function

      def conforming?(impl)
        REQUIRED_METHODS.all? { |m| impl.respond_to?(m) }
      end
    end

    # پیاده‌فرض آفلاین: هر عملیات صادقانه «اتصال پیکربندی نشده» برمی‌گرداند.
    # UI با همین می‌تواند حالت «فقط محلی» را تمیز نمایش دهد.
    class NullSyncPort
      def push(_project_id, _raw)
        offline
      end

      def pull(_project_id)
        offline
      end

      def status(_project_id)
        offline
      end

      private

      def offline
        { 'ok' => false,
          'error' => { 'code' => 'KY_SYNC_OFFLINE',
                       'message' => 'اتصال همگام‌سازی پیکربندی نشده است (حالت فقط محلی)' } }
      end
    end
  end
end
