import sys
import logging
import os
# Force service account path since user put it in frontend/.env instead of root
os.environ['FIREBASE_SERVICE_ACCOUNT_PATH'] = r'C:\Users\user\Desktop\GIO\0752\firebase-adminsdk.json'


sys.path.append('.')
sys.path.append('.')

from firebase_admin import auth, firestore
from auth.firebase_admin_init import get_firebase_app

logging.basicConfig(level=logging.INFO)

app = get_firebase_app()
db = firestore.client(app=app)

email = 'admin@email.com'
password = 'adminPassword123!'

try:
    user = auth.get_user_by_email(email)
    print(f"User {email} already exists with uid: {user.uid}")
    auth.update_user(user.uid, password=password)
    print("Updated password.")
    uid = user.uid
except auth.UserNotFoundError:
    user = auth.create_user(
        email=email,
        email_verified=True,
        password=password,
        display_name='Admin User',
        disabled=False
    )
    uid = user.uid
    print(f"Created new user {email} with password: {password}")

# Now create the firestore document
doc_ref = db.collection('users').document(uid)
doc_ref.set({
    'uid': uid,
    'email': email,
    'nombre': 'Admin',
    'role': 'admin',
    'active': True,
    'createdAt': firestore.SERVER_TIMESTAMP
})
print("Added user document to firestore.")
