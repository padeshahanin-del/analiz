# frozen_string_literal: true

module Kalaxa
  module SyncClient
    # منطق تصمیم همگام‌سازی سمت کلاینت (D-SYNC-2) — خالص و بدون SketchUp/HTTP
    # تا با ruby معمولی تست شود. آینهٔ Kalaxa_Push_Policy سمت سرور، از دید کلاینت.
    #
    # ورودی‌ها:
    #   server_state         : nil | { 'revision' => Integer|nil, 'checksum' => String|nil }
    #   local_checksum       : String (چک‌سام سند فعلی مدل)
    #   last_synced_revision : nil | Integer (آخرین revision که این دستگاه با سرور هم‌نظر شد)
    #
    # خروجی push: { action:, push_revision: }
    #   :first_push   سرور خالی — push با revision بعدی
    #   :idempotent   محتوای سرور همین است — فقط last_synced به‌روز شود
    #   :fast_forward ما روی آخرین نسخهٔ سرور بنا کرده‌ایم — push امن
    #   :diverged     سرور از آخرین هم‌نظری ما جلوتر است — تصمیم با کاربر (LWW دستی)
    module SyncFlow
      module_function

      def decide_push(server_state, local_checksum, last_synced_revision)
        if server_state.nil?
          return { action: :first_push, push_revision: (last_synced_revision || 0) + 1 }
        end

        srv_rev = server_state['revision']
        if server_state['checksum'] && server_state['checksum'] == local_checksum
          return { action: :idempotent, push_revision: srv_rev }
        end

        if srv_rev && last_synced_revision && srv_rev == last_synced_revision
          return { action: :fast_forward, push_revision: srv_rev + 1 }
        end

        # سرور جلوتر است، یا ما هرگز sync نکرده‌ایم ولی سرور داده دارد
        { action: :diverged, push_revision: (srv_rev || 0) + 1 }
      end

      # تصمیم pull: آیا نوشتن پاکت سرور روی مدل بدون پرسش امن است؟
      # رفع #11: نسخهٔ قبلی یک شاخهٔ :safe داشت که به‌خاطر یک متد کمکیِ همیشه-false
      # هرگز اجرا نمی‌شد (dead code) — با ادعای کامنتی نادرست که «تست‌ها قفلش می‌کنند»
      # در حالی که هیچ تستی آن را لمس نمی‌کرد. اثبات واقعی و ارزان‌تر همین‌جا بود:
      # last_synced_checksum را ذخیره کن (کنار last_synced_revision)؛ اگر سند محلی هنوز
      # دقیقاً همان چک‌سام را دارد، یعنی از آخرین sync موفق هیچ تغییر محلی نداده‌ایم —
      # پس نوشتن نسخهٔ جدید سرور چیزی از کاربر پاک نمی‌کند و بدون پرسش امن است.
      #   :fresh      مدل سند ندارد — بنویس
      #   :same       محتوا با سرور یکی است — کاری لازم نیست
      #   :safe       محلی از آخرین sync دست‌نخورده مانده (چک‌سام یکسان) — بنویس
      #   :overwrite  تغییر محلیِ sync‌نشده ممکن است از بین برود — تأیید کاربر لازم
      def decide_pull(local_checksum, last_synced_checksum, remote_checksum)
        return { action: :fresh } if local_checksum.nil?
        return { action: :same } if local_checksum == remote_checksum
        return { action: :safe } if last_synced_checksum && local_checksum == last_synced_checksum

        { action: :overwrite }
      end
    end
  end
end

