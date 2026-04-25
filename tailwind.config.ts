import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 브랜드 컬러 (로고 기반)
        navy: {
          DEFAULT: '#1E3A5F',
          dark: '#132640',
          bg: '#E4EBF4',
        },
        accent: {
          DEFAULT: '#2E9B63',   // 그린 (마진/돈)
          dark: '#237049',
          bg: '#E1F2E9',
        },
        // 시맨틱
        alert:   { DEFAULT: '#D64545', bg: '#FBE7E7' },
        warning: { DEFAULT: '#D89020', bg: '#FCF2DC' },
        success: { DEFAULT: '#2E9B63', bg: '#E1F2E9' },
        info:    { DEFAULT: '#2B5E8F', bg: '#DEEAF5' },
        // 중립
        ink: {
          DEFAULT: '#0F2341',
          2: '#2B3E5A',
          3: '#5C6B83',
          4: '#9AA6B8',
        },
        border: {
          DEFAULT: '#E4E9F0',
          strong: '#D0D8E3',
        },
        bgapp: '#F6F8FB',
        bgalt: '#EEF2F7',
        surface: '#FFFFFF',
        'surface-alt': '#F2F5F9',
      },
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', 'sans-serif'],
        serif: ['"Fraunces"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.035em',
        tighter: '-0.025em',
      },
    },
  },
  plugins: [],
};

export default config;
