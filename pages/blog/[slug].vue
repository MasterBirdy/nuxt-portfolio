<script setup>
import { useRoute } from 'vue-router'
import { useAsyncData } from '#app'
import { queryCollection } from '#imports'
import { ContentRenderer } from '#components'

const slug = useRoute().params.slug
const { data: post } = await useAsyncData(`blog-${slug}`, () => {
    return queryCollection('blog').path(`/blog/${slug}`).first()
})
</script>

<template>
    <ContentRenderer
        class="prose mt-10 w-full lg:mx-auto text-sm md:text-lg prose-h1:text-3xl prose-h1:mb-8 prose-h1:font-bold prose-h1:text-center prose-h2:mt-6"
        tag="main"
        :value="post"
    />
</template>
