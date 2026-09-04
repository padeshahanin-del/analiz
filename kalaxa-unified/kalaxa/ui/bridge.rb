# frozen_string_literal: true

require 'json'
require_relative '../version'
require_relative '../app/errors'
require_relative '../app/settings'
require_relative '../app/logging'
require_relative '../i18n/i18n'

module Kalaxa
  module UI
    # مسیریاب پیام‌های رابط. Ruby خالص و بدون هیچ ارجاعی به SketchUp API،
    # تا در رینگ A (خارج از اسکچاپ) کاملاً تست شود. اتصال به HtmlDialog در dialog.rb است.
    #
    # قالب درخواست:  { "id": String, "type": String, "payload": Hash }
    # قالب پاسخ:     { "id": ..., "ok": true,  "payload": Hash }
    #            یا  { "id": ..., "ok": false, "error": { "code", "message" } }
    module Bridge
      module_function

      def handle_raw(raw)
        msg = JSON.parse(raw.to_s)
        id  = msg['id'].to_s
        App::Errors.envelope(id) { dispatch(msg['type'].to_s, msg['payload'] || {}) }
      rescue JSON::ParserError => e
        App::Log.error('bridge: malformed message', message: e.message)
        { 'id' => nil, 'ok' => false,
          'error' => { 'code' => 'KY_BAD_MESSAGE', 'message' => 'malformed JSON message' } }
      end

      def dispatch(type, payload)
        case type
        when 'app/get_state'       then state_payload
        when 'app/set_locale'      then set_locale(payload)
        when 'app/ping'            then { 'echo' => payload, 'at' => Time.now.to_f }
        when 'app/raise_test_error' then raise Kalaxa::ValidationError, 'deliberate test error'
        when 'ui/error'            then log_ui_error(payload)
        else
          raise Kalaxa::ValidationError, "unknown message type: #{type}"
        end
      end

      def state_payload
        locale = App::Settings.locale
        {
          'version'   => Kalaxa::VERSION,
          'targets'   => Kalaxa::TARGET_SKETCHUP,
          'build'     => build_info,
          'locale'    => locale,
          'direction' => I18n.direction(locale),
          'locales'   => I18n::LOCALES,
          'strings'   => I18n.bundle(locale)
        }
      end

      def set_locale(payload)
        App::Settings.locale = payload['locale'].to_s
        App::Log.info('locale changed', locale: App::Settings.locale)
        state_payload
      end

      def log_ui_error(payload)
        App::Log.error('ui error boundary',
                       message: payload['message'].to_s,
                       source: payload['source'].to_s,
                       line: payload['line'])
        { 'logged' => true }
      end

      def build_info
        info_file = File.join(__dir__, '..', 'build_info.json')
        return { 'type' => 'source', 'built_at' => nil } unless File.exist?(info_file)

        JSON.parse(File.read(info_file, encoding: 'UTF-8'))
      rescue JSON::ParserError
        { 'type' => 'unknown', 'built_at' => nil }
      end
    end
  end
end
