// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    imports: {
        autoImport: false,
    },
    content: {
        build: {
            markdown: {
                highlight: {
                    theme: 'github-dark',
                },
            },
        },
        renderer: {
            anchorLinks: {
                h2: false,
            },
        },
    },
    compatibilityDate: '2024-11-01',
    devtools: { enabled: true },
    modules: [
        '@nuxt/content',
        '@nuxt/eslint',
        '@nuxt/icon',
        '@nuxtjs/tailwindcss',
    ],
})
