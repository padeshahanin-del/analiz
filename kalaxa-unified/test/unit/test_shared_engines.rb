# encoding: utf-8
# frozen_string_literal: true

# موتورهای مشترک با نمایشگر وردپرس — اجرا: ruby test/unit/test_shared_engines.rb
#
# چند ماژول جاوااسکریپت هم در افزونهٔ اسکچاپ اجرا می‌شوند و هم در نمایشگر
# وردپرس (`kalaxa-sync`). دو نسخه از یک فایل یعنی همان اشکالی که تاریخ این
# پروژه پر از آن است: **دو طرف جداگانه سبزند و هیچ‌کس واگرایی را نمی‌بیند.**
#
# وقتی این تست نوشته شد، سه ماژول واگرا بودند و هر سه **شمارهٔ نسخهٔ
# یکسان** داشتند با بیش از صد خط اختلاف — یعنی حتی شمارهٔ نسخه هم دروغ
# می‌گفت. نتیجه‌اش این بود که نمایشگر وردپرس دستگیره‌ای را به مشتری فاکتور
# می‌کرد که کاربر در افزونه «بدون دستگیره» انتخاب کرده بود.
#
# **این تست وقتی مخزن وردپرس نباشد رد می‌شود، نه اینکه بیفتد.** کسی که فقط
# افزونهٔ اسکچاپ را کلون کرده کاری با آن ندارد، و تستی که به پوشه‌ای بیرون
# مخزن وابسته باشد قابلیت حمل پروژه را از بین می‌برد.
require 'minitest/autorun'

class TestSharedEngines < Minitest::Test
  ROOT3 = File.expand_path('../..', __dir__)
  SRC3  = File.join(ROOT3, 'kalaxa', 'ui')
  DEST3 = ENV['KALAXA_SYNC_DIR'] ||
          File.expand_path(File.join(ROOT3, '..', 'kalaxa-sync', 'assets', 'engines'))

  def setup
    skip "مخزن وردپرس این‌جا نیست (#{DEST3}) — چیزی برای مقایسه نبود" unless
      File.directory?(DEST3)
  end

  def shared_names
    Dir[File.join(DEST3, '*.js')].map { |f| File.basename(f) }.sort
  end

  def test_the_wordpress_repo_ships_something_to_compare
    refute_empty shared_names, 'پوشهٔ موتورهای وردپرس خالی است'
  end

  def test_every_shared_engine_is_byte_identical
    diverged = shared_names.select do |name|
      src = File.join(SRC3, name)
      next false unless File.exist?(src)

      File.binread(src) != File.binread(File.join(DEST3, name))
    end

    assert_empty diverged,
                 "این موتورها بین افزونه و نمایشگر وردپرس واگرا شده‌اند: " \
                 "#{diverged.join(', ')}\n" \
                 'برای همگام‌سازی:  ruby tools/sync_engines.rb --apply'
  end

  def test_the_wordpress_repo_has_no_engine_the_plugin_lacks
    # موتوری که فقط آن‌طرف باشد یعنی یا مبدأ عوض شده (جهت باید یک‌طرفه
    # بماند) یا چیزی از افزونه حذف شده و آن‌طرف جا مانده.
    orphan = shared_names.reject { |n| File.exist?(File.join(SRC3, n)) }
    assert_empty orphan,
                 "این موتورها در نمایشگر وردپرس هستند ولی در افزونه نیستند: " \
                 "#{orphan.join(', ')} — منبع باید همیشه kalaxa-unified باشد"
  end

  def test_version_numbers_do_not_lie
    # اگر محتوا یکی است ولی شمارهٔ نسخه فرق دارد، یکی از دو فایل دست‌کاری
    # شده. اگر محتوا فرق دارد تست بالا می‌افتد؛ این‌جا حالت معکوس بررسی
    # می‌شود.
    mismatched = shared_names.select do |name|
      src = File.join(SRC3, name)
      next false unless File.exist?(src)

      a = File.binread(src)
      b = File.binread(File.join(DEST3, name))
      next false unless a == b

      a[/VERSION\s*=\s*'([^']*)'/, 1] != b[/VERSION\s*=\s*'([^']*)'/, 1]
    end
    assert_empty mismatched, "شمارهٔ نسخه با محتوا نمی‌خواند: #{mismatched.join(', ')}"
  end
end
