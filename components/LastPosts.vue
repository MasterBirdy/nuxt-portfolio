<script setup>
import { useAsyncData } from '#app'
import { queryCollection } from '#imports'
const { data: posts } = await useAsyncData('blog-posts', () =>
    queryCollection('blog').order('date', 'DESC').limit(6).all()
)
</script>

<template>
    <div>
        <section class="mt-14">
            <h2 class="text-xl font-semibold">Last Posts</h2>
            <div
                class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4"
            >
                <BlogPreview
                    v-for="post in posts"
                    :key="post.id"
                    :post="post"
                />
            </div>
        </section>
    </div>
</template>
