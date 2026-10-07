# UNRIGGED stand-in rabbit (like a Tripo export): spheres -> voxel remesh -> one closed mesh. Blender: -Y forward, Z up, metres.
# Usage: /Applications/Blender.app/Contents/MacOS/Blender -b --python docs/farfield/tools/proxy.py -- out.glb   (then rig.py on it:
# a connected test rabbit to try the model path before Josh's Tripo rabbit arrives; the result is a test file, never committed)
import bpy, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
parts=[]
def el(x,y,z,sx,sy,sz):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, location=(x,y,z)); o=bpy.context.active_object; o.scale=(sx,sy,sz); parts.append(o)
el(0, 0.06, 0.11, 0.085,0.10,0.095)    # haunch (folded)
el(0,-0.04, 0.115,0.065,0.10,0.07)     # chest/back
el(0,-0.14, 0.165,0.045,0.055,0.048)   # head
el(0,-0.185,0.15, 0.025,0.03,0.025)    # muzzle
for s in (-1,1):
    el(0.022*s,-0.115,0.25,0.012,0.018,0.07)  # ears
    el(0.05*s, 0.075,0.022,0.022,0.06,0.018)  # hind foot flat
    el(0.05*s, 0.05, 0.085,0.04,0.055,0.05)   # thigh
    el(0.03*s,-0.075,0.045,0.014,0.016,0.045) # foreleg
el(0, 0.16, 0.13, 0.03,0.03,0.03)              # tail
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active=parts[0]; bpy.ops.object.transform_apply(scale=True); bpy.ops.object.join()
m=bpy.context.active_object; r=m.modifiers.new('rm','REMESH'); r.mode='VOXEL'; r.voxel_size=0.006; bpy.ops.object.modifier_apply(modifier='rm')
d=m.modifiers.new('dc','DECIMATE'); d.ratio=0.5; bpy.ops.object.modifier_apply(modifier='dc')
mat=bpy.data.materials.new('fur'); mat.diffuse_color=(0.77,0.75,0.71,1); m.data.materials.append(mat)
print('proxy tris', sum(len(p.vertices)-2 for p in m.data.polygons))
bpy.ops.export_scene.gltf(filepath=sys.argv[-1], export_format='GLB', export_yup=True)
