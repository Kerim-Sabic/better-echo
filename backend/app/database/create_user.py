from sqlalchemy.orm import Session
from app.database.db import engine, SessionLocal
from app.models.users import User

from app.helpers.authentication_functions import hash_password

"""
Function to manually add a user in the database
"""
def create_user():
    db: Session = SessionLocal()

    # Create a new user
    user = User(
        username="doctor1",
        hashed_password=hash_password("1234"),
        full_name="Dr. Kerim Sabic",
        role="doctor"
    )

    db.add(user)
    db.commit()
    db.refresh(user)
    print("✅ User created with ID:", user.id)

if __name__ == "__main__":
    create_user()