# frozen_string_literal: true

# رینگ A — قرارداد پاکتِ push برای کلاینت sync.
# اجرا:  ruby test/unit/test_sync_envelope.rb
#
# چرا: kalaxa-sync-client چک‌سام را از سندِ **بارگذاری‌شده** حساب می‌کند و همان را
# به‌عنوان last_synced به یاد می‌سپرد. اگر پاکتی که push می‌شود از جای دیگری بیاید
# (مثلاً raw خام مدل)، روی سند میراثی این دو از هم واگرا می‌شوند: load مهاجرت می‌دهد
# اما raw دست‌نخورده می‌ماند. این تست همان تلهٔ‌ صریح را قفل می‌کند.
require 'minitest/autorun'
require 'json'
require 'tmpdir'

SRC  = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
FIX  = File.expand_path('../fixtures', __dir__) unless defined?(FIX)

ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-sync-test')
ENV['KALAXA_QUIET'] = '1'

require File.join(SRC, 'domain', 'entities')
require File.join(SRC, 'domain', 'document')
require File.join(SRC, 'persistence', 'canonical')
require File.join(SRC, 'persistence', 'validator')
require File.join(SRC, 'persistence', 'migrations')
require File.join(SRC, 'persistence', 'serializer')

class TestSyncEnvelope < Minitest::Test
  S = Kalaxa::Persistence::Serializer
  C = Kalaxa::Persistence::Canonical

  def legacy_raw = File.read(File.join(FIX, 'doc_v1_envelope.json'), encoding: 'UTF-8')
  def v2_raw = File.read(File.join(FIX, 'doc_v2_envelope.json'), encoding: 'UTF-8')

  def sync_meta(revision)
    { 'revision' => revision, 'updated_at' => '2026-08-04T00:00:00Z',
      'device_id' => 'sketchup-test' }
  end

  # --- تلهٔ اصلی: مهاجرت، doc و raw را از هم جدا می‌کند ---
  def test_legacy_load_migrates_doc_but_leaves_raw_behind
    state = S.safe_load(legacy_raw)
    assert state['ok'], 'فیکسچر v1 باید بارگذاری شود'
    assert state['meta']['migrated'], 'فیکسچر v1 باید مهاجرت کند — وگرنه این تست بی‌معناست'

    # v1 اصلاً چک‌سام ندارد → پاکتِ replay‌شده با checksum تهی به سرور می‌رفت
    assert_nil JSON.parse(state['raw'])['checksum'],
               'پاکت v1 چک‌سام ندارد — replay خامِ آن چیزی برای مقایسه به سرور نمی‌داد'
    refute_nil C.checksum(state['doc'])
  end

  # v1→v2 یک مهاجرت محتوایی واقعی است (thickness → thickness_mm، edgebanding،
  # unit_system)، پس doc بارگذاری‌شده با doc داخل raw یکی نیست — و چون v1 چک‌سام
  # هم ندارد، پاکتِ replay‌شده هیچ چیزی برای تطبیق به سرور نمی‌داد.
  def test_v1_migration_actually_changes_doc_body
    state = S.safe_load(legacy_raw)
    refute_equal JSON.parse(state['raw'])['doc'], state['doc'],
                 'مهاجرت v1→v2 بدنهٔ سند را تغییر می‌دهد؛ replay خام یعنی push کردن ' \
                 'سندی غیر از آنکه چک‌سامش را به یاد سپرده‌ایم'
  end

  # قید معکوس و به‌همان‌اندازه مهم: مهاجرت v2→v3 عمداً no-op است تا چک‌سام
  # پاکت‌های v2 موجود و goldenها پس از مهاجرت معتبر بمانند (migrations.rb).
  def test_v2_to_v3_migration_is_checksum_stable
    state = S.safe_load(v2_raw)
    assert state['meta']['migrated'], 'فیکسچر v2 باید به v3 مهاجرت کند'
    assert_equal JSON.parse(state['raw'])['checksum'], C.checksum(state['doc']),
                 'v2→v3 نباید بدنهٔ سند را لمس کند'
  end

  # --- قرارداد: پاکتِ dump شده همیشه با چک‌سام سندِ خودش می‌خواند ---
  def test_dump_checksum_matches_loaded_doc_after_migration
    doc = S.safe_load(legacy_raw)['doc']
    env = JSON.parse(S.dump(doc, sync: sync_meta(1)))

    assert_equal C.checksum(doc), env['checksum'],
                 'چک‌سام پاکت push باید با چک‌سام همان سندی که کلاینت به یاد می‌سپرد یکی باشد'
    assert_equal Kalaxa::Persistence::Migrations::CURRENT_VERSION, env['schema_version'],
                 'push باید نسخهٔ سرور را هم به schema جاری ارتقا دهد'
  end

  def test_dump_carries_sync_metadata_without_touching_doc_checksum
    doc = S.safe_load(legacy_raw)['doc']
    plain = JSON.parse(S.dump(doc))
    synced = JSON.parse(S.dump(doc, sync: sync_meta(7)))

    assert_equal plain['checksum'], synced['checksum'],
                 'متادیتای sync در سطح پاکت است و نباید چک‌سام سند را جابه‌جا کند (D-SYNC-1)'
    assert_equal 7, synced['revision']
    assert_equal 'sketchup-test', synced['device_id']
    assert_equal '2026-08-04T00:00:00Z', synced['updated_at']
  end

  # --- رفت‌وبرگشت: آنچه push می‌شود باید همان چیزی باشد که pull بازمی‌گرداند ---
  def test_pushed_envelope_round_trips
    doc = S.safe_load(legacy_raw)['doc']
    reloaded = S.safe_load(S.dump(doc, sync: sync_meta(2)))

    assert reloaded['ok'], "پاکت push‌شده باید دوباره بارگذاری شود: #{reloaded.dig('error', 'message')}"
    refute reloaded['meta']['migrated'], 'پاکت تازه نباید دوباره مهاجرت لازم داشته باشد'
    assert_equal doc, reloaded['doc']
    assert_equal({ 'revision' => 2, 'updated_at' => '2026-08-04T00:00:00Z',
                   'device_id' => 'sketchup-test' }, reloaded['meta']['sync'])
  end

  def test_dump_rejects_unknown_sync_keys
    doc = S.safe_load(legacy_raw)['doc']
    assert_raises(Kalaxa::ValidationError) { S.dump(doc, sync: { 'revison' => 1 }) }
  end
end
