# encoding: utf-8
# frozen_string_literal: true

# test_project_scanner.rb — پیمایش صحنه توسط ProjectScanner.
# اجرا:  ruby test/unit/test_project_scanner.rb
#
# چرا این تست وجود دارد: تا پیش از آن، ProjectScanner/RawGeometry/ImportSelection
# هیچ پوشش تستی نداشتند — و دقیقاً همان‌جا بود که کابینتِ ساخته‌شده به‌صورت
# Component از اسکن جا می‌افتاد. اسکچاپ این‌جا با کمینه‌ترین بدل جایگزین شده تا
# پیمایش در رینگ A (بیرون از اسکچاپ) قابل تست باشد.
require 'minitest/autorun'
require 'json'

# ---------------------------------------------------------------- بدل اسکچاپ
# سلسله‌مراتب واقعی اسکچاپ بازسازی می‌شود: Group زیرکلاسِ ComponentInstance است
# (از SU2015)، و ComponentInstance متد `entities` **ندارد** — تنها راهش
# definition.entities است. همین دو نکته مرزِ درست پیمایش را تعیین می‌کنند.
module Geom
  class Point3d
    attr_reader :x, :y, :z
    def initialize(x = 0, y = 0, z = 0)
      @x = x
      @y = y
      @z = z
    end
  end

  class Vector3d < Point3d; end

  # فقط انتقال (translation) — برای این تست کافی است.
  class Transformation
    attr_reader :origin
    def initialize(dx = 0, dy = 0, dz = 0)
      @dx = dx
      @dy = dy
      @dz = dz
      @origin = Point3d.new(dx, dy, dz)
    end

    def xaxis
      Vector3d.new(1, 0, 0)
    end

    def *(other)
      Transformation.new(@dx + other.dxx, @dy + other.dyy, @dz + other.dzz)
    end

    protected

    def dxx = @dx
    def dyy = @dy
    def dzz = @dz
  end
end

module Sketchup
  def self.version = '24.0.0'

  class Entities < Array; end

  class ComponentDefinition
    attr_reader :entities, :name
    def initialize(entities = [], name = 'def')
      @entities = entities
      @name = name
    end
  end

  # عمداً بدون متد `entities` — عین API واقعی.
  class ComponentInstance
    attr_reader :definition, :transformation, :persistent_id
    attr_accessor :name

    def initialize(definition:, transformation: Geom::Transformation.new,
                   name: '', dicts: {}, pid: object_id, hidden: false)
      @definition = definition
      @transformation = transformation
      @name = name
      @dicts = dicts
      @persistent_id = pid
      @hidden = hidden
    end

    def deleted? = false
    def hidden? = @hidden

    def attribute_dictionary(key, create = false)
      @dicts[key] ||= (create ? {} : nil)
    end
  end

  class Group < ComponentInstance
    def entities = @definition.entities
  end

  class Model
    attr_reader :entities
    def initialize(entities) = @entities = entities
    def path = ''
    def attribute_dictionary(_key, _create = false) = nil
  end
end

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
require File.join(SRC, 'lib', 'project_scanner')

