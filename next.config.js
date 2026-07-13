/** @type {import('next').NextConfig} */
const nextConfig = {
  // 명함 이미지 업로드를 위해 서버 액션 바디 크기 상향
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

module.exports = nextConfig;
