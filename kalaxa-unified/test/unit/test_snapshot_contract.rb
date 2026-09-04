# encoding: utf-8
# frozen_string_literal: true

# قرارداد snapshot: تولیدکننده باید از اعتبارسنجِ واقعی بگذرد.
# اجرا:  ruby test/unit/test_snapshot_contract.rb
#
# چرا این مهم‌ترین تست معماری است:
# هر میزبان تازه (مکس، رویت، …) فقط **یک** وظیفه دارد — مدل را بخواند و snapshot
# بسازد. هر چیز دیگری (لیست برش، نستینگ، BOM، قیمت، گزارش) از همین قرارداد تغذیه
# می‌شود. پس «درست بودنِ یک میزبان» دقیقاً یعنی «snapshotش از validateSnapshot
# می‌گذرد».
#
# تا این نسخه هیچ‌کس این را نمی‌سنجید: `validateSnapshot` فقط در پنل و روی
# snapshotهای دست‌ساز در تست‌های JS اجرا می‌شد — هرگز روی خروجی واقعی
# ProjectScanner. یعنی تولیدکننده و اعتبارسنج، دو طرفِ یک قرارداد، هرگز به هم
# نمی‌رسیدند — همان الگویی که این جلسه چند بار باگ داد.
require 'minitest/autorun'
require 'json'
require 'tmpdir'
require 'open3'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-contract')
ENV['KALAXA_QUIET'] = '1'

# --- بدل کمینهٔ اسکچاپ (همان سلسله‌مراتب واقعی: Group < ComponentInstance) ---
module Geom
  class Point3d
    attr_reader :x, :y, :z
    def initialize(x = 0, y = 0, z = 0) = (@x, @y, @z = x, y, z)
  end
  class Vector3d < Point3d; end
  class Transformation
    attr_reader :origin
    def initialize(dx = 0, dy = 0, dz = 0)
      @dx = dx; @dy = dy; @dz = dz
      @origin = Point3d.new(dx, dy, dz)
    end
    def xaxis = Vector3d.new(1, 0, 0)
    def *(other) = Transformation.new(@dx + other.dxx, @dy + other.dyy, @dz + other.dzz)
    protected

    def dxx = @dx
    def dyy = @dy
    def dzz = @dz
  end
end

module Sketchup
  def self.version = '24.0.0'

  class ComponentDefinition
    attr_reader :entities, :name
    def initialize(entities = [], name = 'def') = (@entities, @name = entities, name)
  end

  class ComponentInstance
    attr_reader :definition, :transformation, :persistent_id
    attr_accessor :name
    def initialize(definition:, transformation: Geom::Transformation.new,
                   name: '', dicts: {}, pid: object_id)
      @definition = definition
      @transformation = transformation
      @name = name
      @dicts = dicts
      @persistent_id = pid
    end
    def deleted? = false
    def hidden? = false
    def attribute_dictionary(key, create = false) = (@dicts[key] ||= (create ? {} : nil))
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

require File.join(SRC, 'lib', 'cabinet_builder')
require File.join(SRC, 'lib', 'project_scanner')
require File.join(SRC, 'lib', 'catalog')

