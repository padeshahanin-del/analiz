# encoding: utf-8
# frozen_string_literal: true

# درب فرزخورده در مدل — اجرا: ruby test/unit/test_routed_door.rb
#
# کاربر: «مدل درب‌ها هم فکر کنم فراموش شد». حق داشت، ولی فقط دربارهٔ یک شکل:
# `routed`. در کاتالوگ `operation: rout` داشت و لیست برش «فرزکاری طرح» می‌نوشت،
# ولی در مدل **دقیقاً** مثل درب تخت درمی‌آمد — یعنی کاربر عددی را انتخاب می‌کرد
# که هیچ اثری در صحنه نداشت.
#
# قید سختِ این تست: درب فرزخورده باید **یک قطعه** بماند. اگر برای نمایش فرز به
# چند گروه تقسیم می‌شد، اسکن دوباره پنج قطعه می‌دید و لیست برش یکی — همان
# واگراییِ نویسنده/خواننده که بارها گرفتارش شدیم.
require 'minitest/autorun'
require 'tmpdir'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
$LOAD_PATH.unshift(File.expand_path('../stubs', __dir__))
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-rout')
ENV['KALAXA_QUIET'] = '1'

require 'su_double'
require File.join(SRC, 'lib', 'catalog')
require File.join(SRC, 'lib', 'materials')
require File.join(SRC, 'lib', 'door_shapes')
require File.join(SRC, 'lib', 'cabinet_geometry')

class TestRoutedDoor < Minitest::Test
  G = Kalaxa::CabinetGeometry

  def doors(shape, w = 80, h = 72, opts = {})
    G.boxes_for('base_single_door', w, h, 55, { door_shape: shape }.merge(opts))
     .select { |b| b['key'].to_s.start_with?('door') }
  end

  # ---------- یک قطعه می‌ماند ----------

  def test_routed_door_is_still_one_piece
    assert_equal 1, doors('routed').length,
                 'فرز نباید درب را به چند گروه بشکند — از نظر برش یک تخته است'
  end

  def test_routed_door_has_same_outer_size_as_flat
    flat = doors('flat').first
    rout = doors('routed').first
    %w[x z dx dz].each do |k|
      assert_in_delta flat[k], rout[k], 0.01, "بعد #{k} نباید با فرز عوض شود"
    end
  end

  # ---------- ولی دیگر با تخت یکی نیست ----------

  def test_flat_door_carries_no_rout
    assert_nil doors('flat').first['rout'], 'درب تخت فرز ندارد'
  end

  def test_routed_door_carries_rout_data
    r = doors('routed').first['rout']
    refute_nil r, 'همین نبودنش بود که کاربر گزارش کرد'
    assert_operator r['inset_mm'], :>, 0
    assert_operator r['depth_mm'], :>, 0
  end

  # ---------- عمق هرگز درب را سوراخ نمی‌کند ----------

  def test_rout_depth_never_exceeds_thickness
    Kalaxa::DoorShapes.thicknesses_mm('routed').each do |t|
      r = doors('routed', 80, 72, door_thickness_mm: t).first['rout']
      next unless r
      assert_operator r['depth_mm'], :<, t,
                      "عمق #{r['depth_mm']} روی ضخامت #{t} یعنی درب سوراخ می‌شود"
    end
  end

  def test_absurd_depth_from_settings_is_clamped
    r = doors('routed', 80, 72, door_groove_depth_mm: 500).first['rout']
    assert_operator r['depth_mm'], :<, 18, 'عدد بی‌معنای تنظیمات نباید درب را سوراخ کند'
  end

  # ---------- روی درب کوچک فرز نمی‌زند ----------

  def test_tiny_door_gets_no_rout
    assert_nil doors('routed', 12, 12).first['rout'],
               'وقتی وسط درب چیزی باقی نمی‌ماند، سکوت بهتر از فرورفتگی بی‌معناست'
  end

  # ---------- از تنظیمات می‌خواند، نه از کد ----------

  def test_inset_comes_from_settings
    wide = doors('routed', 80, 72, door_frame_width_mm: 120).first['rout']
    assert_in_delta 120, wide['inset_mm'], 0.01,
                    'حاشیهٔ فرز باید از تنظیمات بیاید — هر کارگاه تیغهٔ خودش را دارد'
  end

  def test_depth_comes_from_settings
    deep = doors('routed', 80, 72, door_groove_depth_mm: 4).first['rout']
    assert_in_delta 4, deep['depth_mm'], 0.01
  end

  # ---------- بقیهٔ شکل‌ها دست نخورده ----------

  def test_framed_door_unchanged
    parts = doors('framed_panel')
    assert_operator parts.length, :>, 1, 'درب کلاف‌وتنپوش واقعاً چندقطعه است'
    assert(parts.none? { |b| b['rout'] }, 'کلاف‌وتنپوش فرز طرح ندارد — خودش کلاف دارد')
  end

  def test_glass_door_unchanged
    assert_nil doors('glass_full').first['rout']
  end
end
