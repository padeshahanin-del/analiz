# frozen_string_literal: true

require 'json'
require_relative 'paths'

module Kalaxa
  module App
    # ثبت رخدادها در فایل کاربر + کنسول Ruby اسکچاپ (در صورت وجود).
    module Log
      LEVELS = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 }.freeze
      @level = :info

      class << self
        attr_reader :level

        def level=(sym)
          raise ArgumentError, "invalid log level: #{sym}" unless LEVELS.key?(sym)

          @level = sym
        end

        LEVELS.each_key do |sym|
          define_method(sym) { |msg, data = nil| write(sym, msg, data) }
        end

        def write(sym, msg, data = nil)
          return if LEVELS[sym] < LEVELS[@level]

          line = format('%s [%s] %s%s',
                        Time.now.strftime('%Y-%m-%d %H:%M:%S'),
                        sym.to_s.upcase, msg,
                        data ? " | #{JSON.generate(data)}" : '')
          begin
            File.open(Paths.log_file, 'a:UTF-8') { |f| f.puts(line) }
          rescue SystemCallError, IOError
            nil # خرابی لاگ نباید عملیات اصلی را بشکند
          end
          puts(line) if $stdout && ENV['KALAXA_QUIET'] != '1'
          line
        end
      end
    end
  end
end
