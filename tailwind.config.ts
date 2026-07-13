import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 검토 필요 배지 등 상태 색상
        review: "#d97706",
        confirmed: "#16a34a",
      },
    },
  },
  plugins: [],
};

export default config;
