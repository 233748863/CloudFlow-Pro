# Create OA module directory structure
$basePath = "src\main\java\com\cloudflow\oa"
$resourcePath = "src\main\resources"

# Create Java package directories
New-Item -ItemType Directory -Force -Path "$basePath\config\properties"
New-Item -ItemType Directory -Force -Path "$basePath\controller"
New-Item -ItemType Directory -Force -Path "$basePath\domain\dto"
New-Item -ItemType Directory -Force -Path "$basePath\mapper"
New-Item -ItemType Directory -Force -Path "$basePath\service\impl"
New-Item -ItemType Directory -Force -Path "$basePath\service\remote"
New-Item -ItemType Directory -Force -Path "$basePath\listener"

# Create resources directories
New-Item -ItemType Directory -Force -Path "$resourcePath\mapper"

Write-Host "Directory structure created successfully!"
