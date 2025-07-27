from dotenv import load_dotenv
import requests
import os
import logging

logger = logging.getLogger(__name__)

load_dotenv()

ORTHANC_URL = os.getenv("ORTHANC_URL", "http://localhost:8042")
ORTHANC_USERNAME = os.getenv("ORTHANC_USERNAME", "orthanc")
ORTHANC_PASSWORD = os.getenv("ORTHANC_PASSWORD", "orthanc")

# Uploads a DICOM file to Orthanc and returns the instance ID.
def send_dicom_to_orthanc(filepath: str) -> str:
    logger.info(f"Sending DICOM file to Orthanc: {filepath}")
    with open(filepath, "rb") as f:
        try:
            response = requests.post(
                f"{ORTHANC_URL}/instances",
                auth=(ORTHANC_USERNAME, ORTHANC_PASSWORD),
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
            f"{ORTHANC_URL}/instances/{instance_id}/tags",
            auth=(ORTHANC_USERNAME, ORTHANC_PASSWORD)
        )
        response.raise_for_status()
        logger.info(f"Fetched tags for instance {instance_id} from Orthanc")
        return response.json()
    except requests.RequestException as e:
        logger.error(f"Failed to fetch tags from Orthanc for instance {instance_id}: {str(e)}")
        raise RuntimeError(f"Failed to fetch tags from Orthanc: {e}")

