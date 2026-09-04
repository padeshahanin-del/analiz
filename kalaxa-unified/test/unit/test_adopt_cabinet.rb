# encoding: utf-8
# frozen_string_literal: true

# تبدیل کابینت خوانده‌شده به پارامتریک — اجرا: ruby test/unit/test_adopt_cabinet.rb
#
# کاربر: «اونی که آنالیز کردم رو می‌خوام جزو کابینت‌های در حال ساختم باشه که
# بتونم اندازه رو تغییر بدم».
#
# استنتاج ابعاد در JS است (kalaxa-adopt.js) و تستش هم آن‌جاست. این‌جا فقط
# **سیاست اجرا** سنجیده می‌شود، که خطرناک‌ترین بخش است چون به مدل کاربر دست
# می‌زند: کابینت درست پیدا شود، ورودی خراب رد شود، و — مهم‌تر از همه — کار
# کاربر پاک نشود.
require 'minitest/autorun'
require 'tmpdir'
require 'json'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
$LOAD_PATH.unshift(File.expand_path('../stubs', __dir__))
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-adopt')
ENV['KALAXA_QUIET'] = '1'

require 'su_double'
require File.join(SRC, 'app', 'errors')
require File.join(SRC, 'lib', 'catalog')
require File.join(SRC, 'lib', 'cabinet_builder')
require File.join(SRC, 'app', 'adopt_cabinet')

