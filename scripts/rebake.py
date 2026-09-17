# Decimate, then give the low mesh a FRESH padded UV atlas and bake the original's colour onto it.
# Tripo atlases are a patchwork of tiny charts with no padding: decimating them drags UVs across chart borders,
# which shows as black/white specks on characters and cracks on buildings. A rebake cannot have that fault.
# Usage: blender -b --python rebake.py -- src dst target_tris tex_size jpeg_q
import bpy,sys,os,bmesh
a=sys.argv[sys.argv.index('--')+1:];src,dst,target,tex,q=a[0],a[1],int(a[2]),int(a[3]),int(a[4])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src,merge_vertices=True)
for o in list(bpy.data.objects):
    if o.type=='MESH' and 'Icosphere' in o.name: bpy.data.objects.remove(o)
arm=next((o for o in bpy.data.objects if o.type=='ARMATURE'),None)
meshes=[o for o in bpy.data.objects if o.type=='MESH']
def act(o):
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
if len(meshes)>1:
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join()
hi=[o for o in bpy.data.objects if o.type=='MESH'][0]
tris0=sum(len(p.vertices)-2 for p in hi.data.polygons)
# the low copy
lo=hi.copy();lo.data=hi.data.copy();lo.name='lo'
for c in hi.users_collection:c.objects.link(lo)
act(lo)
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=0.0004);bpy.ops.object.mode_set(mode='OBJECT')
total=sum(len(p.vertices)-2 for p in lo.data.polygons)
ratio=min(1.0,target/max(total,1))
if ratio<1.0:
    d=lo.modifiers.new('dec','DECIMATE');d.ratio=ratio;d.use_collapse_triangulate=True
    while lo.modifiers.find('dec')>0: bpy.ops.object.modifier_move_up(modifier='dec')
    bpy.ops.object.modifier_apply(modifier='dec')
# stitch pinholes shut: Tripo meshes carry hundreds of 2-7 vertex holes; pull each tiny boundary ring to its centre
import collections
from mathutils import Vector
def stitch(me,maxring=10):
    closed=0
    for _ in range(5):
        bm=bmesh.new();bm.from_mesh(me);bm.verts.ensure_lookup_table()
        adj=collections.defaultdict(set)
        for e in bm.edges:
            if e.is_boundary:
                a,b=e.verts;adj[a.index].add(b.index);adj[b.index].add(a.index)
        seen=set();n=0;rings=[]
        for v in list(adj):
            if v in seen:continue
            st=[v];comp=[]
            while st:
                x=st.pop()
                if x in seen:continue
                seen.add(x);comp.append(x);st+=list(adj[x])
            if 1<len(comp)<=maxring: rings.append([bm.verts[i] for i in comp])
        for vs in rings:
            vs=[w for w in vs if w.is_valid]
            if len(vs)>1:
                c=sum((w.co for w in vs),Vector())/len(vs)
                bmesh.ops.pointmerge(bm,verts=vs,merge_co=c);n+=1
        bmesh.ops.dissolve_degenerate(bm,edges=bm.edges,dist=1e-6)
        bm.to_mesh(me);bm.free();closed+=n
        if n==0:break
    return closed
print('STITCHED',stitch(lo.data))
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.fill_holes(sides=12);bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.quads_convert_to_tris()
# fresh atlas with real padding between charts
while len(lo.data.uv_layers)>0: lo.data.uv_layers.remove(lo.data.uv_layers[0])
lo.data.uv_layers.new(name='UVMap')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=0.004,area_weight=0.0,correct_aspect=True,scale_to_bounds=False)
bpy.ops.object.mode_set(mode='OBJECT')
# originals glow with their own colour so metal/rough settings cannot darken the bake
for m in hi.data.materials:
    if not m or not m.use_nodes: continue
    nt=m.node_tree;out=next(n for n in nt.nodes if n.type=='OUTPUT_MATERIAL')
    bs=next((n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'),None)
    em=nt.nodes.new('ShaderNodeEmission')
    if bs and bs.inputs['Base Color'].is_linked: nt.links.new(bs.inputs['Base Color'].links[0].from_socket,em.inputs['Color'])
    elif bs: em.inputs['Color'].default_value=bs.inputs['Base Color'].default_value
    nt.links.new(em.outputs[0],out.inputs['Surface'])
img=bpy.data.images.new('baked',tex,tex,alpha=False)
mat=bpy.data.materials.new('baked');mat.use_nodes=True;nt=mat.node_tree
tn=nt.nodes.new('ShaderNodeTexImage');tn.image=img;nt.nodes.active=tn;tn.select=True
bs=next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED');bs.inputs['Metallic'].default_value=0;bs.inputs['Roughness'].default_value=1
lo.data.materials.clear();lo.data.materials.append(mat)
if arm: arm.data.pose_position='REST'
sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=1;sc.cycles.use_denoising=False
size=max(hi.dimensions) or 1
b=sc.render.bake;b.use_selected_to_active=True;b.cage_extrusion=size*.006;b.max_ray_distance=size*.03;b.margin=12;b.use_clear=True
bpy.ops.object.select_all(action='DESELECT');hi.select_set(True);lo.select_set(True);bpy.context.view_layer.objects.active=lo
bpy.ops.object.bake(type='EMIT')
nt.links.new(tn.outputs['Color'],bs.inputs['Base Color'])
# despeckle: stray rays through pinholes in the original leave 1-3 px dots; swap any pixel far from its 3x3 median (3x3 keeps thin drawn lines like the mouth)
import numpy as np
px=np.empty(tex*tex*4,dtype=np.float32);img.pixels.foreach_get(px);px=px.reshape(tex,tex,4)
for _ in range(1):
    fixed=0
    med=np.empty((tex,tex,3),dtype=np.float32)
    for c in range(3):
        ch=np.pad(px[:,:,c],1,mode='edge')
        st=np.stack([ch[dy:dy+tex,dx:dx+tex] for dy in range(3) for dx in range(3)],axis=0)
        med[:,:,c]=np.partition(st,4,axis=0)[4];del st
    bad=np.abs(px[:,:,:3]-med).max(axis=2)>0.1
    px[:,:,:3][bad]=med[bad];fixed+=int(bad.sum())
    print('DESPECKLE',fixed)
img.pixels.foreach_set(px.ravel());img.update()
img.filepath_raw=dst+'.bake.png';img.file_format='PNG';img.save()
if arm: arm.data.pose_position='POSE'
bpy.data.objects.remove(hi)
bm=bmesh.new();bm.from_mesh(lo.data);be=sum(1 for e in bm.edges if e.is_boundary);te=len(bm.edges);bm.free()
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=dst,export_format='GLB',export_apply=not arm,export_image_format='JPEG',export_jpeg_quality=q,export_yup=True,export_animations=True,export_skins=True)
after=sum(len(p.vertices)-2 for p in lo.data.polygons)
print('DONE',os.path.basename(src),tris0,'->',after,'rigged' if arm else '','boundary %.1f%%'%(100*be/max(te,1)),os.path.getsize(dst)//1024,'KB')
