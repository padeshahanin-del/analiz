# encoding: utf-8
# frozen_string_literal: true

# مرز اسکچاپ — اجرا: ruby test/unit/test_sketchup_boundary.rb
#
# چرا: اندازه‌گیری پوشش نشان داد ۱٬۲۳۳ خط در ۱۰ فایل **هرگز در هیچ تستی بارگذاری
# نمی‌شوند** — و این دقیقاً همان لایه‌ای است که این جلسه دو باگ خاموش تویش پیدا شد
# (ProjectScanner تا همین هفته صفر تست داشت). این فایل آن بخشی از مرز را می‌پوشاند
# که واقعاً قابل تست است: هرچه فقط به «مدل» تکیه دارد، نه به پنجره و ماوس.
#
# همان بدل کمینهٔ اسکچاپ که در test_project_scanner.rb ساخته شد، این‌جا کامل‌تر
# می‌شود تا خواندن/نوشتن attribute و عملیات undo را هم بپوشاند.
require 'minitest/autorun'
require 'json'
require 'tmpdir'
require 'fileutils'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
# فایل‌های مرزی `require 'sketchup.rb'` می‌کنند که بیرون از اسکچاپ وجود ندارد —
# دقیقاً همین چیزی بود که مانع بارگذاریشان در تست می‌شد. stub خالی مسیر را باز
# می‌کند؛ کلاس‌های لازم را هر تست خودش می‌سازد.
$LOAD_PATH.unshift(File.expand_path('../stubs', __dir__))
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-boundary')
ENV['KALAXA_QUIET'] = '1'

require 'su_double'

require File.join(SRC, 'lib', 'project_scanner')
require File.join(SRC, 'lib', 'raw_geometry')
require File.join(SRC, 'lib', 'settings_service')
require File.join(SRC, 'lib', 'offcut_store_io')
require File.join(SRC, 'adapter', 'store')

