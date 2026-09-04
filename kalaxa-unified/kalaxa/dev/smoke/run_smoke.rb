# frozen_string_literal: true
# Boot smoke test for kalaxa-unified + kalaxa-sync-client, run with a real Ruby
# interpreter but WITHOUT SketchUp installed (uses sketchup.rb stub next to this file).
# This catches boot-time bugs that static review and unit tests miss - e.g. bug #12
# (Kalaxa::UI shadowing ::UI) only showed up when the real require/boot chain ran.
#
# Usage: ruby run_smoke.rb <kalaxa-unified_root> <kalaxa-sync-client_root>
#   ruby dev/smoke/run_smoke.rb .. ../../kalaxa-sync-client   (from kalaxa-unified/kalaxa/)
#
# Kept deliberately light on exact counts (menu item counts, version numbers) since
# the plugin evolves fast - assertions here check structure/behavior, not exact shape.

$LOAD_PATH.unshift(__dir__) # so require 'sketchup.rb' resolves to our stub

require 'json'
require 'tmpdir'

UNIFIED = ARGV[0] or abort 'need unified root'
CLIENT  = ARGV[1] or abort 'need client root'

ENV['KALAXA_DATA_DIR'] = Dir.mktmpdir('ky-smoke')
ENV['KALAXA_QUIET'] = '1'

$passed = 0
$failed = 0
def assert(cond, name, detail = nil)
  if cond then $passed += 1; puts "  ok #{name}"
  else $failed += 1; puts "  FAIL #{name}#{detail ? " -- #{detail}" : ''}"
  end
end

puts '[1] boot kalaxa-unified (main.rb like SketchUp does)'
require File.join(UNIFIED, 'kalaxa', 'main')
ext_menu = UI.menus['Extensions']
assert !ext_menu.nil?, 'Extensions menu created'
kalaxa_sub = ext_menu.items.find { |i| i[:type] == :submenu && i[:label].include?('Kalaxa |') }
assert !kalaxa_sub.nil?, 'Kalaxa submenu registered'
if kalaxa_sub
  items = kalaxa_sub[:menu].items.select { |i| i[:type] == :item }
  assert items.length > 0, 'submenu has at least one item', items.length.to_s
  assert items.any? { |i| i[:label].include?('آنالیز') }, 'analysis item present'
end
assert Kalaxa::VERSION =~ /\A\d+\.\d+\.\d+\z/, "VERSION is valid semver (got #{Kalaxa::VERSION})"

puts '[2] every menu item block runs without raising (smoke-clicks the whole menu)'
if kalaxa_sub
  kalaxa_sub[:menu].items.each do |i|
    next unless i[:type] == :item && i[:block]
    begin
      i[:block].call
      assert true, "click '#{i[:label]}' does not raise"
    rescue StandardError => e
      assert false, "click '#{i[:label]}' does not raise", "#{e.class}: #{e.message}"
    end
  end
end

puts '[3] core end-to-end: Serializer.safe_load on golden + tampered fixtures'
good_path = File.join(UNIFIED, 'test', 'fixtures', 'doc_v2_envelope.json')
bad_path  = File.join(UNIFIED, 'test', 'fixtures', 'doc_v2_tampered.json')
if File.exist?(good_path) && File.exist?(bad_path)
  good = File.read(good_path)
  bad  = File.read(bad_path)
  r_good = Kalaxa::Persistence::Serializer.safe_load(good)
  r_bad  = Kalaxa::Persistence::Serializer.safe_load(bad)
  assert r_good['ok'] == true, 'golden envelope accepted', (r_good['error'] || {}).inspect
  assert r_bad['ok'] == false, 'tampered envelope rejected'
else
  puts '  (skipped - fixtures not found at expected path)'
end

puts '[4] boot kalaxa-sync-client on top of core (its main.rb)'
require File.join(CLIENT, 'kalaxa_sync_client', 'main')
assert Kalaxa::SyncClient.core_loaded? ? true : false, 'client sees unified core'
sync_sub = ext_menu.items.find { |i| i[:type] == :submenu && i[:label] == 'Kalaxa Sync' }
assert !sync_sub.nil?, 'Kalaxa Sync submenu registered'
if sync_sub
  slabels = sync_sub[:menu].items.select { |i| i[:type] == :item }.map { |i| i[:label] }
  assert slabels.length > 0, 'sync submenu has items'
  assert slabels.none? { |l| l.include?('یافت نشد') }, 'no missing-core fallback item (core really loaded)'
end

puts '[5] guarded() really swallows unexpected errors into a Persian messagebox'
C = Kalaxa::SyncClient::Client
UI.messageboxes.clear
C.guarded('آزمایش') { raise NoMethodError, "undefined method 'round' for nil" }
assert UI.messageboxes.length == 1, 'messagebox shown instead of crash'
assert UI.messageboxes.last[:msg].include?('خطای آزمایش'), 'label in message', UI.messageboxes.last[:msg]
ok_val = C.guarded('سالم') { :fine }
assert ok_val == :fine, 'normal path returns block value'
assert UI.messageboxes.length == 1, 'no extra messagebox on success'

puts '[6] HttpSyncPort#interpret raw path (real class, fake HTTP responses)'
FakeRes = Struct.new(:code, :body)
port = Kalaxa::SyncClient::HttpSyncPort.new(base_url: 'https://x.example', username: 'u', app_password: 'p')
i = ->(res, raw) { port.send(:interpret, res, raw_body: raw) }

r = i.call(FakeRes.new('200', '<html>Fatal error in some-other-plugin.php</html>'), true)
assert r['ok'] == false && r.dig('error', 'code') == 'KX_SYNC_BADRESP',
       'raw 200 + non-JSON -> KX_SYNC_BADRESP', r.inspect
env = JSON.generate({ 'format' => 'kalaxa-doc', 'checksum' => 'c' })
r = i.call(FakeRes.new('200', env), true)
assert r['ok'] == true && r['raw'] == env, 'raw 200 + JSON -> ok with raw passthrough'
r = i.call(FakeRes.new('401', ''), false)
assert r.dig('error', 'code') == 'KX_SYNC_AUTH', '401 -> AUTH'

puts '[7] HTTPS enforcement (public API, no network happens)'
plain = Kalaxa::SyncClient::HttpSyncPort.new(base_url: 'http://insecure.example', username: 'u', app_password: 'p')
r = plain.status('some-id')
assert r['ok'] == false && r.dig('error', 'code') == 'KX_SYNC_NET' && r.dig('error', 'message').include?('HTTPS'),
       'http:// refused before any request'

puts
puts "RESULT: #{$passed} passed, #{$failed} failed"
exit($failed.zero? ? 0 : 1)
