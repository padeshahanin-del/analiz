# encoding: utf-8
# frozen_string_literal: true

# بدل کمینهٔ اسکچاپ برای تست‌های رینگ A.
#
# سلسله‌مراتب واقعی بازسازی می‌شود چون خودش منبع باگ بوده:
#   - `Group < ComponentInstance` (از SU2015)
#   - `ComponentInstance` متد `entities` **ندارد** — تنها راهش definition.entities
# همین دو نکته باعث شد walk_entities همهٔ کامپوننت‌ها را بی‌صدا دور بیندازد (۳.۲۵.۱).
#
# مدل، attribute و عملیات undo را واقعاً نگه می‌دارد تا بشود سنجید هر نوشتن داخل
# یک عملیات انجام می‌شود و روی خطا abort می‌خورد.
#
# ::UI پیام‌ها را ثبت می‌کند به‌جای نمایش، تا تست بتواند بپرسد «به کاربر چه گفتی؟»

module Geom
  class Point3d
    attr_reader :x, :y, :z
    def initialize(x = 0, y = 0, z = 0) = (@x, @y, @z = x, y, z)
    def offset(v) = Point3d.new(@x + v.x, @y + v.y, @z + v.z)
    # اسکچاپ واقعی این را دارد؛ اسکنر برای بردن مختصاتِ قطعهٔ تودرتو به فضای
    # کابینت لازمش دارد.
    def transform(t) = t.nil? ? self : t.apply(self)
  end

  class Vector3d < Point3d; end

  class BoundingBox
    attr_reader :min, :max
    def initialize(min, max) = (@min, @max = min, max)
  end

  # انتقال + آینه/مقیاس روی محورها.
  #
  # آینه لازم شد چون در مدل‌های واقعی دیوارهٔ چپ و راست یک تعریف مشترک دارند و
  # تفاوتشان فقط در ماتریس است. بدلِ انتقال‌تنها این حالت را اصلاً نمی‌ساخت،
  # پس باگ «سوراخ از سمت غلط» هرگز در تست دیده نمی‌شد.
  class Transformation
    attr_reader :origin
    def initialize(dx = 0, dy = 0, dz = 0, sx = 1, sy = 1, sz = 1)
      @dx = dx
      @dy = dy
      @dz = dz
      @sx = sx
      @sy = sy
      @sz = sz
      @origin = Point3d.new(dx, dy, dz)
    end

    # آینه حول یک محور، در مختصات داده‌شده
    def self.mirror(axis, at = 0)
      s = { x: [-1, 1, 1], y: [1, -1, 1], z: [1, 1, -1] }[axis]
      d = { x: [2 * at, 0, 0], y: [0, 2 * at, 0], z: [0, 0, 2 * at] }[axis]
      new(d[0], d[1], d[2], s[0], s[1], s[2])
    end

    def xaxis = Vector3d.new(1, 0, 0)
    # ترکیب: اول other اعمال می‌شود، بعد self — مثل اسکچاپ.
    def *(other)
      Transformation.new(@dx + @sx * other.dxx, @dy + @sy * other.dyy, @dz + @sz * other.dzz,
                         @sx * other.sxx, @sy * other.syy, @sz * other.szz)
    end

    def apply(p) = Point3d.new(p.x * @sx + @dx, p.y * @sy + @dy, p.z * @sz + @dz)

    protected

    def dxx = @dx
    def dyy = @dy
    def dzz = @dz
    def sxx = @sx
    def syy = @sy
    def szz = @sz
  end
end

# ثابت‌های سراسری اسکچاپ. کد واقعی `::ORIGIN` را صدا می‌زند و نبودشان یعنی
# مسیر ساختِ مدل اصلاً اجرا نمی‌شود.
ORIGIN = Geom::Point3d.new(0, 0, 0) unless defined?(ORIGIN)
X_AXIS = Geom::Vector3d.new(1, 0, 0) unless defined?(X_AXIS)
Y_AXIS = Geom::Vector3d.new(0, 1, 0) unless defined?(Y_AXIS)
Z_AXIS = Geom::Vector3d.new(0, 0, 1) unless defined?(Z_AXIS)

