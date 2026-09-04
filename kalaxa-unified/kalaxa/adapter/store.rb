# frozen_string_literal: true

require 'json'
require_relative '../persistence/serializer'
require_relative '../domain/entities'
require_relative '../app/logging'

module Kalaxa
  module Adapter
    # تنها نقطهٔ تماس ذخیره‌سازی با SketchUp API.
    # همهٔ داده‌ها زیر فضای نام اختصاصی DICT می‌نشینند؛ به دیکشنری‌های
    # افزونه‌های دیگر هرگز دست نمی‌زنیم (فقط خواندن/نوشتن DICT خودمان).
    module Store
      DICT = 'kalaxa'
      KEY_DOC       = 'doc_envelope'
      KEY_SNAP_IDX  = 'snapshot_index'
      SNAP_PREFIX   = 'snapshot:'
      ATTR_UUID     = 'uuid'

      module_function

      # ---------- تراکنش (سازگاری Undo/Redo) ----------
      def with_operation(model, name)
        model.start_operation(name, true)
        result = yield
        model.commit_operation
        result
      rescue StandardError
        model.abort_operation
        raise
      end

      # ---------- سند ----------
      def save_document(model, doc, operation_name: 'Kalaxa: ذخیرهٔ داده')
        envelope = Persistence::Serializer.dump(doc) # اعتبارسنجی قبل از تراکنش
        with_operation(model, operation_name) do
          model.set_attribute(DICT, KEY_DOC, envelope)
        end
        App::Log.info('document saved to model', bytes: envelope.bytesize)
        true
      end

      def raw_document(model)
        model.get_attribute(DICT, KEY_DOC)
      end

      def document?(model)
        !raw_document(model).nil?
      end

      # خروجی مانند Serializer.safe_load؛ nil یعنی مدل اصلاً سند کالاکسا ندارد.
      def load_document(model)
        raw = raw_document(model)
        return nil if raw.nil?

        Persistence::Serializer.safe_load(raw)
      end

      # ---------- نگاشت موجودیت ⇄ نمونهٔ هندسی ----------
      def tag_instance(instance, uuid)
        unless Domain::Entities.uuid?(uuid)
          raise Kalaxa::ValidationError, "invalid uuid for tagging: #{uuid.inspect}"
        end

        instance.set_attribute(DICT, ATTR_UUID, uuid)
        instance
      end

      def uuid_of(instance)
        instance.get_attribute(DICT, ATTR_UUID)
      end

      # پیمایش کل مدل: نگاشت uuid → [instances] + گزارش تکراری‌ها.
      # تکراری یعنی کاربر یک یونیت را کپی کرده است (persistent_id جدید، uuid یکسان)؛
      # اصلاح خاموش ممنوع است — فقط گزارش تا App تصمیم بگیرد (سند + تأیید کاربر).
      def scan_instances(model)
        map = Hash.new { |h, k| h[k] = [] }
        walk(model.entities) do |instance|
          id = uuid_of(instance)
          map[id] << instance if id
        end
        duplicates = map.select { |_, list| list.size > 1 }
        {
          'map' => map,
          'duplicates' => duplicates.keys,
          'persistent_ids' => map.transform_values { |l| l.map(&:persistent_id) }
        }
      end

      def walk(entities, &block)
        entities.each do |e|
          next unless e.respond_to?(:definition) # ComponentInstance / Group

          block.call(e)
          walk(e.definition.entities, &block)
        end
      end

      # ---------- Snapshot پروژه ----------
      def snapshot_index(model)
        raw = model.get_attribute(DICT, KEY_SNAP_IDX)
        raw ? JSON.parse(raw) : []
      rescue JSON::ParserError
        App::Log.error('snapshot index corrupt; treating as empty')
        []
      end

      def save_snapshot(model, name)
        state = load_document(model)
        unless state && state['ok']
          raise Kalaxa::ValidationError, 'برای Snapshot ابتدا باید سند معتبر ذخیره شده باشد'
        end

        id = Domain::Entities.new_id
        record = JSON.generate(
          'id' => id, 'name' => name.to_s,
          'created_at' => Time.now.utc.strftime('%Y-%m-%dT%H:%M:%SZ'),
          'envelope' => raw_document(model)
        )
        index = snapshot_index(model) << id
        with_operation(model, 'Kalaxa: ثبت Snapshot') do
          model.set_attribute(DICT, SNAP_PREFIX + id, record)
          model.set_attribute(DICT, KEY_SNAP_IDX, JSON.generate(index))
        end
        App::Log.info('snapshot saved', id: id, name: name)
        id
      end

      def list_snapshots(model)
        snapshot_index(model).filter_map do |id|
          raw = model.get_attribute(DICT, SNAP_PREFIX + id)
          next nil unless raw

          rec = JSON.parse(raw)
          { 'id' => rec['id'], 'name' => rec['name'], 'created_at' => rec['created_at'] }
        rescue JSON::ParserError
          nil
        end
      end

      def restore_snapshot(model, id)
        raw = model.get_attribute(DICT, SNAP_PREFIX + id)
        raise Kalaxa::ValidationError, "snapshot یافت نشد: #{id}" unless raw

        envelope = JSON.parse(raw)['envelope']
        state = Persistence::Serializer.safe_load(envelope)
        unless state['ok']
          raise CorruptDataError, "snapshot خراب است: #{state['error']['message']}"
        end

        with_operation(model, 'Kalaxa: بازیابی Snapshot') do
          model.set_attribute(DICT, KEY_DOC, envelope)
        end
        App::Log.info('snapshot restored', id: id)
        state['doc']
      end
    end
  end
end
