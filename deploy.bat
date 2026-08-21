@echo off
title Pandy App Cloud Deployer (GCP: pandy-app-502306)
echo =======================================================
echo      Pandy App Google Cloud Run Deployment Script
echo =======================================================
echo.
echo Target Project: pandy-app-502306
echo Target Region: asia-southeast1 (Singapore)
echo.
echo Checking gcloud CLI Authentication...
echo.

:: กำหนดโปรเจกต์ปลายทางเป็นโปรเจกต์ของลูกค้า
call gcloud config set project pandy-app-502306
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] ตั้งค่าโปรเจกต์ล้มเหลว กรุณาติดตั้ง Google Cloud SDK 
    echo และรันคำสั่ง 'gcloud auth login' เพื่อล็อกอินบัญชีของคุณก่อนรันไฟล์นี้
    echo.
    pause
    exit /b %errorlevel%
)

echo.
echo [INFO] กำลังเปิดการใช้งาน API ที่จำเป็น (หากยังไม่ได้เปิด)...
call gcloud services enable cloudbuild.googleapis.com
call gcloud services enable run.googleapis.com
call gcloud services enable containerregistry.googleapis.com
call gcloud services enable artifactregistry.googleapis.com
call gcloud services enable iam.googleapis.com
call gcloud services enable serviceusage.googleapis.com

call gcloud services enable firestore.googleapis.com

echo.
echo [INFO] กำลังเตรียมอัปโหลดและสร้าง Container บน Google Cloud Build...
echo.
call gcloud builds submit --config cloudbuild.yaml --substitutions=_IMAGE_TAG=latest .
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] ส่งคำสั่งสร้าง Cloud Build ล้มเหลว!
    echo หากพบล้มเหลวเกี่ยวกับสิทธิ์การใช้งาน (Forbidden) กรุณาตรวจสอบว่า:
    echo 1. คุณล็อกอินด้วยอีเมลที่มีสิทธิ์ Owner หรือ Editor บนโปรเจกต์ pandy-app-502306 หรือไม่
    echo 2. กรุณาเปิดสิทธิ์ที่ลิงก์นี้: https://console.cloud.google.com/apis/library/cloudbuild.googleapis.com?project=pandy-app-502306
    echo.
    pause
    exit /b %errorlevel%
)

echo.
echo [INFO] เปิดสิทธิ์ Firestore ให้ Cloud Run service account...
for /f %%i in ('gcloud projects describe pandy-app-502306 --format^="value(projectNumber)"') do set PROJECT_NUM=%%i
call gcloud projects add-iam-policy-binding pandy-app-502306 --member=serviceAccount:%PROJECT_NUM%-compute@developer.gserviceaccount.com --role=roles/datastore.user --quiet

echo.
echo [INFO] เปิดสิทธิ์เรียก Cloud Run จากภายนอก (หากขั้นตอน build ยังไม่ได้ทำ)...
call gcloud run services add-iam-policy-binding pandy-backend --region=asia-southeast1 --member=allUsers --role=roles/run.invoker --quiet

echo.
echo =======================================================
echo  SUCCESS: Pandy App Cloud Backend ได้รับการติดตั้งแล้ว!
echo =======================================================
echo.
pause
