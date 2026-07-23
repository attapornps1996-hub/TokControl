# ใช้ official Node.js runtime image
FROM node:20-alpine

# กำหนด working directory ใน container
WORKDIR /app

# คัดลอก package.json และ package-lock.json เพื่อติดตั้ง deps
COPY package*.json ./

# ติดตั้ง dependencies สำหรับ production (ข้าม devDependencies อย่าง electron)
RUN npm ci --only=production

# คัดลอกไฟล์ทั้งหมดของโปรเจกต์
COPY . .

# กำหนด Port พื้นฐานสำหรับ Google Cloud Run
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# คำสั่งในการรันเซิร์ฟเวอร์คลาวด์
CMD ["node", "cloud_server.js"]
