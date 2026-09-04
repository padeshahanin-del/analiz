# encoding: utf-8
# frozen_string_literal: true

# برابری «لیست برش» و «مدل سه‌بعدی» — اجرا: ruby test/unit/test_cutlist_model_parity.rb
#
# چرا: CabinetBuilder.build_parts چیزی است که کارگاه می‌بُرد و می‌خرد (نستینگ، نقشه
# برش، شیت قیمت همه از آن می‌آیند) و CabinetGeometry.boxes_for چیزی است که کاربر در
# صحنه می‌بیند. این دو تا امروز هیچ قید مشترکی نداشتند و واگرا شده بودند: با آمدن
# «قید L» در ۳.۲۵.۰ مدل چهار تختهٔ قید می‌کشید ولی لیست برش همچنان ثابت دو تا
# می‌داد — یعنی دو تختهٔ ایستاده در هیچ سفارش متریالی نمی‌آمد. کامنت
# create_cabinet_tool.rb هم صریحاً تضمین می‌کرد «شیت قیمت درست است».
#
# قاعده‌ای که این‌جا قفل می‌شود: برای هر قطعهٔ **چوبی**، تعداد ردیف‌های لیست برش با
# تعداد جعبه‌های مدل برابر است. یراق (پایه/دستگیره/ریل) عمداً در لیست برش نیست —
# ورق نیست و در BOM شمرده می‌شود.
require 'minitest/autorun'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
require File.join(SRC, 'lib', 'cabinet_builder')
require File.join(SRC, 'lib', 'cabinet_geometry')