module Sketchup
  def self.version = '24.0.0'

  # setter نمی‌تواند endless باشد (محدودیت نحوی روبی).
  def self.active_model = @active_model

  def self.active_model=(model)
    @active_model = model
  end

  class ComponentDefinition
    attr_reader :entities, :name
    def initialize(entities = [], name = 'def') = (@entities, @name = entities, name)
  end

  # عمداً بدون متد `entities` — عین API واقعی.
  class ComponentInstance
    attr_reader :definition, :transformation, :persistent_id, :bounds
    attr_accessor :name

    def initialize(definition: ComponentDefinition.new, transformation: Geom::Transformation.new,
                   name: '', dicts: {}, pid: object_id, hidden: false, bounds: nil)
      @definition = definition
      @transformation = transformation
      @name = name
      @dicts = dicts
      @persistent_id = pid
      @hidden = hidden
      @bounds = bounds || Geom::BoundingBox.new(Geom::Point3d.new(0, 0, 0),
                                                Geom::Point3d.new(1, 1, 1))
    end

    def deleted? = false
    def hidden? = @hidden
    # اسکچاپ واقعی این را دارد؛ تبدیل کابینت با همین اصل را مخفی می‌کند.
    def hidden=(v)
      @hidden = v
    end

    def dicts = @dicts
    def attribute_dictionary(key, create = false) = (@dicts[key] ||= (create ? {} : nil))
  end

  class Group < ComponentInstance
    def entities = @definition.entities

    # ابزارِ ساخت هندسه را در مختصات محلی می‌کشد و بعد کل گروه را جابه‌جا
    # می‌کند؛ بدون این setter آن مسیر اصلاً اجرا نمی‌شود.
    def transformation=(t)
      @transformation = t
    end

    def transform!(t)
      @transformation = t
      self
    end
  end

  class Model
    attr_reader :entities, :ops, :aborted
    attr_accessor :path, :selection

    def initialize(entities = [], selection = [])
      @entities = entities
      @selection = selection
      @attrs = {}
      @ops = []
      @aborted = []
      @open = nil
      @path = ''
    end

    def attribute_dictionary(key, create = false) = (@attrs[key] ||= (create ? {} : nil))
    def set_attribute(dict, key, value) = ((@attrs[dict] ||= {})[key] = value)
    def get_attribute(dict, key, default = nil) = ((@attrs[dict] || {}).fetch(key, default))

    def start_operation(name, _disable_ui = false)
      raise 'عملیات تودرتو' if @open

      @open = name
      @ops << name
      true
    end

    def commit_operation
      raise 'commit بدون start' unless @open

      @open = nil
      true
    end

    def abort_operation
      @aborted << @open
      @open = nil
      true
    end

    def open_operation = @open
    def select_tool(tool) = (@tool = tool)
    def selected_tool = @tool
  end

  class Selection < Array; end

  # ابزارهای چیدمان یکی از این‌ها در initialize می‌سازند. برای تستِ منطقِ پیش از
  # کلیک (خواندن ورودی، فعال‌شدن ابزار) کافی است؛ خودِ کلیک به view نیاز دارد و
  # این‌جا سنجیده نمی‌شود.
  class InputPoint
    def initialize(*) = @position = Geom::Point3d.new(0, 0, 0)
    attr_reader :position
    def valid? = true
    def pick(*) = true
  end
end

