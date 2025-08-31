from dotenv import load_dotenv
import requests
import os
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

orthanc_url = settings.ORTHANC_URL
orthanc_username = settings.ORTHANC_USER
orthanc_password = settings.ORTHANC_PASS
AUTH = (orthanc_username, orthanc_password)

# Uploads a DICOM file to Orthanc and returns the instance ID.
def send_dicom_to_orthanc(filepath: str) -> str:
    logger.info(f"Sending DICOM file to Orthanc: {filepath}")
    with open(filepath, "rb") as f:
        try:
            response = requests.post(
                f"{orthanc_url}/instances",
                auth=(orthanc_username, orthanc_password),
                data=f,
                headers={"Content-Type": "application/dicom"}
            )
            response.raise_for_status()
        except requests.RequestException as e:
            logger.error(f"Failed to upload to Orthanc: {str(e)}")
            raise RuntimeError(f"Failed to upload to Orthanc: {e}")

    instance_id = response.json().get("ID")
    if not instance_id:
        logger.error("Orthanc did not return an instance ID")
        raise RuntimeError("Orthanc did not return an instance ID")
    logger.info(f"Orthanc returned instance ID: {instance_id}")

    return instance_id

# Fetches DICOM tags for a given instance ID from Orthanc.
def get_instance_tags(instance_id: str) -> dict:
    logger.info(f"Fetching tags for instance ID: {instance_id}")
    try:
        response = requests.get(
            f"{orthanc_url}/instances/{instance_id}/tags",
            auth=(orthanc_username, orthanc_password)
        )
        response.raise_for_status()
        logger.info(f"Fetched tags for instance {instance_id} from Orthanc")
        return response.json()
    except requests.RequestException as e:
        logger.error(f"Failed to fetch tags from Orthanc for instance {instance_id}: {str(e)}")
        raise RuntimeError(f"Failed to fetch tags from Orthanc: {e}")

def get_series_id_from_instance(instance_id: str) -> str:
    # GET /instances/{id}
    r = requests.get(f"{orthanc_url}/instances/{instance_id}", auth=AUTH, timeout=30)
    r.raise_for_status()
    data = r.json()
    return data.get("ParentSeries")  # <- Orthanc series internal ID (UUID-like)