class TestSnapshotContract < Minitest::Test
  UI_DIR = File.join(SRC, 'ui')

  # یک کابینت واقعی: dictionary از CabinetBuilder ساخته می‌شود، نه دست‌ساز.
  def cabinet_group(template = 'base_single_door', opts = {}, pid = 1)
    # کابینت گوشه با عمق ۵۵ دست‌کم بال ۸۴ می‌خواهد.
    w = template == 'base_corner_diagonal' ? 90 : 80
    dict = Kalaxa::CabinetBuilder.build_dict(template, 'کابینت تست', w, 72, 55, opts)
    Sketchup::Group.new(definition: Sketchup::ComponentDefinition.new([]),
                        name: 'کابینت تست',
                        dicts: { 'kalaxa_cabinet' => dict }, pid: pid)
  end

  def scan(*groups)
    Kalaxa::ProjectScanner.build_snapshot(Sketchup::Model.new(groups))
  end

  # snapshot را به node می‌دهیم تا با **همان** اعتبارسنجی که پنل استفاده می‌کند
  # سنجیده شود — نه یک بازپیاده‌سازی روبی که می‌تواند واگرا شود.
  def validate_with_engine(snapshot)
    Dir.mktmpdir('kx-snap') do |dir|
      snap_path = File.join(dir, 'snapshot.json')
      File.write(snap_path, JSON.generate(snapshot), encoding: 'UTF-8')
      script = File.join(dir, 'run.js')
      File.write(script, <<~JS, encoding: 'UTF-8')
        const path = require('path');
        const fs = require('fs');
        const Schema = require(path.join(#{UI_DIR.inspect}, 'kalaxa-schema.js'));
        const snap = JSON.parse(fs.readFileSync(#{snap_path.inspect}, 'utf8'));
        const r = Schema.validateSnapshot(snap);
        process.stdout.write(JSON.stringify({
          ok: r.ok, errors: r.errors, warnings: r.warnings,
          current: Schema.CURRENT_SCHEMA, supported: Schema.SUPPORTED
        }));
      JS
      out, err, status = Open3.capture3('node', script)
      raise "node شکست خورد: #{err}" unless status.success?

      JSON.parse(out)
    end
  end

  # ---------- قرارداد اصلی ----------

  def test_real_producer_output_passes_the_real_validator
    snap = scan(cabinet_group)
    r = validate_with_engine(snap)
    assert r['ok'],
           "خروجی ProjectScanner از اعتبارسنج نگذشت — یعنی قراردادی که هر میزبان " \
           "تازه باید برآورده کند، خودِ میزبان فعلی برآورده نمی‌کند:\n" +
           Array(r['errors']).join("\n")
  end

  def test_every_template_and_door_shape_produces_a_valid_snapshot
    Kalaxa::CabinetBuilder::TEMPLATES.each do |t|
      Kalaxa::DoorShapes::IDS.each do |shape|
        snap = scan(cabinet_group(t, { door_shape: shape }))
        r = validate_with_engine(snap)
        assert r['ok'], "#{t}/#{shape}: #{Array(r['errors']).join(' ؛ ')}"
      end
    end
  end

  def test_producer_and_validator_agree_on_the_version
    snap = scan(cabinet_group)
    r = validate_with_engine(snap)
    assert_equal Kalaxa::Catalog.snapshot_version, r['current'],
                 'تولیدکننده و مصرف‌کننده باید یک نسخه ببینند'
    assert_equal Kalaxa::Catalog.snapshot_version, snap['schema_version']
    assert_includes r['supported'], snap['schema_version']
  end

  def test_required_top_level_keys_are_present
    snap = scan(cabinet_group)
    Kalaxa::Catalog.snapshot_required_top_level.each do |k|
      assert snap.key?(k), "کلید اجباری «#{k}» در snapshot نیست"
    end
  end

  def test_required_part_fields_are_present
    snap = scan(cabinet_group)
    refute_empty snap['parts_flat']
    snap['parts_flat'].each do |p|
      Kalaxa::Catalog.snapshot_required_part_fields.each do |f|
        assert p.key?(f), "قطعه فیلد اجباری «#{f}» ندارد"
      end
    end
  end

  # ---------- تولیدکننده باید خطا را در محل وقوع گزارش کند ----------

  def broken_cabinet(part_override, pid = 9)
    part = { 'key' => 'side', 'name_fa' => 'دیواره', 'count' => 2,
             'cut_length_mm' => 720, 'cut_width_mm' => 550, 'thickness_mm' => 16,
             'sheet_id' => 'mdf_white_16' }.merge(part_override)
    dict = { 'kalaxa_id' => 'cab-x', 'template_id' => 'base_single_door',
             'category' => 'base', 'label_fa' => 'کابینت خراب',
             'params' => JSON.generate({ 'cabinet_width' => 80 }),
             'parts' => JSON.generate([part]) }
    Sketchup::Group.new(definition: Sketchup::ComponentDefinition.new([]),
                        name: 'کابینت خراب',
                        dicts: { 'kalaxa_cabinet' => dict }, pid: pid)
  end

  def test_part_without_sheet_is_reported_not_emitted
    snap = scan(broken_cabinet('sheet_id' => ''))
    assert_empty snap['parts_flat'], 'قطعهٔ بی‌ورق نباید وارد snapshot شود'
    assert snap['scan_errors'].any? { |e| e.include?('ورق مشخص نشده') },
           "خطا باید در محل وقوع گزارش شود: #{snap['scan_errors'].inspect}"
  end

  def test_part_with_unknown_sheet_is_reported
    snap = scan(broken_cabinet('sheet_id' => 'یک‌ورق‌ناموجود'))
    assert_empty snap['parts_flat']
    assert snap['scan_errors'].any? { |e| e.include?('ورق ناشناخته') }
  end

  def test_part_with_zero_dimension_is_reported
    snap = scan(broken_cabinet('cut_length_mm' => 0, 'cut_length_cm' => nil))
    assert_empty snap['parts_flat']
    assert snap['scan_errors'].any? { |e| e.include?('طول برش نامعتبر') }
  end

  # مهم‌ترین نتیجه: حتی سند خراب هم snapshotی می‌سازد که از اعتبارسنج می‌گذرد،
  # چون قطعهٔ بد گزارش شده و منتشر نشده. یعنی خطا هرگز چند لایه بعد ظاهر نمی‌شود.
  def test_broken_input_still_yields_a_valid_snapshot
    snap = scan(broken_cabinet('sheet_id' => ''))
    r = validate_with_engine(snap)
    assert r['ok'],
           "snapshot باید حتی با ورودی خراب معتبر بماند: #{Array(r['errors']).join(' ؛ ')}"
    refute_empty snap['scan_errors'], 'ولی باید صریح گزارش کند چه چیزی کنار گذاشته شد'
  end

  def test_empty_model_is_still_a_valid_snapshot
    snap = scan
    r = validate_with_engine(snap)
    assert r['ok'], "مدل خالی هم باید snapshot معتبر بدهد: #{Array(r['errors']).join(' ؛ ')}"
  end
end
