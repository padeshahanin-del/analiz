# encoding: utf-8
# frozen_string_literal: true

# جای دستگیره روی لنگه — اجرا: ruby test/unit/test_handle_side.rb
#
# کاربر بعد از ساخت واقعی گزارش داد: «تو کابینت‌ها و کمدهای دو درب، جهت
# دستگیره پیش هم نیست».
#
# علت: `add_handle` دستگیره را **همیشه** لبهٔ راستِ لنگه می‌گذاشت. روی
# دولنگه یعنی لنگهٔ چپ دستگیره‌اش کنار درزِ وسط بود و لنگهٔ راست گوشهٔ دورِ
# کابینت — در حالی که در کابینت واقعی لولا بیرون است و دست از **وسط** باز
# می‌کند، پس هر دو دستگیره کنار درزند.
#
# این باگ در هیچ تستی دیده نمی‌شد چون هیچ تستی **جای** دستگیره را نمی‌سنجید،
# فقط وجودش را.
require 'minitest/autorun'
require 'tmpdir'

SRC = File.expand_path('../../kalaxa', __dir__) unless defined?(SRC)
$LOAD_PATH.unshift(File.expand_path('../stubs', __dir__))
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir('kx-handle')
ENV['KALAXA_QUIET'] = '1'

require 'su_double'
require File.join(SRC, 'lib', 'catalog')
require File.join(SRC, 'lib', 'glossary')
require File.join(SRC, 'lib', 'materials')
require File.join(SRC, 'lib', 'door_shapes')
require File.join(SRC, 'lib', 'unit_sections')
require File.join(SRC, 'lib', 'cabinet_builder')
require File.join(SRC, 'lib', 'cabinet_geometry')

class TestHandleSide < Minitest::Test
  G = Kalaxa::CabinetGeometry

  # نکتهٔ تست‌نویسی: `assert_operator` حداکثر **چهار** آرگومان می‌گیرد
  # (شیء، عملگر، مقدار، پیام). آرگومان پنجم — که در assertهای خودمان
  # «جزئیات» است — این‌جا ArgumentError می‌دهد و شبیه باگِ کد به‌نظر می‌رسد.
  def handles(template, w, h, d, opts = {})
    G.boxes_for(template, w, h, d, opts)
     .select { |b| b['key'] == 'handle' }
     .sort_by { |b| b['x'] }
  end

  # ---------- دولنگه: دستگیره‌ها کنار هم ----------

  def test_double_door_handles_meet_at_the_middle
    hs = handles('base_sink_double_door', 90, 72, 55)
    assert_equal 2, hs.length, 'دو لنگه، دو دستگیره'

    mid = 900 / 2.0
    left = hs[0]['x'] + hs[0]['dx'] / 2.0
    right = hs[1]['x'] + hs[1]['dx'] / 2.0

    assert_operator left, :<, mid, 'دستگیرهٔ چپ سمت چپِ درز است'
    assert_operator right, :>, mid, 'دستگیرهٔ راست سمت راستِ درز'
    # هر دو باید **نزدیک** درز باشند، نه یکی وسط و یکی گوشه.
    assert_operator mid - left, :<, 120, "دستگیرهٔ چپ باید نزدیک درز باشد (#{(mid - left).round})"
    assert_operator right - mid, :<, 120, "دستگیرهٔ راست باید نزدیک درز باشد (#{(right - mid).round})"
  end

  def test_double_door_handles_are_symmetric
    hs = handles('base_sink_double_door', 90, 72, 55)
    mid = 900 / 2.0
    left = hs[0]['x'] + hs[0]['dx'] / 2.0
    right = hs[1]['x'] + hs[1]['dx'] / 2.0
    assert_in_delta mid - left, right - mid, 1.0,
                    'فاصلهٔ دو دستگیره از درز باید برابر باشد'
  end

  def test_wardrobe_double_door_too
    # همان باگ روی کمد هم بود — کاربر هر دو را گزارش کرد.
    hs = handles('wardrobe', 150, 220, 60)
    assert_equal 2, hs.length
    mid = 1500 / 2.0
    left = hs[0]['x'] + hs[0]['dx'] / 2.0
    right = hs[1]['x'] + hs[1]['dx'] / 2.0
    assert_operator mid - left, :<, 120, 'کمد: دستگیرهٔ چپ نزدیک درز'
    assert_operator right - mid, :<, 120, 'کمد: دستگیرهٔ راست نزدیک درز'
  end

  # ---------- تک‌لنگه: از جهت لولا ----------

  # لولا یک طرف است و دست از طرف مقابل باز می‌کند. اگر دستگیره سمت لولا
  # باشد، درب عملاً باز نمی‌شود.
  def test_single_door_handle_is_opposite_the_hinge
    right_hinge = handles('base_single_door', 60, 72, 55, { door_swing: 'right' })
    left_hinge  = handles('base_single_door', 60, 72, 55, { door_swing: 'left' })

    assert_equal 1, right_hinge.length
    assert_operator right_hinge[0]['x'], :<, 300,
                    "لولای راست باید دستگیرهٔ چپ بدهد (x=#{right_hinge[0]['x'].round})"
    assert_operator left_hinge[0]['x'], :>, 300,
                    "لولای چپ باید دستگیرهٔ راست بدهد (x=#{left_hinge[0]['x'].round})"
  end

  # ---------- چیزهایی که نباید عوض شده باشند ----------

  def test_drawer_front_handle_stays_centered
    # نمای کشو دستگیرهٔ افقیِ وسط دارد؛ «طرف» برایش معنا ندارد.
    hs = handles('base_three_drawer', 80, 72, 55)
    refute_empty hs
    hs.each do |hh|
      centre = hh['x'] + hh['dx'] / 2.0
      assert_in_delta 800 / 2.0, centre, 2.0, 'دستگیرهٔ کشو وسط می‌ماند'
    end
  end

  def test_no_handle_when_kind_is_none
    assert_empty handles('base_sink_double_door', 90, 72, 55, { handle_kind: 'none' })
  end

  def test_handles_stay_inside_the_leaf
    # دستگیره‌ای که از لبهٔ لنگه بیرون بزند، در مدل روی بدنه می‌افتد.
    %w[base_sink_double_door tall_double_door wardrobe].each do |t|
      w = t == 'wardrobe' ? 150 : 90
      h = %w[tall_double_door wardrobe].include?(t) ? 220 : 72
      handles(t, w, h, 55).each do |hh|
        assert_operator hh['x'], :>=, 0, "#{t}: دستگیره بیرون از کابینت"
        assert_operator hh['x'] + hh['dx'], :<=, w * 10, "#{t}: دستگیره از لبه بیرون زده"
      end
    end
  end

  def test_tall_double_door_splits_by_height_not_width
    # کابینت قدی دو‌درب روی هم است، نه کنار هم — دستگیره‌هایش هم‌محورند.
    hs = handles('tall_double_door', 60, 220, 55)
    assert_equal 2, hs.length
    assert_in_delta hs[0]['x'], hs[1]['x'], 1.0,
                    'دو درب روی هم: دستگیره‌ها هم‌راستا'
  end
end
