import os
import subprocess

# Define connection parameters
host = "localhost"
user = "root"
password = "password"  # Assuming password from previous attempts, check env if different
database = "cloud_flow_db"
sql_file = "15_admin_logistics.sql"

# MySQL executable paths to try
mysql_paths = [
    r"C:\Program Files\MySQL\MySQL Server 5.7\bin\mysql.exe",
    r"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe",
    "mysql" # Try PATH
]

def run_sql():
    # Read SQL content
    if not os.path.exists(sql_file):
        print(f"Error: {sql_file} not found.")
        return

    # Try each path
    for mysql_path in mysql_paths:
        print(f"Trying MySQL at: {mysql_path}")
        
        # Construct command
        # Note: Using subprocess.Popen to pipe input securely
        cmd = [mysql_path, "-u", user, f"-p{password}", database]
        
        try:
            with open(sql_file, 'r', encoding='utf-8') as f:
                process = subprocess.Popen(
                    cmd, 
                    stdin=f, 
                    stdout=subprocess.PIPE, 
                    stderr=subprocess.PIPE,
                    text=True
                )
                stdout, stderr = process.communicate()
                
                if process.returncode == 0:
                    print("Success: SQL script executed successfully.")
                    return
                else:
                    print(f"Failed with exit code {process.returncode}")
                    print(f"Stderr: {stderr}")
                    # If password error, maybe try empty password or other common ones?
                    if "Access denied" in stderr:
                         print("Authentication failed.")
        except FileNotFoundError:
             print(f"Executable not found: {mysql_path}")
        except Exception as e:
            print(f"Error executing: {e}")

if __name__ == "__main__":
    run_sql()
