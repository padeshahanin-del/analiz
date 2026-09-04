# frozen_string_literal: true

require 'json'
require 'securerandom'
require 'time'
require_relative 'sync_flow'
require_relative 'http_sync_port'

module Kalaxa
  module SyncClient
    # هماهنگ‌کنندهٔ سمت اسکچاپ: پیکربندی، تزریق متادیتای sync در پاکت، و جریان‌های
    # Push/Pull/Status با پرسش کاربر روی واگرایی (LWW دستی — D-SYNC-2).
    # وابسته به هستهٔ Kalaxa (Store/Serializer/Canonical) که باید قبلاً بار شده باشد.
    module Client
      CONFIG_FILE = 'sync_client.json'

      module_function

      # ---------- پیکربندی و وضعیت محلی ----------
      # ساختار: { 'base_url','username','app_password','device_id',
      #           'projects' => { project_id => { 'last_synced_revision' => n } } }
      # هشدار امنیتی (در README هم آمده): app_password متن ساده در پوشهٔ دادهٔ کاربر
      # ذخیره می‌شود؛ برای آن یک Application Password اختصاصی با حداقل دسترسی بسازید
      # تا در صورت افشا فقط همان باطل شود.
      # نام متد در هسته `user_data_dir` است — `data_dir` هرگز وجود نداشته.
      # چون config_path پشتِ حافظهٔ config نشسته و config اولین چیزی است که هر چهار
      # فرمان منو لمسش می‌کنند (configured? → config)، این یعنی NoMethodError پیش از
      # ورود به guarded — یعنی هر چهار فرمان مرده بودند. هم‌خانوادهٔ همان باگ ::UI که
      # در README ثبت شده: فقط در سناریوی واقعیِ استفاده خودش را نشان می‌داد.
      def config_path
        File.join(App::Paths.user_data_dir, CONFIG_FILE)
      end

      def config
        @config ||= begin
          raw = File.exist?(config_path) ? File.read(config_path) : nil
          c = raw ? JSON.parse(raw) : {}
          c['device_id'] ||= "sketchup-#{SecureRandom.uuid}"
          c['projects'] ||= {}
          c
        rescue JSON::ParserError
          App::Log.error('sync config corrupt; starting fresh')
          { 'device_id' => "sketchup-#{SecureRandom.uuid}", 'projects' => {} }
        end
      end

      # این فایل اپ‌پسورد را متن ساده نگه می‌دارد، پس با مجوز «فقط صاحب فایل» نوشته
      # می‌شود. File.write مجوز را به umask واگذار می‌کند (روی مک/لینوکس معمولاً 0644 =
      # قابل خواندن برای هر کاربر دیگر همان دستگاه). حالت در open فقط هنگام *ساخت* اعمال
      # می‌شود، پس chmod جداگانه هم لازم است تا فایل‌هایی که قبلاً با مجوز باز ساخته
      # شده‌اند اصلاح شوند. روی ویندوز chmod عملاً بی‌اثر است — آن‌جا حفاظت از ACL پوشهٔ
      # کاربر می‌آید؛ ضرری هم ندارد.
      def save_config
        File.open(config_path, File::WRONLY | File::CREAT | File::TRUNC, 0o600) do |f|
          f.write(JSON.pretty_generate(config))
        end
        File.chmod(0o600, config_path)
      rescue Errno::EPERM, Errno::ENOTSUP, NotImplementedError
        nil # chmod روی برخی فایل‌سیستم‌ها پشتیبانی نمی‌شود؛ نوشتن انجام شده است
      end

      def configured?
        %w[base_url username app_password].all? { |k| config[k].to_s.strip != '' }
      end

      def port
        HttpSyncPort.new(base_url: config['base_url'],
                         username: config['username'],
                         app_password: config['app_password'])
      end

      # ---------- کمکی‌های سند ----------
      def current_state(model)
        state = Adapter::Store.load_document(model)
        return nil if state.nil? || !state['ok']

        state
      end

      def local_checksum(doc)
        Persistence::Canonical.checksum(doc)
      end

      def last_synced(project_id)
        (config['projects'][project_id] || {})['last_synced_revision']
      end

      def last_synced_checksum(project_id)
        (config['projects'][project_id] || {})['last_synced_checksum']
      end

      def remember_synced(project_id, revision, checksum)
        config['projects'][project_id] = { 'last_synced_revision' => revision,
                                           'last_synced_checksum' => checksum }
        save_config
      end

      # پاکت آمادهٔ push از **همان doc ی که چک‌سامش را حساب کرده‌ایم**.
      #
      # نسخهٔ قبلی به‌جای این، raw خام مدل را دوباره می‌خواند و متادیتا را داخلش تزریق
      # می‌کرد. روی سند میراثی این خاموش غلط بود: Serializer.load سند را مهاجرت می‌دهد
      # ولی 'raw' را دست‌نخورده برمی‌گرداند، پس ck = checksum(سندِ مهاجرت‌شده) بود در
      # حالی که پاکتِ push‌شده هنوز doc و checksum نسخهٔ قدیمی را داشت. نتیجه: سرور یک
      # چک‌سام ذخیره می‌کرد و کلاینت چک‌سام دیگری را به‌عنوان last_synced به یاد می‌سپرد؛
      # از آن پس cmd_status همیشه «متفاوت با مدل» می‌گفت — حتی بلافاصله پس از Push موفق —
      # و هر Push بعدی بی‌دلیل تکرار می‌شد.
      #
      # dump(doc, sync:) دقیقاً همین سه کلید را می‌پذیرد (Serializer::SYNC_KEYS)، خودش
      # اعتبارسنجی می‌کند و checksum را از همان doc می‌سازد → تطابق با ck تضمینی است.
      # سود جانبی: نسخهٔ روی سرور هم به schema جاری ارتقا می‌یابد.
      def envelope_for_push(doc, revision)
        Persistence::Serializer.dump(doc, sync: {
                                       'revision'   => revision,
                                       'updated_at' => Time.now.utc.iso8601,
                                       'device_id'  => config['device_id']
                                     })
      end

      # رفع #3: تا امروز cmd_status/cmd_push/cmd_pull هیچ مهار خطایی نداشتند — برخلاف
      # همه‌جای دیگر این اکوسیستم (کالبک‌های پنل، App::Errors.envelope در هستهٔ پلاگین).
      # مسیر واقعیِ رخداد: سند میراثی v1 با thickness:null باعث NoMethodError در گام
      # مهاجرت می‌شود — که Kalaxa::Error نیست، پس Serializer.safe_load آن را نمی‌گیرد و
      # بدون این guard مستقیم به کاربر به‌صورت خطای خام روبی/سکوت می‌رسید.
      def guarded(label)
        yield
      rescue StandardError => e
        App::Log.error("#{label} failed", class: e.class.name, message: e.message,
                       backtrace: Array(e.backtrace).first(5))
        ::UI.messagebox("خطای #{label}: #{e.message}")
      end

      # ---------- جریان‌ها (منو) ----------
      def cmd_settings
        defaults = [config['base_url'] || 'https://kalaxa.ir',
                    config['username'] || '', config['app_password'] || '']
        input = ::UI.inputbox(['آدرس سایت (https):', 'نام کاربری:', 'Application Password:'],
                            defaults, 'Kalaxa Sync — تنظیمات')
        return unless input

        config['base_url'], config['username'], config['app_password'] = input.map(&:strip)
        save_config
        ::UI.messagebox('تنظیمات sync ذخیره شد.')
      end

      def cmd_status
        return ::UI.messagebox('ابتدا تنظیمات sync را کامل کنید.') unless configured?

        guarded('وضعیت') do
          state = current_state(Sketchup.active_model)
          next ::UI.messagebox('مدل سند کالاکسا ندارد.') unless state

          pid = state['doc'].dig('project', 'id')
          r = port.status(pid)
          if r['ok']
            same = r['checksum'] == local_checksum(state['doc'])
            ::UI.messagebox("سرور: revision #{r['revision']} — " \
                          "#{same ? 'هم‌نظر با مدل ✔' : 'متفاوت با مدل'}\n" \
                          "آخرین هم‌نظری این دستگاه: #{last_synced(pid) || '—'}")
          elsif r.dig('error', 'code') == 'KX_SYNC_NOT_FOUND'
            ::UI.messagebox('این پروژه هنوز روی سرور نیست (اولین Push آن را می‌سازد).')
          else
            ::UI.messagebox("خطا: #{r.dig('error', 'message')}")
          end
        end
      end

      def cmd_push
        return ::UI.messagebox('ابتدا تنظیمات sync را کامل کنید.') unless configured?

        guarded('Push') do
        model = Sketchup.active_model
        state = current_state(model)
        return ::UI.messagebox('مدل سند کالاکسا ندارد؛ ابتدا از پلاگین ذخیره کنید.') unless state

        doc = state['doc']
        pid = doc.dig('project', 'id')
        ck  = local_checksum(doc)

        st = port.status(pid)
        server = if st['ok'] then st
                 elsif st.dig('error', 'code') == 'KX_SYNC_NOT_FOUND' then nil
                 else return ::UI.messagebox("خطای وضعیت سرور: #{st.dig('error', 'message')}")
                 end

        d = SyncFlow.decide_push(server, ck, last_synced(pid))
        case d[:action]
        when :idempotent
          remember_synced(pid, d[:push_revision], ck)
          return ::UI.messagebox('سرور از قبل همین نسخه را دارد ✔')
        when :diverged
          msg = "واگرایی: سرور revision #{server && server['revision']} دارد و با مدل شما فرق می‌کند.\n" \
                "Yes = بازنویسی سرور با نسخهٔ شما (LWW)\nNo = انصراف (پیشنهاد: ابتدا Pull و بررسی)"
          return if ::UI.messagebox(msg, MB_YESNO) != IDYES
        end

        r = port.push(pid, envelope_for_push(doc, d[:push_revision]))
        if r['ok']
          remember_synced(pid, d[:push_revision], ck)
          ::UI.messagebox("Push انجام شد — revision #{d[:push_revision]} ✔")
        elsif r.dig('error', 'code') == 'KX_SYNC_CONFLICT'
          ::UI.messagebox("سرور هم‌زمان جلو رفته است (revision #{r.dig('server', 'revision')}). " \
                        'دوباره Push بزنید تا با وضعیت تازه تصمیم بگیرید.')
        else
          ::UI.messagebox("خطای Push: #{r.dig('error', 'message')}")
        end
        end
      end

      def cmd_pull
        return ::UI.messagebox('ابتدا تنظیمات sync را کامل کنید.') unless configured?

        guarded('Pull') do
        model = Sketchup.active_model
        state = current_state(model)
        return ::UI.messagebox('مدل سند کالاکسا ندارد؛ Pull فقط روی مدلِ دارای سند تعریف شده است.') unless state

        pid = state['doc'].dig('project', 'id')
        r = port.pull(pid)
        return ::UI.messagebox("خطای Pull: #{r.dig('error', 'message')}") unless r['ok']

        loaded = Persistence::Serializer.safe_load(r['raw'])
        return ::UI.messagebox("پاکت سرور خراب است: #{loaded.dig('error', 'message')}") unless loaded['ok']

        env = JSON.parse(r['raw'])
        d = SyncFlow.decide_pull(local_checksum(state['doc']), last_synced_checksum(pid), env['checksum'])
        if d[:action] == :same
          remember_synced(pid, env['revision'], env['checksum']) if env['revision']
          return ::UI.messagebox('مدل و سرور از قبل هم‌نظرند ✔')
        end
        if d[:action] == :overwrite &&
           ::UI.messagebox("نسخهٔ سرور (revision #{env['revision'] || '—'}) روی سند محلی نوشته می‌شود؛ " \
                         'تغییرات sync نشدهٔ محلی از بین می‌رود. ادامه؟', MB_YESNO) != IDYES
          return
        end

        Adapter::Store.with_operation(model, 'Kalaxa: Pull از سرور') do
          model.set_attribute(Adapter::Store::DICT, Adapter::Store::KEY_DOC, r['raw'])
        end
        remember_synced(pid, env['revision'], env['checksum']) if env['revision']
        App::Log.info('pull applied', revision: env['revision'])
        ::UI.messagebox('Pull انجام شد — پنل را دوباره «بارگیری سند» کنید ✔')
        end
      end
    end
  end
end
