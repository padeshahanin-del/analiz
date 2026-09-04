# encoding: utf-8
#
# Kalaxa::App::AdoptCabinet — تبدیل کابینتِ خوانده‌شده به کابینتِ پارامتریک
#
# کاربر: «اونی که آنالیز کردم رو می‌خوام جزو کابینت‌های در حال ساختم باشه که
# بتونم اندازه رو تغییر بدم».
#
# کابینتی که کاربر خودش کشیده هندسهٔ **مرده** است: عرضش را نمی‌شود عوض کرد،
# چون هیچ‌جا نوشته نشده «این ۹۰۰ است» — فقط چند جعبه در فضا هستند. کابینت
# کالاکسا از چند عدد ساخته می‌شود و با عوض شدن آن‌ها دوباره ساخته می‌شود.
#
# **استنتاج این‌جا نیست، عمداً.** ابعاد و تمپلیت را kalaxa-adopt.js حساب
# می‌کند، چون تشخیص نقش قطعات آن‌جاست. نسخهٔ دومِ همان قواعد در روبی، دیر یا
# زود واگرا می‌شد — الگویی که در این پروژه بارها باگ ساخته. این فایل فقط
# **اجرا** می‌کند: می‌سازد، جای درست می‌گذارد، و اصل را دست‌نخورده نگه می‌دارد.
require 'sketchup.rb'

module Kalaxa
  module App
    module AdoptCabinet
      VERSION = '1.0.0'.freeze
      RAW_DICT_NAME = 'kalaxa_raw'.freeze

      module_function

      # گروهِ خامِ متناظر با شناسه‌ای که پنل داده.
      #
      # شناسه در ProjectScanner به شکل "raw-<persistent_id>" ساخته می‌شود؛
      # همان‌جا هم باید خوانده شود وگرنه دو طرف از هم می‌افتند.
      def find_raw_group(model, kalaxa_id)
        want = kalaxa_id.to_s.sub(/\Araw-/, '')
        model.entities.grep(Sketchup::Group).find do |g|
          g.persistent_id.to_s == want && g.attribute_dictionary(RAW_DICT_NAME)
        end
      end

      # @param params [Hash] از پنل: template_id, label_fa, width_cm, height_cm,
      #   depth_cm, opts, kalaxa_id
      # @return [Hash] { ok:, message:, label_fa: }
      def run(params)
        model = Sketchup.active_model
        raw = find_raw_group(model, params['kalaxa_id'])
        raise Kalaxa::Error, 'کابینت خوانده‌شده در مدل پیدا نشد — شاید پاک یا جابه‌جا شده' if raw.nil?

        template_id = params['template_id'].to_s
        unless Kalaxa::CabinetBuilder::TEMPLATES.include?(template_id)
          raise Kalaxa::ValidationError, "تمپلیت ناشناخته: #{template_id}"
        end

        w = params['width_cm'].to_f
        h = params['height_cm'].to_f
        d = params['depth_cm'].to_f
        raise Kalaxa::ValidationError, 'ابعاد نامعتبر' if w <= 0 || h <= 0 || d <= 0

        label = params['label_fa'].to_s
        label = raw.name.to_s if label.empty?
        label = 'کابینت تبدیل‌شده' if label.empty?

        opts = symbolize(params['opts'] || {})

        # همان گوشه‌ای که کابینت اصلی از آن شروع می‌شود، تا کابینت تازه دقیقاً
        # جای قبلی بنشیند و کاربر مجبور نباشد دوباره جانمایی کند.
        origin = raw.bounds.min

        model.start_operation('تبدیل به کابینت کالاکسا', true)
        begin
          group = Kalaxa::App::CreateCabinetTool::PlaceCabinetTool
                  .build_at(model, origin, template_id, label, w, h, d, opts)

          # اصل را **پاک نمی‌کنیم**، مخفی می‌کنیم. تبدیل ممکن است ابعاد را
          # اشتباه حدس زده باشد؛ پاک کردن کار کاربر بر پایهٔ یک حدس، اشتباه
          # است. مخفی‌کردن برگشت‌پذیر است و ابهام هم ندارد.
          raw.hidden = true
          raw.name = "#{raw.name} (اصل — تبدیل شد)"

          model.commit_operation
        rescue StandardError => e
          model.abort_operation
          raise Kalaxa::Error, "تبدیل انجام نشد: #{e.message}"
        end

        { 'ok' => true, 'label_fa' => label,
          'message' => "«#{label}» به کابینت پارامتریک تبدیل شد. " \
                       'کابینت اصلی مخفی شد (پاک نشده) — بعد از بررسی می‌توانید حذفش کنید.' }
      end

      def symbolize(hash)
        hash.each_with_object({}) { |(k, v), out| out[k.to_sym] = v }
      end
    end
  end
end
