# encoding: utf-8
# Kalaxa Sync Client — loader
# HttpSyncPort + منوی Push/Pull/Status، جدا از هستهٔ آفلاین (D-SYNC-3).
# پیش‌نیاز: پلاگین اصلی Kalaxa (v3.1.0+) نصب و بارگذاری‌شده باشد.
require 'sketchup.rb'
require 'extensions.rb'

module Kalaxa
  module SyncClient
    VERSION = '0.2.3'
    PLUGIN_DIR = File.join(File.dirname(__FILE__), 'kalaxa_sync_client')

    unless file_loaded?(__FILE__)
      extension = SketchupExtension.new('Kalaxa Sync Client', File.join('kalaxa_sync_client', 'main'))
      extension.version     = VERSION
      extension.description = 'همگام‌سازی سند کالاکسا با kalaxa.ir (Push/Pull/Status)'
      extension.creator     = 'Kalaxa'
      extension.copyright   = 'kalaxa.ir'
      Sketchup.register_extension(extension, true)
      file_loaded(__FILE__)
    end
  end
end
