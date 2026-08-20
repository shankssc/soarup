const config = {
    semi: true,
    singleQuote: true,
    trailingComma: "all",
    printWidth: 88, // Align with Spec 07 (was 100 in ash-ui)
    tabWidth: 2,
    useTabs: false,
    plugins: ["prettier-plugin-tailwindcss"],
    tailwindConfig: "./tailwind.config.ts",
  };

  export default config;
