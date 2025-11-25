import tempfile
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
import logging
import torch
import torchvision
from torchvision.transforms import functional as F
import cv2
import numpy as np
from collections import OrderedDict

from app.database.db import get_db
from app.schemas.inference.infer_echonet_dynamic_schemas import LVSegmentationResponse
from app.database_models.instances import Instance
from app.database_models.derived_results import DerivedResult
from app.helpers.inference_functions import check_instance_exists_in_orthanc
from app.helpers.DICOM_to_AVI_converter import dicom_to_avi
from app.helpers.AVI_to_MP4_converter import convert_to_mp4
from app.core.artifacts import BASE_DIR, UPLOAD_DIR

logger = logging.getLogger(__name__)
router = APIRouter()

model = None
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

CHECKPOINT_PATH = os.path.normpath(os.path.join(
    BASE_DIR,
    "..", "AI_models", "EchonetDynamic", "output", "segmentation",
    "deeplabv3_resnet50_random", "best.pt"
))
ECHONET_DYNAMIC_UPLOAD_DIR = os.path.normpath(os.path.join(UPLOAD_DIR, "echonet_dynamic_LV-segmentation_files"))
os.makedirs(ECHONET_DYNAMIC_UPLOAD_DIR, exist_ok=True)


def load_model():
    """
    Lazy load model when first inference request arrives.
    """
    global model
    if model is None:
        model = torchvision.models.segmentation.deeplabv3_resnet50(weights=None)
        model.classifier[-1] = torch.nn.Conv2d(
            model.classifier[-1].in_channels,
            1,
            kernel_size=model.classifier[-1].kernel_size,
        )
        checkpoint = torch.load(CHECKPOINT_PATH, map_location=device)
        state_dict = checkpoint["state_dict"]

        # strip "module." or "model." prefixes
        new_state_dict = OrderedDict()
        for k, v in state_dict.items():
            name = k
            if name.startswith("module."):
                name = name[len("module.") :]
            if name.startswith("model."):
                name = name[len("model.") :]
            new_state_dict[name] = v

        model.load_state_dict(new_state_dict, strict=False)
        model.to(device)
        model.eval()
    return model


def unload_model():
    """
    Unload model to free GPU/CPU memory.
    """
    global model
    if model is not None:
        del model
        model = None
        torch.cuda.empty_cache()