# ---------------------------------------------------------------------
# هندسهٔ ساختنی — تا این‌جا استاب هیچ‌کدام از این‌ها را نداشت، یعنی
# `CreateCabinetTool#add_part_box` — همان جایی که واقعاً کابینت را در صحنه
# می‌کشد — **صفر پوشش تست** داشت. هر تغییری آن‌جا فقط با باز کردن اسکچاپ
# دیده می‌شد.
#
# این‌ها اسکچاپ را شبیه‌سازی نمی‌کنند؛ فقط آن‌قدر رفتار دارند که کد واقعی
# اجرا شود و بشود پرسید «چه چیزی ساخته شد و کجا». حجمِ ساخته‌شده از روی
# رئوس محاسبه می‌شود، پس اگر کد جای غلطی بکشد یا اصلاً نکشد، تست می‌فهمد.
module Sketchup
  class Face
    attr_reader :points, :normal, :pushed

    def initialize(points, owner)
      @points = points
      @owner = owner
      @pushed = nil
      @normal = compute_normal
    end

    # ضرب خارجی دو ضلع اول — همان چیزی که اسکچاپ می‌دهد.
    def compute_normal
      return Geom::Vector3d.new(0, 0, 1) if @points.length < 3

      a, b, c = @points[0], @points[1], @points[2]
      u = [b.x - a.x, b.y - a.y, b.z - a.z]
      v = [c.x - a.x, c.y - a.y, c.z - a.z]
      n = [u[1] * v[2] - u[2] * v[1],
           u[2] * v[0] - u[0] * v[2],
           u[0] * v[1] - u[1] * v[0]]
      len = Math.sqrt(n.sum { |q| q * q })
      len.zero? ? Geom::Vector3d.new(0, 0, 1)
                : Geom::Vector3d.new(n[0] / len, n[1] / len, n[2] / len)
    end

    def reverse!
      @points = @points.reverse
      @normal = compute_normal
      self
    end

    def pushpull(dist)
      @pushed = dist
      @owner.record_solid(self, dist)
      self
    end
  end

  class Edge
    attr_reader :start_point, :end_point
    def initialize(a, b) = (@start_point, @end_point = a, b)
  end

  # مجموعهٔ موجودیت‌ها. آرایه است (کد موجود روی آن `each`/`length` می‌زند)
  # ولی متدهای ساخت هم دارد.
  class Entities < Array
    attr_reader :solids

    def initialize(*args)
      super
      @solids = []
    end

    def add_group(*)
      g = Sketchup::Group.new(definition: Sketchup::ComponentDefinition.new(Entities.new))
      push(g)
      g
    end

    def add_face(*args)
      pts = args.length == 1 && args[0].is_a?(Array) ? args[0] : args
      pts = pts.map { |p| p.is_a?(Edge) ? p.start_point : p }
      f = Face.new(pts, self)
      push(f)
      f
    end

    # اسکچاپ آرایهٔ یال برمی‌گرداند؛ کد واقعی بعداً `add_face(edges)` می‌زند.
    def add_circle(center, normal, radius, segments = 24)
      @circles ||= []
      @circles << { center: center, normal: normal, radius: radius, segments: segments }
      pts = circle_points(center, normal, radius, segments)
      (0...pts.length).map { |i| Edge.new(pts[i], pts[(i + 1) % pts.length]) }
    end

    def circles = (@circles ||= [])

    def circle_points(c, n, r, seg)
      # فقط محورهای اصلی — همان چیزی که این پروژه لازم دارد.
      ax, ay = if n.z.abs > 0.5 then [[1, 0, 0], [0, 1, 0]]
               elsif n.x.abs > 0.5 then [[0, 1, 0], [0, 0, 1]]
               else [[1, 0, 0], [0, 0, 1]]
               end
      (0...seg).map do |i|
        t = 2 * Math::PI * i / seg
        Geom::Point3d.new(c.x + r * (ax[0] * Math.cos(t) + ay[0] * Math.sin(t)),
                          c.y + r * (ax[1] * Math.cos(t) + ay[1] * Math.sin(t)),
                          c.z + r * (ax[2] * Math.cos(t) + ay[2] * Math.sin(t)))
      end
    end

    # جعبهٔ محیطی هر چیزی که pushpull شده — تست با همین می‌سنجد کجا کشیده شد.
    def record_solid(face, dist)
      xs = face.points.map(&:x); ys = face.points.map(&:y); zs = face.points.map(&:z)
      n = face.normal
      lo = [xs.min, ys.min, zs.min]
      hi = [xs.max, ys.max, zs.max]
      # امتداد در راستای نرمال
      axis = [n.x.abs, n.y.abs, n.z.abs].each_with_index.max[1]
      if (axis.zero? ? n.x : axis == 1 ? n.y : n.z).negative?
        lo[axis] -= dist
      else
        hi[axis] += dist
      end
      @solids << { lo: lo, hi: hi, face: face }
      @solids.last
    end

    def erase_entities(*) = nil
    def transform_entities(*) = nil
  end
