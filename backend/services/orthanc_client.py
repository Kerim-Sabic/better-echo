from dotenv import load_dotenv
import requests
import os

load_dotenv()  # Loads the .env file into os.environ

ORTHANC_URL = os.getenv("ORTHANC_URL", "http://localhost:8042")
ORTHANC_USERNAME = os.getenv("ORTHANC_USERNAME", "orthanc")
ORTHANC_PASSWORD = os.getenv("ORTHANC_PASSWORD", "orthanc")

def send_dicom_to_orthanc(filepath: str) -> str:
    """
    Uploads a DICOM file to Orthanc and returns the instance ID.
    """
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
            raise RuntimeError(f"Failed to upload to Orthanc: {e}")

    instance_id = response.json().get("ID")
    if not instance_id:
        raise RuntimeError("Orthanc did not return an instance ID")

    return instance_id
