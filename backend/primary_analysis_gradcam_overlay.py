import argparse
import logging
import os
import sys
import math
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import torch


logger = logging.getLogger(__name__)


class _GradCamCapture:
    def __init__(self, module: torch.nn.Module):
        self._module = module
        self._handle: Optional[torch.utils.hooks.RemovableHandle] = None
        self.activations: Optional[torch.Tensor] = None
        self.gradients: Optional[torch.Tensor] = None

    def _save_gradient(self, grad: torch.Tensor) -> None:
        self.gradients = grad

    def _forward_hook(self, _module: torch.nn.Module, _inputs, output: torch.Tensor) -> None:
        self.activations = output
        self.gradients = None
        output.register_hook(self._save_gradient)

    def __enter__(self):
        self._handle = self._module.register_forward_hook(self._forward_hook)
        return self

    def __exit__(self, exc_type, exc, tb):
        if self._handle is not None:
            self._handle.remove()


def _ensure_backend_cwd() -> Path:
    backend_dir = Path(__file__).resolve().parent
    os.chdir(backend_dir)
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))
    return backend_dir


def _resolve_instance_id(study_uid: Optional[str], orthanc_instance_id: Optional[str], instance_index: int) -> str:
    if orthanc_instance_id:
        return orthanc_instance_id

    if not study_uid:
        raise ValueError("Provide either --study-uid or --orthanc-instance-id")

    from app.helpers.inference_runtime.inference_functions import fetch_orthanc_instance_ids_from_study

    ids = fetch_orthanc_instance_ids_from_study(study_uid)
    if not ids:
        raise RuntimeError(f"No Orthanc instances found for study_uid={study_uid}")
    if instance_index < 0 or instance_index >= len(ids):
        raise ValueError(f"--instance-index out of range (got {instance_index}, instances={len(ids)})")
    return ids[instance_index]


def _load_frames(orthanc_instance_id: str, num_frames: int):
    from app.helpers.inference_runtime.inference_functions import pick_frames_from_instance

    return pick_frames_from_instance(orthanc_instance_id, num_frames)


def _stack_to_tensor(frames) -> torch.Tensor:
    from app.helpers.inference_runtime.inference_functions import stack_to_tensor

    return stack_to_tensor(frames)


def _target_convnext_feature_layer(model: torch.nn.Module) -> torch.nn.Module:
    """
    PanEcho model structure:
      MultiTaskModel.encoder -> FrameTransformer
      FrameTransformer.encoder -> ImageEncoder
      ImageEncoder.model -> torchvision ConvNeXt
    We hook ConvNeXt `features` (output before global avgpool) for Grad-CAM.
    """
    try:
        return model.encoder.encoder.model.features
    except Exception as exc:
        raise RuntimeError("Unable to locate ConvNeXt feature layer for Grad-CAM") from exc


def _compute_gradcam_per_frame(
    model: torch.nn.Module,
    x: torch.Tensor,
    task_name: str,
    class_names_by_task: dict[str, list[str]],
) -> tuple[np.ndarray, float]:
    target_layer = _target_convnext_feature_layer(model)

    model.zero_grad(set_to_none=True)
    with _GradCamCapture(target_layer) as cap:
        outputs = model(x)

        if task_name not in outputs:
            raise KeyError(f"Task '{task_name}' not in model outputs (available={list(outputs.keys())})")

        y = outputs[task_name]
        if not torch.is_tensor(y):
            raise TypeError(f"Task '{task_name}' output is not a tensor (type={type(y)})")

        score = None
        pred_value = None
        if y.dim() == 2 and y.size(1) > 1:
            probs = y[0]
            class_idx = int(torch.argmax(probs).detach().cpu().item())
            score = probs[class_idx]
            pred_value = float(score.detach().cpu().item())
            class_names = class_names_by_task.get(task_name) or []
            class_label = class_names[class_idx] if class_idx < len(class_names) else f"class{class_idx}"
            label = f"{task_name}:{class_label}={pred_value:.2f}"
        else:
            score = y.flatten()[0]
            pred_value = float(score.detach().cpu().item())
            label = f"{task_name}={pred_value:.3f}"

        score.backward()

        if cap.activations is None or cap.gradients is None:
            raise RuntimeError("Grad-CAM capture failed (missing activations/gradients)")

        activations = cap.activations.detach()  # (B*T, C, H, W)
        gradients = cap.gradients.detach()      # (B*T, C, H, W)

    if activations.dim() != 4 or gradients.dim() != 4:
        raise RuntimeError(f"Unexpected activation shapes: act={tuple(activations.shape)} grad={tuple(gradients.shape)}")

    weights = gradients.mean(dim=(2, 3), keepdim=True)  # (B*T, C, 1, 1)
    cam = torch.relu((weights * activations).sum(dim=1))  # (B*T, H, W)
    cam_np = cam.detach().cpu().numpy()

    cams_224 = []
    for frame_cam in cam_np:
        frame_cam = frame_cam - float(frame_cam.min())
        denom = float(frame_cam.max() - frame_cam.min())
        if denom <= 1e-8:
            frame_cam = np.zeros_like(frame_cam, dtype=np.float32)
        else:
            frame_cam = frame_cam / denom
        cams_224.append(cv2.resize(frame_cam.astype(np.float32), (224, 224), interpolation=cv2.INTER_CUBIC))

    return np.stack(cams_224, axis=0), label  # (T, 224, 224)


