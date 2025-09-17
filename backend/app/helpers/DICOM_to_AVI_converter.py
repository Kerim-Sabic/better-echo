import os
from pathlib import Path
import numpy as np
import cv2
import pydicom as dicom

def mask_frame(frame: np.ndarray) -> np.ndarray:
    """
    Apply a scanning-factor style mask to the given frame.
    """
    # --- Part 1. Setup grid for mask ---
    dimension = frame.shape[0]
    m1, m2 = np.meshgrid(np.arange(dimension), np.arange(dimension))

    # --- Part 2. Define mask shape based on scanning sector ---
    mask = ((m1 + m2) > int(dimension / 2) + int(dimension / 10))
    mask *= ((m1 - m2) < int(dimension / 2) + int(dimension / 10))
    mask = np.reshape(mask, (dimension, dimension)).astype(np.uint8)

    # --- Part 3. Apply mask to frame ---
    return cv2.bitwise_and(frame, frame, mask=mask)

def dicom_to_avi(dicom_path: str, output_path: str, crop_size=(112, 112)) -> str:
    """
    Convert a DICOM file containing cine loops into an AVI video file.
    """
    try:
        # --- Part 1. Read DICOM dataset and pixel array ---
        dataset = dicom.dcmread(dicom_path, force=True)
        pixel_array = dataset.pixel_array

        # --- Part 2. Crop top blank region (detect via mean pixel values) ---
        frame0 = pixel_array[0]
        mean = np.mean(frame0, axis=1)
        mean = np.mean(mean, axis=1)
        y_crop = np.where(mean < 1)[0][0]
        pixel_array = pixel_array[:, y_crop:, :, :]

        # --- Part 3. Ensure frames are square (center crop if needed) ---
        bias = int(np.abs(pixel_array.shape[2] - pixel_array.shape[1]) / 2)
        if bias > 0:
            if pixel_array.shape[1] < pixel_array.shape[2]:
                pixel_array = pixel_array[:, :, bias:-bias, :]
            else:
                pixel_array = pixel_array[:, bias:-bias, :, :]
        
        # --- Part 4. Extract metadata and frame details ---
        frames, height, width, channels = pixel_array.shape
        try:
            fps = dataset[(0x18, 0x40)].value  # Frame rate from DICOM metadata
        except Exception:
            fps = 30  # fallback if missing
            print("Couldn't find frame rate, defaulting to 30 fps")
        
        # --- Part 5. Initialize AVI writer ---
        fourcc = cv2.VideoWriter_fourcc(*'MJPG')
        out = cv2.VideoWriter(output_path, fourcc, fps, crop_size)

        # --- Part 6. Process and write each frame ---
        for i in range(frames):
            outputA = pixel_array[i, :, :, 0]

            # Crop black borders (remove 10% edges)
            smallOutput = outputA[int(height / 10):(height - int(height / 10)),
                                  int(height / 10):(height - int(height / 10))]

            # Resize to target crop size
            resized = cv2.resize(smallOutput, crop_size, interpolation=cv2.INTER_CUBIC)

            # Apply scanning-sector mask
            masked = mask_frame(resized)

            # Convert to 3-channel image for AVI
            final_frame = cv2.merge([masked, masked, masked])
            out.write(final_frame)

        # --- Part 7. Release resources and return output path ---
        out.release()
        return output_path
    
    except Exception as err:
        print(f"Failed to convert {dicom_path} → AVI: {err}")
        return ""
    