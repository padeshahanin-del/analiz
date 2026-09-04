# frozen_string_literal: true

# رینگ B — مرحلهٔ ۰۲ داخل SketchUp با TestUp 2.
# پوشش تست‌های اجباری نیازمند اسکچاپ: ذخیره/بازیابی، بستن/بازکردن فایل،
# سازگاری Undo، کپی یونیت (uuid تکراری).
require 'testup/testcase'

class TC_Kalaxa_Phase02 < TestUp::TestCase
  Store = Kalaxa::Adapter::Store
  Doc   = Kalaxa::Domain::Document
  Ent   = Kalaxa::Domain::Entities

  def sample_doc
    doc = Doc.blank(project_name: 'TestUp')
    space = Doc.add(doc, 'spaces', Ent.space(name: 'فضا', width_mm: 3000, depth_mm: 600, height_mm: 2600))
    mat = Doc.add(doc, 'materials', Ent.material(name: 'MDF', kind: 'sheet', thickness_mm: 16))
    Doc.add(doc, 'units', Ent.unit(space_id: space['id'], name: 'زمینی', kind: 'base',
                                   width_mm: 600, depth_mm: 560, height_mm: 720))
    doc
  end

  def test_save_and_load_document_in_model
    model = Sketchup.active_model
    doc = sample_doc
    Store.save_document(model, doc)
    state = Store.load_document(model)
    assert state['ok'], state.inspect
    assert Doc.semantically_equal?(doc, state['doc'])
  end

  def test_undo_restores_previous_document_and_geometry_together
    model = Sketchup.active_model
    doc1 = sample_doc
    Store.save_document(model, doc1)
    doc2 = Doc.deep_dup(doc1)
    doc2['entities']['units'].first['width_mm'] = 900
    Store.save_document(model, doc2)
    Sketchup.undo
    state = Store.load_document(model)
    assert state['ok']
    assert_equal 600, state['doc']['entities']['units'].first['width_mm'],
                 'Undo باید سند قبلی را برگرداند (سازگاری Undo)'
  end

  def test_copied_unit_instance_reports_duplicate_uuid
    model = Sketchup.active_model
    uuid = Ent.new_id
    Store.with_operation(model, 'KY test: make + copy') do
      defn = model.definitions.add("KY_TEST_#{uuid[0, 8]}")
      defn.entities.add_cpoint(Geom::Point3d.new(0, 0, 0))
      i1 = model.entities.add_instance(defn, Geom::Transformation.new)
      Store.tag_instance(i1, uuid)
      model.entities.add_instance(i1.definition, Geom::Transformation.new([50, 0, 0]))
        .set_attribute(Store::DICT, Store::ATTR_UUID, uuid) # شبیه‌سازی Paste
    end
    scan = Store.scan_instances(model)
    assert_includes scan['duplicates'], uuid
    assert_equal 2, scan['persistent_ids'][uuid].size
  ensure
    Sketchup.undo
  end

  def test_snapshot_save_list_restore
    model = Sketchup.active_model
    doc1 = sample_doc
    Store.save_document(model, doc1)
    snap_id = Store.save_snapshot(model, 'قبل از تغییر')
    doc2 = Doc.deep_dup(doc1)
    doc2['entities']['units'].first['name'] = 'تغییر یافته'
    Store.save_document(model, doc2)
    assert(Store.list_snapshots(model).any? { |s| s['id'] == snap_id })
    restored = Store.restore_snapshot(model, snap_id)
    assert_equal 'زمینی', restored['entities']['units'].first['name']
  end

  def test_reopen_file_persists_document
    # ذخیره در فایل، بازکردن مدل جدید، بازکردن دوبارهٔ فایل — بازیابی بدون تغییر معنایی.
    model = Sketchup.active_model
    doc = sample_doc
    Store.save_document(model, doc)
    path = File.join(Dir.tmpdir, 'ky_phase02_reopen.skp')
    assert model.save(path), 'ذخیرهٔ فایل ناموفق'
    Sketchup.file_new
    assert Sketchup.open_file(path), 'بازکردن فایل ناموفق'
    state = Store.load_document(Sketchup.active_model)
    assert state['ok']
    assert Kalaxa::Domain::Document.semantically_equal?(doc, state['doc']),
           'داده پس از بستن/بازکردن فایل تغییر معنایی کرده است'
  end

  def test_other_plugin_dictionaries_untouched
    model = Sketchup.active_model
    model.set_attribute('some_other_plugin', 'key', 'value')
    Store.save_document(model, sample_doc)
    assert_equal 'value', model.get_attribute('some_other_plugin', 'key')
  end
end
