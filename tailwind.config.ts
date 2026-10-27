import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: 'var(--color-navy)',
        teal: 'var(--color-teal)',
        'sky-blue': 'var(--color-sky-blue)',
        beige: 'var(--color-beige)',
        white: 'var(--color-white)',
        border: 'var(--color-border)',
      },
      fontFamily: {
        heading: ['var(--font-fraunces)', 'serif'],
        sans: ['var(--font-public-sans)', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '4px',
        md: '6px',
      },
      boxShadow: {
        subtle: '0 1px 2px rgba(47, 65, 86, 0.05)',
      },
    },
  },
  plugins: [],
};

export default config;
