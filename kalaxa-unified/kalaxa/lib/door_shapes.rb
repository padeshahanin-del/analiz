# encoding: utf-8
# frozen_string_literal: true

# Kalaxa::DoorShapes — شکل ساخت درب: تنها منبع حقیقت برای مدل و لیست برش.
#
# تا این نسخه هر هفت «نوع درب» یک جعبهٔ ساده بودند با ضخامت **بدنهٔ کابینت** — یعنی
# درب هایگلاس ۱۸ و شیشه‌ای‌آلومینیوم ۲۰ هم ۱۶ بریده می‌شدند، و درب کلاف‌وتنپوش که
# در واقعیت ۵ قطعه است، یک تخته شمرده می‌شد.
#
# دو محور که عمداً از هم جدا ماندند:
#   door_type  — **رویه/پرداخت** (mdf، هایگلاس، ممبران، رنگی…). از قبل بود و
#                kalaxa-door-profile.js رویش کلید می‌خورد؛ دست نخورد.
#   door_shape — **ساخت** (تخت، کلاف‌وتنپوش، فریم آلومینیوم…). همین‌جا، تازه.
#                نبودنش → از door_type حدس زده می‌شود، پس سند قدیمی دست‌نخورده می‌ماند.
#
# ضخامت هرگز در کد ثابت نیست: از opts (که از تنظیمات پروژه می‌آید) خوانده می‌شود.
# اعداد زیر فقط پیش‌فرضِ نبودِ تنظیمات‌اند. هر شکل چند ضخامت مجاز دارد — بعضی چهار تا.
#
# قرارداد خروجی، آینهٔ همان الگوی قید:
#   pieces(...) → ردیف‌های لیست برش    | boxes(...) → جعبه‌های مدل
# و test_door_shapes.rb تضمین می‌کند این دو هرگز واگرا نشوند.
require_relative 'glossary'
require_relative 'catalog'

