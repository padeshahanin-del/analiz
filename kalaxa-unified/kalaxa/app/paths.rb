module Kalaxa
  module App
    # مسیرهای دادهٔ کاربر (تنظیمات و لاگ)، مستقل از اسکچاپ تا در تست واحد هم کار کند.
    module Paths
      module_function

      def user_data_dir
        base = ENV["KALAXA_DATA_DIR"] # برای تست‌ها قابل تزریق است
        base ||= ENV["APPDATA"] # Windows
        base ||= File.join(Dir.home, ".config")
        dir = File.join(base, "Kalaxa")
        require "fileutils"
        FileUtils.mkdir_p(dir)
        dir
      end

      def settings_file
        File.join(user_data_dir, "settings.json")
      end
      def log_file
        File.join(user_data_dir, "kalaxa.log")
      end
    end
  end
end
