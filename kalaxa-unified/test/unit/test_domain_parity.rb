# encoding: utf-8
# frozen_string_literal: true

# انطباق Ruby ↔ JS روی منطق دامنه — اجرا: ruby test/unit/test_domain_parity.rb
#
# چرا این تست وجود دارد:
# منطق دامنه فعلاً در دو زبان زندگی می‌کند و این **عمدی و موقت** است. اسکچاپ
# Ruby را داخل خودش دارد و موقع ساخت کابینت دیالوگی باز نیست که JS اجرا کند، پس
# Ruby باید محاسبه کند. ولی مکس، رویت، سایت و نرم‌افزار ویندوز هیچ‌کدام Ruby
# ندارند — پس مرجع باید JS باشد.
#
# دوگانگی بدون تست یعنی همان چیزی که این جلسه چهار بار باگ داد. با این تست، هر
# واگرایی در همان commit قرمز می‌شود. وقتی سرویس محلی Node بالا آمد، نسخهٔ Ruby
# حذف می‌شود و این تست هم با آن می‌رود.
#
# مقایسه روی **خروجی**، نه پیاده‌سازی: یک ماتریس ورودی به هر دو داده می‌شود و
# JSON خروجی بایت‌به‌بایت سنجیده می‌شود.
require 'minitest/autorun'
require 'json'
require 'tmpdir'
require 'open3'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-parity')
ENV['KALAXA_QUIET'] = '1'

require File.join(SRC, 'lib', 'door_shapes')

