// Tailwind v4: @tailwindcss/postcss handles all transforms including vendor prefixes via Lightning CSS.
// autoprefixer is NOT needed and must be removed to prevent duplicate/conflicting prefix rules.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
