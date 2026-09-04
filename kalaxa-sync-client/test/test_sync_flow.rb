# frozen_string_literal: true

# تست منطق تصمیم sync — اجرا: ruby test/test_sync_flow.rb (بدون اسکچاپ/شبکه)
require 'minitest/autorun'
require_relative '../kalaxa_sync_client/sync_flow'

class TestSyncFlow < Minitest::Test
  F = Kalaxa::SyncClient::SyncFlow

  # ---------- decide_push ----------

  def test_first_push_on_empty_server
    d = F.decide_push(nil, 'ck-local', nil)
    assert_equal :first_push, d[:action]
    assert_equal 1, d[:push_revision]
  end

  def test_first_push_respects_prior_local_counter
    d = F.decide_push(nil, 'ck', 7)
    assert_equal :first_push, d[:action]
    assert_equal 8, d[:push_revision], 'سرور پاک شده ولی شمارندهٔ محلی نباید عقب برود'
  end

  def test_idempotent_when_server_has_same_content
    d = F.decide_push({ 'revision' => 5, 'checksum' => 'same' }, 'same', 3)
    assert_equal :idempotent, d[:action]
    assert_equal 5, d[:push_revision]
  end

  def test_fast_forward_when_built_on_latest
    d = F.decide_push({ 'revision' => 5, 'checksum' => 'other' }, 'mine', 5)
    assert_equal :fast_forward, d[:action]
    assert_equal 6, d[:push_revision]
  end

  def test_diverged_when_server_moved_past_us
    d = F.decide_push({ 'revision' => 7, 'checksum' => 'other' }, 'mine', 5)
    assert_equal :diverged, d[:action]
    assert_equal 8, d[:push_revision], 'در صورت انتخاب کاربر، از سرور جلو می‌زنیم'
  end

  def test_diverged_when_never_synced_but_server_has_data
    d = F.decide_push({ 'revision' => 2, 'checksum' => 'other' }, 'mine', nil)
    assert_equal :diverged, d[:action]
    assert_equal 3, d[:push_revision]
  end

  # ---------- decide_pull (رفع #11: :safe حالا با اثبات چک‌سام واقعاً قابل‌دسترس است) ----------

  def test_pull_fresh_model
    assert_equal :fresh, F.decide_pull(nil, nil, 'r-ck')[:action]
  end

  def test_pull_same_content_is_noop
    assert_equal :same, F.decide_pull('x', 'x', 'x')[:action]
  end

  def test_pull_safe_when_local_unchanged_since_last_sync
    # محلی همان چک‌سامی را دارد که آخرین بار sync شد؛ سرور چیز دیگری دارد (نسخهٔ جدیدتر) →
    # اثبات قطعی: هیچ تغییر محلیِ در-خطری نیست، پس بی‌پرسش می‌توان نوشت.
    d = F.decide_pull('same-as-last-sync', 'same-as-last-sync', 'remote-newer')
    assert_equal :safe, d[:action]
  end

  def test_pull_overwrite_when_local_changed_since_last_sync
    # محلی از last_synced_checksum فرق دارد → تغییر محلیِ ثبت‌نشده داریم.
    d = F.decide_pull('local-edited', 'last-synced-value', 'remote-value')
    assert_equal :overwrite, d[:action]
  end

  def test_pull_overwrite_when_never_synced_before
    # last_synced_checksum=nil → هیچ اثباتی نداریم؛ محافظه‌کارانه بپرس.
    d = F.decide_pull('local', nil, 'remote')
    assert_equal :overwrite, d[:action]
  end
end
