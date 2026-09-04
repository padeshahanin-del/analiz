# encoding: utf-8
# frozen_string_literal: true

# پیش‌فرض نوار/شیار — اجرا: ruby test/unit/test_edge_defaults.rb
#
# کاربر گفت جدول «قطعات خوانده‌شده» علامت نوار و شیار ندارد. برای کابینت‌های
# ساختهٔ کالاکسا این قاعده در `CabinetBuilder` نوشته شده؛ اگر برای کابینت اسکن‌شده
# دوباره جایی می‌نوشتیمش، **دو قاعدهٔ موازی** می‌شد و بی‌صدا از هم جدا می‌شدند —
# همان الگویی که در این پروژه بارها باگ ساخته: نویسنده و خواننده هرگز هم را
# نمی‌بینند و هر دو تنهایی سبزند.
#
# پس یک کاتالوگ مشترک (`data/edges.json`) داریم و این تست ثابت می‌کند آن جدول
# با آنچه سازنده **واقعاً** بیرون می‌دهد یکی است. اگر روزی قاعدهٔ سازنده عوض شد
# و کاتالوگ نه، همین‌جا قرمز می‌شود.
require 'minitest/autorun'
require 'json'
require 'tmpdir'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
$LOAD_PATH.unshift(File.expand_path('../stubs', __dir__))
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-edge')
ENV['KALAXA_QUIET'] = '1'

require 'su_double'
require File.join(SRC, 'lib', 'cabinet_builder')

class TestEdgeDefaults < Minitest::Test
  CATALOG = JSON.parse(File.read(File.join(SRC, 'data', 'edges.json')))['roles']

  # همهٔ تمپلیت‌ها را می‌سازیم و قاعدهٔ واقعی هر نقش را از خروجی برمی‌داریم.
  def observed
    return @observed if @observed

    @observed = {}
    Kalaxa::CabinetBuilder::TEMPLATES.each do |tid|
      parts = Kalaxa::CabinetBuilder.build_parts(tid, 90, 72, 55)
      parts.each do |p|
        key = p['key']
        seen = { 'edge' => p['edge'] || {}, 'groove' => (p['groove'] || {}).keys.any? ? { 'back' => 1 } : {} }
        if @observed[key] && @observed[key] != seen
          flunk "نقش #{key} در تمپلیت‌های مختلف نوار/شیار متفاوت دارد — " \
                "پس «پیش‌فرض بر پایهٔ نقش» فرض غلطی است: #{@observed[key]} در برابر #{seen}"
        end
        @observed[key] = seen
      end
    end
    @observed
  end

  def test_every_role_the_builder_makes_exists_in_the_catalog
    missing = observed.keys.reject { |k| CATALOG.key?(k) }
    assert_empty missing,
                 "سازنده این نقش‌ها را می‌سازد ولی کاتالوگ نمی‌شناسدشان: #{missing.inspect}"
  end

  def test_catalog_edges_match_what_the_builder_actually_produces
    observed.each do |key, real|
      cat = CATALOG[key]
      assert_equal real['edge'], cat['edge'],
                   "نوار لبهٔ «#{key}» در کاتالوگ با خروجی واقعی سازنده نمی‌خواند"
    end
  end

  def test_catalog_grooves_match
    observed.each do |key, real|
      assert_equal real['groove'], CATALOG[key]['groove'],
                   "شیار «#{key}» در کاتالوگ با خروجی واقعی سازنده نمی‌خواند"
    end
  end

  # ---------- درستیِ خودِ جدول ----------

  def test_body_panels_are_banded_only_on_the_visible_edge
    # کارگاه لبهٔ دیده‌نشده را نوار نمی‌زند؛ اگر جدول همه را نوار بزند، برآورد
    # متراژ نوار چند برابر می‌شود و سفارش غلط می‌رود.
    assert_equal({ 'front' => 1 }, CATALOG['side']['edge'])
    assert_equal({ 'front' => 1 }, CATALOG['bottom']['edge'])
  end

  def test_fronts_are_banded_on_all_four_sides
    %w[door drawer_front].each do |k|
      assert_equal 4, CATALOG[k]['edge'].keys.length, "#{k} باید چهار طرف نوار بخورد"
    end
  end

  def test_back_panel_has_no_banding
    assert_empty CATALOG['back']['edge'], 'پشت‌بند داخل شیار می‌نشیند — نوار ندارد'
  end

  def test_hardware_has_neither
    assert_empty CATALOG['hardware']['edge']
    assert_empty CATALOG['hardware']['groove']
  end

  def test_grooved_panels_are_exactly_those_that_hold_the_back
    grooved = CATALOG.select { |_k, v| v['groove'].keys.any? }.keys.sort
    # کابینت گوشه هم پشت‌بند دارد (دو تا، یکی روی هر دیوار) و کفش همان‌طور
    # شیار می‌خورد. ولی `side_corner` — دیوارهٔ کوتاهِ کنار نمای اریب — به
    # هیچ دیواری نمی‌چسبد و پشت‌بندی نگه نمی‌دارد، پس شیار ندارد.
    assert_equal %w[bottom bottom_corner side top_bottom], grooved,
                 'فقط قطعاتی که پشت‌بند داخلشان می‌نشیند شیار دارند'
  end

  def test_catalog_covers_every_classifier_role
    # نقش‌های کلاسیفایر از فایل JS خوانده می‌شود تا اگر نقشی آن‌جا اضافه شد و
    # این‌جا نه، جدول بی‌صدا «بدون نوار» فرض نکند.
    js = File.read(File.join(SRC, 'ui', 'kalaxa-part-classifier.js'))
    roles = js[/var ROLES = \[(.*?)\];/m, 1].scan(/'([a-z_]+)'/).flatten
    missing = roles - CATALOG.keys
    assert_empty missing, "کاتالوگ این نقش‌های کلاسیفایر را ندارد: #{missing.inspect}"
  end
end