def _overlay_heatmap(frame_rgb: np.ndarray, cam_01: np.ndarray, alpha: float) -> np.ndarray:
    frame_bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
    heat = np.clip(cam_01 * 255.0, 0, 255).astype(np.uint8)
    heat_bgr = cv2.applyColorMap(heat, cv2.COLORMAP_JET)
    return cv2.addWeighted(frame_bgr, 1.0 - alpha, heat_bgr, alpha, 0.0)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

    parser = argparse.ArgumentParser(
        description="Generate a Grad-CAM-style heatmap overlay for PanEcho regression tasks (e.g., IVSd, LVPWd).",
    )
    parser.add_argument("--study-uid", default=None, help="DICOM StudyInstanceUID (will resolve Orthanc instances)")
    parser.add_argument("--orthanc-instance-id", default=None, help="Orthanc instance ID (bypasses study lookup)")
    parser.add_argument("--instance-index", type=int, default=0, help="If using --study-uid, which instance to use")
    parser.add_argument(
        "--tasks",
        default="IVSd,LVPWd",
        help='Comma-separated task names to visualize, or "all" for every task head',
    )
    parser.add_argument("--num-frames", type=int, default=16, help="Number of frames to sample (<=16 for default model)")
    parser.add_argument("--fps", type=float, default=10.0, help="Output video FPS")
    parser.add_argument("--alpha", type=float, default=0.40, help="Heatmap overlay strength (0-1)")
    parser.add_argument(
        "--layout",
        choices=["auto", "horizontal", "grid", "separate"],
        default="auto",
        help="When multiple tasks requested: horizontal panels, grid, or separate videos (default: auto).",
    )
    parser.add_argument(
        "--grid-cols",
        type=int,
        default=4,
        help="Grid columns when --layout=grid (default: 4).",
    )
    parser.add_argument("--output", default=None, help="Output .mp4 path (default: out/panecho_gradcam_*.mp4)")
    args = parser.parse_args()

    if args.num_frames <= 0 or args.num_frames > 16:
        raise ValueError("--num-frames must be between 1 and 16 (PanEcho loaded with clip_len=16)")

    backend_dir = _ensure_backend_cwd()
    repo_root = backend_dir.parent

    from app.helpers.inference_runtime.inference_functions import get_model_and_device

    instance_id = _resolve_instance_id(args.study_uid, args.orthanc_instance_id, args.instance_index)
    logger.info("Using Orthanc instance id: %s", instance_id)

    frames = _load_frames(instance_id, args.num_frames)
    if len(frames) != args.num_frames:
        logger.warning("Requested %d frames but received %d", args.num_frames, len(frames))

    frame_rgbs = [np.asarray(f).astype(np.uint8) for f in frames]  # 224x224 RGB

    model, device = get_model_and_device()
    model.eval()

    tasks_arg = (args.tasks or "").strip()
    if not tasks_arg:
        tasks_arg = "IVSd,LVPWd"

    if tasks_arg.lower() in {"all", "*"}:
        tasks = [getattr(t, "task_name", str(t)) for t in getattr(model, "tasks", [])]
    else:
        tasks = [t.strip() for t in tasks_arg.split(",") if t.strip()]

    if not tasks:
        raise ValueError("No tasks provided (use --tasks IVSd,LVPWd or --tasks all)")

    x = _stack_to_tensor(frames).to(device)

    class_names_by_task: dict[str, list[str]] = {}
    for task in getattr(model, "tasks", []):
        try:
            names = [str(x) for x in list(getattr(task, "class_names", []) or [])]
        except Exception:
            names = []
        class_names_by_task[str(getattr(task, "task_name", ""))] = names

    cams: list[tuple[str, np.ndarray, str]] = []
    for task_name in tasks:
        logger.info("Computing Grad-CAM for task=%s", task_name)
        cam, label = _compute_gradcam_per_frame(model, x, task_name, class_names_by_task)
        cams.append((task_name, cam, label))

    out_dir = repo_root / "out"
    out_dir.mkdir(parents=True, exist_ok=True)

    layout = args.layout
    if layout == "auto":
        layout = "horizontal" if len(cams) <= 4 else "grid"

    if layout == "grid" and int(args.grid_cols) <= 0:
        raise ValueError("--grid-cols must be >= 1")

    def _task_slug() -> str:
        if tasks_arg.lower() in {"all", "*"}:
            return "all_tasks"
        if len(tasks) <= 4:
            return "-".join(tasks)
        return f"{len(tasks)}tasks"

    if layout == "separate":
        out_base = Path(args.output) if args.output else out_dir
        if not out_base.is_absolute():
            out_base = (repo_root / out_base).resolve()
        out_base.mkdir(parents=True, exist_ok=True)
        out_paths = {task_name: (out_base / f"panecho_gradcam_{task_name}_{instance_id}.mp4").resolve() for task_name in tasks}
    else:
        if args.output:
            out_path = Path(args.output)
            if not out_path.is_absolute():
                out_path = (repo_root / out_path).resolve()
        else:
            out_path = (out_dir / f"panecho_gradcam_{_task_slug()}_{instance_id}.mp4").resolve()

    try:
        if layout == "separate":
            for task_name, cam_stack, label in cams:
                out_path = out_paths[task_name]
                writer = cv2.VideoWriter(
                    str(out_path),
                    cv2.VideoWriter_fourcc(*"mp4v"),
                    float(args.fps),
                    (224, 224),
                )
                if not writer.isOpened():
                    raise RuntimeError(f"Failed to open VideoWriter for {out_path}")
                try:
                    for frame_idx, frame_rgb in enumerate(frame_rgbs):
                        overlay = _overlay_heatmap(frame_rgb, cam_stack[frame_idx], alpha=float(args.alpha))
                        label_short = label if len(label) <= 34 else (label[:31] + "...")
                        cv2.putText(
                            overlay,
                            label_short,
                            (8, 22),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.55,
                            (255, 255, 255),
                            2,
                            cv2.LINE_AA,
                        )
                        writer.write(overlay)
                finally:
                    writer.release()
                logger.info("Wrote task video: %s", out_path)
        else:
            if layout == "grid":
                cols = int(args.grid_cols)
                rows = int(math.ceil(len(cams) / cols))
                width = 224 * cols
                height = 224 * rows
            else:
                width = 224 * len(cams)
                height = 224

            writer = cv2.VideoWriter(
                str(out_path),
                cv2.VideoWriter_fourcc(*"mp4v"),
                float(args.fps),
                (width, height),
            )
            if not writer.isOpened():
                raise RuntimeError(f"Failed to open VideoWriter for {out_path}")
            try:
                for frame_idx, frame_rgb in enumerate(frame_rgbs):
                    if layout == "grid":
                        canvas = np.zeros((height, width, 3), dtype=np.uint8)
                        for i, (_task_name, cam_stack, label) in enumerate(cams):
                            r = i // cols
                            c = i % cols
                            overlay = _overlay_heatmap(frame_rgb, cam_stack[frame_idx], alpha=float(args.alpha))
                            label_short = label if len(label) <= 26 else (label[:23] + "...")
                            cv2.putText(
                                overlay,
                                label_short,
                                (6, 20),
                                cv2.FONT_HERSHEY_SIMPLEX,
                                0.45,
                                (255, 255, 255),
                                2,
                                cv2.LINE_AA,
                            )
                            y0 = r * 224
                            x0 = c * 224
                            canvas[y0 : y0 + 224, x0 : x0 + 224] = overlay
                        writer.write(canvas)
                    else:
                        panels = []
                        for _task_name, cam_stack, label in cams:
                            overlay = _overlay_heatmap(frame_rgb, cam_stack[frame_idx], alpha=float(args.alpha))
                            label_short = label if len(label) <= 34 else (label[:31] + "...")
                            cv2.putText(
                                overlay,
                                label_short,
                                (8, 22),
                                cv2.FONT_HERSHEY_SIMPLEX,
                                0.55,
                                (255, 255, 255),
                                2,
                                cv2.LINE_AA,
                            )
                            panels.append(overlay)
                        combined = np.hstack(panels) if len(panels) > 1 else panels[0]
                        writer.write(combined)
            finally:
                writer.release()

            logger.info("Wrote Grad-CAM overlay video: %s", out_path)
    finally:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

