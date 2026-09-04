# encoding: utf-8
# Kalaxa — loader (پلاگین یکپارچه: هستهٔ داده + موتورهای آنالیز)
require 'sketchup.rb'
require 'extensions.rb'

module Kalaxa
  unless file_loaded?(__FILE__)
    require File.join(File.dirname(__FILE__), 'kalaxa', 'version')
    extension = SketchupExtension.new('Kalaxa | کالاکسا', File.join('kalaxa', 'main'))
    extension.version     = Kalaxa::VERSION
    extension.description = 'طراحی پارامتریک کابینت + آنالیز برش، بهینه‌سازی ورق، نقشه نصب، BOM — کاملاً آفلاین'
    extension.creator     = 'Kalaxa'
    extension.copyright   = 'kalaxa.ir'
    Sketchup.register_extension(extension, true)
    file_loaded(__FILE__)
  end
end
