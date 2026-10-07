# Rig an UNRIGGED rabbit GLB (e.g. from Tripo) for Far Field: normalise -> armature (ASSETS-3D bone names) -> automatic weights
# -> test clips idle_breathe + hop_run -> GLB. Usage (macOS):
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python docs/farfield/tools/rig.py -- in.glb out.glb [--keep-colour]
# The base colour is repainted to the game's pale warm grey #c4beb4 (ASSETS-3D.md, CHARACTERS.md section 2) unless --keep-colour:
# the game keeps a model's own colour, and a generated texture can come out white or brown.
# Then look at it in the game (index.html?rabbit=<file under models/>) and drop clips that look worse than the code animation.
import bpy, sys, math, mathutils as mu
args = [a for a in sys.argv[sys.argv.index('--') + 1:]] if '--' in sys.argv else sys.argv[-2:]
keep_colour = '--keep-colour' in args; args = [a for a in args if not a.startswith('--')]
src, out = args[0], args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes=[o for o in bpy.data.objects if o.type=='MESH']
for o in bpy.data.objects: o.select_set(o in meshes)
bpy.context.view_layer.objects.active=meshes[0]
if len(meshes)>1: bpy.ops.object.join()
m=bpy.context.active_object
if not keep_colour:   # one matte colour: #c4beb4 (sRGB) in linear, no base-colour texture
    for ms in m.material_slots:
        mt = ms.material
        if not mt or not mt.use_nodes: continue
        for nd in mt.node_tree.nodes:
            if nd.type == 'BSDF_PRINCIPLED':
                for ln in list(nd.inputs['Base Color'].links): mt.node_tree.links.remove(ln)
                nd.inputs['Base Color'].default_value = (0.552, 0.515, 0.456, 1.0)
    print('base colour repainted to #c4beb4')
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM'); bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
nv=len(m.data.vertices); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=1e-5); bpy.ops.object.mode_set(mode='OBJECT'); print('welded', nv, '->', len(m.data.vertices))
# normalise: 0.40 m nose to tail along Y, standing on z=0, centred in x and y
vs=[m.matrix_world@v.co for v in m.data.vertices]
mn=mu.Vector((min(v.x for v in vs),min(v.y for v in vs),min(v.z for v in vs))); mx=mu.Vector((max(v.x for v in vs),max(v.y for v in vs),max(v.z for v in vs)))
s=0.40/(mx.y-mn.y)
for v in m.data.vertices:
    p=m.matrix_world@v.co; v.co=mu.Vector(((p.x-(mn.x+mx.x)/2)*s,(p.y-(mn.y+mx.y)/2)*s,(p.z-mn.z)*s))
m.matrix_world=mu.Matrix()
L=0.40; H=(mx.z-mn.z)*s
print('normalised: length 0.40 m, height %.3f m, tris %d' % (H, sum(len(p.vertices)-2 for p in m.data.polygons)))
# bones as fractions of the reference proportions (nose at y=-L/2, tail +L/2; heights scaled by H/0.32)
k=H/0.32
def P(x,y,z): return mu.Vector((x, y*L/0.395, z*k))
B=[('root',None,(0,0,0),(0,0,0.05)),
 ('hips','root',(0,0.09,0.12),(0,0.02,0.13)),('spine','hips',(0,0.02,0.13),(0,-0.04,0.13)),('chest','spine',(0,-0.04,0.13),(0,-0.10,0.14)),
 ('neck','chest',(0,-0.10,0.14),(0,-0.13,0.17)),('head','neck',(0,-0.13,0.17),(0,-0.19,0.16)),('tail','hips',(0,0.15,0.13),(0,0.19,0.14))]
for sd,sx in (('L',1),('R',-1)):
    B+= [(f'ear_{sd}_01','head',(0.022*sx,-0.12,0.20),(0.022*sx,-0.117,0.235)),(f'ear_{sd}_02',f'ear_{sd}_01',(0.022*sx,-0.117,0.235),(0.022*sx,-0.115,0.27)),(f'ear_{sd}_03',f'ear_{sd}_02',(0.022*sx,-0.115,0.27),(0.022*sx,-0.113,0.31)),
         (f'front_upper_{sd}','chest',(0.03*sx,-0.075,0.10),(0.03*sx,-0.075,0.06)),(f'front_lower_{sd}',f'front_upper_{sd}',(0.03*sx,-0.075,0.06),(0.03*sx,-0.078,0.022)),(f'front_paw_{sd}',f'front_lower_{sd}',(0.03*sx,-0.078,0.022),(0.03*sx,-0.095,0.006)),
         (f'hind_upper_{sd}','hips',(0.05*sx,0.05,0.12),(0.05*sx,0.02,0.06)),(f'hind_lower_{sd}',f'hind_upper_{sd}',(0.05*sx,0.02,0.06),(0.05*sx,0.12,0.025)),(f'hind_foot_{sd}',f'hind_lower_{sd}',(0.05*sx,0.12,0.02),(0.05*sx,0.02,0.008))]
ad=bpy.data.armatures.new('rig'); ar=bpy.data.objects.new('rabbit_rig',ad); bpy.context.collection.objects.link(ar)
bpy.context.view_layer.objects.active=ar; bpy.ops.object.mode_set(mode='EDIT')
for n,par,h,t in B:
    b=ad.edit_bones.new(n); b.head=P(*h); b.tail=P(*t); b.roll=0
    if par: b.parent=ad.edit_bones[par]; b.use_connect=False
