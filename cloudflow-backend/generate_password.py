import hashlib
import subprocess
import sys

# SHA-256 of "123456" - this is what the frontend sends
sha256_hash = hashlib.sha256("123456".encode()).hexdigest()
print(f"SHA-256 of '123456': {sha256_hash}")

# Now we need BCrypt of this SHA-256 hash
# Using htpasswd or manual BCrypt
# Since bcrypt might not be installed, let's use a pure approach
try:
    import bcrypt
    hashed = bcrypt.hashpw(sha256_hash.encode('utf-8'), bcrypt.gensalt(rounds=10))
    print(f"BCrypt hash: {hashed.decode('utf-8')}")
except ImportError:
    print("bcrypt not installed, installing...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "bcrypt"])
    import bcrypt
    hashed = bcrypt.hashpw(sha256_hash.encode('utf-8'), bcrypt.gensalt(rounds=10))
    print(f"BCrypt hash: {hashed.decode('utf-8')}")