class TestDomainParity < Minitest::Test
  UI_DIR = File.join(SRC, 'ui')
  D = Kalaxa::DoorShapes

  # ابعاد و تنظیماتی که واقعاً در کارگاه پیش می‌آیند + چند لبهٔ عمدی.
  DIMS = [[796, 716], [396, 716], [596, 2196], [1000, 500]].freeze

  # ورودی‌ها عمداً شامل مقادیری‌اند که **تفاوت گردکردن را نشان می‌دهند**.
  # نسخهٔ اول این ماتریس ۱۸٫۴ داشت که هم round و هم floor آن ۱۸ می‌شود، و y تنپوشش
  # −۱۷٫۵ بود که در دو رقم اعشار دقیق است — پس هیچ‌کدام گردکردن را لمس نمی‌کردند و
  # تست با وجود واگرایی سبز می‌ماند (همان سبزِ توخالی).
  OPTS = [
    {},
    { door_thickness_mm: 25 },
    { door_thickness_mm: 18.4 },          # رو به پایین
    { door_thickness_mm: 18.6 },          # رو به بالا — round ≠ floor
    { door_thickness_mm: 20.5 },          # دقیقاً نیم
    { door_frame_width_mm: 90 },
    { door_frame_width_mm: 45.5 },
    { door_panel_thickness_mm: 10 },
    { door_panel_thickness_mm: 10.01 },   # y تنپوش سه رقم اعشار → گردکردن ۲ رقمی
    { door_panel_thickness_mm: 9.005 },   # نیمِ دقیق در رقم سوم، روی مقدار منفی
    { door_groove_depth_mm: 9 },
    { door_groove_depth_mm: 8.5 },
    { door_frame_width_mm: 80, door_panel_thickness_mm: 12, door_groove_depth_mm: 10 },
    { door_thickness_mm: 25, door_panel_thickness_mm: 10.01 },
    { door_thickness_mm: 0 },             # ۰ = «چیزی نگفته‌ام»
    { door_type: 'glass_aluminum' },      # مسیر میراثی
    { door_type: 'mdf_aluminum_frame' },
    { door_type: 'highgloss' }
  ].freeze

  def js_results(cases)
    Dir.mktmpdir('kx-par') do |dir|
      input = File.join(dir, 'cases.json')
      File.write(input, JSON.generate(cases), encoding: 'UTF-8')
      script = File.join(dir, 'run.js')
      File.write(script, <<~JS, encoding: 'UTF-8')
        const path = require('path');
        const fs = require('fs');
        const D = require(path.join(#{UI_DIR.inspect}, 'kalaxa-door-shapes.js'));
        const cases = JSON.parse(fs.readFileSync(#{input.inspect}, 'utf8'));
        const out = cases.map(function (c) {
          const shape = D.shapeId(c.opts);
          return {
            shape: shape,
            thickness: D.thicknessMm(shape, c.opts),
            frame_width: D.frameWidthMm(shape, c.opts),
            pieces: D.pieces(shape, c.fw, c.fh, c.opts),
            boxes: D.boxes(shape, c.fx, c.fz, c.fw, c.fh, c.opts)
          };
        });
        process.stdout.write(JSON.stringify(out));
      JS
      out, err, status = Open3.capture3('node', script)
      raise "node شکست خورد: #{err}" unless status.success?

      JSON.parse(out)
    end
  end

  # خروجی روبی را به همان شکل JSON درمی‌آورد (کلید رشته‌ای، ترتیب یکسان).
  def ruby_result(c)
    opts = c['opts'].each_with_object({}) { |(k, v), h| h[k.to_sym] = v }
    shape = D.shape_id(opts)
    {
      'shape' => shape,
      'thickness' => D.thickness_mm(shape, opts),
      'frame_width' => D.frame_width_mm(shape, opts),
      'pieces' => D.pieces(shape, c['fw'], c['fh'], opts).map { |p|
        p.each_with_object({}) { |(k, v), h| h[k.to_s] = v }
      },
      'boxes' => D.boxes(shape, c['fx'], c['fz'], c['fw'], c['fh'], opts)
    }
  end

  def build_cases
    out = []
    (D::IDS + [nil]).each do |shape|
      DIMS.each do |(fw, fh)|
        OPTS.each do |o|
          opts = shape ? o.merge(door_shape: shape) : o
          out << { 'fw' => fw, 'fh' => fh, 'fx' => 2.0, 'fz' => 2.0,
                   'opts' => opts.each_with_object({}) { |(k, v), h| h[k.to_s] = v } }
        end
      end
    end
    out
  end

  def test_ruby_and_js_agree_on_every_case
    cases = build_cases
    assert_operator cases.length, :>, 300, 'ماتریس باید واقعاً بزرگ باشد'

    js = js_results(cases)
    assert_equal cases.length, js.length

    mismatches = []
    cases.each_with_index do |c, i|
      rb = ruby_result(c)
      next if rb == js[i]

      mismatches << "#{c['opts'].inspect} @ #{c['fw']}×#{c['fh']}\n" \
                    "    Ruby: #{JSON.generate(rb)}\n" \
                    "    JS  : #{JSON.generate(js[i])}"
      break if mismatches.length >= 3
    end

    assert_empty mismatches,
                 "Ruby و JS روی منطق دامنه واگرا شده‌اند — یعنی اسکچاپ و بقیهٔ " \
                 "میزبان‌ها لیست برش متفاوتی می‌دهند:\n" + mismatches.join("\n")
  end

  # گردکردن نیم: Ruby از صفر دور می‌کند، Math.round به +∞ می‌رود. برای y منفی
  # جعبه‌ها این تفاوت واقعی است، پس helper اختصاصی داریم — این تست قفلش می‌کند.
  def test_half_rounding_matches_on_negative_values
    # ۹٫۰۰۵ عمدی است: y تنپوش می‌شود −۲۰ + (۲۰−۹٫۰۰۵)/۲ = −۱۴٫۵۰۲۵ → رقم سوم
    # واقعاً گرد می‌شود. با ۱۰ (نسخهٔ اول این تست) y دقیقاً −۱۷٫۵ می‌شد و هیچ
    # گردکردنی رخ نمی‌داد، پس تست حتی با پیاده‌سازی واگرا سبز بود.
    cases = [{ 'fw' => 500, 'fh' => 700, 'fx' => 0.0, 'fz' => 0.0,
               'opts' => { 'door_shape' => 'framed_panel', 'door_thickness_mm' => 20,
                           'door_panel_thickness_mm' => 9.005 } }]
    js = js_results(cases).first
    rb = ruby_result(cases.first)
    panel_rb = rb['boxes'].find { |b| b['key'] == 'door_panel' }
    panel_js = js['boxes'].find { |b| b['key'] == 'door_panel' }

    # نگهبان: مقدار باید واقعاً از گردکردن دو رقمی گذشته باشد، وگرنه تست چیزی
    # نمی‌سنجد. با حساب دستی: −۲۰ + (۲۰ − ۹٫۰۰۵)/۲ = −۱۴٫۵۰۲۵
    raw = -20 + (20 - 9.005) / 2.0
    assert panel_rb['y'].negative?, 'y تنپوش باید منفی باشد تا تست معنا داشته باشد'
    refute_equal raw, panel_rb['y'],
                 'مقدار گردنشده و گردشده یکی‌اند — این ورودی گردکردن را لمس نمی‌کند'
    assert_equal panel_rb['y'], panel_js['y']
  end

  def test_fractional_thickness_rounds_the_same
    %w[18.4 18.6 20.5].each do |t|
      cases = [{ 'fw' => 500, 'fh' => 700, 'fx' => 0.0, 'fz' => 0.0,
                 'opts' => { 'door_shape' => 'flat', 'door_thickness_mm' => t.to_f } }]
      assert_equal ruby_result(cases.first)['thickness'], js_results(cases).first['thickness'],
                   "ضخامت #{t} باید در هر دو زبان یکسان گرد شود"
    end
  end

  def test_catalog_is_the_same_on_both_sides
    cases = [{ 'fw' => 500, 'fh' => 700, 'fx' => 0.0, 'fz' => 0.0, 'opts' => {} }]
    js_results(cases) # فقط برای اطمینان از بارگذاری کاتالوگ در JS
    js_ids = Dir.mktmpdir('kx-ids') do |dir|
      script = File.join(dir, 'ids.js')
      File.write(script, <<~JS, encoding: 'UTF-8')
        const path = require('path');
        const D = require(path.join(#{UI_DIR.inspect}, 'kalaxa-door-shapes.js'));
        process.stdout.write(JSON.stringify(D.ids()));
      JS
      out, err, status = Open3.capture3('node', script)
      raise err unless status.success?

      JSON.parse(out)
    end
    assert_equal D::IDS.sort, js_ids.sort,
                 'فهرست شکل‌ها باید از همان کاتالوگ بیاید'
  end
end
