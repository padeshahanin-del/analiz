# frozen_string_literal: true

# تست‌های schema v3 — placement اختیاری روی unit
# اجرا:  ruby test/unit/test_phase03.rb   (خارج از اسکچاپ)
require 'minitest/autorun'
require 'json'

SRC = File.expand_path('../../kalaxa', __dir__)
ENV['KALAXA_QUIET'] = '1'

require File.join(SRC, 'version')
require File.join(SRC, 'app', 'paths')
require File.join(SRC, 'app', 'logging')
require File.join(SRC, 'app', 'errors')
require File.join(SRC, 'domain', 'entities')
require File.join(SRC, 'domain', 'document')
require File.join(SRC, 'persistence', 'canonical')
require File.join(SRC, 'persistence', 'validator')
require File.join(SRC, 'persistence', 'migrations')
require File.join(SRC, 'persistence', 'serializer')

class TestPhase03Placement < Minitest::Test
  E = Kalaxa::Domain::Entities
  D = Kalaxa::Domain::Document
  P = Kalaxa::Persistence

  def doc_with_unit(placement: nil)
    doc = D.blank(project_name: 'v3')
    space = D.add(doc, 'spaces', E.space(name: 'آشپزخانه', width_mm: 3000, depth_mm: 600, height_mm: 2400))
    D.add(doc, 'units',
          E.unit(space_id: space['id'], name: 'زمینی ۶۰', kind: 'base',
                 width_mm: 600, depth_mm: 560, height_mm: 720, placement: placement))
    doc
  end

  # --- سازنده و اعتبارسنجی placement ---

  def test_placement_builder_defaults
    pl = E.placement(x_mm: 1200, y_mm: 0)
    assert_equal({ 'x_mm' => 1200, 'y_mm' => 0, 'z_mm' => 0, 'rotation_z_deg' => 0 }, pl)
    assert E.valid_placement?(pl)
  end

  def test_unit_without_placement_has_no_key
    doc = doc_with_unit
    refute doc['entities']['units'][0].key?('placement'), 'نبودِ کلید = جانمایی‌نشده'
    assert_empty P::Validator.validate(doc)
  end

  def test_valid_placement_passes_validator
    doc = doc_with_unit(placement: E.placement(x_mm: 1200, y_mm: 50, z_mm: 100, rotation_z_deg: 359))
    assert_empty P::Validator.validate(doc)
  end

  def test_invalid_placements_rejected
    [
      { 'x_mm' => 1, 'y_mm' => 2, 'z_mm' => 3, 'rotation_z_deg' => 360 },  # چرخش خارج بازه
      { 'x_mm' => 1.5, 'y_mm' => 2, 'z_mm' => 3, 'rotation_z_deg' => 0 },  # float ممنوع
      { 'x_mm' => 1, 'y_mm' => 2, 'rotation_z_deg' => 0 },                 # کلید کم
      { 'x_mm' => 1, 'y_mm' => 2, 'z_mm' => 3, 'rotation_z_deg' => 0, 'extra' => 1 }, # کلید اضافه
      'not-a-hash'
    ].each do |bad|
      doc = doc_with_unit
      doc['entities']['units'][0]['placement'] = bad
      findings = P::Validator.validate(doc)
      assert findings.any? { |f| f['code'] == 'KY_V_PLACEMENT' },
             "باید رد می‌شد: #{bad.inspect}"
    end
  end

  # --- مهاجرت v2 → v3 ---

  def test_current_version_is_3
    assert_equal 3, P::Migrations::CURRENT_VERSION
  end

  def test_v2_to_v3_migration_is_checksum_preserving_noop
    doc = doc_with_unit
    before = P::Canonical.checksum(doc)
    migrated = P::Migrations.migrate(doc, 2)
    assert_equal before, P::Canonical.checksum(migrated),
                 'no-op بودن مهاجرت روی بدنه — goldens نباید بشکنند'
  end

  def test_v1_chain_still_reaches_current
    doc = doc_with_unit
    doc['entities']['parts'] = []
    migrated = P::Migrations.migrate(doc, 1)
    assert_empty P::Validator.validate(migrated)
  end

  def test_newer_than_v3_rejected
    assert_raises(Kalaxa::SchemaVersionError) { P::Migrations.migrate({}, 4) }
  end

  # --- رفت‌وبرگشت serializer ---

  def test_dump_writes_v3_and_roundtrips_placement
    doc = doc_with_unit(placement: E.placement(x_mm: 1200, y_mm: 0, z_mm: 100, rotation_z_deg: 90))
    raw = P::Serializer.dump(doc)
    env = JSON.parse(raw)
    assert_equal 3, env['schema_version']
    loaded, meta = P::Serializer.load(raw)
    assert_equal false, meta['migrated']
    assert_equal doc['entities']['units'][0]['placement'],
                 loaded['entities']['units'][0]['placement']
  end

  def test_v2_envelope_loads_with_migration_flag
    doc = doc_with_unit
    env = { 'format' => 'kalaxa-doc', 'schema_version' => 2,
            'checksum' => P::Canonical.checksum(doc), 'doc' => doc }
    loaded, meta = P::Serializer.load(JSON.generate(env))
    assert meta['migrated']
    assert_equal 2, meta['from_version']
    assert_equal P::Canonical.checksum(doc), P::Canonical.checksum(loaded)
  end

  def test_invalid_placement_blocks_dump
    doc = doc_with_unit
    doc['entities']['units'][0]['placement'] = { 'x_mm' => 1 }
    assert_raises(Kalaxa::ValidationError) { P::Serializer.dump(doc) }
  end
end
