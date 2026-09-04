# frozen_string_literal: true

require 'net/http'
require 'uri'
require 'json'

module Kalaxa
  module SyncClient
    # پیاده‌سازی HTTP از قرارداد Adapter::SyncPort (push/pull/status) علیه
    # افزونهٔ وردپرسی kalaxa-sync (namespace: kalaxa-sync/v1).
    # طبق D-SYNC-3 این کد «بیرون از هستهٔ آفلاین» زندگی می‌کند — مخزن جدا.
    #
    # خروجی همهٔ متدها هش با 'ok'؛ خطاها: { 'ok'=>false, 'error'=>{ 'code','message' } }
    # کدهای شبکه/کلاینت: KX_SYNC_NET, KX_SYNC_AUTH, KX_SYNC_NOT_FOUND, KX_SYNC_CONFLICT,
    # KX_SYNC_HTTP, KX_SYNC_BADRESP — هم‌خانوادهٔ کدهای سرور.
    class HttpSyncPort
      OPEN_TIMEOUT = 5
      READ_TIMEOUT = 20

      # base_url مثل https://kalaxa.ir (بدون اسلش انتهایی هم پذیرفته می‌شود)
      def initialize(base_url:, username:, app_password:)
        @base = base_url.to_s.sub(%r{/+\z}, '')
        @user = username.to_s
        @pass = app_password.to_s
      end

      def status(project_id)
        request(:get, path(project_id, '/status'))
      end

      def pull(project_id)
        r = request(:get, path(project_id), raw_body: true)
        return r unless r['ok']

        { 'ok' => true, 'raw' => r['raw'] }
      end

      def push(project_id, raw_envelope)
        request(:post, path(project_id), body: raw_envelope)
      end

      private

      def path(project_id, suffix = '')
        "/wp-json/kalaxa-sync/v1/projects/#{project_id}#{suffix}"
      end

      def request(method, req_path, body: nil, raw_body: false)
        uri = URI.parse(@base + req_path)
        unless uri.is_a?(URI::HTTPS)
          # اپ‌پسورد با Basic می‌رود؛ روی HTTP لو می‌رود — قاطعانه رد می‌کنیم.
          return err('KX_SYNC_NET', 'فقط HTTPS مجاز است (اعتبارنامه روی HTTP امن نیست)')
        end

        req = (method == :post ? Net::HTTP::Post : Net::HTTP::Get).new(uri)
        req.basic_auth(@user, @pass)
        if body
          req['Content-Type'] = 'application/json; charset=utf-8'
          req.body = body
        end

        res = Net::HTTP.start(uri.host, uri.port, use_ssl: true,
                              open_timeout: OPEN_TIMEOUT, read_timeout: READ_TIMEOUT) do |http|
          http.request(req)
        end
        interpret(res, raw_body: raw_body)
      rescue Timeout::Error, Errno::ECONNREFUSED, Errno::ECONNRESET,
             SocketError, OpenSSL::SSL::SSLError => e
        err('KX_SYNC_NET', "خطای شبکه: #{e.class}: #{e.message}")
      end

      def interpret(res, raw_body:)
        code = res.code.to_i
        return err('KX_SYNC_AUTH', 'احراز هویت رد شد (Application Password را بررسی کنید)') if [401, 403].include?(code)

        parsed = parse_json(res.body)

        case code
        when 200
          if raw_body
            # رفع #4: قبلاً اینجا بدون بررسیِ JSON بودن، ok:true گزارش می‌شد — یک پاسخ ۲۰۰
            # غیر-JSON (مثلاً صفحهٔ خطای PHP از یک افزونهٔ دیگر، یا لایهٔ کش) بی‌صدا به‌عنوان
            # پاکت معتبر تلقی می‌شد. حالا مثل مسیر غیرخام، معتبربودن JSON پیش‌شرط ok است.
            return err('KX_SYNC_BADRESP', 'پاسخ سرور JSON معتبر نیست') if parsed.nil?

            return { 'ok' => true, 'raw' => res.body }
          end
          return parsed || err('KX_SYNC_BADRESP', 'پاسخ سرور JSON معتبر نیست')
        when 404
          e = (parsed && parsed['error']) || { 'code' => 'KX_SYNC_NOT_FOUND', 'message' => 'پروژه روی سرور نیست' }
          { 'ok' => false, 'error' => e }
        when 409
          # واگرایی: وضعیت سرور را برای تصمیم کاربر عبور می‌دهیم
          out = { 'ok' => false,
                  'error' => (parsed && parsed['error']) ||
                             { 'code' => 'KX_SYNC_CONFLICT', 'message' => 'واگرایی نسخه' } }
          out['server'] = parsed['server'] if parsed && parsed['server']
          out
        else
          e = (parsed && parsed['error']) ||
              { 'code' => 'KX_SYNC_HTTP', 'message' => "پاسخ غیرمنتظرهٔ سرور (HTTP #{code})" }
          { 'ok' => false, 'error' => e }
        end
      end

      def parse_json(text)
        JSON.parse(text.to_s)
      rescue JSON::ParserError
        nil
      end

      def err(code, message)
        { 'ok' => false, 'error' => { 'code' => code, 'message' => message } }
      end
    end
  end
end
