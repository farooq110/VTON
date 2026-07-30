module.exports = {
  plugins: {
    "@tailwindcss/postcss": {
      // Explicitly enable — removes the need for @config bridge which
      // was triggering the "from option not passed to postcss.parse"
      // warning in Tailwind v4.
    },
  },
};
