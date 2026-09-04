# encoding: utf-8
# frozen_string_literal: true

# ساختِ واقعیِ کابینت در صحنه — اجرا: ruby test/unit/test_model_build.rb
#
# چرا این فایل هست: `CreateCabinetTool#add_part_box` جایی است که کابینت
# **واقعاً** کشیده می‌شود، و تا امروز صفر پوشش تست داشت. بدل اسکچاپ اصلاً
# هندسه نداشت، پس هیچ تستی این کد را اجرا نمی‌کرد و هر تغییری فقط با باز
# کردن اسکچاپ دیده می‌شد.
#
# نتیجه‌اش را کاربر دید: پایه‌ها زیر زمین می‌رفتند و کسی نفهمید تا وقتی یک
# کابینت سه‌کشو ساخت.
#
# این تست هندسه را از سرِ دیگر می‌سنجد: نه «موتور چه عددی داد» (که
# test_cabinet_geometry می‌سنجد) بلکه «در صحنه چه چیزی و کجا ساخته شد».
require 'minitest/autorun'
$LOAD_PATH.unshift(File.expand_path('../stubs', __dir__))
ENV['KALAXA_QUIET'] = '1'
require 'tmpdir'
ENV['KALAXA_DATA_DIR'] ||= Dir.mktmpdir
require 'su_double'

ROOT4 = File.expand_path('../..', __dir__)
require File.join(ROOT4, 'kalaxa', 'main')

