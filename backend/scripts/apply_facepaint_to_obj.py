from __future__ import annotations

import argparse
import sys
from pathlib import Path


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def blender_script_args() -> list[str]:
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1 :]
    return sys.argv[1:]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Apply a UV facepaint PNG to an OBJ face mesh and export a GLB mask."
    )
    parser.add_argument("--obj", required=True, type=Path, help="Input OBJ face mesh path")
    parser.add_argument("--texture", required=True, type=Path, help="Input UV facepaint PNG path")
    parser.add_argument("--out", required=True, type=Path, help="Output GLB path")
    parser.add_argument("--normal-map", type=Path, help="Optional detail normal map PNG path")
    parser.add_argument("--thickness", default=0.015, type=float, help="Solidify shell thickness")
    parser.add_argument("--bevel", default=0.003, type=float, help="Soft edge bevel width")
    parser.add_argument("--roughness", default=0.75, type=float, help="Material roughness")
    return parser.parse_args(argv if argv is not None else blender_script_args())


def require_blender_modules():
    try:
        import bpy  # type: ignore
        from mathutils import Vector  # type: ignore
    except ModuleNotFoundError:
        fail(
            "This script must be run with Blender Python, for example: "
            "blender -b --python backend/scripts/apply_facepaint_to_obj.py -- "
            "--obj backend/samples/raw_face.obj --texture public/legacy/faces_uv/guanyu_uv.png "
            "--out public/generated_masks/demo_guanyu_mask.glb"
        )
    return bpy, Vector


def resolve_existing_file(path: Path, label: str) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.exists():
        fail(f"{label} file not found: {resolved}")
    if not resolved.is_file():
        fail(f"{label} path is not a file: {resolved}")
    return resolved


