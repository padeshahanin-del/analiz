# encoding: utf-8
#
# KalaxaCabinet::ProjectScanner — v1.0.0
#
# مرز رسمی بین دنیای SketchUp و دنیای آنالیز.
# کل مدل را اسکن می‌کند، همه گروه‌های دارای dictionary «kalaxa_cabinet» را
# پیدا می‌کند، موقعیت و چرخش جهانی را از transformation استخراج می‌کند و
# kitchen_snapshot.json (schema_version: 1) تولید می‌کند.
#
# قواعد قطعی:
#   - همه ابعاد در snapshot به میلی‌متر (عدد صحیح) — تبدیل cm→mm فقط همین‌جا
#   - parts_flat جدا از ساختار تودرتوی cabinets
#   - count باز نمی‌شود (بازکردنش کار موتور nesting است)
#   - هیچ مصرف‌کننده‌ای مدل را مستقیم نمی‌خواند؛ فقط این JSON را می‌بیند
#
require 'json'
require 'securerandom'
require_relative 'catalog'
require_relative 'catalog'

module Kalaxa
  module ProjectScanner

    DICT_NAME      = 'kalaxa_cabinet'.freeze
    MOULDING_DICT_NAME = 'kalaxa_moulding_board'.freeze
    # هندسهٔ خام کابینتی که خود کاربر ساخته و با «خواندن کابینت انتخاب‌شده» وارد کرده.
    # نقش قطعات این‌جا تعیین نمی‌شود — پنل با kalaxa-part-classifier.js تشخیص می‌دهد.
    RAW_DICT_NAME  = 'kalaxa_raw_scan'.freeze
    # لوازم (سینک، اجاق، فر…) — خریدنی‌اند نه بریدنی، ولی باید در
    # اسنپ‌شات باشند وگرنه فهرست کالا و برگهٔ بریدگی خالی می‌مانند.
    OBJECT_DICT_NAME = 'kalaxa_object'.freeze
    # نسخهٔ قرارداد از data/snapshot.json می‌آید — همان عددی که kalaxa-schema.js
    # (مصرف‌کننده) می‌خواند. پیش از این هر کدام عدد خودشان را داشتند.
    def self.schema_version = Kalaxa::Catalog.snapshot_version
    SCHEMA_VERSION = Kalaxa::Catalog.snapshot_version
    PLUGIN_VERSION = '1.3.0'.freeze

    # ورق‌ها و پارامترهای برش از data/sheets.json می‌آیند — همان فایلی که
    # kalaxa-settings.js هم می‌خواند. پیش از این دو جا نوشته شده بودند و یک ورق
    # که فقط در یکی اضافه می‌شد، در دیگری قطعهٔ بی‌جا می‌ساخت (مورد glass_4).
    def self.const_missing(name)
      case name
      when :DEFAULT_SHEETS then Kalaxa::Catalog.sheets
      when :DEFAULT_CUTTING then Kalaxa::Catalog.cutting
      else super
      end
    end

    module_function

    # نقطه ورود اصلی. مدل فعال را اسکن و snapshot را به‌صورت Hash برمی‌گرداند.
    # خطاها را raise نمی‌کند؛ در کلید 'scan_errors' گزارش می‌دهد تا UI نمایش دهد.
    def build_snapshot(model = Sketchup.active_model)
      t_start        = Time.now
      cabinets       = []
      parts_flat     = []
      moulding_boards = []
      raw_cabinets   = []
      objects        = []
      scan_errors    = []
      scan_warnings  = []
      hidden_skipped = 0

      walk_entities(model.entities, Geom::Transformation.new) do |group, world_tr|
        next if group.deleted?
        if group.respond_to?(:hidden?) && group.hidden?
          hidden_skipped += 1 if group.attribute_dictionary(DICT_NAME)
          next
        end
        dict = group.attribute_dictionary(DICT_NAME)
        if dict
          begin
            cab = extract_cabinet(group, dict, world_tr)
            cabinets << cab
            parts_flat.concat(extract_parts(group, dict, cab['kalaxa_id'], scan_errors))
          rescue => e
            scan_errors << "خطا در خواندن کابینت «#{safe_name(group)}»: #{e.message}"
          end
          next
        end

        mdict = group.attribute_dictionary(MOULDING_DICT_NAME)
        if mdict
          begin
            board = extract_moulding_board(group, mdict, scan_errors)
            moulding_boards << board if board
          rescue => e
            scan_errors << "خطا در خواندن صفحه/قرنیز «#{safe_name(group)}»: #{e.message}"
          end
          next
        end

        odict = group.attribute_dictionary(OBJECT_DICT_NAME)
        if odict
          begin
            obj = extract_object(group, odict, world_tr)
            objects << obj if obj
          rescue => e
            scan_errors << "خطا در خواندن لوازم «#{safe_name(group)}»: #{e.message}"
          end
          next
        end

        rdict = group.attribute_dictionary(RAW_DICT_NAME)
        next unless rdict

        begin
          raw = extract_raw_cabinet(group, rdict, world_tr)
          raw_cabinets << raw if raw
        rescue => e
          scan_errors << "خطا در خواندن هندسهٔ خام «#{safe_name(group)}»: #{e.message}"
        end
      end

      scan_warnings << "#{hidden_skipped} کابینت مخفی از اسکن حذف شد" if hidden_skipped > 0
      settings = read_project_settings(model)

      snapshot = {
        'schema_version' => SCHEMA_VERSION,
        'snapshot_id'    => SecureRandom.uuid,
        'created_at'     => Time.now.strftime('%Y-%m-%dT%H:%M:%S%:z'),
        'source' => {
          'plugin_version'   => PLUGIN_VERSION,
          'sketchup_version' => Sketchup.version,
          'model_name'       => (model.path.empty? ? 'untitled.skp' : File.basename(model.path))
        },
        'project_settings_snapshot' => settings,
        'sheets'      => sheets_for(settings),
        'cutting'     => Kalaxa::Catalog.cutting.dup,
        'stock_offcuts' => [],
        'cabinets'      => cabinets,
        'parts_flat'    => parts_flat,
        'moulding_boards' => moulding_boards,
        'raw_cabinets'    => raw_cabinets,
        'objects'         => objects,
        'scan_errors'   => scan_errors,
        'scan_warnings' => scan_warnings,
        'scan_stats'    => {
          'duration_ms'    => ((Time.now - t_start) * 1000).round,
          'cabinets_found' => cabinets.length,
          'parts_rows'     => parts_flat.length,
          'moulding_boards_found' => moulding_boards.length,
          'raw_cabinets_found' => raw_cabinets.length,
          'objects_found' => objects.length,
          'hidden_skipped' => hidden_skipped
        }
      }
      snapshot
    end

    # snapshot را روی دیسک می‌نویسد و مسیر را برمی‌گرداند.
    # مسیر پیش‌فرض: کنار فایل مدل؛ اگر مدل ذخیره نشده، پوشه موقت سیستم
    # (هرگز داخل پوشه Plugins نمی‌نویسیم — read-only است)
    def export_snapshot(model = Sketchup.active_model, out_path = nil)
      snapshot = build_snapshot(model)
      out_path ||= default_export_path(model)
      File.write(out_path, JSON.pretty_generate(snapshot))
      out_path
    end

    def default_export_path(model)
      base = if model.path && !model.path.empty?
               File.dirname(model.path)
             else
               ENV['TMPDIR'] || ENV['TEMP'] || Dir.tmpdir
             end
      File.join(base, 'kitchen_snapshot.json')
    end

    # -------------------------------------------------------------- internal

    # پیمایش بازگشتی با انباشت transformation — تا کابینت‌های داخل گروه‌های
    # چیدمان (مثلاً گروه «دیوار شمالی») هم مختصات جهانی درست بگیرند.
    def walk_entities(entities, parent_tr, &block)
      entities.each do |e|
        next if e.respond_to?(:deleted?) && e.deleted?
        # نگهبان فقط بر پایهٔ نوع: ComponentInstance متد `entities` **ندارد** (تنها راهش
        # definition.entities است — همان تفکیکی که RawGeometry.child_solids می‌کند)، پس
        # شرط قبلیِ respond_to?(:entities) همهٔ کامپوننت‌ها را پیش از رسیدن به شاخهٔ
        # مخصوصشان دور می‌انداخت و کابینتِ ساخته‌شده به‌صورت Component بی‌صدا از اسکن
        # غایب می‌شد. Group زیرکلاسِ ComponentInstance است؛ ترتیب if/elsif زیر آن را
        # پیش از شاخهٔ عمومی می‌گیرد.
        next unless e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)
        if e.is_a?(Sketchup::Group)
          world_tr = parent_tr * e.transformation
          yield(e, world_tr)
          walk_entities(e.entities, world_tr, &block)
        elsif e.is_a?(Sketchup::ComponentInstance)
          world_tr = parent_tr * e.transformation
          # هر سه نوع dictionary باید روی کامپوننت هم دیده شود — وگرنه کابینتی که
          # کاربر به‌صورت Component ساخته و «خوانده» شده، در اسکن غایب می‌ماند.
          yield(e, world_tr) if e.attribute_dictionary(DICT_NAME) ||
                                e.attribute_dictionary(MOULDING_DICT_NAME) ||
                                e.attribute_dictionary(RAW_DICT_NAME) ||
                                e.attribute_dictionary(OBJECT_DICT_NAME)
          walk_entities(e.definition.entities, world_tr, &block)
        end
      end
    end

    def extract_cabinet(group, dict, world_tr)
      params = parse_json_attr(dict, 'params') || {}
      origin = world_tr.origin

      {
        'kalaxa_id'   => (dict['kalaxa_id'] || "pid-#{group.persistent_id}").to_s,
        'template_id' => dict['template_id'].to_s,
        'category'    => dict['category'].to_s,
        'label_fa'    => (dict['label_fa'] || safe_name(group)).to_s,
        'params'      => params,
        'world_transform' => {
          # مختصات جهانی به سانتی‌متر (params هم cm است)؛ mm فقط برای ابعاد برش
          'origin_cm' => [
            to_cm(origin.x), to_cm(origin.y), to_cm(origin.z)
          ],
          'rotation_z_deg' => rotation_z_deg(world_tr)
        }
      }
    end

    def extract_parts(group, dict, cabinet_id, scan_errors)
      raw = parse_json_attr(dict, 'parts')
      unless raw.is_a?(Array)
        scan_errors << "کابینت «#{safe_name(group)}» attribute «parts» ندارد یا نامعتبر است"
        return []
      end

      uid_counters = Hash.new(0)
      known_sheets = Kalaxa::Catalog.sheet_ids
      raw.filter_map do |p|
        fallback_uid = begin
          key = "#{cabinet_id}:#{p['key']}"
          uid_counters[key] += 1
          "#{key}:#{uid_counters[key]}"
        end
        row = {
          'part_uid'      => (p['part_uid'] || fallback_uid).to_s,
          'cabinet_id'    => cabinet_id,
          'key'           => p['key'].to_s,
          'name_fa'       => p['name_fa'].to_s,
          'count'         => p['count'].to_i.clamp(1, 999),
          # قطعات در attribute به cm ذخیره شده‌اند → تبدیل به mm صحیح
          'cut_length_mm' => cm_to_mm(p['cut_length_cm'] || p['cut_length_mm'], p.key?('cut_length_mm')),
          'cut_width_mm'  => cm_to_mm(p['cut_width_cm']  || p['cut_width_mm'],  p.key?('cut_width_mm')),
          'thickness_mm'  => p['thickness_mm'].to_i,
          'sheet_id'      => p['sheet_id'].to_s,
          'grain'         => normalize_grain(p['grain']),
          'allow_rotation'=> p.key?('allow_rotation') ? !!p['allow_rotation'] : true,
          'edge'          => p['edge'].is_a?(Hash) ? p['edge'] : {},
          'groove'        => p['groove'].is_a?(Hash) ? p['groove'] : {},
          'note'          => p['note'].to_s
        }

        # قرارداد snapshot روی خودِ تولیدکننده اجرا می‌شود، نه چند لایه بعد.
        # پیش از این قطعهٔ بدون sheet_id بی‌صدا با رشتهٔ تهی منتشر می‌شد؛ اعتبارسنج
        # پنل بعداً ردش می‌کرد با پیامی که نمی‌گفت کدام کابینت. حالا خطا در محل
        # وقوع گزارش می‌شود و قطعهٔ نامعتبر اصلاً وارد snapshot نمی‌شود.
        problem = part_problem(row, known_sheets)
        if problem
          scan_errors << "کابینت «#{safe_name(group)}» قطعهٔ «#{row['key']}»: #{problem}"
          next
        end
        row
      end
    end

    # @return [String, nil] شرح مشکل، یا nil اگر قطعه معتبر است.
    def part_problem(row, known_sheets)
      return 'ورق مشخص نشده' if row['sheet_id'].to_s.empty?
      return "ورق ناشناخته «#{row['sheet_id']}»" unless known_sheets.include?(row['sheet_id'])
      return "طول برش نامعتبر (#{row['cut_length_mm']})" unless row['cut_length_mm'].to_f.positive?
      return "عرض برش نامعتبر (#{row['cut_width_mm']})" unless row['cut_width_mm'].to_f.positive?
      return "تعداد نامعتبر (#{row['count']})" unless row['count'].to_i.positive?

      nil
    end

    # صفحه/قرنیز مستقلی که با ابزار «افزودن صفحه/قرنیز» ساخته شده — dict روی خودِ گروه
    # (نه JSON تودرتو مثل کابینت)، مقادیر مستقیماً به mm ذخیره شده‌اند.
    # @return [Hash, nil] nil یعنی نامعتبر — گزارش شده و منتشر نمی‌شود.
    #
    # چرا اعتبارسنجی این‌جا لازم است: kalaxa-moulding.js با `len > 0` خودش را حفظ
    # می‌کند، پس صفحهٔ صفر قیمتِ غلط نمی‌دهد — ولی **بی‌صدا از فاکتور می‌افتد**.
    # کاربر صفحه را در مدل می‌بیند و در شیت قیمت نمی‌بیند، بدون هیچ توضیحی.
    # همان قاعدهٔ قطعات: خطا در محل وقوع گزارش شود، نه چند لایه بعد سکوت.
    def extract_moulding_board(group, dict, scan_errors = [])
      board = {
        'id'        => (dict['board_id'] || "pid-#{group.persistent_id}").to_s,
        'label_fa'  => (dict['label_fa'] || safe_name(group)).to_s,
        'length_mm' => dict['length_mm'].to_f.round,
        'width_mm'  => dict['width_mm'].to_f.round,
        'returns'   => dict['returns'].to_i
      }

      problem = moulding_problem(board)
      if problem
        scan_errors << "صفحه/قرنیز «#{board['label_fa']}»: #{problem}"
        return nil
      end
      board
    end

    def moulding_problem(board)
      return "طول نامعتبر (#{board['length_mm']})" unless board['length_mm'].positive?
      return "عرض نامعتبر (#{board['width_mm']})" unless board['width_mm'].positive?
      # «برگشت» می‌تواند صفر باشد (صفحهٔ بدون برگشت)، ولی منفی معنا ندارد.
      return "تعداد برگشت منفی (#{board['returns']})" if board['returns'].negative?

      nil
    end

    # کابینتی که کاربر خودش ساخته و هندسه‌اش خوانده شده. فقط جعبه‌ها را برمی‌گرداند؛
    # نقش هر قطعه را پنل با kalaxa-part-classifier.js تعیین و کاربر تأیید می‌کند.
    # لوازم: هرچه ابزار گذاشتن نوشته، همان خوانده می‌شود.
    #
    # ابعاد و بریدگی از **همان لحظهٔ ساخت** می‌آید، نه از کاتالوگ جاری. اگر
    # کارگاه بعداً ابعاد کاتالوگ را عوض کند، سینکی که دیروز گذاشته شده باید
    # همان عددی را نگه دارد که با آن ساخته شد — وگرنه بریدگیِ صفحه‌ای که
    # قبلاً بریده شده، در گزارش عوض می‌شود.
    def extract_object(group, dict, world_tr)
      id = dict['object_id'].to_s
      return nil if id.empty?

      origin = world_tr.origin
      cut = parse_json_attr(dict, 'cutout_json')
      {
        'kalaxa_id' => "obj-#{group.persistent_id}",
        'object_id' => id,
        'label_fa'  => (dict['label_fa'] || safe_name(group)).to_s,
        'group'     => dict['group'].to_s,
        'unit'      => (dict['unit'] || 'عدد').to_s,
        'w_mm'      => dict['w_mm'].to_f,
        'd_mm'      => dict['d_mm'].to_f,
        'h_mm'      => dict['h_mm'].to_f,
        'mount'     => dict['mount'].to_s,
        'min_cabinet_w' => dict['min_cabinet_w'].to_f,
        'cutout'    => (cut.is_a?(Hash) ? cut : nil),
        'world_transform' => {
          'origin_cm' => [to_cm(origin.x), to_cm(origin.y), to_cm(origin.z)],
          'rotation_z_deg' => rotation_z_deg(world_tr)
        }
      }
    end

    def extract_raw_cabinet(group, dict, world_tr)
      boxes = parse_json_attr(dict, 'boxes_json')
      return nil unless boxes.is_a?(Array) && !boxes.empty?

      origin = world_tr.origin
      {
        'kalaxa_id' => "raw-#{group.persistent_id}",
        'label_fa'  => (dict['label_fa'] || safe_name(group)).to_s,
        'boxes'     => boxes,
        'world_transform' => {
          'origin_cm' => [to_cm(origin.x), to_cm(origin.y), to_cm(origin.z)],
          'rotation_z_deg' => rotation_z_deg(world_tr)
        }
      }
    end

    def normalize_grain(g)
      %w[length width none].include?(g.to_s) ? g.to_s : 'none'
    end

    def cm_to_mm(value, already_mm)
      v = value.to_f
      already_mm ? v.round : (v * 10).round
    end

    def to_cm(inches_length)
      (inches_length.to_f * 2.54).round(2)
    end

    # چرخش حول محور Z از بردار x محلی
    def rotation_z_deg(tr)
      x_axis = tr.xaxis
      (Math.atan2(x_axis.y, x_axis.x) * 180.0 / Math::PI).round(1)
    end

    def parse_json_attr(dict, key)
      raw = dict[key]
      return raw unless raw.is_a?(String)
      JSON.parse(raw)
    rescue JSON::ParserError
      nil
    end

    def read_project_settings(model)
      dict = model.attribute_dictionary('kalaxa_project')
      defaults = {
        'body_thickness_mm' => 16,
        'back_thickness_mm' => 8,
        'groove_depth_mm'   => 8,
        'edge_mode'         => 'no_deduct',
        'project_height_cm' => 260
      }
      return defaults unless dict
      defaults.each_key { |k| defaults[k] = dict[k] if dict[k] }
      defaults
    end

    def sheets_for(_settings)
      # نسخه ۱: پیش‌فرض‌ها؛ نسخه بعد از پنل تنظیمات پروژه خوانده می‌شود
      Kalaxa::Catalog.sheets.map(&:dup)
    end

    def safe_name(group)
      n = group.respond_to?(:name) ? group.name : ''
      n.to_s.empty? ? '(بدون نام)' : n
    end

  end
end
