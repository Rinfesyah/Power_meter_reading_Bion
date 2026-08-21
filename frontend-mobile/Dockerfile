# Gunakan Node.js lightweight Alpine image
FROM node:20-alpine

# Tentukan direktori kerja di dalam container
WORKDIR /app

# Salin package.json dan package-lock.json terlebih dahulu
COPY package*.json ./

# Instal semua dependensi Node.js
RUN npm install

# Salin seluruh kode frontend mobile
COPY . .

# Ekspos port default Vite (3001)
EXPOSE 3001

# Jalankan server development Vite
CMD ["npm", "run", "dev"]
