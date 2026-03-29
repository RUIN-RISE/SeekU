/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        'bg-white': '#ffffff',
        'bg-light': '#f5f7fa',
        'bg-dark': '#0a1628',
        'accent-blue': '#2563eb',
        'accent-indigo': '#4f46e5',
        'text-dark': '#0a1628',
        'text-light': '#ffffff',
        'text-muted': '#6b7280'
      },
      fontFamily: {
        'chinese-display': ['Noto Sans SC', 'sans-serif'],
        'english-display': ['Manrope', 'sans-serif'],
        'body': ['Noto Sans SC', 'sans-serif'],
        'mono': ['Space Mono', 'JetBrains Mono', 'monospace']
      },
      borderRadius: {
        'card': '12px'
      }
    }
  }
};