/** @type {import('next').NextConfig} */
const nextConfig = {
  // 명함 이미지 업로드를 위해 서버 액션 바디 크기 상향
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Gemini 프롬프트(.md)를 서버리스 번들에 포함 (fs.readFileSync 대상)
  outputFileTracingIncludes: {
    "/api/extract": ["./lib/prompts/**"],
  },
};

module.exports = nextConfig;