bpy.ops.object.mode_set(mode='OBJECT')
for o in bpy.data.objects: o.select_set(False)
m.select_set(True); ar.select_set(True); bpy.context.view_layer.objects.active=ar
SC=1.0
for o in (m,ar): o.scale=(SC,SC,SC)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
unw=sum(1 for v in m.data.vertices if not v.groups)
if unw > len(m.data.vertices)*0.01:
    print('heat weighting incomplete (%d unweighted): weighting a voxel proxy and transferring' % unw)
    for g in list(m.vertex_groups): m.vertex_groups.remove(g)
    bpy.ops.object.select_all(action='DESELECT'); m.select_set(True); bpy.context.view_layer.objects.active=m; bpy.ops.object.duplicate(); px=bpy.context.active_object
    for md in list(px.modifiers): px.modifiers.remove(md)
    r=px.modifiers.new('rm','REMESH'); r.mode='VOXEL'; r.voxel_size=0.04; bpy.ops.object.modifier_apply(modifier='rm')
    bpy.ops.object.select_all(action='DESELECT'); px.select_set(True); ar.select_set(True); bpy.context.view_layer.objects.active=ar; bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    for g in px.vertex_groups: m.vertex_groups.new(name=g.name)
    dt=m.modifiers.new('dt','DATA_TRANSFER'); dt.object=px; dt.use_vert_data=True; dt.data_types_verts={'VGROUP_WEIGHTS'}; dt.vert_mapping='POLYINTERP_NEAREST'; dt.layers_vgroup_select_src='ALL'; dt.layers_vgroup_select_dst='NAME'
    bpy.context.view_layer.objects.active=m; bpy.ops.object.modifier_move_to_index(modifier='dt', index=0); bpy.ops.object.modifier_apply(modifier='dt')
    bpy.data.objects.remove(px)
# keep the rig at 10x and scale the armature OBJECT by 1/10 (exported as the root node's scale): no apply on a skinned rig
bpy.ops.object.select_all(action='DESELECT'); m.select_set(True); bpy.context.view_layer.objects.active=m
bpy.ops.object.vertex_group_limit_total(limit=4); bpy.ops.object.vertex_group_normalize_all(lock_active=False)
ar.scale=(1/SC,1/SC,1/SC); bpy.ops.object.select_all(action="DESELECT"); ar.select_set(True); bpy.context.view_layer.objects.active=ar
vg=len(m.vertex_groups); unw=sum(1 for v in m.data.vertices if not v.groups)
print('automatic weights: %d groups, %d of %d vertices unweighted' % (vg, unw, len(m.data.vertices)))
# test clips (bend around each bone's local X; sign checked by rendering)
bpy.context.scene.render.fps=30
def act(name, n, keys):
    a=bpy.data.actions.new(name); ar.animation_data_create(); ar.animation_data.action=a
    bpy.ops.object.mode_set(mode='POSE')
    for pb in ar.pose.bones: pb.rotation_mode='XYZ'
    for f,pose in keys:
        for pb in ar.pose.bones: pb.rotation_euler=(0,0,0); pb.location=(0,0,0)
        for bn,(rx,dz) in pose.items():
            pb=ar.pose.bones[bn]; pb.rotation_euler=(math.radians(rx),0,0)
            if dz: pb.location=(0,dz*SC,0)
        for pb in ar.pose.bones: pb.keyframe_insert('rotation_euler',frame=f); pb.keyframe_insert('location',frame=f)
    bpy.ops.object.mode_set(mode='OBJECT')
    tr=ar.animation_data.nla_tracks.new(); tr.name=name; tr.strips.new(name,1,a); ar.animation_data.action=None
def lr(d):
    o={}
    for k,v in d.items():
        if k.endswith('_X'): o[k[:-2]+'_L']=v; o[k[:-2]+'_R']=v
        else: o[k]=v
    return o
act('idle_breathe',60,[(1,lr({'chest':(0,0),'spine':(0,0)})),(30,lr({'chest':(-2.5,0),'spine':(1.5,0),'head':(2,0),'ear_L_01':(-8,0)})),(61,lr({'chest':(0,0),'spine':(0,0)}))])
G={'hind_upper_X':(45,0),'hind_lower_X':(-35,0),'hind_foot_X':(25,0),'front_upper_X':(-35,0),'hips':(-12,0.0),'chest':(10,0),'head':(-6,0)}
PU={'hind_upper_X':(-35,0),'hind_lower_X':(25,0),'hind_foot_X':(-35,0),'front_upper_X':(15,0),'hips':(6,0.02),'chest':(-6,0)}
EX={'hind_upper_X':(-55,0),'hind_lower_X':(40,0),'hind_foot_X':(-45,0),'front_upper_X':(45,0),'front_lower_X':(-15,0),'hips':(10,0.035),'chest':(-10,0),'head':(6,0)}
LD={'hind_upper_X':(5,0),'hind_lower_X':(-5,0),'front_upper_X':(10,0),'front_lower_X':(10,0),'hips':(0,0.015),'chest':(4,0),'ear_L_01':(-15,0),'ear_R_01':(-15,0)}
act('hop_run',10,[(1,lr(G)),(4,lr(PU)),(6,lr(EX)),(8,lr(LD)),(11,lr(G))])
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_skins=True)
print('exported', out)
