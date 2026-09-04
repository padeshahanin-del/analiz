# encoding: utf-8
# frozen_string_literal: true

# لوازم: از مدل تا اسنپ‌شات — اجرا: ruby test/unit/test_object_scan.rb
#
# کاتالوگ لوازم (۳.۶۳) موتور داشت ولی **راه ورودی نداشت**: نه منویی برای
# گذاشتن سینک، نه جایی که در اسنپ‌شات بیاید. همان الگویی که یک بار با
# «قطعات دستی» تجربه شد و نباید تکرار می‌شد.
#
# این تست حلقه را می‌بندد: ابزار می‌نویسد → اسکنر می‌خواند. اگر یکی از دو سر
# عوض شود و دیگری نه، **هیچ خطایی رخ نمی‌دهد** — فقط سینک در فهرست کالا
# غایب می‌ماند.
require 'minitest/autorun'
require 'tmpdir'
require 'json'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
$LOAD_PATH.unshift(File.expand_path('../stubs', __dir__))
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-obj')
ENV['KALAXA_QUIET'] = '1'

require 'su_double'
require File.join(SRC, 'lib', 'catalog')
require File.join(SRC, 'lib', 'project_scanner')
require File.join(SRC, 'app', 'place_object_tool')

class TestObjectScan < Minitest::Test
  S = Kalaxa::ProjectScanner
  T = Kalaxa::App::PlaceObjectTool

  # ---------- دو سرِ قرارداد ----------

  # نامِ dictionary تنها چیزی است که ابزار و اسکنر را به هم وصل می‌کند.
  # اگر یکی عوض شود، لوازم بی‌صدا ناپدید می‌شوند.
  def test_tool_and_scanner_agree_on_the_dictionary_name
    assert_equal T::DICT_NAME, S::OBJECT_DICT_NAME,
                 'نام dictionary ابزار و اسکنر باید یکی باشد'
  end

  # ---------- ساختن dictionary مثل ابزار ----------

  def obj_group(id, spec, name: 'سینک')
    d = {
      'object_id' => id, 'label_fa' => spec['label_fa'], 'group' => spec['group'],
      'unit' => spec['unit'] || 'عدد',
      'w_mm' => spec['w'].to_f, 'd_mm' => spec['d'].to_f, 'h_mm' => spec['h'].to_f,
      'mount' => spec['mount'].to_s, 'min_cabinet_w' => spec['min_cabinet_w'].to_f,
      'cutout_json' => spec['cutout'] ? JSON.generate(spec['cutout']) : ''
    }
    Sketchup::Group.new(name: name, pid: id.hash.abs,
                        definition: Sketchup::ComponentDefinition.new([]),
                        dicts: { S::OBJECT_DICT_NAME => d })
  end

  def sink_spec
    Kalaxa::Catalog.object_spec('sink_single')
  end

  def extract(group)
    S.extract_object(group, group.attribute_dictionary(S::OBJECT_DICT_NAME),
                     Geom::Transformation.new)
  end

  def test_scanner_reads_what_the_tool_writes
    o = extract(obj_group('sink_single', sink_spec))
    refute_nil o
    assert_equal 'sink_single', o['object_id']
    assert_equal 'سینک تک‌لگن', o['label_fa']
    assert_in_delta 800, o['w_mm'], 0.1
    assert_equal 'عدد', o['unit']
  end

  def test_cutout_survives_the_round_trip
    # بریدگی مهم‌ترین عددِ این مسیر است: اگر گم شود، صفحه‌بُر اندازهٔ بیرونی
    # را می‌بُرد و سینک توی سوراخ می‌افتد.
    o = extract(obj_group('sink_single', sink_spec))
    refute_nil o['cutout'], 'بریدگی نباید گم شود'
    assert_in_delta 780, o['cutout']['w'], 0.1
    assert_in_delta 480, o['cutout']['d'], 0.1
    assert_operator o['cutout']['w'], :<, o['w_mm'],
                    'بریدگی از دستگاه کوچک‌تر می‌ماند'
  end

  def test_object_without_cutout_is_not_invented
    o = extract(obj_group('oven_built_in', Kalaxa::Catalog.object_spec('oven_built_in')))
    assert_nil o['cutout'], 'فر بریدگی ندارد — نباید ساخته شود'
  end

  def test_object_without_id_is_skipped
    g = obj_group('sink_single', sink_spec)
    g.attribute_dictionary(S::OBJECT_DICT_NAME)['object_id'] = ''
    assert_nil extract(g), 'بدون شناسه، ردیف جعلی ساخته نمی‌شود'
  end

  def test_broken_cutout_json_does_not_break_the_scan
    g = obj_group('sink_single', sink_spec)
    g.attribute_dictionary(S::OBJECT_DICT_NAME)['cutout_json'] = '{ناقص'
    o = nil
    assert_silent { o = extract(g) }
    refute_nil o, 'یک آبجکت خراب نباید کل اسکن را بشکند'
    assert_nil o['cutout'], 'ولی بریدگیِ حدسی هم ساخته نمی‌شود'
  end

  # ---------- ابعاد از لحظهٔ ساخت، نه کاتالوگ جاری ----------

  # اگر کارگاه بعداً ابعاد کاتالوگ را عوض کند، سینکی که دیروز گذاشته شده
  # باید همان عددی را نگه دارد که با آن ساخته شد — وگرنه بریدگیِ صفحه‌ای که
  # قبلاً بریده شده، در گزارش عوض می‌شود.
  def test_dimensions_come_from_the_group_not_the_catalog
    spec = sink_spec.merge('w' => 820, 'cutout' => { 'w' => 800, 'd' => 480 })
    o = extract(obj_group('sink_single', spec))
    assert_in_delta 820, o['w_mm'], 0.1, 'ابعادِ ثبت‌شده می‌ماند'
    assert_in_delta 800, o['cutout']['w'], 0.1
    # کاتالوگ هنوز ۸۰۰ است — یعنی واقعاً از گروه خوانده شده، نه از کاتالوگ.
    assert_in_delta 800, Kalaxa::Catalog.object_spec('sink_single')['w'], 0.1
  end

  # ---------- کاتالوگ ابزار ----------

  def test_tool_lists_catalog_objects
    ids = T.objects.keys
    assert_includes ids, 'sink_single'
    assert_includes ids, 'hob_gas_5'
    refute_empty ids
  end

  def test_every_catalog_object_can_be_written_and_read
    # اگر قلمی از کاتالوگ در این مسیر بشکند، فقط همان قلم بی‌صدا غایب می‌شود.
    T.objects.each do |id, spec|
      o = extract(obj_group(id, spec))
      refute_nil o, "#{id}: خوانده نشد"
      assert_operator o['w_mm'], :>, 0, "#{id}: عرض نامعتبر"
      assert_equal id, o['object_id']
    end
  end
end