@router.post("/infer/echonet-dynamic/LV-segmentation", response_model=LVSegmentationResponse)
def infer_lv_segmentation(
    sop_instance_uid: str = Query(..., description="The DICOM SOPInstanceUID to run segmentation on"),
    db: Session = Depends(get_db),
):
    """
    Perform LV (Left Ventricle) segmentation using EchoNet-Dynamic and return an annotated MP4 for the frontend.

    Steps:
    1. Validate that the instance exists in Orthanc and in the local database.
    2. Resolve the DICOM path and, if needed, convert `.dcm` to a temporary `.avi`.
    3. Lazily load the segmentation model and open the input video.
    4. Process each frame, run segmentation, and write an overlay AVI to a study-specific folder.
    5. Release resources, convert the AVI to MP4, remove intermediate files, and persist a DerivedResult.
    6. Return a success response containing the relative MP4 path.
    """
    # --- Step 1: Check if instance with given sop_instance_uid exists ---
    if not check_instance_exists_in_orthanc(sop_instance_uid):
        raise HTTPException(
            status_code=400,
            detail=f"Instance with sop_instance_uid: {sop_instance_uid} does not exist.",
        )

    # --- Step 2: Get instance from database ---
    instance = db.query(Instance).filter(Instance.sop_instance_uid == sop_instance_uid).first()
    if not instance:
        raise HTTPException(
            status_code=400,
            detail=f"No instance found with sop_instance_uid={sop_instance_uid}",
        )

    dicom_file_path = instance.file_path
    if not dicom_file_path or not os.path.exists(dicom_file_path):
        raise HTTPException(
            status_code=400,
            detail=f"DICOM file not found at {dicom_file_path}",
        )

    # --- Step 3: Handle DICOM vs AVI based on file_path ---
    tmp_avi_path = None
    suffix = Path(dicom_file_path).suffix.lower()
    if suffix == ".dcm":
        logger.info("[Echonet-dynamic] DICOM file found, converting to AVI...")
        dicom_output_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".avi")
        try:
            tmp_avi_path = dicom_output_tmp.name
        finally:
            # Close handle so OpenCV can read/write the file on all platforms
            dicom_output_tmp.close()

        avi_path = dicom_to_avi(dicom_file_path, tmp_avi_path)
        if not avi_path:
            # Best-effort cleanup of the temp file
            if tmp_avi_path and os.path.exists(tmp_avi_path):
                try:
                    os.remove(tmp_avi_path)
                except OSError:
                    pass
            raise HTTPException(status_code=400, detail="Failed to convert DICOM to AVI")
        input_video_path = avi_path
    elif suffix == ".avi":
        input_video_path = dicom_file_path
    else:
        raise HTTPException(status_code=400, detail="Only .avi or .dcm files are supported")

    # --- Step 4-8: Run model inference and write segmented AVI ---
    cap = None
    out = None
    try:
        # --- Step 4: Load model (lazy load) ---
        model_instance = load_model()
        logger.info("[Echonet-dynamic] LV-segmentation model loaded")

        # --- Step 5: Open input video ---
        cap = cv2.VideoCapture(input_video_path)
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="Could not open input video")

        # --- Step 6: Create study specific subfolder ---
        study_uid = instance.series.study.study_uid

        study_upload_dir = os.path.join(ECHONET_DYNAMIC_UPLOAD_DIR, study_uid)
        os.makedirs(study_upload_dir, exist_ok=True)

        output_filename_avi = f"segmented_{Path(dicom_file_path).stem}.avi"
        output_path_avi = os.path.join(study_upload_dir, output_filename_avi)

        fourcc = cv2.VideoWriter_fourcc(*"XVID")
        out = cv2.VideoWriter(
            output_path_avi,
            fourcc,
            cap.get(cv2.CAP_PROP_FPS),
            (int(cap.get(3)), int(cap.get(4))),
        )

        # --- Step 7: Process each frame ---
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # convert to tensor
            img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            img_tensor = F.to_tensor(img_rgb).unsqueeze(0).to(device)

            # run inference
            with torch.no_grad():
                output = model_instance(img_tensor)["out"][0, 0]

            # threshold to create binary mask
            mask = (torch.sigmoid(output) > 0.5).cpu().numpy().astype(np.uint8)

            # create red overlay for LV segmentation
            mask_color = np.zeros_like(frame)
            mask_color[mask == 1] = [0, 0, 255]  # red mask
            overlay = cv2.addWeighted(frame, 0.7, mask_color, 0.3, 0)

            # write overlay frame to output
            out.write(overlay)
    finally:
        # --- Step 8: Release resources and temp artifacts ---
        if cap is not None:
            cap.release()
        if out is not None:
            out.release()
        # Unload model after inference to free memory
        unload_model()
        logger.info("[Echonet-dynamic] LV-segmentation model unloaded")
        # Clean up intermediate DICOM->AVI temp file if we used one
        if tmp_avi_path and os.path.exists(tmp_avi_path) and tmp_avi_path != input_video_path:
            try:
                os.remove(tmp_avi_path)
            except OSError:
                pass

    # --- Step 9: Convert AVI to MP4 ---
    output_path_mp4 = convert_to_mp4(output_path_avi)
    # --- Step 9.1: Make relative path (remove absolute UPLOAD_DIR prefix) ---
    relative_output_path = os.path.relpath(output_path_mp4, start=ECHONET_DYNAMIC_UPLOAD_DIR).replace("\\", "/")
    relative_output_path = f"echonet_dynamic_LV-segmentation_files/{relative_output_path}"

    # Remove AVI file
    try:
        os.remove(output_path_avi)
    except OSError:
        pass

    # --- Step 10: Save DerivedResult in database ---
    if instance:
        dr = DerivedResult(
            study_id=instance.series.study.id,
            instance_id=instance.id,
            type="EchonetDynamic_LV_Segmentation",
            value_json=f'{{"outputfile": "{relative_output_path}"}}',
            model_name="EchonetDynamic",
            model_version="v1",
        )
        # Check if the result already exists in the DB
        existing = db.query(DerivedResult).filter(
            DerivedResult.instance_id == instance.id,
            DerivedResult.type == "EchonetDynamic_LV_Segmentation",
        ).first()

        if not existing:
            db.add(dr)
            db.commit()
            logger.info(f"[Echonet-dynamic] Saved DerivedResult in DB for study_uid={study_uid}")

    # --- Step 11: Return success response ---
    logger.info("[Echonet-dynamic] LV-segmentation model inference completed")
    return {
        "success": True,
        "message": "LV segmentation completed successfully",
        "output_file": relative_output_path,
    }
