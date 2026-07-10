import pytest
from fastapi import HTTPException

from app.api.upload_dicom.upload_dicom_api import _assert_study_is_uploadable_by_user
from app.database_models.studies import Study
from app.database_models.users import User


def test_upload_rejects_a_study_uid_owned_by_another_user(
    db_session_factory, seeded_study
):
    db = db_session_factory()
    try:
        other_user = User(username="upload-other-user", hashed_password="hash")
        db.add(other_user)
        db.commit()

        with pytest.raises(HTTPException) as error:
            _assert_study_is_uploadable_by_user(
                db,
                study_uid=seeded_study["study_uid"],
                current_user_id=other_user.id,
            )

        assert error.value.status_code == 409
    finally:
        db.close()


def test_upload_allows_the_existing_study_owner(db_session_factory, seeded_study):
    db = db_session_factory()
    try:
        _assert_study_is_uploadable_by_user(
            db,
            study_uid=seeded_study["study_uid"],
            current_user_id=seeded_study["user_id"],
        )
    finally:
        db.close()


def test_upload_allows_a_new_study_uid(db_session_factory, seeded_study):
    db = db_session_factory()
    try:
        _assert_study_is_uploadable_by_user(
            db,
            study_uid="new-study-uid",
            current_user_id=seeded_study["user_id"],
        )
    finally:
        db.close()
