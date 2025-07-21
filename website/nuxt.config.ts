// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  modules: ["@nuxt/content", "@nuxt/eslint", "@nuxt/icon"],
  css: ["~/assets/css/main.css"],
  vite: {
    plugins: [tailwindcss()],
  },
  nitro: {
    prerender: {
      routes: ["/sitemap.xml"],
    },
  },
  app: {
    baseURL: process.env.NODE_ENV === "production" ? "/hc1-sig-archive/" : "/",
    buildAssetsDir: "/_nuxt/",
  },
  ssr: false,
});
