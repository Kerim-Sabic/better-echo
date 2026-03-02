import requests
import logging
from typing import Any, Dict

from app.core.config import settings

logger = logging.getLogger(__name__)

orthanc_url = settings.ORTHANC_URL
orthanc_username = settings.ORTHANC_USER
orthanc_password = settings.ORTHANC_PASS
AUTH = (orthanc_username, orthanc_password)


def send_dicom_to_orthanc(filepath: str) -> Dict[str, Any]:
    """
    Upload a DICOM file to Orthanc and return its JSON upload response.
    """
    logger.info(f"Sending DICOM file to Orthanc: {filepath}")
    with open(filepath, "rb") as f:
        try:
            response = requests.post(
                f"{orthanc_url}/instances",
                auth=AUTH,
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


def get_instance_tags(instance_id: str) -> Dict[str, Any]:
    """
    Fetch DICOM tags for a given instance ID from Orthanc.
    Returns a dictionary of tags for that DICOM instance.
    """
    logger.info(f"Fetching tags for instance ID: {instance_id}")
    try:
        response = requests.get(
            f"{orthanc_url}/instances/{instance_id}/tags",
            auth=AUTH,
        )
        response.raise_for_status()
        logger.info(f"Fetched tags for instance {instance_id} from Orthanc")
        return response.json()
    except requests.RequestException as e:
        logger.error(f"Failed to fetch tags from Orthanc for instance {instance_id}: {str(e)}")
        raise RuntimeError(f"Failed to fetch tags from Orthanc: {e}")


def delete_study_from_orthanc(study_orthanc_id: str) -> bool:
    """
    Delete a study from Orthanc by its Orthanc study ID.
    Returns True on success, False otherwise.
    """
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


def delete_instance_from_orthanc(instance_orthanc_id: str) -> bool:
    """
    Delete an instance from Orthanc by Orthanc instance ID.
    Returns True on success, False otherwise.
    """
    try:
        del_response = requests.delete(f"{orthanc_url}/instances/{instance_orthanc_id}", auth=AUTH, timeout=30)
        if del_response.status_code == 200:
            logger.info(f"Deleted instance from Orthanc (Orthanc ID: {instance_orthanc_id})")
            return True
        logger.warning(
            "Failed to delete instance %s from Orthanc. Status: %s",
            instance_orthanc_id,
            del_response.status_code,
        )
        return False
    except requests.RequestException as err:
        logger.error(f"Error deleting instance {instance_orthanc_id} from Orthanc: {str(err)}")
        return False

__all__ = [
    "send_dicom_to_orthanc",
    "get_instance_tags",
    "delete_study_from_orthanc",
    "delete_instance_from_orthanc",
]