module Kalaxa
  module DoorShapes
    # کاتالوگ از data/door_shapes.json می‌آید — همان فایلی که JS هم می‌خواند.
    # پیش از این، فهرست شکل‌ها و ضخامت‌های مجاز در Ruby و JS جدا نوشته شده بود.
    # kind: 'panel' = یک تخته | 'framed' = کلاف و تنپوش | 'profile' = فریم آلومینیوم
    module_function

    def shapes = Catalog.door_shapes
    def ids = Catalog.door_shape_ids
    def type_to_shape = Catalog.door_type_to_shape
    def default_shape = Catalog.default_door_shape

    # سازگاری عقب‌رو با کدی که ثابت‌ها را مستقیم می‌خواند.
    def self.const_missing(name)
      case name
      when :SHAPES then shapes
      when :IDS then ids
      when :TYPE_TO_SHAPE then type_to_shape
      when :DEFAULT_SHAPE then default_shape
      else super
      end
    end

    def shape_id(opts = {})
      given = opts[:door_shape].to_s
      return given if shapes.key?(given)

      type_to_shape[opts[:door_type].to_s] || default_shape
    end

    def spec(shape)
      shapes[shape] || shapes[default_shape]
    end

    def thicknesses_mm(shape)
      spec(shape)['thicknesses_mm']
    end

    # ضخامت مؤثر: از تنظیمات، وگرنه پیش‌فرض شکل. عدد خارج از فهرست مجاز رد نمی‌شود
    # (کارگاه ممکن است ورق غیراستاندارد داشته باشد) ولی باید مثبت باشد.
    def thickness_mm(shape, opts = {})
      t = opts[:door_thickness_mm].to_f
      t.positive? ? t.round : spec(shape)['default_mm']
    end

    def framed?(shape) = spec(shape)['kind'] == 'framed'
    def profile?(shape) = spec(shape)['kind'] == 'profile'

    def frame_width_mm(shape, opts = {})
      w = opts[:door_frame_width_mm].to_f
      w.positive? ? w : (spec(shape)['frame_width_mm'] || 0)
    end

    # ---------------- لیست برش ----------------
    # @return [Array<Hash>] {key, count, length_mm, width_mm, thickness_mm, sheet, grain, note}
    #   count به‌ازای **یک** درب است؛ فراخوان در تعداد لنگه ضرب می‌کند.
    def pieces(shape, fw, fh, opts = {})
      s = spec(shape)
      t = thickness_mm(shape, opts)

      case s['kind']
      when 'framed' then framed_pieces(shape, fw, fh, t, opts)
      when 'profile' then profile_pieces(shape, fw, fh, opts)
      else
        [{ key: 'door', count: 1, length_mm: fh, width_mm: fw, thickness_mm: t,
           sheet: s['sheet'], grain: 'length', note: s['operation'] ? 'فرزکاری طرح' : '' }]
      end
    end

    # کلاف و تنپوش: ۲ قائم (تمام‌قد) + ۲ افقی (بین قائم‌ها) + ۱ تنپوش نازک‌تر.
    # تنپوش به اندازهٔ عمق شیار در هر طرف بزرگ‌تر بریده می‌شود تا داخل شیار بنشیند.
    def framed_pieces(shape, fw, fh, t, opts)
      s = spec(shape)
      fwid = frame_width_mm(shape, opts)
      groove = (opts[:door_groove_depth_mm] || s['groove_depth_mm']).to_f
      panel_t = (opts[:door_panel_thickness_mm] || s['panel_thickness_mm']).to_f

      [
        { key: 'door_stile', count: 2, length_mm: fh, width_mm: fwid, thickness_mm: t,
          sheet: s['sheet'], grain: 'length', note: 'قائم کلاف' },
        { key: 'door_rail', count: 2, length_mm: fw - 2 * fwid, width_mm: fwid, thickness_mm: t,
          sheet: s['sheet'], grain: 'length', note: 'افقی کلاف' },
        { key: 'door_panel', count: 1,
          length_mm: fh - 2 * fwid + 2 * groove, width_mm: fw - 2 * fwid + 2 * groove,
          thickness_mm: panel_t.round, sheet: s['panel_sheet'], grain: 'none', note: 'تنپوش، داخل شیار' }
      ]
    end

    # فریم آلومینیوم: خود پروفیل متری است و در kalaxa-door-profile.js شمرده می‌شود،
    # نه در نستینگ ورق. این‌جا فقط تویی (شیشه یا تخته) به لیست برش می‌رود — با ورق
    # مخصوص خودش، وگرنه شیشه وارد نستینگ MDF می‌شد.
    def profile_pieces(shape, fw, fh, opts)
      s = spec(shape)
      fwid = frame_width_mm(shape, opts)
      lap = s['infill_overlap_mm'].to_f
      [{ key: s['infill'] == 'glass' ? 'door_glass' : 'door_panel', count: 1,
         length_mm: fh - 2 * fwid + 2 * lap, width_mm: fw - 2 * fwid + 2 * lap,
         thickness_mm: s['infill_thickness_mm'], sheet: s['infill_sheet'],
         grain: 'none', note: s['infill'] == 'glass' ? 'شیشه، داخل پروفیل' : 'تویی، داخل پروفیل' }]
    end

    # ---------------- مدل سه‌بعدی ----------------
    # نما همیشه بیرون بدنه است: از y = -t تا y = 0.
    # @return [Array<Hash>] {key, x, y, z, dx, dy, dz}
    def boxes(shape, fx, fz, fw, fh, opts = {})
      s = spec(shape)
      t = thickness_mm(shape, opts)

      case s['kind']
      when 'framed' then framed_boxes(shape, fx, fz, fw, fh, t, opts)
      when 'profile' then profile_boxes(shape, fx, fz, fw, fh, t, opts)
      else [box('door', fx, -t, fz, fw, t, fh)]
      end
    end

    def framed_boxes(shape, fx, fz, fw, fh, t, opts)
      s = spec(shape)
      fwid = frame_width_mm(shape, opts)
      panel_t = (opts[:door_panel_thickness_mm] || s['panel_thickness_mm']).to_f
      inner_w = fw - 2 * fwid
      inner_h = fh - 2 * fwid
      # تنپوش وسطِ ضخامت کلاف می‌نشیند (نه هم‌سطح جلو)، مثل درب واقعی.
      panel_y = -t + (t - panel_t) / 2.0

      [
        box('door_stile', fx, -t, fz, fwid, t, fh),
        box('door_stile', fx + fw - fwid, -t, fz, fwid, t, fh),
        box('door_rail', fx + fwid, -t, fz, inner_w, t, fwid),
        box('door_rail', fx + fwid, -t, fz + fh - fwid, inner_w, t, fwid),
        box('door_panel', fx + fwid, panel_y, fz + fwid, inner_w, panel_t, inner_h)
      ]
    end

    # چهار پروفیل آلومینیوم + تویی. پروفیل در مدل دیده می‌شود ولی در لیست برشِ ورق
    # نمی‌آید (متری است) — همان تفکیکی که برای یراق هم برقرار است.
    def profile_boxes(shape, fx, fz, fw, fh, t, opts)
      s = spec(shape)
      fwid = frame_width_mm(shape, opts)
      infill_t = s['infill_thickness_mm'].to_f
      inner_w = fw - 2 * fwid
      inner_h = fh - 2 * fwid
      infill_y = -t + (t - infill_t) / 2.0
      key = s['infill'] == 'glass' ? 'door_glass' : 'door_panel'

      [
        box('door_frame', fx, -t, fz, fwid, t, fh),
        box('door_frame', fx + fw - fwid, -t, fz, fwid, t, fh),
        box('door_frame', fx + fwid, -t, fz, inner_w, t, fwid),
        box('door_frame', fx + fwid, -t, fz + fh - fwid, inner_w, t, fwid),
        box(key, fx + fwid, infill_y, fz + fwid, inner_w, infill_t, inner_h)
      ]
    end

    def box(key, x, y, z, dx, dy, dz)
      { 'key' => key, 'x' => x.round(2), 'y' => y.round(2), 'z' => z.round(2),
        'dx' => dx.round(2), 'dy' => dy.round(2), 'dz' => dz.round(2) }
    end

    # برچسب شکل برای دیالوگ/گزارش — از واژه‌نامه، پس قابل تغییر است.
    def label(shape)
      Glossary.t(spec(shape)['glossary'])
    end

    def labels
      ids.map { |id| label(id) }
    end
  end
end
