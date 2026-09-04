# encoding: utf-8
# frozen_string_literal: true

# tools/regen_golden.rb — بازتولید fixture طلایی از قواعد جاری.
#
#   ruby tools/regen_golden.rb            # نمایش تفاوت‌ها، بدون نوشتن
#   ruby tools/regen_golden.rb --write    # نوشتن
#
# چرا لازم شد: fixture در دنیای پیش از «قید L» ساخته شده بود (schema v1، قید ۲×۱۰۰،
# لقی کشوی صفر). با تغییر قواعد، `rail_top` مجبور شد از مقایسه با fixture مستثنا
# شود — و استثنای دائمی اعتماد به golden را می‌خورد.
#
# همان ۵ کابینت و همان پارامترها نگه داشته می‌شوند؛ فقط قطعات از
# CabinetBuilder جاری تولید می‌شوند تا fixture دوباره «واقعیت امروز» باشد.

require 'json'
require 'fileutils'

ROOT = File.expand_path('..', __dir__)
$LOAD_PATH.unshift(File.join(ROOT, 'test', 'stubs'))
ENV['KALAXA_QUIET'] = '1'

require File.join(ROOT, 'kalaxa', 'lib', 'cabinet_builder')
require File.join(ROOT, 'kalaxa', 'lib', 'catalog')

FIXTURE = File.join(ROOT, 'kalaxa', 'dev', 'fixtures', 'golden_kitchen_snapshot.json')
old = JSON.parse(File.read(FIXTURE, encoding: 'UTF-8'))

# پارامترهای هر کابینت از fixture قدیمی می‌آیند — همان آشپزخانه، همان ابعاد.
# فقط قطعات دوباره تولید می‌شوند.
def opts_for(params)
  o = {}
  o[:shelf_count]  = params['shelf_count'].to_i  if params.key?('shelf_count')
  o[:drawer_count] = params['drawer_count'].to_i if params.key?('drawer_count')
  o[:door_type]    = params['door_type']         if params['door_type']
  o[:door_swing]   = params['door_swing']        if params['door_swing']
  o
end

new_parts = []
uid_counters = Hash.new(0)

old['cabinets'].each do |cab|
  p = cab['params']
  parts = Kalaxa::CabinetBuilder.build_parts(
    cab['template_id'], p['cabinet_width'], p['cabinet_height'], p['cabinet_depth'],
    opts_for(p)
  )
  parts.each do |part|
    key = "#{cab['kalaxa_id']}:#{part['key']}"
    uid_counters[key] += 1
    new_parts << part.merge(
      'part_uid'   => "#{key}:#{uid_counters[key]}",
      'cabinet_id' => cab['kalaxa_id']
    )
  end
end

fresh = old.merge(
  'schema_version' => Kalaxa::Catalog.snapshot_version,
  'sheets'         => Kalaxa::Catalog.sheets.map(&:dup),
  'cutting'        => Kalaxa::Catalog.cutting.dup,
  'stock_offcuts'  => old['stock_offcuts'] || [],
  'parts_flat'     => new_parts
)

# ---------------- گزارش تفاوت ----------------
def by_key(parts)
  parts.each_with_object(Hash.new(0)) { |p, h| h[p['key']] += p['count'] }
end

old_k = by_key(old['parts_flat'])
new_k = by_key(new_parts)

puts "schema_version : #{old['schema_version']} → #{fresh['schema_version']}"
puts "ردیف قطعات     : #{old['parts_flat'].length} → #{new_parts.length}"
puts "ورق‌ها          : #{(old['sheets'] || []).length} → #{fresh['sheets'].length}"
puts
puts 'تفاوت تعداد قطعات به تفکیک کلید:'
(old_k.keys | new_k.keys).sort.each do |k|
  next if old_k[k] == new_k[k]

  puts format('  %-16s %s → %s', k, old_k[k], new_k[k])
end

puts
puts 'ابعادی که عوض شده‌اند:'
old_dims = old['parts_flat'].group_by { |p| [p['cabinet_id'], p['key']] }
new_dims = new_parts.group_by { |p| [p['cabinet_id'], p['key']] }
(old_dims.keys & new_dims.keys).sort.each do |k|
  o = old_dims[k].map { |p| "#{p['cut_length_mm']}x#{p['cut_width_mm']}" }.sort
  n = new_dims[k].map { |p| "#{p['cut_length_mm']}x#{p['cut_width_mm']}" }.sort
  next if o == n

  puts format('  %-28s %s → %s', k.join('/'), o.join(','), n.join(','))
end

if ARGV.include?('--write')
  FileUtils.cp(FIXTURE, FIXTURE + '.bak')
  # حالت باینری لازم است: روی ویندوز نوشتن متنی «\n» را به «\r\n» ترجمه می‌کند و
  # کل فایل را از قرارداد مخزن (LF) خارج می‌کند.
  File.binwrite(FIXTURE, (JSON.pretty_generate(fresh) + "\n").encode('UTF-8'))
  puts "\nنوشته شد. نسخهٔ قبلی: #{File.basename(FIXTURE)}.bak"
else
  puts "\n(چیزی نوشته نشد — برای نوشتن --write بدهید)"
end
