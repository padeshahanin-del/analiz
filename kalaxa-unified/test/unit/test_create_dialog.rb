# encoding: utf-8
# frozen_string_literal: true

# دیالوگ ساخت یونیت — اجرا: ruby test/unit/test_create_dialog.rb
#
# موتور بخش‌بندی (۳.۶۰) پارامتر گرفت، ولی راه ورودی کاربر ناقص ماند: دیالوگ
# فقط «تعداد طبقه» می‌پرسید. موتوری که کاربر نتواند صدایش بزند، موتور نیست.
#
# دیالوگ حالا **دومرحله‌ای** است و فقط فیلدهای مربوط به همان تمپلیت را
# می‌پرسد. یک فهرست صاف با همهٔ فیلدها یعنی کاربرِ کتابخانه هم «نوع ریل کشو»
# را ببیند.
#
# خطرِ خاموشِ این طراحی: نگاشتِ **ترتیبی** مقادیر. اگر ترتیب فیلدها عوض شود
# و خواننده نه، مقدارِ «تعداد دهانه» در «تعداد کشو» می‌نشیند — بی‌آنکه خطایی
# بدهد. برای همین هر `reader` این‌جا با مقدار واقعی سنجیده می‌شود.
require 'minitest/autorun'
require 'tmpdir'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
$LOAD_PATH.unshift(File.expand_path('../stubs', __dir__))
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-dialog')
ENV['KALAXA_QUIET'] = '1'

require 'su_double'
require File.join(SRC, 'lib', 'catalog')
require File.join(SRC, 'lib', 'glossary')
require File.join(SRC, 'lib', 'materials')
require File.join(SRC, 'lib', 'door_shapes')
require File.join(SRC, 'lib', 'cabinet_builder')
require File.join(SRC, 'lib', 'cabinet_geometry')
require File.join(SRC, 'app', 'create_cabinet_tool')

