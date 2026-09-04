# Minimal SketchUp UI/Sketchup stub for boot-testing the plugin outside SketchUp itself.
# Purpose: this environment has no SketchUp install, so the only way to verify the
# Ruby boot chain (menu registration, HtmlDialog creation, callbacks) actually works
# is to stub just enough of the SketchUp API surface that main.rb/create_cabinet_tool.rb
# touch at load/boot time, then require the real plugin files on top of it.
# This is NOT a full SketchUp API emulator - only what boot-time code paths need.
$SKETCHUP_STUB_LOADED_FILES = []

def file_loaded?(name) = $SKETCHUP_STUB_LOADED_FILES.include?(name)
def file_loaded(name)  = $SKETCHUP_STUB_LOADED_FILES << name

MB_YESNO = 4 unless defined?(MB_YESNO)
IDYES    = 6 unless defined?(IDYES)
IDNO     = 7 unless defined?(IDNO)

module Sketchup
  # مدل جعلی حداقلی — انتخاب همیشه خالی است، پس مسیرهای «چیزی انتخاب نشده» فعال
  # می‌شوند (نه استثنای nil.selection)؛ همان چیزی که واقعاً بدون مدل باز اتفاق می‌افتد.
  class StubModel
    class Selection < Array
      def empty? = length.zero?
    end
    def selection = @selection ||= Selection.new
    def active_view = nil
    def path = ''
    def start_operation(*) ; end
    def commit_operation ; end
    def abort_operation ; end
    def set_attribute(*) ; end
    def get_attribute(*) = nil
    def attribute_dictionary(*) = nil
    def select_tool(*) ; end
  end

  def self.version = '25.0.123'
  def self.active_model = @active_model ||= StubModel.new

  class Extension
  end

  # فقط برای این‌که فعال‌سازی Tool در بارگذاری منو با NameError نترکد — رفتار تعاملی
  # واقعی (onMouseMove و...) این‌جا شبیه‌سازی نمی‌شود، چون نیاز به view زنده دارد.
  class InputPoint
    def initialize(*) ; end
    def pick(*) ; end
    def valid? = false
    def position = Geom::Point3d.new(0, 0, 0) if defined?(Geom::Point3d)
  end
end

SketchupExtension = Sketchup::Extension unless defined?(SketchupExtension)

module UI
  class StubMenu
    attr_reader :items, :name
    def initialize(name) = (@name = name; @items = [])
    def add_submenu(label)
      sub = StubMenu.new(label)
      @items << { type: :submenu, label: label, menu: sub }
      sub
    end
    def add_item(label, &blk)
      @items << { type: :item, label: label, block: blk }
      @items.length
    end
    def add_separator = @items << { type: :separator }
  end

  class HtmlDialog
    STYLE_DIALOG = 0
    def initialize(*) ; end
    def add_action_callback(*) ; end
    def set_file(*) ; end
    def set_html(*) ; end
    def set_on_closed(*) ; end
    def execute_script(*) ; end
    def show ; end
    def close ; end
    def visible? = false
    def bring_to_front ; end
  end

  @menus = {}
  @messageboxes = []
  class << self
    attr_reader :menus, :messageboxes
    def menu(name) = (@menus[name] ||= StubMenu.new(name))
    def messagebox(msg, type = nil)
      @messageboxes << { msg: msg, type: type }
      IDYES
    end
    # چهار پارامتری بودن مثل SketchUp واقعی (prompts, defaults, list, title) — یک بار
    # قبلاً همین کمبود، مسیرهای منو را در تست دود اشتباهی «شکسته» نشان داد.
    def inputbox(prompts, defaults, _list = nil, _title = nil) = defaults
    def savepanel(*) = nil
    def openpanel(*) = nil
  end
end