class TestAdoptCabinet < Minitest::Test
  A = Kalaxa::App::AdoptCabinet

  def raw_group(pid: 7, name: 'کابینت من')
    Sketchup::Group.new(name: name, pid: pid,
                        dicts: { 'kalaxa_raw' => { 'boxes_json' => '[]' } },
                        bounds: Geom::BoundingBox.new(Geom::Point3d.new(1, 2, 0),
                                                      Geom::Point3d.new(5, 6, 3)))
  end

  def setup
    @raw = raw_group
    Sketchup.active_model = Sketchup::Model.new([@raw])
    @built = []
    # ساختِ واقعی هندسه کار اسکچاپ است، نه این ماژول. آن را بدل می‌گیریم تا
    # سیاستِ تبدیل قابل سنجش باشد — و ورودی‌اش را نگه می‌داریم تا ببینیم
    # چه چیزی به سازنده رفت.
    tool = Class.new do
      # setter نمی‌تواند endless باشد (محدودیت نحوی روبی)
      def self.hook=(h)
        @hook = h
      end

      def self.build_at(model, origin, tpl, label, w, h, d, opts)
        @hook.call(model, origin, tpl, label, w, h, d, opts)
        Sketchup::Group.new(name: label, pid: 99)
      end
    end
    tool.hook = ->(*args) { @built << args }
    Kalaxa::App.const_set(:CreateCabinetTool, Module.new) unless
      Kalaxa::App.const_defined?(:CreateCabinetTool, false)
    Kalaxa::App::CreateCabinetTool.const_set(:PlaceCabinetTool, tool)
  end

  def teardown
    Kalaxa::App::CreateCabinetTool.send(:remove_const, :PlaceCabinetTool)
  end

  def params(over = {})
    { 'kalaxa_id' => 'raw-7', 'label_fa' => 'کابینت من',
      'template_id' => 'base_single_door',
      'width_cm' => 90.0, 'height_cm' => 72.0, 'depth_cm' => 55.0,
      'opts' => { 'body_thickness_mm' => 16 } }.merge(over)
  end

  # ---------- پیدا کردن کابینت ----------

  def test_finds_raw_group_by_id
    assert_equal @raw, A.find_raw_group(Sketchup.active_model, 'raw-7')
  end

  def test_missing_cabinet_says_so_instead_of_building_something_wrong
    e = assert_raises(Kalaxa::Error) { A.run(params('kalaxa_id' => 'raw-404')) }
    assert_match(/پیدا نشد/, e.message)
    assert_empty @built, 'وقتی کابینت پیدا نشد، هیچ چیزی نباید ساخته شود'
  end

  def test_group_without_raw_dict_is_not_adoptable
    plain = Sketchup::Group.new(name: 'یک گروه ساده', pid: 8)
    Sketchup.active_model = Sketchup::Model.new([plain])
    assert_nil A.find_raw_group(Sketchup.active_model, 'raw-8'),
               'گروهی که خوانده نشده، کابینت خوانده‌شده نیست'
  end

  # ---------- ورودی خراب ----------

  def test_unknown_template_is_rejected
    assert_raises(Kalaxa::ValidationError) { A.run(params('template_id' => 'چیز_عجیب')) }
    assert_empty @built
  end

  def test_zero_or_negative_dimensions_are_rejected
    [0, -5].each do |bad|
      assert_raises(Kalaxa::ValidationError) { A.run(params('width_cm' => bad)) }
      assert_raises(Kalaxa::ValidationError) { A.run(params('height_cm' => bad)) }
      assert_raises(Kalaxa::ValidationError) { A.run(params('depth_cm' => bad)) }
    end
    assert_empty @built, 'ابعاد نامعتبر نباید به سازنده برسد'
  end

  # ---------- کار کاربر پاک نمی‌شود ----------

  def test_original_is_hidden_not_deleted
    A.run(params)
    assert @raw.hidden?, 'اصل باید مخفی شود'
    assert_includes Sketchup.active_model.entities, @raw,
                    'اصل نباید از مدل حذف شود — تبدیل بر پایهٔ حدس است، ' \
                    'و پاک‌کردن کار کاربر بر پایهٔ حدس اشتباه است'
  end

  def test_original_is_renamed_so_it_is_obvious
    A.run(params)
    assert_match(/تبدیل شد/, @raw.name, 'کاربر باید بفهمد این کدام است')
  end

  # ---------- آنچه ساخته می‌شود ----------

  def test_builds_at_the_same_corner
    A.run(params)
    _model, origin, = @built.first
    assert_in_delta 1, origin.x, 0.001, 'کابینت تازه باید جای همان قبلی بنشیند'
    assert_in_delta 2, origin.y, 0.001
    assert_in_delta 0, origin.z, 0.001
  end

  def test_passes_dimensions_and_options_through
    A.run(params)
    _m, _o, tpl, label, w, h, d, opts = @built.first
    assert_equal 'base_single_door', tpl
    assert_equal 'کابینت من', label
    assert_in_delta 90, w, 0.01
    assert_in_delta 72, h, 0.01
    assert_in_delta 55, d, 0.01
    assert_equal 16, opts[:body_thickness_mm], 'کلیدها باید symbol شوند وگرنه سازنده نادیده‌شان می‌گیرد'
  end

  def test_empty_label_falls_back_to_group_name
    A.run(params('label_fa' => ''))
    assert_equal 'کابینت من', @built.first[3]
  end

  # ---------- عملیات مدل ----------

  def test_wraps_everything_in_one_undoable_operation
    A.run(params)
    assert_equal 1, Sketchup.active_model.ops.length,
                 'کل تبدیل باید یک Undo باشد، نه چند تا'
  end

  def test_failure_aborts_the_operation
    Kalaxa::App::CreateCabinetTool::PlaceCabinetTool.hook =
      ->(*_) { raise 'ساخت شکست' }
    assert_raises(Kalaxa::Error) { A.run(params) }
    refute_empty Sketchup.active_model.aborted,
                 'شکست وسط کار نباید مدل را نیمه‌کاره رها کند'
    refute @raw.hidden?, 'و اصل نباید مخفی مانده باشد'
  end

  def test_reports_success_with_a_message_for_the_user
    res = A.run(params)
    assert res['ok']
    assert_match(/مخفی/, res['message'], 'کاربر باید بداند اصل کجا رفت')
  end
end
