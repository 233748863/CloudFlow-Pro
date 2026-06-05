. .\start-cloudflow.ps1 -TimeoutSeconds 1
Import-DotEnvFile
Initialize-LocalEnvironment
Start-Process -FilePath 'mvn' -ArgumentList @('-Dmaven.test.skip=true','-Dspring-boot.run.mainClass=com.cloudflow.auth.AuthApplication','-Dspring-boot.run.jvmArguments=-Dfile.encoding=UTF-8','spring-boot:run') -WorkingDirectory 'C:\Users\Administrator\Desktop\CloudFlow Pro\cloudflow-backend\cloudflow-auth' -RedirectStandardOutput 'C:\Users\Administrator\Desktop\CloudFlow Pro\.cloudflow-runtime\logs\auth-restart-20260605.out.log' -RedirectStandardError 'C:\Users\Administrator\Desktop\CloudFlow Pro\.cloudflow-runtime\logs\auth-restart-20260605.err.log' -WindowStyle Hidden
