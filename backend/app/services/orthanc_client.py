import requests
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

orthanc_url = settings.ORTHANC_URL
orthanc_username = settings.ORTHANC_USER
orthanc_password = settings.ORTHANC_PASS
AUTH = (orthanc_username, orthanc_password)

def send_dicom_to_orthanc(filepath: str) -> str:
    """
    Uploads a DICOM file to Orthanc.
    Returns: { ID (ID of the DICOM instance)
             ParentPatient
             ParentSeries
             ParentStudy
             Path
             Status }

    """
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

    upload_response = response.json()
    if not upload_response:
        logger.error("Orthanc did not return an upload response")
        raise RuntimeError("Orthanc did not return upload response")
    logger.info(f"Orthanc returned upload response: {upload_response}")

    return upload_response

# Fetches DICOM tags for a given instance ID from Orthanc.
def get_instance_tags(instance_id: str) -> dict:
    """
    Fetches DICOM tags for a given instance ID from Orthanc.
    Returns: Dictionary of tags for that dicom instance.
    """
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

# Deletes an entire study from Orthanc by study_orthanc_id
def delete_study_from_orthanc(study_orthanc_id: str) -> bool:
    try:
        del_response = requests.delete(f"{orthanc_url}/studies/{study_orthanc_id}", auth=AUTH, timeout=30)
        if del_response.status_code == 200:
            logger.info(f"Deleted study from Orthanc (Orthanc ID: {study_orthanc_id})")
            return True
        else:
            logger.warning(f"Failed to delete study {study_orthanc_id} from Orthanc. Status: {del_response.status_code}")
            return False
    except requests.RequestException as err:
        logger.error(f"Error deleting study {study_orthanc_id} from Orthanc: {str(err)}")
        return False