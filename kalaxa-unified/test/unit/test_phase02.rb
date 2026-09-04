# frozen_string_literal: true

# رینگ A — مرحلهٔ ۰۲: مدل داده، ذخیره‌سازی، مهاجرت.
# اجرا:  ruby test/unit/test_phase02.rb
require 'minitest/autorun'
require 'json'
require 'tmpdir'

SRC = File.expand_path('../../kalaxa', __dir__)
FIX = File.expand_path('../fixtures', __dir__)
GOLD = File.expand_path('../golden', __dir__)

ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('ky-test')
ENV['KALAXA_QUIET'] = '1'

require File.join(SRC, 'domain', 'entities')
require File.join(SRC, 'domain', 'document')
require File.join(SRC, 'persistence', 'canonical')
require File.join(SRC, 'persistence', 'validator')
require File.join(SRC, 'persistence', 'migrations')
require File.join(SRC, 'persistence', 'serializer')

KY2 = Kalaxa
D   = KY2::Domain
P   = KY2::Persistence

def sample_doc
  doc = D::Document.blank(project_name: 'تست')
  space = D::Document.add(doc, 'spaces',
                          D::Entities.space(name: 'فضا', width_mm: 3000, depth_mm: 600, height_mm: 2600))
  mat = D::Document.add(doc, 'materials',
                        D::Entities.material(name: 'MDF', kind: 'sheet', thickness_mm: 16,
                                             sheet_width_mm: 1830, sheet_length_mm: 3660))
  unit = D::Document.add(doc, 'units',
                         D::Entities.unit(space_id: space['id'], name: 'زمینی', kind: 'base',
                                          width_mm: 600, depth_mm: 560, height_mm: 720))
  part = D::Document.add(doc, 'parts',
                         D::Entities.part(unit_id: unit['id'], material_id: mat['id'],
                                          name: 'بدنه', role: 'side',
                                          length_mm: 720, width_mm: 560, thickness_mm: 16))
  D::Document.add(doc, 'hardware',
                  D::Entities.hardware(unit_id: unit['id'], name: 'لولا', kind: 'hinge', qty: 2))
  D::Document.add(doc, 'operations',
                  D::Entities.operation(part_id: part['id'], kind: 'drill',
                                        params: { 'd_mm' => 35, 'x_mm' => 22 }))
  doc
end

class TestCanonical < Minitest::Test
  def test_key_order_independent
    a = { 'b' => 1, 'a' => [1, nil, 'ی'] }
    b = { 'a' => [1, nil, 'ی'], 'b' => 1 }
    assert_equal P::Canonical.checksum(a), P::Canonical.checksum(b)
  end

  def test_float_forbidden
    assert_raises(KY2::ValidationError) { P::Canonical.generate({ 'x' => 1.5 }) }
  end

  def test_matches_independent_python_reference
    doc = JSON.parse(File.read(File.join(GOLD, 'doc_v2_expected.json'), encoding: 'UTF-8'))
    expected = File.read(File.join(GOLD, 'doc_v2_checksum.txt')).strip
    assert_equal expected, P::Canonical.checksum(doc),
                 'چک‌سام Ruby با پیاده‌سازی مرجع مستقل (Python) یکی نیست'
  end
end

class TestValidator < Minitest::Test
  def test_valid_sample
    assert_empty P::Validator.validate(sample_doc)
  end

  def test_duplicate_ids_detected
    doc = sample_doc
    dup = doc['entities']['parts'].first
    doc['entities']['parts'] << JSON.parse(JSON.generate(dup))
    codes = P::Validator.validate(doc).map { |f| f['code'] }
    assert_includes codes, 'KY_V_ID_DUP'
  end

  def test_missing_reference_detected_after_entity_removal
    doc = sample_doc
    mat_id = doc['entities']['materials'].first['id']
    assert D::Document.remove(doc, mat_id)
    findings = P::Validator.validate(doc)
    assert(findings.any? { |f| f['code'] == 'KY_V_REF_MISSING' && f['message'].include?('material_id') })
  end

  def test_broken_structure_detected
    findings = P::Validator.validate({ 'project' => {} })
    assert(findings.any? { |f| f['code'] == 'KY_V_ENTITIES' })
  end
end

class TestSerializerRoundTrip < Minitest::Test
  def test_round_trip_semantically_identical
    doc = sample_doc
    raw = P::Serializer.dump(doc)
    loaded, meta = P::Serializer.load(raw)
    assert_equal false, meta['migrated']
    assert D::Document.semantically_equal?(doc, loaded), 'رفت‌وبرگشت داده را تغییر داد'
  end

  def test_dump_refuses_invalid_doc
    doc = sample_doc
    doc['entities']['parts'].first['material_id'] = 'missing-ref'
    assert_raises(KY2::ValidationError) { P::Serializer.dump(doc) }
  end

  def test_tampered_envelope_detected_by_checksum
    raw = File.read(File.join(FIX, 'doc_v2_tampered.json'), encoding: 'UTF-8')
    err = assert_raises(KY2::CorruptDataError) { P::Serializer.load(raw) }
    assert_equal 'KY_CORRUPT_DATA', err.code
  end

  def test_garbage_and_empty_are_controlled
    assert_raises(KY2::CorruptDataError) { P::Serializer.load('{{{') }
    assert_raises(KY2::CorruptDataError) { P::Serializer.load('') }
    res = P::Serializer.safe_load('{{{')
    refute res['ok']
    assert_equal '{{{', res['raw'], 'دادهٔ خام باید برای پشتیبان‌گیری حفظ شود'
  end
end

class TestMigrations < Minitest::Test
  def test_v1_envelope_migrates_to_golden_v2
    env = JSON.parse(File.read(File.join(FIX, 'doc_v1_envelope.json'), encoding: 'UTF-8'))
    doc, meta = P::Serializer.load(JSON.generate(env))
    assert meta['migrated']
    assert_equal 1, meta['from_version']
    golden = JSON.parse(File.read(File.join(GOLD, 'doc_v2_expected.json'), encoding: 'UTF-8'))
    assert D::Document.semantically_equal?(golden, doc),
           'خروجی مهاجرت v1→v2 با فایل طلایی یکی نیست'
  end

  def test_migration_does_not_mutate_input
    env = JSON.parse(File.read(File.join(FIX, 'doc_v1_envelope.json'), encoding: 'UTF-8'))
    before = JSON.generate(env['doc'])
    P::Migrations.migrate(env['doc'], 1)
    assert_equal before, JSON.generate(env['doc'])
  end

  def test_newer_schema_rejected_for_readonly
    err = assert_raises(KY2::SchemaVersionError) { P::Migrations.migrate({}, 99) }
    assert_match(/read-only/, err.message)
  end

  def test_invalid_version_rejected
    assert_raises(KY2::SchemaVersionError) { P::Migrations.migrate({}, nil) }
    assert_raises(KY2::SchemaVersionError) { P::Migrations.migrate({}, 0) }
  end
end

class TestSnapshotDomainLevel < Minitest::Test
  def test_deep_dup_is_independent
    doc = sample_doc
    snap = D::Document.deep_dup(doc)
    doc['entities']['parts'].first['length_mm'] = 1
    assert_equal 720, snap['entities']['parts'].first['length_mm']
    refute D::Document.semantically_equal?(doc, snap)
  end
end
