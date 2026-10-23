# Railway / Linux production image for Puppeteer PDF generation.
# Uses @sparticuz/chromium (see bookingPdfService.js) plus Debian Chromium system libraries.
# Do not run apt-get at container start — packages are installed at image build time.
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    fonts-noto-core \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    wget \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Linux PDFs use @sparticuz/chromium — skip Puppeteer's Chrome download to keep the image smaller.
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_DISABLE_HEADLESS_WARNING=true

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p uploads/pdfs \
  && chown -R node:node /app

USER node

EXPOSE 5001

CMD ["npm", "start"]