class TestProjectScanner < Minitest::Test
  BOXES = [{ 'id' => 'pid-1', 'name' => 'بدنه چپ',
             'x' => 0, 'y' => 0, 'z' => 0, 'dx' => 16, 'dy' => 550, 'dz' => 720 }].freeze

  def raw_dict(label)
    { 'boxes_json' => JSON.generate(BOXES), 'child_count' => 1, 'label_fa' => label }
  end

  # sheet_id لازم است: از این نسخه اسکنر قطعهٔ بی‌ورق را منتشر نمی‌کند و در
  # scan_errors گزارش می‌دهد (قرارداد snapshot روی خودِ تولیدکننده اجرا می‌شود).
  def cabinet_dict
    { 'kalaxa_id' => 'cab-1', 'template_id' => 'base_single_door', 'category' => 'base',
      'label_fa' => 'کابینت زیر', 'params' => JSON.generate({ 'width_cm' => 80 }),
      'parts' => JSON.generate([{ 'key' => 'side_l', 'name_fa' => 'بدنه',
                                  'count' => 2, 'cut_length_cm' => 72,
                                  'cut_width_cm' => 55, 'thickness_mm' => 16,
                                  'sheet_id' => 'mdf_white_16' }]) }
  end

  def scan(*top_level)
    Kalaxa::ProjectScanner.build_snapshot(Sketchup::Model.new(top_level))
  end

  def empty_def = Sketchup::ComponentDefinition.new([])

  # --- گروه: مسیر همیشه‌کارکرده، به‌عنوان مهار ---
  def test_group_with_raw_dict_is_scanned
    g = Sketchup::Group.new(definition: empty_def, name: 'گروه من',
                            dicts: { 'kalaxa_raw_scan' => raw_dict('گروه من') }, pid: 11)
    snap = scan(g)
    assert_equal 1, snap['raw_cabinets'].length, 'کابینت خام روی Group باید اسکن شود'
    assert_equal 'گروه من', snap['raw_cabinets'].first['label_fa']
  end

  # --- کامپوننت: همان چیزی که ImportSelection اجازهٔ انتخابش را می‌دهد ---
  def test_component_instance_with_raw_dict_is_scanned
    c = Sketchup::ComponentInstance.new(definition: empty_def, name: 'کابینت کامپوننتی',
                                        dicts: { 'kalaxa_raw_scan' => raw_dict('کابینت کامپوننتی') },
                                        pid: 22)
    snap = scan(c)
    assert_equal 1, snap['raw_cabinets'].length,
                 'کابینتی که کاربر به‌صورت Component ساخته و «خوانده» باید در اسکن دیده شود'
    assert_equal 'کابینت کامپوننتی', snap['raw_cabinets'].first['label_fa']
  end

  def test_component_instance_with_cabinet_dict_is_scanned
    c = Sketchup::ComponentInstance.new(definition: empty_def, name: 'کابینت کالاکسا',
                                        dicts: { 'kalaxa_cabinet' => cabinet_dict }, pid: 33)
    snap = scan(c)
    assert_equal 1, snap['cabinets'].length, 'کابینت کالاکسا روی Component باید اسکن شود'
    assert_equal 1, snap['parts_flat'].length
  end

  # --- کامپوننت تودرتو: dictionary روی فرزندِ داخل تعریف ---
  def test_nested_component_inside_group_is_scanned
    inner = Sketchup::ComponentInstance.new(definition: empty_def, name: 'داخلی',
                                            dicts: { 'kalaxa_raw_scan' => raw_dict('داخلی') },
                                            pid: 44)
    outer = Sketchup::Group.new(definition: Sketchup::ComponentDefinition.new([inner]),
                                name: 'دیوار شمالی', pid: 45)
    snap = scan(outer)
    assert_equal 1, snap['raw_cabinets'].length, 'کامپوننت داخل گروه چیدمان باید دیده شود'
  end

  def test_component_children_are_walked
    inner = Sketchup::Group.new(definition: empty_def, name: 'کابینت داخل کامپوننت',
                                dicts: { 'kalaxa_raw_scan' => raw_dict('داخلی') }, pid: 55)
    outer = Sketchup::ComponentInstance.new(
      definition: Sketchup::ComponentDefinition.new([inner]), name: 'بلوک', pid: 56
    )
    snap = scan(outer)
    assert_equal 1, snap['raw_cabinets'].length, 'فرزندان تعریفِ کامپوننت باید پیمایش شوند'
  end

  # --- مخفی‌ها ---
  def test_hidden_cabinet_is_skipped_and_counted
    g = Sketchup::Group.new(definition: empty_def, name: 'مخفی',
                            dicts: { 'kalaxa_cabinet' => cabinet_dict }, pid: 66, hidden: true)
    snap = scan(g)
    assert_equal 0, snap['cabinets'].length
    assert_equal 1, snap['scan_stats']['hidden_skipped']
  end

  def test_entities_without_dictionary_are_ignored
    c = Sketchup::ComponentInstance.new(definition: empty_def, name: 'میز معمولی', pid: 77)
    snap = scan(c)
    assert_empty snap['cabinets']
    assert_empty snap['raw_cabinets']
    assert_empty snap['scan_errors']
  end
end
