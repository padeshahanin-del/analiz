# encoding: utf-8
# frozen_string_literal: true

# ثبتِ کاملِ هر تمپلیت — اجرا: ruby test/unit/test_template_registry.rb
#
# یک تمپلیت تازه باید در **پنج** جای مستقل ثبت شود:
#   ۱. فهرست `TEMPLATES`
#   ۲. لیست برش (قطعه بسازد)
#   ۳. هندسهٔ سه‌بعدی (جعبه بسازد)
#   ۴. برچسب فارسی دیالوگ
#   ۵. کاتالوگ دسته‌بندی (گروه + دسته + اندازهٔ آماده)
#
# جا ماندن هیچ‌کدام **خطا نمی‌دهد** — فقط تمپلیت در یکی از این پنج جا نیست.
# دقیقاً همین اتفاق افتاد: `CATEGORY_OF` دستی بود و کمد و کتابخانه و گوشه در
# آن نبودند، پس همه 'base' حساب می‌شدند و کمد ۲۴۰ سانتی صفحهٔ کار می‌گرفت.
#
# این فایل به‌جای تست هر تمپلیت، **قاعده** را تست می‌کند: هر چه در
# `TEMPLATES` هست باید همه‌جا باشد. پس تمپلیت چهاردهم هم خودکار پوشش دارد.
require 'minitest/autorun'
require 'tmpdir'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
$LOAD_PATH.unshift(File.expand_path('../stubs', __dir__))
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-registry')
ENV['KALAXA_QUIET'] = '1'

require 'su_double'
require File.join(SRC, 'lib', 'catalog')
require File.join(SRC, 'lib', 'glossary')
require File.join(SRC, 'lib', 'materials')
require File.join(SRC, 'lib', 'door_shapes')
require File.join(SRC, 'lib', 'unit_sections')
require File.join(SRC, 'lib', 'cabinet_builder')
require File.join(SRC, 'lib', 'cabinet_geometry')
require File.join(SRC, 'app', 'create_cabinet_tool')

class TestTemplateRegistry < Minitest::Test
  B = Kalaxa::CabinetBuilder
  G = Kalaxa::CabinetGeometry
  T = Kalaxa::App::CreateCabinetTool
  VALID_CATEGORIES = %w[base wall tall].freeze

  # اندازه‌ای که برای همان تمپلیت معتبر است — از اولین اندازهٔ آمادهٔ کاتالوگ.
  def dims_for(t)
    p = Kalaxa::Catalog.template_presets(t).first
    p ? [p['w'], p['h'], p['d']] : [80, 72, 55]
  end

  def test_there_is_something_to_check
    assert_operator B::TEMPLATES.length, :>=, 10,
                    'فهرست تمپلیت‌ها خالی/کوتاه شده — این تست دیگر چیزی نگه نمی‌دارد'
  end

  def test_every_template_has_a_persian_label
    missing = B::TEMPLATES.reject { |t| T::TEMPLATE_LABELS_FA[t] }
    assert_empty missing, "بدون برچسب فارسی: #{missing.join(', ')}"
  end

  def test_every_template_is_in_the_catalog
    missing = B::TEMPLATES.reject { |t| Kalaxa::Catalog.template_defs[t] }
    assert_empty missing, "در کاتالوگ نیستند: #{missing.join(', ')}"
  end

  def test_every_template_has_a_known_category
    bad = B::TEMPLATES.reject { |t| VALID_CATEGORIES.include?(B.category_of(t)) }
    assert_empty bad, "دستهٔ ناشناخته: #{bad.join(', ')}"
  end

  def test_every_template_belongs_to_a_defined_group
    groups = Kalaxa::Catalog.template_groups.keys
    bad = B::TEMPLATES.reject { |t| groups.include?(Kalaxa::Catalog.template_group(t)) }
    assert_empty bad, "گروهشان تعریف نشده: #{bad.join(', ')}"
  end

  def test_every_template_has_at_least_one_preset
    # بدون اندازهٔ آماده، دیالوگ مرحلهٔ اول چیزی برای انتخاب ندارد.
    bad = B::TEMPLATES.select { |t| Kalaxa::Catalog.template_presets(t).empty? }
    assert_empty bad, "اندازهٔ آماده ندارند: #{bad.join(', ')}"
  end

  def test_every_preset_is_actually_buildable
    # اندازهٔ آماده‌ای که ساختنش خطا بدهد، از نبودنش بدتر است: کاربر
    # انتخابش می‌کند و برنامه می‌ترکد.
    B::TEMPLATES.each do |t|
      Kalaxa::Catalog.template_presets(t).each do |p|
        parts = B.build_parts(t, p['w'], p['h'], p['d'], symbolize(p['opts']))
        refute_empty parts, "#{t} / #{p['label_fa']}: قطعه‌ای نساخت"
      rescue ArgumentError => e
        flunk "#{t} / #{p['label_fa']} (#{p['w']}×#{p['h']}×#{p['d']}): #{e.message}"
      end
    end
  end

  def test_every_template_builds_geometry
    B::TEMPLATES.each do |t|
      w, h, d = dims_for(t)
      refute_empty G.boxes_for(t, w, h, d), "#{t}: هندسه نساخت"
    end
  end

  def test_every_template_asks_relevant_questions
    B::TEMPLATES.each do |t|
      p = T.template_prompts(t)
      refute_empty p[:prompts], "#{t}: هیچ پرسشی ندارد"
      assert_equal p[:prompts].length, p[:defaults].length, "#{t}: پیش‌فرض‌ها هم‌طول نیستند"
      assert_equal p[:prompts].length, p[:lists].length, "#{t}: فهرست‌ها هم‌طول نیستند"
    end
  end

  # ---------- تمپلیت‌های تازه، رفتار درست ----------

  def test_open_units_have_no_doors
    %w[bookcase base_open wall_open].each do |t|
      w, h, d = dims_for(t)
      keys = B.build_parts(t, w, h, d).map { |p| p['key'] }
      refute_includes keys, 'door', "#{t} باز است و درب ندارد"
    end
  end

  def test_sliding_wardrobe_really_slides
    w, h, d = dims_for('wardrobe_sliding')
    door = B.build_parts('wardrobe_sliding', w, h, d).find { |p| p['key'] == 'door' }
    refute_nil door
    assert_includes door['note'], 'ریلی'
    # لنگهٔ ریلی از نصفِ عرض پهن‌تر است، وگرنه وسط کمد شکاف می‌ماند.
    assert_operator door['cut_width_mm'], :>, w * 10 / 2.0
  end

  def test_pantry_has_more_shelves_than_a_plain_tall
    w, h, d = dims_for('tall_pantry')
    pantry = B.build_parts('tall_pantry', w, h, d).find { |p| p['key'] == 'shelf' }
    plain  = B.build_parts('tall_double_door', 60, 200, 55).find { |p| p['key'] == 'shelf' }
    assert_operator pantry['count'], :>, plain['count'],
                    'آذوقه طبقهٔ بیشتری دارد — دلیل وجودش همین است'
  end

  private

  def symbolize(h)
    return {} unless h.is_a?(Hash)

    h.each_with_object({}) { |(k, v), out| out[k.to_sym] = v }
  end
end
