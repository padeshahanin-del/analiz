# frozen_string_literal: true

# تست‌های فاز ۰۴ — متادیتای sync در پاکت + مرز SyncPort
# اجرا:  ruby test/unit/test_phase04.rb   (خارج از اسکچاپ)
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
require File.join(SRC, 'adapter', 'sync_port')

class TestPhase04Sync < Minitest::Test
  E = Kalaxa::Domain::Entities
  D = Kalaxa::Domain::Document
  P = Kalaxa::Persistence

  def sample_doc
    doc = D.blank(project_name: 'sync')
    D.add(doc, 'spaces', E.space(name: 'فضا', width_mm: 3000, depth_mm: 600, height_mm: 2400))
    doc
  end

  SYNC = { 'revision' => 3, 'updated_at' => '2026-07-23T08:00:00Z',
           'device_id' => 'sketchup-test' }.freeze

  # --- dump با sync ---

  def test_dump_without_sync_unchanged
    env = JSON.parse(P::Serializer.dump(sample_doc))
    P::Serializer::SYNC_KEYS.each { |k| refute env.key?(k), "#{k} نباید بدون sync باشد" }
  end

  def test_dump_with_sync_adds_envelope_keys_only
    doc = sample_doc
    env = JSON.parse(P::Serializer.dump(doc, sync: SYNC.dup))
    assert_equal 3, env['revision']
    assert_equal 'sketchup-test', env['device_id']
    # D-SYNC-1: چک‌سام سند مستقل از sync است
    assert_equal P::Canonical.checksum(doc), env['checksum']
    refute env['doc'].key?('revision'), 'sync نباید وارد بدنهٔ سند شود'
  end

  def test_partial_sync_allowed
    env = JSON.parse(P::Serializer.dump(sample_doc, sync: { 'revision' => 1 }))
    assert_equal 1, env['revision']
    refute env.key?('device_id')
  end

  def test_invalid_sync_rejected
    [
      { 'revision' => 0 },
      { 'revision' => 'x' },
      { 'updated_at' => 123 },
      { 'device_id' => '' },
      { 'unknown_key' => 1 },
      'not-a-hash'
    ].each do |bad|
      assert_raises(Kalaxa::ValidationError, "باید رد می‌شد: #{bad.inspect}") do
        P::Serializer.dump(sample_doc, sync: bad)
      end
    end
  end

  # --- load: عبور sync به meta + سازگاری رو به جلو ---

  def test_load_surfaces_sync_in_meta
    raw = P::Serializer.dump(sample_doc, sync: SYNC.dup)
    _doc, meta = P::Serializer.load(raw)
    assert_equal SYNC, meta['sync']
  end

  def test_load_without_sync_has_no_sync_meta
    _doc, meta = P::Serializer.load(P::Serializer.dump(sample_doc))
    refute meta.key?('sync')
  end

  def test_unknown_envelope_keys_ignored_forward_compat
    doc = sample_doc
    env = JSON.parse(P::Serializer.dump(doc))
    env['server_only_field'] = { 'anything' => true } # کلید آیندهٔ سرور
    loaded, = P::Serializer.load(JSON.generate(env))
    assert_equal P::Canonical.checksum(doc), P::Canonical.checksum(loaded)
  end

  # --- مرز SyncPort ---

  def test_null_sync_port_conforms_and_reports_offline
    port = Kalaxa::Adapter::NullSyncPort.new
    assert Kalaxa::Adapter::SyncPort.conforming?(port)
    %i[status pull].each do |m|
      r = port.public_send(m, 'p1')
      assert_equal false, r['ok']
      assert_equal 'KY_SYNC_OFFLINE', r['error']['code']
    end
    r = port.push('p1', '{}')
    assert_equal 'KY_SYNC_OFFLINE', r['error']['code']
  end

  def test_nonconforming_impl_detected
    refute Kalaxa::Adapter::SyncPort.conforming?(Object.new)
  end
end