end

# پیام‌ها ثبت می‌شوند، نه نمایش داده — تا تست بپرسد «به کاربر چه گفتی؟»
module UI
  # منو بلاک هر آیتم را نگه می‌دارد تا تست بتواند **واقعاً صدایش بزند**. منو تنها
  # راه ورود کاربر به پلاگین است و این جلسه دو بار NameError خاموش تویش بود
  # (Kalaxa::SettingsService و ثابت‌های ProjectScanner) — تستی که هر آیتم را اجرا
  # کند، هر دو را می‌گرفت.
  class Menu
    attr_reader :items, :separators

    def initialize(name = 'root')
      @name = name
      @items = {}
      @separators = 0
      @submenus = {}
    end

    def add_submenu(title) = (@submenus[title] ||= Menu.new(title))
    def add_item(title, &block) = (@items[title] = block)
    def add_separator = (@separators += 1)
    def submenu(title) = @submenus[title]
    def submenus = @submenus
  end

  class HtmlDialog
    STYLE_DIALOG = 0
    attr_reader :callbacks, :options, :shown, :file

    def initialize(options = {})
      @options = options
      @callbacks = {}
      @shown = false
    end

    def add_action_callback(name, &block) = (@callbacks[name] = block)
    def set_file(path) = (@file = path)
    def set_on_closed(&block) = (@on_closed = block)
    def on_closed = @on_closed
    # `(@shown = false) && (@on_closed&.call)` بود — سمت چپ همیشه false
    # برمی‌گرداند و `&&` هرگز به کال‌بک نمی‌رسید. یعنی استاب وانمود می‌کرد
    # پنجره بسته شده ولی `set_on_closed` هیچ‌وقت اجرا نمی‌شد؛ هر نشتیِ
    # مرجعی در این تست نامرئی می‌ماند.
    def simulate_close = close
    def set_size(*) = true
    def set_position(*) = true
    def show = (@shown = true)
    def visible? = @shown
    def bring_to_front = true
    # در اسکچاپ واقعی بستن پنجره — چه دست کاربر چه با `.close` — همیشه
    # `set_on_closed` را می‌زند. استابی که این را نزند، نشتیِ مرجع را
    # پنهان می‌کند؛ همان چیزی که باید بگیرد.
    def close
      @shown = false
      cb = @on_closed
      @on_closed = nil
      cb&.call
      false
    end
    def execute_script(js) = ((@scripts ||= []) << js)
    def scripts = (@scripts ||= [])
  end

  class << self
    def root_menu = (@root_menu ||= Menu.new)
    def menu(name = 'Plugins') = root_menu.add_submenu(name)
    def reset_menus! = (@root_menu = nil)
    def openURL(*) = true

    def messages = (@messages ||= [])
    def reset! = (@messages = [])

    def messagebox(text, _type = nil)
      messages << text.to_s
      nil
    end

    # پاسخ دیالوگ ورودی را تست از قبل می‌چیند.
    def next_inputbox=(value)
      @next_inputbox = value
    end

    def inputbox(_prompts, _defaults, _lists = nil, _title = nil)
      v = @next_inputbox
      @next_inputbox = nil
      v
    end

    def last_message = messages.last
    def said?(fragment) = messages.any? { |m| m.include?(fragment) }
  end
end