class TestCutlistModelParity < Minitest::Test
  B = Kalaxa::CabinetBuilder
  G = Kalaxa::CabinetGeometry

  # در مدل کشیده می‌شوند ولی **ورق** نیستند → در لیست برشِ ورق نمی‌آیند.
  # یراق در BOM شمرده می‌شود؛ پروفیل آلومینیوم درب متری است و در
  # kalaxa-door-profile.js + نستینگ خطی حساب می‌شود، نه در نستینگ ورق.
  # کلیدهایی که در مدل هستند ولی ورق نیستند، پس در لیست برش نمی‌آیند.
  # rail_rod = میلهٔ رگال کمد: یراق خریدنی است، نه تخته‌ای که بریده شود.
  NON_SHEET_KEYS = %w[leg handle handle_groove slide door_frame rail_rod].freeze

  # ترکیب‌هایی که باید همه هم‌خوان بمانند — نه فقط حالت پیش‌فرض.
  OPTION_SETS = {
    'پیش‌فرض'            => {},
    'قید جلو افقی'        => { rail_front: 'h' },
    'قید جلو بدون'        => { rail_front: 'none' },
    'هر دو قید بدون'      => { rail_front: 'none', rail_back: 'none' },
    'هر دو افقی'          => { rail_front: 'h', rail_back: 'h' },
    'ابعاد قید سفارشی'    => { rail_vertical_height_mm: 90, rail_horizontal_depth_mm: 120 },
    'قید افقی و عمودی هم‌عرض' => { rail_vertical_height_mm: 100 },
    'بدون طبقه'           => { shelf_count: 0 },
    'کشوی کف‌ریل'         => { slide_kind: 'bottom' },
    'دستگیرهٔ مخفی'        => { handle_kind: 'hidden' },
    'بدون دستگیره'        => { handle_kind: 'none' },
    # شکل ساخت درب — تخت، کلاف‌وتنپوش (۵ قطعه)، فریم آلومینیوم (تویی + پروفیل)
    'درب تخت'            => { door_shape: 'flat' },
    'درب فرزخورده'      => { door_shape: 'routed' },
    'درب کلاف‌وتنپوش'   => { door_shape: 'framed_panel' },
    'درب شیشه‌آلومینیوم' => { door_shape: 'glass_aluminum' },
    'درب MDF‌آلومینیوم'  => { door_shape: 'mdf_aluminum' },
    'درب شیشه تمام'      => { door_shape: 'glass_full' },
    'درب ضخیم از تنظیمات'  => { door_shape: 'flat', door_thickness_mm: 25 },
    'کلاف پهن از تنظیمات'  => { door_shape: 'framed_panel', door_frame_width_mm: 90 }
  }.freeze

  DIMS = [[80, 72, 55], [60, 220, 55], [100, 72, 60]].freeze

  def cut_counts(template, w, h, d, opts)
    B.build_parts(template, w, h, d, opts)
     .each_with_object(Hash.new(0)) { |p, acc| acc[p['key']] += p['count'] }
  end

  def model_counts(template, w, h, d, opts)
    G.boxes_for(template, w, h, d, opts)
     .reject { |b| NON_SHEET_KEYS.include?(b['key']) }
     .each_with_object(Hash.new(0)) { |b, acc| acc[b['key']] += 1 }
  end

  def test_every_template_and_option_set_agrees
    B::TEMPLATES.each do |template|
      DIMS.each do |(w, h, d)|
        OPTION_SETS.each do |label, opts|
          # بعضی ابعاد برای بعضی تمپلیت‌ها هندسهٔ معتبر ندارند و سازنده صریح
          # ردشان می‌کند (مثلاً کابینت گوشه با بال ۶۰ و عمق ۵۵: نمای اریب
          # ۷ سانت می‌شود و درب باز نمی‌شود). ردکردنِ صریح خودش رفتار درست
          # است، نه شکست تطبیق.
          begin
            cut = cut_counts(template, w, h, d, opts)
          rescue ArgumentError => e
            assert_raises(ArgumentError, "مدل باید همان ابعاد را رد کند: #{e.message}") do
              model_counts(template, w, h, d, opts)
            end
            next
          end
          mdl = model_counts(template, w, h, d, opts)
          assert_equal mdl, cut,
                       "#{template} @ #{w}×#{h}×#{d} [#{label}]: لیست برش و مدل نمی‌خوانند — " \
                       'هر تفاوت یعنی قطعه‌ای بریده می‌شود که در مدل نیست، یا در مدل هست و خریده نمی‌شود'
        end
      end
    end
  end

  # قید ایستاده باید با ابعاد واقعی‌اش در لیست برش بیاید، نه فقط در شمارش.
  def test_vertical_rail_dimensions_reach_the_cut_list
    parts = B.build_parts('base_single_door', 80, 72, 55)
    rails = parts.select { |p| p['key'] == 'rail_top' }

    horizontal = rails.find { |r| r['cut_width_mm'] == B::RAIL_WIDTH_MM }
    vertical   = rails.find { |r| r['cut_width_mm'] == B::RAIL_VERTICAL_HEIGHT_MM }

    refute_nil horizontal, 'تختهٔ قید خوابیده باید در لیست برش باشد'
    refute_nil vertical, 'تختهٔ قید ایستاده باید در لیست برش باشد — همان که غایب بود'
    assert_equal 2, horizontal['count']
    assert_equal 2, vertical['count']
    assert_equal 768, vertical['cut_length_mm'], 'طول قید = فضای داخلی کابینت'
    assert_equal 16, vertical['thickness_mm']
  end

  # روی یونیت کشویی، قید عمودیِ جلو با جعبهٔ کشو برخورد دارد → فقط یک ایستاده (عقب).
  def test_drawer_unit_drops_the_front_vertical_rail
    assert_equal %w[h L], B.rail_styles('base_three_drawer', {})
    assert_equal %w[h L], B.rail_styles('base_three_drawer', rail_front: 'L'),
                 'حتی اگر تنظیمات L بخواهد، جلو روی یونیت کشویی افقی می‌ماند'
    assert_equal %w[none L], B.rail_styles('base_three_drawer', rail_front: 'none'),
                 '«بدون قید» باید محترم شمرده شود'
  end

  def test_wall_and_tall_templates_have_no_rails
    %w[wall_single_door tall_double_door].each do |t|
      assert_equal %w[none none], B.rail_styles(t, rail_front: 'L', rail_back: 'L'),
                   "#{t} سقف و کف کامل دارد، نه قید"
      assert_empty B.rail_counts(t, {})
      assert_empty B.build_parts(t, 80, 220, 55).select { |p| p['key'] == 'rail_top' }
    end
  end

  # اگر عرض خوابیده و ایستاده یکی شود، یک ردیف با تعداد جمع‌شده — نه دو ردیف تکراری.
  def test_equal_widths_collapse_into_one_row
    parts = B.build_parts('base_single_door', 80, 72, 55, rail_vertical_height_mm: 100)
    rails = parts.select { |p| p['key'] == 'rail_top' }
    assert_equal 1, rails.length, 'قید هم‌عرض باید یک ردیف باشد'
    assert_equal 4, rails.first['count']
  end
end