class TestSketchUpBoundary < Minitest::Test
  # ============================================================ صفحه/قرنیز
  # مسیری که تا امروز نه تست داشت، نه اعتبارسنجی — و به شیت قیمت می‌رسد.

  def moulding_group(dict, pid = 1)
    Sketchup::Group.new(name: 'صفحه', dicts: { 'kalaxa_moulding_board' => dict }, pid: pid)
  end

  def scan(*groups)
    Kalaxa::ProjectScanner.build_snapshot(Sketchup::Model.new(groups))
  end

  def test_valid_moulding_board_is_scanned
    snap = scan(moulding_group('board_id' => 'b1', 'label_fa' => 'کانتر',
                               'length_mm' => 3000, 'width_mm' => 600, 'returns' => 2))
    assert_equal 1, snap['moulding_boards'].length
    b = snap['moulding_boards'].first
    assert_equal 3000, b['length_mm']
    assert_equal 2, b['returns']
    assert_empty snap['scan_errors']
  end

  def test_zero_length_board_is_reported_not_silently_dropped
    # kalaxa-moulding.js با `len > 0` خودش را حفظ می‌کند، پس قیمت غلط نمی‌شود —
    # ولی صفحه بی‌صدا از فاکتور می‌افتاد و کاربر دلیلش را نمی‌فهمید.
    snap = scan(moulding_group('label_fa' => 'کانتر خراب', 'length_mm' => 0,
                               'width_mm' => 600, 'returns' => 0))
    assert_empty snap['moulding_boards']
    assert snap['scan_errors'].any? { |e| e.include?('طول نامعتبر') },
           "باید صریح گزارش شود: #{snap['scan_errors'].inspect}"
    assert snap['scan_errors'].first.include?('کانتر خراب'), 'باید بگوید کدام صفحه'
  end

  def test_negative_returns_is_reported
    snap = scan(moulding_group('label_fa' => 'ک', 'length_mm' => 3000,
                               'width_mm' => 600, 'returns' => -2))
    assert_empty snap['moulding_boards']
    assert snap['scan_errors'].any? { |e| e.include?('برگشت منفی') }
  end

  def test_zero_returns_is_fine
    snap = scan(moulding_group('label_fa' => 'ک', 'length_mm' => 3000,
                               'width_mm' => 600, 'returns' => 0))
    assert_equal 1, snap['moulding_boards'].length, 'صفحهٔ بدون برگشت کاملاً معتبر است'
  end

  # ============================================================ RawGeometry
  # قابلیت پرچم‌دار ۳.۲۵.۰ («خواندن کابینت ساختهٔ خودم») — تا امروز بی‌تست.

  def solid(x0, y0, z0, x1, y1, z1, name = 'قطعه', pid = 1)
    Sketchup::Group.new(name: name, pid: pid,
                        bounds: Geom::BoundingBox.new(Geom::Point3d.new(x0, y0, z0),
                                                      Geom::Point3d.new(x1, y1, z1)))
  end

  def test_raw_geometry_reports_boxes_relative_to_the_cabinet_corner
    # دو قطعه که از مبدأ صحنه دورند — مختصات خروجی باید نسبت به گوشهٔ خود کابینت
    # باشد، وگرنه تشخیص «چسبیده به لبه» به جای کابینت در صحنه وابسته می‌شد.
    kids = [solid(10, 10, 10, 11, 30, 40, 'چپ', 1),
            solid(20, 10, 10, 21, 30, 40, 'راست', 2)]
    cab = Sketchup::Group.new(definition: Sketchup::ComponentDefinition.new(kids), name: 'کابینت')
    r = Kalaxa::RawGeometry.boxes_of(cab)

    assert_equal 2, r['child_count']
    first = r['boxes'].first
    assert_equal 0, first['x'], 'گوشهٔ کمینه باید مبدأ شود'
    assert_equal 0, first['y']
    assert_equal 0, first['z']
    second = r['boxes'].last
    assert_equal Kalaxa::RawGeometry.to_mm(10), second['x'], 'فاصلهٔ نسبی حفظ شود'
  end

  def test_raw_geometry_converts_inches_to_mm
    kids = [solid(0, 0, 0, 1, 2, 3)]
    cab = Sketchup::Group.new(definition: Sketchup::ComponentDefinition.new(kids))
    b = Kalaxa::RawGeometry.boxes_of(cab)['boxes'].first
    assert_equal 25.4, b['dx'], 'یک اینچ = ۲۵٫۴ میلی‌متر'
    assert_equal 50.8, b['dy']
    assert_equal 76.2, b['dz']
  end

  def test_raw_geometry_explains_itself_when_there_are_no_children
    cab = Sketchup::Group.new(definition: Sketchup::ComponentDefinition.new([]))
    r = Kalaxa::RawGeometry.boxes_of(cab)
    assert_empty r['boxes']
    assert_equal 0, r['child_count']
    refute_empty r['note'], 'باید بگوید چرا چیزی پیدا نشد، نه سکوت'
  end

  def test_raw_geometry_skips_hidden_children
    kids = [solid(0, 0, 0, 1, 1, 1, 'دیده', 1),
            Sketchup::Group.new(name: 'مخفی', pid: 2, hidden: true,
                                bounds: Geom::BoundingBox.new(Geom::Point3d.new(0, 0, 0),
                                                              Geom::Point3d.new(1, 1, 1)))]
    cab = Sketchup::Group.new(definition: Sketchup::ComponentDefinition.new(kids))
    assert_equal 1, Kalaxa::RawGeometry.boxes_of(cab)['child_count']
  end

  # ============================================================ SettingsService

  def test_settings_round_trip_through_the_model
    m = Sketchup::Model.new
    payload = JSON.generate('project' => { 'doors' => { 'shape' => 'framed_panel' } })
    assert Kalaxa::SettingsService.save(payload, m)
    assert_equal payload, Kalaxa::SettingsService.load(m)
  end

  def test_settings_save_uses_an_undo_operation
    m = Sketchup::Model.new
    Kalaxa::SettingsService.save(JSON.generate('a' => 1), m)
    refute_empty m.ops, 'نوشتن در مدل باید داخل عملیات undo باشد'
    assert_nil m.open_operation, 'عملیات باید بسته شده باشد'
  end

  def test_invalid_json_is_rejected_and_nothing_is_written
    m = Sketchup::Model.new
    refute Kalaxa::SettingsService.save('{ این JSON نیست', m)
    assert_nil Kalaxa::SettingsService.load(m), 'چیزی نباید نوشته شده باشد'
  end

  def test_oversized_settings_are_rejected
    m = Sketchup::Model.new
    huge = JSON.generate('x' => 'ا' * 200_000)
    refute Kalaxa::SettingsService.save(huge, m)
  end

  def test_corrupt_stored_settings_read_as_nil
    m = Sketchup::Model.new
    m.set_attribute('kalaxa_analysis', 'settings_json', '{ خراب')
    assert_nil Kalaxa::SettingsService.load(m), 'تنظیمات خراب نباید پنل را بشکند'
  end

  # ============================================================ OffcutStoreIO

  def test_offcut_store_round_trip
    payload = JSON.generate('store_version' => 1,
                            'offcuts' => [{ 'sheet_id' => 'mdf_white_16' }])
    assert Kalaxa::OffcutStoreIO.save(payload)
    assert_equal payload, Kalaxa::OffcutStoreIO.load
  ensure
    FileUtils.rm_f(Kalaxa::OffcutStoreIO.path)
  end

  def test_missing_offcut_file_yields_empty_store
    FileUtils.rm_f(Kalaxa::OffcutStoreIO.path)
    parsed = JSON.parse(Kalaxa::OffcutStoreIO.load)
    assert_empty parsed['offcuts']
  end

  def test_invalid_offcut_json_is_rejected
    refute Kalaxa::OffcutStoreIO.save('{ خراب')
  end

  def test_offcut_write_is_atomic_no_tmp_left_behind
    Kalaxa::OffcutStoreIO.save(JSON.generate('store_version' => 1, 'offcuts' => []))
    refute File.exist?(Kalaxa::OffcutStoreIO.path + '.tmp'),
           'فایل موقت نباید باقی بماند'
  ensure
    FileUtils.rm_f(Kalaxa::OffcutStoreIO.path)
  end

  # ============================================================ Adapter::Store

  def sample_doc
    Kalaxa::Domain::Document.blank(project_name: 'تست')
  end

  def test_document_save_and_load_round_trip
    m = Sketchup::Model.new
    doc = sample_doc
    assert Kalaxa::Adapter::Store.save_document(m, doc)
    state = Kalaxa::Adapter::Store.load_document(m)
    assert state['ok'], state.dig('error', 'message')
    assert_equal doc, state['doc']
  end

  def test_load_on_empty_model_is_nil_not_an_error
    assert_nil Kalaxa::Adapter::Store.load_document(Sketchup::Model.new),
               'مدل بدون سند یعنی nil، نه خطا — پنل باید فرقشان را بفهمد'
  end

  def test_save_is_wrapped_in_an_undo_operation
    m = Sketchup::Model.new
    Kalaxa::Adapter::Store.save_document(m, sample_doc)
    assert_equal 1, m.ops.length
    assert_nil m.open_operation
  end

  def test_failed_operation_aborts_instead_of_leaving_it_open
    m = Sketchup::Model.new
    assert_raises(RuntimeError) do
      Kalaxa::Adapter::Store.with_operation(m, 'عملیات آزمایشی') { raise 'شکست عمدی' }
    end
    assert_equal ['عملیات آزمایشی'], m.aborted, 'باید abort شود، نه باز بماند'
    assert_nil m.open_operation
  end

  def test_corrupt_stored_document_reports_instead_of_raising
    m = Sketchup::Model.new
    m.set_attribute(Kalaxa::Adapter::Store::DICT,
                    Kalaxa::Adapter::Store::KEY_DOC, '{ این پاکت نیست')
    state = Kalaxa::Adapter::Store.load_document(m)
    refute state['ok']
    refute_nil state.dig('error', 'message')
    assert_equal '{ این پاکت نیست', state['raw'], 'دادهٔ خام باید برای پشتیبان بماند'
  end

  def test_invalid_document_is_not_written_at_all
    m = Sketchup::Model.new
    assert_raises(Kalaxa::ValidationError) do
      Kalaxa::Adapter::Store.save_document(m, { 'not' => 'a document' })
    end
    assert_empty m.ops, 'اعتبارسنجی باید **پیش از** باز کردن عملیات undo انجام شود'
  end
end