def resolve_output_path(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    try:
        resolved.parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        fail(f"Could not create output directory {resolved.parent}: {exc}")
    return resolved


def clear_scene(bpy) -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

    data_collections = [
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
    ]
    if hasattr(bpy.data, "textures"):
        data_collections.append(bpy.data.textures)

    for data_collection in data_collections:
        for block in list(data_collection):
            if block.users == 0:
                data_collection.remove(block)


def import_obj(bpy, obj_path: Path) -> None:
    before_objects = set(bpy.data.objects)

    if hasattr(bpy.ops.wm, "obj_import"):
        bpy.ops.wm.obj_import(filepath=str(obj_path))
    elif hasattr(bpy.ops, "import_scene") and hasattr(bpy.ops.import_scene, "obj"):
        bpy.ops.import_scene.obj(filepath=str(obj_path))
    else:
        fail("OBJ import operator is not available in this Blender installation")

    imported = [obj for obj in bpy.data.objects if obj not in before_objects]
    if not imported:
        fail(f"No objects were imported from OBJ: {obj_path}")


def mesh_score(obj) -> tuple[int, float]:
    mesh = obj.data
    vertex_count = len(mesh.vertices)
    dims = obj.dimensions
    volume_hint = float(dims.x * dims.y * dims.z)
    return vertex_count, volume_hint


def find_main_mesh(bpy):
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        fail("No mesh object found after OBJ import")

    main_mesh = max(meshes, key=mesh_score)
    if len(main_mesh.data.vertices) == 0:
        fail(f"Imported mesh has no vertices: {main_mesh.name}")
    return main_mesh


def object_world_bounds(obj, Vector):
    bpy_matrix = obj.matrix_world
    corners = [bpy_matrix @ Vector(corner) for corner in obj.bound_box]
    min_corner = Vector(
        (
            min(corner.x for corner in corners),
            min(corner.y for corner in corners),
            min(corner.z for corner in corners),
        )
    )
    max_corner = Vector(
        (
            max(corner.x for corner in corners),
            max(corner.y for corner in corners),
            max(corner.z for corner in corners),
        )
    )
    return min_corner, max_corner


def center_and_scale_object(bpy, obj, Vector, target_size: float = 2.0) -> None:
    bpy.context.view_layer.update()
    min_corner, max_corner = object_world_bounds(obj, Vector)
    center = (min_corner + max_corner) * 0.5
    obj.location -= center
    bpy.context.view_layer.update()

    dimensions = obj.dimensions
    max_dimension = max(float(dimensions.x), float(dimensions.y), float(dimensions.z))
    if max_dimension <= 0:
        fail(f"Imported mesh has invalid dimensions: {obj.name}")

    scale_factor = target_size / max_dimension
    obj.scale = (obj.scale.x * scale_factor, obj.scale.y * scale_factor, obj.scale.z * scale_factor)

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.context.view_layer.update()


def ensure_uv_layer(obj) -> tuple[bool, bool]:
    mesh = obj.data
    active_uv = mesh.uv_layers.active
    if active_uv is not None and len(active_uv.data) > 0:
        return True, False

    uv_layer = mesh.uv_layers.new(name="FallbackFrontProjection")
    vertices = mesh.vertices
    min_x = min(vertex.co.x for vertex in vertices)
    max_x = max(vertex.co.x for vertex in vertices)
    min_y = min(vertex.co.y for vertex in vertices)
    max_y = max(vertex.co.y for vertex in vertices)
    width = max(max_x - min_x, 1e-8)
    height = max(max_y - min_y, 1e-8)

    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            co = vertices[vertex_index].co
            u = (co.x - min_x) / width
            v = (co.y - min_y) / height
            uv_layer.data[loop_index].uv = (u, v)

    mesh.uv_layers.active = uv_layer
    return False, True


def create_facepaint_material(
    bpy,
    texture_path: Path,
    roughness: float,
    normal_map_path: Path | None = None,
):
    material = bpy.data.materials.new(name="FacePaintMaterial")
    material.use_nodes = True
    if hasattr(material, "blend_method"):
        material.blend_method = "BLEND"
    if hasattr(material, "use_screen_refraction"):
        material.use_screen_refraction = False

    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        fail("Could not find Principled BSDF node for material setup")

    image_node = nodes.new(type="ShaderNodeTexImage")
    image_node.name = "FacePaintTexture"
    try:
        image_node.image = bpy.data.images.load(str(texture_path))
    except RuntimeError as exc:
        fail(f"Could not load texture image {texture_path}: {exc}")

    if "Base Color" in bsdf.inputs:
        links.new(image_node.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        fail("Principled BSDF node has no Base Color input")

    if "Alpha" in image_node.outputs and "Alpha" in bsdf.inputs:
        links.new(image_node.outputs["Alpha"], bsdf.inputs["Alpha"])

    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = max(0.0, min(float(roughness), 1.0))

    if normal_map_path and "Normal" in bsdf.inputs:
        normal_texture = nodes.new(type="ShaderNodeTexImage")
        normal_texture.name = "FacePaintDetailNormal"
        try:
            normal_texture.image = bpy.data.images.load(str(normal_map_path))
        except RuntimeError as exc:
            fail(f"Could not load normal map image {normal_map_path}: {exc}")
        try:
            normal_texture.image.colorspace_settings.name = "Non-Color"
        except (AttributeError, TypeError):
            pass

        normal_node = nodes.new(type="ShaderNodeNormalMap")
        normal_node.name = "FacePaintNormalMap"
        if "Strength" in normal_node.inputs:
            normal_node.inputs["Strength"].default_value = 0.28
        links.new(normal_texture.outputs["Color"], normal_node.inputs["Color"])
        links.new(normal_node.outputs["Normal"], bsdf.inputs["Normal"])

    return material


def assign_material(obj, material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0


def shade_smooth(bpy, obj) -> None:
    for polygon in obj.data.polygons:
        polygon.use_smooth = True

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.shade_smooth()
    except RuntimeError:
        pass


def apply_modifier_if_possible(bpy, obj, modifier_name: str) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.modifier_apply(modifier=modifier_name)
    except RuntimeError as exc:
        print(f"WARNING: Could not apply modifier {modifier_name}: {exc}", file=sys.stderr)


def add_mask_modifiers(bpy, obj, thickness: float, bevel_width: float) -> None:
    solidify = obj.modifiers.new(name="MaskThickness", type="SOLIDIFY")
    solidify.thickness = max(float(thickness), 0.0)
    solidify.offset = 0.0
    solidify.use_quality_normals = True

    if bevel_width > 0:
        bevel = obj.modifiers.new(name="SoftMaskEdge", type="BEVEL")
        bevel.width = float(bevel_width)
        bevel.segments = 2
        bevel.profile = 0.5

    try:
        weighted_normal = obj.modifiers.new(name="SoftMaskNormals", type="WEIGHTED_NORMAL")
        weighted_normal.keep_sharp = True
    except TypeError:
        pass

    for modifier in list(obj.modifiers):
        apply_modifier_if_possible(bpy, obj, modifier.name)


def export_glb(bpy, obj, out_path: Path) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    export_kwargs = {
        "filepath": str(out_path),
        "export_format": "GLB",
        "use_selection": True,
    }
    try:
        bpy.ops.export_scene.gltf(**export_kwargs)
    except TypeError:
        export_kwargs.pop("use_selection", None)
        bpy.ops.export_scene.gltf(**export_kwargs)
    except RuntimeError as exc:
        fail(f"Could not export GLB {out_path}: {exc}")


def main() -> None:
    args = parse_args()
    obj_path = resolve_existing_file(args.obj, "OBJ input")
    texture_path = resolve_existing_file(args.texture, "Texture input")
    normal_map_path = resolve_existing_file(args.normal_map, "Normal map input") if args.normal_map else None
    out_path = resolve_output_path(args.out)

    bpy, Vector = require_blender_modules()

    print(f"OBJ input: {obj_path}")
    print(f"Texture input: {texture_path}")
    if normal_map_path:
        print(f"Normal map input: {normal_map_path}")

    clear_scene(bpy)
    import_obj(bpy, obj_path)
    mesh_obj = find_main_mesh(bpy)
    center_and_scale_object(bpy, mesh_obj, Vector)

    had_uv, used_fallback_uv = ensure_uv_layer(mesh_obj)
    print(f"Existing UV layer: {'yes' if had_uv else 'no'}")
    print(f"Fallback UV used: {'yes' if used_fallback_uv else 'no'}")

    material = create_facepaint_material(bpy, texture_path, args.roughness, normal_map_path)
    assign_material(mesh_obj, material)
    shade_smooth(bpy, mesh_obj)
    add_mask_modifiers(bpy, mesh_obj, args.thickness, args.bevel)
    export_glb(bpy, mesh_obj, out_path)

    print(f"Output GLB: {out_path}")
    print("Done")


if __name__ == "__main__":
    main()