class TestCreateDialog < Minitest::Test
  T = Kalaxa::App::CreateCabinetTool
  B = Kalaxa::CabinetBuilder

  # ---------- هر تمپلیت برچسب دارد ----------

  def test_every_template_has_a_persian_label
    missing = B::TEMPLATES.reject { |t| T::TEMPLATE_LABELS_FA[t] }
    assert_empty missing,
                 "این تمپلیت‌ها در دیالوگ با نام انگلیسی می‌آیند: #{missing.join(', ')}"
  end

  # ---------- فقط فیلدهای مربوط ----------

  def test_bookcase_is_not_asked_about_drawer_slides
    p = T.template_prompts('bookcase')
    joined = p[:prompts].join(' ')
    refute_includes joined, 'ریل کشو', 'کتابخانه ریل کشو ندارد'
    refute_includes joined, 'لولا', 'کتابخانه اصلاً درب ندارد'
  end

  def test_drawer_cabinet_is_asked_about_slides
    p = T.template_prompts('base_three_drawer')
    assert_includes p[:prompts].join(' '), 'ریل کشو'
  end

  def test_wardrobe_is_asked_about_bays_and_rail
    p = T.template_prompts('wardrobe')
    joined = p[:prompts].join(' ')
    assert_includes joined, 'دهانه'
    assert_includes joined, 'رگال'
    assert_includes joined, 'نوع درب', 'کمد می‌تواند درب ریلی داشته باشد'
  end

  def test_bookcase_has_no_door_mode_question
    # کتابخانه درب ندارد؛ پرسیدن «لولایی یا ریلی» بی‌معناست.
    refute_includes T.template_prompts('bookcase')[:prompts].join(' '), 'نوع درب'
  end

  def test_prompt_arrays_line_up
    # سه آرایه (پرسش، پیش‌فرض، فهرست) به `UI.inputbox` می‌روند و باید هم‌طول
    # باشند، وگرنه دیالوگ فیلد را با مقدارِ فیلد دیگری پر می‌کند.
    B::TEMPLATES.each do |t|
      p = T.template_prompts(t)
      assert_equal p[:prompts].length, p[:defaults].length, "#{t}: پیش‌فرض‌ها هم‌طول نیستند"
      assert_equal p[:prompts].length, p[:lists].length, "#{t}: فهرست‌ها هم‌طول نیستند"
    end
  end

  # ---------- خواندنِ مقادیر ----------

  def test_reader_maps_values_by_position_correctly
    p = T.template_prompts('base_three_drawer')
    out = p[:reader].call(%w[5 bottom])
    assert_equal 5, out[:drawer_count], 'تعداد کشو از فیلد اول'
    assert_equal 'bottom', out[:slide_kind], 'نوع ریل از فیلد دوم'
  end

  def test_wardrobe_reader_shifts_bay_numbers_from_one_to_zero
    # کاربر دهانه‌ها را از **یک** می‌شمرد؛ موتور از صفر. بدون این تبدیل،
    # «دهانهٔ ۱» به دهانهٔ دوم رگال می‌داد.
    p = T.template_prompts('wardrobe')
    out = p[:reader].call(['3', '4', '1,3', '0', 'hinged'])
    assert_equal 3, out[:bays]
    assert_equal 4, out[:shelf_count]
    assert_equal [0, 2], out[:hanging_bays], 'دهانهٔ ۱ و ۳ کاربر = ۰ و ۲ موتور'
  end

  def test_persian_comma_is_accepted
    # کاربر فارسی‌نویس «،» می‌زند نه «,».
    out = T.template_prompts('wardrobe')[:reader].call(['3', '3', '1،3', '0', 'hinged'])
    assert_equal [0, 2], out[:hanging_bays]
  end

  def test_empty_hanging_means_none
    out = T.template_prompts('wardrobe')[:reader].call(['2', '3', '', '0', 'hinged'])
    assert_empty out[:hanging_bays]
  end

  def test_zero_drawers_means_no_drawer_bay
    out = T.template_prompts('wardrobe')[:reader].call(['2', '3', '1', '0', 'hinged'])
    assert_nil out[:bay_fills], 'صفر کشو نباید دهانه را کشویی کند'
  end

  def test_drawer_bay_becomes_a_fill
    out = T.template_prompts('wardrobe')[:reader].call(['3', '3', '2', '4', 'hinged'])
    fills = out[:bay_fills]
    refute_nil fills
    assert_equal 3, fills.length, 'برای هر دهانه یک پُرکننده'
    assert_equal 'drawers', fills[0]['type'], 'دهانهٔ اول کشویی می‌شود'
    assert_equal 4, fills[0]['drawers']
    assert_equal 'hanging', fills[1]['type'], 'دهانهٔ رگال‌دار حفظ می‌شود'
  end

  def test_sliding_reaches_opts
    out = T.template_prompts('wardrobe')[:reader].call(['2', '3', '1', '0', 'sliding'])
    assert_equal 'sliding', out[:door_mode]
  end

  # ---------- از دیالوگ تا قطعهٔ واقعی ----------

  # مهم‌ترین تست این فایل: مقداری که کاربر در دیالوگ می‌زند باید تا لیست برش
  # برسد. هر حلقهٔ این زنجیره جداگانه درست است؛ باگ همیشه در وصلشان بوده.
  def test_dialog_values_reach_the_cut_list
    raw = T.template_prompts('wardrobe')[:reader].call(['3', '2', '2', '3', 'sliding'])
    opts = B.relevant_params('wardrobe', raw)

    assert_equal 3, opts[:bays], 'تعداد دهانه از فیلتر رد می‌شود'
    assert_equal 'sliding', opts[:door_mode]

    parts = B.build_parts('wardrobe', 200, 220, 60, opts)
    assert_equal 2, parts.find { |p| p['key'] == 'divider' }['count'],
                 'سه دهانه = دو جداکننده'
    assert parts.any? { |p| p['key'] == 'drawer_side' }, 'دهانهٔ کشویی قطعه می‌سازد'
    assert_includes parts.find { |p| p['key'] == 'door' }['note'], 'ریلی'
  end

  def test_section_params_do_not_leak_into_other_templates
    raw = { bays: 3, door_mode: 'sliding', shelf_count: 1 }
    opts = B.relevant_params('base_single_door', raw)
    assert_nil opts[:bays], 'کابینت معمولی دهانه ندارد'
    assert_nil opts[:door_mode]
  end
end