class TestModelBuild < Minitest::Test
  MM = 1.0 / 25.4   # همان MM_TO_INCH ابزار

  def build(template = 'base_three_drawer', w = 60, h = 72, d = 55, opts = {})
    model = Sketchup::Model.new(Sketchup::Entities.new)
    Sketchup.active_model = model
    group = Kalaxa::App::CreateCabinetTool::PlaceCabinetTool.build_at(
      model, Geom::Point3d.new(0, 0, 0), template, 'کابینت آزمایشی', w, h, d, opts
    )
    [model, group]
  end

  # همهٔ حجم‌های ساخته‌شده در تمام گروه‌های تودرتو، به میلی‌متر.
  def solids_of(group)
    out = []
    walk = lambda do |ents|
      ents.solids.each do |s|
        out << { lo: s[:lo].map { |v| v / MM }, hi: s[:hi].map { |v| v / MM } }
      end
      ents.each { |e| walk.call(e.entities) if e.is_a?(Sketchup::Group) }
    end
    walk.call(group.entities)
    out
  end

  # نام گروه یا «فارسی [key]» است یا فقط «key» (وقتی واژه‌نامه معادل ندارد).
  # پس تطبیق روی **کلید** بسته می‌شود، نه روی متن فارسی که ممکن است نباشد.
  def key_of(name)
    m = name.to_s[/\[([a-z_]+)\]\z/, 1]
    m || name.to_s
  end

  def named_solids(group)
    out = []
    walk = lambda do |ents|
      ents.each do |e|
        next unless e.is_a?(Sketchup::Group)

        e.entities.solids.each do |s|
          out << { name: e.name.to_s,
                   lo: s[:lo].map { |v| v / MM }, hi: s[:hi].map { |v| v / MM } }
        end
        walk.call(e.entities)
      end
    end
    walk.call(group.entities)
    out
  end

  # ---------- اصلِ ماجرا ----------

  def test_something_is_actually_drawn
    _model, g = build
    solids = solids_of(g)
    refute_empty solids, 'هیچ حجمی در صحنه ساخته نشد'
    assert_operator solids.length, :>=, 20,
                    "کابینت سه‌کشو باید ده‌ها قطعه بسازد، ساخت: #{solids.length}"
  end

  def test_nothing_is_drawn_below_the_floor
    # اینی که کاربر دید: کابینت روی نقطهٔ کلیک می‌نشیند، پس اگر چیزی z منفی
    # داشته باشد زیر زمین می‌رود. پایه‌ها تا ۳.۷۲ دقیقاً همین بودند.
    _model, g = build
    below = solids_of(g).select { |s| s[:lo][2] < -0.01 }
    assert_empty below.map { |s| s[:lo][2].round(1) },
                 'چیزی زیر کف کشیده شد — کابینت روی نقطهٔ کلیک می‌نشیند'
  end

  def test_the_cabinet_stands_on_its_legs
    _model, g = build
    legs = named_solids(g).select { |s| key_of(s[:name]) == 'leg' }
    refute_empty legs, 'پایه‌ای کشیده نشد'

    legs.each do |l|
      assert_in_delta 0, l[:lo][2], 0.5, 'پایه باید از کف شروع شود'
    end
    top_of_legs = legs.map { |l| l[:hi][2] }.max

    # پایین‌ترین قطعهٔ غیرپایه باید دقیقاً روی پایه بنشیند.
    others = named_solids(g).reject { |s| legs.include?(s) }
    lowest = others.map { |s| s[:lo][2] }.min
    assert_in_delta top_of_legs, lowest, 0.5,
                    'بدنه باید دقیقاً روی پایه بنشیند، نه شناور و نه فرورفته'
  end

  def test_wall_cabinet_starts_at_the_click_point
    # هوایی پایه ندارد؛ نباید مثل زمینی بالا برود.
    _model, g = build('wall_single_door', 60, 70, 32, shelf_count: 1)
    lowest = solids_of(g).map { |s| s[:lo][2] }.min
    assert_in_delta 0, lowest, 0.5, 'کابینت هوایی باید از خودِ نقطهٔ کلیک شروع شود'
  end

  def test_handles_stand_in_front_of_the_fronts
    _model, g = build
    named = named_solids(g)
    handles = named.select { |s| key_of(s[:name]) == 'handle' }
    refute_empty handles, 'دستگیره‌ای کشیده نشد'
    handles.each do |hb|
      assert_operator hb[:lo][1], :<, 0.01, 'دستگیره باید جلوی نما (y منفی) باشد'
    end
  end

  def test_every_solid_has_positive_volume
    _model, g = build
    solids_of(g).each do |s|
      3.times do |i|
        assert_operator s[:hi][i] - s[:lo][i], :>, 0.01,
                        "قطعه‌ای با بعد صفر یا منفی کشیده شد: #{s.inspect}"
      end
    end
  end

  def test_the_group_carries_its_dictionary
    # بدون این، اسکنر کابینت را نمی‌شناسد و کل خط تحلیل خالی می‌ماند.
    _model, g = build
    dict = g.attribute_dictionary('kalaxa_cabinet')
    refute_nil dict, 'گروه دیکشنری کالاکسا ندارد'
    assert_equal 'base_three_drawer', dict['template_id']
  end

  def test_the_click_path_and_build_at_are_one_path
    # `build_at` کامنت داشت که «عمداً همان مسیرِ ساختِ کلیک را می‌رود و مسیر
    # دومی نمی‌سازد» — ولی فقط **هندسه** مشترک بود. نوشتن دیکشنری و
    # نام‌گذاری در هر دو جا تکرار شده بود، یعنی هر میدان تازه‌ای در dict
    # باید دو بار اضافه می‌شد و کلیکِ کاربر می‌توانست بی‌صدا عقب بماند.
    #
    # این تست همان ادعا را قفل می‌کند: نوشتن دیکشنری فقط **یک جا** باشد.
    src = File.read(File.join(ROOT4, 'kalaxa', 'app', 'create_cabinet_tool.rb'),
                    encoding: 'UTF-8')
    writes = src.scan(/attribute_dictionary\('kalaxa_cabinet', true\)/).length
    assert_equal 1, writes,
                 'دیکشنری کابینت باید فقط در یک مسیر نوشته شود؛ '                  "الان #{writes} جا نوشته می‌شود"
    assert_includes src, 'self.class.build_at',
                    'مسیر کلیک باید خودِ build_at را صدا بزند، نه کپی‌اش'
  end

  def test_all_templates_build_without_raising
    # هر تمپلیت دست‌کم یک بار واقعاً ساخته شود. تا امروز فقط «لیست برشش
    # ساخته می‌شد»، نه خودِ هندسه در صحنه.
    Kalaxa::Catalog.template_defs.each do |id, t|
      pr = (t['presets'] || []).first
      next unless pr

      _model, g = build(id, pr['w'], pr['h'], pr['d'], (pr['opts'] || {}).transform_keys(&:to_sym))
      refute_empty solids_of(g), "#{id}: هیچ حجمی ساخته نشد"
    end
  end
end
