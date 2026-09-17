import bpy,sys,bmesh,collections
src=sys.argv[sys.argv.index('--')+1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src,merge_vertices=True)
for o in bpy.data.objects:
    if o.type!='MESH':continue
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=0.0004)
    be=[e for e in bm.edges if e.is_boundary]
    nm=[e for e in bm.edges if not e.is_manifold and not e.is_boundary]
    wire=[e for e in bm.edges if e.is_wire]
    # loops
    adj=collections.defaultdict(list)
    for e in be:
        a,b=e.verts;adj[a.index].append(b.index);adj[b.index].append(a.index)
    seen=set();sizes=[]
    for v in adj:
        if v in seen:continue
        st=[v];n=0
        while st:
            x=st.pop()
            if x in seen:continue
            seen.add(x);n+=1;st+=adj[x]
        sizes.append(n)
    sizes.sort()
    # islands
    print('PROBE',o.name,'faces',len(bm.faces),'boundary',len(be),'nonmanifold',len(nm),'loops',len(sizes),'sizes',collections.Counter(sizes).most_common(12),'max',sizes[-5:] if sizes else 0)
    bm.free()
